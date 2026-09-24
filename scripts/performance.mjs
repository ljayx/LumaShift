import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {serve} from './serve.mjs';
import {launch,settings,waitStatus,settle} from './browser.mjs';
import {buildBaseline} from './baseline.mjs';

const server=await serve();
await mkdir('test-results',{recursive:true});
const baseline=await buildBaseline();
const report={date:new Date().toISOString(),cpu:os.cpus()[0].model,cores:os.cpus().length,memoryGiB:os.totalmem()/1024**3,os:`${os.platform()} ${os.release()}`,viewport:'1280x900',windowMs:5000,repeats:5,notes:['Dark Reader API 4.9.132, same theme/host control and CSS fetch bridge; image analysis off in both. Not the full store extension.','Main-thread TaskDuration and GC JS heap are proxies; process RSS separately recorded. No claim about all-process CPU or hours-long memory.'],groups:[]};
const groups=process.env.PERF_GROUPS?.split(',')||['disabled','off','lumashift','darkreader'];
if(process.env.PERF_GROUPS) {const previous=JSON.parse(await readFile('test-results/performance.json','utf8'));Object.assign(report,previous);report.groups=previous.groups.filter(g=>!groups.includes(g.name));}
const metrics=async session=>Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
const memory=async session=>{await session.send('HeapProfiler.collectGarbage');return (await metrics(session)).JSHeapUsedSize/1024**2;};
const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b);return {samples:values,median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.ceil(sorted.length*.95)-1]};};
function rss(profile) {
  try {
    const rows=execFileSync('ps',['-axo','pid=,ppid=,rss=,command='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(m=>({pid:+m[1],ppid:+m[2],rss:+m[3],cmd:m[4]}));
    const ids=new Set(rows.filter(row=>row.cmd.includes(`--user-data-dir=${profile}`)).map(row=>row.pid));let changed=true;
    while(changed){changed=false;for(const row of rows)if(ids.has(row.ppid)&&!ids.has(row.pid)){ids.add(row.pid);changed=true;}}
    return rows.filter(row=>ids.has(row.pid)).reduce((sum,row)=>sum+row.rss,0)/1024;
  } catch{return null;}
}
async function workerHeap(context) {
  const cdp=await context.browser().newBrowserCDPSession();
  try {
    const target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker');if(!target)return null;
    const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
    const response=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('worker heap timeout')),3000);cdp.on('Target.receivedMessageFromTarget',event=>{if(event.sessionId===sessionId){const m=JSON.parse(event.message);if(m.id===1){clearTimeout(timer);resolve(m.result?.usedSize/1024**2);}}});});
    await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:1,method:'Runtime.getHeapUsage'})});return await response;
  }catch{return null;}finally{await cdp.detach();}
}
async function probe(page,session,dynamic=false) {
  await settle(page);const before=await metrics(session);const start=performance.now();
  const frames=await page.evaluate(async dynamic=>{
    const intervals=[],longTasks=[];let last=performance.now(),running=true;
    const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));observer.observe({type:'longtask'});
    function frame(now){intervals.push(now-last);last=now;if(running)requestAnimationFrame(frame);}requestAnimationFrame(frame);
    let timer;
    if(dynamic) {
      if(document.querySelectorAll('.item').length<100)window.addItems(100);
      let tick=0;timer=setInterval(()=>{tick++;document.querySelectorAll('.item').forEach((node,i)=>{if(i<100){node.textContent=`Tick ${tick}:${i}`;node.style.backgroundColor=tick%2?'#f9f9fb':'#eeeef2';}});window.scrollTo(0,(tick%8)*120);if(tick%10===0)history.replaceState({},'',`#route-${tick}`);},100);
    }
    await new Promise(r=>setTimeout(r,5000));clearInterval(timer);running=false;observer.disconnect();return {intervals,longTasks};
  },dynamic);
  const elapsed=(performance.now()-start)/1000,after=await metrics(session);
  return {cpuSingleCorePercent:100*(after.TaskDuration-before.TaskDuration)/elapsed,frameMs:summarize(frames.intervals),longTasks:frames.longTasks};
}
async function repeatedProbe(page,session,dynamic=false) {
  const samples=[];
  for(let i=0;i<3;i++)samples.push(await probe(page,session,dynamic));
  return {samples,cpuSingleCorePercent:summarize(samples.map(s=>s.cpuSingleCorePercent)).median,frameMs:summarize(samples.flatMap(s=>s.frameMs.samples)),longTasks:samples.flatMap(s=>s.longTasks)};
}

try {
  for(const name of groups) {
    console.log('MEASURING',name);
    const browser=await launch(name==='disabled'?false:name==='darkreader'?baseline:true);
    const {context,worker}=browser;report.browser=context.browser().version();
    const group={name,measuredAt:new Date().toISOString(),cases:[]};report.groups.push(group);
    try {
      if(worker)await settings(worker,{enabled:name!=='off','site:localhost':'auto'});
      for(const size of ['standard','large']) {
        const page=await context.newPage();const session=await context.newCDPSession(page);await session.send('Performance.enable');
        await page.addInitScript(()=>{
          window.__timing={first:null,stable:null};let count=0,previous='',stop=false;
          const loop=()=>{if(stop)return;if(document.body){const value=getComputedStyle(document.body).backgroundColor;const rgb=value.match(/[\d.]+/g)?.map(Number);const dark=rgb?.length===3 && rgb[0]<100 && rgb[1]<100 && rgb[2]<100;if(dark){if(window.__timing.first===null)window.__timing.first=performance.now();count=value===previous?count+1:0;if(count>=5){window.__timing.stable=performance.now();stop=true;}}else count=0;previous=value;}if(performance.now()<3000)requestAnimationFrame(loop);};requestAnimationFrame(loop);
        });
        const samples=[];
        for(let i=0;i<5;i++) {
          await page.goto(`http://localhost:4173/?${size==='large'?'large&':''}run=${i}`);
          if(name==='lumashift'||name==='darkreader')await page.waitForFunction(()=>window.__timing.stable!==null,{},{timeout:5000});
          await page.waitForTimeout(150);
          samples.push(await page.evaluate(()=>({...window.__timing,domContentLoaded:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd})));
        }
        const result={size,navigation:samples,heapMiB:await memory(session),idle:await repeatedProbe(page,session),dynamic:await repeatedProbe(page,session,true),switchMs:null};
        if(name==='lumashift'||name==='darkreader') {
          const switches=[];
          for(let i=0;i<10;i++) {
            const enabled=i%2===1;
            const start=performance.now();
            const visible=page.evaluate(enabled=>new Promise(resolve=>{function check(){const bg=getComputedStyle(document.body).backgroundColor;const dark=bg!=='rgb(255, 255, 255)';if(dark===enabled)requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()));else requestAnimationFrame(check);}requestAnimationFrame(check);}),enabled);
            await settings(worker,{enabled});await visible;switches.push(performance.now()-start);
          }
          result.switchMs=summarize(switches);
          if(size==='standard') {
            const trend=[];
            for(let i=0;i<100;i++){await settings(worker,{enabled:i%2===0});await waitStatus(worker,page,i%2===0?'active':'off');if(i%10===9)trend.push({cycle:i+1,heapMiB:await memory(session)});}
            await page.waitForTimeout(1000);trend.push({cycle:'settled',heapMiB:await memory(session)});result.toggleTrend=trend;
            await settings(worker,{enabled:true});await waitStatus(worker,page,'active');
          }
        }
        result.rssMiB=rss(browser.directory);result.workerHeapMiB=worker?await workerHeap(context):null;
        group.cases.push(result);console.log(name,size,'heap',result.heapMiB.toFixed(2),'idle CPU',result.idle.cpuSingleCorePercent.toFixed(2),'dynamic CPU',result.dynamic.cpuSingleCorePercent.toFixed(2));
        await page.close();await writeFile('test-results/performance.json',JSON.stringify(report,null,2));
      }
      const tabs=[];
      if(worker)await settings(worker,{enabled:name!=='off'});
      for(let i=0;i<5;i++){const page=await context.newPage();await page.goto(`http://localhost:4173/?multi=${i}`);const session=await context.newCDPSession(page);await session.send('Performance.enable');tabs.push({page,session});}
      await tabs[0].page.bringToFront();await tabs[0].page.waitForTimeout(1000);
      const before=await Promise.all(tabs.map(t=>metrics(t.session)));const start=performance.now();await tabs[0].page.waitForTimeout(5000);const elapsed=(performance.now()-start)/1000;
      const after=await Promise.all(tabs.map(t=>metrics(t.session)));group.multi={heapMiB:await Promise.all(tabs.map(t=>memory(t.session))),cpuSingleCorePercent:after.reduce((sum,m,i)=>sum+100*(m.TaskDuration-before[i].TaskDuration)/elapsed,0),rssMiB:rss(browser.directory)};
      await writeFile('test-results/performance.json',JSON.stringify(report,null,2));
    }finally{await browser.close();}
  }
}finally{await writeFile('test-results/performance.json',JSON.stringify(report,null,2));server.close();}
console.log('Raw results: test-results/performance.json');

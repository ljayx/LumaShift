// Supplementary steady-state comparison. Alternate engine order to reduce
// time/temperature bias; stop the fixture's loading video animation in BOTH.
import {serve} from './serve.mjs';
import {launch,settings,waitStatus} from './browser.mjs';
import {buildBaseline} from './baseline.mjs';
import {writeFile} from 'node:fs/promises';
const server=await serve(),baseline=await buildBaseline();
const report={date:new Date().toISOString(),method:'3 paired rounds per size; order AB/BA/AB; fresh profiles; both stop fixture video tracks; 3s dynamic warmup + 5s measured; GC heap after workload. Supplements, does not replace full budget run.',samples:[]};
const metrics=async cdp=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
const workload=(page,ms)=>page.evaluate(async ms=>{
  if(document.querySelectorAll('.item').length<100)window.addItems(100);
  let ticks=0;const timer=setInterval(()=>{ticks++;document.querySelectorAll('.item').forEach((node,i)=>{if(i<100){node.textContent=`Tick ${ticks}:${i}`;node.style.backgroundColor=ticks%2?'#f9f9fb':'#eeeef2';}});window.scrollTo(0,(ticks%8)*120);if(ticks%10===0)history.replaceState({},'',`#route-${ticks}`);},100);
  await new Promise(r=>setTimeout(r,ms));clearInterval(timer);return ticks;
},ms);
try {
  for(const size of ['standard','large'])for(let round=0;round<3;round++)for(const engine of round%2?['darkreader','lumashift']:['lumashift','darkreader']) {
    const browser=await launch(engine==='lumashift'?true:baseline);
    try {
      const page=await browser.context.newPage();await page.goto(`http://localhost:4173/?${size==='large'?'large&':''}paired=${round}`);await waitStatus(browser.worker,page,'active');
      await page.evaluate(()=>{const video=document.querySelector('video');video.srcObject?.getTracks().forEach(t=>t.stop());video.srcObject=null;video.controls=false;video.load();});
      const cdp=await browser.context.newCDPSession(page);await cdp.send('Performance.enable');await workload(page,3000);
      const before=await metrics(cdp),start=performance.now();const ticks=await workload(page,5000);const elapsed=(performance.now()-start)/1000,after=await metrics(cdp);
      await cdp.send('HeapProfiler.collectGarbage');const heap=(await metrics(cdp)).JSHeapUsedSize/1024**2;
      const color=await page.locator('.item').first().evaluate(n=>getComputedStyle(n).backgroundColor);
      const sample={size,round,engine,cpuSingleCorePercent:100*(after.TaskDuration-before.TaskDuration)/elapsed,heapMiB:heap,ticks,seconds:elapsed,color};
      report.samples.push(sample);console.log(JSON.stringify(sample));
      await settings(browser.worker,{enabled:false});await waitStatus(browser.worker,page,'off');
    }finally{await browser.close();}
    await writeFile('test-results/paired-performance.json',JSON.stringify(report,null,2));
  }
}finally{await writeFile('test-results/paired-performance.json',JSON.stringify(report,null,2));server.close();}

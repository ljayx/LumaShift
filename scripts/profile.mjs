import {serve} from './serve.mjs';
import {launch} from './browser.mjs';
import {writeFile} from 'node:fs/promises';
const server=await serve();
try {
  for(const name of ['lumashift','darkreader']) {
    const browser=await launch(name==='lumashift'?true:'.cache/darkreader-baseline');
    try {
      const page=await browser.context.newPage();await page.goto('http://localhost:4173/?large');await page.waitForTimeout(500);
      const cdp=await browser.context.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
      await page.evaluate(async()=>{let tick=0;const nodes=[...document.querySelectorAll('.item')].slice(0,100);const timer=setInterval(()=>{tick++;nodes.forEach((node,i)=>{node.textContent=`Tick ${tick}:${i}`;node.style.backgroundColor=tick%2?'#f9f9fb':'#eeeef2';});window.scrollTo(0,(tick%8)*120);if(tick%10===0)history.replaceState({},'',`#route-${tick}`);},100);await new Promise(r=>setTimeout(r,5000));clearInterval(timer);});
      const {profile}=await cdp.send('Profiler.stop');await writeFile(`test-results/${name}.cpuprofile`,JSON.stringify(profile));
      console.log(name,profile.nodes.filter(n=>n.hitCount).sort((a,b)=>b.hitCount-a.hitCount).slice(0,25).map(n=>({name:n.callFrame.functionName,line:n.callFrame.lineNumber,url:n.callFrame.url.split('/').at(-1),hits:n.hitCount})));
    }finally{await browser.close();}
  }
}finally{server.close();}

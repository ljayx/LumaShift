import {chromium} from 'playwright';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
export async function launch(extension=true,profile) {
  await mkdir('.test-profiles',{recursive:true});
  const directory=profile||await mkdtemp(path.resolve('.test-profiles/run-'));
  const extensionPath=path.resolve(typeof extension==='string'?extension:'dist');
  const context=await chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,timeout:20000,viewport:{width:1280,height:900},args:extension?[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]:[],ignoreDefaultArgs:['--disable-component-extensions-with-background-pages','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
  context.setDefaultTimeout(10000);context.setDefaultNavigationTimeout(15000);
  let worker=null;
  if(extension) {
    worker=context.serviceWorkers()[0];
    if(!worker) {
      // A persisted MV3 worker can be asleep until an HTTP page requests it.
      const ready=context.waitForEvent('serviceworker',{timeout:15000});
      const wake=await context.newPage();await wake.goto('http://localhost:4173/health');
      worker=context.serviceWorkers()[0]||await ready;await wake.close();
    }
  }
  return {context,worker,directory,close:async(keep=false)=>{await context.close();if(!keep && !profile)await rm(directory,{recursive:true,force:true});}};
}
export async function settings(worker,data) {await worker.evaluate(data=>chrome.storage.local.set(data),data);}
export async function getStatus(worker,page) {
  const url=page.url();
  return Promise.race([worker.evaluate(async url=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===url);return chrome.tabs.sendMessage(tab.id,{type:'PAGE_STATUS'},{frameId:0});},url),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('status transport timeout')),3000);timer.unref();})]);
}
export async function waitStatus(worker,page,status,timeout=5000) {
  const deadline=Date.now()+timeout;let last;
  while(Date.now()<deadline) {try{last=await getStatus(worker,page);if(last.status===status)return last;}catch{}await page.waitForTimeout(50);}
  throw new Error(`Expected ${status}; actual ${JSON.stringify(last)}`);
}
export const background=page=>page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
export const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));

import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import {serve} from './serve.mjs';
import {engineSources} from './engine.mjs';
import os from 'node:os';
const server = await serve();
const engine = await engineSources();
const browser = await chromium.launch({headless:true});
await mkdir('test-results', {recursive:true});
const results=[];
try {
  for (const mode of ['original','filter','static','dynamic']) {
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.goto('http://localhost:4173');
    await page.waitForFunction(()=>window.fixtureReady);
    if(mode==='dynamic') {await page.addScriptTag({content:engine.proxy});await page.addScriptTag({content:engine.api});}
    const result=await page.evaluate(async mode=>{
      const before=getComputedStyle(document.body).backgroundColor;
      const start=performance.now();
      if(mode==='filter') {let s=document.createElement('style');s.id='prototype';s.textContent='html{filter:invert(1) hue-rotate(180deg)}img,video,canvas{filter:invert(1) hue-rotate(180deg)}';document.head.append(s);}
      if(mode==='static') {let s=document.createElement('style');s.id='prototype';s.textContent='html,body,header,article,section,input,select,dialog{background:#181c24!important;color:#dce3ed!important;border-color:#455064!important}a{color:#88baff!important}';document.head.append(s);}
      if(mode==='dynamic') {DarkReader.setFetchMethod(fetch);DarkReader.enable({darkSchemeBackgroundColor:'#181c24',darkSchemeTextColor:'#dce3ed'},{ignoreImageAnalysis:['*'],disableStyleSheetsProxy:true});}
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const applyMs=performance.now()-start;
      window.addItems(100);
      await new Promise(r=>setTimeout(r,150));
      const colors=Object.fromEntries(['body','.card','.success','.warning','.error','.item'].map(s=>[s,{bg:getComputedStyle(document.querySelector(s)).backgroundColor,text:getComputedStyle(document.querySelector(s)).color}]));
      return {mode,before,applyMs,colors,styles:document.querySelectorAll('style.darkreader').length};
    },mode);
    await page.screenshot({path:`test-results/prototype-${mode}.png`,fullPage:true});
    result.restored=await page.evaluate(mode=>{if(mode==='dynamic')DarkReader.disable();document.getElementById('prototype')?.remove();return {background:getComputedStyle(document.body).backgroundColor,styles:document.querySelectorAll('style.darkreader').length};},mode);
    results.push(result);await page.close();
  }
  const report={date:new Date().toISOString(),browser:browser.version(),os:os.release(),cpu:os.cpus()[0].model,results};
  await writeFile('test-results/prototype.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {await browser.close();server.close();}

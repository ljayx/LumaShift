import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {serve} from './serve.mjs';
import {launch,settings,waitStatus} from './browser.mjs';
import {parseSimple,toHSL} from '../src/colors.js';
import {luminance} from '../src/settings.js';

const server=await serve();
let browser;
const results=[],errors=[],samples={};
const ratio=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
try {
  browser=await launch();
  const {context,worker}=browser,page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  const css=(selector,pseudo=null)=>page.locator(selector).first().evaluate((n,pseudo)=>{
    const s=getComputedStyle(n,pseudo);return {background:s.backgroundColor,color:s.color};
  },pseudo);
  const test=async(name,fn)=>{try{await fn();results.push({name,status:'passed'});console.log('PASS',name);}catch(error){results.push({name,status:'failed',error:error.stack});console.log('FAIL',name,error.message);}};
  await mkdir('test-results',{recursive:true});
  await settings(worker,{enabled:false});
  await page.goto('http://localhost:4173/surfaces.html');await waitStatus(worker,page,'off');
  const original=await page.locator('.chip').first().getAttribute('style');
  await page.screenshot({path:'test-results/surfaces-light.png',fullPage:true});
  for(const selector of ['body','.info','.success','.warning','.danger','.violet','.cyan','.chip','.gray','.near-white','.deeper'])samples[selector]={original:await css(selector)};
  await settings(worker,{enabled:true,'site:localhost':'force'});await waitStatus(worker,page,'active');
  await test('semantic fills retain hue and readable foreground across six color families',async()=>{
    for(const selector of ['.info','.success','.warning','.danger','.violet','.cyan']) {
      const actual=await css(selector);samples[selector].converted=actual;
      const [h]=toHSL(parseSimple(samples[selector].original.background)),[oh,os]=toHSL(parseSimple(actual.background));
      const diff=Math.abs(h-oh);assert.ok(Math.min(diff,1-diff)<.025,selector);assert.ok(os>.2,selector);
      assert.ok(ratio(parseSimple(actual.color),parseSimple(actual.background))>=4.5,selector);
    }
    for(const selector of ['.info','.success','.warning']) {
      const link=await css(`${selector} a`);
      assert.ok(ratio(parseSimple(link.color),parseSimple((await css(selector)).background))>=4.5,`${selector} colored link`);
    }
  });
  await test('gray chips, nesting and hover retain distinct ordered surfaces',async()=>{
    const base=parseSimple((await css('body')).background);
    for(const selector of ['body','.chip','.near-white','.gray','.deeper'])samples[selector].converted=await css(selector);
    const chip=parseSimple(samples['.chip'].converted.background);
    assert.ok(ratio(chip,base)>=1.2);
    const levels=['body','.near-white','.chip','.gray','.deeper'].map(s=>luminance(parseSimple(samples[s].converted.background)));
    for(let i=1;i<levels.length;i++)assert.ok(levels[i]>levels[i-1]);
    assert.deepEqual(parseSimple((await css('.nested')).background),base);
    await page.locator('button.chip').first().hover();
    assert.ok(luminance(parseSimple((await css('.chip')).background))>luminance(chip));
    await page.locator('h1').hover();
  });
  await test('variables, inline priorities, pseudo elements and alpha use the same mapping',async()=>{
    const info=(await css('.info')).background,chip=(await css('.chip')).background;
    assert.equal((await css('.channels')).background,info);
    assert.equal((await css('.pseudo','::before')).background,info);
    for(const n of await page.locator('span.chip').all())assert.equal(await n.evaluate(n=>getComputedStyle(n).backgroundColor),chip);
    const alpha=parseSimple((await css('.alpha')).background);
    assert.equal(alpha[3],.5);assert.deepEqual(alpha.slice(0,3),parseSimple(info).slice(0,3));
    assert.equal(parseSimple((await css('.clear')).background)[3],0);
  });
  await page.screenshot({path:'test-results/surfaces-dark.png',fullPage:true});
  await test('dynamic background updates and restoration preserve website ownership',async()=>{
    await page.locator('.info').evaluate(n=>n.style.setProperty('--info','#fff3cd'));
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.info')).backgroundColor===getComputedStyle(document.querySelector('.warning')).backgroundColor);
    await settings(worker,{enabled:false});await waitStatus(worker,page,'off');
    assert.equal((await css('.info')).background,'rgb(255, 243, 205)');
    assert.equal((await css('span.chip')).background,'rgb(242, 242, 242)');
    assert.equal(await page.locator('button.chip').first().getAttribute('style'),original);
    assert.equal(await page.locator('style[data-lumashift],[data-lumashift-inline],[style*="--luma-"]').count(),0);
  });
} finally {
  await browser?.close();server.close();
  await writeFile('test-results/surfaces.json',JSON.stringify({date:new Date().toISOString(),results,errors,samples},null,2));
}
if(results.some(r=>r.status==='failed')||errors.length)process.exitCode=1;

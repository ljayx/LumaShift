import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {serve} from './serve.mjs';
import {launch,settings,waitStatus,settle} from './browser.mjs';
import {parseSimple} from '../src/colors.js';
import {luminance} from '../src/settings.js';

const server=await serve();
let browser;
const results=[],errors=[],samples={};
const ratio=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
try {
  browser=await launch();
  const {context,worker}=browser,page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  const css=(selector,pseudo='::selection')=>page.locator(selector).first().evaluate((node,pseudo)=>{
    const s=getComputedStyle(node,pseudo);return {background:s.backgroundColor,color:s.color,fill:s.webkitTextFillColor,shadow:s.textShadow};
  },pseudo);
  const check=async(selector,base='#181c24')=>{
    const actual=await css(selector),background=parseSimple(actual.background),ink=parseSimple(actual.color);
    assert.equal(background[3],1,`${selector}: opaque selection`);
    assert.ok(ratio(background,parseSimple(base))>=3,`${selector}: distinct from page`);
    assert.ok(ratio(background,ink)>=4.5,`${selector}: readable text`);
    assert.ok(ratio(background,parseSimple(actual.fill))>=4.5,`${selector}: readable text fill`);
    assert.equal(actual.shadow,'none');return actual;
  };
  const test=async(name,fn)=>{try{await fn();results.push({name,status:'passed'});console.log('PASS',name);}catch(error){results.push({name,status:'failed',error:error.stack});console.log('FAIL',name,error.message);}};
  await mkdir('test-results',{recursive:true});
  await settings(worker,{enabled:false});
  await page.goto('http://localhost:4173/selection.html');await waitStatus(worker,page,'off');
  await page.evaluate(()=>{
    const host=document.createElement('div');document.body.append(host);
    const shadow=host.attachShadow({mode:'open'});
    shadow.innerHTML='<p id="adopted-text">Adopted stylesheet selection</p>';
    const sheet=new CSSStyleSheet();sheet.replaceSync('#adopted-text::selection{background:transparent!important;color:red!important}');shadow.adoptedStyleSheets=[sheet];
  });
  const original=await css('#example'),originalImportant=await css('#important');
  await settings(worker,{enabled:true,'site:localhost':'force'});await waitStatus(worker,page,'active');
  await test('selection stays distinct and readable across site rules, nesting, layers and controls',async()=>{
    for(const selector of ['#example','#default','#default a','#default code','#important','#mixed','#variable','#fill','#layered','#conditional','.nested','textarea','#adopted-text'])samples[selector]=await check(selector);
  });
  await test('mixed selector lists do not turn ordinary surfaces into selection highlights',async()=>{
    const ordinary=await css('.ordinary',null),selection=await css('#mixed');
    assert.notEqual(ordinary.background,selection.background);
    assert.ok(luminance(parseSimple(ordinary.background))<.12);
  });
  await test('real browser selection paints the document text',async()=>{
    const box=await page.locator('#example').boundingBox();
    await page.mouse.move(box.x+1,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+box.width-1,box.y+box.height/2,{steps:12});await page.mouse.up();
    assert.match(await page.evaluate(()=>getSelection().toString()),/THEME_\*/);
    await page.screenshot({path:'test-results/selection-dark.png',fullPage:true});
    const documentBox=await page.locator('.document').boundingBox();
    await page.screenshot({path:'test-results/selection-preview.png',clip:{...documentBox,width:Math.min(720,documentBox.width)}});
  });
  await test('dynamic styles and open shadow roots use the same highlight',async()=>{
    await page.evaluate(()=>{
      const style=document.createElement('style');style.id='dynamic-selection';
      style.textContent='#example::selection{background:rgba(0,0,0,.05)!important;color:red!important}';document.head.append(style);
      const shadow=document.querySelector('#shadow').attachShadow({mode:'open'});
      shadow.innerHTML='<style>p::selection{background:rgba(0,0,0,.08)!important}</style><p id="shadow-text">Shadow DOM selection</p>';
    });
    await settle(page);
    await check('#example');await check('#shadow-text');
    await page.evaluate(()=>document.querySelector('#dynamic-selection').sheet.insertRule('#variable::selection{background:transparent!important}',0));
    await settle(page);await check('#variable');
  });
  await test('changing theme colors preserves selection contrast including a light custom background',async()=>{
    for(const background of ['#000000','#202b25','#ffffff']) {
      await settings(worker,{background,text:'#888888'});
      await page.waitForFunction(background=>getComputedStyle(document.body).backgroundColor===background,`rgb(${parseSimple(background).slice(0,3).join(', ')})`);
      await check('#example',background);await check('#shadow-text',background);
    }
  });
  await test('disabling restores authored selection styles including changes made while active',async()=>{
    await page.evaluate(()=>document.querySelector('#dynamic-selection').remove());await settle(page);
    await settings(worker,{enabled:false});await waitStatus(worker,page,'off');
    assert.deepEqual(await css('#example'),original);assert.deepEqual(await css('#important'),originalImportant);
    assert.equal((await css('#shadow-text')).background,'rgba(0, 0, 0, 0.08)');
    assert.equal((await css('#adopted-text')).background,'rgba(0, 0, 0, 0)');
    assert.equal(await page.locator('style[data-lumashift]').count(),0);
  });
  await test('original mode and automatically detected native dark pages keep site selection styles',async()=>{
    await settings(worker,{enabled:true,'site:localhost':'original'});await waitStatus(worker,page,'original');
    assert.deepEqual(await css('#example'),original);
    await page.evaluate(()=>{document.documentElement.style.background='#181c24';document.body.style.background='#181c24';document.body.style.color='#dce3ed';});
    const nativeOriginal=await css('#example');
    await settings(worker,{'site:localhost':'auto'});await waitStatus(worker,page,'native');
    assert.deepEqual(await css('#example'),nativeOriginal);
  });
} finally {
  await browser?.close();server.close();
  await writeFile('test-results/selection.json',JSON.stringify({date:new Date().toISOString(),results,errors,samples},null,2));
}
if(results.some(r=>r.status==='failed')||errors.length)process.exitCode=1;

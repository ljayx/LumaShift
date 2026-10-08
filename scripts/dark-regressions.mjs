import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {serve} from './serve.mjs';
import {launch,settings,waitStatus} from './browser.mjs';
import {luminance} from '../src/settings.js';
import {parseSimple} from '../src/colors.js';

const server=await serve();
const browser=await launch();
const {context,worker}=browser,results=[],errors=[];
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const css=(selector,property,pseudo=null)=>page.locator(selector).evaluate((n,{property,pseudo})=>getComputedStyle(n,pseudo).getPropertyValue(property),{property,pseudo});
const test=async(name,fn)=>{try{await fn();results.push({name,status:'passed'});console.log('PASS',name);}catch(e){results.push({name,status:'failed',error:e.stack});console.log('FAIL',name,e.message);}};
const bright=value=>luminance(parseSimple(value))>.2;
try {
  await settings(worker,{'site:localhost':'force'});
  await page.goto('http://localhost:4173/dark-regressions.html');await waitStatus(worker,page,'active');
  await page.waitForTimeout(200);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.external-surface')).backgroundColor==='rgb(29, 33, 43)');
  await test('SVG attributes, inherited defaults, symbols and gradient stops',async()=>{
    assert.ok(bright(await css('#stroke-icon rect:first-child','stroke')));
    assert.ok(bright(await css('#stroke-icon rect:last-child','fill')));
    assert.ok(bright(await css('#masked-icon path','fill')));
    assert.ok(bright(await css('#default-icon path','fill')));
    assert.ok(bright(await css('#symbol path','fill')));
    assert.ok(bright(await css('#gradient stop:first-child','stop-color')));
    assert.equal(await css('#stroke-icon','fill'),'none');
    assert.match(await css('#gradient-icon > path','fill'),/url\(/);
  });
  await test('mask/clip geometry and author CSS/hover precedence',async()=>{
    assert.equal(await css('#mask rect','fill'),'rgb(0, 0, 0)');
    assert.equal(await css('#luminance-mask rect','fill'),'rgb(255, 255, 255)');
    assert.equal(await css('#luminance-mask path','fill'),'rgb(0, 0, 0)');
    assert.equal(await css('#clip path','fill'),'rgb(0, 0, 0)');
    assert.equal(await css('.css-none path','fill'),'none');
    const before=await css('.hover-icon path','fill');await page.locator('.hover-icon').hover();
    assert.notEqual(await css('.hover-icon path','fill'),before);await page.locator('h1').hover();
  });
  await test('partial variable shorthands, pseudo elements, background layout and media',async()=>{
    for(const selector of ['.sheet-surface','#inline-surface','.image']) {
      assert.ok(luminance(parseSimple(await css(selector,'background-color')))<.08,selector);
      assert.equal(await css(selector,'background-repeat'),'no-repeat');
    }
    assert.equal(await css('.sheet-surface','background-size'),'cover');
    assert.equal(await css('#inline-surface','background-size'),'cover');
    assert.equal(await css('.sheet-surface','background-position'),'100% 100%');
    assert.equal(await css('.external-surface','background-color'),'rgb(29, 33, 43)');
    assert.equal(await css('.external-surface','background-position'),'100% 100%');
    assert.equal(await css('#inline-surface','background-position'),'100% 100%');
    assert.ok(luminance(parseSimple(await css('.pseudo','background-color','::before')))<.08);
    assert.match(await css('.image','background-image'),/media\.svg/);
    assert.equal(await css('.image','background-size'),'contain');
  });
  await test('translucent borders, logical borders and hard shadow separators',async()=>{
    const bg=parseSimple(await css('body','background-color'));
    for(const selector of ['.sheet-border','#inline-border','.logical-border']) {
      const color=parseSimple(await css(selector,'border-left-color'));
      const composited=color.slice(0,3).map((v,i)=>v*color[3]+bg[i]*(1-color[3]));
      assert.ok((luminance(composited)+.05)/(luminance(bg)+.05)>1.5,`${selector}: ${color}`);
    }
    assert.equal(await css('.sheet-border','border-left-width'),'3px');
    assert.equal(await css('#inline-border','border-left-width'),'3px');
    assert.equal(parseSimple(await css('.clear-border','border-left-color'))[3],0);
    const shadow=await css('.hard-edge','box-shadow');assert.match(shadow,/rgba\(0, 0, 0, 0.2\)/);assert.ok(!shadow.startsWith('rgba(0, 0, 0,'));
  });
  await test('background-painted ticks and pseudo-element separators',async()=>{
    const bg=parseSimple(await css('body','background-color'));
    for(const [selector,pseudo] of [['.painted-line',null],['#inline-line',null],['.painted-pseudo','::after']]) {
      const color=parseSimple(await css(selector,'background-color',pseudo));
      const composited=color.slice(0,3).map((v,i)=>v*color[3]+bg[i]*(1-color[3]));
      assert.ok((luminance(composited)+.05)/(luminance(bg)+.05)>1.5,`${selector}: ${color}`);
      assert.equal(await css(selector,'height',pseudo),'2px');
    }
  });
  await test('dynamic SVG attributes, removal, inline priority and Shadow DOM',async()=>{
    await page.evaluate(()=>{
      document.querySelector('#stroke-icon rect:last-child').setAttribute('fill','#123456');
      document.querySelector('#masked-icon path').style.setProperty('fill','#321','important');
      const root=document.querySelector('#shadow-host').attachShadow({mode:'open'});
      root.innerHTML='<svg width="20" height="20"><path fill="#111" d="M0 0h20v20H0z"/></svg>';
    });await page.waitForTimeout(100);
    assert.ok(bright(await css('#stroke-icon rect:last-child','fill')));
    assert.ok(bright(await css('#masked-icon path','fill')));
    assert.ok(bright(await css('#shadow-host svg path','fill')));
    await page.locator('#stroke-icon rect:last-child').evaluate(n=>n.removeAttribute('fill'));await page.waitForTimeout(100);
    assert.equal(await css('#stroke-icon rect:last-child','fill'),'none');
  });
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/dark-regressions.png',fullPage:true});
  await test('disable restores latest site values and removes generated attributes',async()=>{
    await settings(worker,{enabled:false});await waitStatus(worker,page,'off');
    assert.equal(await css('.sheet-surface','background-color'),'rgb(251, 252, 253)');
    assert.equal(await css('#inline-surface','background-color'),'rgb(251, 252, 253)');
    assert.equal(await css('#stroke-icon rect:first-child','stroke'),'rgb(17, 20, 26)');
    assert.equal(await css('#masked-icon path','fill'),'rgb(51, 34, 17)');
    assert.equal(await css('#gradient stop:first-child','stop-color'),'rgb(17, 17, 17)');
    assert.equal(await page.locator('[data-lumashift-inline]').count(),0);
    assert.equal(await page.locator('style[data-lumashift]').count(),0);
    assert.equal(await page.locator('[style*="--luma-"]').count(),0);
  });
  if(process.env.LUMASHIFT_REFERENCE_CSS)await test('reference site stylesheet: card document outer surface',async()=>{
    const source=await readFile(process.env.LUMASHIFT_REFERENCE_CSS,'utf8');
    await settings(worker,{enabled:true});await waitStatus(worker,page,'active');
    await page.evaluate(source=>{
      const style=document.createElement('style');style.textContent=source;document.head.append(style);
      const main=document.createElement('main');main.id='reference-surface';main.className='mp-layout-main';main.setAttribute('data-card-theme','gray');document.body.append(main);
      const navigation=document.createElement('div');navigation.className='mp-navigation';navigation.innerHTML='<div class="mp-navigation-fold"><div class="mp-navigation-list-container"><ul class="mp-navigation-list"><li id="reference-tick" class="mp-navigation-item"></li></ul></div></div>';document.body.append(navigation);
    },source);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('#reference-surface')).backgroundColor==='rgb(29, 33, 43)');
    assert.equal(await css('#reference-surface','background-size'),'cover');
    assert.equal(await css('#reference-surface','background-position'),'100% 100%');
    const tick=parseSimple(await css('#reference-tick','background-color'));assert.ok(tick[0]>150 && tick[3]>=.24);
  });
} finally {
  await writeFile('test-results/dark-regressions.json',JSON.stringify({date:new Date().toISOString(),results,errors},null,2));
  await browser.close();server.close();
}
if(results.some(r=>r.status==='failed')||errors.length)process.exitCode=1;

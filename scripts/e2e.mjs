import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {serve} from './serve.mjs';
import {launch,settings,waitStatus,getStatus,background,settle} from './browser.mjs';
const server=await serve();
let browser=await launch();
let {context,worker}=browser;
const results=[],errors=[];
context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
await mkdir('test-results',{recursive:true});
const test=async(name,fn)=>{const start=Date.now();try{await fn();results.push({name,status:'passed',ms:Date.now()-start});console.log('PASS',name);}catch(e){results.push({name,status:'failed',error:e.stack});console.log('FAIL',name,e.message);}};
let page=await context.newPage();
try {
  await test('default activation / CSS layers / semantic colors / CSP',async()=>{
    await page.goto('http://localhost:4173/?csp');await waitStatus(worker,page,'active');await page.waitForTimeout(250);
    assert.notEqual(await background(page),'rgb(255, 255, 255)');
    const result=await page.evaluate(()=>({body:getComputedStyle(document.body).backgroundColor,card:getComputedStyle(document.querySelector('.card')).backgroundColor,colors:['.success','.warning','.error'].map(s=>getComputedStyle(document.querySelector(s)).color)}));
    assert.notEqual(result.body,result.card);assert.equal(new Set(result.colors).size,3);
    await page.screenshot({path:'test-results/lumashift-page.png',fullPage:true});
  });
  await test('input / focus / scroll / media / clean current-theme restoration',async()=>{
    await page.locator('#notes').fill('保留输入内容');await page.locator('#notes').focus();
    const before=await page.evaluate(()=>({focus:document.activeElement.id,scroll:scrollY,canvas:document.querySelector('canvas').toDataURL(),photo:getComputedStyle(document.querySelector('#photo')).filter}));
    await settings(worker,{enabled:false});await waitStatus(worker,page,'off');
    assert.equal(await background(page),'rgb(255, 255, 255)');
    assert.deepEqual(await page.evaluate(()=>({focus:document.activeElement.id,scroll:scrollY,canvas:document.querySelector('canvas').toDataURL(),photo:getComputedStyle(document.querySelector('#photo')).filter})),before);
    assert.equal(await page.locator('#notes').inputValue(),'保留输入内容');assert.equal(await page.locator('style[data-lumashift]').count(),0);
    await settings(worker,{enabled:true});await waitStatus(worker,page,'active');
  });
  await test('dynamic add/remove / inline change / menu / dialog / SPA',async()=>{
    await page.locator('#add').click();await page.waitForTimeout(150);assert.equal(await page.locator('.item').count(),100);
    assert.notEqual(await page.locator('.item').first().evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');
    await page.locator('#recolor').click();await page.waitForTimeout(150);
    assert.notEqual(await page.locator('#mutable').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 238, 238)');
    await page.locator('#menu-button').click();await page.locator('#route').click();assert.ok(page.url().endsWith('#details'));
    await page.locator('#dialog-button').click();assert.equal(await page.locator('dialog').evaluate(n=>n.open),true);await page.locator('#close-dialog').click();
    await settings(worker,{enabled:false});await waitStatus(worker,page,'off');
    assert.equal(await page.locator('#mutable').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 238, 238)');
    await settings(worker,{enabled:true});await waitStatus(worker,page,'active');await page.locator('#remove').click();
  });
  await test('native light → dark → light, manual override, restore current website theme',async()=>{
    await page.locator('#native').click();await waitStatus(worker,page,'native');assert.equal(await background(page),'rgb(22, 28, 37)');
    await settings(worker,{'site:localhost':'force'});await waitStatus(worker,page,'active');
    await settings(worker,{enabled:false});await waitStatus(worker,page,'off');assert.equal(await background(page),'rgb(22, 28, 37)');
    await settings(worker,{enabled:true,'site:localhost':'auto'});await waitStatus(worker,page,'native');
    await page.locator('#native').click();await waitStatus(worker,page,'active');
  });
  await test('background transitions do not oscillate auto mode during style updates',async()=>{
    const surface=await context.newPage();
    try {
      await surface.goto('http://localhost:4173/theme-transitions.html');
      await waitStatus(worker,surface,'active');await surface.waitForTimeout(350);
      const result=await surface.evaluate(()=>new Promise(resolve=>{
        const colors=[],events=[];
        const listener=e=>events.push(e.type);
        for(const name of ['__lumashift_start','__lumashift_stop'])document.addEventListener(name,listener);
        const tick=setInterval(()=>document.querySelector('#update').click(),240);
        const sample=setInterval(()=>colors.push(getComputedStyle(document.querySelector('main')).backgroundColor),25);
        setTimeout(()=>{
          clearInterval(tick);clearInterval(sample);
          for(const name of ['__lumashift_start','__lumashift_stop'])document.removeEventListener(name,listener);
          resolve({colors,events});
        },2400);
      }));
      assert.deepEqual(result.events,[],'original-theme sampling must not restart the engine');
      assert.ok(result.colors.length>20);
      assert.deepEqual([...new Set(result.colors)],['rgb(24, 28, 36)'],'no intermediate light frames');
      assert.equal((await getStatus(worker,surface)).status,'active');
      await surface.locator('#native').click();await waitStatus(worker,surface,'native');
      await surface.waitForTimeout(350);
      assert.equal(await surface.locator('main').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(22, 28, 37)');
      await surface.locator('#native').click();await waitStatus(worker,surface,'active');
      await settings(worker,{enabled:false});await waitStatus(worker,surface,'off');await surface.waitForTimeout(350);
      assert.equal(await surface.locator('main').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');
      assert.equal(await surface.locator('main').evaluate(n=>getComputedStyle(n).transitionDuration),'0.2s');
      assert.equal(await surface.locator('style[data-lumashift]').count(),0);
    } finally {await surface.close();await settings(worker,{enabled:true});await waitStatus(worker,page,'active');}
  });
  await test('Ctrl+G search overlay preserves page theme and native theme changes',async()=>{
    const search=await context.newPage();
    try {
      await search.goto('http://localhost:4173/?search-overlay');await waitStatus(worker,search,'active');
      await search.evaluate(()=>{
        document.addEventListener('keydown',event=>{
          if(event.ctrlKey && event.key.toLowerCase()==='g') {
            event.preventDefault();
            const overlay=document.createElement('div');overlay.id='search-overlay';
            overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.75)';
            overlay.innerHTML='<input aria-label="Search" placeholder="Search">';
            document.body.append(overlay);overlay.querySelector('input').focus();
          } else if(event.key==='Escape')document.querySelector('#search-overlay')?.remove();
        });
      });
      const converted=await background(search);
      for(let i=0;i<2;i++) {
        await search.keyboard.press('Control+g');await search.waitForTimeout(400);
        assert.equal((await getStatus(worker,search)).status,'active');
        assert.equal(await background(search),converted);
        await search.getByRole('textbox',{name:'Search',exact:true}).fill('keep focus');
        assert.equal(await search.evaluate(()=>document.activeElement.value),'keep focus');
        await search.keyboard.press('Escape');await search.waitForTimeout(250);
        assert.equal((await getStatus(worker,search)).status,'active');
      }
      await search.keyboard.press('Control+g');
      // Opaque extension panels can use either fixed or absolute positioning.
      for(const position of ['fixed','absolute']) {
        await search.locator('#search-overlay').evaluate((n,position)=>{n.style.position=position;n.style.background='#111';window.dispatchEvent(new Event('resize'));},position);
        await search.waitForTimeout(400);
        assert.equal((await getStatus(worker,search)).status,'active');assert.equal(await background(search),converted);
      }
      await search.evaluate(()=>document.documentElement.dataset.theme='dark');
      await waitStatus(worker,search,'native');
      // A light modal must not cause an already dark site to start converting.
      await search.locator('#search-overlay').evaluate(n=>{n.setAttribute('role','dialog');n.setAttribute('aria-modal','true');n.style.background='#fff';window.dispatchEvent(new Event('resize'));});
      await search.waitForTimeout(400);assert.equal((await getStatus(worker,search)).status,'native');
      await search.evaluate(()=>document.documentElement.dataset.theme='light');
      await waitStatus(worker,search,'active');assert.equal(await background(search),converted);
      await search.keyboard.press('Escape');await search.waitForTimeout(250);
      assert.equal((await getStatus(worker,search)).status,'active');
      // Full-page fixed layouts must still participate in native detection.
      await search.evaluate(()=>{
        const shell=document.createElement('main');shell.id='fixed-app';
        shell.style.cssText='position:fixed;inset:0;background:#151515;color:#eee';
        shell.textContent='Application';document.body.replaceChildren(shell);
      });
      await waitStatus(worker,search,'native');
      await search.locator('#fixed-app').evaluate(n=>n.style.background='#fff');
      await waitStatus(worker,search,'active');
    } finally {await search.close();}
  });
  await test('both iframe origins inherit top-host rule / open Shadow DOM',async()=>{
    assert.equal(page.frames().length,3);
    for(const frame of page.frames().slice(1)){assert.ok(frame.url().endsWith('/frame.html'));assert.equal(await frame.locator('h3').textContent(),'Frame 内容');}
    for(const frame of page.frames().slice(1))assert.notEqual(await frame.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(255, 255, 255)');
    assert.notEqual(await page.locator('#shadow-host').evaluate(n=>getComputedStyle(n.shadowRoot.querySelector('p')).backgroundColor),'rgb(255, 255, 255)');
    await settings(worker,{'site:localhost':'original'});await waitStatus(worker,page,'original');await page.waitForTimeout(200);
    for(const frame of page.frames().slice(1))assert.equal(await frame.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(255, 255, 255)');
    await settings(worker,{'site:localhost':'auto'});await waitStatus(worker,page,'active');
  });
  await test('late open shadow / adopted styles / inline var shorthand / media pixels and playback',async()=>{
    await page.evaluate(()=>{
      const host=document.createElement('section');host.id='late-shadow';const root=host.attachShadow({mode:'open'});const sheet=new CSSStyleSheet();sheet.replaceSync('p{background:#fff;color:#111}');root.adoptedStyleSheets=[sheet];root.innerHTML='<p>Adopted sheet</p>';document.body.append(host);
      const item=document.createElement('div');item.id='inline-var';item.style.cssText='--surface:#fafafa;background:var(--surface);color:#111';item.textContent='Inline variable';document.body.append(item);
    });
    await page.waitForTimeout(250);
    assert.notEqual(await page.locator('#late-shadow').evaluate(n=>getComputedStyle(n.shadowRoot.querySelector('p')).backgroundColor),'rgb(255, 255, 255)');
    assert.notEqual(await page.locator('#inline-var').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(250, 250, 250)');
    await page.locator('#photo').scrollIntoViewIfNeeded();
    const crop=async()=>{const box=await page.locator('#photo').boundingBox();return page.screenshot({clip:{x:box.x+12,y:box.y+12,width:box.width-24,height:box.height-24}});};
    const image=await crop();
    await page.locator('video').evaluate(video=>video.play());
    await settings(worker,{enabled:false});await waitStatus(worker,page,'off');await page.waitForTimeout(100);
    const afterImage=await crop();await writeFile('test-results/media-before.png',image);await writeFile('test-results/media-after.png',afterImage);
    const pixelDiff=await page.evaluate(async ({before,after})=>{
      const decode=async source=>{const image=new Image();image.src='data:image/png;base64,'+source;await image.decode();const canvas=new OffscreenCanvas(image.width,image.height);const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,image.width,image.height).data;};
      const [a,b]=await Promise.all([decode(before),decode(after)]);let max=0,changed=0;for(let i=0;i<a.length;i+=4){let delta=0;for(let j=0;j<4;j++)delta=Math.max(delta,Math.abs(a[i+j]-b[i+j]));max=Math.max(max,delta);if(delta)changed++;}return {max,changed,fraction:changed/(a.length/4)};
    },{before:image.toString('base64'),after:afterImage.toString('base64')});
    await writeFile('test-results/media-diff.json',JSON.stringify(pixelDiff,null,2));
    // Allow at most one quantization step on 0.1% of pixels (GPU edge rounding).
    assert.ok(pixelDiff.max<=1 && pixelDiff.fraction<=.001,JSON.stringify(pixelDiff));assert.equal(await page.locator('video').evaluate(n=>n.paused),false);
    assert.equal(await page.locator('#late-shadow').evaluate(n=>n.shadowRoot.adoptedStyleSheets.length),1);
    assert.equal(await page.locator('#inline-var').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(250, 250, 250)');
    await page.locator('video').evaluate(n=>n.pause());await settings(worker,{enabled:true});await waitStatus(worker,page,'active');
  });
  await test('all existing related tabs update; unrelated hostname stays independent',async()=>{
    const same=await context.newPage();await same.goto('http://localhost:4173/?tab=2');
    const other=await context.newPage();await other.goto('http://127.0.0.1:4173/?tab=3');
    await waitStatus(worker,same,'active');await waitStatus(worker,other,'active');
    await settings(worker,{'site:localhost':'original'});await waitStatus(worker,page,'original');await waitStatus(worker,same,'original');await waitStatus(worker,other,'active');
    await settings(worker,{enabled:false});await waitStatus(worker,other,'off');
    await settings(worker,{enabled:true,'site:localhost':'auto'});await waitStatus(worker,page,'active');await same.close();await other.close();
  });
  await test('CSSOM insertion / custom variables / inline !important restoration',async()=>{
    await page.evaluate(()=>{const s=document.createElement('style');s.id='cssom-test';document.head.append(s);s.sheet.insertRule('.cssom-test { --surface: #fafafa; --ink: #111; background:var(--surface);color:var(--ink)}');const n=document.createElement('div');n.className='cssom-test';n.textContent='CSSOM';document.body.append(n);document.querySelector('#mutable').style.setProperty('color','#123','important');});
    await page.waitForTimeout(250);
    const cssomResult=await page.locator('.cssom-test').evaluate(n=>({bg:getComputedStyle(n).backgroundColor,generated:document.querySelector('#cssom-test').nextElementSibling?.textContent}));
    assert.notEqual(cssomResult.bg,'rgb(250, 250, 250)',JSON.stringify(cssomResult));
    await settings(worker,{enabled:false});await waitStatus(worker,page,'off');assert.equal(await page.locator('#mutable').evaluate(n=>getComputedStyle(n).color),'rgb(17, 34, 51)');
    await settings(worker,{enabled:true});await waitStatus(worker,page,'active');
  });
  await test('legacy HTML background attributes remain readable and restore current values',async()=>{
    await page.evaluate(()=>{const table=document.createElement('table');table.id='legacy';table.setAttribute('bgcolor','#f6f6ef');table.innerHTML='<tr><td><font color="#222222">Legacy content</font> <a href="#legacy">Default link</a></td></tr>';document.body.append(table);});
    await page.waitForTimeout(150);
    assert.notEqual(await page.locator('#legacy').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(246, 246, 239)');
    await page.locator('#legacy').evaluate(n=>n.setAttribute('bgcolor','#eeeeee'));await page.waitForTimeout(100);
    await settings(worker,{enabled:false});await waitStatus(worker,page,'off');
    assert.equal(await page.locator('#legacy').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(238, 238, 238)');
    assert.equal(await page.locator('#legacy font').evaluate(n=>getComputedStyle(n).color),'rgb(34, 34, 34)');
    await settings(worker,{enabled:true});await waitStatus(worker,page,'active');
  });
  await test('embedded PDF does not disable the surrounding HTML page',async()=>{
    await page.evaluate(()=>{const embedded=document.createElement('embed');embedded.id='pdf-region';embedded.type='application/pdf';document.body.append(embedded);});
    await settings(worker,{enabled:false});await waitStatus(worker,page,'off');
    await settings(worker,{enabled:true});await waitStatus(worker,page,'active');
    assert.notEqual(await background(page),'rgb(255, 255, 255)');
    assert.equal(await page.locator('#pdf-region').getAttribute('type'),'application/pdf');
    await page.locator('#pdf-region').evaluate(n=>n.remove());
  });
  await test('popup controls / colors / warning / color-only reset / actual status',async()=>{
    const id=new URL(worker.url()).host;
    const popup=await context.newPage();await page.bringToFront();await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.waitForFunction(()=>document.querySelector('#hostname').textContent==='localhost');
    await popup.waitForTimeout(200);await popup.locator('body').screenshot({path:'test-results/popup.png'});
    await popup.locator('[name=mode][value=force]').check();await waitStatus(worker,page,'active');
    await popup.locator('[name=mode][value=auto]').check();await popup.waitForTimeout(100);
    assert.equal((await worker.evaluate(()=>chrome.storage.local.get('site:localhost')))['site:localhost'],undefined);
    await popup.locator('[name=mode][value=force]').check();await waitStatus(worker,page,'active');
    await popup.locator('#background').evaluate(n=>{n.value='#222222';n.dispatchEvent(new Event('change',{bubbles:true}));});
    await popup.locator('#text').evaluate(n=>{n.value='#333333';n.dispatchEvent(new Event('change',{bubbles:true}));});
    await popup.waitForFunction(()=>!document.querySelector('#warning').hidden);
    await popup.locator('#reset').click();await popup.waitForTimeout(250);
    const raw=await worker.evaluate(()=>chrome.storage.local.get(null));assert.equal(raw.background,'#181c24');assert.equal(raw.text,'#dce3ed');assert.equal(raw['site:localhost'],'force');
    await popup.locator('#enabled').uncheck();await waitStatus(worker,page,'off');await popup.waitForFunction(()=>document.querySelector('#status').textContent==='全局已关闭');
    await popup.close();await settings(worker,{enabled:true,'site:localhost':'auto'});
  });
  await test('restricted page popup explains unsupported state',async()=>{
    const restricted=await context.newPage();await restricted.goto('chrome://version');const popup=await context.newPage();await restricted.bringToFront();await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    await popup.waitForFunction(()=>document.querySelector('#status').textContent==='此页面不支持');assert.equal(await popup.locator('#modes').evaluate(n=>n.disabled),true);await popup.close();await restricted.close();
  });
  await test('100 toggles leave no generated styles and preserve site values',async()=>{
    for(let i=0;i<100;i++){await settings(worker,{enabled:i%2===0});await waitStatus(worker,page,i%2===0?'active':'off');}
    assert.equal(await page.locator('style[data-lumashift]').count(),0);
    assert.equal(await page.locator('[data-lumashift-inline]').count(),0);
    assert.equal(await page.locator('#notes').inputValue(),'保留输入内容');
  });
  await test('browser restart persists colors and exact-host site rule',async()=>{
    await settings(worker,{enabled:true,background:'#202630','site:localhost':'original'});
    const profile=browser.directory;const extensionId=new URL(worker.url()).host;console.log('Restart: closing');await browser.close(true);console.log('Restart: launching');browser=await launch(true,profile);({context,worker}=browser);console.log('Restart: navigating');page=await context.newPage();await page.goto('http://localhost:4173/?restart');console.log('Restart: document loaded');
    const control=await context.newPage();await page.bringToFront();await control.goto(`chrome-extension://${extensionId}/popup.html`);worker=control;console.log('Restart: control ready');await waitStatus(worker,page,'original');
    assert.equal((await worker.evaluate(()=>chrome.storage.local.get('background'))).background,'#202630');
    await settings(worker,{background:'#181c24','site:localhost':'auto'});await waitStatus(worker,page,'active');
  });
} finally {
  const report={date:new Date().toISOString(),browser:context.browser()?.version(),results,pageErrors:errors};
  await writeFile('test-results/e2e.json',JSON.stringify(report,null,2));await browser.close();await rm(browser.directory,{recursive:true,force:true});server.close();
}
if(results.some(r=>r.status==='failed')||errors.length)process.exitCode=1;

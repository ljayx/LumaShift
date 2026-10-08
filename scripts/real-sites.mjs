import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {serve} from './serve.mjs';
import {launch,settings,waitStatus,getStatus} from './browser.mjs';
const sites=[
  {id:'linuxdo',url:'https://linux.do/t/topic/2960445',kind:'论坛 / 浅色提示与评论胶囊',selector:'#post_1',surfaces:['#global-notice-alert-global-notice','.discourse-boosts__bubble']},
  {id:'wikipedia',url:'https://en.wikipedia.org/wiki/Web_browser',kind:'Wiki / 内容',selector:'#firstHeading'},
  {id:'github',url:'https://github.com/darkreader/darkreader',kind:'开发者 / 代码',selector:'main'},
  {id:'hn',url:'https://news.ycombinator.com/',kind:'新闻 / 社区',selector:'.titleline'},
  {id:'mdn',url:'https://developer.mozilla.org/en-US/docs/Web/CSS',kind:'文档',selector:'main'},
  {id:'baidu',url:'https://www.baidu.com/s?wd=Chrome',kind:'搜索',selector:'#content_left'},
  {id:'reddit',url:'https://www.reddit.com/r/webdev/',kind:'社区 / 动态列表',selector:'main'},
  {id:'bilibili',url:'https://www.bilibili.com/',kind:'视频入口',selector:'body'},
  {id:'zhihu',url:'https://www.zhihu.com/topic/19550901/hot',kind:'社区 / 登录边界',selector:'body'},
];
const server=await serve();const browser=await launch();const results=[];
const selected=process.env.SITE_IDS?.split(',');
if(selected){const previous=JSON.parse(await readFile('test-results/real-sites.json','utf8'));results.push(...previous.results.filter(r=>!selected.includes(r.id)));}
await mkdir('test-results/sites',{recursive:true});
try {
  for(const site of sites.filter(site=>!selected||selected.includes(site.id))) {
    console.log('SITE',site.id);const page=await browser.context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const result={...site,initialTheme:'browser light preference; original page colors captured',status:'unverified',steps:[],pageErrors:errors};
    try {
      await page.emulateMedia({colorScheme:'light'});await settings(browser.worker,{enabled:false});
      const response=await page.goto(site.url,{waitUntil:'domcontentloaded',timeout:20000});
      await page.waitForTimeout(1800);result.httpStatus=response?.status();result.title=await page.title();result.finalURL=page.url();
      const content=(await page.locator('body').innerText()).slice(0,12000);
      if(result.httpStatus>=400 || /verify you are human|prove your humanity|blocked by network security|访问过于频繁|安全验证|验证码|captcha/i.test(content+' '+result.title)) {
        result.status='blocked';result.reason='HTTP error or verification wall; not counted as website compatibility pass';
        await page.screenshot({path:`test-results/sites/${site.id}-blocked.png`});
      } else {
        await page.locator(site.selector).first().waitFor({state:'visible',timeout:5000});
        await page.screenshot({path:`test-results/sites/${site.id}-original.png`});
        if(site.surfaces)result.originalSurfaces=await page.locator(site.surfaces.join(',')).evaluateAll(nodes=>nodes.slice(0,3).map(n=>({class:n.className,background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color})));
        result.steps.push('Original page visible and screenshot captured');
        await settings(browser.worker,{enabled:true});await page.waitForTimeout(1200);result.automaticStatus=await getStatus(browser.worker,page);
        await page.screenshot({path:`test-results/sites/${site.id}-auto.png`});result.steps.push('Automatic conversion status and screenshot captured');
        if(site.surfaces)result.convertedSurfaces=await page.locator(site.surfaces.join(',')).evaluateAll(nodes=>nodes.slice(0,3).map(n=>({class:n.className,background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color})));
        const host=new URL(page.url()).hostname;await settings(browser.worker,{[`site:${host}`]:'force'});await waitStatus(browser.worker,page,'active');await page.waitForTimeout(350);
        await page.mouse.wheel(0,550);await page.waitForTimeout(300);await page.screenshot({path:`test-results/sites/${site.id}-force-scrolled.png`});result.steps.push('Force conversion and scroll 550px');
        if(site.id==='hn') {
          const link=page.locator('.subtext a').filter({hasText:/\d+\s+comments/}).first();
          if(await link.count()){await link.click();await page.waitForLoadState('domcontentloaded');result.steps.push('Opened public comments page');}
        }
        if(site.id==='mdn') {const detail=page.locator('details summary').first();if(await detail.isVisible().catch(()=>false)){await detail.click();result.steps.push('Toggled document details');}}
        if(site.id==='wikipedia') {
          await settings(browser.worker,{[`site:${host}`]:'auto'});
          await page.getByRole('radio',{name:'Dark',exact:true}).check();await waitStatus(browser.worker,page,'native');
          await page.screenshot({path:'test-results/sites/wikipedia-native-dark.png'});
          await page.getByRole('radio',{name:'Light',exact:true}).check();await waitStatus(browser.worker,page,'active');
          await settings(browser.worker,{[`site:${host}`]:'force'});await page.getByRole('radio',{name:'Dark',exact:true}).check();await waitStatus(browser.worker,page,'active');
          result.steps.push('Native Dark → auto skip; native Light → conversion; force on native Dark');result.nativeTheme='verified';
        }
        await settings(browser.worker,{enabled:false});await waitStatus(browser.worker,page,'off');result.steps.push('Disabled and confirmed off state without reload');
        result.status='smoke-tested';result.reason='Only listed operations; requires visual review. Native website theme switching, login workflows and real video playback not verified.';
      }
    }catch(error){result.status='unverified';result.reason=error.message;}
    results.push(result);console.log(site.id,result.status);await page.close();
    await writeFile('test-results/real-sites.json',JSON.stringify({date:new Date().toISOString(),browser:browser.context.browser().version(),results},null,2));
  }
}finally{await browser.close();server.close();}

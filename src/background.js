import {DEFAULTS, MODES, isColor, pageInfo, readSettings, siteKey} from './settings.js';

const getSettings = async host => readSettings(await chrome.storage.local.get(['enabled','background','text',siteKey(host)]),host);
let writeQueue = Promise.resolve();
const serialize = job => { const result=writeQueue.then(job); writeQueue=result.catch(()=>{}); return result; };

async function inject(tab) {
  if (!tab.id || !pageInfo(tab.url).supported) return;
  try {
    // Repeated installation is safe: each world has an instance guard.
    await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['proxy.js'],world:'MAIN'});
    await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['content.js']});
  } catch { /* Restricted frames and withheld access remain unchanged. */ }
}
async function injectOpenTabs() { await Promise.allSettled((await chrome.tabs.query({})).map(inject)); }
chrome.runtime.onInstalled.addListener(injectOpenTabs);
chrome.permissions.onAdded.addListener(injectOpenTabs);

async function context(sender) {
  const info=pageInfo(sender.tab?.url);
  return {...info,settings:await getSettings(info.host)};
}
async function snapshot(tabId) {
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { return {supported:false,status:'unsupported',reason:'当前标签页已关闭',settings:await getSettings('')}; }
  const info=pageInfo(tab.url);
  const settings=await getSettings(info.host);
  if(!info.supported) return {...info,settings,status:'unsupported'};
  const authorized=await chrome.permissions.contains({origins:[`${info.origin}/*`]});
  if(!authorized) return {...info,settings,status:'unauthorized',reason:'未获此网站访问权限，请在扩展的网站访问设置中允许'};
  try {
    const response=await chrome.tabs.sendMessage(tabId,{type:'PAGE_STATUS'},{frameId:0});
    return {...info,settings,...response};
  } catch {
    await inject(tab);
    try {
      const response=await chrome.tabs.sendMessage(tabId,{type:'PAGE_STATUS'},{frameId:0});
      return {...info,settings,...response};
    } catch { return {...info,settings,status:'unavailable',reason:'此页无法运行转换，可能受浏览器限制或尚未加载完成'}; }
  }
}

// CSS fetches only: bounded, credential-free, no upload, no remotely executed code.
const cssCache=new Map();
async function fetchCSS(raw,sender) {
  if(!sender.tab || typeof raw!=='string') throw new Error('Invalid resource request');
  const url=new URL(raw);
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsupported resource');
  const cached=cssCache.get(url.href);
  if(cached && Date.now()-cached.time<60_000) return cached.text;
  const response=await fetch(url.href,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(5000)});
  if(!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('text/css')) throw new Error('Stylesheet unavailable');
  const reader=response.body.getReader();
  const decoder=new TextDecoder();let text='',size=0;
  try {
    for(;;) { const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024)throw new Error('Stylesheet too large');text+=decoder.decode(value,{stream:true}); }
    text+=decoder.decode();
  } finally {await reader.cancel().catch(()=>{});}
  cssCache.set(url.href,{text,time:Date.now()});
  while(cssCache.size>16 || [...cssCache.values()].reduce((n,v)=>n+v.text.length*2,0)>2*1024*1024) cssCache.delete(cssCache.keys().next().value);
  return text;
}

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(sender.id!==chrome.runtime.id) return;
  const popup = sender.url === chrome.runtime.getURL('popup.html');
  let work;
  if(message?.type==='CONTEXT' && sender.tab) work=context(sender);
  if(message?.type==='FETCH_CSS' && sender.tab) work=fetchCSS(message.url,sender).then(text=>({text}));
  if(message?.type==='SNAPSHOT' && popup) work=snapshot(message.tabId);
  if(message?.type==='UPDATE' && popup) work=serialize(async()=>{
    const {key,value}=message;
    if(key==='enabled' && typeof value==='boolean') await chrome.storage.local.set({enabled:value});
    else if(['background','text'].includes(key) && isColor(value)) await chrome.storage.local.set({[key]:value.toLowerCase()});
    else if(key==='resetColors') await chrome.storage.local.set({background:DEFAULTS.background,text:DEFAULTS.text});
    else if(key==='mode' && MODES.includes(value)) {
      const tab=await chrome.tabs.get(message.tabId);const info=pageInfo(tab.url);
      if(!info.supported) throw new Error('此页面无法设置网站规则');
      if(value==='auto') await chrome.storage.local.remove(siteKey(info.host));
      else await chrome.storage.local.set({[siteKey(info.host)]:value});
    } else throw new Error('设置值无效');
    return {ok:true};
  });
  if(!work) return;
  Promise.resolve(work).then(sendResponse,error=>sendResponse({error:error.message}));
  return true;
});

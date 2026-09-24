import {ThemeEngine} from './engine.js';
import {decide, siteKey} from './settings.js';
import {inspectOriginal,themeWatcher} from './detection.js';

if(!globalThis.__lumashiftContent) {
  globalThis.__lumashiftContent=true;
  let settings,host='',supported=true,nativeDark=false,state='loading',reason='',stopWatcher=null,themeKey='',generation=0,bodyObserver;
  const status=()=>({status:state,reason:state==='active'&&engine.failed.size?'已应用深色主题；部分样式无法读取，局部可能保持原样':reason,host,mode:settings?.mode});
  const stop=()=>{stopWatcher?.();stopWatcher=null;};
  const engine=new ThemeEngine(async url=>{
    const response=await chrome.runtime.sendMessage({type:'FETCH_CSS',url:String(url)});
    if(response?.error)throw new Error(response.error);
    return response.text;
  });
  function apply() {
    if(!settings || !document.body)return;
    stop();
    // An embedded PDF is only a local unsupported region; the surrounding
    // HTML document must remain eligible for conversion.
    if(document.contentType==='application/pdf') {supported=false;reason='第一版不支持浏览器 PDF 阅读器';}
    let targets;
    if(supported && settings.enabled && settings.mode==='auto') {
      const inspected=engine.withOriginal(()=>inspectOriginal(nativeDark));nativeDark=inspected.nativeDark;targets=inspected.targets;
    }
    const next=decide({supported,...settings,nativeDark});
    try {
      if(next==='active') {
        const key=`${settings.background}/${settings.text}`;
        if(!engine.active || themeKey!==key) {
          engine.enable(settings);
          themeKey=key;
        }
      } else if(engine.active) {engine.disable();themeKey='';}
      state=next;
      if(targets) stopWatcher=themeWatcher(apply,targets);
    } catch(error) {
      engine.disable();themeKey='';state='error';reason='转换失败，已恢复原主题';
      console.warn('LumaShift:',error.message);
    }
  }
  async function reload() {
    const current=++generation;
    try {
      const context=await chrome.runtime.sendMessage({type:'CONTEXT'});
      if(current!==generation)return;
      if(context?.error)throw new Error(context.error);
      host=context.host||'';settings=context.settings;supported=context.supported;reason=context.reason||'';
      apply();
    } catch {
      stop();engine.disable();state='unavailable';reason='扩展连接已断开，请重新加载此标签页';
    }
  }
  chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
    if(message?.type==='PAGE_STATUS')reply(status());
  });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local' && ['enabled','background','text',siteKey(host)].some(k=>k in changes))reload();
  });
  // Activate as soon as body exists, without hiding or blocking content.
  if(!document.body) {
    bodyObserver=new MutationObserver(()=>{if(document.body){bodyObserver.disconnect();apply();}});
    bodyObserver.observe(document.documentElement||document,{childList:true,subtree:true});
  }
  document.addEventListener('DOMContentLoaded',apply,{once:true});
  window.addEventListener('pageshow',event=>{if(event.persisted)reload();});
  window.addEventListener('pagehide',()=>{stop();bodyObserver?.disconnect();});
  reload();
}

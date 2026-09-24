import {contrast} from './settings.js';
const $=id=>document.getElementById(id);
let tabId,refreshTimer,pending=false;
const labels={active:'正在转换',off:'全局已关闭',original:'网站保持原样',native:'页面已为深色',unsupported:'此页面不支持',unauthorized:'未获网站访问权限',unavailable:'当前页面无法连接',loading:'正在准备转换',error:'已恢复原主题'};
const reasons={active:'插件深色主题已应用到当前页面',off:'所有页面恢复原主题，网站设置仍然保留',original:'当前网站将保持自己的主题',native:'自动模式已跳过，可选择强制转换',loading:'页面加载后将自动更新状态'};
async function send(message) {const r=await chrome.runtime.sendMessage(message);if(r?.error)throw new Error(r.error);return r;}
function colors() {
  const bg=$('background').value,fg=$('text').value;
  $('background-value').textContent=bg.toUpperCase();$('text-value').textContent=fg.toUpperCase();
  $('preview').style.background=bg;$('preview').style.color=fg;
  const ratio=contrast(bg,fg);$('contrast').textContent=`基准文字对比度 ${ratio.toFixed(1)} : 1`;$('warning').hidden=ratio>=4.5;
}
function error(err){$('error').hidden=false;$('error').textContent=err.message||'操作失败，请重试';}
async function refresh() {
  if(pending || !Number.isInteger(tabId))return;
  try {
    const value=await send({type:'SNAPSHOT',tabId});const settings=value.settings;
    $('hostname').textContent=value.host||'浏览器受限页面';
    $('enabled').checked=settings.enabled;
    $('modes').disabled=!value.supported || value.status==='unauthorized';
    document.querySelector(`input[name=mode][value="${settings.mode}"]`).checked=true;
    $('background').value=settings.background;$('text').value=settings.text;colors();
    $('status').textContent=labels[value.status]||'状态未知';$('reason').textContent=value.reason||reasons[value.status]||'请检查扩展的网站访问权限';
    $('indicator').classList.toggle('active',value.status==='active');
    $('mode-hint').textContent=settings.mode==='force'?'即使网站已有深色主题，仍应用插件配色':settings.mode==='original'?'全局开启时，此网站也会保持原样':'自动识别页面当前的明暗状态';
  } catch(err){error(err);}
}
async function update(key,value) {
  pending=true;$('error').hidden=true;
  try{await send({type:'UPDATE',tabId,key,value});}catch(err){error(err);}finally{pending=false;}
  await refresh();clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,200);
}
$('enabled').addEventListener('change',e=>update('enabled',e.target.checked));
document.querySelectorAll('[name=mode]').forEach(input=>input.addEventListener('change',e=>update('mode',e.target.value)));
for(const key of ['background','text']) {
  let timer;
  $(key).addEventListener('input',()=>{colors();clearTimeout(timer);timer=setTimeout(()=>update(key,$(key).value),80);});
  $(key).addEventListener('change',()=>{clearTimeout(timer);update(key,$(key).value);});
}
$('reset').addEventListener('click',()=>update('resetColors'));
chrome.storage.onChanged.addListener(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,180);});
chrome.tabs.onUpdated.addListener((id,change)=>{if(id===tabId && (change.status||change.url))refresh();});
const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id;
if(Number.isInteger(tabId))await refresh();else error(new Error('未找到当前标签页'));
// Only the open popup polls; webpages have no polling timer.
const statusTimer=setInterval(refresh,1000);
window.addEventListener('pagehide',()=>{clearInterval(statusTimer);clearTimeout(refreshTimer);});

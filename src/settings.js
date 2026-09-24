export const DEFAULTS = Object.freeze({enabled:true, background:'#181c24', text:'#dce3ed'});
export const MODES = ['auto','force','original'];
export const siteKey = (host) => `site:${host}`;
export const isColor = (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
export function pageInfo(raw) {
  try {
    const url = new URL(raw);
    if (!['http:','https:'].includes(url.protocol)) return {supported:false,reason:'此页面不支持扩展转换'};
    if (url.hostname === 'chromewebstore.google.com' || (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))) return {supported:false,reason:'Chrome 扩展商店禁止页面转换'};
    if (/\.pdf$/i.test(url.pathname)) return {supported:false,reason:'第一版不支持浏览器 PDF 阅读器'};
    return {supported:true,host:url.hostname,origin:url.origin};
  } catch { return {supported:false,reason:'无法获取当前页面地址'}; }
}
export function readSettings(raw={}, host='') {
  return {
    enabled:typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULTS.enabled,
    background:isColor(raw.background) ? raw.background.toLowerCase() : DEFAULTS.background,
    text:isColor(raw.text) ? raw.text.toLowerCase() : DEFAULTS.text,
    mode:MODES.includes(raw[siteKey(host)]) ? raw[siteKey(host)] : 'auto',
  };
}
export function luminance(channels) {
  const linear = channels.slice(0,3).map(v=>{const c=v/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;});
  return linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
}
export function contrast(a,b) {
  const decode = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const values = [luminance(decode(a)),luminance(decode(b))].sort((x,y)=>x-y);
  return (values[1]+0.05)/(values[0]+0.05);
}
export function decide({supported=true,authorized=true,enabled=true,mode='auto',nativeDark=false}) {
  if (!supported) return 'unsupported';
  if (!authorized) return 'unauthorized';
  if (!enabled) return 'off';
  if (mode==='original') return 'original';
  if (mode==='auto' && nativeDark) return 'native';
  return 'active';
}

import {luminance} from './settings.js';

function rgba(value) {
  const parts=value.match(/[\d.]+/g)?.map(Number);
  return parts?.length>=3 ? [...parts.slice(0,3),parts[3]??1] : [255,255,255,1];
}
function background(element) {
  let color=[0,0,0],alpha=0;
  for(let node=element;node && alpha<0.99;node=node.parentElement) {
    const c=rgba(getComputedStyle(node).backgroundColor);const weight=c[3]*(1-alpha);
    color=color.map((v,i)=>v+c[i]*weight);alpha+=weight;
  }
  return color.map(v=>v+255*(1-alpha));
}

// No paint can occur between disabling and restoring the sheets in this task.
// Current website CSS remains the source of truth, including changes made while on.
export function inspectOriginal(previous=false) {
  const sheets=[...document.querySelectorAll('style[data-lumashift]')].map(n=>n.sheet).filter(Boolean);
  const enabled=sheets.filter(s=>!s.disabled);
  enabled.forEach(s=>{s.disabled=true;});
  try {
    const targets=new Set([document.documentElement,document.body].filter(Boolean));
    const levels=[];
    for(const x of [0.2,0.5,0.8]) for(const y of [0.2,0.5,0.8]) {
      let node=document.elementFromPoint(innerWidth*x,innerHeight*y);
      if(!node)continue;
      if(node.closest('img,video,canvas,svg,iframe')) node=node.parentElement;
      if(!node)continue;
      levels.push(luminance(background(node)));
      // Observe a bounded set of representative wrapper attributes, not all DOM.
      for(let p=node,depth=0;p && depth<6;p=p.parentElement,depth++) {
        if(targets.has(p))continue;
        const box=p.getBoundingClientRect();
        // Tiny cards/cells changing color are content updates, not a site-wide
        // theme switch. Watch large containers and roots instead.
        if(box.width*box.height>=innerWidth*innerHeight*0.2)targets.add(p);
      }
    }
    if(!levels.length)levels.push(luminance(background(document.body||document.documentElement)));
    const darkFraction=levels.filter(v=>v<0.18).length/levels.length;
    const lightFraction=levels.filter(v=>v>0.3).length/levels.length;
    const nativeDark=previous ? lightFraction<0.55 : darkFraction>=0.7;
    return {nativeDark,targets};
  } finally {enabled.forEach(s=>{s.disabled=false;});}
}

export function themeWatcher(onChange,targets) {
  let timer,stopped=false;
  const schedule=()=>{if(!stopped && !timer)timer=setTimeout(()=>{timer=0;if(!document.hidden)onChange();},160);};
  const signatures=new WeakMap();
  const signature=node=>[...node.attributes].filter(a=>!a.name.startsWith('data-lumashift')&&a.name!=='style').map(a=>`${a.name}:${a.value}`).join('|')+'|'+[...node.style].filter(p=>!p.startsWith('--luma-')).map(p=>`${p}:${node.style.getPropertyValue(p)}`).join(';');
  const observer=new MutationObserver(records=>{
    if(records.some(r=>{if(r.type==='childList')return [...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1 && !n.hasAttribute('data-lumashift'));const value=signature(r.target);if(value===signatures.get(r.target))return false;signatures.set(r.target,value);return true;}))schedule();
  });
  targets.forEach(node=>{signatures.set(node,signature(node));observer.observe(node,{attributes:true,childList:true,attributeFilter:['class','style','data-theme','data-color-mode','data-dark-mode','theme','color-scheme']});});
  const head=new MutationObserver(records=>{
    if(records.some(r=>{
      const element=r.target.nodeType===1?r.target:r.target.parentElement;
      if(element?.closest('[data-lumashift]'))return false;
      if(r.type==='childList')return [...r.addedNodes,...r.removedNodes].some(n=>!(n.nodeType===1 && n.hasAttribute('data-lumashift')));
      return true;
    }))schedule();
  });
  if(document.head) head.observe(document.head,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','media','disabled']});
  const visible=()=>{if(!document.hidden)schedule();};
  const scheme=matchMedia('(prefers-color-scheme: dark)');
  for(const event of ['popstate','hashchange','resize','pageshow'])window.addEventListener(event,schedule);
  document.addEventListener('visibilitychange',visible);
  document.addEventListener('load',schedule,true);
  // CSSOM edits produce a non-bubbling upstream event. Capture it at document.
  document.addEventListener('__lumashift_sheet',schedule,true);
  document.addEventListener('click',schedule,true);
  scheme.addEventListener('change',schedule);
  return ()=>{
    stopped=true;clearTimeout(timer);observer.disconnect();head.disconnect();
    for(const event of ['popstate','hashchange','resize','pageshow'])window.removeEventListener(event,schedule);
    document.removeEventListener('visibilitychange',visible);document.removeEventListener('load',schedule,true);
    document.removeEventListener('__lumashift_sheet',schedule,true);document.removeEventListener('click',schedule,true);scheme.removeEventListener('change',schedule);
  };
}

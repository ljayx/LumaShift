import {luminance} from './settings.js';
import {splitCSS} from './declarations.js';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smoothstep=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
export function toHSL([r,g,b]) {
  r/=255;g/=255;b/=255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
  if(!d)return [0,0,l];
  const h=(max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)/6;
  return [h,d/(1-Math.abs(2*l-1)),l];
}
export function fromHSL([h,s,l]) {
  const a=s*Math.min(l,1-l);
  return [0,8,4].map(n=>{const k=(n+h*12)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));});
}
export function parseSimple(value) {
  const hex=value.match(/^#([a-f\d]{3,8})$/i);
  if(hex) {
    let v=hex[1];if(v.length===3||v.length===4)v=[...v].map(x=>x+x).join('');
    if(v.length!==6 && v.length!==8)return null;
    return [0,2,4].map(i=>parseInt(v.slice(i,i+2),16)).concat(v.length===8?parseInt(v.slice(6),16)/255:1);
  }
  const rgb=value.match(/^rgba?\(([^)]+)\)$/i);
  if(rgb) {
    const pieces=rgb[1].split(/[,/\s]+/).filter(Boolean);
    if(pieces.length<3 || pieces.some(v=>!/^[-\d.]+%?$/.test(v)))return null;
    return pieces.slice(0,3).map(v=>clamp(parseFloat(v)*(v.endsWith('%')?2.55:1),0,255)).concat(pieces[3]?clamp(parseFloat(pieces[3])/(pieces[3].endsWith('%')?100:1)):1);
  }
  return null;
}

export function createPalette(background,text,parseFallback=()=>null) {
  const bg=parseSimple(background),fg=parseSimple(text);
  const [bh,bs,bl]=toHSL(bg),[th,ts,tl]=toHSL(fg);
  const cache=new Map();
  // Pure-black themes need more lift for the same visible separation.
  const surfaceRange=0.13+0.05*(1-smoothstep(0,0.12,bl));
  const surfacePeak=surfaceRange*(1-Math.exp(-8));
  const textBackdrop=Math.max(luminance(bg),luminance(fromHSL([bh,bs,clamp(bl+surfacePeak)])));
  const backgroundColor=(color,h,s,l)=>{
    // Keep white anchored to the user's background. Expand the compressed
    // near-white surface range continuously, with a bounded lift so mid-gray
    // panels do not become bright. Join the dark half at the same midpoint.
    const lift=l>=0.5?surfaceRange*(1-Math.exp(-16*(1-l))):-0.035+(surfacePeak+0.035)*(2*l)**2;
    const neutral=fromHSL([bh,bs,clamp(bl+lift)]);
    // Pale semantic fills can have high HSL saturation but few RGB steps of
    // chroma. Fade their hue in instead of abruptly treating them as gray at
    // a fixed lightness/chroma threshold (which also breaks gradients).
    const chroma=Math.max(...color.slice(0,3))-Math.min(...color.slice(0,3));
    const tint=smoothstep(4,24,chroma)*smoothstep(0.08,0.4,s);
    let colored=fromHSL([h,Math.min(s,0.65),clamp(l>0.45?0.21+(1-l)*0.2:l,0.06,0.34)]);
    // HSL lightness is not perceived brightness: pale yellow can otherwise
    // become much brighter than blue and swallow colored links. Bound pale
    // fills by the neutral surface's luminance, blending in the limit smoothly.
    const level=luminance(colored),limit=luminance(neutral);
    const scale=1-smoothstep(0.6,0.8,l)*(1-Math.min(1,limit/level));
    if(scale<1)colored=colored.map(v=>{
      const c=v/255,linear=(c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4)*scale;
      return Math.round(255*(linear<=0.0031308?12.92*linear:1.055*linear**(1/2.4)-0.055));
    });
    return neutral.map((v,i)=>Math.round(v+(colored[i]-v)*tint));
  };
  const map=(token,role)=>{
    const key=`${role}:${token}`;
    if(cache.has(key))return cache.get(key);
    const color=parseSimple(token)||parseFallback(token);
    if(!color || color[3]===0)return token;
    const [h,s,l]=toHSL(color);
    const neutral=s<0.16 || Math.max(...color.slice(0,3))-Math.min(...color.slice(0,3))<50 || l>0.93 || l<0.035;
    let out;
    if(role==='bg') {
      out=backgroundColor(color,h,s,l);
    } else if(role==='text') {
      out=neutral?fromHSL([th,ts,clamp(tl-(l<0.65?l*0.28:0.035))]):fromHSL([h,clamp(s,0.35,0.9),clamp(l,0.64,0.8)]);
      // Respect deliberately low-contrast user themes. Otherwise protect text
      // on raised neutral and pale semantic surfaces, not only on the page.
      if((luminance(fg)+0.05)/(luminance(bg)+0.05)>=4.5) {
        let [oh,os,ol]=toHSL(out);
        while((luminance(out)+0.05)/(textBackdrop+0.05)<4.5 && ol<0.94) {ol+=0.02;out=fromHSL([oh,os,ol]);}
      }
    } else if(role==='border') out=neutral?fromHSL([bh,bs*0.6,clamp(bl+0.17+(1-l)*0.08)]):fromHSL([h,s*0.8,clamp(l,0.35,0.6)]);
    else out=[0,0,0];
    let alpha=role==='shadow'?Math.min(color[3],0.55):color[3];
    // A faint dark border on white loses almost all contrast when both its
    // RGB channels and the surface become dark. Use a lighter translucent ink;
    // fully transparent borders (layout placeholders) returned above stay clear.
    if(role==='border' && alpha<1 && luminance(fg)>luminance(bg)) {
      out=out.map((v,i)=>Math.round(v*alpha+fg[i]*(1-alpha)));
      alpha=Math.max(alpha,0.24);
    }
    const result=alpha<1?`rgba(${out.join(', ')}, ${+alpha.toFixed(3)})`:`rgb(${out.join(', ')})`;
    cache.set(key,result);if(cache.size>2048)cache.delete(cache.keys().next().value);
    return result;
  };
  const functionNames=new Set(['rgb','rgba','hsl','hsla','hwb','lab','lch','oklab','oklch','color']);
  // Tokenize CSS without touching URLs, strings, variable identifiers, or images.
  function rewrite(value,role) {
    let output='',i=0;
    while(i<value.length) {
      const rest=value.slice(i);
      if(value[i]==='"'||value[i]==="'") {let j=i+1;while(j<value.length){if(value[j]==='\\'){j+=2;continue;}if(value[j++]===value[i])break;}output+=value.slice(i,j);i=j;continue;}
      const hash=rest.match(/^#[a-f\d]{3,8}\b/i);
      if(hash){output+=map(hash[0],role);i+=hash[0].length;continue;}
      const word=rest.match(/^[a-z_-][a-z\d_-]*/i);
      if(word) {
        const name=word[0],lower=name.toLowerCase();let end=i+name.length;
        if(value[end]==='(') {
          let depth=1,j=end+1,quote='';
          for(;j<value.length && depth;j++){const c=value[j];if(quote){if(c==='\\')j++;else if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='(')depth++;else if(c===')')depth--;}
          const body=value.slice(end+1,j-1),whole=value.slice(i,j);
          if(lower==='url')output+=whole;
          else if(lower==='var') {
            const match=body.match(/^\s*(--[\w-]+)\s*(?:,([\s\S]*))?$/);
            output+=match?`var(--luma-${role}-${match[1].slice(2)}, ${match[2]?rewrite(match[2],role):`var(${match[1]})`})`:whole;
          } else if(functionNames.has(lower)) {
            if(/var\(/i.test(body) && /^rgba?$/.test(lower)) {
              const alpha=body.match(/^([\d.%\s,]+?)\s*[,/]\s*(var\([\s\S]+\))$/i);
              const channels=alpha && parseSimple(`rgb(${alpha[1]})`);
              if(channels) {
                const mapped=parseSimple(map(`rgb(${alpha[1]})`,role));
                output=`${output}rgba(${mapped.slice(0,3).join(', ')}, ${alpha[2]})`;
              } else output+=`${name}(${rewrite(body,role)})`;
            } else output+=map(whole,role);
          }
          else output+=`${name}(${rewrite(body,role)})`;
          i=j;continue;
        }
        output+=name.startsWith('--')?name:map(name,role);i=end;continue;
      }
      output+=value[i++];
    }
    return output;
  }
  const variable=(value,role)=>{
    const tokens=value.trim().split(/[,\s]+/);
    if(tokens.length===3 && tokens.every(v=>/^\d+(?:\.\d+)?%?$/.test(v)) && parseSimple(`rgb(${value})`)) {
      const mapped=parseSimple(map(`rgb(${value})`,role));return mapped.slice(0,3).join(value.includes(',')?', ':' ');
    }
    return rewrite(value,role);
  };
  const shadow=value=>splitCSS(value,',').map(part=>{
    // Zero-blur shadows are commonly separators or focus rings. Keep soft
    // elevation shadows dark, but map these hard edges like borders.
    const lengths=part.replace(/(?:rgba?|hsla?|var|calc)\([^)]*\)/gi,'').match(/(?<![\w#.-])-?(?:\d*\.)?\d+(?:px|em|rem)?(?![\w.-])/g)||[];
    const edge=lengths.length>=2 && (lengths.length===2 || parseFloat(lengths[2])===0);
    return rewrite(part,edge?'border':'shadow');
  }).join(',');
  return {map,rewrite,variable,shadow};
}

export function propertyRole(property) {
  if(property==='color'||property==='fill'||property==='stroke'||property==='stop-color'||property==='caret-color'||property==='text-decoration-color'||property==='-webkit-text-fill-color')return 'text';
  if(property==='background'||property==='background-color'||property==='background-image')return 'bg';
  if(property==='box-shadow'||property==='text-shadow')return 'shadow';
  if(/^(border|outline)(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/.test(property))return 'border';
  return null;
}

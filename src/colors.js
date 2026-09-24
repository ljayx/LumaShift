import {luminance} from './settings.js';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
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
  const map=(token,role)=>{
    const key=`${role}:${token}`;
    if(cache.has(key))return cache.get(key);
    const color=parseSimple(token)||parseFallback(token);
    if(!color || color[3]===0)return token;
    const [h,s,l]=toHSL(color);
    const neutral=s<0.16 || Math.max(...color.slice(0,3))-Math.min(...color.slice(0,3))<50 || l>0.93 || l<0.035;
    let out;
    if(role==='bg') {
      if(l>0.999)out=bg.slice(0,3);
      else if(neutral || (l>0.8 && s<0.55)) out=fromHSL([bh,bs,clamp(bl+(l>=0.5?(1-l)*0.16:l*0.18-0.035))]);
      else out=fromHSL([h,Math.min(s,0.65),clamp(l>0.45?0.21+(1-l)*0.2:l,0.06,0.34)]);
    } else if(role==='text') {
      out=neutral?fromHSL([th,ts,clamp(tl-(l<0.65?l*0.28:0.035))]):fromHSL([h,clamp(s,0.35,0.9),clamp(l,0.64,0.8)]);
      // Respect deliberately low-contrast user themes. Otherwise protect body text.
      if((luminance(fg)+0.05)/(luminance(bg)+0.05)>=4.5) {
        let [oh,os,ol]=toHSL(out);
        while((luminance(out)+0.05)/(luminance(bg)+0.05)<4.5 && ol<0.94) {ol+=0.02;out=fromHSL([oh,os,ol]);}
      }
    } else if(role==='border') out=neutral?fromHSL([bh,bs*0.6,clamp(bl+0.17+(1-l)*0.08)]):fromHSL([h,s*0.8,clamp(l,0.35,0.6)]);
    else out=[0,0,0];
    const alpha=role==='shadow'?Math.min(color[3],0.55):color[3];
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
  return {map,rewrite,variable};
}

export function propertyRole(property) {
  if(property==='color'||property==='fill'||property==='stroke'||property==='caret-color'||property==='text-decoration-color'||property==='-webkit-text-fill-color')return 'text';
  if(property==='background'||property==='background-color'||property==='background-image')return 'bg';
  if(property==='box-shadow'||property==='text-shadow')return 'shadow';
  if(/^(border|outline)(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/.test(property))return 'border';
  return null;
}

// CSSOM loses the tokens of a partially overridden var() shorthand. Retain
// authored declaration text when available. Split only at top level.
export function splitCSS(value, separator=';') {
  const parts=[];let start=0,depth=0,quote='';
  for(let i=0;i<value.length;i++) {
    const c=value[i];
    if(c==='\\'){i++;continue;}
    if(quote){if(c===quote)quote='';continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='/'&&value[i+1]==='*'){const end=value.indexOf('*/',i+2);i=end<0?value.length:end+1;continue;}
    if('([{'.includes(c))depth++;
    else if(')]}'.includes(c))depth--;
    else if(c===separator && depth===0){parts.push(value.slice(start,i));start=i+1;}
  }
  parts.push(value.slice(start));return parts;
}

export function declarations(style, source) {
  if(source===undefined) {
    const values=[...style].map(property=>({property,value:style.getPropertyValue(property),priority:style.getPropertyPriority(property)}));
    if(values.every(({value})=>value))return values;
    source=style.cssText;
  }
  return splitCSS(source).flatMap(raw=>{
    // Comments can precede a property, but comment-like text in a quoted URL
    // or string is data and must not be removed.
    let clean='',quote='';
    for(let i=0;i<raw.length;i++) {
      const c=raw[i];
      if(c==='\\'){clean+=raw.slice(i,i+2);i++;continue;}
      if(quote){clean+=c;if(c===quote)quote='';continue;}
      if(c==='"'||c==="'"){quote=c;clean+=c;continue;}
      if(c==='/'&&raw[i+1]==='*'){const end=raw.indexOf('*/',i+2);i=end<0?raw.length:end+1;clean+=' ';continue;}
      clean+=c;
    }
    raw=clean.trim();
    const colon=raw.indexOf(':');if(colon<0)return [];
    const property=raw.slice(0,colon).trim(),value=raw.slice(colon+1).trim();
    if(!/^(?:--[\w-]+|[a-z-]+)$/i.test(property))return [];
    const priority=/\s*!important\s*$/i.test(value)?'important':'';
    return [{property,value:priority?value.replace(/\s*!important\s*$/i,'').trim():value,priority}];
  });
}

// Walk authored rule blocks without treating braces in strings, URLs or
// custom-property values as rule boundaries. The browser still parses CSS;
// this only supplies source tokens missing from its CSSOM serialization.
export function ruleBlocks(source) {
  const blocks=[];let start=0,open=-1,depth=0,parens=0,quote='';
  for(let i=0;i<source.length;i++) {
    const c=source[i];
    if(c==='\\'){i++;continue;}
    if(quote){if(c===quote)quote='';continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);i=end<0?source.length:end+1;continue;}
    if(c==='('||c==='[')parens++;
    else if(c===')'||c===']')parens--;
    else if(!parens) {
      if(c==='{'){if(depth++===0)open=i;}
      else if(c==='}'&&--depth===0){blocks.push({header:source.slice(start,open).trim(),body:source.slice(open+1,i)});start=i+1;}
      else if(c===';'&&depth===0)start=i+1;
    }
  }
  return blocks;
}

export function sourceDeclarations(source, rules) {
  const result=new Map();
  if(!source.includes('var('))return result;
  // One detached parse per sheet, not per selector or per matched element.
  if(!rules){const sheet=new CSSStyleSheet();sheet.replaceSync(source);rules=sheet.cssRules;}
  const normalize=header=>header.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s*([>+~,:()[\]=])\s*/g,'$1').trim();
  function visit(rules,blocks) {
    let position=0;const headers=blocks.map(block=>normalize(block.header));
    for(const rule of rules) {
      if(!rule.cssText.includes('{'))continue;
      const header=normalize(rule.selectorText||rule.cssText.slice(0,rule.cssText.indexOf('{')));
      // Chromium drops unsupported selectors (e.g. Firefox pseudo-elements).
      // Match surviving headers in source order rather than aligning indexes.
      const index=headers.indexOf(header,position);
      if(index<0)continue;
      const block=blocks[index];position=index+1;
      if(rule.style && [...rule.style].some(p=>!rule.style.getPropertyValue(p))) {
        // Validate the whole rule with the browser before using authored data.
        const check=new CSSStyleSheet();check.replaceSync(`${block.header}{${block.body}}`);
        if(check.cssRules[0]?.cssText===rule.cssText) {
          const key=rule.cssText,values=result.get(key)||[];
          values.push(block.body);result.set(key,values);
        }
      }
      if(rule.cssRules?.length)visit(rule.cssRules,ruleBlocks(block.body));
    }
  }
  visit(rules,ruleBlocks(source));return result;
}

export function hasPendingColors(rules) {
  return [...rules].some(rule=>rule.style && [...rule.style].some(p=>/^(background|border)/.test(p) && !rule.style.getPropertyValue(p)) || rule.cssRules && hasPendingColors(rule.cssRules));
}

// Many dividers and navigation ticks are narrow background-painted boxes,
// including pseudo elements. Classify declared dimensions without DOM scans
// or layout reads; zero-sized/hidden boxes are not visible separators.
export function isThinPaint(style) {
  return ['height','width','block-size','inline-size'].some(property=>{
    const value=style.getPropertyValue(property).trim().match(/^(\d*\.?\d+)(px|rem|em)$/);
    return value && +value[1]>0 && +value[1]<=(value[2]==='px'?3:.2);
  });
}

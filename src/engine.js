import {createPalette,parseSimple,propertyRole} from './colors.js';
import {declarations,sourceDeclarations,hasPendingColors,isThinPaint} from './declarations.js';

const marker='data-lumashift';
const roles=['bg','text','border','shadow'];
const inlineAttribute='data-lumashift-inline';
const variableShorthands=['background','border','border-top','border-right','border-bottom','border-left','border-block','border-inline','border-block-start','border-block-end','border-inline-start','border-inline-end','outline'];
const inlineProperties=['color',...variableShorthands,'background-color','background-image','background-position','background-position-x','background-position-y','background-size','background-repeat','background-attachment','background-origin','background-clip','border-color',...['top','right','bottom','left','block','inline','block-start','block-end','inline-start','inline-end'].flatMap(side=>['color','width','style'].map(kind=>`border-${side}-${kind}`)),'border-width','border-style','outline-color','outline-width','outline-style','box-shadow','text-shadow','fill','stroke','stop-color','caret-color','text-decoration-color','-webkit-text-fill-color'];
const svgProperties=['fill','stroke','stop-color','color'];
const svgSelector='svg,[fill],[stroke],[stop-color]';
const svgProtected='mask,clipPath,filter';
// Presentation attributes have zero specificity and precede author CSS. Do
// not force them over stylesheet/hover rules or rewrite mask luminance.
const svgRules=svgProperties.map(p=>`:where([${inlineAttribute}~="svg-${p}"]){${p}:var(--luma-svg-${p})}`).join('\n');
const inlineRules=inlineProperties.map(p=>`[${inlineAttribute}~="${p}"]{${p}:var(--luma-inline-${p})!important}`).join('\n');
const legacyRules=`:where([${inlineAttribute}~="legacy-bg"]){background-color:var(--luma-legacy-bg)}:where([${inlineAttribute}~="legacy-text"]){color:var(--luma-legacy-text)}`;

export class ThemeEngine {
  constructor(fetchCSS) {
    this.fetchCSS=fetchCSS;this.active=false;this.roots=new Map();this.managers=new Map();this.inlines=new Map();this.pending=new Map();this.generated=new Set();this.epoch=0;this.failed=new Set();
  }
  makeStyle(root,text='') {
    const style=document.createElement('style');style.setAttribute(marker,'');style.textContent=text;
    (root===document?document.head||document.documentElement:root).append(style);
    return style;
  }
  enable(settings) {
    if(this.active && this.key===`${settings.background}/${settings.text}`)return;
    if(this.active)this.disable();
    this.active=true;this.epoch++;this.key=`${settings.background}/${settings.text}`;this.settings=settings;
    const context=new OffscreenCanvas(1,1).getContext('2d',{willReadFrequently:true});
    this.palette=createPalette(settings.background,settings.text,value=>{
      if(!CSS.supports('color',value) || /var\(|currentcolor/i.test(value) || /^(inherit|initial|unset|revert|transparent)$/i.test(value))return null;
      context.fillStyle='#010203';context.fillStyle=value;
      const simple=parseSimple(context.fillStyle);if(simple)return simple;
      context.clearRect(0,0,1,1);context.fillRect(0,0,1,1);const bytes=context.getImageData(0,0,1,1).data;return [...bytes.slice(0,3),bytes[3]/255];
    });
    this.addRoot(document);
    this.sheetChanged=event=>{
      if(event.target?.hasAttribute?.(marker))return;
      if(event.target?.matches?.('style,link[rel~=stylesheet]'))this.enqueue(event.target,'sheet');
      else {for(const [source,manager] of this.managers) {if(source instanceof CSSStyleSheet || source.sheet)this.enqueue(source,'sheet');}}
    };
    this.shadowAttached=event=>{if(event.target.shadowRoot)this.addRoot(event.target.shadowRoot);};
    document.addEventListener('__lumashift_sheet',this.sheetChanged,true);
    document.addEventListener('__lumashift_shadow',this.shadowAttached,true);
    this.onVisibility=()=>{if(!document.hidden && this.pending.size)this.schedule();};
    document.addEventListener('visibilitychange',this.onVisibility);
    document.dispatchEvent(new Event('__lumashift_start'));
    // Initial styles are processed before the first queued DOM scan.
    this.flush();
  }
  addRoot(root) {
    if(this.roots.has(root)||!this.active)return;
    const {background,text}=this.settings;
    const base=this.makeStyle(root,(root===document?`html{background:${background};color:${text};color-scheme:dark}body{background:${background};color:${text}}`:'')+`:where(a:link){color:${this.palette.map('#0000ee','text')}}:where(a:visited){color:${this.palette.map('#551a8b','text')}}:where(svg){fill:currentColor}input,textarea,select,button{background-color:${background};color:${text};border-color:#526071}::selection{background:#34547b;color:${text}}\n${inlineRules}\n${legacyRules}\n${svgRules}`);
    // Low-priority defaults must precede website rules and their generated twins.
    base.parentNode.insertBefore(base,base.parentNode.firstChild);
    this.generated.add(base.sheet);
    const observer=new MutationObserver(records=>this.mutations(records));
    observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','href','media','disabled','bgcolor','color','text','fill','stroke','stop-color']});
    this.roots.set(root,{base,observer});
    for(const source of root.querySelectorAll('style:not([data-lumashift]),link[rel~=stylesheet]'))this.processSheet(source);
    for(const source of [...root.adoptedStyleSheets||[]])if(!this.generated.has(source))this.processSheet(source,root);
    this.enqueue(root,'scan');
  }
  enqueue(node,kind) {
    if(!this.active)return;
    this.pending.set(node,kind);this.schedule();
  }
  schedule() {
    if(this.timer)return;
    this.timer=setTimeout(()=>{this.timer=0;this.flush();},document.hidden?100:0);
  }
  flush() {
    if(!this.active)return;
    clearTimeout(this.timer);this.timer=0;
    const start=performance.now();
    for(const [node,kind] of this.pending) {
      this.pending.delete(node);
      if(kind==='sheet')this.processSheet(node);
      else if(kind==='inline') {if(node.isConnected)this.processInline(node);}
      else if(kind==='scan')this.scan(node);
      else if(kind==='walk') {
        let next;
        while((next=node.nextNode())) {
          this.scanOne(next);
          if(performance.now()-start>6) {this.pending.set(node,'walk');break;}
        }
      }
      if(performance.now()-start>6)break;
    }
    this.prune();
    if(this.pending.size)this.schedule();
  }
  scan(node) {
    if(node.nodeType===1)this.scanOne(node);
    if(!node.isConnected && node!==document)return;
    this.pending.set(document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT),'walk');
  }
  scanOne(node) {
    if(node.hasAttribute(marker))return;
    if(node.matches('style,link[rel~=stylesheet]'))this.processSheet(node);
    if(node.hasAttribute('style')||node.hasAttribute('bgcolor')||node.matches(`font[color],body[text],${svgSelector}`))this.processInline(node);
    if(node.shadowRoot)this.addRoot(node.shadowRoot);
  }
  mutations(records) {
    const touched=new Set();
    for(const record of records) {
      const node=record.target.nodeType===1?record.target:record.target.parentElement;
      if(node?.hasAttribute(marker))continue;
      if(record.type==='attributes') {
        if(['style','bgcolor','color','text',...svgProperties].includes(record.attributeName)) {
          if(touched.has(node))continue;touched.add(node);
          const entry=this.inlines.get(node);
          if(!entry || record.attributeName!=='style' || this.inlineSignature(node)!==entry.signature)this.enqueue(node,'inline');
        } else if(node.matches('link,style'))this.enqueue(node,'sheet');
      } else if(node?.tagName==='STYLE')this.enqueue(node,'sheet');
      else for(const added of record.addedNodes)if(added.nodeType===1 && !added.hasAttribute(marker))this.enqueue(added,'scan');
    }
    if(records.some(r=>r.removedNodes.length))this.schedule();
    // Apply a bounded batch before the next paint. A separate timer for every
    // foreground inline update otherwise makes the browser recalculate styles
    // once for the site and again for our override in a later rendering turn.
    if(!document.hidden && this.pending.size)this.flush();
  }
  inlineSignature(node) {
    // Store our final serialized attribute, so self-generated mutations take
    // one DOM read instead of rebuilding arrays and visiting every declaration.
    return node.getAttribute('style')||'';
  }
  legacySignature(node) {
    return ['bgcolor','text',...svgProperties].map(p=>node.getAttribute(p)||'').join('|');
  }
  declarations(style,baseURL,source) {
    const parts=[],shorthands=[];
    const thin=isThinPaint(style);
    for(const {property,value,priority:importance} of declarations(style,source)) {
      if(property.startsWith('--luma-'))continue;
      const priority=importance?'!important':'';
      if(property.startsWith('--')) {
        // Duplicate variable declarations per use role, preserving their scope.
        for(const role of roles) {const next=this.palette.variable(value,role);if(next!==value)parts.push(`--luma-${role}-${property.slice(2)}:${next}${priority}`);}
      } else {
        const role=propertyRole(property)==='bg'&&thin?'border':propertyRole(property);
        const preservesShorthand=shorthands.some(p=>property.startsWith(p+'-'));
        if(!role && !preservesShorthand)continue;
        let next=property==='box-shadow'?this.palette.shadow(value):role?this.palette.rewrite(value,role):value;
        if(next!==value || preservesShorthand) {
          if(baseURL)next=next.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g,(whole,quote,url)=>{try{return `url("${new URL(url,baseURL).href}")`;}catch{return whole;}});
          parts.push(`${property}:${next}${priority}`);
          if(variableShorthands.includes(property))shorthands.push(property);
        }
      }
    }
    return parts.join(';');
  }
  rules(rules,depth=0,sources=new Map()) {
    if(depth>12)return '';
    const out=[];
    for(const rule of rules) {
      if(rule.type===CSSRule.STYLE_RULE) {
        const authored=sources.get(rule.cssText)?.shift();
        const declaration=this.declarations(rule.style,rule.parentStyleSheet?.href,authored);
        const nested=rule.cssRules?.length?this.rules(rule.cssRules,depth+1,sources):'';
        if(declaration||nested)out.push(`${rule.selectorText}{${declaration}${nested?';'+nested:''}}`);
      } else if(rule.type===CSSRule.IMPORT_RULE) {
        try {const content=this.rules(rule.styleSheet.cssRules,depth+1);out.push(rule.media.mediaText?`@media ${rule.media.mediaText}{${content}}`:content);} catch {this.failed.add('import');}
      } else if(rule.cssRules && rule.type!==CSSRule.KEYFRAMES_RULE) {
        const inner=this.rules(rule.cssRules,depth+1,sources);if(inner)out.push(`${rule.cssText.slice(0,rule.cssText.indexOf('{'))}{${inner}}`);
      }
    }
    return out.join('\n');
  }
  sources(manager,text='') {
    if(manager.sourceText!==text){manager.sourceText=text;manager.sources=sourceDeclarations(text);}
    return new Map([...manager.sources||[]].map(([key,values])=>[key,[...values]]));
  }
  processSheet(source,adoptedRoot) {
    if(!this.active || source.hasAttribute?.(marker) || this.generated.has(source))return;
    const adopted=source instanceof CSSStyleSheet;
    const root=adoptedRoot||this.managers.get(source)?.root||source.getRootNode?.();
    if(!root || (!adopted && !source.isConnected))return;
    if(!this.roots.has(root))return;
    let manager=this.managers.get(source);
    if(!manager) {
      let output;
      if(adopted) {
        const generated=new CSSStyleSheet();let text='';
        output={sheet:generated,get textContent(){return text;},set textContent(value){text=value;generated.replaceSync(':root{--lumashift-sheet:1}\n'+value);},remove:()=>{root.adoptedStyleSheets=root.adoptedStyleSheets.filter(s=>s!==generated);}};
        const sheets=[...root.adoptedStyleSheets];sheets.splice(sheets.indexOf(source)+1,0,generated);root.adoptedStyleSheets=sheets;
      } else output=this.makeStyle(root);
      manager={root,output,version:0};this.managers.set(source,manager);
      this.generated.add(manager.output.sheet);
      if(!adopted) {
        source.after(manager.output);
        manager.load=()=>this.enqueue(source,'sheet');source.addEventListener('load',manager.load);
      }
    }
    if(!adopted) {
      if(manager.output.previousSibling!==source)source.after(manager.output);
      manager.output.media=source.media||'';
      manager.output.disabled=source.disabled||false;
    }
    const sheet=adopted?source:source.sheet;
    if(!sheet)return;
    ++manager.version;
    if(manager.sourceHref!==source.href){manager.sourceHref=source.href;manager.sourceText=undefined;manager.sources=undefined;}
    try {
      const css=this.rules(sheet.cssRules,0,this.sources(manager,source.tagName==='STYLE'?source.textContent:manager.sourceText));
      if(manager.output.textContent!==css)manager.output.textContent=css;this.generated.add(manager.output.sheet);
      // Same-origin sheets expose CSSOM too, but it still loses partially
      // overridden var() shorthands. Fetch source only when recovery is needed.
      if(!source.href || manager.sourceText || !hasPendingColors(sheet.cssRules))return;
    } catch { /* Cross-origin CSSOM needs the same source fetch below. */ }
    {
      if(!source.href || manager.fetching)return;
      manager.fetching=true;const epoch=this.epoch;
      const href=source.href;
      this.fetchCSS(href).then(text=>{
        if(!this.active || this.epoch!==epoch || !source.isConnected)return;
        if(source.href!==href){manager.fetching=false;this.enqueue(source,'sheet');return;}
        const parsed=new CSSStyleSheet();
        // CSSStyleSheet.replaceSync ignores @import; record that boundary.
        if(/@import\b/i.test(text))this.failed.add('cross-origin-import');
        const absolute=text.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g,(whole,quote,url)=>{try{return `url("${new URL(url,source.href).href}")`;}catch{return whole;}});
        parsed.replaceSync(absolute);manager.sourceText=absolute;manager.sources=sourceDeclarations(absolute,parsed.cssRules);
        manager.output.textContent=this.rules(parsed.cssRules,0,this.sources(manager,absolute));this.generated.add(manager.output.sheet);
      }).catch(()=>this.failed.add('stylesheet')).finally(()=>{manager.fetching=false;});
    }
  }
  processInline(node) {
    if(!node.style || node.hasAttribute(marker))return;
    const old=this.inlines.get(node);
    if(old && old.signature===this.inlineSignature(node) && old.legacy===this.legacySignature(node))return;
    // Diff generated declarations in place. Removing/readding every attribute on
    // every mutation multiplies style invalidation on frequently updating pages.
    const tokens=[],important=new Map(),generated=new Map();
    const protectedSVG=node.namespaceURI==='http://www.w3.org/2000/svg' && node.closest(svgProtected);
    if(node.namespaceURI==='http://www.w3.org/2000/svg')for(const property of svgProperties) {
      if(!node.hasAttribute(property))continue;
      const original=node.getAttribute(property);
      const mapped=protectedSVG?original:this.palette.rewrite(original,'text');
      // Even none/currentColor must retain precedence over the SVG default.
      tokens.push(`svg-${property}`);generated.set(`--luma-svg-${property}`,mapped);
    }
    const legacy=[['bgcolor','bg'],[node.tagName==='BODY'?'text':node.tagName==='FONT'?'color':'','text']];
    for(const [attribute,role] of legacy)if(attribute && node.hasAttribute(attribute)) {
      let original=node.getAttribute(attribute).trim();if(/^[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(original))original='#'+original;
      const mapped=this.palette.map(original,role);
      if(mapped!==original){tokens.push(`legacy-${role}`);generated.set(`--luma-legacy-${role}`,mapped);}
    }
    const source=old?.signature===this.inlineSignature(node)?old.source:node.getAttribute('style')||'';
    const pending=[...node.style].some(p=>/^(background|border)/.test(p) && !node.style.getPropertyValue(p));
    const thin=isThinPaint(node.style);
    for(const {property,value:raw,priority} of declarations(node.style,pending?source:undefined)) {
      if(old?.generated.has(property)||property.startsWith('--luma-'))continue;
      let value=raw;
      const previous=old?.important.get(property);
      if(previous && value===previous.applied && node.style.getPropertyPriority(property)==='important')value=previous.original;
      if(property.startsWith('--')) {
        for(const role of roles) {const next=this.palette.variable(value,role);if(next!==value)generated.set(`--luma-${role}-${property.slice(2)}`,next);}
      } else if(inlineProperties.includes(property)) {
        if(protectedSVG && svgProperties.includes(property))continue;
        const role=propertyRole(property)==='bg'&&thin?'border':propertyRole(property);
        const next=property==='box-shadow'?this.palette.shadow(value):role?this.palette.rewrite(value,role):value;
        // Preserve trailing longhands when an unresolved shorthand is mapped.
        const shorthand=variableShorthands.find(p=>property.startsWith(p+'-') && tokens.includes(p));
        if(next===value && !shorthand)continue;
        if(priority==='important') {
          if(node.style.getPropertyValue(property)!==next)node.style.setProperty(property,next,'important');important.set(property,{original:value,applied:node.style.getPropertyValue(property)});
        } else {tokens.push(property);generated.set(`--luma-inline-${property}`,next);}
      }
    }
    const originals=new Map(old?.originals);
    for(const [property,applied] of old?.generated||[])if(!generated.has(property)) {
      if(node.style.getPropertyValue(property)===applied) {const original=originals.get(property);if(original?.value)node.style.setProperty(property,original.value,original.priority);else node.style.removeProperty(property);}originals.delete(property);
    }
    for(const [property,value] of generated) {
      if(!originals.has(property))originals.set(property,{value:node.style.getPropertyValue(property),priority:node.style.getPropertyPriority(property)});
      if(node.style.getPropertyValue(property)!==value)node.style.setProperty(property,value);
    }
    const attribute=tokens.join(' ');
    if(attribute){if(node.getAttribute(inlineAttribute)!==attribute)node.setAttribute(inlineAttribute,attribute);}else node.removeAttribute(inlineAttribute);
    if(generated.size||important.size)this.inlines.set(node,{signature:this.inlineSignature(node),legacy:this.legacySignature(node),source,important,generated,originals});
    else this.inlines.delete(node);
  }
  restoreInline(node,entry) {
    for(const [property,value] of entry.important)if(node.style.getPropertyValue(property)===value.applied && node.style.getPropertyPriority(property)==='important')node.style.setProperty(property,value.original,'important');
    for(const [property,applied] of entry.generated)if(node.style.getPropertyValue(property)===applied){const original=entry.originals.get(property);if(original?.value)node.style.setProperty(property,original.value,original.priority);else node.style.removeProperty(property);}
    node.removeAttribute(inlineAttribute);
  }
  prune() {
    // A component commonly sets shadowRoot.innerHTML immediately after
    // attachShadow(). That removes our freshly inserted base style as well.
    for(const [root,entry] of this.roots)if(!entry.base.isConnected && (root===document||root.host.isConnected)) {
      const parent=root===document?document.head||document.documentElement:root;
      parent.insertBefore(entry.base,parent.firstChild);
    }
    for(const [source,manager] of this.managers)if(source instanceof CSSStyleSheet?!manager.root.adoptedStyleSheets.includes(source):!source.isConnected) {manager.output.remove();source.removeEventListener?.('load',manager.load);this.managers.delete(source);}
    for(const [node,entry] of this.inlines)if(!node.isConnected){this.restoreInline(node,entry);this.inlines.delete(node);}
    for(const [root,entry] of this.roots)if(root!==document && !root.host.isConnected){entry.observer.disconnect();entry.base.remove();this.roots.delete(root);for(const [source,m] of this.managers)if(m.root===root){m.output.remove();source.removeEventListener?.('load',m.load);this.managers.delete(source);}}
    // Stylesheets replaced by textContent get new identities; retain only live ones.
    this.generated=new Set([...this.roots.values()].map(e=>e.base.sheet).concat([...this.managers.values()].map(e=>e.output.sheet)).filter(Boolean));
  }
  withOriginal(callback) {
    const sheets=[...this.generated].filter(s=>!s.disabled);
    const important=[];
    for(const [node,entry] of this.inlines)for(const [prop,value] of entry.important)if(node.style.getPropertyValue(prop)===value.applied && node.style.getPropertyPriority(prop)==='important'){important.push([node,prop,value]);node.style.setProperty(prop,value.original,'important');}
    sheets.forEach(s=>{s.disabled=true;});
    try{return callback();}finally{sheets.forEach(s=>{s.disabled=false;});for(const [node,p,v] of important)node.style.setProperty(p,v.applied,'important');}
  }
  disable() {
    this.active=false;this.epoch++;clearTimeout(this.timer);this.timer=0;
    document.dispatchEvent(new Event('__lumashift_stop'));
    document.removeEventListener('__lumashift_sheet',this.sheetChanged,true);
    document.removeEventListener('__lumashift_shadow',this.shadowAttached,true);
    document.removeEventListener('visibilitychange',this.onVisibility);
    for(const entry of this.roots.values())entry.observer.disconnect();
    for(const [node,entry] of this.inlines)this.restoreInline(node,entry);
    for(const [source,manager] of this.managers){manager.output.remove();source.removeEventListener?.('load',manager.load);}
    for(const entry of this.roots.values())entry.base.remove();
    this.roots.clear();this.managers.clear();this.inlines.clear();this.pending.clear();this.generated.clear();this.failed.clear();this.palette=null;
  }
}

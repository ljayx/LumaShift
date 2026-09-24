// Small page-world bridge. No privileges, fetches, site rules, or DOM polling.
// Enabled only while the transformation engine runs; restore only our own wrappers.
if(!window.__lumashiftProxyInstalled) {
  window.__lumashiftProxyInstalled=true;
  let cleanups=[];
  const event=(target=document)=>target.dispatchEvent(new Event('__lumashift_sheet',{bubbles:true}));
  const owned=sheet=>sheet?.ownerNode?.hasAttribute?.('data-lumashift') || (!sheet?.ownerNode && sheet?.cssRules?.[0]?.style?.getPropertyValue('--lumashift-sheet')==='1');
  const patch=(proto,key,factory)=>{
    const descriptor=Object.getOwnPropertyDescriptor(proto,key);
    if(!descriptor?.value)return;
    const wrapped=factory(descriptor.value);
    Object.defineProperty(proto,key,{...descriptor,value:wrapped});
    cleanups.push(()=>{if(Object.getOwnPropertyDescriptor(proto,key)?.value===wrapped)Object.defineProperty(proto,key,descriptor);});
  };
  const stop=()=>{for(const cleanup of cleanups)cleanup();cleanups=[];};
  document.addEventListener('__lumashift_stop',stop);
  document.addEventListener('__lumashift_start',()=>{
    if(cleanups.length)return;
    for(const key of ['insertRule','deleteRule','addRule','removeRule','replaceSync','replace'])patch(CSSStyleSheet.prototype,key,native=>function(...args){
      const result=Reflect.apply(native,this,args);
      if(!owned(this)) {if(result instanceof Promise)result.then(()=>event(this.ownerNode||document),()=>{});else event(this.ownerNode||document);}
      return result;
    });
    for(const key of ['setProperty','removeProperty'])patch(CSSStyleDeclaration.prototype,key,native=>function(...args){
      const result=Reflect.apply(native,this,args);const sheet=this.parentRule?.parentStyleSheet;
      if(sheet && !owned(sheet))event(sheet.ownerNode||document);return result;
    });
    patch(Element.prototype,'attachShadow',native=>function(...args){const root=Reflect.apply(native,this,args);if(root.mode==='open')this.dispatchEvent(new Event('__lumashift_shadow',{bubbles:true}));return root;});
  });
}

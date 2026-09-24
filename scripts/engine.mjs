import {readFile} from 'node:fs/promises';

// Version-pinned MV3 adaptation: package the upstream proxy as a MAIN-world
// content script instead of inserting an inline <script> into a site's CSP.
export async function engineSources() {
  const original = await readFile(new URL('../node_modules/darkreader/darkreader.js', import.meta.url), 'utf8');
  const source = original.replaceAll('\r\n', '\n');
  const start = source.indexOf('    function injectProxy(');
  const end = source.indexOf('    const definedCustomElements', start);
  const injectionStart = source.indexOf('        {\n            const proxyScript = createOrUpdateScript');
  const injectionEnd = source.indexOf('        const overrideStyle', injectionStart);
  if ([start, end, injectionStart, injectionEnd].some((v) => v < 0)) throw new Error('Dark Reader layout changed; review MV3 adaptation');
  const api = (source.slice(0, injectionStart) + '        document.dispatchEvent(new Event("__lumashift_proxy_start"));\n' + source.slice(injectionEnd)).replace('            nativeSendMessage.apply(chrome.runtime, args);','            return nativeSendMessage.apply(chrome.runtime, args);');
  let proxy = source.slice(start, end);
  // Never turn off a site's own theme plugin. Keep website-owned behavior intact.
  proxy = proxy.replace(/        function disableConflictingPlugins\(\) \{[\s\S]*?        function overrideProperty/, '        documentEventListener("__darkreader__cleanUp", cleanUp);\n        function overrideProperty');
  // Do not overwrite a property that a site changed while our wrapper was active.
  proxy = proxy.replace('() =>\n                Object.defineProperty(proto, prop, oldDescriptor)', '() => {\n                const current = Object.getOwnPropertyDescriptor(proto, prop);\n                if (current?.value === newDescriptor.value && current?.get === newDescriptor.get && current?.set === newDescriptor.set) Object.defineProperty(proto, prop, oldDescriptor);\n            }');
  return {
    api,
    proxy: `(() => { if (window.__lumashiftProxyInstalled) return; window.__lumashiftProxyInstalled = true;\n${proxy}\ndocument.addEventListener('__lumashift_proxy_start', () => injectProxy(false, true));\n})();\n`,
  };
}

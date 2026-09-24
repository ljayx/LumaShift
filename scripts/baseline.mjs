import {build} from 'esbuild';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {engineSources} from './engine.mjs';
export async function buildBaseline() {
  const output='.cache/darkreader-baseline';await mkdir(output,{recursive:true});
  const source=await engineSources();
  await writeFile(`${output}/upstream.cjs`,source.api);
  const adapter=`import * as DR from './upstream.cjs';
export class ThemeEngine {
 constructor(fetchCSS){this.active=false;this.failed=new Set();DR.setFetchMethod(async url=>new Response(await fetchCSS(url),{headers:{'Content-Type':'text/css'}}));}
 enable(settings){DR.enable({brightness:100,contrast:100,sepia:0,darkSchemeBackgroundColor:settings.background,darkSchemeTextColor:settings.text,styleSystemControls:true},{ignoreImageAnalysis:['*'],disableStyleSheetsProxy:true});this.active=true;}
 disable(){DR.disable();this.active=false;}
 withOriginal(callback){const sheets=[...document.querySelectorAll('style.darkreader')].map(s=>s.sheet).filter(s=>s&&!s.disabled);sheets.forEach(s=>s.disabled=true);try{return callback();}finally{sheets.forEach(s=>s.disabled=false);}}
}`;
  await writeFile(`${output}/adapter.js`,adapter);
  await build({entryPoints:['src/content.js'],outfile:`${output}/content.js`,bundle:true,minify:true,format:'iife',target:'chrome120',plugins:[{name:'baseline-only',setup(builder){builder.onResolve({filter:/^\.\/engine\.js$/},()=>({path:path.resolve(`${output}/adapter.js`)}));}}]});
  await writeFile(`${output}/proxy.js`,source.proxy);
  for(const file of ['manifest.json','background.js','popup.html','popup.js','popup.css'])await copyFile(`dist/${file}`,`${output}/${file}`);
  await copyFile('node_modules/darkreader/LICENSE',`${output}/LICENSE-DarkReader.txt`);
  return output;
}

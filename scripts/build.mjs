import {build} from 'esbuild';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await mkdir('test-results',{recursive:true});
const result=await build({entryPoints:['src/content.js','src/background.js','src/proxy.js','src/popup.js'],bundle:true,outdir:'dist',format:'esm',target:'chrome120',minify:true,legalComments:'none',metafile:true});
if(Object.keys(result.metafile.inputs).some(file=>file.includes('darkreader')))throw new Error('Production must not bundle the benchmark engine');
// Content scripts cannot contain ESM imports. Bundled entrypoints have none;
// popup's top-level await is handled by its module script tag.
for(const file of ['manifest.json','popup.html','popup.css'])await copyFile(`src/${file}`,`dist/${file}`);
await mkdir('dist/icons',{recursive:true});
const manifest=JSON.parse(await readFile('src/manifest.json','utf8'));
for(const file of new Set([...Object.values(manifest.icons),...Object.values(manifest.action.default_icon)]))await copyFile(`src/${file}`,`dist/${file}`);
await writeFile('dist/THIRD_PARTY_NOTICES.txt','LumaShift production bundle has no third-party runtime dependencies.\nDark Reader 4.9.132 (MIT) is used only by development benchmark scripts and is not shipped.\nBuild tooling: esbuild (MIT).\n');
await writeFile('test-results/build.json',JSON.stringify({date:new Date().toISOString(),inputs:Object.keys(result.metafile.inputs),outputs:Object.fromEntries(Object.entries(result.metafile.outputs).map(([k,v])=>[k,v.bytes]))},null,2));
console.log('Built dist/ — runtime dependencies: none; Dark Reader excluded.');

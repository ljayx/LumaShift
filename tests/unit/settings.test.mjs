import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,readSettings,pageInfo,decide,contrast,siteKey} from '../../src/settings.js';
test('rule precedence and native theme manual override',()=>{
  assert.equal(decide({supported:false,enabled:false,mode:'force'}),'unsupported');
  assert.equal(decide({authorized:false,mode:'force'}),'unauthorized');
  assert.equal(decide({enabled:false,mode:'force'}),'off');
  assert.equal(decide({mode:'original'}),'original');
  assert.equal(decide({mode:'auto',nativeDark:true}),'native');
  assert.equal(decide({mode:'force',nativeDark:true}),'active');
});
test('host rules separate subdomains and ignore paths / ports',()=>{
  const a=pageInfo('https://www.example.com:8443/a'),b=pageInfo('https://docs.example.com/b');
  assert.equal(a.host,'www.example.com');assert.notEqual(a.host,b.host);
  const data={[siteKey(a.host)]:'original'};assert.equal(readSettings(data,b.host).mode,'auto');
});
test('restricted pages and malformed values',()=>{
  for(const url of ['chrome://settings','https://chromewebstore.google.com/detail/x','file:///tmp/x','https://example.com/a.PDF?x=1','bad'])assert.equal(pageInfo(url).supported,false);
  assert.deepEqual(readSettings({enabled:1,background:'url(x)',text:null,'site:x':'oops'},'x'),{...DEFAULTS,mode:'auto'});
});
test('contrast ratios use relative luminance',()=>{
  assert.equal(contrast('#000000','#ffffff'),21);assert.equal(contrast('#777777','#777777'),1);assert.ok(contrast(DEFAULTS.background,DEFAULTS.text)>10);
});

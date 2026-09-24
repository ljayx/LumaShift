import {test} from 'node:test';
import assert from 'node:assert/strict';
import {declarations,ruleBlocks,splitCSS,isThinPaint} from '../../src/declarations.js';

test('authored declarations preserve partial shorthands, priority and quoted URL tokens',()=>{
  const values=declarations(null,'/* background */ background:var(--surface);background-image:url("/a;b/*c*/.svg");background-size:cover !important;');
  assert.deepEqual(values,[
    {property:'background',value:'var(--surface)',priority:''},
    {property:'background-image',value:'url("/a;b/*c*/.svg")',priority:''},
    {property:'background-size',value:'cover',priority:'important'}
  ]);
});

test('CSS blocks preserve grouping and ignore delimiters in comments and strings',()=>{
  const source='@charset "utf-8";/* } */ @media (min-width:1px){.surface {background:var(--bg);background-size:cover}.label::before{content:"a;}b"}}.last{color:red}';
  const blocks=ruleBlocks(source);
  assert.equal(blocks.length,2);
  assert.equal(ruleBlocks(blocks[0].body).length,2);
  assert.equal(blocks[1].header,'.last');
  assert.deepEqual(splitCSS('rgba(0,0,0,.1),var(--shadow,0 0 1px #000)',','),['rgba(0,0,0,.1)','var(--shadow,0 0 1px #000)']);
});
test('thin painted separators are distinguished from hidden boxes and content surfaces',()=>{
  for(const [height,expected] of [['2px',true],['.125rem',true],['0px',false],['20px',false],['100%',false]]) {
    assert.equal(isThinPaint({getPropertyValue:p=>p==='height'?height:''}),expected);
  }
});

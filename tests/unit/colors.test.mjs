import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPalette,parseSimple,toHSL,fromHSL} from '../../src/colors.js';
const palette=createPalette('#181c24','#dce3ed');
test('CSS rewriting preserves URLs and distinguishes variable roles',()=>{
  const css='url("/white/red.png") center, linear-gradient(#fff, rgba(200, 100, 0, .5))';
  const result=palette.rewrite(css,'bg');assert.ok(result.includes('url("/white/red.png")'));assert.ok(!result.includes('#fff'));assert.ok(result.includes('0.5'));
  assert.equal(palette.rewrite('var(--brand, #fff)','text').startsWith('var(--luma-text-brand,'),true);
  assert.equal(palette.rewrite('none','bg'),'none');assert.equal(palette.rewrite('currentColor','text'),'currentColor');
});
test('color parser preserves alpha and HSL round trips',()=>{
  assert.deepEqual(parseSimple('#abc8'),[170,187,204,136/255]);
  assert.deepEqual(parseSimple('rgb(10 20 30 / 50%)'),[10,20,30,.5]);
  for(const rgb of [[234,30,60],[1,2,3],[255,255,255]])assert.deepEqual(fromHSL(toHSL(rgb)),rgb);
});
test('neutral backgrounds retain hierarchy and semantic hues remain distinct',()=>{
  assert.notEqual(palette.map('#ffffff','bg'),palette.map('#eeeeee','bg'));
  assert.equal(new Set(['#cc1111','#11aa33','#1166dd'].map(c=>palette.map(c,'text'))).size,3);
  assert.equal(palette.rewrite('rgba(0, 0, 0, 0)','bg'),'rgba(0, 0, 0, 0)');
});
test('chosen white and black background endpoints are respected',()=>{
  assert.equal(createPalette('#ffffff','#000000').map('#ffffff','bg'),'rgb(255, 255, 255)');
  assert.equal(createPalette('#000000','#eeeeee').map('#ffffff','bg'),'rgb(0, 0, 0)');
});
test('RGB channel variables and variable alpha are not mistaken for black',()=>{
  assert.equal(palette.variable('255 255 255','bg'),'24 28 36');
  assert.equal(palette.rewrite('rgb(var(--channels) / .5)','bg'),'rgb(var(--luma-bg-channels, var(--channels)) / .5)');
  assert.equal(palette.rewrite('rgb(255 255 255 / var(--alpha))','bg'),'rgba(24, 28, 36, var(--alpha))');
});
test('faint borders remain visible while transparent spacers and soft shadows stay intact',()=>{
  const border=parseSimple(palette.map('rgba(0,0,0,.12)','border'));
  assert.ok(border[0]>150 && border[3]>=.24);
  assert.equal(palette.map('rgba(0,0,0,0)','border'),'rgba(0,0,0,0)');
  const shadows=palette.shadow('0 1px 0 rgba(0,0,0,.12), 0 4px 12px rgba(0,0,0,.2)');
  assert.ok(!shadows.startsWith('0 1px 0 rgba(0, 0, 0,'));
  assert.match(shadows,/0 4px 12px rgba\(0, 0, 0, 0.2\)/);
});

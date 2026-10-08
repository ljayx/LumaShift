import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPalette,parseSimple,toHSL,fromHSL} from '../../src/colors.js';
import {luminance} from '../../src/settings.js';
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

const ratio=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('light neutral surfaces retain visible, ordered levels without brightening white',()=>{
  for(const base of ['#181c24','#000000','#262626','#202b25']) {
    const p=createPalette(base,'#dce3ed');
    const mapped=['#fff','#fafafa','#f2f2f2','#e8e8e8','#ddd'].map(c=>parseSimple(p.map(c,'bg')));
    assert.deepEqual(mapped[0],parseSimple(base));
    for(let i=1;i<mapped.length;i++)assert.ok(luminance(mapped[i])>luminance(mapped[i-1]),base);
    assert.ok(ratio(mapped[2],mapped[0])>=1.18,`${base}: pale gray chip must remain distinguishable`);
    assert.ok(ratio(parseSimple(p.map('#666','text')),mapped[4])>=4.5,`${base}: secondary text on a raised surface`);
  }
});
test('pale semantic backgrounds retain hue across blue, green, amber, red and violet',()=>{
  for(const value of ['#d1f0ff','#e0f7ff','#d1e7dd','#fff3cd','#f8d7da','#eadcff']) {
    const [h]=toHSL(parseSimple(value));
    const output=parseSimple(palette.map(value,'bg')),[oh,os]=toHSL(output);
    const difference=Math.abs(h-oh);
    assert.ok(Math.min(difference,1-difference)<.025,value);
    assert.ok(os>.2,value);
    assert.ok(luminance(output)<.12,value);
    assert.ok(ratio(parseSimple(palette.map('#222','text')),output)>=4.5,value);
  }
});
test('background gradients do not jump at former neutral cutoffs',()=>{
  for(const colorAt of [n=>[n,240,255],n=>[255,n,n],n=>[n,n,n]]) {
    let previous;
    for(let n=180;n<=255;n++) {
      const current=parseSimple(palette.map(`rgb(${colorAt(n).join(',')})`,'bg'));
      if(previous)assert.ok(Math.max(...current.slice(0,3).map((c,i)=>Math.abs(c-previous[i])))<=8,`${colorAt(n)}`);
      previous=current;
    }
  }
  const a=parseSimple(palette.map('#7f7f7f','bg')),b=parseSimple(palette.map('#808080','bg'));
  assert.ok(Math.max(...a.slice(0,3).map((v,i)=>Math.abs(v-b[i])))<=2);
});
test('surface mapping preserves alpha, transparent layout and dark overlays',()=>{
  for(const alpha of [0,.04,.12,.5,.9,1]) {
    for(const color of ['209,240,255','242,242,242','0,0,0']) {
      assert.equal(parseSimple(palette.map(`rgba(${color},${alpha})`,'bg'))[3],alpha);
    }
  }
  for(const value of ['transparent','none','inherit','currentColor'])assert.equal(palette.rewrite(value,'bg'),value);
  assert.ok(luminance(parseSimple(palette.map('rgba(0,0,0,.6)','bg')))<luminance(parseSimple('#181c24')));
});
test('colored links remain readable on raised gray and pale semantic backgrounds',()=>{
  for(const base of ['#181c24','#000000','#262626','#202b25']) {
    const p=createPalette(base,'#dce3ed');
    const surfaces=['#f2f2f2','#ddd','#808080'];
    for(let hue=0;hue<1;hue+=1/24)for(const lightness of [.8,.85,.9,.95,.98])surfaces.push(`rgb(${fromHSL([hue,.8,lightness]).join(',')})`);
    for(const surface of surfaces)for(const ink of ['#0000ee','#551a8b','#0969da','#666','#222']) {
      assert.ok(ratio(parseSimple(p.map(ink,'text')),parseSimple(p.map(surface,'bg')))>=4.5,`${base} / ${surface} / ${ink}`);
    }
  }
  const lowContrast=createPalette('#181c24','#333333');
  assert.ok(ratio(parseSimple(lowContrast.map('#222','text')),parseSimple('#181c24'))<4.5);
});

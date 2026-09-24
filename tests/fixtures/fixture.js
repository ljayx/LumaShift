const $ = (s) => document.querySelector(s);
if (new URLSearchParams(location.search).has('dark')) document.documentElement.dataset.theme = 'dark';
$('#native').onclick = () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; };
$('#menu-button').onclick = () => { $('#menu').hidden = !$('#menu').hidden; };
$('#dialog-button').onclick = () => $('dialog').showModal();
$('#close-dialog').onclick = () => $('dialog').close();
$('#route').onclick = () => { history.pushState({}, '', '#details'); $('#route-content').textContent = '当前位置：项目详情'; };
window.addItems = (count = 100) => {
  const fragment = document.createDocumentFragment();
  for (let i=0;i<count;i++) { const node=document.createElement('div');node.className='item';node.textContent=`动态条目 ${i}`;fragment.append(node); }
  $('#dynamic').append(fragment);
};
$('#add').onclick = () => window.addItems();
$('#remove').onclick = () => $('#dynamic').replaceChildren();
$('#recolor').onclick = () => { $('#mutable').style.backgroundColor='#fee';$('#mutable').style.color='#932'; };
const root = $('#shadow-host').attachShadow({mode:'open'});
root.innerHTML = '<style>:host{display:block;margin-top:15px}p{background:white;color:#213547;padding:10px;border:1px solid #888}</style><p id="shadow-text">开放 Shadow DOM 内容</p>';
const canvas = $('#canvas');
const ctx=canvas.getContext('2d');ctx.fillStyle='#ec6542';ctx.fillRect(0,0,40,40);ctx.fillStyle='#39a678';ctx.fillRect(40,0,40,40);ctx.fillStyle='#458be2';ctx.fillRect(80,0,40,40);
$('#video').srcObject=canvas.captureStream(1);
if (new URLSearchParams(location.search).has('large')) window.addItems(5000);
window.fixtureReady=true;

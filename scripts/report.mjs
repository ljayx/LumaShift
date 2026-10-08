import {readFile,writeFile} from 'node:fs/promises';
const read=async file=>JSON.parse(await readFile(`test-results/${file}`,'utf8'));
const suites=[['核心功能','e2e.json'],['暗色规则','dark-regressions.json'],['背景层次','surfaces.json'],['文本选中','selection.json']];
let text='# 测试结果与已知限制\n\n本报告由 `npm run report` 根据本地 test-results/ 生成。可控页面通过不代表所有网站兼容，0.1.0 仍为开发版。原始 JSON 和截图由测试脚本生成，CI 中可下载对应运行的 test-results artifact。\n\n## 浏览器回归\n\n| 测试组 | 数据日期 | 通过 / 总数 | 页面错误 |\n|---|---|---:|---:|\n';
let failed=false;
for(const [name,file] of suites) {
  const data=await read(file),passed=data.results.filter(r=>r.status==='passed').length;
  const errors=data.pageErrors||data.errors||[];
  text+=`| ${name} | ${data.date} | ${passed} / ${data.results.length} | ${errors.length} |\n`;
  if(!data.results.length||passed!==data.results.length||errors.length)failed=true;
}
text+='\n单元测试另由 `npm test` 执行，覆盖颜色映射、声明解析和设置逻辑。浏览器回归包括启停与恢复、设置持久化、Popup、动态内容、主题识别、媒体、iframe、开放 Shadow DOM、背景层次及选中高亮。测试环境为独立 Playwright Chromium；具体断言见 scripts/ 与 tests/。\n';
let perf;
try {perf=await read('performance.json');}catch(error){if(error.code!=='ENOENT')throw error;}
const names=['disabled','off','lumashift'];
const complete=perf?.groups?.length===3&&names.every(name=>{
  const g=perf.groups.find(g=>g.name===name);
  return g?.multi&&['standard','large'].every(size=>g.cases.some(c=>c.size===size));
});
const f=n=>Number.isFinite(n)?n.toFixed(2):'未测';
const p95=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
const sum=values=>values.reduce((a,b)=>a+b,0);
if(complete) {
  text+=`\n## 性能测量\n\n日期：${perf.date}。${perf.cpu} / ${perf.cores} 逻辑核心 / ${f(perf.memoryGiB)} GiB；${perf.os}；Chromium ${perf.browser}；视口 ${perf.viewport}。\n\nCPU 为 CDP 主线程 TaskDuration / 墙钟时间，每场景取三个 5 秒窗口的中位数；JS 堆在强制 GC 后测量。浏览器进程树 RSS 是瞬时值，可能重复计算共享内存。五次导航在同一独立 profile 内进行，不代表严格冷启动；切换包含测试 RPC 开销。后台保留浏览器正常节流，百次切换不能替代数小时测试。\n\n| 状态 | 页面 | GC JS 堆 MiB | 空闲 CPU % | 动态 CPU % | 动态帧间隔 p95 ms | 浏览器树 RSS MiB |\n|---|---|---:|---:|---:|---:|---:|\n`;
  const labels={disabled:'未加载扩展',off:'安装但关闭',lumashift:'开启转换'};
  for(const g of perf.groups)for(const c of g.cases)text+=`| ${labels[g.name]} | ${c.size} | ${f(c.heapMiB)} | ${f(c.idle.cpuSingleCorePercent)} | ${f(c.dynamic.cpuSingleCorePercent)} | ${f(c.dynamic.frameMs.p95)} | ${f(c.rssMiB)} |\n`;
  const enabled=perf.groups.find(g=>g.name==='lumashift'),base=perf.groups.find(g=>g.name==='disabled');
  text+='\n### 预先确定的预算\n\n增量均相对未加载扩展状态。负增量视为测量波动；超标如实记录，不调整预算。\n\n| 指标 | 实测 | 预算 | 判定 |\n|---|---:|---:|---|\n';
  const row=(name,value,target,unit)=>{text+=`| ${name} | ${f(value)} ${unit} | ≤${target} ${unit} | ${!Number.isFinite(value)?'未验证':value<=target?'通过此指标':'未达预算'} |\n`;};
  for(const size of ['standard','large']) {
    const a=enabled.cases.find(c=>c.size===size),b=base.cases.find(c=>c.size===size);
    if(size==='standard')row('standard 首次变暗 p95',p95(a.navigation.map(n=>n.first)),300,'ms');
    row(`${size} 背景稳定 p95`,p95(a.navigation.map(n=>n.stable)),800,'ms');
    row(`${size} 切换 p95`,a.switchMs.p95,size==='standard'?200:500,'ms');
    row(`${size} 空闲 CPU 增量`,a.idle.cpuSingleCorePercent-b.idle.cpuSingleCorePercent,1,'单核百分点');
    row(`${size} 动态 CPU 增量`,a.dynamic.cpuSingleCorePercent-b.dynamic.cpuSingleCorePercent,10,'单核百分点');
    row(`${size} JS 堆增量`,a.heapMiB-b.heapMiB,size==='standard'?20:50,'MiB');
    row(`${size} worker JS 堆`,a.workerHeapMiB,10,'MiB');
    row(`${size} 动态帧间隔 p95`,a.dynamic.frameMs.p95,32,'ms');
    row(`${size} 长任务增量`,(a.dynamic.longTasks.length-b.dynamic.longTasks.length)/3,5,'次/5秒');
  }
  row('五标签页累计 CPU 增量',enabled.multi.cpuSingleCorePercent-base.multi.cpuSingleCorePercent,3,'单核百分点');
  row('五标签页累计 JS 堆增量',sum(enabled.multi.heapMiB)-sum(base.multi.heapMiB),100,'MiB');
  const trend=enabled.cases.find(c=>c.size==='standard').toggleTrend;
  row('第 10→100 次切换 GC 堆增长',trend.find(t=>t.cycle===100).heapMiB-trend.find(t=>t.cycle===10).heapMiB,5,'MiB');
} else text+='\n## 性能测量\n\n当前没有完整的三组数据。先单独运行 `npm run test:perf`，再重新生成报告。\n';
text+='\n## 已知限制与未验证项目\n\n- Chrome 最低支持版本 120、实际工具栏操作、Windows、严格冷启动闪白录像、全进程 CPU 和数小时运行需要独立验证。\n- 真实网站抽查单独使用 `npm run test:sites`；登录后页面、复杂业务表单、网络视频和无限滚动未全面验收。访问失败或验证码页面不算通过。\n- 封闭 Shadow DOM、晚赋值 adoptedStyleSheets、部分 CSSOM 直接属性赋值、关键帧颜色与复杂颜色表达式可能保持原样。\n- 不重绘 Canvas/WebGL；图片背景、Logo、混合模式及元素整体透明度仍可能影响局部可读性。\n- 无法读取、超过 2 MiB 的样式表以及跨域 CSS @import 可能无法完整转换；巨大单个样式表的规则解析仍同步执行。\n- Chrome 内部页、扩展商店、PDF 阅读器、file 页面和无痕模式不在支持范围。\n\n复现步骤见 [测试矩阵](test-matrix.md)，指标定义见 [性能预算](performance-budget.md)。\n';
await writeFile('docs/test-report.md',text);
console.log('Wrote docs/test-report.md');
if(failed)process.exitCode=1;

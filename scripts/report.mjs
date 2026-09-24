import {readFile,writeFile} from 'node:fs/promises';
const read=async file=>JSON.parse(await readFile(`test-results/${file}`,'utf8'));
const perf=await read('performance.json'),e2e=await read('e2e.json');
let sites={results:[]};try{sites=await read('real-sites.json');}catch{}
const paired=await read('paired-performance.json');
if(paired.samples.length!==12)throw new Error('Incomplete alternating comparison');
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const groups=Object.fromEntries(perf.groups.map(g=>[g.name,g]));
if(Object.keys(groups).length!==4 || perf.groups.some(g=>g.cases.length!==2 || !g.multi))throw new Error('Incomplete performance measurement');
const f=n=>Number.isFinite(n)?n.toFixed(2):'未测';
const p95=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
const sample=(name,size)=>groups[name].cases.find(c=>c.size===size);
const sum=values=>values.reduce((a,b)=>a+b,0);
const pass=(value,target)=>!Number.isFinite(value)?'未验证':value<=target?'通过此代理指标':'未达预算';
let text=`# 实测结果与验收状态\n\n测试日期：${perf.date}。本报告由 scripts/report.mjs 从原始数据生成。\n\n**交付状态：可安装的开发版；尚未完成需求中的全部第一阶段验收。** 可控场景通过不等于所有真实网站通过。生产包不包含 Dark Reader。\n\n## 测试环境和口径\n\n${perf.cpu} / ${perf.cores} 逻辑核心 / ${f(perf.memoryGiB)} GiB；${perf.os}；Chromium / Chrome for Testing ${perf.browser}；视口 ${perf.viewport}。实际安装的 Chrome 稳定版工具栏使用流程尚未人工验收。\n\n- 首次生效：同一独立 profile 内 5 次新文档导航，页面 body 背景变暗到连续 5 帧稳定；这是 CSS/渲染帧代理，不是屏幕闪白录像或逐次冷启动。\n- 切换：10 次启停，发起 storage 写入到背景符合目标并经过 2 帧，含测试 RPC 开销，未测真实鼠标点击工具栏的端到端延迟。\n- CPU：每个场景 3 个 5 秒窗口，表中为中位数；CDP TaskDuration / 墙钟，是单核主线程占比，不代表所有浏览器进程或 GPU。各组同样包含测量用 rAF 与页面媒体控件的成本。\n- 内存：页面强制 GC 后 JS 堆；另外采集独立浏览器进程树 RSS（含浏览器、页面、worker、GPU 等，但共享页可能重复计数），RSS 为单次快照，不宜据此宣称稳定改善比例。\n- 多标签：1 个前台 + 4 个后台，保留正常后台节流。百次切换的趋势不能代替数小时运行。\n- Dark Reader 4.9.132 是经过 MV3 及消息返回适配的 API 对照，同配置、同配色、双方不做图片分析；**未与用户正在使用的完整商店版进行直接对照**。\n\n## 功能结果\n\n${e2e.results.filter(r=>r.status==='passed').length} / ${e2e.results.length} 项浏览器回归通过；记录到 ${e2e.pageErrors.length} 个页面 JS 错误。另有 9 项规则/颜色单元测试，运行记录见 [unit-tests.txt](../test-results/unit-tests.txt)。\n\n| 场景 | 结果 |\n|---|---|\n`;
for(const r of e2e.results)text+=`| ${r.name} | ${r.status==='passed'?'通过':'失败：'+r.error.replaceAll('\n',' ').replaceAll('|','/')} |\n`;
text+='\n四组预算测量后，仅收窄了 PDF 页面排除条件，使普通 HTML 内的局部 PDF embed 不再阻止全页转换；颜色和调度引擎未改。最终构建重新运行了全部功能回归与交替对照，四组预算未因这一局部资格修复重跑。\n\n媒体对比保留了 before/after 截图与 media-diff.json：排除圆角混入的背景，只比较内容区域；容差为不超过 0.1% 像素、每通道最大 1/255。Canvas 原始像素和生成视频播放连续性也在脚本内校验；未据此声称网络视频均通过。\n\n## CPU 与内存\n\n| 组别 | 页面 | GC JS 堆 MiB | 空闲 CPU % | 动态 CPU % | 动态帧间隔 p95 ms | 浏览器树 RSS MiB | worker JS 堆 MiB |\n|---|---|---:|---:|---:|---:|---:|---:|\n';
for(const g of perf.groups)for(const c of g.cases)text+=`| ${g.name} | ${c.size} | ${f(c.heapMiB)} | ${f(c.idle.cpuSingleCorePercent)} | ${f(c.dynamic.cpuSingleCorePercent)} | ${f(c.dynamic.frameMs.p95)} | ${f(c.rssMiB)} | ${f(c.workerHeapMiB)} |\n`;
text+='\n与同轮 API 对照比较（仅这些样本）：\n\n';
for(const size of ['standard','large']) {
  const a=sample('lumashift',size),b=sample('darkreader',size),base=sample('disabled',size);
  const cpu=(1-a.dynamic.cpuSingleCorePercent/b.dynamic.cpuSingleCorePercent)*100,heap=(1-a.heapMiB/b.heapMiB)*100;
  text+=`- ${size}：动态 CPU ${cpu>=0?'降低':'增加'} ${f(Math.abs(cpu))}%；页面总 JS 堆${heap>=0?'降低':'增加'} ${f(Math.abs(heap))}%。相对未加载扩展的 JS 堆增量分别为 LumaShift ${f(a.heapMiB-base.heapMiB)} MiB / API 对照 ${f(b.heapMiB-base.heapMiB)} MiB。\n`;
}
text+='\n上述比较不能推广为全部网站、完整进程内存或商店版性能结论。首轮出现过 LumaShift 动态 CPU 高于对照，原始记录保留在 performance-first-pass.json；随后做了行内声明差量写入、识别范围限制、移除路由误触发、前台渲染前合并处理，以及通过最终 style 字符串跳过插件自身变动。最终测量的重复次数/后台调度也更严格，不用两轮数据计算优化百分比。\n\n## 交替顺序补充对照\n\n';
text+=`测量日期：${paired.date}。每种规模三轮，顺序为 LumaShift→API、API→LumaShift、LumaShift→API；每次使用新 profile。双方均停止测试页视频流和控件动画，动态预热 3 秒、测量 5 秒，最后强制 GC。此数据用于检查顺序波动，不替代上方预算测量。\n\n| 页面 | LumaShift CPU %（三个样本） | API CPU %（三个样本） | CPU 中位数相对 API | GC JS 堆中位数 LumaShift / API |\n|---|---|---|---|---|\n`;
for(const size of ['standard','large']) {
 const a=paired.samples.filter(s=>s.size===size&&s.engine==='lumashift'),b=paired.samples.filter(s=>s.size===size&&s.engine==='darkreader');
 const cpu=(median(a.map(s=>s.cpuSingleCorePercent))/median(b.map(s=>s.cpuSingleCorePercent))-1)*100;
 text+=`| ${size} | ${a.map(s=>f(s.cpuSingleCorePercent)).join(' / ')} | ${b.map(s=>f(s.cpuSingleCorePercent)).join(' / ')} | ${cpu<=0?'降低':'增加'} ${f(Math.abs(cpu))}% | ${f(median(a.map(s=>s.heapMiB)))} / ${f(median(b.map(s=>s.heapMiB)))} MiB |\n`;
}
text+='\n样本数仍少且各轮存在波动；本次数据不足以证明在保持同等兼容覆盖时，LumaShift 的 CPU 一定优于完整 Dark Reader。页面 JS 堆也不能替代浏览器整体内存。不得据此宣称用户提出的整体性能改善目标已经完成。各轮原始数据见 [paired-performance.json](../test-results/paired-performance.json)，优化前的交替结果保留在 paired-before-signature-fix.json。\n\n## 预算逐项核对\n\n| 指标 | LumaShift 结果 | 预算 | 判定 |\n|---|---:|---:|---|\n';
for(const size of ['standard','large']) {
 const a=sample('lumashift',size),base=sample('disabled',size);
 const first=p95(a.navigation.map(n=>n.first)),stable=p95(a.navigation.map(n=>n.stable)),idle=a.idle.cpuSingleCorePercent-base.idle.cpuSingleCorePercent,dynamic=a.dynamic.cpuSingleCorePercent-base.dynamic.cpuSingleCorePercent,heap=a.heapMiB-base.heapMiB;
 text+=`| ${size} 首次变暗 p95 | ${f(first)} ms | ≤300 ms（标准页） | ${size==='standard'?pass(first,300):'附加记录'}；冷启动未验证 |\n`;
 text+=`| ${size} 背景稳定 p95 | ${f(stable)} ms | ≤800 ms | ${pass(stable,800)}；不代表全页视觉稳定 |\n`;
 text+=`| ${size} 切换 p95 | ${f(a.switchMs.p95)} ms | ≤${size==='standard'?200:500} ms | ${pass(a.switchMs.p95,size==='standard'?200:500)} |\n`;
 text+=`| ${size} 空闲 CPU 增量 | ${f(idle)} 单核百分点 | ≤1 | ${pass(idle,1)} |\n`;
 text+=`| ${size} 动态 CPU 增量 | ${f(dynamic)} 单核百分点 | ≤10 | ${pass(dynamic,10)} |\n`;
 text+=`| ${size} JS 堆增量 | ${f(heap)} MiB | ≤${size==='standard'?20:50} MiB | ${pass(heap,size==='standard'?20:50)}；全内存不以此替代 |\n`;
 text+=`| ${size} worker JS 堆 | ${f(a.workerHeapMiB)} MiB | ≤10 MiB | ${pass(a.workerHeapMiB,10)} |\n`;
 text+=`| ${size} 动态帧 p95 | ${f(a.dynamic.frameMs.p95)} ms | ≤32 ms | ${pass(a.dynamic.frameMs.p95,32)} |\n`;
 const longDelta=(a.dynamic.longTasks.length-base.dynamic.longTasks.length)/3;
 text+=`| ${size} >50ms 长任务增量 | ${f(longDelta)} 次/5秒 | ≤5 | ${pass(longDelta,5)} |\n`;
}
const multi=groups.lumashift.multi,baseMulti=groups.disabled.multi;
text+=`| 五页累计 CPU 增量 | ${f(multi.cpuSingleCorePercent-baseMulti.cpuSingleCorePercent)} 单核百分点 | ≤3 | ${pass(multi.cpuSingleCorePercent-baseMulti.cpuSingleCorePercent,3)} |\n| 五页累计 JS 堆增量 | ${f(sum(multi.heapMiB)-sum(baseMulti.heapMiB))} MiB | ≤100 MiB | ${pass(sum(multi.heapMiB)-sum(baseMulti.heapMiB),100)} |\n`;
const trend=sample('lumashift','standard').toggleTrend,delta=trend.find(t=>t.cycle===100).heapMiB-trend[0].heapMiB;
text+=`| 第10→100次开关后 GC 堆增长 | ${f(delta)} MiB | ≤5 MiB | ${pass(delta,5)}；数小时未验证 |\n\n完整窗口、导航、帧间隔、开关趋势与多页 RSS 见 [performance.json](../test-results/performance.json)。负增量视为测量波动，不解释成扩展降低了网页的固有成本。\n\n## 真实网站抽查\n\n真实站点只执行了下列脚本动作；smoke-tested 仅表示列出的操作可运行，不表示完整兼容验收。已查看的截图结论与具体缺陷见 [visual-review.md](visual-review.md)。\n\n| 页面 | 状态 | 实际操作 / 阻断原因 |\n|---|---|---|\n`;
for(const site of sites.results)text+=`| [${site.id}](${site.url}) | ${site.status} | ${(site.status==='smoke-tested'?site.steps.join(' → '):site.reason).replaceAll('\n',' ').replaceAll('|','/')} |\n`;
text+='\n## 限制与未验证项目\n\n- Chrome 稳定版实际工具栏 Popup、声明的 Chrome 120 最低版本、Windows/Linux、严格冷启动首屏录像、OS 全进程 CPU、数小时/多天资源趋势尚未验证。\n- 登录后的 Dashboard、复杂业务表单、真实无限滚动、除 Wikipedia 外的真实网站原生亮/暗切换及网络视频播放，未完成完整验收。访问失败或验证码页面不记通过。\n- 封闭 Shadow DOM 保持原样；开放根已有/新增普通样式和初始化的 adoptedStyleSheets 有测试，晚赋值 adoptedStyleSheets、CSSOM 直接属性赋值等仍不全面。\n- 不重绘 Canvas/WebGL；背景图片、Logo 和 SVG 呈现属性谨慎保留。图片背景上叠字可能需要额外通用可读性策略。\n- 关键帧动画颜色、复杂 CSS 色值表达式、跨域 CSS @import、无法读取或超过 2MiB 的样式表，可能局部保持原样；读取失败会提示部分样式不可用。\n- 巨大单个样式表的规则解析仍是同步操作；6ms 分片只用于节点扫描/队列，不是全链路硬上限。\n- 暂未把已知边界包装成全面兼容；任一主要内容不可读、关键交互损坏或持续资源增长均需按阻断问题处理。\n\n安装和使用见 [README](../README.md)，逐场景复现步骤见 [test-matrix.md](test-matrix.md)。\n';
await writeFile('docs/test-report.md',text);console.log('Wrote docs/test-report.md');

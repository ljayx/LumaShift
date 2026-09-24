# 实测结果与验收状态

测试日期：2026-09-23T03:06:05.664Z。本报告由 scripts/report.mjs 从原始数据生成。

**交付状态：可安装的开发版；尚未完成需求中的全部第一阶段验收。** 可控场景通过不等于所有真实网站通过。生产包不包含 Dark Reader。

## 测试环境和口径

Apple M2 / 8 逻辑核心 / 16.00 GiB；darwin 25.6.0；Chromium / Chrome for Testing 145.0.7632.6；视口 1280x900。实际安装的 Chrome 稳定版工具栏使用流程尚未人工验收。

- 首次生效：同一独立 profile 内 5 次新文档导航，页面 body 背景变暗到连续 5 帧稳定；这是 CSS/渲染帧代理，不是屏幕闪白录像或逐次冷启动。
- 切换：10 次启停，发起 storage 写入到背景符合目标并经过 2 帧，含测试 RPC 开销，未测真实鼠标点击工具栏的端到端延迟。
- CPU：每个场景 3 个 5 秒窗口，表中为中位数；CDP TaskDuration / 墙钟，是单核主线程占比，不代表所有浏览器进程或 GPU。各组同样包含测量用 rAF 与页面媒体控件的成本。
- 内存：页面强制 GC 后 JS 堆；另外采集独立浏览器进程树 RSS（含浏览器、页面、worker、GPU 等，但共享页可能重复计数），RSS 为单次快照，不宜据此宣称稳定改善比例。
- 多标签：1 个前台 + 4 个后台，保留正常后台节流。百次切换的趋势不能代替数小时运行。
- Dark Reader 4.9.132 是经过 MV3 及消息返回适配的 API 对照，同配置、同配色、双方不做图片分析；**未与用户正在使用的完整商店版进行直接对照**。

## 功能结果

14 / 14 项浏览器回归通过；记录到 0 个页面 JS 错误。另有 9 项规则/颜色单元测试，运行记录见 [unit-tests.txt](../test-results/unit-tests.txt)。

| 场景 | 结果 |
|---|---|
| default activation / CSS layers / semantic colors / CSP | 通过 |
| input / focus / scroll / media / clean current-theme restoration | 通过 |
| dynamic add/remove / inline change / menu / dialog / SPA | 通过 |
| native light → dark → light, manual override, restore current website theme | 通过 |
| both iframe origins inherit top-host rule / open Shadow DOM | 通过 |
| late open shadow / adopted styles / inline var shorthand / media pixels and playback | 通过 |
| all existing related tabs update; unrelated hostname stays independent | 通过 |
| CSSOM insertion / custom variables / inline !important restoration | 通过 |
| legacy HTML background attributes remain readable and restore current values | 通过 |
| embedded PDF does not disable the surrounding HTML page | 通过 |
| popup controls / colors / warning / color-only reset / actual status | 通过 |
| restricted page popup explains unsupported state | 通过 |
| 100 toggles leave no generated styles and preserve site values | 通过 |
| browser restart persists colors and exact-host site rule | 通过 |

四组预算测量后，仅收窄了 PDF 页面排除条件，使普通 HTML 内的局部 PDF embed 不再阻止全页转换；颜色和调度引擎未改。最终构建重新运行了全部功能回归与交替对照，四组预算未因这一局部资格修复重跑。

媒体对比保留了 before/after 截图与 media-diff.json：排除圆角混入的背景，只比较内容区域；容差为不超过 0.1% 像素、每通道最大 1/255。Canvas 原始像素和生成视频播放连续性也在脚本内校验；未据此声称网络视频均通过。

## CPU 与内存

| 组别 | 页面 | GC JS 堆 MiB | 空闲 CPU % | 动态 CPU % | 动态帧间隔 p95 ms | 浏览器树 RSS MiB | worker JS 堆 MiB |
|---|---|---:|---:|---:|---:|---:|---:|
| disabled | standard | 1.13 | 1.39 | 3.96 | 17.50 | 883.52 | 未测 |
| disabled | large | 1.22 | 1.03 | 12.77 | 17.40 | 908.05 | 未测 |
| off | standard | 1.63 | 2.04 | 4.41 | 17.40 | 981.91 | 0.64 |
| off | large | 1.69 | 1.36 | 13.28 | 17.50 | 1017.63 | 0.69 |
| lumashift | standard | 2.47 | 1.10 | 6.52 | 17.50 | 1019.66 | 1.49 |
| lumashift | large | 2.78 | 0.94 | 13.97 | 17.50 | 1066.63 | 0.63 |
| darkreader | standard | 3.37 | 1.58 | 8.05 | 17.50 | 1039.41 | 1.60 |
| darkreader | large | 3.37 | 1.51 | 15.90 | 17.40 | 1135.73 | 0.65 |

与同轮 API 对照比较（仅这些样本）：

- standard：动态 CPU 降低 19.03%；页面总 JS 堆降低 26.79%。相对未加载扩展的 JS 堆增量分别为 LumaShift 1.34 MiB / API 对照 2.24 MiB。
- large：动态 CPU 降低 12.16%；页面总 JS 堆降低 17.43%。相对未加载扩展的 JS 堆增量分别为 LumaShift 1.56 MiB / API 对照 2.15 MiB。

上述比较不能推广为全部网站、完整进程内存或商店版性能结论。首轮出现过 LumaShift 动态 CPU 高于对照，原始记录保留在 performance-first-pass.json；随后做了行内声明差量写入、识别范围限制、移除路由误触发、前台渲染前合并处理，以及通过最终 style 字符串跳过插件自身变动。最终测量的重复次数/后台调度也更严格，不用两轮数据计算优化百分比。

## 交替顺序补充对照

测量日期：2026-09-23T03:12:10.957Z。每种规模三轮，顺序为 LumaShift→API、API→LumaShift、LumaShift→API；每次使用新 profile。双方均停止测试页视频流和控件动画，动态预热 3 秒、测量 5 秒，最后强制 GC。此数据用于检查顺序波动，不替代上方预算测量。

| 页面 | LumaShift CPU %（三个样本） | API CPU %（三个样本） | CPU 中位数相对 API | GC JS 堆中位数 LumaShift / API |
|---|---|---|---|---|
| standard | 5.72 / 8.62 / 7.30 | 7.33 / 5.97 / 8.83 | 降低 0.43% | 2.16 / 2.64 MiB |
| large | 15.32 / 18.95 / 14.46 | 15.80 / 13.69 / 15.34 | 降低 0.15% | 2.29 / 3.10 MiB |

样本数仍少且各轮存在波动；本次数据不足以证明在保持同等兼容覆盖时，LumaShift 的 CPU 一定优于完整 Dark Reader。页面 JS 堆也不能替代浏览器整体内存。不得据此宣称用户提出的整体性能改善目标已经完成。各轮原始数据见 [paired-performance.json](../test-results/paired-performance.json)，优化前的交替结果保留在 paired-before-signature-fix.json。

## 预算逐项核对

| 指标 | LumaShift 结果 | 预算 | 判定 |
|---|---:|---:|---|
| standard 首次变暗 p95 | 147.50 ms | ≤300 ms（标准页） | 通过此代理指标；冷启动未验证 |
| standard 背景稳定 p95 | 221.30 ms | ≤800 ms | 通过此代理指标；不代表全页视觉稳定 |
| standard 切换 p95 | 51.09 ms | ≤200 ms | 通过此代理指标 |
| standard 空闲 CPU 增量 | -0.29 单核百分点 | ≤1 | 通过此代理指标 |
| standard 动态 CPU 增量 | 2.56 单核百分点 | ≤10 | 通过此代理指标 |
| standard JS 堆增量 | 1.34 MiB | ≤20 MiB | 通过此代理指标；全内存不以此替代 |
| standard worker JS 堆 | 1.49 MiB | ≤10 MiB | 通过此代理指标 |
| standard 动态帧 p95 | 17.50 ms | ≤32 ms | 通过此代理指标 |
| standard >50ms 长任务增量 | 0.00 次/5秒 | ≤5 | 通过此代理指标 |
| large 首次变暗 p95 | 139.70 ms | ≤300 ms（标准页） | 附加记录；冷启动未验证 |
| large 背景稳定 p95 | 213.20 ms | ≤800 ms | 通过此代理指标；不代表全页视觉稳定 |
| large 切换 p95 | 53.17 ms | ≤500 ms | 通过此代理指标 |
| large 空闲 CPU 增量 | -0.08 单核百分点 | ≤1 | 通过此代理指标 |
| large 动态 CPU 增量 | 1.20 单核百分点 | ≤10 | 通过此代理指标 |
| large JS 堆增量 | 1.56 MiB | ≤50 MiB | 通过此代理指标；全内存不以此替代 |
| large worker JS 堆 | 0.63 MiB | ≤10 MiB | 通过此代理指标 |
| large 动态帧 p95 | 17.50 ms | ≤32 ms | 通过此代理指标 |
| large >50ms 长任务增量 | -0.33 次/5秒 | ≤5 | 通过此代理指标 |
| 五页累计 CPU 增量 | -1.57 单核百分点 | ≤3 | 通过此代理指标 |
| 五页累计 JS 堆增量 | 4.94 MiB | ≤100 MiB | 通过此代理指标 |
| 第10→100次开关后 GC 堆增长 | 0.08 MiB | ≤5 MiB | 通过此代理指标；数小时未验证 |

完整窗口、导航、帧间隔、开关趋势与多页 RSS 见 [performance.json](../test-results/performance.json)。负增量视为测量波动，不解释成扩展降低了网页的固有成本。

## 真实网站抽查

真实站点只执行了下列脚本动作；smoke-tested 仅表示列出的操作可运行，不表示完整兼容验收。已查看的截图结论与具体缺陷见 [visual-review.md](visual-review.md)。

| 页面 | 状态 | 实际操作 / 阻断原因 |
|---|---|---|
| [github](https://github.com/darkreader/darkreader) | smoke-tested | Original page visible and screenshot captured → Automatic conversion status and screenshot captured → Force conversion and scroll 550px → Disabled and confirmed off state without reload |
| [mdn](https://developer.mozilla.org/en-US/docs/Web/CSS) | smoke-tested | Original page visible and screenshot captured → Automatic conversion status and screenshot captured → Force conversion and scroll 550px → Toggled document details → Disabled and confirmed off state without reload |
| [baidu](https://www.baidu.com/s?wd=Chrome) | smoke-tested | Original page visible and screenshot captured → Automatic conversion status and screenshot captured → Force conversion and scroll 550px → Disabled and confirmed off state without reload |
| [bilibili](https://www.bilibili.com/) | smoke-tested | Original page visible and screenshot captured → Automatic conversion status and screenshot captured → Force conversion and scroll 550px → Disabled and confirmed off state without reload |
| [zhihu](https://www.zhihu.com/topic/19550901/hot) | blocked | HTTP error or verification wall; not counted as website compatibility pass |
| [wikipedia](https://en.wikipedia.org/wiki/Web_browser) | smoke-tested | Original page visible and screenshot captured → Automatic conversion status and screenshot captured → Force conversion and scroll 550px → Native Dark → auto skip; native Light → conversion; force on native Dark → Disabled and confirmed off state without reload |
| [hn](https://news.ycombinator.com/) | smoke-tested | Original page visible and screenshot captured → Automatic conversion status and screenshot captured → Force conversion and scroll 550px → Opened public comments page → Disabled and confirmed off state without reload |
| [reddit](https://www.reddit.com/r/webdev/) | blocked | HTTP error or verification wall; not counted as website compatibility pass |

## 限制与未验证项目

- Chrome 稳定版实际工具栏 Popup、声明的 Chrome 120 最低版本、Windows/Linux、严格冷启动首屏录像、OS 全进程 CPU、数小时/多天资源趋势尚未验证。
- 登录后的 Dashboard、复杂业务表单、真实无限滚动、除 Wikipedia 外的真实网站原生亮/暗切换及网络视频播放，未完成完整验收。访问失败或验证码页面不记通过。
- 封闭 Shadow DOM 保持原样；开放根已有/新增普通样式和初始化的 adoptedStyleSheets 有测试，晚赋值 adoptedStyleSheets、CSSOM 直接属性赋值等仍不全面。
- 不重绘 Canvas/WebGL；背景图片、Logo 和 SVG 呈现属性谨慎保留。图片背景上叠字可能需要额外通用可读性策略。
- 关键帧动画颜色、复杂 CSS 色值表达式、跨域 CSS @import、无法读取或超过 2MiB 的样式表，可能局部保持原样；读取失败会提示部分样式不可用。
- 巨大单个样式表的规则解析仍是同步操作；6ms 分片只用于节点扫描/队列，不是全链路硬上限。
- 暂未把已知边界包装成全面兼容；任一主要内容不可读、关键交互损坏或持续资源增长均需按阻断问题处理。

安装和使用见 [README](../README.md)，逐场景复现步骤见 [test-matrix.md](test-matrix.md)。

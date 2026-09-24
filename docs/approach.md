# 技术方案与决策

## 核心目标

在良好视觉质量和兼容性的前提下改善 Dark Reader 的页面性能和内存开销。体积更小、界面不同或配置更少均不能作为达成目标的证据。原始需求保持在 requirements.md；用户补充的性能比较目标记录于此。

## 调研和选择

资料查阅日期：2026-09-23。

| 路线 | 视觉与兼容性 | CPU、内存及动态处理取舍 | 选择 |
|---|---|---|---|
| 全页 CSS Filter（Dark Reader 的早期路线） | 混合明暗反转、媒体补偿及层叠风险 | 初始设置简单，合成和滚动代价仍需测量 | 不采用 |
| 静态通用覆盖（Static 路线） | 层级、语义色与局部背景容易丢失 | 少量规则，资源成本低，复杂页面差 | 仅作原型比较 |
| Dark Reader 动态 API | 通用处理成熟，颜色变量、动态与复杂页面支持较多 | 全量引入其样式分析、观察器、缓存；不能假定改善原产品开销 | 只作为开发对照组，不进入生产包 |
| Midnight Lizard | 可分别配置背景、文字、边框等，提供面向重页面的 Simplified 模式 | 展示功能完整度与简化模式的取舍；未做其性能实测 | 参考，不复用 |
| LumaShift 独立样式规则引擎 | 保留 CSS 选择器、状态、层叠和颜色语义；复杂场景边界必须独立验收 | 以样式规则为主要工作量；只增量处理新节点和行内颜色；有界缓存与分片处理 | 当前实现，验收以实际结果为准 |

来源：

- [Dark Reader 动态模式设计](https://darkreader.org/blog/dynamic-theme/)
- [Filter 模式与适用场景](https://darkreader.org/blog/filter-mode/)
- [Dark Reader 源码与 API](https://github.com/darkreader/darkreader)
- [Midnight Lizard 源码与说明](https://github.com/Midnight-Lizard/Midnight-Lizard)
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Playwright 扩展测试](https://playwright.dev/docs/chrome-extensions)

这些资料用于理解路线，不作为本项目性能结论。原型实际输出在 test-results/prototype.json 及对应截图；它只证明单页转换和恢复可运行。正式构建由 esbuild 元数据校验不存在 darkreader 输入。

## 独立引擎

1. 读取 CSSOM，给每个原样式表建立相邻的转换样式表，保留选择器、@media、@supports 和 @layer。颜色按背景、文字、边框、阴影映射；保留色相，基准背景/文字控制中性色。URL 和图片像素不反色。
2. CSS 自定义属性按使用角色派生，保留定义位置和作用域。原变量不覆盖。样式表变动只重算相关表，常规 class 切换交由浏览器原有 CSS 系统处理。
3. DOM 新增子树做一次分片扫描，用于发现行内样式和开放 Shadow DOM；每批约 6ms，后台批处理延后 100ms。一个巨大样式表的规则转换目前仍同步，是已知风险，不把分片描述成全链路硬上限。
4. 普通行内颜色使用独立属性和样式规则覆盖，不改原声明。原有 !important 行内颜色需要逐属性暂存；站点后续修改会更新来源，关闭时只恢复仍属于插件的值。
5. 颜色缓存最多 2048 项；移除节点时清除相关处理记录，关闭时断开观察器、清空缓存、删除生成样式，并还原仍属于本插件的 CSSOM 包装。
6. 一个约 KB 量级的 MAIN-world 桥接脚本感知 insertRule、replace、setProperty、attachShadow 变动。不开启时不修改这些原型。此脚本没有扩展权限或网络能力。

当前不采用全量逐节点 computed style 映射，也不做图像分析。它们能增加兼容覆盖，但不应未经成本验证就加入。

## 产品控制

Manifest V3、原生 Popup 和休眠式 service worker。storage.local 按设置项保存，网站 key 使用顶层完整 hostname，不合并子域、不区分端口或路径。写入串行化；恢复默认只恢复两种颜色。

优先级：访问限制/授权 → 全局开关 → 网站规则。自动模式按页面当前颜色最多 9 个视口点采样，不以网站提供主题选项为依据；0.18 相对亮度和 70% 暗点阈值进入原生深色状态，55% 亮点退出，避免边界抖动。大区域容器的相关属性/结构与样式变化合并到 160ms，后台不可见时推迟识别。采样在同一 JS 任务内暂时停用生成样式，读取站点当前样式后立即恢复，不隐藏页面、不保留旧全页快照。

视口取样通过命中栈读取搜索浮层下方的页面内容：跳过对话框、Popover、定位半透明遮罩，以及覆盖独立页面内容的固定或高层级绝对定位面板，避免把弹层颜色误判为整页主题。没有底层内容的固定布局应用仍参与识别。浏览器回归覆盖 Ctrl+G 打开、Escape 关闭、输入焦点、不同定位面板、浮层打开期间的网站主题切换，以及固定布局页面；这是受控浮层模拟，未代表已验证所有第三方搜索扩展。

关闭或网站原样：停止转换和识别，只保留设置消息、页面恢复入口。Popup 打开期间每秒更新实际状态；页面不存在周期主题轮询。

## 权限、资源和支持边界

- storage：本地设置。HTTP/HTTPS host_permissions：自动转换及读取引用的跨域 CSS。
- scripting：安装、更新、重新授权时注入已打开页面。activeTab：用户点击时读取当前页地址，支持解释受限页面状态。不申请历史记录、下载、通知等权限。
- 跨域 CSS 仅 GET，省略凭据与 referrer，5 秒超时、单文件 2MiB、缓存总量 2MiB/16 项。网页内容、配置不上传；不获取图片做分析。不执行远程代码。
- iframe 独立注入、沿用顶层主机规则。部分 scheme、沙箱/未授权 frame 不保证运行。开放 Shadow DOM 可转换已发现样式；封闭 Shadow DOM 保留。
- CSS 动画内部关键帧、复杂图片背景、跨域 CSS 中 @import、晚装载的 adoptedStyleSheets 赋值、仅直接 JS 属性赋值引起的 CSSOM 变动等仍有边界，详见验收记录，不宣称全面兼容。
- Canvas/WebGL/视频内容不改像素；Chrome 内部页、扩展商店、PDF 阅读器、file 和无痕不在支持范围。

## 性能验收

预算在原型测试前固定于 performance-budget.md。performance.mjs 对照未加载扩展、安装但关闭、LumaShift 开启、Dark Reader API 开启。API 对照使用相同配置控制、配色和 CSS 读取桥，双方均不分析图片；不能把该结果宣传成完整商店扩展的等价比较。

样本数据、测量口径、通过与未通过项统一写入测试报告。真实 Chrome 稳定版、长时间运行、全进程 CPU 和实际网站覆盖不足时，保持未验收状态。

## 性能排查记录

在可控动态页的首轮结果中，LumaShift 的 JS 堆低于 API 对照，但动态 CPU 更高，因此未把第一轮当作性能目标完成。先改为行内生成声明差量写入，再通过 CPU profile 发现将 history.replaceState 当成样式变动会触发全表重算及原主题采样。现已移除此误触发；SPA 的实际内容和主题变化由 DOM/CSS 观察处理，不因 URL 字符串变化扫描全页。中间数据及两份 cpuprofile 保留用于追溯。

后续将前台有界队列合并到绘制前，并用最终 style 字符串识别插件自身写入，避免每次 MutationObserver 回调逐属性读取值与优先级；旧式 bgcolor/color/text 属性另行记录，保留对站点修改的响应。每次核心改动均重新运行相关浏览器回归。交替引擎顺序的补充对照用于检查测量波动，不能用挑选单轮的方式证明 CPU 改善。

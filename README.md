# LumaShift

Chrome Manifest V3 深色模式插件。以独立样式规则引擎降低转换开销，优先保持内容可读、颜色语义、媒体与页面交互。

当前是可加载和测试的 0.1.0 开发版。是否达到第一阶段全部验收，以 docs/test-report.md 的实测与未验证清单为准。生产包不包含 Dark Reader；它仅用于开发性能对照。

## 直接安装

首次克隆仓库后，先按下方「构建与验证」执行 `npm ci` 和 `npm run build`，生成 dist 文件夹。

1. 在桌面 Chrome 打开 `chrome://extensions`，开启右上角「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择本项目的 **dist** 文件夹（其中应直接包含 manifest.json）。
3. 允许扩展访问普通 HTTP/HTTPS 网站；如将网站访问限制为「点击时」，自动转换会受限。
4. 将 LumaShift 固定到工具栏，打开普通亮色网页。默认全局开启，自动模式会尽量跳过当前已经呈现深色的页面。

已有网页在安装/重新授权时会尝试直接注入，无需刷新。扩展开发更新后，旧标签页若提示连接已断开，重新加载标签页。开发期间已有其他深色扩展时，请一次启用一个转换器，以免两个引擎互相覆盖。

## 使用

- **全局开关**：控制全部页面；关闭保留网站设置。
- **自动 / 强制转换 / 保持原样**：按当前顶层页面的完整主机名保存，子域名分开。自动误判时可强制指定，切回自动会删除指定规则。
- **全局配色**：背景和文字作为层级与颜色映射的基准；修改即时更新已打开的相关页面。低对比度只提示，不强制覆盖。
- **恢复默认**：只恢复颜色，不清除网站规则。
- **状态说明**：区分正在转换、全局关闭、网站原样、已为深色、页面不支持或未授权。

Chrome 内部页、扩展商店、PDF 阅读器、file 页面和无痕不在第一版范围。关闭后恢复站点当前样式，不假定原主题是亮色。

## 构建与验证

需要 Node.js 22+。构建无网络运行依赖；首次安装开发依赖需要 npm 网络访问。

```bash
npm ci
npm run build
npm test
```

macOS/Linux 安装独立测试浏览器并运行自动化：

```bash
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npm run test:e2e
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npm run test:dark
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npm run test:surfaces
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npm run test:perf
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npm run test:paired
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npm run test:sites
npm run report
```

浏览器测试会在本地 4173 端口启动测试服务，使用项目内临时浏览器资料，不读取个人 Chrome 数据。请顺序运行，不要并行执行性能与其他浏览器测试。Windows 可先设置同名环境变量，再执行 npm 命令；该流程在 Windows 尚未验证。

手工打开测试工作台：`npm run serve`，访问 http://localhost:4173 。`?large` 添加 5000 个节点；`?dark` 初始使用站点深色主题；`?csp` 启用严格 script-src。浏览器重启持久化、Popup 与受限页测试包含在 e2e 脚本。

性能脚本包含没有扩展、安装但关闭、LumaShift 开启、Dark Reader API 对照四组。结果记录页面 GC JS 堆、主线程 CPU 代理指标、进程树 RSS、首屏、切换、多标签页和百次开关趋势。API 对照不等同于完整商店扩展，不能推广为所有真实网页的结论。

补充的交替测试每种规模运行三轮，交换引擎测量顺序并停止双方测试页的视频控件动画，用于核对 CPU 结果的波动。报告生成需要完整的功能、四组性能及交替对照数据。当前证据不足以宣称整体性能已优于 Dark Reader。

## 文件

- docs/requirements.md：用户原始完整需求，保持原文。
- docs/approach.md：选型、设计、隐私和边界。
- docs/performance-budget.md：测试前固定的性能预算。
- docs/test-report.md：实际结果、缺口和已知问题。
- docs/test-matrix.md：人工复现与验收步骤。
- docs/dark-mode-review.md：图标、边框与局部背景覆盖修复及回归记录。
- docs/surface-colors-review.md：通用浅彩色提示、灰色标签层次与文字对比修复及验证边界。
- src/：扩展源码；dist/：可安装构建。
- tests/fixtures/：可控回归页面；scripts/：构建和测试脚本。
- test-results/：机器可读原始数据与实际截图。
- licenses/、docs/third-party.md：开发工具和对照引擎许可。

## 版本管理

主分支为 main。源码、依赖锁文件、文档，以及支撑测试报告的原始数据和截图纳入 Git；依赖目录、dist 构建产物、缓存、临时浏览器资料、日志和本地环境配置由 .gitignore 排除。

修改后用 `git status` 和 `git diff` 检查变更，再用 `git add <文件路径>` 暂存相关文件，执行 `git commit -m "改动说明"` 保存。运行测试可能更新 test-results 中的证据文件，提交前确认它们与报告一致。

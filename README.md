<p align="center">
  <img src="src/icons/icon-128.png" width="96" height="96" alt="LumaShift 图标">
</p>

# LumaShift

自然的深色网页，本地处理。

LumaShift 是 Chrome Manifest V3 扩展，使用独立样式规则引擎将亮色网页转换为深色，同时尽量保留内容层次、语义颜色、媒体原色和页面交互。生产运行时没有第三方 JavaScript 依赖。

[![CI](https://github.com/ljayx/LumaShift/actions/workflows/ci.yml/badge.svg)](https://github.com/ljayx/LumaShift/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

当前版本 **0.1.0，开发中**。复杂网站仍可能存在局部显示问题，已知边界和实际验证结果见[测试报告](docs/test-report.md)。

## 功能

- 自动转换亮色页面，尽量跳过已经呈现深色的网页。
- 按网站选择「自动」「强制转换」或「保持原样」。
- 实时调整全局背景色与文字色，一键恢复默认配色。
- 处理动态内容、常见 CSS 规则、开放 Shadow DOM 和文本选中高亮。
- 关闭时撤销扩展修改，保留网站自身发生的主题和内容变化。
- 设置保存在本地，没有账号、遥测或云服务，详见[隐私与权限](PRIVACY.md)。

## 预览

以下为本地测试页与扩展控制面板的实际截图。

<p>
  <img src="assets/screenshots/theme.png" width="620" alt="LumaShift 深色主题测试页">
  <img src="assets/screenshots/popup.png" width="300" alt="LumaShift 开关、网站规则和配色面板">
</p>

## 安装

需要 **Node.js 22+**、npm 和桌面 **Chrome 120+**。最低 Chrome 版本尚未单独验收，建议使用当前稳定版。

```bash
git clone https://github.com/ljayx/LumaShift.git
cd LumaShift
npm ci
npm run build
```

1. 打开 `chrome://extensions`，开启「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择生成的 **dist** 文件夹。
3. 将 LumaShift 固定到工具栏，打开普通 HTTP/HTTPS 网页。
4. 允许扩展访问需要转换的网站；若限制为「点击时」，自动转换会受限。

扩展默认开启。已有网页在安装或重新授权后会尝试直接注入；开发更新后如旧标签页提示连接已断开，请刷新标签页。多个主题转换扩展同时开启可能互相覆盖。

## 使用

| 控件 | 行为 |
|---|---|
| 全局开关 | 控制所有页面，关闭后保留网站设置 |
| 自动 | 根据页面当前颜色判断是否转换 |
| 强制转换 | 始终应用扩展主题，可覆盖自动误判 |
| 保持原样 | 当前网站不转换 |
| 背景 / 文字颜色 | 更新全局配色，低对比度会提示 |
| 恢复默认 | 只恢复配色，不清除网站规则 |

网站规则按顶层页面的完整主机名保存，子域名分开。Chrome 内部页、扩展商店、PDF 阅读器、file 页面和无痕模式不在支持范围。

## 开发与测试

```bash
npm run check
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npm run test:browser
```

Linux 缺少系统依赖时使用 `npx playwright install --with-deps chromium`。上面的环境变量语法适用于 macOS/Linux；Windows 可先设置同名变量，Windows 流程尚未验证。

| 命令 | 用途 |
|---|---|
| `npm run build` | 构建 dist/，检查生产包输入 |
| `npm test` | 颜色、声明解析、设置单元测试 |
| `npm run test:browser` | 顺序运行核心、暗色规则、背景层次、文本选择回归 |
| `npm run test:perf` | 比较未加载扩展、关闭转换、开启转换三种状态 |
| `npm run test:sites` | 访问公开网站抽查兼容性，需要网络 |
| `npm run profile` | 记录 LumaShift 的 CPU profile |
| `npm run report` | 汇总本地回归和可选性能数据 |
| `npm run serve` | 启动手工测试页 http://localhost:4173 |

浏览器测试共用 4173 端口，使用临时独立浏览器资料，不读取个人 Chrome 数据。请顺序执行，性能测试应单独运行。测试结果、截图与 profile 写入 test-results/，不提交 Git；GitHub Actions 保存回归证据和可加载的扩展产物。

性能结果是可控页面上的主线程、JS 堆和进程 RSS 测量，不能推广为全部网站或长时间运行结论。固定指标见[性能预算](docs/performance-budget.md)。

## 代码结构

```text
src/              扩展源码、Popup 和图标
scripts/          构建、浏览器测试和性能工具
tests/            单元测试和可控 HTML/CSS 页面
docs/             设计、需求、验证记录与已知限制
assets/branding/  图标源图与生成说明
licenses/         开发工具许可证
```

从[技术方案](docs/approach.md)了解引擎和权限设计；[测试矩阵](docs/test-matrix.md)提供手工复现步骤。docs/ 中的专题修复记录保留各自的测试日期，不代表每次构建都已重测所有场景。

## 贡献与许可

欢迎提交 [Issue](https://github.com/ljayx/LumaShift/issues) 和 Pull Request，开发约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。

本项目采用 [MIT 许可证](LICENSE)。开发工具及素材说明见[第三方依赖与资源](docs/third-party.md)。

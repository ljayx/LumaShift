# 参与贡献

欢迎提交可复现的问题、兼容性修复和性能改进。项目采用 [MIT 许可证](LICENSE)。

## 本地开发

需要 Node.js 22+ 和 npm，在仓库根目录执行：

```bash
npm ci
npm run check
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npm run test:browser
```

Linux 缺少浏览器系统依赖时，使用 `npx playwright install --with-deps chromium`。所有浏览器测试共用 4173 端口，必须顺序运行；脚本只使用独立临时浏览器资料。

在 chrome://extensions 加载 dist/。修改代码后重新构建、重新加载扩展，并刷新测试标签页。手工测试页通过 `npm run serve` 启动，访问 http://localhost:4173。

## 修改与验证

- 保留网站交互、媒体原色和关闭后的主题恢复能力；优先实现通用规则，避免通过特定网站选择器掩盖引擎问题。
- 颜色、声明解析和设置逻辑修改运行 `npm test`；引擎、主题识别、权限及 Popup 修改运行 `npm run test:browser`。
- 修复网页兼容性问题时，在 tests/fixtures/ 添加最小复现，不提交登录态、业务数据或完整网页抓取。
- 调度或缓存改动运行 `npm run test:perf`，注明设备、浏览器和测量口径。性能测试须单独顺序执行，不与其他测试或重负载任务同时运行。
- 测试结果、截图和 CPU profile 写入本地 test-results/，不加入 Git。运行 `npm run report` 可更新汇总；提交报告前确认它对应当前代码。

提交 Pull Request 时说明问题、修改后的行为、验证方式及剩余限制。保持修改集中，并保留依赖锁文件；生产包的输入应全部来自 src/。

## 报告问题

在 [Issues](https://github.com/ljayx/LumaShift/issues) 提供 Chrome/系统/扩展版本、可公开访问的页面、操作步骤，以及开启和关闭时的结果。截图请先移除私人信息。无法公开页面时，提供简化 HTML/CSS 复现即可。

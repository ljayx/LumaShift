# 第三方依赖与资源

生产运行时没有第三方 JavaScript 依赖。颜色映射、样式转换、观察器调度、页面世界桥、设置和界面由 src/ 实现；构建脚本检查所有打包输入来自 src/。

| 开发工具 | 固定版本 | 许可证 | 用途 |
|---|---|---|---|
| esbuild | 0.25.12 | MIT | 构建和压缩 |
| Playwright | 1.58.2 | Apache-2.0 | 独立浏览器自动化测试 |

开发工具许可证副本位于 [licenses/](../licenses/)。间接依赖由 package-lock.json 锁定，相关许可随 npm 包保留；Chromium 及其组件的许可随浏览器发行包保留。它们不随 LumaShift 扩展分发。

生产包包含本项目的 LICENSE 和 THIRD_PARTY_NOTICES.txt。图标源图及生成说明见 [assets/branding/](../assets/branding/)；它是生成式图像素材，未经人工重绘为矢量。

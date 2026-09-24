# 深色模式覆盖检查（2026-09-24）

本次从知识库页面的目录图标消失、正文外围仍为浅色出发，检查并修复了通用转换引擎，没有添加知识库专用选择器。

## 原因与修复

| 问题 | 原因 | 修复 |
| --- | --- | --- |
| 目录列表、加号等图标过暗 | SVG 的 fill/stroke 展示属性未被扫描，默认填色仍为黑色 | 增量转换展示属性、渐变 stop-color 和默认 SVG 填色；属性规则保持低优先级，站点 CSS、hover、行内样式继续生效 |
| 正文外圈背景仍为浅色 | background:var(--bg) 后面覆盖 position/repeat/size 时，CSSOM 的背景长属性和简写都可能返回空字符串 | 从原始 CSS 恢复丢失的声明；按源顺序匹配经过浏览器验证的规则，容忍浏览器丢弃不支持的选择器；保留后续布局声明 |
| 半透明边框、细分隔线不明显 | 深色边框又叠加较低透明度；实线阴影被当成普通黑色投影 | 半透明边框提高亮度和最低非零不透明度；零模糊阴影按边框处理，柔和投影继续保持深色 |
| 侧边导航刻度仍过暗 | 刻度使用 2px 高的背景色绘制，被当作普通面板背景压暗 | 对声明为细条的背景使用边框配色，覆盖普通元素、行内样式和伪元素；不增加逐节点布局扫描 |
| 逻辑方向边框遗漏 | 行内处理未覆盖 border-inline、border-block 等声明 | 补充逻辑方向及后续宽度、样式声明 |
| 动态 Shadow DOM 图标漏色 | 组件在 attachShadow 后写 innerHTML，移除了刚插入的基础样式 | 检测并恢复基础样式 |

SVG 属性仍保留在原节点上，关闭时移除派生样式。none、currentColor、渐变引用及 mask/clipPath/filter 内的原始展示属性保留；图像、视频和 Canvas 不做整体反色。

## 验证

- 13 项单元测试通过：颜色映射、透明边框、阴影分类、细线识别、CSS 声明拆分及字符串/URL 保留。
- 14 项端到端回归通过：主题切换、动态内容、CSSOM、跨域 iframe、Shadow DOM、媒体像素和播放、Popup、百次开关清理、重启持久化。
- 专项回归覆盖 SVG 属性/符号/渐变、遮罩、CSS 与 hover 优先级、变量简写、同源外部样式表、伪元素、半透明和逻辑边框、实线阴影、动态 SVG、Shadow DOM、关闭恢复。
- 使用知识库页面引用的真实 realtime CSS 在本地复现卡片正文外圈。背景由 rgb(251, 252, 253) 转为 rgb(24, 28, 37)，背景位置与尺寸保持不变；只使用 CSS，不复制文档内容。
- 在用户重新加载插件后，真实知识库页面的正文外围背景和目录图标已通过截图及计算样式复查。最后补充的背景绘制刻度修复通过真实 CSS 离线回归，需再次重载插件后在旧标签页生效。

运行命令：

```bash
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npm run test:dark
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npm run test:e2e
```

可选真实 CSS 回归：将已经获取的样式文件路径传入 LUMASHIFT_REFERENCE_CSS，再执行 test:dark。该文件不纳入仓库。

证据为 test-results/dark-regressions.json、dark-regressions.png、e2e.json。没有重新执行完整性能对照，不作性能提升结论。原有的图片内部颜色、封闭 Shadow DOM、跨域 CSS 的 @import 等边界不在本次修复范围。

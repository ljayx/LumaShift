# 第三方来源与复用范围

生产运行时没有第三方 JavaScript 依赖。LumaShift 的颜色映射、样式规则转换、观察器调度、页面世界桥、设置和界面均为本项目代码。构建脚本验证 esbuild 输入不包含 darkreader，产物附带 THIRD_PARTY_NOTICES.txt。

| 组件 | 固定版本 | 许可 | 用途与影响 |
|---|---|---|---|
| darkreader | 4.9.132 | MIT | 仅 devDependency，原型与性能对照使用完整 API，不打入 dist；与生产版性能、兼容性均应区分 |
| esbuild | 0.25.12 | MIT | 构建期打包与压缩，不在页面运行 |
| playwright | 1.58.2 | Apache-2.0 | 开发测试；使用独立浏览器，不在生产包运行 |

许可证原文见 ../licenses/。npm 间接依赖版本固定在 package-lock.json，浏览器和自动化工具本身的许可随其发行包保留。

scripts/engine.mjs 仅对基线 API 作 MV3 适配：将上游内联代理脚本拆成随测试扩展打包的 MAIN-world 脚本；禁用主动关闭网站主题插件的逻辑；恢复原型时避免覆盖站点后续修改。该文件不供生产构建调用。

基线保留上游引擎内部的缓存、观察器与规则处理。双方禁用图片分析、使用相同配色和控制层；测试报告明确这个对照不是完整商店版 Dark Reader。第三方版本升级需复核适配补丁并重新运行对照，不把新版本性能直接继承为旧结论。

基线还保留 Chrome runtime.sendMessage 的 Promise 返回值，避免上游 API 的消息包装吞掉 LumaShift 控制层所需的返回值；这属于集成适配，不是 Dark Reader 引擎性能优化。

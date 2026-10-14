# 开发指南

本项目使用原生 JavaScript、HTML 和 CSS。扩展直接运行仓库中的静态文件，无需编译，没有第三方运行时或测试依赖。

## 环境与加载

开发检查使用 Node.js 22+；浏览器回归需要本机 Chrome / Chromium，依赖 Node.js 提供的原生 WebSocket。

开发时在 Chrome / Edge 扩展管理页加载包含 `manifest.json` 的仓库目录。修改源码后，先重新加载扩展，再刷新 ChatGPT 标签页。仅刷新网页不会更新已经运行的扩展后台代码。

## 检查与测试

```bash
npm run check
npm test
npm run test:browser
```

| 命令 | 验证范围 |
| --- | --- |
| `npm run check` | 源码、测试与工具脚本语法，Manifest 引用，以及版本与许可证元数据 |
| `npm test` | 格式生成、选中消息与角色筛选、模板与备份校验、本地资料并发和草稿隔离等逻辑 |
| `npm run test:browser` | 本地 Chromium 夹具中的目录、搜索、阅读、输入、收藏、模板、备份与草稿交互，以及 DOM 提取兼容性 |

测试会自动查找 macOS / Windows 常见安装位置和 `PATH` 中的 Chrome / Chromium 可执行文件。设置 `CHROME_PATH` 时优先使用指定路径：

```bash
CHROME_PATH=/path/to/chromium npm run test:browser
```

浏览器测试启动独立临时配置，通过 DevTools 协议加载本地夹具并拦截页面网络请求。测试运行实际资料处理代码，但模拟 Chrome 扩展消息与存储接口，不使用登录账号。

截图默认写入系统临时目录下的 `chatgpt-assistant-browser-artifacts`。需要保存到指定位置时设置 `BROWSER_ARTIFACT_DIR`，例如：

```bash
BROWSER_ARTIFACT_DIR=test-results/browser npm run test:browser
```

该测试不覆盖浏览器真实权限、实际扩展后台生命周期或实时 ChatGPT 站点的全部状态。修改站点适配、输入或权限时，还需人工加载扩展验证相关流程；公开报告时应分别说明自动化测试和人工验证范围。

持续集成运行于 Ubuntu 24.04，使用 Node.js 22 / 24 运行质量检查，并使用 Node.js 22 与 Chromium 运行浏览器夹具回归。项目无 npm 依赖，不需要执行 `npm install`。

## 代码结构

| 路径 | 职责 |
| --- | --- |
| `manifest.json` | Manifest V3 配置、站点范围、权限和快捷键 |
| `popup.html` / `popup.css` / `popup.js` | 导出弹窗、预览和助手快捷入口 |
| `options.html` / `options.css` / `options.js` | 独立资料管理页 |
| `src/background.js` | 后台服务、右键菜单、快捷导出与打开弹窗 |
| `src/content.js` | 当前页面消息提取、清洗、公式源码恢复、逐条选择与下载 |
| `src/export-core.js` | 导出选项、消息筛选、Markdown / HTML 生成与文件名 |
| `src/assistant-core.js` | 模板、搜索、资料校验、备份格式与草稿数据结构 |
| `src/assistant-store.js` | 后台串行存储写入、资料空间和草稿管理 |
| `src/assistant-page.js` | 页面消息索引、定位、高亮、阅读、引用与输入操作 |
| `src/assistant-drafts.js` | 草稿捕获、恢复、发送确认和过期检查 |
| `src/assistant-ui.js` | 页面助手与独立管理页的共用界面 |
| `tests/` | Node.js 单元测试、浏览器交互回归和合成对话夹具 |
| `icons/` | 扩展图标 |
| `scripts/` | 项目检查、打包和包结构验证 |

## 修改原则

- 将可独立验证的数据处理留在核心模块中；页面 DOM 适配集中在页面模块。
- 保留输入框已有文字和中文组合输入状态。模板、追问和草稿恢复不得自动发送消息。
- 页面增强控件和折叠状态不能进入导出结果。
- 修改持久数据结构时保留版本校验和恢复路径；跨标签页写入经后台串行处理。
- 增加权限、持久保存内容或网络行为时，同步更新 [隐私说明](../PRIVACY.md)。
- 夹具使用合成内容。不要提交聊天记录、账号标识、令牌、浏览器配置或真实备份。

新增行为应使用适当层级的回归测试。DOM 或输入兼容性问题优先提供最小合成夹具，避免只按某个真实会话的偶然结构修复。

## 打包

项目作为浏览器扩展发行。`package.json` 中的 `private: true` 用于避免误发布到 npm，不影响仓库公开或扩展分发。

```bash
npm run package
npm run check:package
```

当前版本生成 `dist/chatgpt-enhanced-exporter-0.3.2.zip`。打包命令只收集扩展运行所需的配置、页面、脚本、图标以及许可证和隐私说明，不包含 Git 历史、开发文档或测试。ZIP 内的 `manifest.json` 位于根目录，用户解压后即可加载该目录。

新增或移除扩展运行文件时，同步更新 `scripts/extension-files.mjs` 中的发布白名单；被页面或 Manifest 引用的资源也必须包含在包内。

`npm run check:package` 需要先完成打包，会检查包内容和路径，并确认包内文件与当前源码一致。修改源码或版本后请重新打包。

包结构检查不能代替实际扩展加载。发布前应解压生成的包，在 Chrome / Edge 中加载，并人工检查此次修改涉及的功能。发布版本时保持 `manifest.json` 与 `package.json` 版本一致，并更新 [更新记录](../CHANGELOG.md)；弹窗自动读取 Manifest 版本。

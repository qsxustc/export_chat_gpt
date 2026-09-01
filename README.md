# ChatGPT 对话增强导出

一个本地运行、无第三方依赖的 Chrome / Edge Manifest V3 扩展，用于把当前 ChatGPT 会话导出为 Markdown 或可离线阅读的独立 HTML 文件。

## 已实现功能

- 导出当前 ChatGPT 对话为 `.md` 或独立 `.html`
- 按消息序号范围导出，例如仅导出第 5～12 条
- 在 ChatGPT 页面逐条勾选不连续消息，例如仅导出第 1、3、8 条
- 按角色筛选：用户消息、ChatGPT 回复
- 可选角色标题、导出元信息、来源链接和消息分隔线
- HTML 支持跟随系统、浅色和深色主题，并带打印样式
- 保留常见富文本：标题、列表、链接、图片、引用、代码块、表格和 LaTeX 源码
- 导出前预览、复制到剪贴板、自定义安全文件名
- 右键菜单快速导出 Markdown / HTML
- 快捷键 `Alt + Shift + M` 快速导出 Markdown
- 设置保存在浏览器本地；对话内容不会上传到任何服务器

> 当前版本聚焦“当前已打开的单个对话”。批量历史会话导出、附件下载等规划见 [TODO.md](./TODO.md)。

## 安装

### Chrome

1. 打开 `chrome://extensions/`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目目录：`/Users/qsx/code/export_chat_gpt`。
5. 打开或刷新 `https://chatgpt.com/`。

### Edge

1. 打开 `edge://extensions/`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择本项目目录并刷新 ChatGPT 页面。

## 使用方法

1. 在 ChatGPT 打开希望导出的具体对话。
2. 等待对话内容加载完毕，然后点击浏览器工具栏中的扩展图标。
3. 选择 Markdown 或 HTML、消息范围和内容选项。
4. 如需导出不连续消息，点击“在页面逐条选择”，在 ChatGPT 页面勾选消息后点击“完成选择”，再重新打开扩展。
5. 可先展开“内容预览”，再点击“导出文件”或“复制”。

逐条选择模式支持全选、反选和清空，也可以按 `Esc` 取消。勾选结果只在当前页面与本次弹窗中临时保留；导出设置弹窗关闭后会自动清理，不会写入 ChatGPT 页面数据或浏览器持久存储。

也可以在 ChatGPT 页面点击右键直接快速导出，或使用 `Alt + Shift + M`。

## 导出格式说明

### Markdown

输出包含可选 YAML Front Matter、会话标题和按角色划分的消息。适合 Obsidian、Notion、GitHub、静态站点或版本管理。

### HTML

输出是单一 HTML 文件，样式已经内嵌，不需要扩展即可打开和打印。文本内容可离线阅读；远程图片仍依赖原图片 URL 是否有效。

## 隐私与权限

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 读取用户主动打开并点击扩展的 ChatGPT 标签页 |
| `clipboardWrite` | 在用户点击“复制”时写入导出内容 |
| `scripting` | 扩展刚安装而页面尚未刷新时注入读取脚本 |
| `storage` | 在浏览器本地记住导出选项 |
| `contextMenus` | 提供右键快捷导出 |
| ChatGPT 站点访问 | 仅在 `chatgpt.com` / `chat.openai.com` 提取当前页面已显示的消息 |

扩展没有后端、埋点或远程脚本。导出过程全部在浏览器本地完成。

## 本地开发与检查

本项目不需要安装依赖：

```bash
npm run check
npm test
```

修改源码后，在扩展管理页点击“重新加载”，再刷新 ChatGPT 标签页。

## 项目结构

```text
.
├── manifest.json          # Manifest V3 配置
├── popup.html             # 导出设置界面
├── popup.css
├── popup.js
├── src/
│   ├── background.js      # 右键菜单与快捷键
│   ├── content.js         # ChatGPT DOM 提取、清洗与下载
│   └── export-core.js     # Markdown / HTML 生成核心
├── icons/
├── tests/
└── TODO.md                # 需求池与迭代计划
```

## 已知限制

- ChatGPT 页面 DOM 会持续变化；如果官方改版，消息选择器可能需要同步维护。
- 只能导出当前页面中已经加载的内容；尚未滚动加载的分支或历史内容不会被自动请求。
- HTML 中的远程图片不会自动内嵌，原链接失效后图片可能无法显示。
- Canvas、交互式图表、语音、视频和部分自定义 GPT 小组件目前只能保留可读取的文本。
- 公式以 LaTeX 源码保存，独立 HTML 当前不内置 MathJax/KaTeX 渲染器。

## License

MIT

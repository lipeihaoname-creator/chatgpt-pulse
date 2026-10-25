# ChatGPT Pulse 0.16.6 · 首个公开测试版

一个读取本地 Work / Codex 日志的桌面监测工具，提供小型悬浮条和角色头像两种布局。Mac 与 Windows 使用统一的 0.16.6 共用代码；这是首个公开测试版本。

## 下载选择

- Mac：`ChatGPT-Pulse-0.16.6-mac-universal.dmg`，打开后拖入 Applications；最低 macOS 13.3，包含 Apple Silicon 与 Intel。
- Windows x64：默认 `ChatGPT-Pulse-0.16.6-windows-x64-setup.exe`，含 WebView2 安装组件的完整离线版。
- Windows x64 小体积版本：`ChatGPT-Pulse-0.16.6-windows-x64-online-setup.exe`，缺少 WebView2 时需联网。
- 源码：`ChatGPT-Pulse-0.16.6-source.zip`。各附件校验见 `SHA256SUMS`。

两个 Windows 包共用同一程序，任选一个。安装后不需要 Node、Rust、Python 或开发服务器。离线安装不表示 Work 本身可以脱网工作。

## 这一版

- 新日志没有任务起始累计基线时，保留未知的任务总量；两条后续真实用量报告仍可计算区间速率，不再整轮隐藏。
- 会话累计和本轮用量明确区分，主窗口与气泡口径一致，真实零值不被历史数值覆盖。
- 保留一个人物、多任务气泡/合并显示、拖动锁定、贴边收纳、粒子、头像表情平滑衔接和自定义裁剪。
- Windows 加固重复启动、窗口恢复、启动错误提示和数据库短暂占用；Mac 新增 DMG 拖入安装流程。
- 默认不保存历史，只读取兼容本地日志中的状态与数字，不保存正文、不调用额外 AI 或收费 API。

## 验证边界

Mac 结果见 [Mac 验收](https://github.com/lipeihaoname-creator/chatgpt-pulse/blob/main/docs/MAC_ACCEPTANCE.md)，Windows 本机交接结果见 [Windows 验收](https://github.com/lipeihaoname-creator/chatgpt-pulse/blob/main/docs/WINDOWS_ACCEPTANCE.md)。Intel 实机、其他电脑、Windows 10、Windows ARM64、缺少 WebView2 的干净环境仍分别列为未测；不把编译、浏览器模拟或另一平台的通过记录冒充实机验收。GitHub CI 结果以仓库实际运行记录为准，不以本地测试代替。

Mac 使用临时签名，未完成 Developer ID 签名和公证；Windows EXE 未签名。没有购买签名服务，也不要求用户关闭系统安全功能。普通聊天、浏览器聊天及没有兼容日志的云端 Work 不支持。

## 许可

项目代码适用 PolyForm Noncommercial 1.0.0 加内部使用附加许可，免费供个人及组织内部使用，属于源码公开。第三方依赖保留原条款，随源码与应用提供许可和 MPL 源码归档。

本项目为非官方、非商业同人项目，与 OpenAI 和原作官方无关联。麻衣、洛琪希图集为 AI 辅助制作的非官方同人素材，原角色相关权利归各自权利人所有，项目代码许可不授予角色素材的相关权利，不表示获得官方授权或背书。

遇到问题请附上系统版本、缩放设置、复现步骤和脱敏截图，通过 [Issues](https://github.com/lipeihaoname-creator/chatgpt-pulse/issues) 反馈；不要上传个人日志、聊天正文、账号凭据或设置数据库。

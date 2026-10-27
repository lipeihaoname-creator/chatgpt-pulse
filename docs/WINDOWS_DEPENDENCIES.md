# Windows 依赖证据 · 2026-10-24

本机 x86_64-pc-windows-msvc 实际解析图：264 个 Rust 包（含构建依赖）。元数据声明与本地许可文本分别核对，不代表每个包都会独立链接到最终程序。

清单：licenses/windows-dependency-inventory.json；通知：THIRD_PARTY_NOTICES.txt。原 Mac 清单保留，并链接此平台清单。前端 svelte 与 @tauri-apps/api 仍保留原许可。

项目仍采用 PolyForm Noncommercial 1.0.0 + 内部使用附加许可。第三方依赖保持自己的许可，角色素材公开分发权仍待复核；0.16.6 已公开预发布，安装验证范围见 [Windows 验收记录](WINDOWS_ACCEPTANCE.md)。

5 份 MPL 原始 .crate 源码归档已逐项按 Cargo.lock 核验 SHA-256，并随 licenses/mpl-sources 提供；没有修改依赖源码。

Tauri plugin 的缺失工作区许可，从相同仓库且相同提交的 tauri 2.12.4 源码归档收集；保留 MIT 和 Apache-2.0 文本。plist 的 LICENCE 文件按原文收集。

Windows 原生主按钮代码只链接系统 User32；测试诊断另用系统 Shcore，均不捆绑这些系统 DLL。Rust/pnpm/.tools 是构建工具，不是最终软件运行依赖。

NSIS 策略：currentUser、现有 icon.ico、简体中文/英语。默认离线版使用 WebView2 offlineInstaller，缺失运行时时无需再下载；小体积联网版使用 embedBootstrapper。已有运行时直接复用。没有购买签名。NSIS COPYING 随 licenses/tools 提供；不把构建工具链打进安装包。

## 上游许可文本缺口

本次解析图中的许可声明与文本均已收集；此结论不包含素材公开分发权和 NSIS 工具最终复核。


可在普通 PowerShell 执行 scripts/windows-package.ps1。脚本只下载固定上游提交的许可文本到项目，补齐后才允许打包；不更换全局工具、不修改安全设置。

# Windows 安装与使用

当前公开测试版：[0.16.6](https://github.com/voidlph-dev/chatgpt-pulse/releases/tag/v0.16.6)，面向 Windows 10/11 x64。Windows 11 本机测试已执行；Windows 10、ARM64、其他电脑和缺失 WebView2 的干净系统尚未实机认证。

## 选择安装包

- 默认推荐完整离线版（226.46 MiB）：[`ChatGPT-Pulse-0.16.6-windows-x64-setup.exe`](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.16.6/ChatGPT-Pulse-0.16.6-windows-x64-setup.exe)，内含微软原版签名有效的完整 WebView2 安装组件。电脑缺少运行时时可离线补齐，无需再下载安装依赖。
- 小体积联网版：[`ChatGPT-Pulse-0.16.6-windows-x64-online-setup.exe`](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.16.6/ChatGPT-Pulse-0.16.6-windows-x64-online-setup.exe)，20.62 MiB；已有 WebView2 时直接使用，缺失时通过微软引导程序联网安装。

两版程序相同，均为当前用户安装，无需 Node.js、Rust、Python、Visual Studio 或额外 SQLite。完整包较大是因为包含运行时；构建缓存和开发工具不进入安装包。已有 WebView2 的电脑会复用运行时。

运行安装器，按向导完成安装即可。支持中文和含空格的安装路径。再次点击图标会打开已有窗口，不启动多份程序；主窗口关闭后可继续在托盘运行，再次打开可恢复。启动失败会显示错误说明，保留设置文件以便排查。

本公开测试版 EXE 未签名，Windows 可能提示发布者未知。核对来源和 SHA-256；无需关闭系统安全功能。WebView2 是微软组件，适用微软条款，未被重新许可。

## 下载与校验

先下载上面的一个 EXE，再下载同一版本的 [SHA256SUMS](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.16.6/SHA256SUMS)，放在同一目录。不要选择 GitHub 自动生成的 Source code ZIP 作为安装包。如果 Release 附件区加载失败，可直接使用本页的 EXE 链接。

在该目录打开 PowerShell，运行以下命令。联网版请修改第一行文件名：

```powershell
$PulseInstaller = 'ChatGPT-Pulse-0.16.6-windows-x64-setup.exe'
$PulseChecksumLines = @(Get-Content -LiteralPath '.\SHA256SUMS' | Where-Object { ($_ -split '\s+', 2)[1] -eq $PulseInstaller })
if ($PulseChecksumLines.Count -ne 1) { throw '校验清单中没有唯一匹配的安装器，请重新下载同版本文件。' }
$PulseExpected = ($PulseChecksumLines[0] -split '\s+', 2)[0]
$PulseActual = (Get-FileHash -LiteralPath $PulseInstaller -Algorithm SHA256).Hash
if ($PulseActual -ine $PulseExpected) { throw 'SHA-256 不一致，请勿运行此文件，重新从官方仓库下载。' }
Write-Output 'SHA-256 一致，可以继续安装。'
```

下载失败时，先核对文件名中的版本与系统架构，重试直链或 [v0.16.6 Release](https://github.com/voidlph-dev/chatgpt-pulse/releases/tag/v0.16.6)。离线版仅表示安装所需 WebView2 组件已包含，应用读取本地日志和 Work 本身的联网要求不因此改变。

## Work 与用量

默认自动发现当前用户 `.codex/sessions` 中的兼容本地日志。自定义位置通过 Pulse 进程的绝对路径 `CODEX_HOME` 设置。没有兼容本地日志的云端 Work、普通聊天和浏览器聊天暂不支持；安装 Pulse 本身不会产生工作日志。

状态来自任务、推理、回复和工具事件。Token 直接取日志报告的累计值；有起始基线时显示任务输出，缺少基线时明确标为“会话累计输出”，不估算本轮数量。两次带有效时间的真实累计上报后，可以显示该段区间速率，即使整轮起始基线未知；首次上报前或时间不完整时显示等待上报/未知。推理已包含在输出中。缺少有效时间或基线时速率为 `—`，不表示零，也不是模型逐秒解码速度。

“监测详情”可关闭自动跟随，暂停后选择其他日志，再开始监测。悬浮窗右键打开菜单；用 `Ctrl+Alt+Shift+P` 或主窗口“编辑悬浮条”进入编辑；偏好设置中可以显示累计输出、修改外观和调整位置。退出使用托盘菜单。

## 升级与卸载

升级前退出旧 Pulse，运行新版安装器并沿用原目录。设置、头像与可选摘要保留。当前采用手动下载安装，没有自动更新服务。

在 Windows“已安装的应用”选择 ChatGPT Pulse 卸载，或运行安装目录的卸载程序。默认保留用户数据；只有明确选择删除应用数据时才删除。安装器与源码包均不包含个人日志、账号配置或设置数据库。

## 发行边界

0.16.6 已于 2026-10-25 作为 [GitHub 公开预发布版本](https://github.com/voidlph-dev/chatgpt-pulse/releases/tag/v0.16.6) 发布。代码使用 PolyForm Noncommercial 加内部使用附加许可，属于源码公开。角色素材的公开分发授权未确认。完整验收记录见 [Windows 验收报告](WINDOWS_ACCEPTANCE.md)，后续干净系统验收步骤见 [Windows 发布复核清单](WINDOWS_RELEASE_CHECKLIST.md)。

离线分发方式依据：[微软 WebView2 部署文档](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution#offline-deployment)。

# 0.18.3 · Mac 音频启动修复

本次更新 Mac：等待音频设备就绪，并对首次健康但持续全零的音频流有限重连，减少需要手动开关的情况。正常静音、工作优先级、真实日志 Token 及既有个性化设置保持原行为。新增两段真实音频驱动的原生演示。

下载 Mac DMG 或同一应用 ZIP；Mac 最低 13.3，音乐采集需 14.2+。仍为临时签名、未公证。覆盖音乐版可保留原设置及音频授权；从 0.16.6 桌面身份升级仍需重新配置，旧数据保留。

Windows 本次没有重新打包，继续使用 [最新发布页中的 Windows 安装器](https://github.com/voidlph-dev/chatgpt-pulse/releases/latest)，不能将本次 Mac 修复或云端编译等同于 Windows 新安装器实机验收。

126 项 Mac Rust、84 项前端、29 套界面回归，以及首流全零恢复和真实音频验收的范围见 [修复报告](MAC_AUDIO_STARTUP_0.18.3.md)。Intel/异机及实体音频设备组合仍待验证。根许可、角色说明及非商用条件不变。

## 当前下载

[ChatGPT-Pulse-0.18.2-windows-x64-music-offline-setup.exe](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.18.3/ChatGPT-Pulse-0.18.2-windows-x64-music-offline-setup.exe)

[ChatGPT-Pulse-0.18.2-windows-x64-music-online-setup.exe](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.18.3/ChatGPT-Pulse-0.18.2-windows-x64-music-online-setup.exe)

[SHA256SUMS.txt](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.18.3/SHA256SUMS.txt)

Windows 文件版本仍为 0.18.2，只是统一下载位置；Mac 为 0.18.3。

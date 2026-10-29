# 0.18.2 音乐律动公开测试版

本版提供 Mac 音乐版和 Windows 已验收的原始音乐安装器。历史 0.16.6 Release 保留供回退。

新增本机系统播放音频频谱、空闲人物律动和随机音乐话题。音频默认关闭，手动启用；不使用麦克风、不保存/上传声音、不调用额外模型。六种频谱与外观参数、最多 12 个命名方案、JSON 导入/复制分享在两端使用同一公共实现。工作、拖动、点击对话和勿扰优先，原有真实日志 Token 口径不变。

| 资产 | 用途 |
| --- | --- |
| `ChatGPT-Pulse-0.18.2-mac-universal.dmg` | Mac 音乐版；包含 Apple Silicon/Intel，最低应用系统 13.3，采集需 14.2+ |
| `ChatGPT-Pulse-0.18.2-mac-universal.zip` | 同一 Mac 应用的 ZIP 备份 |
| [ChatGPT-Pulse-0.18.2-windows-x64-music-offline-setup.exe](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.18.2/ChatGPT-Pulse-0.18.2-windows-x64-music-offline-setup.exe) | Windows 默认完整离线安装器，原交付字节，不重新命名 |
| [ChatGPT-Pulse-0.18.2-windows-x64-music-online-setup.exe](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.18.2/ChatGPT-Pulse-0.18.2-windows-x64-music-online-setup.exe) | Windows 较小联网替代包；缺失 WebView2 时需联网 |
| `ChatGPT-Pulse-0.18.2-source.zip` | 选择性合并后的公共源码；不含用户数据、依赖及缓存 |
| [SHA256SUMS.txt](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.18.2/SHA256SUMS.txt) | 上述资产和可交付报告的校验值 |

Mac 临时签名、未公证；Windows 安装器未签名。不声称安全提示消失，不要求关闭系统安全功能。Windows 音乐最低 10 1703；既有安装器实测电脑为 Windows 11 25H2 x64、150% 缩放，不能扩写为 Windows 10/异机或全部缩放已实测。

Windows 实测包括默认设备回环、65 秒静音后自动恢复、原生 WebView2、隔离两任务、安装升级与保留数据库。独立标准用户、真正断网/缺少 WebView2 的干净系统、硬件插拔与系统服务重启未验证。详见 [原交付报告](WINDOWS_MUSIC_REPORT.md)。

Mac 发布身份沿用已验收的音乐版。0.16.6 用户升级后重新配置偏好和音频权限，旧数据保留；不承诺自动迁移。Mac 的实际合并回归见 [Mac 合并报告](MAC_MERGE_REPORT.md)，完整数值及证据在候选目录。两端的测试、安装及素材/代码许可边界不能互相替代。

Windows 附件为交接验收的原二进制；仓库包含后来修复的共享窗口/启动监测代码，已通过云端测试与编译，但这些修复没有重新打入 Windows 附件。构建来源及二进制 SHA-256 见随包 BUILD_PROVENANCE.json；不要把原 Windows 验收等同于当前源码实机验收。

安装与升级详见 [Mac 安装说明](MAC_INSTALL.md) 和 [Windows 安装说明](WINDOWS_INSTALL.md)。无自动更新服务，用户手动下载对应安装包。公开测试版不保证所有机器和设备组合均已通过。

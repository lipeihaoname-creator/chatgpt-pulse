# 0.18.2 音乐律动：两端合并候选

当前为本地可审阅候选，未创建新的 GitHub 发布。不要把历史 0.16.6 下载地址当作此版本；不要替换已经存在的 Release。

新增本机系统播放音频频谱、空闲人物律动和随机音乐话题。音频默认关闭，手动启用；不使用麦克风、不保存/上传声音、不调用额外模型。六种频谱与外观参数、最多 12 个命名方案、JSON 导入/复制分享在两端使用同一公共实现。工作、拖动、点击对话和勿扰优先，原有真实日志 Token 口径不变。

| 资产 | 用途 |
| --- | --- |
| `ChatGPT-Pulse-0.18.2-mac-universal.dmg` | Mac 合并音乐候选；包含 Apple Silicon/Intel，最低应用系统 13.3，采集需 14.2+ |
| `ChatGPT-Pulse-0.18.2-mac-universal.zip` | 同一 Mac 应用的 ZIP 备份 |
| `ChatGPT-Pulse-0.18.2-windows-x64-music-offline-setup.exe` | Windows 默认完整离线安装器，原交付字节，不重新命名 |
| `ChatGPT-Pulse-0.18.2-windows-x64-music-online-setup.exe` | Windows 较小联网替代包；缺失 WebView2 时需联网 |
| `ChatGPT-Pulse-0.18.2-source.zip` | 选择性合并后的公共源码；不含用户数据、依赖及缓存 |
| `SHA256SUMS.txt` | 上述资产和可交付报告的校验值 |

Mac 临时签名、未公证；Windows 安装器未签名。不声称安全提示消失，不要求关闭系统安全功能。Windows 音乐最低 10 1703；既有安装器实测电脑为 Windows 11 25H2 x64、150% 缩放，不能扩写为 Windows 10/异机或全部缩放已实测。

Windows 实测包括默认设备回环、65 秒静音后自动恢复、原生 WebView2、隔离两任务、安装升级与保留数据库。独立标准用户、真正断网/缺少 WebView2 的干净系统、硬件插拔与系统服务重启未验证。详见 [原交付报告](WINDOWS_MUSIC_REPORT.md)。

Mac 当前身份沿用音乐候选以保留本机偏好和授权；与早期公开桌面身份不同，跨身份升级尚未验收。Mac 的实际合并回归见 [Mac 合并报告](MAC_MERGE_REPORT.md)，完整数值及证据在候选目录。两端的测试、安装及素材/代码许可边界不能互相替代。

下一步是审阅最终资产、确认 Mac 公开身份及升级路径、核实发布授权，再创建全新 Release；不覆盖旧版。没有这些确认时保留候选，不填写尚不存在的 GitHub 下载链接。

# ChatGPT Pulse：Windows 音乐律动移植任务

请直接执行本任务，不依赖旧聊天记录。先读取本交接包的 README、校验清单、Mac 检查报告及参考源码。不要只给计划，持续实现、测试并交付可安装的 Windows 候选版。

## 项目和工作方式

项目历史地址：https://github.com/voidlph-dev/chatgpt-pulse 。Mac 音乐分支当前为 0.18.2，本交接包包含该版本源代码；音乐功能尚未推送 GitHub。单独拉取公开仓库可能没有这些代码。

Windows 之前已有可以安装的版本，并曾修复过安装/下载问题。**先找到 Windows 电脑上实际使用的最新项目和修复记录，检查 Git 状态并保存当前改动；不要用本包整体覆盖 Windows 项目。** 将 Mac 源码解压到独立的参考目录，对比后移植公共音乐功能，保留 Windows 已验证的安装器、启动联动、路径、依赖处理、单实例和卸载逻辑。`music-feature.patch` 只供比较，不要盲目应用。

本任务在 Windows 本机完成，不尝试远程连接 Mac，也不创建新的对话。先盘点 Node、pnpm、Rust MSVC、C++ Build Tools、Windows SDK、WebView2 和浏览器。优先复用已有工具；项目依赖放在项目目录。未经许可不安装系统组件/驱动、不修改全局工具链、不提权、不收费、不向 GitHub 推送或发布、不接入额外 AI/API。缺少环境或联网失败时说明具体阻塞并给出普通 PowerShell 可执行的最短步骤，不反复重装已有组件。

保持当前非商用许可及素材说明不变，本任务不重新讨论或扩大素材授权。

## 目标与现有公共实现

Windows 提供与 Mac 相同的系统播放音频频谱、空闲人物律动、音乐话题和个性化方案。不要重做已有 UI、角色图像和动画，不增加头像数量，也不要恢复已删除的普通聊天监测。

可复用的主要文件：

- `src-tauri/src/audio_analysis.rs`：固定内存 FFT 2048 点、24 个对数频段、RMS、low/mid/high、稳定声音时长、节拍序号及强度。
- `src-tauri/src/music.rs`：生命周期、事件发布、窗口可见性、采集轮次和状态；当前非 Mac 分支只有 unsupported 占位。
- `src-tauri/src/spectrum.rs`、`src-tauri/src/data.rs`：设置校验、迁移、命名方案和原子应用。
- `src/lib/music.js`、`audio-order.js`、`music-animation.js`、`portrait-motion.js`：音频订阅、过期与乱序保护、约 60Hz 平滑、姿态优先级及零强度/静音停绘。
- `src/lib/music-settings.js`、`spectrum-design.js`、`src/MusicSpectrum.svelte`、`SpectrumStudio.svelte`、`SpectrumPreview.svelte`：全部样式与配置。
- `src/MusicSettings.svelte`、`MonitorFace.svelte`、`MaiAvatar.svelte`、`Overlay.svelte`、`src-tauri/src/windows.rs`：页面、人物、粒子和悬浮窗集成。
- `docs/MUSIC_REACTIVE.md`、`docs/SPECTRUM_STUDIO.md`：功能细节；不要把技术说明长文堆回软件页面。

Mac 原生采集文件 `src-tauri/native/system_audio.m` 和 macOS 构建部分仅作接口参考，保留并继续按平台编译，不能让 Windows 构建依赖 Apple 工具。

## Windows 原生音频方案

实现 **WASAPI shared-mode loopback**，跟随默认播放端点（render），不是麦克风端点。优先使用项目已有的 Windows 原生封装；如确需新的 Rust Windows API 依赖，按 `cfg(target_os="windows")` 限定，锁定版本并说明许可，不引入 Python/Node 常驻采集服务、FFmpeg、虚拟声卡或 Stereo Mix 驱动要求。

参考微软原始文档后实现，不凭记忆猜接口：

- Loopback：https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording
- GetBuffer/ReleaseBuffer：https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer
- 设备失效恢复：https://learn.microsoft.com/en-us/windows/win32/coreaudio/recovering-from-an-invalid-device-error
- 默认端点变化：https://learn.microsoft.com/en-us/windows/win32/api/mmdeviceapi/nf-mmdeviceapi-immnotificationclient-ondefaultdevicechanged

专用采集线程负责 COM 初始化、设备、IAudioClient/IAudioCaptureClient 和清理；COM 对象在所属线程创建、使用、释放，最后匹配 CoUninitialize。不要靠未经证明的 unsafe Send/Sync 把对象跨线程移动。事件等待有停止信号或有限超时，不阻塞 UI，关闭或退出后及时停止并清零缓冲。

使用 eRender 默认输出端点、shared mode、AUDCLNT_STREAMFLAGS_LOOPBACK；Windows 10 1703+ 可用事件驱动 loopback，具体最低系统版本须与现有 Windows 支持范围核对。不要为了采集改变默认播放设备、独占输出、系统音量或用户声音设置。

使用实际 mix format，正确处理 IEEE float、PCM/PCM extensible 的有效位深、块对齐、采样率、多声道和非有限值。读取并释放完整数据包；处理 SILENT、DATA_DISCONTINUITY、TIMESTAMP_ERROR、设备/资源失效和音频服务异常，不能将静音指针当普通 PCM 解引用。转换为有界 f32 输入，复用 Analyzer；不要直接把 24 个频段当波形，也不要用随机数制造活动。默认设备跟随及耳机/蓝牙切换、设备移除和唤醒要释放旧流、重新枚举并重连，有限退避，避免高频失败循环。

### 必须处理的跨平台陷阱

1. **正常无声不等于采集失败。** 某些 Windows loopback 静音时没有包。Mac 共用循环目前有“8 秒没有回调/数据则 unavailable”的检查，不能照搬到 Windows；将设备健康、正常 idle/no-packet 和真正故障分开。正常静音持续一分钟后仍应在声音恢复时自动响应。
2. `Stream::read` 当前只返回数量、采样率、回调数。按需要补充明确的健康/错误信号；不要吞掉 HRESULT 再伪装成静音，也不要伪造“成功回调计数”。共用接口调整必须保持 Mac 分支编译与行为。
3. `src/MusicSettings.svelte` 有“请在 Mac 桌面应用使用”、`platform !== 'macos'` 等文案判断，Windows 后端成功后仍保留会误报不支持；改成实际支持状态与平台说明。
4. 将 `cfg(not(target_os="macos"))` 拆成 Windows 实现和其余平台 fallback，保留 macOS 原实现及音频权限说明。
5. WebView2 隐藏/失焦/最小化行为须实测。原生可见但未聚焦时正常响应，真正隐藏时停绘；不能因 document.hidden 错停可见窗，也不能让隐藏窗持续刷新。
6. 音频频谱开启时，Windows 的悬浮窗尺寸、边缘约束、编辑按钮、点击区域与多任务群组要包含既有 16 个逻辑像素的底部空间；正确处理物理像素与缩放，不能截断、跳位或产生透明拦截区。

## 公共契约与功能一致性

保留 `music_status`、仅主窗口允许的 `music_start`、`music_enabled` 开关和关闭/退出时释放资源。默认关闭；开关首次由用户开启，保存偏好后重启可恢复连接。不得擅自启用麦克风、修改系统权限或安装驱动。工具/系统若另要求确认，说明原因后让用户完成。

事件：悬浮窗接收 `pulse:audio`，主窗口低频接收 `pulse:audio-status`。保留 `supported/status/detail/epoch/sequence/at/view_visible` 及 `bars[24]/rms/low/mid/high/active/stable_seconds/beat/beat_strength`。`at` 为 Unix 毫秒；epoch 代表捕获轮次，所有特征与状态包的 sequence 在同轮次递增。拒绝旧轮次/乱序事件及延迟快照，错误状态不能被旧 active 盖掉。原始 PCM 不进入事件或前端。

约 25Hz 分析、前端约 60Hz 平滑；减少动态效果降频并停止人物身体律动，隐藏停绘。零强度、静音和过期音频不启动空转姿态帧，不反复写入同一 DOM 标记。声音恢复后自动响应，长暂停不补播旧节拍。

必须带上六种样式：横条、下缘半环、跳动光点、柔光频谱曲线、镜像声柱、像素灯阵。保留刚调好的半环中间饱满、两端渐细、端部不挤；不得擅自恢复均匀密集项圈。参数包含配色、12/18/24 条、粗细、高度、响应强度、条带对比度（1–3，默认 2）、回落、透明度、峰值、圆角、中心对称和曲线填充。较少条带聚合所有 24 个频段，高增益使用软映射避免一齐顶满；相同值不凭空生成差异。

保存最多 12 个命名方案；同名覆盖，支持复制方案文本和导入 JSON。文件限 16KB，格式 type=chatgpt-pulse-spectrum/version=1，白名单校验，非法方案不改变配置。原子应用 style+visual，不带入音频开关、人物设置、日志路径或身份信息。旧用户设置、头像、许可和摘要不得重置或删除。

人物只在后台确认日志扫描成功、没有任何未完成/异常任务后允许随音乐轻动。工作、推理、工具、等待操作、多任务、拖动、点击对话和勿扰优先；不能用“没检测到”冒充 GPT 空闲。保留两个人物原有音乐话题、随机触发和点击回复，头像不缩放跳变、不新增头像，不破坏粒子避让。

系统混音包含歌曲、语音、视频、游戏等，不识别曲名、歌词、情绪。频谱曲线不宣称原始 PCM 波形；镜像不宣称独立双声道。受保护或无法取得的音频应如实显示限制。

## 验证及交付

先检查本机项目的脚本；不要因 Mac 源包路径不同而安装重复全局工具。现有隔离环境可点加载 `scripts/windows-env.ps1`。基础命令：

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm test:browser
cargo test --manifest-path src-tauri/Cargo.toml --locked
pnpm tauri build --config src-tauri/tauri.windows.conf.json -- --locked
```

若缺少新依赖只更新必需的 Windows 依赖与锁文件，说明原因，不删除锁文件或盲目升级所有依赖。保留 Windows 现有安装修复；离线包用 `tauri.windows-offline.conf.json`。音频功能随应用运行，不要求用户安装开发工具。无代码签名时如实标注，不能宣称浏览器/SmartScreen 警告已消失。

验收至少覆盖：

- 首次默认关闭；未启动采集即可选择外观；设置迁移、保存/覆盖/删除方案、文本/文件导入、非法方案、重启恢复。
- 真正系统输出（不是麦克风），六种样式、最大/最小参数、峰值、响应差异、短暂与长时间静音、恢复、切歌和突然大音量。
- 角色音乐律动及随机对话，工作立即打断，多任务独立 Token/状态与单头像，完成后平滑恢复，点击/拖动/勿扰/减少动态效果不冲突。
- 默认输出切换、耳机插拔、蓝牙连接变化、48k/44.1k格式变化、设备暂不可用、睡眠唤醒、音频服务重启；没有条件的硬件场景列为未测试，不能填“通过”。
- 可见但未聚焦、后台、最小化、隐藏、显示恢复、左右贴边、编辑/取消、100%/125%/150%/200% DPI、中文及空格用户名、重启和重复开关/退出无残留进程或采集句柄。
- 静音/频谱/角色状态下至少一段持续运行观察 CPU、内存、句柄及恢复，不把单进程数值说成全应用，也不靠固定机器指标保证所有电脑。
- 从安装器安装启动、退出后升级/卸载并保留用户数据；离线包在断网条件验证，新程序不能依赖开发机绝对路径或 .tools/node_modules。

合成测试、真实系统音频、真实 Work 日志、人工观察分别标明。浏览器测试不能代替 WASAPI 实测。真实 Work 元数据检查需用户授权；不记录或输出聊天正文。实机截图避开私人对话、通知、路径和账号。

最后交付 Windows 源码修订/补丁、实际构建的安装器及 SHA-256、`WINDOWS_MUSIC_REPORT.md`（完成项/测试证据/未测场景/环境和系统版本/已知限制）、短录屏或截图，以及移回 Mac 时需合并的公共文件列表。若构建或实测阻塞，准确交付当前状态和最短下一步，不把“代码写好”写成“Windows 已完成”。

当前 Mac 0.18.2 是本地候选。先保留基线版本并区分 Windows 候选产物；如本机已有更高版本，不降级。两端整合版本和 GitHub 发布另行确认，不覆盖现有 Release。

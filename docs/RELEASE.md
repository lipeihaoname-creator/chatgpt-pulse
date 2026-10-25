# 0.16.6 交付与发布清单

2026-10-25。Mac / Windows 已统一为 0.16.6 首个公开测试版本。维护者已决定保留现有角色发布；仓库、标签和 Release 的实际状态以 GitHub 为准。

## 附件

| 平台 | 文件 | 说明 |
|---|---|---|
| Mac | ChatGPT-Pulse-0.16.6-mac-universal.dmg | 拖入 Applications，最低 macOS 13.3，含 arm64/x86_64 |
| Mac 备用 | ChatGPT-Pulse-0.16.6-mac-universal.zip | 相同应用的压缩包 |
| Windows 默认 | ChatGPT-Pulse-0.16.6-windows-x64-setup.exe | 原样保留的完整离线安装器 |
| Windows 联网 | ChatGPT-Pulse-0.16.6-windows-x64-online-setup.exe | 原样保留的小体积安装器 |
| 源码 | ChatGPT-Pulse-0.16.6-source.zip | 统一白名单源码，含两平台配置和完整许可 |

所有最终附件列入 SHA256SUMS。Windows EXE 与原交接清单核对后原样使用，未在 Mac 上修改、改版本或冒充重新构建。

## 已执行

- Mac 57 项前端、105 项 Rust（2 项本地输入检查默认忽略）、27 套完整生产界面回归；真实日志检查另行显式执行通过。
- Mac 原生四种布局、多任务共享人物、后台监测；DMG 只读挂载、复制、签名/架构/最低系统和仅系统 PATH 启动。
- Windows 验收来自最终交接，详见 WINDOWS_ACCEPTANCE.md；本 Mac 对话没有在 Windows 重新执行测试。
- 两个 Mac 架构依赖图各 259 包均在清单内；保留 Windows 依赖记录、全部原始许可和 5 份 MPL 源码归档。
- 源码白名单排除工具、缓存、个人数据库、真实日志、内部提示词和私有证据，并扫描常见凭据标记和本机用户路径。

完整事实见 [Mac 验收](MAC_ACCEPTANCE.md)、[Windows 验收](WINDOWS_ACCEPTANCE.md)。编译不代替 Intel 实机、其他电脑或干净系统验收。

## 角色素材声明

本项目为非官方、非商业同人项目，维护者选择保留麻衣、洛琪希图集发行，不宣称官方授权或背书。原角色相关权利归各自权利人，代码许可不授予这些角色权利；具体权利问题仍须独立处理。同人标注不被写成免责保证。

代码沿用 PolyForm Noncommercial 加内部使用附加许可，属于源码公开；不能自行改 MIT 或标为 OSI 开源。第三方条款、MPL 源码及旧版本已有有效许可继续保留。

Mac 使用临时签名且未公证，Windows 未签名。本阶段不购买服务，不要求关闭系统安全功能。自动更新未实现，GitHub CI 已配置但未远程执行；工作流只有读取仓库与上传构建产物权限，没有自动发布。

其他设备、Intel 实机、Windows 10、Windows ARM64、缺失 WebView2 的干净环境仍待按各平台清单验收。没有兼容本地日志的云端 Work、普通聊天和浏览器聊天不支持。

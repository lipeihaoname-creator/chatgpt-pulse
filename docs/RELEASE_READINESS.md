# 发行范围与后续验收

当前候选 0.16.6，Mac / Windows 共用源码已整合。Mac 提供通用 DMG 与 ZIP；Windows 提供完整离线及小体积联网两种安装器，微软运行时保持原版及原许可。维护者已决定保留现有角色，以非官方、非商业同人项目发布 0.16.6。维护者的发布决定不等同于原作权利人的许可；是否已上传，以 GitHub 实际仓库与 Release 记录为准。

已完成的准备：保留根 LICENSE、PolyForm 基础条款和内部使用附加许可；提供 Windows/MSVC 依赖清单、第三方通知、5 份 MPL 原始源码归档、NSIS 及对应 0.5.3 插件的许可文本。工具链不进入安装包。源码按公开文件白名单打包，并逐项比对、排除日志、数据库、账号配置、依赖与编译缓存，检查常见凭据标记。

仍需处理：

1. 根许可包含非商业限制，应称“源码公开”。若要采用 OSI 开源许可，需要权利人明确选择新许可；本次没有擅自改成 MIT。
2. 麻衣、洛琪希图包为非官方同人素材，来源记录和“同人”标注不等于原作授权。README 与发布说明已明确角色相关权利归属、与官方无关联及代码许可不覆盖角色权利；具体权利问题仍需单独核查。
3. 在 Windows 10/11 x64 干净系统、缺失 WebView2 的环境和异机完成安装、升级、卸载及真实 Work 验证。ARM64 还没有构建或验收。
4. Mac 本机原生、生产界面与 DMG 复制启动已验收，Intel 仅编译、另一台 Mac 未测；详见 MAC_ACCEPTANCE.md。Mac 临时签名未公证、Windows 未签名。GitHub CI 文件已提供，但本轮没有运行远程流程；CI 编译不能替代真实日志验收。

本项目没有实现无兼容本地日志的云端 Work 数据源，不得在宣传中将其描述为已支持。

安装器辅助插件版本来自本机锁定 Tauri CLI 使用的下载地址，DLL SHA-1 已与该 CLI 内置校验值核对。许可原文取自相同标签：

- [nsis-tauri-utils 0.5.3 MIT](https://github.com/tauri-apps/nsis-tauri-utils/blob/nsis_tauri_utils-v0.5.3/LICENSE_MIT)
- [nsis-tauri-utils 0.5.3 Apache-2.0](https://github.com/tauri-apps/nsis-tauri-utils/blob/nsis_tauri_utils-v0.5.3/LICENSE_APACHE-2.0)
- NSIS 3.13 随工具提供的完整 COPYING 位于 `licenses/tools/NSIS-COPYING.txt`。

这些记录是工程分发准备，不代替权利人对角色素材的授权。

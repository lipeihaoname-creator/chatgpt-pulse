# 依赖许可记录

2026-10-25，按 0.16.6 锁文件重新核对 `aarch64-apple-darwin` 与 `x86_64-apple-darwin` 两种依赖图：各 259 个第三方 Rust 包均有许可声明，均已列入现有清单；前端运行时 `svelte` 与 `@tauri-apps/api` 各自保留 MIT。清单含编译期及运行时依赖，不意味着每个包都以独立代码形式出现在最终程序中。

清单见 [dependency-inventory.json](../licenses/dependency-inventory.json)。MIT、Apache、BSD、Unicode、Zlib 等依赖继续适用原条款，本项目自己的非商业限制不施加到这些依赖本身。相应文本收集在 [THIRD_PARTY_NOTICES.txt](../THIRD_PARTY_NOTICES.txt)。许可元数据核对不替代对后续引入依赖的重新审查。

## MPL 源码

下列包保留 MPL-2.0，其受覆盖文件的源码和权利不能改成仅限非商业使用。项目没有修改它们。随源码包及应用 `Contents/Resources/licenses/mpl-sources/` 提供原始 `.crate` 源码归档，SHA-256 与 Cargo.lock 一致；用户可将归档按 gzip/tar 格式解压。独立许可全文在 [MPL-2.0.txt](../licenses/third-party/MPL-2.0.txt)，包括为上游未附独立 LICENSE 的 selectors 包明确提供该文本；上游归档仍原样保留。

| 包 | 版本 |
|---|---|
| cssparser | 0.37.0 |
| cssparser-macros | 0.7.1 |
| dtoa-short | 0.3.5 |
| option-ext | 0.2.0 |
| selectors | 0.38.0 |

可以独立按 MPL 取得和使用这些源码；本项目没有要求放弃其商业使用、修改或再分发权利。以后若修改受 MPL 覆盖文件，需要按 MPL 提供对应修改源码，不能只更新本项目 LICENSE。

## 当前范围

Mac 的两种架构已在本机核对。Windows 0.16.6 的依赖清单、NSIS/插件许可和 WebView2 通知来自 Windows 实机交接，见 [Windows 依赖记录](WINDOWS_DEPENDENCIES.md) 与 `licenses/windows-dependency-inventory.json`；Mac 的核对不替代 Windows 构建和验收。开发工具、角色图片、应用图标和其他素材仍分别处理。

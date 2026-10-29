音乐候选 0.18.2 新增 Windows-only 的 windows 0.62.2 与 windows-version 0.1.7，版本已锁定。测试用生成的播放输入和隔离 Work，明确同意系统音频采集后可运行 `python scripts/test-windows-music.py --system-audio-confirmed`；不是用户运行依赖。无本地回环网络权限时，可令 PULSE_PLAYWRIGHT_MODULE 指向 tests/local-assets-runtime.mjs 后运行界面测试，直接渲染生产资源。当前验收范围见 [音乐报告](WINDOWS_MUSIC_REPORT.md)。

# Windows 源码构建

用户安装程序不需要下列工具；本页只面向开发者。

需要 Windows x64、Node.js 22.13+、项目指定的 pnpm、Rust MSVC 工具链、Visual Studio C++ Build Tools 与 Windows SDK，以及 WebView2。Windows 交付机实际验证使用 Rust 1.99.1；Cargo.toml 的 1.88 是声明下限，尚未验证所有锁定依赖在该版本上的兼容性。

```powershell
pnpm install --frozen-lockfile
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml --locked
pnpm tauri build --config src-tauri/tauri.windows.conf.json -- --locked
```

最终安装器在 `src-tauri/target/release/bundle/nsis/`。联网版配置为 tauri.windows.conf.json；完整离线版使用 tauri.windows-offline.conf.json。将上面的 --config 参数换成相应文件即可。两版均为当前用户安装、简体中文/英语。离线版构建首次需要下载微软完整运行时，安装时无需再下载。

已有本项目隔离工具链时，可以先点加载 `scripts/windows-env.ps1`，再执行离线检查。它只修改当前进程环境，不修改系统环境变量。`.tools`、`node_modules`、`target` 均为可重建的构建缓存，不是运行依赖，不随源码包分发。

可选检查：

```powershell
node scripts/test-windows-native.mjs
node scripts/test-windows-native.mjs --combined
node scripts/test-windows-native.mjs --bar
node scripts/test-windows-native.mjs --bar --combined
node scripts/test-windows-first-usage.mjs
```

另有 node scripts/test-windows-fresh.mjs 检查中文数据目录首次启动与接入恢复。上述检查使用数字合成夹具，不能代替真实 Work 验收。明确授权本机只读日志检查时，才运行：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked local_metadata_check -- --ignored --nocapture
```

该检查只输出状态、数值及匿名汇总，不输出聊天正文、会话标题或真实会话 ID。开发工具的输出保存在被排除的 `test-results` 内，不应提交到源码仓库。

源码包采用公开文件白名单，并逐项校验解包内容、敏感文件排除规则和 SHA-256。发布前仍需处理素材授权；本轮没有更换许可证、上传仓库或开启自动发布。

0.18.2 当前源码已在 Mac 选择性合并；Windows 安装器保留交付时的原始名称、字节和校验值，不在 Mac 上重新封装。窗口和音频公共文件的 Mac 回归不代替 Windows 二进制重建。详情见 [两端整合说明](RELEASE_0.18.2.zh-CN.md)。

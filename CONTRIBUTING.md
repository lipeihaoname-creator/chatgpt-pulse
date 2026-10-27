# 贡献与验证

使用锁文件安装依赖，避免提交 `.tools`、`node_modules`、`target`、`test-results`、真实日志或本地数据库。无需访问任何人的聊天记录。

```sh
pnpm install --frozen-lockfile
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml --locked
pnpm build
```

浏览器回归需要本机 Google Chrome，使用锁定的 Playwright；无需外部运行时路径：

```sh
pnpm test:browser
```

脚本按需启动本地预览服务，逐项运行测试，结果输出到 `test-results/browser-suite.json`。支持 `node scripts/test-browser.mjs portrait-transition.browser.mjs` 单独运行。浏览器用例采用隔离的模拟原生接口，不能代替真实桌面验证。`PULSE_PLAYWRIGHT_MODULE` 是可选的现有运行时覆盖路径。

发布下载入口或资产发生变化时，再执行以下独立检查（Windows 将 `python3` 换为 `python`）：

```sh
python3 -m unittest discover -s tests -p 'test_release_downloads.py'
python3 scripts/verify-downloads.py --tag v0.16.6
```

第一条用隔离文件检查缺包、截断、重复校验项及文件被修改时确实失败；第二条下载公开的两个 Windows EXE 与 SHA256SUMS，核对文档链接、实际大小和哈希。文件保存在临时目录并在结束时清理。现有 GitHub Actions 仍运行原有界面与编译检查，下载检查需手动执行，不把安装包下载成功当作干净 Windows 安装通过。

Mac 原生数字夹具可设 `PULSE_APP` 为待测应用的完整路径，再运行 `tests/*native.py`。夹具只生成数字与生命周期事件，不访问用户真实会话。测试构建中的 `PULSE_OFFLINE_TEST=1` 将日志与数据库隔离在 `PULSE_DATA_DIR` 下。不要使用真实聊天作为公开测试附件。

动画修改应检查快速状态切换、角色切换、自定义图片、减少动态效果与空闲动作被工作打断；不能将旧速率、暂停或日志缺失画成正在生成。界面只保留状态、数值、操作与必要提示，详细解释放在文档。

## 贡献的许可

提交贡献应确认你有权许可这些内容，并同意项目按根目录 LICENSE 中的基础许可及内部使用附加许可分发该贡献。不要求转让著作权。第三方代码应单独标明来源和原许可，不能直接改成项目许可；不要提交没有可分发授权的角色素材。对既有贡献或旧版已经授出的权利，不因新增这段说明而追溯变更。

更多边界见 [使用许可](docs/LICENSING.md)。

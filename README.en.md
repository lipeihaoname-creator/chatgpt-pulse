# ChatGPT Pulse

[简体中文](README.md) · English

A lightweight desktop monitor for compatible local Work / Codex logs on macOS and Windows. Shows task state, reported token usage and report-interval rates, with a compact bar or character overlay. Built with Tauri 2, Rust, Svelte and SQLite.

## Native demos

Captured from the **0.16.6 Mac desktop application**, using the built-in demo or isolated synthetic log fixtures. Numbers illustrate the interface, not real model performance. No real conversations are shown. See the [full gallery and capture notes](docs/DEMOS.md).

| Avatar click interaction · actual overlay | Roxy expressions and runes · in-app preview |
|---|---|
| <img src="docs/media/avatar-interaction-macos.gif" alt="Native Mac overlay: click interaction, typewriter dialogue, expressions and rabbit particles; synthetic data" width="320"> | <img src="docs/media/roxy-expressions-macos.gif" alt="Native Mac settings preview: Roxy expression transitions and rune particles; synthetic data" width="320"> |

| Separate task bubbles | Combined task rows |
|---|---|
| <img src="docs/media/multitask-separate-macos.png" alt="Three synthetic tasks share one portrait, with independent bubbles and activity pulses" width="360"> | <img src="docs/media/multitask-combined-macos.png" alt="Three synthetic tasks share a combined bubble while retaining separate metrics" width="360"> |

<details>
<summary>Overview, personalization and six themes</summary>

![Native Mac overview with synthetic demo data](docs/media/overview-macos.png)

![Personalization in the Mac desktop application](docs/media/personalization-mai-macos.png)

![Six themes captured from the native settings preview](docs/media/themes-macos.png)

[Open the full gallery: both characters, parallel tasks, image cropping and capture notes](docs/DEMOS.md)

</details>

## Downloads and support

First public test version: **0.16.6**. Downloads are provided through [GitHub Releases](https://github.com/voidlph-dev/chatgpt-pulse/releases/tag/v0.16.6).

| Platform | Package | Verification scope |
|---|---|---|
| macOS 13.3+ | [`ChatGPT-Pulse-0.16.6-mac-universal.dmg`](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.16.6/ChatGPT-Pulse-0.16.6-mac-universal.dmg) | Universal Apple Silicon / Intel binary; see [Mac acceptance](docs/MAC_ACCEPTANCE.md) for actual tests |
| Windows x64 | [`ChatGPT-Pulse-0.16.6-windows-x64-setup.exe`](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.16.6/ChatGPT-Pulse-0.16.6-windows-x64-setup.exe) | Offline installer including WebView2 setup; tested on the handoff machine only |
| Windows x64, online | [`ChatGPT-Pulse-0.16.6-windows-x64-online-setup.exe`](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.16.6/ChatGPT-Pulse-0.16.6-windows-x64-online-setup.exe) | Smaller alternative; internet needed for missing WebView2 |

Checksums: [SHA256SUMS](https://github.com/voidlph-dev/chatgpt-pulse/releases/download/v0.16.6/SHA256SUMS). See the [Windows verification steps](docs/WINDOWS_INSTALL.md#下载与校验).

On macOS, open the DMG and drag the app to Applications. On Windows, install one of the two EXEs. End users do not need Node.js, Rust, Python or a development server. The Mac candidate is ad hoc signed and not notarized; Windows installers are unsigned. Check [Mac installation](docs/MAC_INSTALL.md) or [Windows installation](docs/WINDOWS_INSTALL.md) before testing.

## 0.18.2 music integration candidate

The candidate adds local system-output visualization (Core Audio on macOS 14.2+, WASAPI loopback on Windows 10 1703+), six spectrum styles, shareable custom presets and low-priority idle portrait motion/dialogue. Capture is opt-in; no microphone, captured-audio files or upload. Work and interaction always take priority.

This branch has not published a new Release. The existing 0.16.6 links above do not contain this music candidate. See [the integration and validation notes](docs/RELEASE_0.18.2.zh-CN.md). Mac and Windows hardware/test limits remain separate.

## Features

- Automatically follow compatible local logs; multiple concurrent tasks share one avatar, with separate or combined bubbles.
- Compact bar and avatar layouts, drag/lock, edge docking, hover fading and custom image cropping.
- Character expressions, particles, idle interactions, do-not-disturb and reduced motion.
- Optional local numeric history, disabled by default. No conversation bodies are saved. No extra AI requests or paid APIs.

Default source: the current user's `.codex/sessions`. An absolute `CODEX_HOME` overrides the data root; Pulse appends `sessions`. Ordinary ChatGPT chats, browser chats and cloud tasks without compatible local logs are not supported. No accessibility or screen-recording permission is needed.

Token counts come from client reports. Task totals require a valid task baseline; otherwise session totals stay explicitly labelled. Two later timestamped reports may still provide an interval rate. This is not a live model decoding speed. Missing data stays unknown. See [data semantics](docs/DATA.md).

## Development

Use Node.js 24 (minimum 22.13), pnpm 11.25.0 and a Rust toolchain compatible with the lockfile, plus [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). SQLite is built into the Rust dependency.

```sh
pnpm install --frozen-lockfile
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml --locked
pnpm test:browser
```

On Mac, add both Apple targets and run:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
./scripts/build.sh --target universal-apple-darwin --bundles app,dmg
```

Windows build instructions are in [WINDOWS_BUILD.md](docs/WINDOWS_BUILD.md). Local `.tools` directories are optional and never required by installed applications. CI configuration does not mean remote CI has run.

## License and assets

Source-available under **PolyForm Noncommercial 1.0.0 plus the Internal Use Additional Permission** in [LICENSE](LICENSE). Free personal and internal organizational use is allowed; commercial redistribution and paid product/service integration are not granted. This is not an OSI open-source license. Third-party dependencies retain their own terms, including the supplied MPL source archives.

The Mai and Roxy atlases are AI-assisted, unofficial fan artwork, not official anime screenshots or officially licensed assets. Rights in the original characters and works remain with their respective holders. The code license does not grant rights in those characters or imply official authorization or endorsement. See [assets](docs/ASSETS.md), [licensing](docs/LICENSING.md) and [release scope](docs/RELEASE_READINESS.md). Specific rights concerns can be reported through repository Issues; do not post private contact details or conversation content there.

Not affiliated with or endorsed by OpenAI.

## macOS music-reactive development candidate

Opt-in system-audio spectrum, confirmed-idle portrait motion and original music conversations are being developed locally. Requires macOS 14.2+ and system-audio recording permission; no microphone, recordings, uploads or AI calls. macOS 13.3–14.1 keeps existing features. This feature has not been published as a Release. See [implementation and validation boundaries](docs/MUSIC_REACTIVE.md).

See the [2026-10-29 maintenance notes](docs/MAC_REVIEW_20261029.md) for fixes and test boundaries. Updating the music candidate source does not replace the existing installer Release.

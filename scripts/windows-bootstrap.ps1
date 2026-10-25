# Project-local free developer dependencies only; NO system-component install.
# Run in a network-enabled local PowerShell when the Work execution sandbox cannot download.
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Run this x64 Windows bootstrap on the Windows test machine.' }
$PulseMachineArch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($PulseMachineArch -ne 'AMD64') { throw 'This reviewed bootstrap targets Windows x64 only; inspect ARM64 separately.' }
. (Join-Path $PSScriptRoot 'windows-env.ps1')
Set-Location -LiteralPath $PulseProjectRoot
New-Item -ItemType Directory -Force 'test-results/evidence', '.tools/downloads' | Out-Null
$PulsePnpmEntry = Join-Path $PulseTools 'pnpm/bin/pnpm.cjs'
if (!(Test-Path -LiteralPath $PulsePnpmEntry)) {
    & npm.cmd install --prefix (Join-Path $PulseTools 'pnpm-bootstrap') --no-audit --no-fund --ignore-scripts --package-lock=false pnpm@11.25.0
    if ($LASTEXITCODE -ne 0) { throw "Portable pnpm install failed: $LASTEXITCODE" }
    $PulsePnpmEntry = Join-Path $PulseTools 'pnpm-bootstrap/node_modules/pnpm/bin/pnpm.cjs'
}
New-Item -ItemType Directory -Force (Join-Path $PulseTools 'bin') | Out-Null
$PulsePnpmRelative = if (Test-Path -LiteralPath (Join-Path $PulseTools 'pnpm/bin/pnpm.cjs')) { '..\pnpm\bin\pnpm.cjs' } else { '..\pnpm-bootstrap\node_modules\pnpm\bin\pnpm.cjs' }
$PulsePnpmCommand = "@echo off`r`nnode `"%~dp0$PulsePnpmRelative`" %*`r`n"
Set-Content -LiteralPath (Join-Path $PulseTools 'bin/pnpm.cmd') -Value $PulsePnpmCommand -Encoding ascii
$PulsePnpmVersion = & pnpm.cmd --version
if ($PulsePnpmVersion -ne '11.25.0') { throw "Wrong pnpm: $PulsePnpmVersion" }

# C++/SDK are already installed. This script never invokes VS or WebView installers.
if (!(Get-Command cl.exe -ErrorAction SilentlyContinue) -or !(Get-Command rc.exe -ErrorAction SilentlyContinue)) {
    throw 'Existing MSVC/SDK unavailable. Stop here and ask the user about system installation scope.'
}
$PulseCargo = Join-Path $env:CARGO_HOME 'bin/cargo.exe'
$PulseRustupExe = Join-Path $env:CARGO_HOME 'bin/rustup.exe'
$PulseToolchain = 'stable-x86_64-pc-windows-msvc'
if (!(Test-Path -LiteralPath $PulseCargo) -or !(Test-Path -LiteralPath $PulseRustupExe)) {
    $PulseRustup = Join-Path $PulseTools 'downloads/rustup-init.exe'
    $PulseRustupHashFile = $PulseRustup + '.sha256'
    $PulseRustupUrl = 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe'
    Invoke-WebRequest -Uri $PulseRustupUrl -OutFile $PulseRustup
    Invoke-WebRequest -Uri ($PulseRustupUrl + '.sha256') -OutFile $PulseRustupHashFile
    $PulseExpectedHash = ((Get-Content -LiteralPath $PulseRustupHashFile -Raw).Trim() -split '\s+')[0]
    if ($PulseExpectedHash -notmatch '^[a-fA-F0-9]{64}$' -or
        (Get-FileHash -LiteralPath $PulseRustup -Algorithm SHA256).Hash -ne $PulseExpectedHash) {
        throw 'Official rustup-init checksum mismatch; nothing executed'
    }
    & $PulseRustup -y --no-modify-path --profile minimal --default-host x86_64-pc-windows-msvc --default-toolchain stable
    if ($LASTEXITCODE -ne 0) { throw "Project-local Rust install failed: $LASTEXITCODE" }
}
# A download can leave rustup/cargo proxies without an installed toolchain.
# Test the actual local toolchain, not just cargo.exe's existence; retry safely.
$PulsePreviousErrorAction = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    $PulseToolchainVersion = & $PulseRustupExe run $PulseToolchain rustc --version 2>$null
    $PulseToolchainReady = ($LASTEXITCODE -eq 0)
} finally { $ErrorActionPreference = $PulsePreviousErrorAction }
if (!$PulseToolchainReady) {
    & $PulseRustupExe toolchain install $PulseToolchain --profile minimal --no-self-update
    if ($LASTEXITCODE -ne 0) { throw 'Local Rust toolchain incomplete; rerun this script after network access recovers.' }
}
# Process-only selection under the project-local RUSTUP_HOME, not a global default.
$env:RUSTUP_TOOLCHAIN = $PulseToolchain
& $PulseCargo --version
if ($LASTEXITCODE -ne 0) { throw 'cargo unavailable' }
& (Join-Path $env:CARGO_HOME 'bin/rustc.exe') -vV
if ($LASTEXITCODE -ne 0) { throw 'rustc unavailable' }
& pnpm.cmd install --frozen-lockfile --store-dir .tools/pnpm-store --config.cache-dir=.tools/pnpm-cache
$PulseInstallExit = $LASTEXITCODE
[pscustomobject]@{stage='locked-install';exit_code=$PulseInstallExit;at_utc=[DateTime]::UtcNow.ToString('o')} |
    ConvertTo-Json | Set-Content 'test-results/evidence/bootstrap-install.json' -Encoding utf8
if ($PulseInstallExit -ne 0) { throw "Locked install failed: $PulseInstallExit" }
# Fetch Rust crates here too, while this terminal has network access. Installing
# rustc alone would leave the restricted Work build blocked on crate downloads.
& $PulseCargo fetch --locked --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc
$PulseFetchExit = $LASTEXITCODE
[pscustomobject]@{stage='locked-cargo-fetch';exit_code=$PulseFetchExit;at_utc=[DateTime]::UtcNow.ToString('o')} |
    ConvertTo-Json | Set-Content 'test-results/evidence/bootstrap-cargo-fetch.json' -Encoding utf8
if ($PulseFetchExit -ne 0) { throw "Rust dependency fetch failed ($PulseFetchExit); rerun after network access recovers." }
Write-Output 'Project-local tools and locked dependencies are ready. No Pulse acceptance test or system install was performed.'

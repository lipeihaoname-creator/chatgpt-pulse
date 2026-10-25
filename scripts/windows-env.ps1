# Dot-source this file. Changes apply only to the current PowerShell process.
$ErrorActionPreference = 'Stop'
# Supported by the installed VsDevCmd.bat; skip its optional telemetry child.
$env:VSCMD_SKIP_SENDTELEMETRY = '1'
$PulseProjectRoot = Split-Path $PSScriptRoot -Parent
$PulseTools = Join-Path $PulseProjectRoot '.tools'
New-Item -ItemType Directory -Force $PulseTools | Out-Null
# Keep temporary build/test files in the writable project, process scope only.
$PulseTemp = Join-Path $PulseTools 'temp'
New-Item -ItemType Directory -Force $PulseTemp | Out-Null
$env:TEMP = $PulseTemp
$env:TMP = $PulseTemp
$env:npm_config_cache = Join-Path $PulseTools 'npm-cache'
$env:PNPM_HOME = Join-Path $PulseTools 'bin'
$env:PNPM_STORE_DIR = Join-Path $PulseTools 'pnpm-store'
$env:PNPM_CACHE_DIR = Join-Path $PulseTools 'pnpm-cache'
$env:COREPACK_HOME = Join-Path $PulseTools 'corepack'
$env:CARGO_HOME = Join-Path $PulseTools 'cargo'
$env:RUSTUP_HOME = Join-Path $PulseTools 'rustup'
$env:CARGO_TARGET_DIR = Join-Path $PulseProjectRoot 'src-tauri\target'
# Keep Windows validation builds small; these values affect this process only.
$env:CARGO_PROFILE_DEV_DEBUG = '0'
$env:CARGO_PROFILE_TEST_DEBUG = '0'
$env:CARGO_INCREMENTAL = '0'
$env:PATH = "$env:PNPM_HOME;$env:CARGO_HOME\bin;$env:PATH"
$PulseVswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $PulseVswhere) {
    $PulseVs = & $PulseVswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($PulseVs) {
        $PulseVsDev = Join-Path $PulseVs 'Common7\Tools\VsDevCmd.bat'
        $PulseEnvLines = & $env:ComSpec /d /s /c "`"$PulseVsDev`" -no_logo -arch=x64 -host_arch=x64 >nul && set"
        if ($LASTEXITCODE -ne 0) { throw 'MSVC process environment initialization failed' }
        foreach ($PulseLine in $PulseEnvLines) {
            if ($PulseLine -match '^([^=]+)=(.*)$') {
                [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
            }
        }
    }
}

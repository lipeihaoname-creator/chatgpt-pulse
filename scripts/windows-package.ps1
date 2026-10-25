# Run in ordinary, non-administrator PowerShell. Project-local downloads only.
# This creates a private test installer; it does not install or uninstall anything.
param([switch]$PrepareOnly,[ValidateSet('online','offline')][string]$Variant='offline')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-env.ps1')
Set-Location -LiteralPath $PulseProjectRoot
$PulseResults = @()
$PulseEvidence = Join-Path $PulseProjectRoot 'test-results\evidence'
New-Item -ItemType Directory -Force $PulseEvidence | Out-Null
function Save-PulsePackageResults {
    ConvertTo-Json -InputObject @($script:PulseResults) -Depth 6 | Set-Content (Join-Path $PulseEvidence 'windows-package-stages.json') -Encoding UTF8
}
function Invoke-PulsePackageStage([string]$PulseStageName, [string]$PulseStageExe, [string[]]$PulseStageArguments) {
    $PulseStageLog = Join-Path $PulseEvidence ($PulseStageName + '.txt')
    $ErrorActionPreference = 'Continue'
    & $PulseStageExe @PulseStageArguments *> $PulseStageLog
    $PulseStageExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    $script:PulseResults += [pscustomobject]@{stage=$PulseStageName;exit_code=$PulseStageExit;status=if($PulseStageExit -eq 0){'passed'}else{'failed'}}
    Save-PulsePackageResults
    Get-Content -LiteralPath $PulseStageLog -Tail 8
    if ($PulseStageExit -ne 0) { throw "Stage $PulseStageName failed ($PulseStageExit). Stopped; see $PulseStageLog" }
}
try {
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'This test packaging script is for the current x64 Windows computer only.' }
    $PulseVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
    $PulseReviewed = Get-Content 'test-results/evidence/delivery-candidate.json' -Raw | ConvertFrom-Json
    if ($PulseReviewed.version -ne $PulseVersion) { throw 'Candidate version mismatch.' }
    $PulseBinary = Join-Path $PulseProjectRoot 'src-tauri\target\release\chatgpt-pulse.exe'
    if (!(Test-Path -LiteralPath $PulseBinary)) { throw 'Reviewed native binary is missing.' }
    $PulseBinaryHash = (Get-FileHash -LiteralPath $PulseBinary -Algorithm SHA256).Hash
    if ($PulseBinaryHash -ne $PulseReviewed.native_sha256) { throw 'Native candidate changed; rebuild and verify before packaging.' }
    foreach ($PulseSource in $PulseReviewed.source_hashes) {
        $PulseSourcePath = [IO.Path]::GetFullPath((Join-Path $PulseProjectRoot $PulseSource.file))
        if (!$PulseSourcePath.StartsWith($PulseProjectRoot.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Source path escaped project.' }
        if ($PulseSource.file) {
            if ((Get-FileHash -LiteralPath (Join-Path $PulseProjectRoot $PulseSource.file) -Algorithm SHA256).Hash -ne $PulseSource.sha256) {
                throw "Runtime source changed since the reviewed build: $($PulseSource.file)"
            }
        }
    }
    foreach ($PulseCheck in @('frontend_passed','rust_passed','native_fixtures_passed','real_local_metadata_passed','real_native_ui_passed','real_session_switch_passed')) {
        if ($PulseReviewed.$PulseCheck -ne $true) { throw ('Candidate acceptance incomplete: '+$PulseCheck) }
    }
    $PulseLicenseDir = Join-Path $PulseProjectRoot 'licenses\third-party'
    New-Item -ItemType Directory -Force $PulseLicenseDir | Out-Null
    $PulseSources = @(
        @{file='alloc-stdlib-0.3.0-BSD-3-Clause.txt';kind='BSD';url='https://raw.githubusercontent.com/dropbox/rust-alloc-no-stdlib/0a81fd6928ea3b33c8cd484aa4575d50ffb98012/LICENSE'},
        @{file='webview2-rs-edc2caf-MIT.txt';kind='MIT';url='https://raw.githubusercontent.com/wravery/webview2-rs/edc2caf886175ccaebe86078c9cfe1ae2a187328/LICENSE'},
        @{file='webview2-rs-dffa41a-MIT.txt';kind='MIT';url='https://raw.githubusercontent.com/wravery/webview2-rs/dffa41a8a46d3f5565eefbff2de57d38d399f158/LICENSE'}
    )
    if ($PrepareOnly) {
        $PulsePreflight = [pscustomobject]@{status='prepared-only';native_sha256=$PulseBinaryHash;source_hashes_match=$true;real_local_acceptance=$true;network_executed=$false;installer_executed=$false;license_downloads=$PulseSources.Count}
        $PulsePreflight | ConvertTo-Json | Set-Content (Join-Path $PulseEvidence 'windows-package-preflight.json') -Encoding UTF8
        Write-Output 'Packaging preflight verified; downloads and bundling NOT executed.'
        return
    }
    $PulseLicenseEvidence = @()
    foreach ($PulseSource in $PulseSources) {
        $PulseDestination = [IO.Path]::GetFullPath((Join-Path $PulseLicenseDir $PulseSource.file))
        if (!$PulseDestination.StartsWith($PulseProjectRoot.TrimEnd('\')+'\', [StringComparison]::OrdinalIgnoreCase)) { throw 'License destination escaped the project.' }
        if (!(Test-Path -LiteralPath $PulseDestination)) {
            Write-Output ('Fetching pinned upstream license: '+$PulseSource.file)
            $PulsePending = $PulseDestination + '.pending'
            Invoke-WebRequest -UseBasicParsing -Uri $PulseSource.url -OutFile $PulsePending -TimeoutSec 120 -MaximumRedirection 5
            $PulseText = [IO.File]::ReadAllText($PulsePending)
            $PulseExpected = if ($PulseSource.kind -eq 'MIT') {'Permission is hereby granted'} else {'Redistribution and use in source and binary forms'}
            if ($PulseText.Length -lt 500 -or $PulseText.Length -gt 100000 -or !$PulseText.Contains($PulseExpected)) { throw ('Unexpected license response: '+$PulseSource.file) }
            Move-Item -LiteralPath $PulsePending -Destination $PulseDestination
        }
        $PulseLicenseEvidence += [pscustomobject]@{file=('licenses/third-party/'+$PulseSource.file);source_url=$PulseSource.url;sha256=(Get-FileHash -LiteralPath $PulseDestination -Algorithm SHA256).Hash}
    }
    $PulseLicenseEvidence | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $PulseEvidence 'windows-upstream-license-sources.json') -Encoding UTF8
    $ErrorActionPreference = 'Continue'
    # Explicit UTF-8 output prevents PowerShell 5.1 from creating UTF-16 JSON.
    $PulseMetadataLines = & cargo metadata --manifest-path src-tauri/Cargo.toml --locked --offline --format-version 1 --filter-platform x86_64-pc-windows-msvc 2> (Join-Path $PulseEvidence 'windows-metadata-stderr.txt')
    $PulseMetadataExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    $PulseResults += [pscustomobject]@{stage='windows-target-metadata';exit_code=$PulseMetadataExit;status=if($PulseMetadataExit -eq 0){'passed'}else{'failed'}}
    Save-PulsePackageResults
    if ($PulseMetadataExit -ne 0) { throw 'Locked offline Cargo metadata failed.' }
    [IO.File]::WriteAllText((Join-Path $PulseProjectRoot '.tools\windows-cargo-metadata.json'), ($PulseMetadataLines -join [Environment]::NewLine), (New-Object Text.UTF8Encoding($false)))
    Invoke-PulsePackageStage 'windows-license-collection' 'node' @('scripts/windows-notices.mjs')
    $PulseBundleStarted = [DateTime]::UtcNow
    # Keep individual logs; retry only os error 32, at most three times.
    $PulseBundleConfig = if ($Variant -eq 'offline') {'src-tauri/tauri.windows-offline.conf.json'} else {'src-tauri/tauri.windows.conf.json'}
    Invoke-PulsePackageStage 'nsis-bundle' 'node' @('scripts/windows-bundle.mjs','--config',$PulseBundleConfig)
    $PulseInstallers = @(Get-ChildItem -LiteralPath 'src-tauri/target/release/bundle/nsis' -Filter '*-setup.exe' -File | Where-Object {$_.LastWriteTimeUtc -ge $PulseBundleStarted.AddSeconds(-2)} | Sort-Object LastWriteTimeUtc -Descending)
    if ($PulseInstallers.Count -ne 1) { throw 'Expected exactly one freshly generated NSIS installer.' }
    if ((Get-FileHash -LiteralPath $PulseBinary -Algorithm SHA256).Hash -ne $PulseBinaryHash) { throw 'Bundling unexpectedly changed the reviewed native binary.' }
    New-Item -ItemType Directory -Force 'release' | Out-Null
    $PulseInstallerName = 'ChatGPT-Pulse-'+$PulseVersion+'-windows-x64'+$(if($Variant -eq 'online'){'-online'}else{''})+'-setup.exe'
    $PulseTestInstaller = Join-Path $PulseProjectRoot ('release\'+$PulseInstallerName)
    Copy-Item -LiteralPath $PulseInstallers[0].FullName -Destination $PulseTestInstaller -Force
    $PulseArtifact = [pscustomobject]@{created_at=(Get-Date -Format o);installer=('release/'+$PulseInstallerName);sha256=(Get-FileHash -LiteralPath $PulseTestInstaller -Algorithm SHA256).Hash;size=(Get-Item -LiteralPath $PulseTestInstaller).Length;native_sha256=$PulseBinaryHash;installer_executed=$false;install_uninstall_status='not tested';real_work_status='local compatible logs accepted; cloud-only unsupported';webview2_policy='embedBootstrapper: reuse existing runtime; download when absent';signing='unsigned private candidate';nsis_tool_license_review='NSIS COPYING included; plugin tracked separately'}
    $PulseArtifact.webview2_policy = if($Variant -eq 'offline'){'offlineInstaller: embedded signed Microsoft standalone runtime; no runtime download needed'}else{'embedBootstrapper: runtime download needed if absent'}
    $PulseArtifact | Add-Member -NotePropertyName variant -NotePropertyValue $Variant
    $PulseArtifact | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $PulseEvidence 'windows-installer-artifact.json') -Encoding UTF8
    $PulseArtifact | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $PulseEvidence ('hardening-installer-'+$Variant+'.json')) -Encoding UTF8
    $PulseHashLine = $PulseArtifact.sha256 + '  ' + $PulseArtifact.installer
    $PulseHashLine | Set-Content 'release/windows-installer-SHA256SUMS.txt' -Encoding ASCII
    Write-Output 'Private test installer generated. It has NOT been installed, run, or uninstalled.'
    Write-Output ('Path: '+$PulseTestInstaller)
    Write-Output ('SHA256: '+$PulseArtifact.sha256)
    Write-Output 'Return to Work for resource/license inspection before installation acceptance.'
} catch {
    $PulseResults += [pscustomobject]@{stage='packaging';status='stopped';error=$_.Exception.Message}
    Save-PulsePackageResults
    Write-Error $_
    exit 1
}

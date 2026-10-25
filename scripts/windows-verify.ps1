# Ordered build gate. Does not start real-log monitoring, install apps or create startup items.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-env.ps1')
Set-Location -LiteralPath $PulseProjectRoot
New-Item -ItemType Directory -Force 'test-results/evidence' | Out-Null
$PulseStages = @(
    @{name='pnpm-test';exe='pnpm.cmd';arguments=@('test')},
    @{name='cargo-test';exe='cargo';arguments=@('test','--manifest-path','src-tauri/Cargo.toml','--locked','--offline')},
    @{name='pnpm-build';exe='pnpm.cmd';arguments=@('build')},
    @{name='tauri-no-bundle';exe='pnpm.cmd';arguments=@('tauri','build','--no-bundle','--','--locked','--offline')}
)
$PulseResults = @()
foreach ($PulseStage in $PulseStages) {
    $PulseOutput = Join-Path 'test-results/evidence' ($PulseStage.name + '.txt')
    if (!(Get-Command $PulseStage.exe -ErrorAction SilentlyContinue)) {
        $PulseResults += [pscustomobject]@{stage=$PulseStage.name;status='blocked';exit_code=$null;reason='tool missing'}
        ConvertTo-Json -InputObject @($PulseResults) | Set-Content 'test-results/evidence/build-gates.json' -Encoding utf8
        throw "Tool missing at $($PulseStage.name)"
    }
    $PulseExecutable = $PulseStage.exe
    $PulseArguments = $PulseStage.arguments
    $ErrorActionPreference = 'Continue'
    & $PulseExecutable @PulseArguments *> $PulseOutput
    $PulseExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    $PulseResults += [pscustomobject]@{stage=$PulseStage.name;status=if($PulseExit -eq 0){'passed'}else{'failed'};exit_code=$PulseExit;evidence=$PulseOutput}
    ConvertTo-Json -InputObject @($PulseResults) | Set-Content 'test-results/evidence/build-gates.json' -Encoding utf8
    Get-Content -LiteralPath $PulseOutput -Tail 12
    if ($PulseExit -ne 0) { throw "Gate $($PulseStage.name) failed ($PulseExit); later stages were not run" }
}
if (Test-Path -LiteralPath 'C:/Program Files/Google/Chrome/Application/chrome.exe') {
    & pnpm.cmd test:browser *> 'test-results/evidence/browser.txt'
    $PulseBrowserExit = $LASTEXITCODE
    $PulseResults += [pscustomobject]@{stage='browser-simulation';status=if($PulseBrowserExit -eq 0){'passed'}else{'failed'};exit_code=$PulseBrowserExit}
    ConvertTo-Json -InputObject @($PulseResults) | Set-Content 'test-results/evidence/build-gates.json' -Encoding utf8
    if ($PulseBrowserExit -ne 0) { throw "Browser simulation failed ($PulseBrowserExit)" }
}
Write-Output 'Build gates completed. Native fixtures, real Work, installation and interaction acceptance remain separate.'

[CmdletBinding()]
param(
  [ValidateSet('editor', 'runtime')] [string] $Mode = 'runtime',
  [string] $BrokerScript = (Join-Path $env:USERPROFILE '.agents\skills\hyperv-test-executables\scripts\Invoke-HyperVExecutableTest.ps1'),
  [string] $NodePath = (Get-Command node -ErrorAction Stop).Source
)
$ErrorActionPreference = 'Stop'
$ambientRepo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$ambientPackage = (Resolve-Path -LiteralPath (Join-Path $ambientRepo "output\packaging\$Mode-win\dist\win-unpacked")).Path
$ambientSupport = [IO.Path]::GetFullPath((Join-Path $ambientPackage '.ambient-verification'))
if (-not $ambientSupport.StartsWith($ambientPackage + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Support path escaped the canonical package.' }
if (Test-Path -LiteralPath $ambientSupport) { throw 'Verification support already exists; finish that invocation first.' }
New-Item -ItemType Directory -Path $ambientSupport | Out-Null
try {
  Copy-Item -LiteralPath $NodePath -Destination (Join-Path $ambientSupport 'node.exe')
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'verification\ambient-guest.mjs') -Destination (Join-Path $ambientSupport 'guest.mjs')
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'verification\ambient-checks.mjs') -Destination $ambientSupport
  if ($Mode -eq 'editor') {
    $ambientFixture = Join-Path $ambientRepo 'output\ambient-fixture'
    $ambientFixtureDestination = Join-Path $ambientSupport 'fixture'
    New-Item -ItemType Directory -Path $ambientFixtureDestination | Out-Null
    Get-ChildItem -LiteralPath $ambientFixture -File -Filter '*.json' | Copy-Item -Destination $ambientFixtureDestination
    Copy-Item -LiteralPath (Join-Path $ambientFixture 'assets') -Destination $ambientFixtureDestination -Recurse
  }
  $ambientActions = ConvertTo-Json -InputObject @(@{ type = 'wait_result_file'; path = '{OUTDIR}\ambient-result.json'; timeoutMs = 240000 }) -Compress
  & $BrokerScript -ArtifactPath $ambientPackage -ExecutableRelativePath '.ambient-verification\node.exe' `
    -Arguments ('"{PAYLOAD}\.ambient-verification\guest.mjs" "{OUTDIR}" "{PAYLOAD}" "' + $Mode + '"') `
    -ActionsJson $ambientActions -AssertResultFile '{OUTDIR}\ambient-result.json' `
    -AssertResultJsonPointer '/passed' -AssertResultEqualsJson 'true' -ExecutionTimeoutSeconds 360 -ThrowOnFailure
} finally {
  if (Test-Path -LiteralPath $ambientSupport) { Remove-Item -LiteralPath $ambientSupport -Recurse -Force }
}

[CmdletBinding()]
param(
  [string] $BrokerScript = (Join-Path $env:USERPROFILE '.agents\skills\hyperv-test-executables\scripts\Invoke-HyperVExecutableTest.ps1'),
  [string] $NodePath = (Get-Command node -ErrorAction Stop).Source
)

$ErrorActionPreference = 'Stop'
$reviewRepo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$reviewPackage = (Resolve-Path -LiteralPath (Join-Path $reviewRepo 'output\packaging\editor-win\dist\win-unpacked')).Path
$reviewSupport = [IO.Path]::GetFullPath((Join-Path $reviewPackage '.review-verification'))
if (-not $reviewSupport.StartsWith($reviewPackage + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Verification support directory escaped the canonical package.'
}
if (Test-Path -LiteralPath $reviewSupport) {
  throw 'Verification support already exists. Finish the existing verification before starting another.'
}
if (-not (Test-Path -LiteralPath $BrokerScript -PathType Leaf)) { throw 'Hyper-V broker client is unavailable.' }
if (-not (Test-Path -LiteralPath (Join-Path $reviewPackage 'MAGE2 Editor.exe') -PathType Leaf)) { throw 'Build the release editor first.' }

# The broker receives the canonical artifact, including a temporary independent QA
# driver. It owns payload copying, VM selection, isolation and guest cleanup.
New-Item -ItemType Directory -Path $reviewSupport | Out-Null
try {
  Copy-Item -LiteralPath $NodePath -Destination (Join-Path $reviewSupport 'node.exe')
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'verification\review-fixes-guest.mjs') -Destination (Join-Path $reviewSupport 'guest.mjs')
  $reviewActions = ConvertTo-Json -InputObject @(@{ type = 'wait_result_file'; path = '{OUTDIR}\review-fixes-result.json'; timeoutMs = 480000 }) -Compress
  & $BrokerScript -ArtifactPath $reviewPackage -ExecutableRelativePath '.review-verification\node.exe' `
    -Arguments '"{PAYLOAD}\.review-verification\guest.mjs" "{OUTDIR}" "{PAYLOAD}"' `
    -ActionsJson $reviewActions -AssertResultFile '{OUTDIR}\review-fixes-result.json' `
    -AssertResultJsonPointer '/passed' -AssertResultEqualsJson 'true' -ExecutionTimeoutSeconds 600 -ThrowOnFailure
} finally {
  # Only this invocation's checked, private support directory is removed.
  if (Test-Path -LiteralPath $reviewSupport) { Remove-Item -LiteralPath $reviewSupport -Recurse -Force }
}

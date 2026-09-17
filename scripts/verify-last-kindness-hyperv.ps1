[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$gameRepo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$gamePackage = (Resolve-Path -LiteralPath (Join-Path $gameRepo 'output\packaging\editor-win\dist\win-unpacked')).Path
$gameSupport = [IO.Path]::GetFullPath((Join-Path $gamePackage '.last-kindness-verification'))
$gameInput = (Resolve-Path -LiteralPath (Join-Path $gameRepo 'output\the-last-kindness\editable-project')).Path
$gameBroker = Join-Path $env:USERPROFILE '.agents\skills\hyperv-test-executables\scripts\Invoke-HyperVExecutableTest.ps1'
if (-not $gameSupport.StartsWith($gamePackage + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Support path outside canonical package' }
if (Test-Path -LiteralPath $gameSupport) { throw 'A Last Kindness verification is already staged' }
New-Item -ItemType Directory -Path $gameSupport | Out-Null
try {
  Copy-Item -LiteralPath (Get-Command node).Source -Destination (Join-Path $gameSupport 'node.exe')
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'verification\last-kindness-guest.mjs') -Destination (Join-Path $gameSupport 'guest.mjs')
  $gameActions = ConvertTo-Json -InputObject @(@{type='wait_result_file';path='{OUTDIR}\last-kindness-result.json';timeoutMs=480000}) -Compress
  & $gameBroker -ArtifactPath $gamePackage -ExecutableRelativePath '.last-kindness-verification\node.exe' `
    -Arguments '"{PAYLOAD}\.last-kindness-verification\guest.mjs" "{OUTDIR}" "{PAYLOAD}" "{HOSTINPUT:game}"' `
    -ReadOnlyHostInput @{Name='game';Path=$gameInput;Mode='Vhdx'} -ActionsJson $gameActions `
    -AssertResultFile '{OUTDIR}\last-kindness-result.json' -AssertResultJsonPointer '/passed' -AssertResultEqualsJson 'true' `
    -ExecutionTimeoutSeconds 600 -ThrowOnFailure
} finally {
  # This is the exact private directory created above, resolved inside the package.
  if (Test-Path -LiteralPath $gameSupport) { Remove-Item -LiteralPath $gameSupport -Recurse -Force }
}

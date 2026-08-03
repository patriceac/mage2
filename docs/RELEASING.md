# Windows release process

MAGE2 Windows releases are produced from the canonical packaged editor, not from the development Electron launcher.

## Release gate

Use a clean Windows checkout with Node.js 24 and run:

```powershell
npm ci
npm run audit:release
npm test
npm run typecheck
npm run verify:editor:windows-ci
```

The verification command builds the installer and unpacked application, launches `MAGE2 Editor.exe`, creates a new project, exports its runtime, and captures a screenshot and JSON report. It fails if the launched process is not the canonical executable or if the packaged security checks fail.

Release output is written to `output/packaging/editor-win/dist/`. Evidence is written to `output/playwright/windows-ci/`.

## Checksums

Packaging writes `SHA256SUMS.txt` after the binaries have been built and signed. It covers the NSIS installer, its block map when present, and `win-unpacked/MAGE2 Editor.exe`.

Verify a downloaded artifact independently before publishing it:

```powershell
Get-FileHash .\MAGE2-Editor-0.1.0-x64.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

Publish the checksum file through a separate authenticated release page alongside the installer. A checksum detects accidental or malicious changes only when users receive the expected checksum from a trusted channel.

## Authenticode signing

Unsigned packages are acceptable for local development only. Public releases should use one of these electron-builder signing paths:

- An exportable OV/EV-compatible certificate supplied to CI as `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` secrets.
- Azure Trusted Signing configured through `win.azureSignOptions`, with Azure identity values supplied only as CI secrets.

Never commit a `.pfx`, its password, Azure credentials, or base64 certificate material. Set `MAGE2_REQUIRE_CODE_SIGNING=1` in a production release job so packaging fails instead of silently producing an unsigned release.

Verify both the application and installer before publication:

```powershell
Get-AuthenticodeSignature '.\output\packaging\editor-win\dist\win-unpacked\MAGE2 Editor.exe' | Format-List
Get-AuthenticodeSignature '.\output\packaging\editor-win\dist\MAGE2-Editor-0.1.0-x64.exe' | Format-List
```

Both signatures must report `Valid`, use the expected publisher, and include a trusted timestamp. Generate and publish checksums only after signing; changing a signature changes the file digest.

## Release checklist

1. Confirm `npm audit` reports no high or critical advisories.
2. Confirm tests and type checks pass from `npm ci`.
3. Confirm the Windows evidence report names the canonical EXE and a valid export.
4. Confirm Authenticode signatures when the release is public.
5. Confirm `SHA256SUMS.txt` matches the exact files being uploaded.
6. Upload the installer, checksum file, and CI evidence from the same workflow run.
7. Smoke-test the downloaded installer on a clean supported Windows machine.

The package also flips Electron fuses that disable `ELECTRON_RUN_AS_NODE`, Node CLI inspection, and `NODE_OPTIONS`; require the validated ASAR; and remove extra `file://` privileges. Do not publish a differently packaged Electron binary as an equivalent release.

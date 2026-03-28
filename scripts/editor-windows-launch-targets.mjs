import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import editorAppMetadata from "../apps/editor/app-metadata.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");
const shortcutFileName = `${editorAppMetadata.productName}.lnk`;
const executableFileName = `${editorAppMetadata.executableName}.exe`;

export function assertWindowsPlatform() {
  if (process.platform !== "win32") {
    throw new Error("Windows launch parity is only supported on Windows.");
  }
}

export function getCanonicalPackagedEditorExePath(repoRootPath = repoRoot) {
  return path.join(repoRootPath, "output", "packaging", "editor-win", "dist", "win-unpacked", executableFileName);
}

export function normalizeWindowsPath(targetPath) {
  if (typeof targetPath !== "string") {
    return "";
  }

  const trimmed = targetPath.trim();
  if (!trimmed) {
    return "";
  }

  return path.win32.normalize(trimmed).toLowerCase();
}

export function getWindowsPathDirectory(targetPath) {
  if (typeof targetPath !== "string") {
    return "";
  }

  const trimmed = targetPath.trim();
  if (!trimmed) {
    return "";
  }

  return path.win32.dirname(trimmed);
}

export function isCanonicalWindowsLaunchShortcut(shortcut, canonicalExePath) {
  if (!shortcut?.exists) {
    return false;
  }

  return (
    normalizeWindowsPath(shortcut.targetPath) === normalizeWindowsPath(canonicalExePath) &&
    normalizeWindowsPath(shortcut.workingDirectory) === normalizeWindowsPath(getWindowsPathDirectory(canonicalExePath)) &&
    (shortcut.arguments ?? "").trim() === ""
  );
}

export function resolveWindowsLaunchShortcutAction(shortcutSpec, currentShortcut, canonicalExePath) {
  if (!currentShortcut.exists) {
    return shortcutSpec.createIfMissing ? "create" : "skip";
  }

  return isCanonicalWindowsLaunchShortcut(currentShortcut, canonicalExePath) ? "validate" : "repair";
}

export function getKnownWindowsLaunchShortcutDefinitions(repoRootPath = repoRoot) {
  assertWindowsPlatform();
  const appData = requireEnvironmentVariable("APPDATA");
  const userProfile = requireEnvironmentVariable("USERPROFILE");

  return [
    {
      id: "desktop",
      label: "Desktop shortcut",
      linkPath: path.join(userProfile, "Desktop", shortcutFileName),
      createIfMissing: true
    },
    {
      id: "taskbar",
      label: "Pinned taskbar shortcut",
      linkPath: path.join(
        appData,
        "Microsoft",
        "Internet Explorer",
        "Quick Launch",
        "User Pinned",
        "TaskBar",
        shortcutFileName
      ),
      createIfMissing: false
    },
    {
      id: "start-menu",
      label: "Start Menu shortcut",
      linkPath: path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", shortcutFileName),
      createIfMissing: true
    }
  ].map((shortcut) => ({
    ...shortcut,
    canonicalExePath: getCanonicalPackagedEditorExePath(repoRootPath)
  }));
}

export async function getWindowsLaunchShortcutReport({ repoRootPath = repoRoot } = {}) {
  const canonicalExePath = getCanonicalPackagedEditorExePath(repoRootPath);
  const shortcutSpecs = getKnownWindowsLaunchShortcutDefinitions(repoRootPath);
  const shortcuts = [];

  for (const shortcutSpec of shortcutSpecs) {
    const currentShortcut = await readWindowsShortcut(shortcutSpec.linkPath);
    const action = resolveWindowsLaunchShortcutAction(shortcutSpec, currentShortcut, canonicalExePath);
    shortcuts.push(buildShortcutReportEntry(shortcutSpec, currentShortcut, canonicalExePath, action));
  }

  return { canonicalExePath, shortcuts };
}

export async function repairWindowsLaunchShortcuts({ repoRootPath = repoRoot } = {}) {
  assertWindowsPlatform();
  const canonicalExePath = getCanonicalPackagedEditorExePath(repoRootPath);

  if (!existsSync(canonicalExePath)) {
    throw new Error(`Cannot repair Windows launch shortcuts before packaging ${canonicalExePath}.`);
  }

  const shortcutSpecs = getKnownWindowsLaunchShortcutDefinitions(repoRootPath);
  const shortcuts = [];

  for (const shortcutSpec of shortcutSpecs) {
    const currentShortcut = await readWindowsShortcut(shortcutSpec.linkPath);
    const action = resolveWindowsLaunchShortcutAction(shortcutSpec, currentShortcut, canonicalExePath);
    let nextShortcut = currentShortcut;

    if (action === "create" || action === "repair") {
      nextShortcut = await writeWindowsShortcut({
        linkPath: shortcutSpec.linkPath,
        targetPath: canonicalExePath,
        workingDirectory: getWindowsPathDirectory(canonicalExePath),
        arguments: "",
        iconLocation: `${canonicalExePath},0`,
        description: `Launch ${editorAppMetadata.productName}.`
      });
    }

    shortcuts.push(
      buildShortcutReportEntry(shortcutSpec, nextShortcut, canonicalExePath, action, {
        previousTargetPath: currentShortcut.targetPath ?? null,
        previousWorkingDirectory: currentShortcut.workingDirectory ?? null,
        previousArguments: currentShortcut.arguments ?? null
      })
    );
  }

  return { canonicalExePath, shortcuts };
}

export function assertCanonicalWindowsLaunchShortcuts(report) {
  const invalidShortcuts = report.shortcuts.filter((shortcut) =>
    shortcut.createIfMissing ? !shortcut.exists || !shortcut.isCanonical : shortcut.exists && !shortcut.isCanonical
  );

  if (invalidShortcuts.length === 0) {
    return report;
  }

  throw new Error(
    [
      "Windows launch shortcuts are not aligned with the canonical packaged editor:",
      ...invalidShortcuts.map((shortcut) => `- ${shortcut.label}: ${shortcut.targetPath ?? "(missing)"}`)
    ].join("\n")
  );
}

export function formatWindowsLaunchShortcutReport(report) {
  return [
    `Canonical packaged editor: ${report.canonicalExePath}`,
    ...report.shortcuts.map((shortcut) => {
      const suffix =
        shortcut.action === "skip"
          ? "optional and missing"
          : shortcut.isCanonical
            ? shortcut.action === "validate"
              ? "already canonical"
              : shortcut.action === "create"
                ? "created at canonical target"
                : "repaired to canonical target"
            : "still not canonical";

      return `${shortcut.label}: ${shortcut.linkPath} -> ${shortcut.targetPath ?? "(missing)"} (${suffix})`;
    })
  ].join("\n");
}

export async function closeRunningCanonicalEditorProcesses({ repoRootPath = repoRoot } = {}) {
  assertWindowsPlatform();
  const canonicalExePath = getCanonicalPackagedEditorExePath(repoRootPath);
  const result = await runPowerShellJson(`
$ErrorActionPreference = 'Stop'
$canonicalExePath = ${quotePowerShellLiteral(canonicalExePath)}
$processes = @(
  Get-CimInstance Win32_Process -Filter "Name = '${escapePowerShellDoubleQuotedText(executableFileName)}'" |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.Trim().ToLowerInvariant() -eq $canonicalExePath.Trim().ToLowerInvariant() } |
    ForEach-Object {
      $processInfo = [pscustomobject]@{
        processId = $_.ProcessId
        executablePath = $_.ExecutablePath
      }
      try {
        Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null
        $processInfo
      } catch {
        if (-not $_.Exception.Message.Contains('Not found')) {
          throw
        }
      }
    }
)
[pscustomobject]@{ items = $processes } | ConvertTo-Json -Compress -Depth 5
  `);

  return {
    canonicalExePath,
    closedProcesses: ensureArray(result?.items)
  };
}

export async function getWindowsProcessExecutablePath(processId) {
  assertWindowsPlatform();
  const result = await runPowerShellJson(`
$ErrorActionPreference = 'Stop'
$processId = ${Number(processId)}
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" | Select-Object -First 1
[pscustomobject]@{
  executablePath = if ($processInfo) { $processInfo.ExecutablePath } else { $null }
} | ConvertTo-Json -Compress
  `);

  return result?.executablePath ?? null;
}

export async function readWindowsShortcut(linkPath) {
  assertWindowsPlatform();
  const result = await runPowerShellJson(`
$ErrorActionPreference = 'Stop'
$linkPath = ${quotePowerShellLiteral(linkPath)}
if (-not (Test-Path -LiteralPath $linkPath)) {
  [pscustomobject]@{ exists = $false; linkPath = $linkPath } | ConvertTo-Json -Compress
  exit 0
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($linkPath)
[pscustomobject]@{
  exists = $true
  linkPath = $linkPath
  targetPath = $shortcut.TargetPath
  arguments = $shortcut.Arguments
  workingDirectory = $shortcut.WorkingDirectory
  iconLocation = $shortcut.IconLocation
  description = $shortcut.Description
} | ConvertTo-Json -Compress -Depth 5
  `);

  return {
    exists: Boolean(result?.exists),
    linkPath,
    targetPath: result?.targetPath ?? null,
    arguments: result?.arguments ?? "",
    workingDirectory: result?.workingDirectory ?? null,
    iconLocation: result?.iconLocation ?? null,
    description: result?.description ?? null
  };
}

export async function writeWindowsShortcut({
  linkPath,
  targetPath,
  workingDirectory = getWindowsPathDirectory(targetPath),
  arguments: shortcutArguments = "",
  iconLocation = `${targetPath},0`,
  description = `Launch ${editorAppMetadata.productName}.`
}) {
  assertWindowsPlatform();
  const result = await runPowerShellJson(`
$ErrorActionPreference = 'Stop'
$linkPath = ${quotePowerShellLiteral(linkPath)}
$targetPath = ${quotePowerShellLiteral(targetPath)}
$workingDirectory = ${quotePowerShellLiteral(workingDirectory)}
$arguments = ${quotePowerShellLiteral(shortcutArguments)}
$iconLocation = ${quotePowerShellLiteral(iconLocation)}
$description = ${quotePowerShellLiteral(description)}
$directory = Split-Path -Parent $linkPath
if (-not (Test-Path -LiteralPath $directory)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($linkPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $workingDirectory
$shortcut.Arguments = $arguments
$shortcut.IconLocation = $iconLocation
$shortcut.Description = $description
$shortcut.Save()
$savedShortcut = $shell.CreateShortcut($linkPath)
[pscustomobject]@{
  exists = $true
  linkPath = $linkPath
  targetPath = $savedShortcut.TargetPath
  arguments = $savedShortcut.Arguments
  workingDirectory = $savedShortcut.WorkingDirectory
  iconLocation = $savedShortcut.IconLocation
  description = $savedShortcut.Description
} | ConvertTo-Json -Compress -Depth 5
  `);

  return {
    exists: true,
    linkPath,
    targetPath: result?.targetPath ?? targetPath,
    arguments: result?.arguments ?? shortcutArguments,
    workingDirectory: result?.workingDirectory ?? workingDirectory,
    iconLocation: result?.iconLocation ?? iconLocation,
    description: result?.description ?? description
  };
}

function buildShortcutReportEntry(shortcutSpec, currentShortcut, canonicalExePath, action, previous = {}) {
  return {
    id: shortcutSpec.id,
    label: shortcutSpec.label,
    linkPath: shortcutSpec.linkPath,
    createIfMissing: shortcutSpec.createIfMissing,
    exists: currentShortcut.exists,
    targetPath: currentShortcut.targetPath,
    arguments: currentShortcut.arguments,
    workingDirectory: currentShortcut.workingDirectory,
    iconLocation: currentShortcut.iconLocation,
    description: currentShortcut.description,
    action,
    isCanonical: isCanonicalWindowsLaunchShortcut(currentShortcut, canonicalExePath),
    ...previous
  };
}

function requireEnvironmentVariable(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function escapePowerShellDoubleQuotedText(value) {
  return String(value).replaceAll("`", "``").replaceAll('"', '`"');
}

async function runPowerShellJson(script) {
  const output = await runPowerShell(script);
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }

  return JSON.parse(trimmed);
}

async function runPowerShell(script) {
  const command = Buffer.from(script, "utf16le").toString("base64");

  return await new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-EncodedCommand", command], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `PowerShell exited with code ${code ?? "unknown"}.`));
    });
  });
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

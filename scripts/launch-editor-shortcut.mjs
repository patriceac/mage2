import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCanonicalWindowsLaunchShortcuts,
  formatWindowsLaunchShortcutReport,
  getCanonicalPackagedEditorExePath,
  repairWindowsLaunchShortcuts
} from "./editor-windows-launch-targets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const packagedExePath = getCanonicalPackagedEditorExePath(repoRoot);
const trackedPaths = [
  "package.json",
  "package-lock.json",
  "tsconfig.base.json",
  path.join("build", "icon.ico"),
  path.join("scripts", "editor-windows-launch-targets.mjs"),
  path.join("scripts", "package-editor-win.mjs"),
  path.join("apps", "editor", "electron"),
  path.join("apps", "editor", "src"),
  path.join("apps", "editor", "index.html"),
  path.join("apps", "editor", "package.json"),
  path.join("apps", "editor", "tsconfig.electron.json"),
  path.join("apps", "editor", "tsconfig.json"),
  path.join("apps", "editor", "vite.config.ts"),
  path.join("apps", "runtime-web", "src"),
  path.join("apps", "runtime-web", "index.html"),
  path.join("apps", "runtime-web", "package.json"),
  path.join("apps", "runtime-web", "tsconfig.json"),
  path.join("apps", "runtime-web", "vite.config.ts"),
  path.join("packages", "media", "src"),
  path.join("packages", "media", "package.json"),
  path.join("packages", "media", "tsconfig.json"),
  path.join("packages", "player", "src"),
  path.join("packages", "player", "package.json"),
  path.join("packages", "player", "tsconfig.json"),
  path.join("packages", "schema", "src"),
  path.join("packages", "schema", "package.json"),
  path.join("packages", "schema", "tsconfig.json")
].map((targetPath) => path.join(repoRoot, targetPath));
const ignoredDirectoryNames = new Set(["dist", "dist-electron", "node_modules", "output", ".git"]);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  if (process.platform !== "win32") {
    throw new Error("This launcher is intended for Windows only.");
  }

  const packagedStat = await getStat(packagedExePath);
  const latestSourceMtimeMs = await getLatestTrackedMtimeMs();
  const shouldPackage = !packagedStat || latestSourceMtimeMs > packagedStat.mtimeMs;

  if (shouldPackage) {
    console.log(packagedStat ? "Packaged editor is stale. Rebuilding..." : "Packaged editor not found. Building...");
    await runCommand("npm.cmd", ["run", "package:editor:win"]);
  }

  if (!existsSync(packagedExePath)) {
    throw new Error(`Could not find packaged editor at ${packagedExePath}.`);
  }

  const shortcutReport = assertCanonicalWindowsLaunchShortcuts(await repairWindowsLaunchShortcuts({ repoRootPath: repoRoot }));
  console.log(formatWindowsLaunchShortcutReport(shortcutReport));
  console.log(`Launching packaged editor from ${packagedExePath}`);

  const child = spawn(packagedExePath, resolveForwardedLaunchArguments(process.argv.slice(2)), {
    cwd: path.dirname(packagedExePath),
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

async function getLatestTrackedMtimeMs() {
  let latestMtimeMs = 0;

  for (const trackedPath of trackedPaths) {
    latestMtimeMs = Math.max(latestMtimeMs, await getLatestMtimeMs(trackedPath));
  }

  return latestMtimeMs;
}

async function getLatestMtimeMs(targetPath) {
  const targetStat = await getStat(targetPath);
  if (!targetStat) {
    return 0;
  }

  let latestMtimeMs = targetStat.mtimeMs;

  if (!targetStat.isDirectory()) {
    return latestMtimeMs;
  }

  const entries = await readdir(targetPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) {
      continue;
    }

    latestMtimeMs = Math.max(latestMtimeMs, await getLatestMtimeMs(path.join(targetPath, entry.name)));
  }

  return latestMtimeMs;
}

async function getStat(targetPath) {
  try {
    return await stat(targetPath);
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }
    throw error;
  }
}

function isMissingPathError(error) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function resolveForwardedLaunchArguments(args) {
  const normalizedArgs = [...args];

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const argument = normalizedArgs[index];
    if (argument === "--project") {
      const projectDir = normalizedArgs[index + 1];
      if (projectDir && !projectDir.startsWith("--")) {
        normalizedArgs[index + 1] = path.resolve(projectDir);
        index += 1;
      }
      continue;
    }

    if (argument.startsWith("--project=")) {
      const projectDir = argument.slice("--project=".length);
      if (projectDir) {
        normalizedArgs[index] = `--project=${path.resolve(projectDir)}`;
      }
    }
  }

  return normalizedArgs;
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit"
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
    });
  });
}

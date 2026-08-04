import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, Platform, Arch } from "electron-builder";
import { isValidGameVersion } from "@mage2/schema";
import {
  closeRunningCanonicalEditorProcesses,
  closeRunningWindowsProcessesAtPath,
  writeWindowsShortcut
} from "./editor-windows-launch-targets.mjs";
import {
  resolveRuntimePackageIcon,
  resolveRuntimePackageVersion
} from "./runtime-package-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const runtimeShellDirectory = path.join(repoRoot, "apps", "runtime-electron");
const buildResourcesDirectory = path.join(repoRoot, "build");
const stageRoot = path.join(repoRoot, "output", "packaging", "runtime-win");
const appStageDirectory = path.join(stageRoot, "app");
const outputDirectory = path.join(stageRoot, "dist");

const projectDirectory = resolveProjectDirectory(process.argv.slice(2));
const runtimeBuildDirectory = path.join(projectDirectory, "build");
const buildManifest = JSON.parse(await readFile(path.join(runtimeBuildDirectory, "build-manifest.json"), "utf8"));
const projectContent = JSON.parse(
  await readFile(path.join(runtimeBuildDirectory, ...buildManifest.contentPath.split("/")), "utf8")
);
const packageVersion = resolveRuntimePackageVersion(buildManifest.gameVersion, isValidGameVersion);
const creatorIcon = await resolveRuntimePackageIcon({
  runtimeBuildDirectory,
  buildManifest,
  projectContent
});
const applicationIconPath = creatorIcon?.sourcePath ?? path.join(buildResourcesDirectory, "icon.ico");
const projectId = normalizeIdentifier(buildManifest.projectId);
const productName = `${buildManifest.projectName} Player`;
const executableName = `${sanitizeWindowsName(buildManifest.projectName)} Player`;
const appId = `com.mage2.runtime.${projectId}`;
const runtimeExecutablePath = path.join(outputDirectory, "win-unpacked", `${executableName}.exe`);

const closedEditorProcesses = await closeRunningCanonicalEditorProcesses({ repoRootPath: repoRoot });
if (closedEditorProcesses.closedProcesses.length > 0) {
  console.log(`Closed ${closedEditorProcesses.closedProcesses.length} packaged editor process(es) before runtime packaging.`);
}
const closedRuntimeProcesses = await closeRunningWindowsProcessesAtPath(runtimeExecutablePath);
if (closedRuntimeProcesses.closedProcesses.length > 0) {
  console.log(`Closed ${closedRuntimeProcesses.closedProcesses.length} packaged player process(es) before runtime packaging.`);
}

await prepareStage();
await packageRuntime();
if (!existsSync(runtimeExecutablePath)) {
  throw new Error(`Packaged runtime executable was not created at ${runtimeExecutablePath}.`);
}

console.log(`Packaged runtime: ${runtimeExecutablePath}`);
if (process.env.MAGE2_SKIP_SHORTCUT_REPAIR === "1") {
  console.log("Skipped Windows player shortcut repair for this non-interactive package build.");
} else {
  const desktopShortcutPath = path.join(requireEnvironmentVariable("USERPROFILE"), "Desktop", `${productName}.lnk`);
  const desktopShortcut = await writeWindowsShortcut({
    linkPath: desktopShortcutPath,
    targetPath: runtimeExecutablePath,
    workingDirectory: path.dirname(runtimeExecutablePath),
    iconLocation: `${runtimeExecutablePath},0`,
    description: `Launch ${productName}.`
  });
  console.log(`Desktop shortcut: ${desktopShortcut.linkPath} -> ${desktopShortcut.targetPath}`);
}

async function prepareStage() {
  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(appStageDirectory, { recursive: true });
  await cp(path.join(runtimeShellDirectory, "main.mjs"), path.join(appStageDirectory, "main.mjs"));
  await cp(path.join(runtimeShellDirectory, "preload.cjs"), path.join(appStageDirectory, "preload.cjs"));
  await cp(path.join(runtimeShellDirectory, "server.mjs"), path.join(appStageDirectory, "server.mjs"));
  await cp(runtimeBuildDirectory, path.join(appStageDirectory, "player"), { recursive: true, force: true });
  await writeFile(
    path.join(appStageDirectory, "package.json"),
    JSON.stringify(
      {
        name: `mage2-runtime-${projectId}`,
        version: packageVersion,
        description: `Standalone Electron player for ${buildManifest.projectName}.`,
        main: "main.mjs",
        author: "MAGE2",
        license: "UNLICENSED"
      },
      null,
      2
    ),
    "utf8"
  );
}

async function packageRuntime() {
  await build({
    targets: Platform.WINDOWS.createTarget(["nsis", "dir"], Arch.x64),
    config: {
      appId,
      productName,
      executableName,
      electronVersion: "37.4.0",
      directories: {
        app: appStageDirectory,
        output: outputDirectory,
        buildResources: buildResourcesDirectory
      },
      files: ["main.mjs", "preload.cjs", "server.mjs", "package.json"],
      extraResources: [
        { from: path.join(appStageDirectory, "player"), to: "player" },
        { from: path.join(buildResourcesDirectory, "icon.ico"), to: "icon.ico" },
        { from: path.join(buildResourcesDirectory, "icon.png"), to: "icon.png" },
        ...(creatorIcon ? [{ from: creatorIcon.sourcePath, to: creatorIcon.resourceName }] : [])
      ],
      asar: true,
      npmRebuild: false,
      buildDependenciesFromSource: false,
      compression: "normal",
      win: {
        target: [
          { target: "nsis", arch: ["x64"] },
          { target: "dir", arch: ["x64"] }
        ],
        icon: applicationIconPath,
        artifactName: `${sanitizeWindowsName(buildManifest.projectName)}-Player-\${version}-\${arch}.\${ext}`
      },
      nsis: {
        oneClick: false,
        createDesktopShortcut: false,
        createStartMenuShortcut: true,
        shortcutName: productName
      }
    }
  });
}

function resolveProjectDirectory(argv) {
  const inline = argv.find((argument) => argument.startsWith("--project-dir="));
  if (inline) {
    return path.resolve(inline.slice("--project-dir=".length));
  }

  const index = argv.indexOf("--project-dir");
  if (index >= 0 && argv[index + 1]) {
    return path.resolve(argv[index + 1]);
  }

  throw new Error("Pass --project-dir <MAGE2 project directory> to package the runtime.");
}

function normalizeIdentifier(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "project";
}

function sanitizeWindowsName(value) {
  return String(value).replace(/[<>:"/\\|?*]/g, "-").replace(/[. ]+$/g, "").trim() || "MAGE2 Runtime";
}

function requireEnvironmentVariable(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

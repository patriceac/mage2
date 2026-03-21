import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build, Platform, Arch } from "electron-builder";
import editorAppMetadata from "../apps/editor/app-metadata.json" with { type: "json" };
import {
  assertCanonicalWindowsLaunchShortcuts,
  formatWindowsLaunchShortcutReport,
  repairWindowsLaunchShortcuts
} from "./editor-windows-launch-targets.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const buildResourcesDir = path.join(repoRoot, "build");
const stageRoot = path.join(repoRoot, "output", "packaging", "editor-win");
const appStageDir = path.join(stageRoot, "app");
const outputDir = path.join(stageRoot, "dist");

const rootPackageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
const editorPackageJson = JSON.parse(await readFile(path.join(repoRoot, "apps", "editor", "package.json"), "utf8"));
const mediaPackageJson = await readInstalledPackageJson("@mage2/media");
const resvgPackageJson = await readInstalledPackageJson("@resvg/resvg-js");
const resvgPlatformPackageJson = await readInstalledPackageJson("@resvg/resvg-js-win32-x64-msvc");
const schemaPackageJson = await readInstalledPackageJson("@mage2/schema");
const ffmpegPackageJson = await readInstalledPackageJson("@ffmpeg-installer/ffmpeg");
const ffmpegPlatformPackageJson = await readInstalledPackageJson("@ffmpeg-installer/win32-x64");
const ffprobePackageJson = await readInstalledPackageJson("@ffprobe-installer/ffprobe");
const ffprobePlatformPackageJson = await readInstalledPackageJson("@ffprobe-installer/win32-x64");
const zodPackageJson = await readInstalledPackageJson("zod");

await prepareStage();
await packageWindowsApp();
const shortcutReport = assertCanonicalWindowsLaunchShortcuts(await repairWindowsLaunchShortcuts({ repoRootPath: repoRoot }));
console.log(formatWindowsLaunchShortcutReport(shortcutReport));

async function prepareStage() {
  await rm(stageRoot, { recursive: true, force: true });
  await mkdir(appStageDir, { recursive: true });

  await copyRequiredBuildOutput();
  await copyRuntimeDependencies();
  await writeStagePackageJson();
}

async function copyRequiredBuildOutput() {
  const editorDist = path.join(repoRoot, "apps", "editor", "dist");
  const editorElectronDist = path.join(repoRoot, "apps", "editor", "dist-electron");
  const runtimeWebDist = path.join(repoRoot, "apps", "runtime-web", "dist");

  for (const requiredDir of [editorDist, editorElectronDist, runtimeWebDist]) {
    if (!existsSync(requiredDir)) {
      throw new Error(`Missing build output at ${requiredDir}. Run the editor/runtime build first.`);
    }
  }

  await cp(editorDist, path.join(appStageDir, "dist"), { recursive: true, force: true });
  await cp(editorElectronDist, path.join(appStageDir, "dist-electron"), { recursive: true, force: true });
  await cp(runtimeWebDist, path.join(appStageDir, "resources", "runtime-web"), {
    recursive: true,
    force: true
  });
}

async function copyRuntimeDependencies() {
  const packagesToCopy = [
    { packageName: "@mage2/media", entries: ["dist", "package.json"] },
    {
      packageName: "@resvg/resvg-js",
      entries: ["index.js", "index.d.ts", "js-binding.js", "js-binding.d.ts", "package.json"]
    },
    {
      packageName: "@resvg/resvg-js-win32-x64-msvc",
      entries: ["resvgjs.win32-x64-msvc.node", "package.json"]
    },
    { packageName: "@mage2/schema", entries: ["dist", "package.json"] },
    { packageName: "@ffmpeg-installer/ffmpeg", entries: ["index.js", "lib", "package.json"] },
    { packageName: "@ffmpeg-installer/win32-x64", entries: ["ffmpeg.exe", "package.json"] },
    { packageName: "@ffprobe-installer/ffprobe", entries: ["index.js", "lib", "package.json"] },
    { packageName: "@ffprobe-installer/win32-x64", entries: ["ffprobe.exe", "package.json"] },
    { packageName: "zod" }
  ];

  for (const { packageName, entries } of packagesToCopy) {
    const sourceDir = await resolveInstalledPackageRoot(packageName);
    const destinationDir = path.join(appStageDir, "node_modules", ...packageName.split("/"));

    if (entries) {
      await copyPackageEntries(sourceDir, destinationDir, entries);
      continue;
    }

    await mkdir(path.dirname(destinationDir), { recursive: true });
    await cp(sourceDir, destinationDir, {
      recursive: true,
      force: true,
      filter: (sourcePath) => !sourcePath.endsWith("README.md")
    });
  }
}

async function writeStagePackageJson() {
  const stagePackageJson = {
    name: editorAppMetadata.packageName,
    version: editorPackageJson.version,
    description: "Packaged Windows desktop editor for MAGE2 projects.",
    main: "dist-electron/main.cjs",
    author: editorAppMetadata.author,
    license: rootPackageJson.license ?? "UNLICENSED",
    dependencies: {
      "@mage2/media": mediaPackageJson.version,
      "@resvg/resvg-js": resvgPackageJson.version,
      "@resvg/resvg-js-win32-x64-msvc": resvgPlatformPackageJson.version,
      "@mage2/schema": schemaPackageJson.version,
      "@ffmpeg-installer/ffmpeg": ffmpegPackageJson.version,
      "@ffmpeg-installer/win32-x64": ffmpegPlatformPackageJson.version,
      "@ffprobe-installer/ffprobe": ffprobePackageJson.version,
      "@ffprobe-installer/win32-x64": ffprobePlatformPackageJson.version,
      zod: zodPackageJson.version
    }
  };

  await writeFile(path.join(appStageDir, "package.json"), JSON.stringify(stagePackageJson, null, 2), "utf8");
}

async function packageWindowsApp() {
  await build({
    targets: Platform.WINDOWS.createTarget(["nsis", "dir"], Arch.x64),
    config: {
      appId: editorAppMetadata.appId,
      productName: editorAppMetadata.productName,
      executableName: editorAppMetadata.executableName,
      electronVersion: editorPackageJson.dependencies.electron.replace(/^[^\d]*/, ""),
      directories: {
        app: appStageDir,
        output: outputDir,
        buildResources: buildResourcesDir
      },
      files: ["dist/**/*", "dist-electron/**/*", "node_modules/**/*", "package.json"],
      extraResources: [
        {
          from: path.join(appStageDir, "resources", "runtime-web"),
          to: "runtime-web"
        },
        {
          from: path.join(buildResourcesDir, "icon.ico"),
          to: "icon.ico"
        },
        {
          from: path.join(buildResourcesDir, "icon.png"),
          to: "icon.png"
        }
      ],
      asar: true,
      asarUnpack: [
        "node_modules/@resvg/**/*.node",
        "node_modules/@ffmpeg-installer/**/*",
        "node_modules/@ffprobe-installer/**/*"
      ],
      npmRebuild: false,
      buildDependenciesFromSource: false,
      compression: "normal",
      win: {
        target: [
          { target: "nsis", arch: ["x64"] },
          { target: "dir", arch: ["x64"] }
        ],
        icon: path.join(buildResourcesDir, "icon.ico"),
        artifactName: editorAppMetadata.winArtifactName
      },
      nsis: {
        oneClick: false,
        installerIcon: path.join(buildResourcesDir, "icon.ico"),
        uninstallerIcon: path.join(buildResourcesDir, "icon.ico"),
        allowToChangeInstallationDirectory: true,
        perMachine: false
      }
    }
  });
}

async function readInstalledPackageJson(packageName) {
  const packageRoot = await resolveInstalledPackageRoot(packageName);
  return JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
}

async function copyPackageEntries(sourceDir, destinationDir, entries) {
  await mkdir(destinationDir, { recursive: true });

  for (const entry of entries) {
    await cp(path.join(sourceDir, entry), path.join(destinationDir, entry), {
      recursive: true,
      force: true
    });
  }
}

async function resolveInstalledPackageRoot(packageName) {
  const directNodeModulesPath = path.join(repoRoot, "node_modules", ...packageName.split("/"));
  if (existsSync(path.join(directNodeModulesPath, "package.json"))) {
    return directNodeModulesPath;
  }

  const resolvedEntry = require.resolve(packageName, { paths: [repoRoot] });
  let currentDir = path.dirname(resolvedEntry);

  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
      if (packageJson.name === packageName) {
        return currentDir;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Could not locate package root for ${packageName}.`);
    }

    currentDir = parentDir;
  }
}

import { existsSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { app } from "electron";
import { copyAssetForBuild } from "@mage2/media";
import { toExportProjectData, type BuildManifest, type ProjectBundle, validateProject } from "@mage2/schema";

export interface ExportResult {
  outputDirectory: string;
  buildManifest: BuildManifest;
  validationReport: ReturnType<typeof validateProject>;
}

export async function exportProjectBundle(
  projectDir: string,
  project: ProjectBundle
): Promise<ExportResult> {
  const validationReport = validateProject(project);
  const outputDirectory = path.isAbsolute(project.manifest.buildSettings.outputDir)
    ? project.manifest.buildSettings.outputDir
    : path.join(projectDir, project.manifest.buildSettings.outputDir);

  const runtimeDist = await resolveRuntimeWebDist();
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  await cp(runtimeDist, outputDirectory, { recursive: true, force: true });

  const mediaDirectory = path.join(outputDirectory, "media");
  await mkdir(mediaDirectory, { recursive: true });

  const exportedAssets = await Promise.all(
    project.assets.assets.map(async (asset) => {
      const copiedPath = await copyAssetForBuild(asset, mediaDirectory);
      const relativePath = toPosix(path.relative(outputDirectory, copiedPath));

      return [
        asset.id,
        {
          ...asset,
          sourcePath: relativePath,
          proxyPath: undefined,
          posterPath: undefined
        }
      ] as const;
    })
  );

  const assetMap = Object.fromEntries(exportedAssets.map(([assetId, asset]) => [assetId, asset.sourcePath]));
  const exportContent = {
    ...toExportProjectData(project),
    assets: exportedAssets.map(([, asset]) => asset)
  };

  await mkdir(path.join(outputDirectory, "content"), { recursive: true });
  await writeFile(
    path.join(outputDirectory, "content", "project-content.json"),
    JSON.stringify(exportContent, null, 2),
    "utf8"
  );
  await writeFile(
    path.join(outputDirectory, "validation-report.json"),
    JSON.stringify(validationReport, null, 2),
    "utf8"
  );

  const buildManifest: BuildManifest = {
    projectId: project.manifest.projectId,
    projectName: project.manifest.projectName,
    engineVersion: project.manifest.engineVersion,
    generatedAt: new Date().toISOString(),
    startLocationId: project.manifest.startLocationId,
    startSceneId: project.manifest.startSceneId,
    contentPath: "content/project-content.json",
    validationReportPath: "validation-report.json",
    assetMap
  };

  await writeFile(
    path.join(outputDirectory, "build-manifest.json"),
    JSON.stringify(buildManifest, null, 2),
    "utf8"
  );

  return {
    outputDirectory,
    buildManifest,
    validationReport
  };
}

async function buildRuntimeWeb(): Promise<void> {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  await run(command, ["run", "build", "--workspace", "@mage2/runtime-web"], getRepoRoot());
}

async function resolveRuntimeWebDist(): Promise<string> {
  if (app.isPackaged) {
    const bundledRuntimeDist = path.join(process.resourcesPath, "runtime-web");
    if (existsSync(path.join(bundledRuntimeDist, "index.html"))) {
      return bundledRuntimeDist;
    }

    throw new Error("Bundled runtime-web assets are missing from the packaged editor.");
  }

  await buildRuntimeWeb();
  return path.join(getRepoRoot(), "apps", "runtime-web", "dist");
}

function getRepoRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "..", ".."),
    path.resolve(process.cwd(), "..", "..", "..")
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "apps", "runtime-web", "package.json"))) {
      return candidate;
    }
  }

  throw new Error("Could not locate the repository root from the current working directory.");
}

function toPosix(input: string): string {
  return input.replace(/\\/g, "/");
}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with code ${code}.`));
      }
    });
  });
}

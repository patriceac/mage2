import { existsSync } from "node:fs";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeFileSha256, generateProxy } from "@mage2/media";
import {
  createDefaultProjectBundle,
  resolveAssetVariant,
  parseProjectBundle,
  type Asset,
  type AssetVariant,
  type ProjectBundle
} from "@mage2/schema";

const FILES = {
  manifest: "project.json",
  assets: "assets.json",
  locations: "locations.json",
  scenes: "scenes.json",
  dialogues: "dialogues.json",
  inventory: "inventory.json",
  strings: "strings.json"
} as const;

const STARTER_SCENE_ASSET_NAME = "starter-scene.png";

export interface ProjectDirectoryInspection {
  isProjectDirectory: boolean;
  projectName?: string;
  reason?: string;
}

export async function loadProjectFromDirectory(projectDir: string): Promise<ProjectBundle> {
  const filePaths = resolveProjectFilePaths(projectDir);
  await access(filePaths.manifest);

  const rawBundle = {
    manifest: await readJson(filePaths.manifest),
    assets: await readJson(filePaths.assets),
    locations: await readJson(filePaths.locations),
    scenes: await readJson(filePaths.scenes),
    dialogues: await readJson(filePaths.dialogues),
    inventory: await readJson(filePaths.inventory),
    strings: await readJson(filePaths.strings)
  };

  const project = parseProjectBundle(rawBundle);
  return ensureProjectAssetPreviews(projectDir, project);
}

export async function inspectProjectDirectory(projectDir: string): Promise<ProjectDirectoryInspection> {
  const filePaths = resolveProjectFilePaths(projectDir);
  const requiredFileEntries = Object.values(filePaths);

  try {
    await Promise.all(requiredFileEntries.map((filePath) => access(filePath)));
  } catch {
    return {
      isProjectDirectory: false,
      reason: "This folder is missing one or more required MAGE2 project files."
    };
  }

  try {
    const rawBundle = {
      manifest: await readJson(filePaths.manifest),
      assets: await readJson(filePaths.assets),
      locations: await readJson(filePaths.locations),
      scenes: await readJson(filePaths.scenes),
      dialogues: await readJson(filePaths.dialogues),
      inventory: await readJson(filePaths.inventory),
      strings: await readJson(filePaths.strings)
    };

    const project = parseProjectBundle(rawBundle);
    return {
      isProjectDirectory: true,
      projectName: project.manifest.projectName
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isProjectDirectory: false,
      reason: `Project files were found, but they could not be loaded: ${message}`
    };
  }
}

export async function createProjectInDirectory(
  projectDir: string,
  projectName: string
): Promise<ProjectBundle> {
  const project = createDefaultProjectBundle(projectName);
  project.manifest.projectId = slugify(projectName);
  await seedStarterSceneAsset(projectDir, project);
  const normalizedProject = await saveProjectToDirectory(projectDir, project);
  return ensureProjectAssetPreviews(projectDir, normalizedProject);
}

export async function saveProjectToDirectory(
  projectDir: string,
  project: ProjectBundle
): Promise<ProjectBundle> {
  const normalized = parseProjectBundle(project);
  const filePaths = resolveProjectFilePaths(projectDir);

  await mkdir(projectDir, { recursive: true });
  await Promise.all([
    writeJson(filePaths.manifest, normalized.manifest),
    writeJson(filePaths.assets, normalized.assets),
    writeJson(filePaths.locations, normalized.locations),
    writeJson(filePaths.scenes, normalized.scenes),
    writeJson(filePaths.dialogues, normalized.dialogues),
    writeJson(filePaths.inventory, normalized.inventory),
    writeJson(filePaths.strings, normalized.strings)
  ]);

  return normalized;
}

function resolveProjectFilePaths(projectDir: string): Record<keyof typeof FILES, string> {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, fileName]) => [key, path.join(projectDir, fileName)])
  ) as Record<keyof typeof FILES, string>;
}

async function readJson(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8");
  return JSON.parse(source);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "project_default";
}

async function seedStarterSceneAsset(projectDir: string, project: ProjectBundle): Promise<void> {
  const assetsDir = path.join(projectDir, "assets");
  const starterAssetPath = path.join(assetsDir, STARTER_SCENE_ASSET_NAME);
  const defaultLocale = project.manifest.defaultLanguage;

  await mkdir(assetsDir, { recursive: true });
  await copyFile(resolveStarterSceneTemplatePath(), starterAssetPath);

  const starterVariant: AssetVariant = {
    sourcePath: starterAssetPath,
    sha256: await computeFileSha256(starterAssetPath),
    importedAt: new Date().toISOString(),
    width: 1280,
    height: 720
  };
  const starterAsset: Asset = {
    id: "asset_placeholder",
    kind: "image",
    name: STARTER_SCENE_ASSET_NAME,
    variants: {
      [defaultLocale]: starterVariant
    }
  };

  const existingAssetIndex = project.assets.assets.findIndex((asset) => asset.id === starterAsset.id);
  if (existingAssetIndex >= 0) {
    project.assets.assets[existingAssetIndex] = await generateProxy(starterAsset, defaultLocale, projectDir);
  } else {
    project.assets.assets.push(await generateProxy(starterAsset, defaultLocale, projectDir));
  }

  if (!project.manifest.assetRoots.includes(assetsDir)) {
    project.manifest.assetRoots.push(assetsDir);
  }
}

async function ensureProjectAssetPreviews(projectDir: string, project: ProjectBundle): Promise<ProjectBundle> {
  let updated = false;

  for (let assetIndex = 0; assetIndex < project.assets.assets.length; assetIndex += 1) {
    let asset = project.assets.assets[assetIndex]!;

    for (const locale of Object.keys(asset.variants)) {
      if (!(await shouldRegenerateAssetPreview(asset, locale))) {
        continue;
      }

      asset = await generateProxy(asset, locale, projectDir);
      project.assets.assets[assetIndex] = asset;
      updated = true;
    }
  }

  if (!updated) {
    return project;
  }

  return saveProjectToDirectory(projectDir, project);
}

async function shouldRegenerateAssetPreview(asset: Asset, locale: string): Promise<boolean> {
  const variant = resolveAssetVariant(asset, locale);
  if (!variant) {
    return false;
  }

  if (asset.kind === "audio") {
    return !(await pathExists(variant.proxyPath));
  }

  if (asset.kind === "video") {
    return !(await pathExists(variant.proxyPath)) || !(await pathExists(variant.posterPath));
  }

  if (!(await pathExists(variant.proxyPath))) {
    return true;
  }

  if (!(await pathExists(variant.posterPath))) {
    return true;
  }

  return variant.posterPath === variant.proxyPath;
}

async function pathExists(candidatePath: string | undefined): Promise<boolean> {
  if (!candidatePath) {
    return false;
  }

  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

function resolveStarterSceneTemplatePath(): string {
  const bundledAssetPath = path.join(__dirname, STARTER_SCENE_ASSET_NAME);
  if (existsSync(bundledAssetPath)) {
    return bundledAssetPath;
  }

  return path.resolve(__dirname, "..", "electron", STARTER_SCENE_ASSET_NAME);
}

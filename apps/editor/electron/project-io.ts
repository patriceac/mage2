import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeFileSha256 } from "@mage2/media";
import {
  createDefaultProjectBundle,
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

const STARTER_SCENE_ASSET_NAME = "starter-scene.svg";

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

  return parseProjectBundle(rawBundle);
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
  await saveProjectToDirectory(projectDir, project);
  return project;
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
  await writeFile(starterAssetPath, createStarterSceneSvg(), "utf8");

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
    project.assets.assets[existingAssetIndex] = starterAsset;
  } else {
    project.assets.assets.push(starterAsset);
  }

  if (!project.manifest.assetRoots.includes(assetsDir)) {
    project.manifest.assetRoots.push(assetsDir);
  }
}

function createStarterSceneSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">',
    '<defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#12202b"/><stop offset="100%" stop-color="#081018"/></linearGradient></defs>',
    '<rect width="1280" height="720" fill="url(#bg)"/>',
    '<circle cx="1010" cy="120" r="150" fill="#f6c177" opacity="0.22"/>',
    '<rect x="84" y="78" width="540" height="140" rx="28" fill="#0d1720" opacity="0.78"/>',
    '<text x="120" y="148" fill="#f7fafc" font-size="56" font-family="Segoe UI, IBM Plex Sans, sans-serif">MAGE2 Starter Scene</text>',
    '<text x="120" y="196" fill="#7dd3fc" font-size="26" font-family="Segoe UI, IBM Plex Sans, sans-serif">Import footage in Assets, then assign it in Scenes.</text>',
    "</svg>"
  ].join("");
}

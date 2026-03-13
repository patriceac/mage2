import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createDefaultProjectBundle,
  migrateProjectBundle,
  parseProjectBundle,
  type Asset,
  type Hotspot,
  type ProjectBundle
} from "@mage2/schema";

const FILES = {
  manifest: "project.json",
  assets: "assets.json",
  locations: "locations.json",
  scenes: "scenes.json",
  dialogues: "dialogues.json",
  inventory: "inventory.json",
  subtitles: "subtitles.json",
  strings: "strings.json"
} as const;

const STARTER_SCENE_HOTSPOT_BOUNDS = {
  x: 900 / 1280,
  y: 360 / 720,
  width: 220 / 1280,
  height: 170 / 720
} as const;

const STARTER_SCENE_ASSET_NAME = "starter-scene.svg";
const STARTER_HOTSPOT_NAME = "Placeholder";
const STARTER_HOTSPOT_LABEL_TEXT_ID = "text.hotspot.inspect";
const STARTER_HOTSPOT_COMMENT_TEXT_ID = "text.hotspot.inspect.comment";
const STARTER_HOTSPOT_COMMENT = "Add real hotspots in Scenes";

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
    subtitles: await readJson(filePaths.subtitles),
    strings: await readJson(filePaths.strings)
  };

  const project = migrateProjectBundle(rawBundle);
  const repairedStarterAsset = await repairStarterSceneAssetIfNeeded(projectDir, project);
  const repairedLegacyHotspot = repairLegacyStarterHotspotIfNeeded(project);
  if (repairedStarterAsset || repairedLegacyHotspot) {
    await saveProjectToDirectory(projectDir, project);
  }

  return project;
}

export async function createProjectInDirectory(
  projectDir: string,
  projectName: string
): Promise<ProjectBundle> {
  const project = createDefaultProjectBundle(projectName);
  project.manifest.projectId = slugify(projectName);
  repairLegacyStarterHotspotIfNeeded(project);
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
    writeJson(filePaths.subtitles, normalized.subtitles),
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

  await mkdir(assetsDir, { recursive: true });
  await writeFile(starterAssetPath, createStarterSceneSvg(), "utf8");

  const starterAsset: Asset = {
    id: "asset_placeholder",
    kind: "image",
    name: STARTER_SCENE_ASSET_NAME,
    sourcePath: starterAssetPath,
    importedAt: new Date().toISOString(),
    width: 1280,
    height: 720
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

async function repairStarterSceneAssetIfNeeded(
  projectDir: string,
  project: ProjectBundle
): Promise<boolean> {
  const hasPlaceholderScene = project.scenes.items.some((scene) => scene.backgroundAssetId === "asset_placeholder");
  const placeholderAsset = project.assets.assets.find((asset) => asset.id === "asset_placeholder");
  const starterAssetPath = path.join(projectDir, "assets", STARTER_SCENE_ASSET_NAME);

  if (!hasPlaceholderScene) {
    return false;
  }

  if (!placeholderAsset) {
    await seedStarterSceneAsset(projectDir, project);
    return true;
  }

  if (!shouldRefreshStarterSceneAsset(placeholderAsset, starterAssetPath)) {
    return false;
  }

  try {
    const source = await readFile(starterAssetPath, "utf8");
    if (!isLegacyStarterSceneAsset(source)) {
      return false;
    }
  } catch {
    // Missing or unreadable starter art should be recreated.
  }

  await seedStarterSceneAsset(projectDir, project);
  return true;
}

function repairLegacyStarterHotspotIfNeeded(project: ProjectBundle): boolean {
  const starterHotspot = createStarterHotspotDefinition();
  let repaired = false;

  for (const scene of project.scenes.items) {
    if (scene.backgroundAssetId !== "asset_placeholder") {
      continue;
    }

    const hotspotIndex = scene.hotspots.findIndex((hotspot) =>
      isLegacyStarterHotspot(hotspot, project.strings.values[starterHotspot.labelTextId])
    );

    if (hotspotIndex < 0) {
      continue;
    }

    scene.hotspots[hotspotIndex] = {
      ...scene.hotspots[hotspotIndex],
      ...starterHotspot
    };
    project.strings.values[starterHotspot.labelTextId] = STARTER_HOTSPOT_NAME;
    if (starterHotspot.commentTextId) {
      project.strings.values[starterHotspot.commentTextId] = STARTER_HOTSPOT_COMMENT;
    }
    repaired = true;
  }

  return repaired;
}

// Keep the repair payload local so editor builds do not depend on a separately built schema helper.
function createStarterHotspotDefinition(): Hotspot {
  return {
    id: "hotspot_inspect",
    name: STARTER_HOTSPOT_NAME,
    labelTextId: STARTER_HOTSPOT_LABEL_TEXT_ID,
    commentTextId: STARTER_HOTSPOT_COMMENT_TEXT_ID,
    ...STARTER_SCENE_HOTSPOT_BOUNDS,
    startMs: 0,
    endMs: 30000,
    requiredItemIds: [],
    conditions: [{ type: "always" }],
    effects: []
  };
}

function isLegacyStarterHotspot(
  hotspot: ProjectBundle["scenes"]["items"][number]["hotspots"][number],
  labelText: string | undefined
): boolean {
  return (
    hotspot.id === "hotspot_inspect" &&
    hotspot.labelTextId === "text.hotspot.inspect" &&
    hasStarterHotspotBounds(hotspot) &&
    hotspot.startMs === 0 &&
    hotspot.endMs === 30000 &&
    hotspot.requiredItemIds.length === 0 &&
    hotspot.conditions.length === 1 &&
    hotspot.conditions[0]?.type === "always" &&
    hotspot.effects.length === 0 &&
    (hotspot.name === "Inspect" ||
      hotspot.name === "Hotspot" ||
      hotspot.name === STARTER_HOTSPOT_NAME ||
      labelText === "Inspect" ||
      labelText === "Hotspot" ||
      labelText === STARTER_HOTSPOT_NAME ||
      !hotspot.commentTextId)
  );
}

function hasStarterHotspotBounds(
  hotspot: ProjectBundle["scenes"]["items"][number]["hotspots"][number]
): boolean {
  return (
    (hotspot.x === 0.15 &&
      hotspot.y === 0.2 &&
      hotspot.width === 0.2 &&
      hotspot.height === 0.18) ||
    (hotspot.x === STARTER_SCENE_HOTSPOT_BOUNDS.x &&
      hotspot.y === STARTER_SCENE_HOTSPOT_BOUNDS.y &&
      hotspot.width === STARTER_SCENE_HOTSPOT_BOUNDS.width &&
      hotspot.height === STARTER_SCENE_HOTSPOT_BOUNDS.height)
  );
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

function shouldRefreshStarterSceneAsset(asset: Asset, starterAssetPath: string): boolean {
  return (
    asset.kind === "image" &&
    asset.name === STARTER_SCENE_ASSET_NAME &&
    path.resolve(asset.sourcePath) === path.resolve(starterAssetPath)
  );
}

function isLegacyStarterSceneAsset(source: string): boolean {
  return (
    source.includes(">Hotspot</text>") ||
    source.includes("Click in Scenes to add more") ||
    source.includes(">Placeholder</text>") ||
    source.includes("Add real hotspots")
  );
}

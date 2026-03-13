import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createStarterHotspot,
  createDefaultProjectBundle,
  migrateProjectBundle,
  parseProjectBundle,
  type Asset,
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
  const starterAssetPath = path.join(assetsDir, "starter-scene.svg");

  await mkdir(assetsDir, { recursive: true });
  await writeFile(
    starterAssetPath,
    [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">',
      '<defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#12202b"/><stop offset="100%" stop-color="#081018"/></linearGradient></defs>',
      '<rect width="1280" height="720" fill="url(#bg)"/>',
      '<circle cx="1010" cy="120" r="150" fill="#f6c177" opacity="0.22"/>',
      '<rect x="84" y="78" width="540" height="140" rx="28" fill="#0d1720" opacity="0.78"/>',
      '<text x="120" y="148" fill="#f7fafc" font-size="56" font-family="Segoe UI, IBM Plex Sans, sans-serif">MAGE2 Starter Scene</text>',
      '<text x="120" y="196" fill="#7dd3fc" font-size="26" font-family="Segoe UI, IBM Plex Sans, sans-serif">Import footage in Assets, then assign it in Scenes.</text>',
      '<rect x="900" y="360" width="220" height="170" rx="18" fill="#132330" stroke="#7dd3fc" stroke-width="4" opacity="0.92"/>',
      '<text x="943" y="455" fill="#f7fafc" font-size="28" font-family="Segoe UI, IBM Plex Sans, sans-serif">Hotspot</text>',
      '<text x="918" y="492" fill="#9fb0be" font-size="18" font-family="Segoe UI, IBM Plex Sans, sans-serif">Click in Scenes to add more</text>',
      "</svg>"
    ].join(""),
    "utf8"
  );

  const starterAsset: Asset = {
    id: "asset_placeholder",
    kind: "image",
    name: "starter-scene.svg",
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
  const hasPlaceholderAsset = project.assets.assets.some((asset) => asset.id === "asset_placeholder");

  if (!hasPlaceholderScene || hasPlaceholderAsset) {
    return false;
  }

  await seedStarterSceneAsset(projectDir, project);
  return true;
}

function repairLegacyStarterHotspotIfNeeded(project: ProjectBundle): boolean {
  const starterHotspot = createStarterHotspot();
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
    project.strings.values[starterHotspot.labelTextId] = starterHotspot.name;
    repaired = true;
  }

  return repaired;
}

function isLegacyStarterHotspot(
  hotspot: ProjectBundle["scenes"]["items"][number]["hotspots"][number],
  labelText: string | undefined
): boolean {
  return (
    hotspot.id === "hotspot_inspect" &&
    hotspot.labelTextId === "text.hotspot.inspect" &&
    hotspot.x === 0.15 &&
    hotspot.y === 0.2 &&
    hotspot.width === 0.2 &&
    hotspot.height === 0.18 &&
    hotspot.startMs === 0 &&
    hotspot.endMs === 30000 &&
    hotspot.requiredItemIds.length === 0 &&
    hotspot.conditions.length === 1 &&
    hotspot.conditions[0]?.type === "always" &&
    hotspot.effects.length === 0 &&
    (hotspot.name === "Inspect" || labelText === "Inspect")
  );
}

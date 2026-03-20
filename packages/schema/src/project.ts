import {
  type Asset,
  type AssetVariant,
  type BuildManifest,
  type ExportProjectData,
  type Hotspot,
  type ProjectBundle,
  type SaveState,
  BuildManifestSchema,
  CURRENT_SCHEMA_VERSION,
  ProjectBundleSchema,
  SaveStateSchema
} from "./types";
import { createRectangleHotspotPolygon } from "./hotspots";
import { normalizeSupportedLocales } from "./localization";

export function parseProjectBundle(input: unknown): ProjectBundle {
  return ProjectBundleSchema.parse(normalizeProjectBundleInput(input));
}

export function parseSaveState(input: unknown): SaveState {
  return SaveStateSchema.parse(input);
}

export function parseBuildManifest(input: unknown): BuildManifest {
  return BuildManifestSchema.parse(input);
}

const STARTER_SCENE_HOTSPOT_BOUNDS = {
  x: 900 / 1280,
  y: 360 / 720,
  width: 220 / 1280,
  height: 170 / 720
} as const;

const STARTER_HOTSPOT_NAME = "Placeholder";
const STARTER_HOTSPOT_COMMENT_TEXT_ID = "text.hotspot.inspect.comment";
const STARTER_HOTSPOT_COMMENT = "Add real hotspots in Scenes";

export function createStarterHotspot(): Hotspot {
  const polygon = createRectangleHotspotPolygon(STARTER_SCENE_HOTSPOT_BOUNDS);

  return {
    id: "hotspot_inspect",
    name: STARTER_HOTSPOT_NAME,
    commentTextId: STARTER_HOTSPOT_COMMENT_TEXT_ID,
    ...STARTER_SCENE_HOTSPOT_BOUNDS,
    polygon,
    startMs: 0,
    endMs: 30000,
    requiredItemIds: [],
    conditions: [{ type: "always" }],
    effects: []
  };
}

export function createDefaultProjectBundle(projectName = "New FMV Project"): ProjectBundle {
  const locationId = "location_intro";
  const sceneId = "scene_intro";
  const defaultLanguage = "en";

  return {
    manifest: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      projectId: "project_default",
      projectName,
      defaultLanguage,
      supportedLocales: [defaultLanguage],
      engineVersion: "0.1.0",
      assetRoots: [],
      startLocationId: locationId,
      startSceneId: sceneId,
      buildSettings: {
        outputDir: "build",
        includeSourceMap: false
      }
    },
    assets: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      assets: []
    },
    locations: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: [
        {
          id: locationId,
          name: "Intro",
          x: 240,
          y: 140,
          sceneIds: [sceneId]
        }
      ]
    },
    scenes: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: [
        {
          id: sceneId,
          locationId,
          name: "Opening Scene",
          backgroundAssetId: "asset_placeholder",
          backgroundVideoLoop: false,
          hotspots: [createStarterHotspot()],
          subtitleTracks: [],
          dialogueTreeIds: [],
          onEnterEffects: [],
          onExitEffects: []
        }
      ]
    },
    dialogues: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: []
    },
    inventory: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: []
    },
    strings: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byLocale: {
        [defaultLanguage]: {
          [STARTER_HOTSPOT_COMMENT_TEXT_ID]: STARTER_HOTSPOT_COMMENT
        }
      }
    }
  };
}

export function createInitialSaveState(project: ProjectBundle): SaveState {
  return {
    currentLocationId: project.manifest.startLocationId,
    currentSceneId: project.manifest.startSceneId,
    inventory: [],
    flags: {},
    visitedSceneIds: [project.manifest.startSceneId],
    playheadMs: 0
  };
}

export function toExportProjectData(project: ProjectBundle): ExportProjectData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    manifest: project.manifest,
    assets: project.assets.assets,
    locations: project.locations.items,
    scenes: project.scenes.items,
    dialogues: project.dialogues.items,
    inventoryItems: project.inventory.items,
    strings: project.strings.byLocale
  };
}

function normalizeProjectBundleInput(input: unknown): unknown {
  if (!input || typeof input !== "object") {
    return input;
  }

  const rawBundle = input as Record<string, unknown>;
  const manifest = normalizeManifest(rawBundle.manifest);
  const defaultLanguage = manifest.defaultLanguage;
  const strings = normalizeStrings(rawBundle.strings, defaultLanguage);

  for (const locale of manifest.supportedLocales) {
    strings.byLocale[locale] ??= {};
  }

  return {
    ...rawBundle,
    manifest,
    assets: normalizeAssets(rawBundle.assets, defaultLanguage),
    strings,
    locations: normalizeSchemaVersionedFile(rawBundle.locations),
    scenes: normalizeSchemaVersionedFile(rawBundle.scenes),
    dialogues: normalizeSchemaVersionedFile(rawBundle.dialogues),
    inventory: normalizeSchemaVersionedFile(rawBundle.inventory)
  };
}

function normalizeManifest(input: unknown) {
  const rawManifest = isRecord(input) ? input : {};
  const defaultLanguage =
    typeof rawManifest.defaultLanguage === "string" && rawManifest.defaultLanguage.trim().length > 0
      ? rawManifest.defaultLanguage.trim()
      : "en";

  return {
    ...rawManifest,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    defaultLanguage,
    supportedLocales: normalizeSupportedLocales(
      defaultLanguage,
      Array.isArray(rawManifest.supportedLocales)
        ? rawManifest.supportedLocales.filter((value): value is string => typeof value === "string")
        : []
    )
  };
}

function normalizeAssets(input: unknown, defaultLanguage: string) {
  const rawAssets = isRecord(input) ? input : {};
  const rawItems = Array.isArray(rawAssets.assets) ? rawAssets.assets : [];

  return {
    ...rawAssets,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    assets: rawItems.map((asset) => normalizeAsset(asset, defaultLanguage))
  };
}

function normalizeAsset(input: unknown, defaultLanguage: string): Asset {
  const rawAsset = isRecord(input) ? input : {};
  const normalizedVariants = normalizeAssetVariants(rawAsset, defaultLanguage);

  return {
    id: typeof rawAsset.id === "string" ? rawAsset.id : "asset_invalid",
    kind:
      rawAsset.kind === "video" || rawAsset.kind === "image" || rawAsset.kind === "audio"
        ? rawAsset.kind
        : "image",
    name: typeof rawAsset.name === "string" && rawAsset.name.length > 0 ? rawAsset.name : "Unnamed Asset",
    variants: normalizedVariants
  };
}

function normalizeAssetVariants(input: Record<string, unknown>, defaultLanguage: string): Record<string, AssetVariant> {
  if (isRecord(input.variants)) {
    const variants: Record<string, AssetVariant> = {};
    for (const [locale, variant] of Object.entries(input.variants)) {
      if (isRecord(variant)) {
        variants[locale] = normalizeAssetVariant(variant);
      }
    }
    return variants;
  }

  if (typeof input.sourcePath === "string" && input.sourcePath.length > 0) {
    return {
      [defaultLanguage]: normalizeAssetVariant(input)
    };
  }

  return {};
}

function normalizeAssetVariant(input: Record<string, unknown>): AssetVariant {
  return {
    sourcePath: typeof input.sourcePath === "string" ? input.sourcePath : "",
    importSourcePath: typeof input.importSourcePath === "string" ? input.importSourcePath : undefined,
    sha256: typeof input.sha256 === "string" ? input.sha256 : undefined,
    proxyPath: typeof input.proxyPath === "string" ? input.proxyPath : undefined,
    posterPath: typeof input.posterPath === "string" ? input.posterPath : undefined,
    durationMs: typeof input.durationMs === "number" ? input.durationMs : undefined,
    width: typeof input.width === "number" ? input.width : undefined,
    height: typeof input.height === "number" ? input.height : undefined,
    codec: typeof input.codec === "string" ? input.codec : undefined,
    importedAt:
      typeof input.importedAt === "string" && input.importedAt.length > 0
        ? input.importedAt
        : new Date(0).toISOString()
  };
}

function normalizeStrings(input: unknown, defaultLanguage: string) {
  const rawStrings = isRecord(input) ? input : {};

  if (isRecord(rawStrings.byLocale)) {
    return {
      ...rawStrings,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byLocale: Object.fromEntries(
        Object.entries(rawStrings.byLocale).map(([locale, values]) => [
          locale,
          normalizeStringRecord(values)
        ])
      )
    };
  }

  return {
    ...rawStrings,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    byLocale: {
      [defaultLanguage]: normalizeStringRecord(rawStrings.values)
    }
  };
}

function normalizeStringRecord(input: unknown): Record<string, string> {
  if (!isRecord(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => typeof value === "string")
  ) as Record<string, string>;
}

function normalizeSchemaVersionedFile(input: unknown) {
  const rawFile = isRecord(input) ? input : {};
  return {
    ...rawFile,
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

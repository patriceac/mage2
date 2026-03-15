import {
  type BuildManifest,
  type ExportProjectData,
  type Hotspot,
  type ProjectBundle,
  type SaveState,
  BuildManifestSchema,
  CURRENT_SCHEMA_VERSION,
  ProjectBundleSchema,
  SaveStateSchema,
  type StringTable
} from "./types";
import { createRectangleHotspotPolygon } from "./hotspots";

export function parseProjectBundle(input: unknown): ProjectBundle {
  return ProjectBundleSchema.parse(input);
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
const STARTER_HOTSPOT_LABEL_TEXT_ID = "text.hotspot.inspect";
const STARTER_HOTSPOT_COMMENT_TEXT_ID = "text.hotspot.inspect.comment";
const STARTER_HOTSPOT_COMMENT = "Add real hotspots in Scenes";

export function createStarterHotspot(): Hotspot {
  const polygon = createRectangleHotspotPolygon(STARTER_SCENE_HOTSPOT_BOUNDS);

  return {
    id: "hotspot_inspect",
    name: STARTER_HOTSPOT_NAME,
    labelTextId: STARTER_HOTSPOT_LABEL_TEXT_ID,
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

  return {
    manifest: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      projectId: "project_default",
      projectName,
      defaultLanguage: "en",
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
          descriptionTextId: "text.location.intro",
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
          clipSegments: [],
          hotspots: [createStarterHotspot()],
          exitSceneIds: [],
          subtitleTrackIds: [],
          dialogueTreeIds: [],
          overlayTextId: "text.scene.intro",
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
    subtitles: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: []
    },
    strings: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      values: {
        "text.location.intro": "Starting location",
        "text.scene.intro": "Opening scene",
        [STARTER_HOTSPOT_LABEL_TEXT_ID]: STARTER_HOTSPOT_NAME,
        [STARTER_HOTSPOT_COMMENT_TEXT_ID]: STARTER_HOTSPOT_COMMENT
      }
    }
  };
}

export function migrateProjectBundle(input: unknown): ProjectBundle {
  if (typeof input !== "object" || input === null) {
    return createDefaultProjectBundle();
  }

  const raw = input as Record<string, unknown>;
  const rawManifest = raw.manifest as Record<string, unknown> | undefined;
  const schemaVersion =
    typeof rawManifest?.schemaVersion === "number" ? rawManifest.schemaVersion : 0;

  if (schemaVersion >= CURRENT_SCHEMA_VERSION) {
    return parseProjectBundle(input);
  }

  const defaults = createDefaultProjectBundle(
    typeof rawManifest?.projectName === "string" ? rawManifest.projectName : "Migrated Project"
  );

  return parseProjectBundle({
    ...defaults,
    ...raw,
    manifest: {
      ...defaults.manifest,
      ...(rawManifest ?? {}),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      buildSettings: {
        ...defaults.manifest.buildSettings,
        ...((rawManifest?.buildSettings as Record<string, unknown>) ?? {})
      }
    },
    assets: normalizeArrayFile(raw.assets, "assets"),
    locations: normalizeArrayFile(raw.locations, "items"),
    scenes: normalizeArrayFile(raw.scenes, "items"),
    dialogues: normalizeArrayFile(raw.dialogues, "items"),
    inventory: normalizeArrayFile(raw.inventory, "items"),
    subtitles: normalizeArrayFile(raw.subtitles, "items"),
    strings: normalizeStrings(raw.strings)
  });
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
    subtitleTracks: project.subtitles.items,
    strings: project.strings.values
  };
}

function normalizeArrayFile(
  input: unknown,
  arrayKey: "assets" | "items"
): { schemaVersion: number; [key: string]: unknown } {
  if (!input || typeof input !== "object") {
    return { schemaVersion: CURRENT_SCHEMA_VERSION, [arrayKey]: [] };
  }

  const raw = input as Record<string, unknown>;
  if (Array.isArray(raw[arrayKey])) {
    return { schemaVersion: CURRENT_SCHEMA_VERSION, [arrayKey]: raw[arrayKey] };
  }

  if (Array.isArray(input)) {
    return { schemaVersion: CURRENT_SCHEMA_VERSION, [arrayKey]: input };
  }

  return { schemaVersion: CURRENT_SCHEMA_VERSION, [arrayKey]: [] };
}

function normalizeStrings(input: unknown): StringTable {
  if (!input || typeof input !== "object") {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      values: {}
    };
  }

  const raw = input as Record<string, unknown>;
  const values =
    raw.values && typeof raw.values === "object"
      ? (raw.values as Record<string, string>)
      : (raw as Record<string, string>);

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    values
  };
}

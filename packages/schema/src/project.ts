import {
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
      values: {
        [STARTER_HOTSPOT_COMMENT_TEXT_ID]: STARTER_HOTSPOT_COMMENT
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
    strings: project.strings.values
  };
}

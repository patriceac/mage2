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
          hotspots: [createStarterHotspot()],
          exitSceneIds: [],
          subtitleTracks: [],
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
  const assets = normalizeAssetEntries(raw.assets);
  const locations = normalizeItems(raw.locations);
  const legacyScenes = normalizeItems(raw.scenes);
  const dialogues = normalizeItems(raw.dialogues);
  const inventory = normalizeItems(raw.inventory);
  const strings = normalizeStrings(raw.strings);
  const legacySubtitleTracks = normalizeItems(raw.subtitles);
  const migratedSubtitleTextIds = collectLegacySubtitleTextIds(legacyScenes, legacySubtitleTracks);
  const migratedScenes = migrateScenesWithInlineSubtitles(legacyScenes, legacySubtitleTracks, strings.values);
  const migratedStrings = pruneMigratedSubtitleStrings(
    strings.values,
    migratedSubtitleTextIds,
    locations,
    migratedScenes,
    dialogues,
    inventory
  );
  const migratedAssets = assets.filter((asset) => asset.kind !== "subtitle");

  return parseProjectBundle({
    ...defaults,
    ...raw,
    manifest: {
      ...defaults.manifest,
      ...(rawManifest ?? {}),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      assetRoots: collectAssetRoots(migratedAssets),
      buildSettings: {
        ...defaults.manifest.buildSettings,
        ...((rawManifest?.buildSettings as Record<string, unknown>) ?? {})
      }
    },
    assets: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      assets: migratedAssets
    },
    locations: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: locations
    },
    scenes: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: migratedScenes
    },
    dialogues: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: dialogues
    },
    inventory: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: inventory
    },
    strings: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      values: migratedStrings
    }
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

function normalizeItems(input: unknown): Record<string, unknown>[] {
  const normalized = normalizeArrayFile(input, "items");
  return Array.isArray(normalized.items) ? (normalized.items as Record<string, unknown>[]) : [];
}

function normalizeAssetEntries(input: unknown): Record<string, unknown>[] {
  const normalized = normalizeArrayFile(input, "assets");
  return Array.isArray(normalized.assets) ? (normalized.assets as Record<string, unknown>[]) : [];
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

function migrateScenesWithInlineSubtitles(
  legacyScenes: Record<string, unknown>[],
  legacySubtitleTracks: Record<string, unknown>[],
  strings: Record<string, string>
): Record<string, unknown>[] {
  const tracksById = new Map<string, Record<string, unknown>>();
  const trackReferenceCounts = new Map<string, number>();
  const usedTrackIds = new Set<string>();
  const usedCueIds = new Set<string>();
  let generatedTrackCount = 0;
  let generatedCueCount = 0;

  for (const track of legacySubtitleTracks) {
    if (typeof track.id === "string") {
      tracksById.set(track.id, track);
    }
  }

  for (const scene of legacyScenes) {
    const legacyTrackIds = Array.isArray(scene.subtitleTrackIds) ? scene.subtitleTrackIds : [];
    for (const trackId of legacyTrackIds) {
      if (typeof trackId === "string") {
        trackReferenceCounts.set(trackId, (trackReferenceCounts.get(trackId) ?? 0) + 1);
      }
    }
  }

  return legacyScenes.map((scene) => {
    const subtitleTracks = Array.isArray(scene.subtitleTracks)
      ? scene.subtitleTracks
          .filter((track): track is Record<string, unknown> => Boolean(track) && typeof track === "object")
          .map((track) =>
            migrateSubtitleTrack(track, strings, usedTrackIds, usedCueIds, {
              nextTrackId: () => `subtitle_migrated_${generatedTrackCount += 1}`,
              nextCueId: () => `cue_migrated_${generatedCueCount += 1}`
            })
          )
      : [];

    if (subtitleTracks.length > 0) {
      return {
        ...scene,
        subtitleTracks
      };
    }

    const legacyTrackIds = Array.isArray(scene.subtitleTrackIds) ? scene.subtitleTrackIds : [];
    const migratedTracks = legacyTrackIds.flatMap((trackId) => {
      if (typeof trackId !== "string") {
        return [];
      }

      const legacyTrack = tracksById.get(trackId);
      if (!legacyTrack) {
        return [];
      }

      const duplicateTrack = (trackReferenceCounts.get(trackId) ?? 0) > 1;
      return [
        migrateSubtitleTrack(legacyTrack, strings, usedTrackIds, usedCueIds, {
          nextTrackId: () => `subtitle_migrated_${generatedTrackCount += 1}`,
          nextCueId: () => `cue_migrated_${generatedCueCount += 1}`,
          forceNewIds: duplicateTrack
        })
      ];
    });

    return {
      ...scene,
      subtitleTracks: migratedTracks
    };
  });
}

function migrateSubtitleTrack(
  track: Record<string, unknown>,
  strings: Record<string, string>,
  usedTrackIds: Set<string>,
  usedCueIds: Set<string>,
  options: {
    nextTrackId: () => string;
    nextCueId: () => string;
    forceNewIds?: boolean;
  }
): Record<string, unknown> {
  const trackId = resolveUniqueId(
    options.forceNewIds ? undefined : track.id,
    usedTrackIds,
    options.nextTrackId
  );
  const legacyCues = Array.isArray(track.cues) ? track.cues : [];

  return {
    id: trackId,
    cues: legacyCues
      .filter((cue): cue is Record<string, unknown> => Boolean(cue) && typeof cue === "object")
      .map((cue) => ({
        id: resolveUniqueId(options.forceNewIds ? undefined : cue.id, usedCueIds, options.nextCueId),
        startMs: typeof cue.startMs === "number" ? cue.startMs : 0,
        endMs: typeof cue.endMs === "number" ? cue.endMs : 0,
        text:
          typeof cue.text === "string"
            ? cue.text
            : typeof cue.textId === "string"
              ? (strings[cue.textId] ?? cue.textId)
              : ""
      }))
  };
}

function resolveUniqueId(
  candidate: unknown,
  usedIds: Set<string>,
  generateFallback: () => string
): string {
  if (typeof candidate === "string" && candidate.length > 0 && !usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }

  let generatedId = generateFallback();
  while (usedIds.has(generatedId)) {
    generatedId = generateFallback();
  }

  usedIds.add(generatedId);
  return generatedId;
}

function pruneMigratedSubtitleStrings(
  strings: Record<string, string>,
  subtitleTextIds: Set<string>,
  locations: Record<string, unknown>[],
  scenes: Record<string, unknown>[],
  dialogues: Record<string, unknown>[],
  inventory: Record<string, unknown>[]
): Record<string, string> {
  if (subtitleTextIds.size === 0) {
    return strings;
  }

  const retainedTextIds = collectNonSubtitleTextIds(locations, scenes, dialogues, inventory);
  const nextStrings = { ...strings };

  for (const textId of subtitleTextIds) {
    if (!retainedTextIds.has(textId)) {
      delete nextStrings[textId];
    }
  }

  return nextStrings;
}

function collectLegacySubtitleTextIds(
  legacyScenes: Record<string, unknown>[],
  legacySubtitleTracks: Record<string, unknown>[]
): Set<string> {
  const textIds = new Set<string>();

  for (const track of legacySubtitleTracks) {
    const cues = Array.isArray(track.cues) ? track.cues : [];
    for (const cue of cues) {
      if (cue && typeof cue === "object" && typeof cue.textId === "string") {
        textIds.add(cue.textId);
      }
    }
  }

  for (const scene of legacyScenes) {
    const subtitleTracks = Array.isArray(scene.subtitleTracks) ? scene.subtitleTracks : [];
    for (const track of subtitleTracks) {
      if (!track || typeof track !== "object" || !Array.isArray(track.cues)) {
        continue;
      }

      for (const cue of track.cues) {
        if (cue && typeof cue === "object" && typeof cue.textId === "string") {
          textIds.add(cue.textId);
        }
      }
    }
  }

  return textIds;
}

function collectNonSubtitleTextIds(
  locations: Record<string, unknown>[],
  scenes: Record<string, unknown>[],
  dialogues: Record<string, unknown>[],
  inventory: Record<string, unknown>[]
): Set<string> {
  const textIds = new Set<string>();

  for (const location of locations) {
    if (typeof location.descriptionTextId === "string") {
      textIds.add(location.descriptionTextId);
    }
  }

  for (const scene of scenes) {
    if (typeof scene.overlayTextId === "string") {
      textIds.add(scene.overlayTextId);
    }

    const hotspots = Array.isArray(scene.hotspots) ? scene.hotspots : [];
    for (const hotspot of hotspots) {
      if (!hotspot || typeof hotspot !== "object") {
        continue;
      }

      if (typeof hotspot.labelTextId === "string") {
        textIds.add(hotspot.labelTextId);
      }

      if (typeof hotspot.commentTextId === "string") {
        textIds.add(hotspot.commentTextId);
      }
    }
  }

  for (const dialogue of dialogues) {
    const nodes = Array.isArray(dialogue.nodes) ? dialogue.nodes : [];
    for (const node of nodes) {
      if (!node || typeof node !== "object") {
        continue;
      }

      if (typeof node.textId === "string") {
        textIds.add(node.textId);
      }

      const choices = Array.isArray(node.choices) ? node.choices : [];
      for (const choice of choices) {
        if (choice && typeof choice === "object" && typeof choice.textId === "string") {
          textIds.add(choice.textId);
        }
      }
    }
  }

  for (const item of inventory) {
    if (typeof item.textId === "string") {
      textIds.add(item.textId);
    }

    if (typeof item.descriptionTextId === "string") {
      textIds.add(item.descriptionTextId);
    }
  }

  return textIds;
}

function collectAssetRoots(assets: Record<string, unknown>[]): string[] {
  const assetRoots: string[] = [];

  for (const asset of assets) {
    if (typeof asset.sourcePath !== "string") {
      continue;
    }

    const root = asset.sourcePath.replace(/[\\/][^\\/]+$/, "");
    if (root && !assetRoots.includes(root)) {
      assetRoots.push(root);
    }
  }

  return assetRoots;
}

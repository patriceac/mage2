import {
  type Asset,
  type AssetCategory,
  type AssetVariant,
  type BuildManifest,
  type ExportProjectData,
  type Hotspot,
  type ProjectBundle,
  type SaveState,
  type StringTranslationState,
  BuildManifestSchema,
  CURRENT_SCHEMA_VERSION,
  ProjectBundleSchema,
  SaveStateSchema
} from "./types";
import { createRectangleHotspotPolygon } from "./hotspots";
import { normalizeSupportedLocales } from "./localization";
import {
  createStarterResponseGroups,
  createStarterResponseGroupsIntroducedAfter,
  seedStarterResponseStrings,
  STARTER_RESPONSE_LIBRARY_VERSION
} from "./responses";
import { migrateProjectBundle } from "./migrations";

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
  x: 338 / 1280,
  y: 444 / 720,
  width: 244 / 1280,
  height: 148 / 720
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
    timingMode: "sceneDuration",
    requiredItemIds: [],
    conditions: [{ type: "always" }],
    effects: []
  };
}

export function createDefaultProjectBundle(projectName = "New FMV Project"): ProjectBundle {
  const locationId = "location_intro";
  const sceneId = "scene_intro";
  const defaultLanguage = "en";
  const byLocale: Record<string, Record<string, string>> = {
    [defaultLanguage]: {
      [STARTER_HOTSPOT_COMMENT_TEXT_ID]: STARTER_HOTSPOT_COMMENT
    }
  };
  seedStarterResponseStrings(byLocale);

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
          sceneAudioLoop: true,
          sceneAudioDelayMs: 0,
          backgroundVideoLoop: false,
          hotspots: [createStarterHotspot()],
          dialogueTreeIds: [],
          onEnterEffects: [],
          onExitEffects: []
        }
      ]
    },
    dialogues: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: [],
      responseGroups: createStarterResponseGroups(),
      starterResponsesVersion: STARTER_RESPONSE_LIBRARY_VERSION
    },
    inventory: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: []
    },
    strings: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byLocale,
      translationStateByLocale: {
        [defaultLanguage]: {}
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
    responseGroups: project.dialogues.responseGroups,
    starterResponsesVersion: project.dialogues.starterResponsesVersion,
    inventoryItems: project.inventory.items,
    strings: project.strings.byLocale
  };
}

function normalizeProjectBundleInput(input: unknown): unknown {
  const rawBundle = migrateProjectBundle(input);
  const manifest = normalizeManifest(rawBundle.manifest);
  const defaultLanguage = manifest.defaultLanguage;
  const strings = normalizeStrings(rawBundle.strings, defaultLanguage);

  for (const locale of manifest.supportedLocales) {
    strings.byLocale[locale] ??= {};
    strings.translationStateByLocale[locale] ??= {};
  }

  backfillStringTranslationStates(strings, defaultLanguage);

  return {
    ...rawBundle,
    manifest,
    assets: normalizeAssets(rawBundle.assets, defaultLanguage),
    strings,
    locations: normalizeSchemaVersionedFile(rawBundle.locations),
    scenes: normalizeScenes(rawBundle.scenes),
    dialogues: normalizeDialogues(rawBundle.dialogues, strings),
    inventory: normalizeSchemaVersionedFile(rawBundle.inventory)
  };
}

function normalizeScenes(input: unknown) {
  const rawFile = isRecord(input) ? input : {};
  const rawItems = Array.isArray(rawFile.items) ? rawFile.items : [];

  return {
    ...rawFile,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    items: rawItems.map((scene) => {
      if (!isRecord(scene) || !Array.isArray(scene.hotspots)) {
        return scene;
      }

      return {
        ...scene,
        hotspots: scene.hotspots.map(normalizeLegacyHotspotInteractionEvents)
      };
    })
  };
}

function normalizeLegacyHotspotInteractionEvents(input: unknown): unknown {
  if (!isRecord(input) || !isRecord(input.otherwise)) {
    return input;
  }

  const legacyEvent = normalizeHotspotEventInput(input.otherwise);
  const normalized: Record<string, unknown> = { ...input };
  delete normalized.otherwise;
  if (!hasRawHotspotEvent(input.otherwise)) {
    return normalized;
  }

  if (isRawPlacementHotspot(input)) {
    normalized.clickEvent ??= legacyEvent;
    normalized.otherItemEvent ??= legacyEvent;
    return normalized;
  }

  if (!hasRawHotspotPrimaryEvent(input)) {
    if (legacyEvent.targetSceneId) {
      normalized.targetSceneId = legacyEvent.targetSceneId;
    }
    if (legacyEvent.dialogueTreeId) {
      normalized.dialogueTreeId = legacyEvent.dialogueTreeId;
    }
    if (legacyEvent.response) {
      normalized.response = legacyEvent.response;
    }
    normalized.effects = legacyEvent.effects;
  }
  normalized.otherItemEvent ??= legacyEvent;
  return normalized;
}

function normalizeHotspotEventInput(input: Record<string, unknown>) {
  const event: Record<string, unknown> = {
    effects: Array.isArray(input.effects) ? input.effects : []
  };
  if (typeof input.targetSceneId === "string" && input.targetSceneId.length > 0) {
    event.targetSceneId = input.targetSceneId;
  }
  if (typeof input.dialogueTreeId === "string" && input.dialogueTreeId.length > 0) {
    event.dialogueTreeId = input.dialogueTreeId;
  }
  if (isRecord(input.response)) {
    event.response = input.response;
  }
  return event;
}

function hasRawHotspotEvent(event: Record<string, unknown>): boolean {
  return Boolean(
    (typeof event.targetSceneId === "string" && event.targetSceneId.length > 0) ||
      (typeof event.dialogueTreeId === "string" && event.dialogueTreeId.length > 0) ||
      isRecord(event.response) ||
      (Array.isArray(event.effects) && event.effects.length > 0)
  );
}

function isRawPlacementHotspot(hotspot: Record<string, unknown>): boolean {
  if (typeof hotspot.placedInventoryItemId === "string") {
    return true;
  }

  const itemId = typeof hotspot.inventoryItemId === "string" ? hotspot.inventoryItemId : undefined;
  return Boolean(
    itemId &&
      Array.isArray(hotspot.requiredItemIds) &&
      hotspot.requiredItemIds.includes(itemId) &&
      Array.isArray(hotspot.effects) &&
      hotspot.effects.some((effect) => isRecord(effect) && effect.type === "removeItem" && effect.itemId === itemId)
  );
}

function hasRawHotspotPrimaryEvent(hotspot: Record<string, unknown>): boolean {
  return Boolean(
    (typeof hotspot.targetSceneId === "string" && hotspot.targetSceneId.length > 0) ||
      (typeof hotspot.dialogueTreeId === "string" && hotspot.dialogueTreeId.length > 0) ||
      isRecord(hotspot.response) ||
      (Array.isArray(hotspot.effects) && hotspot.effects.length > 0)
  );
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
    kind: rawAsset.kind === "video" || rawAsset.kind === "image" || rawAsset.kind === "audio" ? rawAsset.kind : "image",
    name: typeof rawAsset.name === "string" && rawAsset.name.length > 0 ? rawAsset.name : "Unnamed Asset",
    category: normalizeAssetCategory(rawAsset),
    variants: normalizedVariants
  };
}

function normalizeAssetCategory(input: Record<string, unknown>): AssetCategory | undefined {
  if (
    input.category === "background" ||
    input.category === "inventory" ||
    input.category === "sceneAudio" ||
    input.category === "foreground" ||
    input.category === "response"
  ) {
    return input.category;
  }

  if (input.kind === "image" || input.kind === "video") {
    return "background";
  }

  if (input.kind === "audio") {
    return "sceneAudio";
  }

  return undefined;
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
  const translationStateByLocale = normalizeTranslationStateLocales(rawStrings.translationStateByLocale);

  if (isRecord(rawStrings.byLocale)) {
    return {
      ...rawStrings,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      byLocale: Object.fromEntries(
        Object.entries(rawStrings.byLocale).map(([locale, values]) => [
          locale,
          normalizeStringRecord(values)
        ])
      ),
      translationStateByLocale
    };
  }

  return {
    ...rawStrings,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    byLocale: {
      [defaultLanguage]: normalizeStringRecord(rawStrings.values)
    },
    translationStateByLocale
  };
}

function normalizeDialogues(
  input: unknown,
  strings: { schemaVersion: number; byLocale: Record<string, Record<string, string>> }
) {
  const rawFile = isRecord(input) ? input : {};
  const rawGroups = Array.isArray(rawFile.responseGroups) ? rawFile.responseGroups : [];
  const currentStarterVersion =
    typeof rawFile.starterResponsesVersion === "number" && Number.isInteger(rawFile.starterResponsesVersion)
      ? Math.max(0, rawFile.starterResponsesVersion)
      : 0;

  if (currentStarterVersion >= STARTER_RESPONSE_LIBRARY_VERSION) {
    return {
      ...rawFile,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      responseGroups: rawGroups,
      starterResponsesVersion: currentStarterVersion
    };
  }

  const existingGroupIds = new Set(
    rawGroups
      .filter(isRecord)
      .map((group) => group.id)
      .filter((id): id is string => typeof id === "string")
  );
  const starterGroups = createStarterResponseGroupsIntroducedAfter(currentStarterVersion).filter(
    (group) => !existingGroupIds.has(group.id)
  );
  seedStarterResponseStrings(strings.byLocale);

  return {
    ...rawFile,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    responseGroups: [...rawGroups, ...starterGroups],
    starterResponsesVersion: STARTER_RESPONSE_LIBRARY_VERSION
  };
}

function normalizeTranslationStateLocales(input: unknown): Record<string, Record<string, StringTranslationState>> {
  if (!isRecord(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).map(([locale, values]) => [locale, normalizeTranslationStateRecord(values)])
  );
}

function normalizeTranslationStateRecord(input: unknown): Record<string, StringTranslationState> {
  if (!isRecord(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, StringTranslationState] =>
      entry[1] === "inherited" ||
      entry[1] === "draft" ||
      entry[1] === "translated" ||
      entry[1] === "reviewed"
    )
  );
}

function backfillStringTranslationStates(
  strings: {
    byLocale: Record<string, Record<string, string>>;
    translationStateByLocale: Record<string, Record<string, StringTranslationState>>;
  },
  defaultLanguage: string
): void {
  const sourceValues = strings.byLocale[defaultLanguage] ?? {};

  for (const [locale, values] of Object.entries(strings.byLocale)) {
    if (locale === defaultLanguage) {
      strings.translationStateByLocale[locale] = {};
      continue;
    }

    const existingStates = strings.translationStateByLocale[locale] ?? {};
    const nextStates: Record<string, StringTranslationState> = {};

    for (const [textId, value] of Object.entries(values)) {
      nextStates[textId] =
        existingStates[textId] ??
        (value === sourceValues[textId] ? "inherited" : value.trim().length > 0 ? "translated" : "draft");
    }

    strings.translationStateByLocale[locale] = nextStates;
  }
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

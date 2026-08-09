import { CURRENT_SCHEMA_VERSION } from "./types";

/**
 * MAGE2 deliberately supports only formats that have an explicit migration
 * path. Keeping this boundary narrow is safer than guessing at pre-release
 * formats whose semantics are unknown.
 */
export const MIN_SUPPORTED_SCHEMA_VERSION = 4;

const PROJECT_FILE_KEYS = [
  "manifest",
  "assets",
  "locations",
  "scenes",
  "dialogues",
  "inventory",
  "strings"
] as const;

type ProjectFileKey = (typeof PROJECT_FILE_KEYS)[number];
type UnknownRecord = Record<string, unknown>;

export class ProjectSchemaVersionError extends Error {
  readonly code: "PROJECT_SCHEMA_INVALID" | "PROJECT_SCHEMA_UNSUPPORTED" | "PROJECT_SCHEMA_FUTURE" | "PROJECT_SCHEMA_MIXED";

  constructor(
    code: ProjectSchemaVersionError["code"],
    message: string
  ) {
    super(message);
    this.name = "ProjectSchemaVersionError";
    this.code = code;
  }
}

export interface ProjectSchemaMigration {
  fromVersion: number;
  toVersion: number;
  migrate(bundle: UnknownRecord): UnknownRecord;
}

export const PROJECT_SCHEMA_MIGRATIONS: readonly ProjectSchemaMigration[] = [
  { fromVersion: 4, toVersion: 5, migrate: migrateV4ToV5 },
  { fromVersion: 5, toVersion: 6, migrate: migrateV5ToV6 },
  { fromVersion: 6, toVersion: 7, migrate: migrateV6ToV7 },
  { fromVersion: 7, toVersion: 8, migrate: migrateV7ToV8 },
  { fromVersion: 8, toVersion: 9, migrate: migrateV8ToV9 },
  { fromVersion: 9, toVersion: 10, migrate: migrateV9ToV10 },
  { fromVersion: 10, toVersion: 11, migrate: migrateV10ToV11 },
  { fromVersion: 11, toVersion: 12, migrate: migrateV11ToV12 },
  { fromVersion: 12, toVersion: 13, migrate: migrateV12ToV13 },
  { fromVersion: 13, toVersion: 14, migrate: migrateV13ToV14 },
  { fromVersion: 14, toVersion: 15, migrate: migrateV14ToV15 }
];

/** Returns the ordered transformations required to reach the current format. */
export function getProjectMigrationPath(sourceVersion: number): readonly ProjectSchemaMigration[] {
  if (!Number.isInteger(sourceVersion) || sourceVersion <= 0) {
    throw new ProjectSchemaVersionError(
      "PROJECT_SCHEMA_INVALID",
      "Project schemaVersion must be a positive integer."
    );
  }

  if (sourceVersion > CURRENT_SCHEMA_VERSION) {
    throw new ProjectSchemaVersionError(
      "PROJECT_SCHEMA_FUTURE",
      `Project schema version ${sourceVersion} is newer than this MAGE2 build supports (${CURRENT_SCHEMA_VERSION}). The project was not changed.`
    );
  }

  if (sourceVersion < MIN_SUPPORTED_SCHEMA_VERSION) {
    throw new ProjectSchemaVersionError(
      "PROJECT_SCHEMA_UNSUPPORTED",
      `Project schema version ${sourceVersion} is too old for this MAGE2 build. Supported project versions are ${MIN_SUPPORTED_SCHEMA_VERSION} through ${CURRENT_SCHEMA_VERSION}.`
    );
  }

  const migrations: ProjectSchemaMigration[] = [];
  let version = sourceVersion;
  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = PROJECT_SCHEMA_MIGRATIONS.find((candidate) => candidate.fromVersion === version);
    if (!migration || migration.toVersion <= version) {
      throw new ProjectSchemaVersionError(
        "PROJECT_SCHEMA_UNSUPPORTED",
        `MAGE2 has no safe migration from project schema version ${version}.`
      );
    }

    migrations.push(migration);
    version = migration.toVersion;
  }

  return migrations;
}

/**
 * Gates every file before any normalisation happens. In particular, future
 * data is rejected before Zod can strip fields it does not know about.
 */
export function migrateProjectBundle(input: unknown): UnknownRecord {
  const bundle = requireRecord(input, "Project bundle must be an object.");
  const sourceVersion = readProjectSchemaVersion(bundle);

  return getProjectMigrationPath(sourceVersion).reduce(
    (current, migration) => migration.migrate(current),
    bundle
  );
}

export function readProjectSchemaVersion(input: unknown): number {
  const bundle = requireRecord(input, "Project bundle must be an object.");
  const versions = PROJECT_FILE_KEYS.map((fileKey) => {
    const file = requireRecord(bundle[fileKey], `Project file '${fileKey}' must be an object.`);
    const version = file.schemaVersion;
    if (typeof version !== "number" || !Number.isInteger(version) || version <= 0) {
      throw new ProjectSchemaVersionError(
        "PROJECT_SCHEMA_INVALID",
        `Project file '${fileKey}' must declare a positive integer schemaVersion.`
      );
    }
    return { fileKey, version };
  });

  const sourceVersion = versions[0]!.version;
  const mismatched = versions.filter((entry) => entry.version !== sourceVersion);
  if (mismatched.length > 0) {
    const details = versions.map((entry) => `${entry.fileKey}=${entry.version}`).join(", ");
    throw new ProjectSchemaVersionError(
      "PROJECT_SCHEMA_MIXED",
      `Project files use mixed schema versions (${details}). MAGE2 will not guess how to combine them.`
    );
  }

  return sourceVersion;
}

function migrateV4ToV5(bundle: UnknownRecord): UnknownRecord {
  const manifest = requireRecord(bundle.manifest, "Project manifest must be an object.");
  const strings = requireRecord(bundle.strings, "Project strings must be an object.");
  const defaultLanguage = typeof manifest.defaultLanguage === "string" && manifest.defaultLanguage.trim() ? manifest.defaultLanguage : "en";
  const migratedStrings =
    !isRecord(strings.byLocale) && isRecord(strings.values)
      ? { ...strings, byLocale: { [defaultLanguage]: strings.values } }
      : strings;

  return withSchemaVersion(bundle, 5, { strings: migratedStrings });
}

function migrateV5ToV6(bundle: UnknownRecord): UnknownRecord {
  const scenes = requireRecord(bundle.scenes, "Project scenes must be an object.");
  const items = Array.isArray(scenes.items) ? scenes.items : [];
  const migratedScenes = {
    ...scenes,
    items: items.map((scene) => {
      if (!isRecord(scene) || !Array.isArray(scene.hotspots)) {
        return scene;
      }

      return {
        ...scene,
        hotspots: scene.hotspots.map((hotspot) =>
          isRecord(hotspot) && hotspot.timingMode === undefined
            ? { ...hotspot, timingMode: "fixed" }
            : hotspot
        )
      };
    })
  };

  return withSchemaVersion(bundle, 6, { scenes: migratedScenes });
}

function migrateV6ToV7(bundle: UnknownRecord): UnknownRecord {
  const manifest = requireRecord(bundle.manifest, "Project manifest must be an object.");
  const assets = requireRecord(bundle.assets, "Project assets must be an object.");
  const defaultLanguage = typeof manifest.defaultLanguage === "string" && manifest.defaultLanguage.trim() ? manifest.defaultLanguage : "en";
  const items = Array.isArray(assets.assets) ? assets.assets : [];
  const migratedAssets = {
    ...assets,
    assets: items.map((asset) => {
      if (!isRecord(asset) || isRecord(asset.variants) || typeof asset.sourcePath !== "string" || !asset.sourcePath) {
        return asset;
      }

      return {
        ...asset,
        variants: {
          [defaultLanguage]: {
            sourcePath: asset.sourcePath,
            ...(typeof asset.importSourcePath === "string" ? { importSourcePath: asset.importSourcePath } : {}),
            ...(typeof asset.importedAt === "string" ? { importedAt: asset.importedAt } : {})
          }
        }
      };
    })
  };

  return withSchemaVersion(bundle, 7, { assets: migratedAssets });
}

function migrateV7ToV8(bundle: UnknownRecord): UnknownRecord {
  const assets = requireRecord(bundle.assets, "Project assets must be an object.");
  const scenes = requireRecord(bundle.scenes, "Project scenes must be an object.");
  const migratedAssets = {
    ...assets,
    assets: (Array.isArray(assets.assets) ? assets.assets : []).map((asset) => {
      if (!isRecord(asset) || asset.category !== undefined) {
        return asset;
      }

      if (asset.kind === "image" || asset.kind === "video") {
        return { ...asset, category: "background" };
      }
      if (asset.kind === "audio") {
        return { ...asset, category: "sceneAudio" };
      }
      return asset;
    })
  };
  const migratedScenes = {
    ...scenes,
    items: (Array.isArray(scenes.items) ? scenes.items : []).map((scene) =>
      isRecord(scene)
        ? {
            ...scene,
            ...(typeof scene.sceneAudioLoop === "boolean" ? {} : { sceneAudioLoop: true }),
            ...(typeof scene.sceneAudioDelayMs === "number" ? {} : { sceneAudioDelayMs: 0 }),
            ...(typeof scene.backgroundVideoLoop === "boolean" ? {} : { backgroundVideoLoop: false })
          }
        : scene
    )
  };

  return withSchemaVersion(bundle, 8, { assets: migratedAssets, scenes: migratedScenes });
}

// Versions 9 through 11 add optional foreground-media and response fields.
// Their concrete defaults are applied by the normalizers after the migration
// gate, so these explicit steps only advance every project file together.
function migrateV8ToV9(bundle: UnknownRecord): UnknownRecord {
  return withSchemaVersion(bundle, 9);
}

function migrateV9ToV10(bundle: UnknownRecord): UnknownRecord {
  return withSchemaVersion(bundle, 10);
}

function migrateV10ToV11(bundle: UnknownRecord): UnknownRecord {
  return withSchemaVersion(bundle, 11);
}

function migrateV11ToV12(bundle: UnknownRecord): UnknownRecord {
  const manifest = requireRecord(bundle.manifest, "Project manifest must be an object.");
  return withSchemaVersion(bundle, 12, {
    manifest: {
      ...manifest,
      gameVersion:
        typeof manifest.gameVersion === "string" && manifest.gameVersion.trim()
          ? manifest.gameVersion
          : "1.0.0",
      saveCompatibilityVersion:
        typeof manifest.saveCompatibilityVersion === "number" &&
        Number.isInteger(manifest.saveCompatibilityVersion) &&
        manifest.saveCompatibilityVersion > 0
          ? manifest.saveCompatibilityVersion
          : 1,
      // Existing projects launched straight into gameplay before schema 12.
      // Keep that behavior until their creator explicitly enables a title.
      playerPresentation: isRecord(manifest.playerPresentation)
        ? manifest.playerPresentation
        : { titleScreenEnabled: false }
    }
  });
}

function migrateV12ToV13(bundle: UnknownRecord): UnknownRecord {
  const scenes = requireRecord(bundle.scenes, "Project scenes must be an object.");
  const migratedScenes = {
    ...scenes,
    items: (Array.isArray(scenes.items) ? scenes.items : []).map((scene) =>
      isRecord(scene)
        ? {
            ...scene,
            // Video backgrounds were always muted before schema 13. Preserve
            // that silent behavior until the creator explicitly chooses a mode.
            videoAudioMode:
              scene.videoAudioMode === "embedded" ||
              scene.videoAudioMode === "external" ||
              scene.videoAudioMode === "silent"
                ? scene.videoAudioMode
                : "silent",
            onMediaEndEffects: Array.isArray(scene.onMediaEndEffects) ? scene.onMediaEndEffects : []
          }
        : scene
    )
  };

  return withSchemaVersion(bundle, 13, { scenes: migratedScenes });
}

function migrateV13ToV14(bundle: UnknownRecord): UnknownRecord {
  const manifest = requireRecord(bundle.manifest, "Project manifest must be an object.");
  const scenes = requireRecord(bundle.scenes, "Project scenes must be an object.");
  const dialogues = requireRecord(bundle.dialogues, "Project dialogues must be an object.");
  const referencedFlagIds = new Set<string>();

  const migrateConditions = (value: unknown): unknown[] =>
    (Array.isArray(value) ? value : []).map((condition) => migrateLegacyCondition(condition, referencedFlagIds));
  const migrateEffects = (value: unknown): unknown[] =>
    (Array.isArray(value) ? value : []).map((effect) => migrateLegacyEffect(effect, referencedFlagIds));
  const migrateHotspotEvent = (value: unknown): unknown => {
    if (!isRecord(value)) {
      return value;
    }
    return { ...value, effects: migrateEffects(value.effects) };
  };

  const migratedScenes = {
    ...scenes,
    items: (Array.isArray(scenes.items) ? scenes.items : []).map((scene) => {
      if (!isRecord(scene)) {
        return scene;
      }
      return {
        ...scene,
        onEnterEffects: migrateEffects(scene.onEnterEffects),
        onExitEffects: migrateEffects(scene.onExitEffects),
        onMediaEndEffects: migrateEffects(scene.onMediaEndEffects),
        hotspots: (Array.isArray(scene.hotspots) ? scene.hotspots : []).map((hotspot) => {
          if (!isRecord(hotspot)) {
            return hotspot;
          }
          return {
            ...hotspot,
            conditionMode: hotspot.conditionMode === "any" ? "any" : "all",
            conditions: migrateConditions(hotspot.conditions),
            effects: migrateEffects(hotspot.effects),
            ...(hotspot.clickEvent === undefined ? {} : { clickEvent: migrateHotspotEvent(hotspot.clickEvent) }),
            ...(hotspot.otherItemEvent === undefined ? {} : { otherItemEvent: migrateHotspotEvent(hotspot.otherItemEvent) })
          };
        })
      };
    })
  };

  const migratedDialogues = {
    ...dialogues,
    items: (Array.isArray(dialogues.items) ? dialogues.items : []).map((dialogue) => {
      if (!isRecord(dialogue)) {
        return dialogue;
      }
      return {
        ...dialogue,
        nodes: (Array.isArray(dialogue.nodes) ? dialogue.nodes : []).map((node) => {
          if (!isRecord(node)) {
            return node;
          }
          return {
            ...node,
            effects: migrateEffects(node.effects),
            choices: (Array.isArray(node.choices) ? node.choices : []).map((choice) => {
              if (!isRecord(choice)) {
                return choice;
              }
              return {
                ...choice,
                conditionMode: choice.conditionMode === "any" ? "any" : "all",
                conditions: migrateConditions(choice.conditions),
                effects: migrateEffects(choice.effects)
              };
            })
          };
        })
      };
    })
  };

  const existingVariables = Array.isArray(manifest.variables) ? manifest.variables : [];
  const existingVariableIds = new Set(
    existingVariables
      .filter(isRecord)
      .map((variable) => variable.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );
  const inferredVariables = [...referencedFlagIds]
    .filter((id) => !existingVariableIds.has(id))
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((id) => ({
      id,
      name: humanizeVariableId(id),
      description: "",
      type: "boolean",
      initialValue: false,
      system: id.startsWith("hotspot.")
    }));

  return withSchemaVersion(bundle, 14, {
    manifest: {
      ...manifest,
      variables: [...existingVariables, ...inferredVariables]
    },
    scenes: migratedScenes,
    dialogues: migratedDialogues
  });
}

// Schema 15 adds conditional actions. Existing flat action lists already have
// the intended behavior, so advancing every project file is sufficient.
function migrateV14ToV15(bundle: UnknownRecord): UnknownRecord {
  return withSchemaVersion(bundle, 15);
}

function migrateLegacyCondition(value: unknown, flagIds: Set<string>): unknown {
  if (!isRecord(value)) {
    return value;
  }
  if (value.type === "flagEquals" && typeof value.flag === "string" && value.flag) {
    flagIds.add(value.flag);
    return {
      type: "variableCompare",
      variableId: value.flag,
      operator: "equals",
      value: typeof value.value === "boolean" ? value.value : false
    };
  }
  if (value.type === "inventoryHas") {
    return { ...value, present: typeof value.present === "boolean" ? value.present : true };
  }
  if (value.type === "sceneVisited") {
    return { ...value, visited: typeof value.visited === "boolean" ? value.visited : true };
  }
  return value;
}

function migrateLegacyEffect(value: unknown, flagIds: Set<string>): unknown {
  if (!isRecord(value)) {
    return value;
  }
  if (value.type === "setFlag" && typeof value.flag === "string" && value.flag) {
    flagIds.add(value.flag);
    return {
      type: "setVariable",
      variableId: value.flag,
      value: typeof value.value === "boolean" ? value.value : false
    };
  }
  return value;
}

function humanizeVariableId(id: string): string {
  const words = id
    .replace(/^hotspot\./, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[._-]+/)
    .filter(Boolean);
  const label = words.join(" ").trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : id;
}

function withSchemaVersion(
  bundle: UnknownRecord,
  schemaVersion: number,
  updates: Partial<Record<ProjectFileKey, UnknownRecord>> = {}
): UnknownRecord {
  const nextBundle: UnknownRecord = { ...bundle };
  for (const fileKey of PROJECT_FILE_KEYS) {
    const current = updates[fileKey] ?? requireRecord(bundle[fileKey], `Project file '${fileKey}' must be an object.`);
    nextBundle[fileKey] = { ...current, schemaVersion };
  }
  return nextBundle;
}

function requireRecord(value: unknown, message: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new ProjectSchemaVersionError("PROJECT_SCHEMA_INVALID", message);
  }
  return value;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

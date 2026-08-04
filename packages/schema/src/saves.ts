import {
  CURRENT_SAVE_ENVELOPE_VERSION,
  SAVE_ENVELOPE_FORMAT,
  SaveEnvelopeSchema,
  SaveStateSchema,
  type ProjectBundle,
  type ProjectContentIdentity,
  type SaveEnvelope,
  type SaveState
} from "./types";
import { createInitialSaveState } from "./project";

export type SaveLoadStatus = "missing" | "compatible" | "migrated" | "stale" | "corrupt" | "unsupported";

export interface SaveLoadResult {
  status: SaveLoadStatus;
  saveState: SaveState;
  envelope?: SaveEnvelope;
  message?: string;
  shouldQuarantine: boolean;
}

export interface SaveEnvelopeMigration {
  fromVersion: number;
  toVersion: number;
}

/**
 * Version zero denotes the unwrapped SaveState written by earlier MAGE2
 * builds. It is the only legacy save format intentionally supported.
 */
export const SAVE_ENVELOPE_MIGRATIONS: readonly SaveEnvelopeMigration[] = [
  { fromVersion: 0, toVersion: 1 },
  { fromVersion: 1, toVersion: 2 }
];

export function getSaveMigrationPath(sourceVersion: number): readonly SaveEnvelopeMigration[] {
  if (!Number.isInteger(sourceVersion) || sourceVersion < 0) {
    return [];
  }

  const migrations: SaveEnvelopeMigration[] = [];
  let version = sourceVersion;
  while (version < CURRENT_SAVE_ENVELOPE_VERSION) {
    const migration = SAVE_ENVELOPE_MIGRATIONS.find((candidate) => candidate.fromVersion === version);
    if (!migration || migration.toVersion <= version) {
      return [];
    }
    migrations.push(migration);
    version = migration.toVersion;
  }
  return migrations;
}

/**
 * Save compatibility is creator-controlled. Copy, localization, presentation,
 * and other compatible project changes do not invalidate progress; creators
 * increment saveCompatibilityVersion when a release intentionally breaks it.
 */
export function createProjectContentIdentity(project: ProjectBundle): ProjectContentIdentity {
  const saveCompatibilityVersion = project.manifest.saveCompatibilityVersion;

  return {
    projectId: project.manifest.projectId,
    contentId: `save-compat-${saveCompatibilityVersion}`,
    saveCompatibilityVersion
  };
}

export function createSaveEnvelope(
  project: ProjectBundle,
  state: SaveState,
  savedAt = new Date().toISOString()
): SaveEnvelope {
  return SaveEnvelopeSchema.parse({
    format: SAVE_ENVELOPE_FORMAT,
    version: CURRENT_SAVE_ENVELOPE_VERSION,
    identity: createProjectContentIdentity(project),
    savedAt,
    state: SaveStateSchema.parse(state)
  });
}

/**
 * Applies the runtime compatibility policy:
 * - current envelopes need an exact project/content identity match;
 * - legacy raw SaveState values are migrated only after every reference is
 *   proven to exist in the current project;
 * - malformed, stale, and future saves return a safe fresh state.
 */
export function loadSaveForProject(raw: string | unknown | null | undefined, project: ProjectBundle): SaveLoadResult {
  if (raw === null || raw === undefined || raw === "") {
    return {
      status: "missing",
      saveState: createInitialSaveState(project),
      shouldQuarantine: false
    };
  }

  let value: unknown;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return recoverFromSave("corrupt", project, "Saved progress is not valid JSON and was not loaded.");
  }

  if (!isRecord(value)) {
    return recoverFromSave("corrupt", project, "Saved progress is not an object and was not loaded.");
  }

  if (value.format === SAVE_ENVELOPE_FORMAT) {
    return loadVersionedSave(value, project);
  }

  if (isLegacySaveStateCandidate(value)) {
    return migrateLegacySave(value, project);
  }

  return recoverFromSave("corrupt", project, "Saved progress has an unknown format and was not loaded.");
}

export function validateSaveStateForProject(state: SaveState, project: ProjectBundle): string | undefined {
  const scene = project.scenes.items.find((entry) => entry.id === state.currentSceneId);
  if (!scene) {
    return `Saved scene '${state.currentSceneId}' no longer exists.`;
  }

  const location = project.locations.items.find((entry) => entry.id === state.currentLocationId);
  if (!location) {
    return `Saved location '${state.currentLocationId}' no longer exists.`;
  }

  if (scene.locationId !== location.id || !location.sceneIds.includes(scene.id)) {
    return `Saved scene '${scene.id}' no longer belongs to saved location '${location.id}'.`;
  }

  const inventoryIds = new Set(project.inventory.items.map((item) => item.id));
  const missingInventoryItem = state.inventory.find((itemId) => !inventoryIds.has(itemId));
  if (missingInventoryItem) {
    return `Saved inventory item '${missingInventoryItem}' no longer exists.`;
  }

  const sceneIds = new Set(project.scenes.items.map((entry) => entry.id));
  if (!state.visitedSceneIds.includes(state.currentSceneId)) {
    return `Saved current scene '${state.currentSceneId}' is missing from visited scenes.`;
  }
  const missingVisitedScene = state.visitedSceneIds.find((sceneId) => !sceneIds.has(sceneId));
  if (missingVisitedScene) {
    return `Saved visited scene '${missingVisitedScene}' no longer exists.`;
  }

  if (Boolean(state.activeDialogueTreeId) !== Boolean(state.activeDialogueNodeId)) {
    return "Saved dialogue state is incomplete.";
  }

  if (state.activeDialogueTreeId && state.activeDialogueNodeId) {
    const tree = project.dialogues.items.find((entry) => entry.id === state.activeDialogueTreeId);
    if (!tree) {
      return `Saved dialogue '${state.activeDialogueTreeId}' no longer exists.`;
    }
    if (!tree.nodes.some((node) => node.id === state.activeDialogueNodeId)) {
      return `Saved dialogue node '${state.activeDialogueNodeId}' no longer exists.`;
    }
  }

  return undefined;
}

function loadVersionedSave(value: Record<string, unknown>, project: ProjectBundle): SaveLoadResult {
  const version = value.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    return recoverFromSave("corrupt", project, "Saved progress has an invalid format version and was not loaded.");
  }

  if (version > CURRENT_SAVE_ENVELOPE_VERSION) {
    return recoverFromSave(
      "unsupported",
      project,
      `Saved progress uses a newer format (${version}) than this MAGE2 build supports (${CURRENT_SAVE_ENVELOPE_VERSION}). It was kept untouched and a fresh session started.`
    );
  }

  if (version === 0) {
    return migrateLegacySave(value.state, project);
  }

  if (version === 1) {
    return migrateV1Save(value, project);
  }

  if (version !== CURRENT_SAVE_ENVELOPE_VERSION) {
    return recoverFromSave("unsupported", project, `Saved progress format ${version} has no supported migration path.`);
  }

  const parsed = SaveEnvelopeSchema.safeParse(value);
  if (!parsed.success) {
    return recoverFromSave("corrupt", project, "Saved progress is malformed and was not loaded.");
  }

  const identity = createProjectContentIdentity(project);
  if (parsed.data.identity.projectId !== identity.projectId) {
    return recoverFromSave("stale", project, "Saved progress belongs to a different project and was not loaded.");
  }
  if (parsed.data.identity.saveCompatibilityVersion !== identity.saveCompatibilityVersion) {
    return recoverFromSave(
      "stale",
      project,
      `Saved progress targets compatibility version ${parsed.data.identity.saveCompatibilityVersion}; this game uses ${identity.saveCompatibilityVersion}.`
    );
  }
  if (parsed.data.identity.contentId !== identity.contentId) {
    return recoverFromSave("stale", project, "Saved progress was created for different project content and was not loaded.");
  }

  const compatibilityError = validateSaveStateForProject(parsed.data.state, project);
  if (compatibilityError) {
    return recoverFromSave("corrupt", project, `${compatibilityError} A fresh session started.`);
  }

  return {
    status: "compatible",
    saveState: parsed.data.state,
    envelope: parsed.data,
    shouldQuarantine: false
  };
}

function migrateV1Save(value: Record<string, unknown>, project: ProjectBundle): SaveLoadResult {
  const identity = isRecord(value.identity) ? value.identity : undefined;
  if (!identity || identity.projectId !== project.manifest.projectId) {
    return recoverFromSave("stale", project, "Saved progress belongs to a different project and was not loaded.");
  }

  const parsedState = SaveStateSchema.safeParse(value.state);
  if (!parsedState.success) {
    return recoverFromSave("corrupt", project, "Saved progress is malformed and was not loaded.");
  }

  const compatibilityError = validateSaveStateForProject(parsedState.data, project);
  if (compatibilityError) {
    return recoverFromSave("stale", project, `${compatibilityError} The version-one save was not migrated.`);
  }

  const savedAt = typeof value.savedAt === "string" && value.savedAt.length > 0
    ? value.savedAt
    : new Date().toISOString();
  const envelope = createSaveEnvelope(project, parsedState.data, savedAt);
  return {
    status: "migrated",
    saveState: parsedState.data,
    envelope,
    message: "Saved progress was upgraded to the creator-controlled compatibility format.",
    shouldQuarantine: false
  };
}

function migrateLegacySave(value: unknown, project: ProjectBundle): SaveLoadResult {
  if (!isLegacySaveStateCandidate(value) || getSaveMigrationPath(0).length === 0) {
    return recoverFromSave("corrupt", project, "Legacy saved progress is incomplete and was not loaded.");
  }

  const initial = createInitialSaveState(project);
  const parsed = SaveStateSchema.safeParse({ ...initial, ...value });
  if (!parsed.success) {
    return recoverFromSave("corrupt", project, "Legacy saved progress is malformed and was not loaded.");
  }

  const compatibilityError = validateSaveStateForProject(parsed.data, project);
  if (compatibilityError) {
    return recoverFromSave("stale", project, `${compatibilityError} The legacy save was not migrated.`);
  }

  const envelope = createSaveEnvelope(project, parsed.data);
  return {
    status: "migrated",
    saveState: parsed.data,
    envelope,
    message: "A compatible legacy save was upgraded to the current save format.",
    shouldQuarantine: false
  };
}

function recoverFromSave(status: Extract<SaveLoadStatus, "stale" | "corrupt" | "unsupported">, project: ProjectBundle, message: string): SaveLoadResult {
  return {
    status,
    saveState: createInitialSaveState(project),
    message,
    shouldQuarantine: true
  };
}

function isLegacySaveStateCandidate(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.currentLocationId === "string" &&
    value.currentLocationId.length > 0 &&
    typeof value.currentSceneId === "string" &&
    value.currentSceneId.length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

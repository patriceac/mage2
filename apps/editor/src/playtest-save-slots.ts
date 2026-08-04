import {
  loadSaveForProject,
  parseSaveState,
  SAVE_ENVELOPE_FORMAT,
  type ProjectBundle,
  type SaveState
} from "@mage2/schema";
import type { EditorTranslator } from "./i18n";

const identityTranslator: EditorTranslator = (source, params) =>
  source.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params ?? {}, name) ? String(params?.[name]) : placeholder
  );

export const PLAYTEST_SAVE_SLOT_IDS = [1, 2, 3] as const;
export type PlaytestSaveSlotId = (typeof PLAYTEST_SAVE_SLOT_IDS)[number];

export const PLAYTEST_SAVE_FORMAT = "mage2-editor-playtest-save";
export const PLAYTEST_SAVE_FORMAT_VERSION = 1;

export type PlaytestSaveSlotStatus = "empty" | "ready" | "incompatible" | "corrupt" | "unavailable";

export interface PlaytestSaveEnvelope {
  format: typeof PLAYTEST_SAVE_FORMAT;
  formatVersion: typeof PLAYTEST_SAVE_FORMAT_VERSION;
  projectId: string;
  projectSchemaVersion: number;
  projectEngineVersion: string;
  saveCompatibilityVersion: number;
  savedAt: string;
  state: SaveState;
}

export interface PlaytestSaveSlotInspection {
  slotId: PlaytestSaveSlotId;
  status: PlaytestSaveSlotStatus;
  message: string;
  savedAt?: string;
  envelope?: PlaytestSaveEnvelope;
}

export interface PlaytestSaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function getPlaytestSaveSlotStorageKey(slotId: PlaytestSaveSlotId): string {
  return slotId === 1 ? "mage2-editor-playtest-save" : `mage2-editor-playtest-save-${slotId}`;
}

export function createPlaytestSaveEnvelope(
  project: ProjectBundle,
  state: SaveState,
  savedAt = new Date()
): PlaytestSaveEnvelope {
  return {
    format: PLAYTEST_SAVE_FORMAT,
    formatVersion: PLAYTEST_SAVE_FORMAT_VERSION,
    projectId: project.manifest.projectId,
    projectSchemaVersion: project.manifest.schemaVersion,
    projectEngineVersion: project.manifest.engineVersion,
    saveCompatibilityVersion: project.manifest.saveCompatibilityVersion,
    savedAt: savedAt.toISOString(),
    state: parseSaveState(state)
  };
}

export function createEmptyPlaytestSaveSlotInspection(
  slotId: PlaytestSaveSlotId,
  t: EditorTranslator = identityTranslator
): PlaytestSaveSlotInspection {
  return {
    slotId,
    status: "empty",
    message: t("No save stored in this slot.")
  };
}

export function readPlaytestSaveSlot(
  storage: PlaytestSaveStorage | undefined,
  project: ProjectBundle,
  slotId: PlaytestSaveSlotId,
  t: EditorTranslator = identityTranslator
): PlaytestSaveSlotInspection {
  if (!storage) {
    return {
      slotId,
      status: "unavailable",
      message: t("Local save storage is unavailable.")
    };
  }

  let raw: string | null;
  try {
    raw = storage.getItem(getPlaytestSaveSlotStorageKey(slotId));
  } catch (error) {
    return {
      slotId,
      status: "unavailable",
      message: t("Local save storage could not be read: {message}", { message: resolveErrorMessage(error) })
    };
  }

  return inspectPlaytestSaveSlot(raw, project, slotId, t);
}

export function inspectPlaytestSaveSlot(
  raw: string | null,
  project: ProjectBundle,
  slotId: PlaytestSaveSlotId,
  t: EditorTranslator = identityTranslator
): PlaytestSaveSlotInspection {
  if (!raw) {
    return createEmptyPlaytestSaveSlotInspection(slotId, t);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      slotId,
      status: "corrupt",
      message: t("Stored data is not valid JSON: {message}", { message: resolveErrorMessage(error) })
    };
  }

  if (isRecord(parsed) && parsed.format === SAVE_ENVELOPE_FORMAT) {
    return inspectVersionedEditorSave(raw, project, slotId, t);
  }

  if (!isRecord(parsed) || parsed.format !== PLAYTEST_SAVE_FORMAT) {
    try {
      parseSaveState(parsed);
      return {
        slotId,
        status: "incompatible",
        message: t("Legacy save data has no project identity. Overwrite or clear this slot before loading.")
      };
    } catch {
      return {
        slotId,
        status: "corrupt",
        message: t("Stored data is not a recognized MAGE2 playtest save.")
      };
    }
  }

  const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : undefined;
  if (!savedAt || !Number.isFinite(Date.parse(savedAt))) {
    return {
      slotId,
      status: "corrupt",
      message: t("The save timestamp is missing or invalid.")
    };
  }

  if (parsed.formatVersion !== PLAYTEST_SAVE_FORMAT_VERSION) {
    return {
      slotId,
      status: "incompatible",
      message: t("Save format {version} is not supported by this editor.", { version: String(parsed.formatVersion) }),
      savedAt
    };
  }

  if (
    typeof parsed.projectId !== "string" ||
    typeof parsed.projectSchemaVersion !== "number" ||
    typeof parsed.projectEngineVersion !== "string"
  ) {
    return {
      slotId,
      status: "corrupt",
      message: t("The save is missing project compatibility metadata."),
      savedAt
    };
  }

  if (parsed.projectId !== project.manifest.projectId) {
    return {
      slotId,
      status: "incompatible",
      message: t("Saved for a different project ({projectId}).", { projectId: parsed.projectId }),
      savedAt
    };
  }

  if (
    typeof parsed.saveCompatibilityVersion === "number" &&
    parsed.saveCompatibilityVersion !== project.manifest.saveCompatibilityVersion
  ) {
    return {
      slotId,
      status: "incompatible",
      message: t("Saved for compatibility version {savedVersion}; this project uses {projectVersion}.", {
        savedVersion: parsed.saveCompatibilityVersion,
        projectVersion: project.manifest.saveCompatibilityVersion
      }),
      savedAt
    };
  }

  if (
    typeof parsed.saveCompatibilityVersion !== "number" &&
    (parsed.projectSchemaVersion !== project.manifest.schemaVersion ||
      parsed.projectEngineVersion !== project.manifest.engineVersion)
  ) {
    return {
      slotId,
      status: "incompatible",
      message: t("This legacy slot targets project schema {schemaVersion} and engine {engineVersion}.", {
        schemaVersion: parsed.projectSchemaVersion,
        engineVersion: parsed.projectEngineVersion
      }),
      savedAt
    };
  }

  let state: SaveState;
  try {
    state = parseSaveState(parsed.state);
  } catch (error) {
    return {
      slotId,
      status: "corrupt",
      message: t("The saved runtime state is malformed: {message}", { message: resolveErrorMessage(error) }),
      savedAt
    };
  }

  const compatibilityIssue = resolvePlaytestSaveCompatibilityIssue(project, state, t);
  if (compatibilityIssue) {
    return {
      slotId,
      status: "incompatible",
      message: compatibilityIssue,
      savedAt
    };
  }

  const envelope: PlaytestSaveEnvelope = {
    format: PLAYTEST_SAVE_FORMAT,
    formatVersion: PLAYTEST_SAVE_FORMAT_VERSION,
    projectId: parsed.projectId,
    projectSchemaVersion: parsed.projectSchemaVersion,
    projectEngineVersion: parsed.projectEngineVersion,
    saveCompatibilityVersion:
      typeof parsed.saveCompatibilityVersion === "number"
        ? parsed.saveCompatibilityVersion
        : project.manifest.saveCompatibilityVersion,
    savedAt,
    state
  };

  return {
    slotId,
    status: "ready",
    message: t("Compatible with the open project."),
    savedAt,
    envelope
  };
}

export function resolvePlaytestSaveCompatibilityIssue(
  project: ProjectBundle,
  state: SaveState,
  t: EditorTranslator = identityTranslator
): string | undefined {
  const scene = project.scenes.items.find((entry) => entry.id === state.currentSceneId);
  if (!scene) {
    return t("Saved scene '{sceneId}' no longer exists.", { sceneId: state.currentSceneId });
  }

  const location = project.locations.items.find((entry) => entry.id === state.currentLocationId);
  if (!location) {
    return t("Saved location '{locationId}' no longer exists.", { locationId: state.currentLocationId });
  }

  if (scene.locationId !== location.id) {
    return t("The saved scene and location no longer belong together.");
  }

  const inventoryIds = new Set(project.inventory.items.map((item) => item.id));
  const missingInventoryItemId = state.inventory.find((itemId) => !inventoryIds.has(itemId));
  if (missingInventoryItemId) {
    return t("Saved inventory item '{itemId}' no longer exists.", { itemId: missingInventoryItemId });
  }

  const sceneIds = new Set(project.scenes.items.map((entry) => entry.id));
  const missingVisitedSceneId = state.visitedSceneIds.find((sceneId) => !sceneIds.has(sceneId));
  if (missingVisitedSceneId) {
    return t("Visited scene '{sceneId}' no longer exists.", { sceneId: missingVisitedSceneId });
  }

  if (Boolean(state.activeDialogueTreeId) !== Boolean(state.activeDialogueNodeId)) {
    return t("The active dialogue pointer is incomplete.");
  }

  if (state.activeDialogueTreeId && state.activeDialogueNodeId) {
    const dialogue = project.dialogues.items.find((entry) => entry.id === state.activeDialogueTreeId);
    if (!dialogue) {
      return t("Active dialogue '{dialogueId}' no longer exists.", { dialogueId: state.activeDialogueTreeId });
    }
    if (!dialogue.nodes.some((node) => node.id === state.activeDialogueNodeId)) {
      return t("Active dialogue node '{nodeId}' no longer exists.", { nodeId: state.activeDialogueNodeId });
    }
  }

  return undefined;
}

export function formatPlaytestSaveTimestamp(
  savedAt: string,
  locale = "en",
  t: EditorTranslator = identityTranslator
): string {
  const timestamp = Date.parse(savedAt);
  if (!Number.isFinite(timestamp)) {
    return t("Unknown time");
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

export function resolvePlaytestSaveStatusLabel(
  status: PlaytestSaveSlotStatus,
  t: EditorTranslator = identityTranslator
): string {
  switch (status) {
    case "empty":
      return t("Empty");
    case "ready":
      return t("Ready");
    case "incompatible":
      return t("Incompatible");
    case "corrupt":
      return t("Corrupt");
    case "unavailable":
      return t("Unavailable");
  }
}

function inspectVersionedEditorSave(
  raw: string,
  project: ProjectBundle,
  slotId: PlaytestSaveSlotId,
  t: EditorTranslator
): PlaytestSaveSlotInspection {
  const result = loadSaveForProject(raw, project);
  if ((result.status === "compatible" || result.status === "migrated") && result.envelope) {
    return {
      slotId,
      status: "ready",
      message: result.message ? t(result.message) : t("Compatible with the open project."),
      savedAt: result.envelope.savedAt,
      envelope: {
        format: PLAYTEST_SAVE_FORMAT,
        formatVersion: PLAYTEST_SAVE_FORMAT_VERSION,
        projectId: project.manifest.projectId,
        projectSchemaVersion: project.manifest.schemaVersion,
        projectEngineVersion: project.manifest.engineVersion,
        saveCompatibilityVersion: project.manifest.saveCompatibilityVersion,
        savedAt: result.envelope.savedAt,
        state: result.saveState
      }
    };
  }

  return {
    slotId,
    status: result.status === "corrupt" ? "corrupt" : "incompatible",
    message: t("This versioned editor save cannot be loaded for the open project.")
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

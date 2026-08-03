import { parseSaveState, type ProjectBundle, type SaveState } from "@mage2/schema";

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
    savedAt: savedAt.toISOString(),
    state: parseSaveState(state)
  };
}

export function createEmptyPlaytestSaveSlotInspection(slotId: PlaytestSaveSlotId): PlaytestSaveSlotInspection {
  return {
    slotId,
    status: "empty",
    message: "No save stored in this slot."
  };
}

export function readPlaytestSaveSlot(
  storage: PlaytestSaveStorage | undefined,
  project: ProjectBundle,
  slotId: PlaytestSaveSlotId
): PlaytestSaveSlotInspection {
  if (!storage) {
    return {
      slotId,
      status: "unavailable",
      message: "Local save storage is unavailable."
    };
  }

  let raw: string | null;
  try {
    raw = storage.getItem(getPlaytestSaveSlotStorageKey(slotId));
  } catch (error) {
    return {
      slotId,
      status: "unavailable",
      message: `Local save storage could not be read: ${resolveErrorMessage(error)}`
    };
  }

  return inspectPlaytestSaveSlot(raw, project, slotId);
}

export function inspectPlaytestSaveSlot(
  raw: string | null,
  project: ProjectBundle,
  slotId: PlaytestSaveSlotId
): PlaytestSaveSlotInspection {
  if (!raw) {
    return createEmptyPlaytestSaveSlotInspection(slotId);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      slotId,
      status: "corrupt",
      message: `Stored data is not valid JSON: ${resolveErrorMessage(error)}`
    };
  }

  if (!isRecord(parsed) || parsed.format !== PLAYTEST_SAVE_FORMAT) {
    try {
      parseSaveState(parsed);
      return {
        slotId,
        status: "incompatible",
        message: "Legacy save data has no project identity. Overwrite or clear this slot before loading."
      };
    } catch {
      return {
        slotId,
        status: "corrupt",
        message: "Stored data is not a recognized MAGE2 playtest save."
      };
    }
  }

  const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : undefined;
  if (!savedAt || !Number.isFinite(Date.parse(savedAt))) {
    return {
      slotId,
      status: "corrupt",
      message: "The save timestamp is missing or invalid."
    };
  }

  if (parsed.formatVersion !== PLAYTEST_SAVE_FORMAT_VERSION) {
    return {
      slotId,
      status: "incompatible",
      message: `Save format ${String(parsed.formatVersion)} is not supported by this editor.`,
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
      message: "The save is missing project compatibility metadata.",
      savedAt
    };
  }

  if (parsed.projectId !== project.manifest.projectId) {
    return {
      slotId,
      status: "incompatible",
      message: `Saved for a different project (${parsed.projectId}).`,
      savedAt
    };
  }

  if (parsed.projectSchemaVersion !== project.manifest.schemaVersion) {
    return {
      slotId,
      status: "incompatible",
      message: `Saved with project schema ${parsed.projectSchemaVersion}; this project uses ${project.manifest.schemaVersion}.`,
      savedAt
    };
  }

  if (parsed.projectEngineVersion !== project.manifest.engineVersion) {
    return {
      slotId,
      status: "incompatible",
      message: `Saved with engine ${parsed.projectEngineVersion}; this project uses ${project.manifest.engineVersion}.`,
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
      message: `The saved runtime state is malformed: ${resolveErrorMessage(error)}`,
      savedAt
    };
  }

  const compatibilityIssue = resolvePlaytestSaveCompatibilityIssue(project, state);
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
    savedAt,
    state
  };

  return {
    slotId,
    status: "ready",
    message: "Compatible with the open project.",
    savedAt,
    envelope
  };
}

export function resolvePlaytestSaveCompatibilityIssue(
  project: ProjectBundle,
  state: SaveState
): string | undefined {
  const scene = project.scenes.items.find((entry) => entry.id === state.currentSceneId);
  if (!scene) {
    return `Saved scene '${state.currentSceneId}' no longer exists.`;
  }

  const location = project.locations.items.find((entry) => entry.id === state.currentLocationId);
  if (!location) {
    return `Saved location '${state.currentLocationId}' no longer exists.`;
  }

  if (scene.locationId !== location.id) {
    return "The saved scene and location no longer belong together.";
  }

  const inventoryIds = new Set(project.inventory.items.map((item) => item.id));
  const missingInventoryItemId = state.inventory.find((itemId) => !inventoryIds.has(itemId));
  if (missingInventoryItemId) {
    return `Saved inventory item '${missingInventoryItemId}' no longer exists.`;
  }

  const sceneIds = new Set(project.scenes.items.map((entry) => entry.id));
  const missingVisitedSceneId = state.visitedSceneIds.find((sceneId) => !sceneIds.has(sceneId));
  if (missingVisitedSceneId) {
    return `Visited scene '${missingVisitedSceneId}' no longer exists.`;
  }

  if (Boolean(state.activeDialogueTreeId) !== Boolean(state.activeDialogueNodeId)) {
    return "The active dialogue pointer is incomplete.";
  }

  if (state.activeDialogueTreeId && state.activeDialogueNodeId) {
    const dialogue = project.dialogues.items.find((entry) => entry.id === state.activeDialogueTreeId);
    if (!dialogue) {
      return `Active dialogue '${state.activeDialogueTreeId}' no longer exists.`;
    }
    if (!dialogue.nodes.some((node) => node.id === state.activeDialogueNodeId)) {
      return `Active dialogue node '${state.activeDialogueNodeId}' no longer exists.`;
    }
  }

  return undefined;
}

export function formatPlaytestSaveTimestamp(savedAt: string): string {
  const timestamp = Date.parse(savedAt);
  if (!Number.isFinite(timestamp)) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

export function resolvePlaytestSaveStatusLabel(status: PlaytestSaveSlotStatus): string {
  switch (status) {
    case "empty":
      return "Empty";
    case "ready":
      return "Ready";
    case "incompatible":
      return "Incompatible";
    case "corrupt":
      return "Corrupt";
    case "unavailable":
      return "Unavailable";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

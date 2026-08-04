import type { Asset } from "@mage2/schema";
import { isSceneAudioImportPath } from "../../asset-file-types";
import type { RemoveSceneFromProjectResult } from "../../project-helpers";

export const SCENE_AUDIO_DROP_REJECTION_MESSAGE =
  "Scene audio accepts MP3, WAV, OGG, M4A, or AAC files only.";
export const VIDEO_BACKGROUND_BLOCKED_BY_SCENE_AUDIO_MESSAGE =
  "Clear scene audio before assigning a video background.";

const CORNER_FIRST_HOTSPOT_HANDLES_STORAGE_KEY = "mage2:scene-editor:corner-first-hotspot-handles";

export interface SceneAudioDropCandidate {
  filePath?: string;
  mimeType?: string;
}

export type SceneAudioDropAcceptance = "accept" | "reject" | "unknown";

interface ScenesPreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function resolveCornerFirstHotspotHandlesPreferenceValue(value: string | null | undefined): boolean {
  return value !== "false";
}

export function loadCornerFirstHotspotHandlesPreference(storage?: ScenesPreferenceStorage): boolean {
  try {
    const preferenceStorage = storage ?? getScenesPreferenceStorage();
    return resolveCornerFirstHotspotHandlesPreferenceValue(preferenceStorage?.getItem(CORNER_FIRST_HOTSPOT_HANDLES_STORAGE_KEY));
  } catch {
    return true;
  }
}

export function saveCornerFirstHotspotHandlesPreference(enabled: boolean, storage?: ScenesPreferenceStorage): void {
  try {
    const preferenceStorage = storage ?? getScenesPreferenceStorage();
    preferenceStorage?.setItem(CORNER_FIRST_HOTSPOT_HANDLES_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore storage failures; the editor should keep working in restricted contexts.
  }
}

function getScenesPreferenceStorage(): ScenesPreferenceStorage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.localStorage;
}

export function resolveSceneAudioDropAcceptance(candidates: readonly SceneAudioDropCandidate[]): SceneAudioDropAcceptance {
  if (candidates.length === 0) {
    return "unknown";
  }

  let hasKnownFileCandidate = false;
  let hasUnknownFileCandidate = false;

  for (const candidate of candidates) {
    const filePath = candidate.filePath?.trim() ?? "";
    const mimeType = candidate.mimeType?.trim().toLowerCase() ?? "";

    if (filePath || mimeType) {
      hasKnownFileCandidate = true;
      if (isSceneAudioImportPath(filePath) || mimeType.startsWith("audio/")) {
        return "accept";
      }
      continue;
    }

    hasUnknownFileCandidate = true;
  }

  return hasKnownFileCandidate && !hasUnknownFileCandidate ? "reject" : "unknown";
}

export function canAssignSceneBackgroundAsset(
  scene: { backgroundAssetId?: string; sceneAudioAssetId?: string },
  assetKind?: Asset["kind"]
): boolean {
  return assetKind !== "video" || !scene.sceneAudioAssetId;
}

export function applySceneBackgroundAsset(
  scene: { backgroundAssetId?: string; sceneAudioAssetId?: string },
  assetId: string | undefined,
  assetKind?: Asset["kind"]
): boolean {
  if (!canAssignSceneBackgroundAsset(scene, assetKind)) {
    return false;
  }

  scene.backgroundAssetId = assetId;
  return true;
}

export function resolveDeleteSceneBlockedMessage(
  sceneName: string,
  blockedReason: RemoveSceneFromProjectResult["blockedReason"]
): string {
  if (blockedReason === "replacement-scene-not-found") {
    return `Could not delete ${sceneName} because the selected replacement scene is no longer available.`;
  }

  return `Could not delete ${sceneName} because it is no longer present in the project.`;
}

export function resolveDeleteSceneStatusMessage(
  sceneName: string,
  deletion: RemoveSceneFromProjectResult,
  replacementSceneName: string | undefined,
  valid: boolean,
  issueCount: number
): string {
  const segments = [`Deleted ${sceneName}.`];

  if (deletion.strategy.mode === "rewire" && replacementSceneName) {
    segments.push(`Rewired scene references to ${replacementSceneName}.`);
  } else {
    segments.push("Cleaned references to the deleted scene.");
  }

  if (deletion.strategy.mode === "cleanup" && deletion.referenceSummary.isStartScene) {
    segments.push("Choose a new start scene to clear the validation error.");
  }

  if (!valid) {
    segments.push(`Project now has ${issueCount} validation issue(s).`);
  }

  return segments.join(" ");
}

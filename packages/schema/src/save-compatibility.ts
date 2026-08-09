import { z } from "zod";
import type { Condition, Effect, ProjectBundle } from "./types";
import { visitEffectConditions, visitEffects } from "./effects";

export const SAVE_COMPATIBILITY_BASELINE_FORMAT = "mage2-save-compatibility-baseline";
export const CURRENT_SAVE_COMPATIBILITY_BASELINE_VERSION = 1;

const SaveCompatibilitySceneSchema = z.object({
  id: z.string().min(1),
  locationId: z.string().min(1)
});

const SaveCompatibilityDialogueSchema = z.object({
  id: z.string().min(1),
  nodeIds: z.array(z.string().min(1))
});

export const SaveCompatibilitySnapshotSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }
  const snapshot = input as Record<string, unknown>;
  if (snapshot.variableIds === undefined && Array.isArray(snapshot.flagIds)) {
    return { ...snapshot, variableIds: snapshot.flagIds };
  }
  return snapshot;
}, z.object({
  locationIds: z.array(z.string().min(1)),
  scenes: z.array(SaveCompatibilitySceneSchema),
  inventoryItemIds: z.array(z.string().min(1)),
  variableIds: z.array(z.string().min(1)).default([]),
  dialogues: z.array(SaveCompatibilityDialogueSchema)
}));

export const SaveCompatibilityBaselineSchema = z.object({
  format: z.literal(SAVE_COMPATIBILITY_BASELINE_FORMAT),
  version: z.literal(CURRENT_SAVE_COMPATIBILITY_BASELINE_VERSION),
  projectId: z.string().min(1),
  saveCompatibilityVersion: z.number().int().positive(),
  recordedAt: z.string().min(1),
  snapshot: SaveCompatibilitySnapshotSchema
});

export type SaveCompatibilitySnapshot = z.infer<typeof SaveCompatibilitySnapshotSchema>;
export type SaveCompatibilityBaseline = z.infer<typeof SaveCompatibilityBaselineSchema>;

export type SaveCompatibilityIssue =
  | { code: "LOCATION_REMOVED"; entityId: string }
  | { code: "SCENE_REMOVED"; entityId: string }
  | {
      code: "SCENE_LOCATION_CHANGED";
      entityId: string;
      previousParentId: string;
      currentParentId: string;
    }
  | { code: "INVENTORY_ITEM_REMOVED"; entityId: string }
  | { code: "VARIABLE_REMOVED"; entityId: string }
  | { code: "DIALOGUE_TREE_REMOVED"; entityId: string }
  | { code: "DIALOGUE_NODE_REMOVED"; entityId: string; previousParentId: string };

export type SaveCompatibilityAssessmentStatus =
  | "untracked"
  | "compatible"
  | "breaking"
  | "generation-advanced"
  | "generation-regressed";

export interface SaveCompatibilityAssessment {
  status: SaveCompatibilityAssessmentStatus;
  blocksRelease: boolean;
  baselineSaveCompatibilityVersion?: number;
  currentSaveCompatibilityVersion: number;
  nextSaveCompatibilityVersion: number;
  issues: SaveCompatibilityIssue[];
}

export function createSaveCompatibilitySnapshot(project: ProjectBundle): SaveCompatibilitySnapshot {
  return SaveCompatibilitySnapshotSchema.parse({
    locationIds: project.locations.items.map((location) => location.id).sort(compareIds),
    scenes: project.scenes.items
      .map((scene) => ({ id: scene.id, locationId: scene.locationId }))
      .sort((left, right) => compareIds(left.id, right.id)),
    inventoryItemIds: project.inventory.items.map((item) => item.id).sort(compareIds),
    variableIds: collectSaveStateVariableIds(project),
    dialogues: project.dialogues.items
      .map((dialogue) => ({
        id: dialogue.id,
        nodeIds: dialogue.nodes.map((node) => node.id).sort(compareIds)
      }))
      .sort((left, right) => compareIds(left.id, right.id))
  });
}

export function createSaveCompatibilityBaseline(
  project: ProjectBundle,
  recordedAt = new Date().toISOString()
): SaveCompatibilityBaseline {
  return SaveCompatibilityBaselineSchema.parse({
    format: SAVE_COMPATIBILITY_BASELINE_FORMAT,
    version: CURRENT_SAVE_COMPATIBILITY_BASELINE_VERSION,
    projectId: project.manifest.projectId,
    saveCompatibilityVersion: project.manifest.saveCompatibilityVersion,
    recordedAt,
    snapshot: createSaveCompatibilitySnapshot(project)
  });
}

export function parseSaveCompatibilityBaseline(input: unknown): SaveCompatibilityBaseline {
  return SaveCompatibilityBaselineSchema.parse(input);
}

export function assessSaveCompatibility(
  baseline: SaveCompatibilityBaseline | undefined,
  project: ProjectBundle
): SaveCompatibilityAssessment {
  const currentSaveCompatibilityVersion = project.manifest.saveCompatibilityVersion;
  const baselineSaveCompatibilityVersion =
    baseline?.projectId === project.manifest.projectId
      ? baseline.saveCompatibilityVersion
      : undefined;
  const nextSaveCompatibilityVersion =
    Math.max(currentSaveCompatibilityVersion, baselineSaveCompatibilityVersion ?? 0) + 1;

  if (!baseline || baseline.projectId !== project.manifest.projectId) {
    return {
      status: "untracked",
      blocksRelease: false,
      currentSaveCompatibilityVersion,
      nextSaveCompatibilityVersion,
      issues: []
    };
  }

  const issues = compareSaveCompatibilitySnapshots(
    baseline.snapshot,
    createSaveCompatibilitySnapshot(project)
  );

  if (currentSaveCompatibilityVersion < baseline.saveCompatibilityVersion) {
    return {
      status: "generation-regressed",
      blocksRelease: true,
      baselineSaveCompatibilityVersion: baseline.saveCompatibilityVersion,
      currentSaveCompatibilityVersion,
      nextSaveCompatibilityVersion,
      issues
    };
  }

  if (currentSaveCompatibilityVersion > baseline.saveCompatibilityVersion) {
    return {
      status: "generation-advanced",
      blocksRelease: false,
      baselineSaveCompatibilityVersion: baseline.saveCompatibilityVersion,
      currentSaveCompatibilityVersion,
      nextSaveCompatibilityVersion,
      issues
    };
  }

  return {
    status: issues.length > 0 ? "breaking" : "compatible",
    blocksRelease: issues.length > 0,
    baselineSaveCompatibilityVersion: baseline.saveCompatibilityVersion,
    currentSaveCompatibilityVersion,
    nextSaveCompatibilityVersion,
    issues
  };
}

export function compareSaveCompatibilitySnapshots(
  baseline: SaveCompatibilitySnapshot,
  current: SaveCompatibilitySnapshot
): SaveCompatibilityIssue[] {
  const issues: SaveCompatibilityIssue[] = [];
  const currentLocationIds = new Set(current.locationIds);
  const currentScenes = new Map(current.scenes.map((scene) => [scene.id, scene]));
  const currentInventoryItemIds = new Set(current.inventoryItemIds);
  const currentVariableIds = new Set(current.variableIds);
  const currentDialogues = new Map(current.dialogues.map((dialogue) => [dialogue.id, dialogue]));

  for (const locationId of baseline.locationIds) {
    if (!currentLocationIds.has(locationId)) {
      issues.push({ code: "LOCATION_REMOVED", entityId: locationId });
    }
  }

  for (const scene of baseline.scenes) {
    const currentScene = currentScenes.get(scene.id);
    if (!currentScene) {
      issues.push({ code: "SCENE_REMOVED", entityId: scene.id });
      continue;
    }
    if (currentScene.locationId !== scene.locationId) {
      issues.push({
        code: "SCENE_LOCATION_CHANGED",
        entityId: scene.id,
        previousParentId: scene.locationId,
        currentParentId: currentScene.locationId
      });
    }
  }

  for (const itemId of baseline.inventoryItemIds) {
    if (!currentInventoryItemIds.has(itemId)) {
      issues.push({ code: "INVENTORY_ITEM_REMOVED", entityId: itemId });
    }
  }

  for (const variableId of baseline.variableIds) {
    if (!currentVariableIds.has(variableId)) {
      issues.push({ code: "VARIABLE_REMOVED", entityId: variableId });
    }
  }

  for (const dialogue of baseline.dialogues) {
    const currentDialogue = currentDialogues.get(dialogue.id);
    if (!currentDialogue) {
      issues.push({ code: "DIALOGUE_TREE_REMOVED", entityId: dialogue.id });
      continue;
    }

    const currentNodeIds = new Set(currentDialogue.nodeIds);
    for (const nodeId of dialogue.nodeIds) {
      if (!currentNodeIds.has(nodeId)) {
        issues.push({
          code: "DIALOGUE_NODE_REMOVED",
          entityId: nodeId,
          previousParentId: dialogue.id
        });
      }
    }
  }

  return issues;
}

function compareIds(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function collectSaveStateVariableIds(project: ProjectBundle): string[] {
  const variableIds = new Set<string>(project.manifest.variables.map((variable) => variable.id));
  const addConditions = (conditions: readonly Condition[]) => {
    for (const condition of conditions) {
      if (condition.type === "variableCompare") {
        variableIds.add(condition.variableId);
      }
    }
  };
  const addEffects = (effects: Effect[]) => {
    visitEffects(effects, (effect) => {
      if (effect.type === "setVariable" || effect.type === "changeVariable") {
        variableIds.add(effect.variableId);
      }
    });
    visitEffectConditions(effects, addConditions);
  };

  for (const scene of project.scenes.items) {
    addEffects(scene.onEnterEffects);
    addEffects(scene.onExitEffects);
    addEffects(scene.onMediaEndEffects ?? []);
    for (const hotspot of scene.hotspots) {
      addConditions(hotspot.conditions);
      addEffects(hotspot.effects);
      addEffects(hotspot.clickEvent?.effects ?? []);
      addEffects(hotspot.otherItemEvent?.effects ?? []);
    }
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      addEffects(node.effects);
      for (const choice of node.choices) {
        addConditions(choice.conditions);
        addEffects(choice.effects);
      }
    }
  }

  return [...variableIds].sort(compareIds);
}

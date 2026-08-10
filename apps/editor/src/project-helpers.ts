import type {
  Asset,
  Condition,
  DialogueTree,
  Effect,
  Hotspot,
  InventoryItem,
  Location,
  ProjectBundle,
  Scene
} from "@mage2/schema";
import {
  createRectangleHotspotPolygon,
  ensureLocaleStringValues,
  hasHotspotEvent,
  normalizeSupportedLocales,
  resolveAssetCategory,
  resolveHotspotBounds,
  visitEffectConditions,
  visitEffects
} from "@mage2/schema";
import { MIN_HOTSPOT_SIZE, roundHotspotCoordinate } from "./hotspot-geometry";
import {
  collectOwnedGeneratedProjectTextIdsForInventoryItem,
  collectOwnedGeneratedProjectTextIdsForHotspot,
  collectOwnedGeneratedProjectTextIdsForScene,
  getGeneratedDialogueChoiceTextId,
  getGeneratedDialogueNodeTextId,
  getGeneratedInventoryDescriptionTextId,
  getGeneratedInventoryNameTextId,
  pruneOwnedGeneratedProjectTextEntries
} from "./project-text";

export interface AssetReferenceSummary {
  sceneBackgrounds: Array<{
    sceneId: string;
    sceneName: string;
  }>;
  sceneAudioAssignments: Array<{
    sceneId: string;
    sceneName: string;
  }>;
  hotspotMediaAssignments: Array<{
    sceneId: string;
    sceneName: string;
    hotspotId: string;
    hotspotName: string;
  }>;
  dialogueMediaAssignments: Array<{
    dialogueId: string;
    dialogueName: string;
    nodeId: string;
    nodeLabel: string;
  }>;
  inventoryImages: Array<{
    itemId: string;
    itemName: string;
  }>;
  responseEntries: Array<{
    groupId: string;
    groupName: string;
    entryId: string;
    kind: "audio" | "video";
  }>;
  playerPresentation: Array<{
    role: "titleBackground" | "logo" | "appIcon";
  }>;
}

export interface RemoveAssetFromProjectResult {
  deleted: boolean;
  blockedReason?: "asset-not-found" | "background-in-use-without-replacement" | "inventory-image-in-use" | "response-media-in-use" | "player-asset-in-use";
  fallbackAssetId?: string;
  referenceSummary: AssetReferenceSummary;
}

export interface AssetDeletionEligibility {
  canDelete: boolean;
  blockedReason?: RemoveAssetFromProjectResult["blockedReason"];
  fallbackAssetId?: string;
  referenceSummary: AssetReferenceSummary;
}

export interface SceneReferenceSummary {
  isStartScene: boolean;
  locationReferenceCount: number;
  hotspotTargetReferenceCount: number;
  sceneVisitedConditionCount: number;
  goToSceneEffectCount: number;
}

export type RemoveSceneStrategy =
  | {
      mode: "cleanup";
    }
  | {
      mode: "rewire";
      replacementSceneId: string;
    };

export interface RemoveSceneFromProjectResult {
  deleted: boolean;
  blockedReason?: "scene-not-found" | "replacement-scene-not-found";
  strategy: RemoveSceneStrategy;
  referenceSummary: SceneReferenceSummary;
  removedTextIds: string[];
}

export interface InventoryItemReferenceSummary {
  hotspotItemReferenceCount: number;
  placementReferenceCount: number;
  inventoryConditionCount: number;
  inventoryEffectCount: number;
}

export type RemoveInventoryItemStrategy =
  | {
      mode: "cleanup";
    }
  | {
      mode: "rewire";
      replacementItemId: string;
    };

export interface RemoveInventoryItemFromProjectResult {
  deleted: boolean;
  blockedReason?: "item-not-found" | "replacement-item-not-found";
  strategy: RemoveInventoryItemStrategy;
  referenceSummary: InventoryItemReferenceSummary;
  removedTextIds: string[];
}

export interface RemoveLocationFromProjectResult {
  deleted: boolean;
  blockedReason?: "location-not-found" | "last-location" | "no-replacement-start-scene";
  removedSceneIds: string[];
  nextStartLocationId?: string;
  nextStartSceneId?: string;
}

export interface RemoveHotspotFromProjectResult {
  deleted: boolean;
  removedTextIds: string[];
}

export type EditorAssetCategory = "background" | "inventory" | "sceneAudio" | "foreground" | "response" | "player";

export const STARTER_PLACEHOLDER_ASSET_ID = "asset_placeholder";
const DEFAULT_HOTSPOT_WIDTH = 0.16;
const DEFAULT_HOTSPOT_HEIGHT = 0.16;
const HOTSPOT_AUTO_PLACEMENT_STEP = 0.04;
const HOTSPOT_AUTO_PLACEMENT_PADDING = 0.04;
const HOTSPOT_SCORE_EPSILON = 0.000001;

export function cloneProject(project: ProjectBundle): ProjectBundle {
  return structuredClone(project);
}

export function createProjectRevision(project: ProjectBundle): string {
  return JSON.stringify(project);
}

export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function synchronizeAssetRoots(project: ProjectBundle): void {
  const nextAssetRoots: string[] = [];

  for (const asset of project.assets.assets) {
    for (const variant of Object.values(asset.variants)) {
      const root = variant.sourcePath.replace(/[\\/][^\\/]+$/, "");
      if (root && !nextAssetRoots.includes(root)) {
        nextAssetRoots.push(root);
      }
    }
  }

  project.manifest.assetRoots = nextAssetRoots;
}

export function addAssetRoots(project: ProjectBundle, assets: Asset[]): void {
  for (const asset of assets) {
    for (const variant of Object.values(asset.variants)) {
      const root = variant.sourcePath.replace(/[\\/][^\\/]+$/, "");
      if (root && !project.manifest.assetRoots.includes(root)) {
        project.manifest.assetRoots.push(root);
      }
    }
  }
}

export function collectAssetReferenceSummary(
  project: ProjectBundle,
  assetId: string
): AssetReferenceSummary {
  const sceneBackgrounds: AssetReferenceSummary["sceneBackgrounds"] = [];
  const sceneAudioAssignments: AssetReferenceSummary["sceneAudioAssignments"] = [];
  const hotspotMediaAssignments: AssetReferenceSummary["hotspotMediaAssignments"] = [];
  const dialogueMediaAssignments: AssetReferenceSummary["dialogueMediaAssignments"] = [];
  const inventoryImages: AssetReferenceSummary["inventoryImages"] = [];
  const responseEntries: AssetReferenceSummary["responseEntries"] = [];
  const playerPresentation: AssetReferenceSummary["playerPresentation"] = [];

  for (const scene of project.scenes.items) {
    if (scene.backgroundAssetId === assetId) {
      sceneBackgrounds.push({
        sceneId: scene.id,
        sceneName: scene.name
      });
    }

    if (scene.sceneAudioAssetId === assetId) {
      sceneAudioAssignments.push({
        sceneId: scene.id,
        sceneName: scene.name
      });
    }

    for (const hotspot of scene.hotspots) {
      if (hotspot.mediaAssetId === assetId) {
        hotspotMediaAssignments.push({
          sceneId: scene.id,
          sceneName: scene.name,
          hotspotId: hotspot.id,
          hotspotName: hotspot.name
        });
      }
    }
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      if (node.mediaAssetId === assetId) {
        dialogueMediaAssignments.push({
          dialogueId: dialogue.id,
          dialogueName: dialogue.name,
          nodeId: node.id,
          nodeLabel: node.speaker || node.id
        });
      }
    }
  }

  for (const item of project.inventory.items) {
    if (item.imageAssetId === assetId) {
      inventoryImages.push({
        itemId: item.id,
        itemName: item.name
      });
    }
  }

  for (const group of project.dialogues.responseGroups) {
    for (const entry of group.entries) {
      if (entry.kind !== "text" && entry.assetId === assetId) {
        responseEntries.push({
          groupId: group.id,
          groupName: group.name,
          entryId: entry.id,
          kind: entry.kind
        });
      }
    }
  }

  if (project.manifest.playerPresentation.titleBackgroundAssetId === assetId) {
    playerPresentation.push({ role: "titleBackground" });
  }
  if (project.manifest.playerPresentation.logoAssetId === assetId) {
    playerPresentation.push({ role: "logo" });
  }
  if (project.manifest.playerPresentation.appIconAssetId === assetId) {
    playerPresentation.push({ role: "appIcon" });
  }

  return {
    sceneBackgrounds,
    sceneAudioAssignments,
    hotspotMediaAssignments,
    dialogueMediaAssignments,
    inventoryImages,
    responseEntries,
    playerPresentation
  };
}

export function countAssetReferences(summary: AssetReferenceSummary): number {
  return (
    summary.sceneBackgrounds.length +
    summary.sceneAudioAssignments.length +
    summary.hotspotMediaAssignments.length +
    summary.dialogueMediaAssignments.length +
    summary.inventoryImages.length +
    summary.responseEntries.length +
    summary.playerPresentation.length
  );
}

export function evaluateAssetDeletion(
  project: ProjectBundle,
  assetId: string
): AssetDeletionEligibility {
  const referenceSummary = collectAssetReferenceSummary(project, assetId);
  const targetAsset = project.assets.assets.find((asset) => asset.id === assetId);
  const fallbackAssetId = targetAsset ? resolveBackgroundFallbackAssetId(project.assets.assets, targetAsset) : undefined;
  const assetExists = Boolean(targetAsset);

  if (!assetExists) {
    return {
      canDelete: false,
      blockedReason: "asset-not-found",
      fallbackAssetId,
      referenceSummary
    };
  }

  if (referenceSummary.inventoryImages.length > 0) {
    return {
      canDelete: false,
      blockedReason: "inventory-image-in-use",
      fallbackAssetId,
      referenceSummary
    };
  }

  if (referenceSummary.responseEntries.length > 0) {
    return {
      canDelete: false,
      blockedReason: "response-media-in-use",
      fallbackAssetId,
      referenceSummary
    };
  }


  if (referenceSummary.playerPresentation.length > 0) {
    return {
      canDelete: false,
      blockedReason: "player-asset-in-use",
      fallbackAssetId,
      referenceSummary
    };
  }

  if (referenceSummary.sceneBackgrounds.length > 0 && !fallbackAssetId) {
    return {
      canDelete: false,
      blockedReason: "background-in-use-without-replacement",
      fallbackAssetId,
      referenceSummary
    };
  }

  return {
    canDelete: true,
    fallbackAssetId,
    referenceSummary
  };
}

export function removeAssetFromProject(
  project: ProjectBundle,
  assetId: string
): RemoveAssetFromProjectResult {
  const deletionEligibility = evaluateAssetDeletion(project, assetId);

  if (!deletionEligibility.canDelete) {
    return {
      deleted: false,
      blockedReason: deletionEligibility.blockedReason,
      fallbackAssetId: deletionEligibility.fallbackAssetId,
      referenceSummary: deletionEligibility.referenceSummary
    };
  }
  const { fallbackAssetId, referenceSummary } = deletionEligibility;

  project.assets.assets = project.assets.assets.filter((asset) => asset.id !== assetId);

  for (const scene of project.scenes.items) {
    if (scene.backgroundAssetId === assetId && fallbackAssetId) {
      scene.backgroundAssetId = fallbackAssetId;
    }

    if (scene.sceneAudioAssetId === assetId) {
      scene.sceneAudioAssetId = undefined;
    }

    for (const hotspot of scene.hotspots) {
      if (hotspot.mediaAssetId === assetId) {
        hotspot.mediaAssetId = undefined;
      }
    }
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      if (node.mediaAssetId === assetId) {
        node.mediaAssetId = undefined;
      }
    }
  }

  synchronizeAssetRoots(project);

  return {
    deleted: true,
    fallbackAssetId,
    referenceSummary
  };
}

export function collectSceneReferenceSummary(project: ProjectBundle, sceneId: string): SceneReferenceSummary {
  const scene = project.scenes.items.find((entry) => entry.id === sceneId);
  const summary: SceneReferenceSummary = {
    isStartScene: project.manifest.startSceneId === sceneId,
    locationReferenceCount: 0,
    hotspotTargetReferenceCount: 0,
    sceneVisitedConditionCount: 0,
    goToSceneEffectCount: 0
  };

  if (!scene) {
    return summary;
  }

  for (const location of project.locations.items) {
    summary.locationReferenceCount += location.sceneIds.filter((entry) => entry === sceneId).length;
  }

  for (const candidateScene of project.scenes.items) {
    if (candidateScene.id === sceneId) {
      continue;
    }

    for (const hotspot of candidateScene.hotspots) {
      if (hotspot.targetSceneId === sceneId) {
        summary.hotspotTargetReferenceCount += 1;
      }

      for (const event of [hotspot.clickEvent, hotspot.otherItemEvent]) {
        if (event?.targetSceneId === sceneId) {
          summary.hotspotTargetReferenceCount += 1;
        }
        summary.goToSceneEffectCount += countGoToSceneEffects(event?.effects ?? [], sceneId);
        summary.sceneVisitedConditionCount += countSceneVisitedConditionsInEffects(event?.effects ?? [], sceneId);
      }

      summary.sceneVisitedConditionCount += countSceneVisitedConditions(hotspot.conditions, sceneId);
      summary.goToSceneEffectCount += countGoToSceneEffects(hotspot.effects, sceneId);
      summary.sceneVisitedConditionCount += countSceneVisitedConditionsInEffects(hotspot.effects, sceneId);
    }

    summary.goToSceneEffectCount += countGoToSceneEffects(candidateScene.onEnterEffects, sceneId);
    summary.goToSceneEffectCount += countGoToSceneEffects(candidateScene.onExitEffects, sceneId);
    summary.goToSceneEffectCount += countGoToSceneEffects(candidateScene.onMediaEndEffects, sceneId);
    summary.sceneVisitedConditionCount += countSceneVisitedConditionsInEffects(candidateScene.onEnterEffects, sceneId);
    summary.sceneVisitedConditionCount += countSceneVisitedConditionsInEffects(candidateScene.onExitEffects, sceneId);
    summary.sceneVisitedConditionCount += countSceneVisitedConditionsInEffects(candidateScene.onMediaEndEffects, sceneId);
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      summary.goToSceneEffectCount += countGoToSceneEffects(node.effects, sceneId);
      summary.sceneVisitedConditionCount += countSceneVisitedConditionsInEffects(node.effects, sceneId);

      for (const choice of node.choices) {
        summary.sceneVisitedConditionCount += countSceneVisitedConditions(choice.conditions, sceneId);
        summary.goToSceneEffectCount += countGoToSceneEffects(choice.effects, sceneId);
        summary.sceneVisitedConditionCount += countSceneVisitedConditionsInEffects(choice.effects, sceneId);
      }
    }
  }

  return summary;
}

export function countSceneReferences(summary: SceneReferenceSummary): number {
  return (
    Number(summary.isStartScene) +
    summary.locationReferenceCount +
    summary.hotspotTargetReferenceCount +
    summary.sceneVisitedConditionCount +
    summary.goToSceneEffectCount
  );
}

export function collectInventoryItemReferenceSummary(
  project: ProjectBundle,
  itemId: string
): InventoryItemReferenceSummary {
  const summary: InventoryItemReferenceSummary = {
    hotspotItemReferenceCount: 0,
    placementReferenceCount: 0,
    inventoryConditionCount: 0,
    inventoryEffectCount: 0
  };

  for (const scene of project.scenes.items) {
    summary.inventoryEffectCount += countInventoryItemEffects(scene.onEnterEffects, itemId);
    summary.inventoryEffectCount += countInventoryItemEffects(scene.onExitEffects, itemId);
    summary.inventoryEffectCount += countInventoryItemEffects(scene.onMediaEndEffects, itemId);
    summary.inventoryConditionCount += countInventoryItemConditionsInEffects(scene.onEnterEffects, itemId);
    summary.inventoryConditionCount += countInventoryItemConditionsInEffects(scene.onExitEffects, itemId);
    summary.inventoryConditionCount += countInventoryItemConditionsInEffects(scene.onMediaEndEffects, itemId);

    for (const hotspot of scene.hotspots) {
      if (hotspot.inventoryItemId === itemId) {
        summary.hotspotItemReferenceCount += 1;
      }
      if (hotspot.placedInventoryItemId === itemId) {
        summary.placementReferenceCount += 1;
      }
      summary.inventoryConditionCount += countInventoryItemConditions(hotspot.conditions, itemId);
      summary.inventoryEffectCount += countInventoryItemEffects(hotspot.effects, itemId);
      summary.inventoryConditionCount += countInventoryItemConditionsInEffects(hotspot.effects, itemId);
      for (const event of [hotspot.clickEvent, hotspot.otherItemEvent]) {
        summary.inventoryEffectCount += countInventoryItemEffects(event?.effects ?? [], itemId);
        summary.inventoryConditionCount += countInventoryItemConditionsInEffects(event?.effects ?? [], itemId);
      }
    }
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      summary.inventoryEffectCount += countInventoryItemEffects(node.effects, itemId);
      summary.inventoryConditionCount += countInventoryItemConditionsInEffects(node.effects, itemId);
      for (const choice of node.choices) {
        summary.inventoryConditionCount += countInventoryItemConditions(choice.conditions, itemId);
        summary.inventoryEffectCount += countInventoryItemEffects(choice.effects, itemId);
        summary.inventoryConditionCount += countInventoryItemConditionsInEffects(choice.effects, itemId);
      }
    }
  }

  return summary;
}

export function countInventoryItemReferences(summary: InventoryItemReferenceSummary): number {
  return (
    summary.hotspotItemReferenceCount +
    summary.placementReferenceCount +
    summary.inventoryConditionCount +
    summary.inventoryEffectCount
  );
}

export function removeInventoryItemFromProject(
  project: ProjectBundle,
  itemId: string,
  strategy: RemoveInventoryItemStrategy
): RemoveInventoryItemFromProjectResult {
  const referenceSummary = collectInventoryItemReferenceSummary(project, itemId);
  const item = project.inventory.items.find((entry) => entry.id === itemId);

  if (!item) {
    return {
      deleted: false,
      blockedReason: "item-not-found",
      strategy,
      referenceSummary,
      removedTextIds: []
    };
  }

  const replacementItem =
    strategy.mode === "rewire"
      ? project.inventory.items.find((entry) => entry.id === strategy.replacementItemId && entry.id !== itemId)
      : undefined;
  if (strategy.mode === "rewire" && !replacementItem) {
    return {
      deleted: false,
      blockedReason: "replacement-item-not-found",
      strategy,
      referenceSummary,
      removedTextIds: []
    };
  }

  const ownedGeneratedTextIds = collectOwnedGeneratedProjectTextIdsForInventoryItem(item);
  project.inventory.items = project.inventory.items.filter((entry) => entry.id !== itemId);

  for (const scene of project.scenes.items) {
    scene.onEnterEffects = rewriteInventoryItemEffects(scene.onEnterEffects, itemId, strategy);
    scene.onExitEffects = rewriteInventoryItemEffects(scene.onExitEffects, itemId, strategy);
    scene.onMediaEndEffects = rewriteInventoryItemEffects(scene.onMediaEndEffects, itemId, strategy);

    for (const hotspot of scene.hotspots) {
      const removedPlacement = hotspot.placedInventoryItemId === itemId;
      if (hotspot.inventoryItemId === itemId) {
        hotspot.inventoryItemId = strategy.mode === "rewire" ? strategy.replacementItemId : undefined;
      }
      if (removedPlacement) {
        hotspot.placedInventoryItemId = strategy.mode === "rewire" ? strategy.replacementItemId : undefined;
        if (strategy.mode === "cleanup") {
          hotspot.placedInventoryGeometry = undefined;
        }
      }

      hotspot.conditions = rewriteInventoryItemConditions(hotspot.conditions, itemId, strategy);
      hotspot.effects = rewriteInventoryItemEffects(hotspot.effects, itemId, strategy);
      if (hotspot.clickEvent) {
        hotspot.clickEvent.effects = rewriteInventoryItemEffects(hotspot.clickEvent.effects, itemId, strategy);
      }
      if (hotspot.otherItemEvent) {
        hotspot.otherItemEvent.effects = rewriteInventoryItemEffects(hotspot.otherItemEvent.effects, itemId, strategy);
      }
    }
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      node.effects = rewriteInventoryItemEffects(node.effects, itemId, strategy);
      for (const choice of node.choices) {
        choice.conditions = rewriteInventoryItemConditions(choice.conditions, itemId, strategy);
        choice.effects = rewriteInventoryItemEffects(choice.effects, itemId, strategy);
      }
    }
  }

  return {
    deleted: true,
    strategy,
    referenceSummary,
    removedTextIds: pruneOwnedGeneratedProjectTextEntries(project, ownedGeneratedTextIds)
  };
}

export function removeSceneFromProject(
  project: ProjectBundle,
  sceneId: string,
  strategy: RemoveSceneStrategy
): RemoveSceneFromProjectResult {
  const referenceSummary = collectSceneReferenceSummary(project, sceneId);
  const scene = project.scenes.items.find((entry) => entry.id === sceneId);
  const ownedGeneratedTextIds = scene ? collectOwnedGeneratedProjectTextIdsForScene(scene) : [];

  if (!scene) {
    return {
      deleted: false,
      blockedReason: "scene-not-found",
      strategy,
      referenceSummary,
      removedTextIds: []
    };
  }

  const replacementScene =
    strategy.mode === "rewire"
      ? project.scenes.items.find((entry) => entry.id === strategy.replacementSceneId && entry.id !== sceneId)
      : undefined;

  if (strategy.mode === "rewire" && !replacementScene) {
    return {
      deleted: false,
      blockedReason: "replacement-scene-not-found",
      strategy,
      referenceSummary,
      removedTextIds: []
    };
  }

  project.scenes.items = project.scenes.items.filter((entry) => entry.id !== sceneId);

  for (const location of project.locations.items) {
    location.sceneIds = location.sceneIds.filter((entry) => entry !== sceneId);
  }

  if (strategy.mode === "rewire" && replacementScene && project.manifest.startSceneId === sceneId) {
    project.manifest.startSceneId = replacementScene.id;
    project.manifest.startLocationId = replacementScene.locationId;
  }

  for (const candidateScene of project.scenes.items) {
    for (const hotspot of candidateScene.hotspots) {
      if (hotspot.targetSceneId === sceneId) {
        hotspot.targetSceneId = strategy.mode === "rewire" ? strategy.replacementSceneId : undefined;
      }
      hotspot.conditions = rewriteSceneConditions(hotspot.conditions, sceneId, strategy);
      hotspot.effects = rewriteSceneEffects(hotspot.effects, sceneId, strategy);

      for (const key of ["clickEvent", "otherItemEvent"] as const) {
        const event = hotspot[key];
        if (!event) {
          continue;
        }
        if (event.targetSceneId === sceneId) {
          event.targetSceneId = strategy.mode === "rewire" ? strategy.replacementSceneId : undefined;
        }
        event.effects = rewriteSceneEffects(event.effects, sceneId, strategy);
        if (!hasHotspotEvent(event)) {
          delete hotspot[key];
        }
      }
    }

    candidateScene.onEnterEffects = rewriteSceneEffects(candidateScene.onEnterEffects, sceneId, strategy);
    candidateScene.onExitEffects = rewriteSceneEffects(candidateScene.onExitEffects, sceneId, strategy);
    candidateScene.onMediaEndEffects = rewriteSceneEffects(candidateScene.onMediaEndEffects, sceneId, strategy);
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      node.effects = rewriteSceneEffects(node.effects, sceneId, strategy);

      for (const choice of node.choices) {
        choice.conditions = rewriteSceneConditions(choice.conditions, sceneId, strategy);
        choice.effects = rewriteSceneEffects(choice.effects, sceneId, strategy);
      }
    }
  }

  const removedTextIds = pruneOwnedGeneratedProjectTextEntries(project, ownedGeneratedTextIds);

  return {
    deleted: true,
    strategy,
    referenceSummary,
    removedTextIds
  };
}

export function removeLocationFromProject(project: ProjectBundle, locationId: string): RemoveLocationFromProjectResult {
  const location = project.locations.items.find((entry) => entry.id === locationId);

  if (!location) {
    return {
      deleted: false,
      blockedReason: "location-not-found",
      removedSceneIds: []
    };
  }

  const remainingLocations = project.locations.items.filter((entry) => entry.id !== locationId);
  if (remainingLocations.length === 0) {
    return {
      deleted: false,
      blockedReason: "last-location",
      removedSceneIds: []
    };
  }

  const removedSceneIds = [...new Set(location.sceneIds)];
  const removedSceneIdSet = new Set(removedSceneIds);
  const startNeedsRepair = project.manifest.startLocationId === locationId || removedSceneIdSet.has(project.manifest.startSceneId);
  const replacementStartScene = startNeedsRepair ? findFirstSceneInLocations(project, remainingLocations) : undefined;

  if (startNeedsRepair && !replacementStartScene) {
    return {
      deleted: false,
      blockedReason: "no-replacement-start-scene",
      removedSceneIds
    };
  }

  for (const sceneId of removedSceneIds) {
    removeSceneFromProject(project, sceneId, { mode: "cleanup" });
  }

  project.locations.items = project.locations.items.filter((entry) => entry.id !== locationId);

  if (startNeedsRepair && replacementStartScene) {
    project.manifest.startLocationId = replacementStartScene.locationId;
    project.manifest.startSceneId = replacementStartScene.id;
  }

  return {
    deleted: true,
    removedSceneIds,
    nextStartLocationId: project.manifest.startLocationId,
    nextStartSceneId: project.manifest.startSceneId
  };
}

export function removeHotspotFromProject(
  project: ProjectBundle,
  sceneId: string,
  hotspotId: string
): RemoveHotspotFromProjectResult {
  const scene = project.scenes.items.find((entry) => entry.id === sceneId);
  const hotspot = scene?.hotspots.find((entry) => entry.id === hotspotId);

  if (!scene || !hotspot) {
    return {
      deleted: false,
      removedTextIds: []
    };
  }

  const ownedGeneratedTextIds = collectOwnedGeneratedProjectTextIdsForHotspot(hotspot);
  scene.hotspots = scene.hotspots.filter((entry) => entry.id !== hotspotId);

  return {
    deleted: true,
    removedTextIds: pruneOwnedGeneratedProjectTextEntries(project, ownedGeneratedTextIds)
  };
}

export function ensureString(project: ProjectBundle, textId: string, fallback: string): void {
  for (const locale of normalizeSupportedLocales(project.manifest.defaultLanguage, project.manifest.supportedLocales)) {
    const values = ensureLocaleStringValues(project, locale);
    if (!(textId in values)) {
      values[textId] = fallback;
    }
  }
}

export function addLocation(project: ProjectBundle): Location {
  const locationId = createId("location");
  const scene = addScene(project, locationId);

  const location: Location = {
    id: locationId,
    name: `Location ${project.locations.items.length + 1}`,
    x: 180 + project.locations.items.length * 120,
    y: 160 + (project.locations.items.length % 2) * 120,
    sceneIds: [scene.id]
  };

  project.locations.items.push(location);
  return location;
}

export function addScene(project: ProjectBundle, locationId?: string): Scene {
  const sceneId = createId("scene");
  const scene: Scene = {
    id: sceneId,
    locationId: locationId ?? project.locations.items[0]?.id ?? "location_intro",
    name: `Scene ${project.scenes.items.length + 1}`,
    sceneAudioLoop: true,
    sceneAudioDelayMs: 0,
    backgroundVideoLoop: false,
    videoAudioMode: "silent",
    hotspots: [],
    dialogueTreeIds: [],
    onEnterEffects: [],
    onExitEffects: [],
    onMediaEndEffects: []
  };

  project.scenes.items.push(scene);

  const location = project.locations.items.find((entry) => entry.id === scene.locationId);
  if (location && !location.sceneIds.includes(scene.id)) {
    location.sceneIds.push(scene.id);
  }

  return scene;
}

export function addDialogueTree(project: ProjectBundle): DialogueTree {
  const treeId = createId("dialogue");
  const nodeId = createId("node");
  const textId = getGeneratedDialogueNodeTextId(nodeId);
  const choiceId = createId("choice");
  const choiceTextId = getGeneratedDialogueChoiceTextId(choiceId);

  const dialogue: DialogueTree = {
    id: treeId,
    name: `Dialogue ${project.dialogues.items.length + 1}`,
    startNodeId: nodeId,
    nodes: [
      {
        id: nodeId,
        speaker: "Hero",
        textId,
        choices: [
          {
            id: choiceId,
            textId: choiceTextId,
            conditionMode: "all",
            conditions: [],
            effects: []
          }
        ],
        effects: []
      }
    ]
  };

  ensureString(project, textId, "Opening line");
  ensureString(project, choiceTextId, "Continue");
  project.dialogues.items.push(dialogue);
  return dialogue;
}

export function addInventoryItem(project: ProjectBundle): InventoryItem {
  const itemId = createId("item");
  const textId = getGeneratedInventoryNameTextId(itemId);
  const descriptionTextId = getGeneratedInventoryDescriptionTextId(itemId);
  const item: InventoryItem = {
    id: itemId,
    name: `Item ${project.inventory.items.length + 1}`,
    textId,
    descriptionTextId
  };

  ensureString(project, textId, item.name);
  ensureString(project, descriptionTextId, `${item.name} description`);
  project.inventory.items.unshift(item);
  return item;
}

export function addHotspot(project: ProjectBundle, sceneId: string, x: number, y: number): Hotspot | undefined {
  const scene = project.scenes.items.find((entry) => entry.id === sceneId);
  if (!scene) {
    return undefined;
  }

  return createHotspot(scene, resolveHotspotBoundsFromCenter(x, y));
}

export function addHotspotAtBestAvailablePosition(
  project: ProjectBundle,
  sceneId: string,
  size?: {
    width: number;
    height: number;
  }
): Hotspot | undefined {
  const scene = project.scenes.items.find((entry) => entry.id === sceneId);
  if (!scene) {
    return undefined;
  }

  return createHotspot(scene, findBestHotspotBounds(scene.hotspots, size));
}

export function classifyEditorAssetCategory(asset: Asset): EditorAssetCategory {
  switch (resolveAssetCategory(asset)) {
    case "inventory":
      return "inventory";
    case "sceneAudio":
      return "sceneAudio";
    case "foreground":
      return "foreground";
    case "response":
      return "response";
    case "player":
      return "player";
    default:
      return "background";
  }
}

export function isBackgroundAsset(asset: Asset): boolean {
  return resolveAssetCategory(asset) === "background" && (asset.kind === "image" || asset.kind === "video");
}

export function isSceneAudioAsset(asset: Asset): boolean {
  return resolveAssetCategory(asset) === "sceneAudio" && asset.kind === "audio";
}

export function isForegroundMediaAsset(asset: Asset): boolean {
  return resolveAssetCategory(asset) === "foreground" && (asset.kind === "audio" || asset.kind === "video");
}

export function isInventoryImageAsset(asset: Asset): boolean {
  return resolveAssetCategory(asset) === "inventory" && asset.kind === "image";
}

export function isResponseMediaAsset(asset: Asset): boolean {
  return resolveAssetCategory(asset) === "response" && (asset.kind === "audio" || asset.kind === "video");
}

export function isPlayerPresentationAsset(asset: Asset): boolean {
  return resolveAssetCategory(asset) === "player" && asset.kind === "image";
}

export function resolveFirstBackgroundAssetId(assets: Asset[]): string | undefined {
  return (
    assets.find((asset) => asset.id !== STARTER_PLACEHOLDER_ASSET_ID && isBackgroundAsset(asset))?.id ??
    assets.find((asset) => isBackgroundAsset(asset))?.id
  );
}

function resolveBackgroundFallbackAssetId(assets: Asset[], deletedAsset: Asset): string | undefined {
  if (!isBackgroundAsset(deletedAsset)) {
    return undefined;
  }

  return (
    assets.find((asset) => asset.id !== deletedAsset.id && asset.id !== STARTER_PLACEHOLDER_ASSET_ID && isBackgroundAsset(asset))
      ?.id ??
    assets.find((asset) => asset.id !== deletedAsset.id && isBackgroundAsset(asset))?.id
  );
}

function countSceneVisitedConditions(conditions: Condition[], sceneId: string): number {
  return conditions.filter((condition) => condition.type === "sceneVisited" && condition.sceneId === sceneId).length;
}

function countGoToSceneEffects(effects: Effect[], sceneId: string): number {
  let count = 0;
  visitEffects(effects, (effect) => {
    if (effect.type === "goToScene" && effect.sceneId === sceneId) count += 1;
  });
  return count;
}

function countSceneVisitedConditionsInEffects(effects: Effect[], sceneId: string): number {
  let count = 0;
  visitEffectConditions(effects, (conditions) => {
    count += countSceneVisitedConditions([...conditions], sceneId);
  });
  return count;
}

function rewriteSceneConditions(
  conditions: Condition[],
  deletedSceneId: string,
  strategy: RemoveSceneStrategy
): Condition[] {
  return conditions.flatMap((condition) => {
    if (condition.type !== "sceneVisited" || condition.sceneId !== deletedSceneId) {
      return [condition];
    }

    return strategy.mode === "cleanup"
      ? []
      : [
          {
            ...condition,
            sceneId: strategy.replacementSceneId
          }
        ];
  });
}

function rewriteSceneEffects(effects: Effect[], deletedSceneId: string, strategy: RemoveSceneStrategy): Effect[] {
  const rewrittenEffects: Effect[] = [];
  for (const effect of effects) {
    if (effect.type === "conditional") {
      const conditions = rewriteSceneConditions(effect.conditions, deletedSceneId, strategy);
      if (conditions.length === 0 && effect.conditions.length > 0) {
        continue;
      }
      const rewritten: Effect = {
        ...effect,
        conditions,
        thenEffects: rewriteSceneEffects(effect.thenEffects, deletedSceneId, strategy),
        elseEffects: rewriteSceneEffects(effect.elseEffects, deletedSceneId, strategy)
      };
      rewrittenEffects.push(rewritten);
      continue;
    }
    if (effect.type !== "goToScene" || effect.sceneId !== deletedSceneId) {
      rewrittenEffects.push(effect);
      continue;
    }

    if (strategy.mode === "rewire") {
      rewrittenEffects.push({ ...effect, sceneId: strategy.replacementSceneId });
    }
  }
  return rewrittenEffects;
}

function countInventoryItemConditions(conditions: Condition[], itemId: string): number {
  return conditions.filter((condition) => condition.type === "inventoryHas" && condition.itemId === itemId).length;
}

function countInventoryItemEffects(effects: Effect[], itemId: string): number {
  let count = 0;
  visitEffects(effects, (effect) => {
    if ((effect.type === "addItem" || effect.type === "removeItem") && effect.itemId === itemId) count += 1;
  });
  return count;
}

function countInventoryItemConditionsInEffects(effects: Effect[], itemId: string): number {
  let count = 0;
  visitEffectConditions(effects, (conditions) => {
    count += countInventoryItemConditions([...conditions], itemId);
  });
  return count;
}

function rewriteInventoryItemConditions(
  conditions: Condition[],
  deletedItemId: string,
  strategy: RemoveInventoryItemStrategy
): Condition[] {
  return conditions.flatMap((condition) => {
    if (condition.type !== "inventoryHas" || condition.itemId !== deletedItemId) {
      return [condition];
    }

    return strategy.mode === "cleanup"
      ? []
      : [
          {
            ...condition,
            itemId: strategy.replacementItemId
          }
        ];
  });
}

function rewriteInventoryItemEffects(
  effects: Effect[],
  deletedItemId: string,
  strategy: RemoveInventoryItemStrategy
): Effect[] {
  const rewrittenEffects: Effect[] = [];
  for (const effect of effects) {
    if (effect.type === "conditional") {
      const conditions = rewriteInventoryItemConditions(effect.conditions, deletedItemId, strategy);
      if (conditions.length === 0 && effect.conditions.length > 0) {
        continue;
      }
      const rewritten: Effect = {
        ...effect,
        conditions,
        thenEffects: rewriteInventoryItemEffects(effect.thenEffects, deletedItemId, strategy),
        elseEffects: rewriteInventoryItemEffects(effect.elseEffects, deletedItemId, strategy)
      };
      rewrittenEffects.push(rewritten);
      continue;
    }
    if ((effect.type !== "addItem" && effect.type !== "removeItem") || effect.itemId !== deletedItemId) {
      rewrittenEffects.push(effect);
      continue;
    }

    if (strategy.mode === "rewire") {
      rewrittenEffects.push({ ...effect, itemId: strategy.replacementItemId });
    }
  }
  return rewrittenEffects;
}

function findFirstSceneInLocations(project: ProjectBundle, locations: Location[]): Scene | undefined {
  for (const location of locations) {
    for (const sceneId of location.sceneIds) {
      const scene = project.scenes.items.find((entry) => entry.id === sceneId);
      if (scene) {
        return scene;
      }
    }
  }

  return undefined;
}

function getNextHotspotNumber(scene: Scene): number {
  const highestHotspotNumber = scene.hotspots.reduce((highest, hotspot) => {
    const match = /^Hotspot (\d+)$/.exec(hotspot.name);
    if (!match) {
      return highest;
    }

    return Math.max(highest, Number(match[1]));
  }, 0);

  return highestHotspotNumber + 1;
}

function createHotspot(
  scene: Scene,
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }
): Hotspot {
  const nextHotspotNumber = getNextHotspotNumber(scene);
  const hotspotId = createId("hotspot");
  const hotspotName = `Hotspot ${nextHotspotNumber}`;
  const roundedBounds = roundHotspotBounds(bounds);

  const hotspot: Hotspot = {
    id: hotspotId,
    name: hotspotName,
    ...roundedBounds,
    polygon: createRectangleHotspotPolygon(roundedBounds),
    startMs: 0,
    endMs: 30000,
    timingMode: "sceneDuration",
    conditionMode: "all",
    conditions: [{ type: "always" as const }],
    effects: []
  };

  scene.hotspots.push(hotspot);
  return hotspot;
}

function resolveHotspotBoundsFromCenter(
  centerX: number,
  centerY: number,
  size?: {
    width: number;
    height: number;
  }
) {
  const width = clamp(size?.width ?? DEFAULT_HOTSPOT_WIDTH, MIN_HOTSPOT_SIZE, 1);
  const height = clamp(size?.height ?? DEFAULT_HOTSPOT_HEIGHT, MIN_HOTSPOT_SIZE, 1);
  return roundHotspotBounds({
    x: clamp(centerX - width / 2, 0, 1 - width),
    y: clamp(centerY - height / 2, 0, 1 - height),
    width,
    height
  });
}

function findBestHotspotBounds(
  hotspots: Hotspot[],
  size?: {
    width: number;
    height: number;
  }
) {
  const width = size?.width ?? DEFAULT_HOTSPOT_WIDTH;
  const height = size?.height ?? DEFAULT_HOTSPOT_HEIGHT;
  const occupiedBounds = hotspots.map((hotspot) => resolveHotspotBounds(hotspot));
  let bestCandidate:
    | {
        bounds: {
          x: number;
          y: number;
          width: number;
          height: number;
        };
        score: HotspotPlacementScore;
      }
    | undefined;

  for (const centerX of createHotspotCandidateCenters(width)) {
    for (const centerY of createHotspotCandidateCenters(height)) {
      const bounds = resolveHotspotBoundsFromCenter(centerX, centerY, size);
      const score = scoreHotspotPlacement(bounds, occupiedBounds);

      if (!bestCandidate || compareHotspotPlacementScores(score, bestCandidate.score) < 0) {
        bestCandidate = { bounds, score };
      }
    }
  }

  return bestCandidate?.bounds ?? resolveHotspotBoundsFromCenter(0.5, 0.5, size);
}

function createHotspotCandidateCenters(size: number): number[] {
  const minimum = size / 2;
  const maximum = 1 - size / 2;
  const centers = new Set<number>([minimum, 0.5, maximum]);

  for (let value = minimum; value <= maximum + HOTSPOT_SCORE_EPSILON; value += HOTSPOT_AUTO_PLACEMENT_STEP) {
    centers.add(roundHotspotCoordinate(value));
  }

  return [...centers]
    .filter((value) => value >= minimum - HOTSPOT_SCORE_EPSILON && value <= maximum + HOTSPOT_SCORE_EPSILON)
    .sort((left, right) => left - right);
}

function scoreHotspotPlacement(
  candidate: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  occupiedBounds: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>
): HotspotPlacementScore {
  let overlapArea = 0;
  let paddedOverlapArea = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const occupied of occupiedBounds) {
    overlapArea += getRectangleOverlapArea(candidate, occupied);
    paddedOverlapArea += getRectangleOverlapArea(candidate, expandRectangle(occupied, HOTSPOT_AUTO_PLACEMENT_PADDING));
    nearestDistance = Math.min(nearestDistance, getRectangleDistance(candidate, occupied));
  }

  return {
    overlapArea,
    paddedOverlapArea,
    nearestDistance,
    centerDistance: Math.hypot(candidate.x + candidate.width / 2 - 0.5, candidate.y + candidate.height / 2 - 0.5),
    y: candidate.y,
    x: candidate.x
  };
}

function compareHotspotPlacementScores(left: HotspotPlacementScore, right: HotspotPlacementScore): number {
  return (
    comparePlacementValue(left.overlapArea, right.overlapArea, "lower") ||
    comparePlacementValue(left.paddedOverlapArea, right.paddedOverlapArea, "lower") ||
    comparePlacementValue(left.nearestDistance, right.nearestDistance, "higher") ||
    comparePlacementValue(left.centerDistance, right.centerDistance, "lower") ||
    comparePlacementValue(left.y, right.y, "lower") ||
    comparePlacementValue(left.x, right.x, "lower")
  );
}

function comparePlacementValue(left: number, right: number, preference: "lower" | "higher"): number {
  if (left === right) {
    return 0;
  }

  if (Math.abs(left - right) <= HOTSPOT_SCORE_EPSILON) {
    return 0;
  }

  if (preference === "lower") {
    return left < right ? -1 : 1;
  }

  return left > right ? -1 : 1;
}

function getRectangleOverlapArea(
  left: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  right: {
    x: number;
    y: number;
    width: number;
    height: number;
  }
): number {
  const overlapWidth = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
  const overlapHeight = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);

  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return 0;
  }

  return overlapWidth * overlapHeight;
}

function getRectangleDistance(
  left: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  right: {
    x: number;
    y: number;
    width: number;
    height: number;
  }
): number {
  const horizontalGap = Math.max(0, left.x - (right.x + right.width), right.x - (left.x + left.width));
  const verticalGap = Math.max(0, left.y - (right.y + right.height), right.y - (left.y + left.height));

  return Math.hypot(horizontalGap, verticalGap);
}

function expandRectangle(
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  padding: number
) {
  const nextLeft = clamp(bounds.x - padding, 0, 1);
  const nextTop = clamp(bounds.y - padding, 0, 1);
  const nextRight = clamp(bounds.x + bounds.width + padding, 0, 1);
  const nextBottom = clamp(bounds.y + bounds.height + padding, 0, 1);

  return {
    x: nextLeft,
    y: nextTop,
    width: Math.max(0, nextRight - nextLeft),
    height: Math.max(0, nextBottom - nextTop)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundHotspotBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    x: roundHotspotCoordinate(bounds.x),
    y: roundHotspotCoordinate(bounds.y),
    width: roundHotspotCoordinate(bounds.width),
    height: roundHotspotCoordinate(bounds.height)
  };
}

interface HotspotPlacementScore {
  overlapArea: number;
  paddedOverlapArea: number;
  nearestDistance: number;
  centerDistance: number;
  y: number;
  x: number;
}

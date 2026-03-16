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
import { createRectangleHotspotPolygon } from "@mage2/schema";

export interface AssetReferenceSummary {
  sceneBackgrounds: Array<{
    sceneId: string;
    sceneName: string;
  }>;
  subtitleTracks: Array<{
    trackId: string;
    sceneIds: string[];
    sceneNames: string[];
  }>;
}

export interface RemoveAssetFromProjectResult {
  deleted: boolean;
  blockedReason?: "asset-not-found" | "background-in-use-without-replacement";
  fallbackAssetId?: string;
  referenceSummary: AssetReferenceSummary;
  removedSubtitleTrackIds: string[];
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
  exitSceneReferenceCount: number;
  hotspotTargetReferenceCount: number;
  sceneVisitedConditionCount: number;
  goToSceneEffectCount: number;
  removedSubtitleTrackIds: string[];
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
  removedSubtitleTrackIds: string[];
}

export const STARTER_PLACEHOLDER_ASSET_ID = "asset_placeholder";

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
    const root = asset.sourcePath.replace(/[\\/][^\\/]+$/, "");
    if (root && !nextAssetRoots.includes(root)) {
      nextAssetRoots.push(root);
    }
  }

  project.manifest.assetRoots = nextAssetRoots;
}

export function addAssetRoots(project: ProjectBundle, assets: Asset[]): void {
  for (const asset of assets) {
    const root = asset.sourcePath.replace(/[\\/][^\\/]+$/, "");
    if (root && !project.manifest.assetRoots.includes(root)) {
      project.manifest.assetRoots.push(root);
    }
  }
}

export function collectAssetReferenceSummary(
  project: ProjectBundle,
  assetId: string
): AssetReferenceSummary {
  const sceneBackgrounds: AssetReferenceSummary["sceneBackgrounds"] = [];
  const subtitleTracksById = new Map<string, AssetReferenceSummary["subtitleTracks"][number]>();

  for (const scene of project.scenes.items) {
    if (scene.backgroundAssetId === assetId) {
      sceneBackgrounds.push({
        sceneId: scene.id,
        sceneName: scene.name
      });
    }

    for (const subtitleTrackId of scene.subtitleTrackIds) {
      const track = project.subtitles.items.find(
        (entry) => entry.id === subtitleTrackId && entry.assetId === assetId
      );
      if (!track) {
        continue;
      }

      const existingTrack = subtitleTracksById.get(track.id);
      if (existingTrack) {
        existingTrack.sceneIds.push(scene.id);
        existingTrack.sceneNames.push(scene.name);
        continue;
      }

      subtitleTracksById.set(track.id, {
        trackId: track.id,
        sceneIds: [scene.id],
        sceneNames: [scene.name]
      });
    }
  }

  for (const track of project.subtitles.items) {
    if (track.assetId !== assetId || subtitleTracksById.has(track.id)) {
      continue;
    }

    subtitleTracksById.set(track.id, {
      trackId: track.id,
      sceneIds: [],
      sceneNames: []
    });
  }

  return {
    sceneBackgrounds,
    subtitleTracks: [...subtitleTracksById.values()]
  };
}

export function countAssetReferences(summary: AssetReferenceSummary): number {
  return summary.sceneBackgrounds.length + summary.subtitleTracks.length;
}

export function evaluateAssetDeletion(
  project: ProjectBundle,
  assetId: string
): AssetDeletionEligibility {
  const referenceSummary = collectAssetReferenceSummary(project, assetId);
  const fallbackAssetId = resolveFallbackAssetId(project.assets.assets, assetId);
  const assetExists = project.assets.assets.some((asset) => asset.id === assetId);

  if (!assetExists) {
    return {
      canDelete: false,
      blockedReason: "asset-not-found",
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
      referenceSummary: deletionEligibility.referenceSummary,
      removedSubtitleTrackIds: []
    };
  }
  const { fallbackAssetId, referenceSummary } = deletionEligibility;

  const removedSubtitleTrackIds = referenceSummary.subtitleTracks.map((track) => track.trackId);
  const subtitleTrackIdsToDelete = new Set(removedSubtitleTrackIds);

  project.assets.assets = project.assets.assets.filter((asset) => asset.id !== assetId);

  for (const scene of project.scenes.items) {
    if (scene.backgroundAssetId === assetId && fallbackAssetId) {
      scene.backgroundAssetId = fallbackAssetId;
    }

    if (subtitleTrackIdsToDelete.size > 0) {
      scene.subtitleTrackIds = scene.subtitleTrackIds.filter((trackId) => !subtitleTrackIdsToDelete.has(trackId));
    }
  }

  if (subtitleTrackIdsToDelete.size > 0) {
    project.subtitles.items = project.subtitles.items.filter((track) => !subtitleTrackIdsToDelete.has(track.id));
  }

  synchronizeAssetRoots(project);

  return {
    deleted: true,
    fallbackAssetId,
    referenceSummary,
    removedSubtitleTrackIds
  };
}

export function collectSceneReferenceSummary(project: ProjectBundle, sceneId: string): SceneReferenceSummary {
  const scene = project.scenes.items.find((entry) => entry.id === sceneId);
  const summary: SceneReferenceSummary = {
    isStartScene: project.manifest.startSceneId === sceneId,
    locationReferenceCount: 0,
    exitSceneReferenceCount: 0,
    hotspotTargetReferenceCount: 0,
    sceneVisitedConditionCount: 0,
    goToSceneEffectCount: 0,
    removedSubtitleTrackIds: scene ? resolveSceneSubtitleTrackIdsToDelete(project, scene) : []
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

    summary.exitSceneReferenceCount += candidateScene.exitSceneIds.filter((entry) => entry === sceneId).length;

    for (const hotspot of candidateScene.hotspots) {
      if (hotspot.targetSceneId === sceneId) {
        summary.hotspotTargetReferenceCount += 1;
      }

      summary.sceneVisitedConditionCount += countSceneVisitedConditions(hotspot.conditions, sceneId);
      summary.goToSceneEffectCount += countGoToSceneEffects(hotspot.effects, sceneId);
    }

    summary.goToSceneEffectCount += countGoToSceneEffects(candidateScene.onEnterEffects, sceneId);
    summary.goToSceneEffectCount += countGoToSceneEffects(candidateScene.onExitEffects, sceneId);
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      summary.goToSceneEffectCount += countGoToSceneEffects(node.effects, sceneId);

      for (const choice of node.choices) {
        summary.sceneVisitedConditionCount += countSceneVisitedConditions(choice.conditions, sceneId);
        summary.goToSceneEffectCount += countGoToSceneEffects(choice.effects, sceneId);
      }
    }
  }

  return summary;
}

export function countSceneReferences(summary: SceneReferenceSummary): number {
  return (
    Number(summary.isStartScene) +
    summary.locationReferenceCount +
    summary.exitSceneReferenceCount +
    summary.hotspotTargetReferenceCount +
    summary.sceneVisitedConditionCount +
    summary.goToSceneEffectCount
  );
}

export function removeSceneFromProject(
  project: ProjectBundle,
  sceneId: string,
  strategy: RemoveSceneStrategy
): RemoveSceneFromProjectResult {
  const referenceSummary = collectSceneReferenceSummary(project, sceneId);
  const scene = project.scenes.items.find((entry) => entry.id === sceneId);

  if (!scene) {
    return {
      deleted: false,
      blockedReason: "scene-not-found",
      strategy,
      referenceSummary,
      removedSubtitleTrackIds: []
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
      removedSubtitleTrackIds: []
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
    candidateScene.exitSceneIds = rewriteSceneIdList(candidateScene.exitSceneIds, sceneId, strategy);

    for (const hotspot of candidateScene.hotspots) {
      if (hotspot.targetSceneId === sceneId) {
        hotspot.targetSceneId = strategy.mode === "rewire" ? strategy.replacementSceneId : undefined;
      }

      hotspot.conditions = rewriteSceneConditions(hotspot.conditions, sceneId, strategy);
      hotspot.effects = rewriteSceneEffects(hotspot.effects, sceneId, strategy);
    }

    candidateScene.onEnterEffects = rewriteSceneEffects(candidateScene.onEnterEffects, sceneId, strategy);
    candidateScene.onExitEffects = rewriteSceneEffects(candidateScene.onExitEffects, sceneId, strategy);
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

  const removedSubtitleTrackIds = referenceSummary.removedSubtitleTrackIds;
  if (removedSubtitleTrackIds.length > 0) {
    const removedSubtitleTrackIdSet = new Set(removedSubtitleTrackIds);

    for (const candidateScene of project.scenes.items) {
      candidateScene.subtitleTrackIds = candidateScene.subtitleTrackIds.filter(
        (trackId) => !removedSubtitleTrackIdSet.has(trackId)
      );
    }

    project.subtitles.items = project.subtitles.items.filter((track) => !removedSubtitleTrackIdSet.has(track.id));
  }

  return {
    deleted: true,
    strategy,
    referenceSummary,
    removedSubtitleTrackIds
  };
}

export function ensureString(project: ProjectBundle, textId: string, fallback: string): void {
  if (!(textId in project.strings.values)) {
    project.strings.values[textId] = fallback;
  }
}

export function addLocation(project: ProjectBundle): Location {
  const locationId = createId("location");
  const descriptionTextId = `text.${locationId}.description`;
  const scene = addScene(project, locationId);

  const location: Location = {
    id: locationId,
    name: `Location ${project.locations.items.length + 1}`,
    descriptionTextId,
    x: 180 + project.locations.items.length * 120,
    y: 160 + (project.locations.items.length % 2) * 120,
    sceneIds: [scene.id]
  };

  ensureString(project, descriptionTextId, `${location.name} description`);
  project.locations.items.push(location);
  return location;
}

export function addScene(project: ProjectBundle, locationId?: string): Scene {
  const sceneId = createId("scene");
  const overlayTextId = `text.${sceneId}.overlay`;
  const scene: Scene = {
    id: sceneId,
    locationId: locationId ?? project.locations.items[0]?.id ?? "location_intro",
    name: `Scene ${project.scenes.items.length + 1}`,
    backgroundAssetId: project.assets.assets[0]?.id ?? "asset_placeholder",
    backgroundVideoLoop: false,
    hotspots: [],
    exitSceneIds: [],
    subtitleTrackIds: [],
    dialogueTreeIds: [],
    overlayTextId,
    onEnterEffects: [],
    onExitEffects: []
  };

  ensureString(project, overlayTextId, `${scene.name} overlay`);
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
  const textId = `text.${nodeId}.line`;
  const choiceTextId = `text.${nodeId}.choice`;

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
            id: createId("choice"),
            textId: choiceTextId,
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
  const textId = `text.${itemId}.name`;
  const descriptionTextId = `text.${itemId}.description`;
  const item: InventoryItem = {
    id: itemId,
    name: `Item ${project.inventory.items.length + 1}`,
    textId,
    descriptionTextId
  };

  ensureString(project, textId, item.name);
  ensureString(project, descriptionTextId, `${item.name} description`);
  project.inventory.items.push(item);
  return item;
}

export function addHotspot(project: ProjectBundle, sceneId: string, x: number, y: number): Hotspot | undefined {
  const scene = project.scenes.items.find((entry) => entry.id === sceneId);
  if (!scene) {
    return undefined;
  }

  const nextHotspotNumber = getNextHotspotNumber(scene);
  const hotspotId = createId("hotspot");
  const textId = `text.${hotspotId}.label`;
  const hotspotName = `Hotspot ${nextHotspotNumber}`;
  const bounds = {
    x: clamp(x - 0.08, 0, 0.9),
    y: clamp(y - 0.08, 0, 0.9),
    width: 0.16,
    height: 0.16
  };
  ensureString(project, textId, hotspotName);
  const hotspot: Hotspot = {
    id: hotspotId,
    name: hotspotName,
    labelTextId: textId,
    ...bounds,
    polygon: createRectangleHotspotPolygon(bounds),
    startMs: 0,
    endMs: 30000,
    requiredItemIds: [],
    conditions: [{ type: "always" as const }],
    effects: []
  };

  scene.hotspots.push(hotspot);
  return hotspot;
}

function resolveFallbackAssetId(assets: Asset[], deletedAssetId: string): string | undefined {
  return (
    assets.find((asset) => asset.id !== deletedAssetId && asset.id !== STARTER_PLACEHOLDER_ASSET_ID)?.id ??
    assets.find((asset) => asset.id !== deletedAssetId)?.id
  );
}

function resolveSceneSubtitleTrackIdsToDelete(project: ProjectBundle, scene: Scene): string[] {
  const referencedSubtitleTrackIds = new Set(
    project.scenes.items
      .filter((entry) => entry.id !== scene.id)
      .flatMap((entry) => entry.subtitleTrackIds)
  );

  return scene.subtitleTrackIds.filter((trackId) => !referencedSubtitleTrackIds.has(trackId));
}

function countSceneVisitedConditions(conditions: Condition[], sceneId: string): number {
  return conditions.filter((condition) => condition.type === "sceneVisited" && condition.sceneId === sceneId).length;
}

function countGoToSceneEffects(effects: Effect[], sceneId: string): number {
  return effects.filter((effect) => effect.type === "goToScene" && effect.sceneId === sceneId).length;
}

function rewriteSceneIdList(sceneIds: string[], deletedSceneId: string, strategy: RemoveSceneStrategy): string[] {
  if (strategy.mode === "cleanup") {
    return sceneIds.filter((sceneId) => sceneId !== deletedSceneId);
  }

  return [...new Set(sceneIds.map((sceneId) => (sceneId === deletedSceneId ? strategy.replacementSceneId : sceneId)))];
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
  return effects.flatMap((effect) => {
    if (effect.type !== "goToScene" || effect.sceneId !== deletedSceneId) {
      return [effect];
    }

    return strategy.mode === "cleanup"
      ? []
      : [
          {
            ...effect,
            sceneId: strategy.replacementSceneId
          }
        ];
  });
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

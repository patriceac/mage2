import type {
  Asset,
  ClipSegment,
  DialogueTree,
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
  clipSegments: Array<{
    sceneId: string;
    sceneName: string;
    segmentId: string;
    segmentName: string;
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
  removedSegmentIds: string[];
  removedSubtitleTrackIds: string[];
}

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
  const clipSegments: AssetReferenceSummary["clipSegments"] = [];
  const subtitleTracksById = new Map<string, AssetReferenceSummary["subtitleTracks"][number]>();

  for (const scene of project.scenes.items) {
    if (scene.backgroundAssetId === assetId) {
      sceneBackgrounds.push({
        sceneId: scene.id,
        sceneName: scene.name
      });
    }

    for (const segment of scene.clipSegments) {
      if (segment.assetId === assetId) {
        clipSegments.push({
          sceneId: scene.id,
          sceneName: scene.name,
          segmentId: segment.id,
          segmentName: segment.name
        });
      }
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
    clipSegments,
    subtitleTracks: [...subtitleTracksById.values()]
  };
}

export function countAssetReferences(summary: AssetReferenceSummary): number {
  return summary.sceneBackgrounds.length + summary.clipSegments.length + summary.subtitleTracks.length;
}

export function removeAssetFromProject(
  project: ProjectBundle,
  assetId: string
): RemoveAssetFromProjectResult {
  const referenceSummary = collectAssetReferenceSummary(project, assetId);
  const assetExists = project.assets.assets.some((asset) => asset.id === assetId);
  const fallbackAssetId = resolveFallbackAssetId(project.assets.assets, assetId);

  if (!assetExists) {
    return {
      deleted: false,
      blockedReason: "asset-not-found",
      fallbackAssetId,
      referenceSummary,
      removedSegmentIds: [],
      removedSubtitleTrackIds: []
    };
  }

  if (referenceSummary.sceneBackgrounds.length > 0 && !fallbackAssetId) {
    return {
      deleted: false,
      blockedReason: "background-in-use-without-replacement",
      referenceSummary,
      removedSegmentIds: [],
      removedSubtitleTrackIds: []
    };
  }

  const removedSegmentIds: string[] = [];
  const removedSubtitleTrackIds = referenceSummary.subtitleTracks.map((track) => track.trackId);
  const subtitleTrackIdsToDelete = new Set(removedSubtitleTrackIds);

  project.assets.assets = project.assets.assets.filter((asset) => asset.id !== assetId);

  for (const scene of project.scenes.items) {
    if (scene.backgroundAssetId === assetId && fallbackAssetId) {
      scene.backgroundAssetId = fallbackAssetId;
    }

    const removedSceneSegmentIds = scene.clipSegments
      .filter((segment) => segment.assetId === assetId)
      .map((segment) => segment.id);
    if (removedSceneSegmentIds.length > 0) {
      removedSegmentIds.push(...removedSceneSegmentIds);
      scene.clipSegments = scene.clipSegments.filter((segment) => segment.assetId !== assetId);
    }

    if (scene.defaultSegmentId && !scene.clipSegments.some((segment) => segment.id === scene.defaultSegmentId)) {
      scene.defaultSegmentId = scene.clipSegments[0]?.id;
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
    removedSegmentIds,
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
    clipSegments: [],
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

export function addClipSegment(project: ProjectBundle, sceneId: string): ClipSegment | undefined {
  const scene = project.scenes.items.find((entry) => entry.id === sceneId);
  if (!scene) {
    return undefined;
  }

  const asset = project.assets.assets.find((entry) => entry.id === scene.backgroundAssetId);
  const segment: ClipSegment = {
    id: createId("segment"),
    name: `Segment ${scene.clipSegments.length + 1}`,
    assetId: scene.backgroundAssetId,
    startMs: 0,
    endMs: asset?.durationMs ?? 30000,
    loop: false
  };

  scene.clipSegments.push(segment);
  if (!scene.defaultSegmentId) {
    scene.defaultSegmentId = segment.id;
  }
  return segment;
}

export function addHotspot(project: ProjectBundle, sceneId: string, x: number, y: number) {
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
  const hotspot = {
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
    assets.find((asset) => asset.id !== deletedAssetId && asset.id !== "asset_placeholder")?.id ??
    assets.find((asset) => asset.id !== deletedAssetId)?.id
  );
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

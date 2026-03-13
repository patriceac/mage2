import type {
  Asset,
  ClipSegment,
  DialogueTree,
  InventoryItem,
  Location,
  ProjectBundle,
  Scene
} from "@mage2/schema";

export function cloneProject(project: ProjectBundle): ProjectBundle {
  return structuredClone(project);
}

export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function addAssetRoots(project: ProjectBundle, assets: Asset[]): void {
  for (const asset of assets) {
    const root = asset.sourcePath.replace(/[\\/][^\\/]+$/, "");
    if (root && !project.manifest.assetRoots.includes(root)) {
      project.manifest.assetRoots.push(root);
    }
  }
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

  const hotspotId = createId("hotspot");
  const textId = `text.${hotspotId}.label`;
  ensureString(project, textId, "Inspect");
  const hotspot = {
    id: hotspotId,
    name: `Hotspot ${scene.hotspots.length + 1}`,
    labelTextId: textId,
    x: clamp(x - 0.08, 0, 0.9),
    y: clamp(y - 0.08, 0, 0.9),
    width: 0.16,
    height: 0.16,
    startMs: 0,
    endMs: 30000,
    requiredItemIds: [],
    conditions: [{ type: "always" as const }],
    effects: []
  };

  scene.hotspots.push(hotspot);
  return hotspot;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

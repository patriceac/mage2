import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, resolveHotspotBounds, type Asset, type SubtitleTrack } from "@mage2/schema";
import {
  STARTER_PLACEHOLDER_ASSET_ID,
  addLocation,
  addScene,
  addInventoryItem,
  addAssetRoots,
  addHotspot,
  addHotspotAtBestAvailablePosition,
  collectSceneReferenceSummary,
  countSceneReferences,
  collectAssetReferenceSummary,
  createSubtitleCue,
  createProjectRevision,
  removeHotspotFromProject,
  removeAssetFromProject,
  removeSceneFromProject
} from "./project-helpers";

function getDefaultStrings(project: ReturnType<typeof createDefaultProjectBundle>) {
  return project.strings.byLocale[project.manifest.defaultLanguage];
}

describe("createProjectRevision", () => {
  it("stays stable for unchanged project data and changes after edits", () => {
    const project = createDefaultProjectBundle("Revision tracking");
    const initialRevision = createProjectRevision(project);
    const unchangedRevision = createProjectRevision(structuredClone(project));

    project.manifest.projectName = "Revision tracking updated";
    const updatedRevision = createProjectRevision(project);

    expect(unchangedRevision).toBe(initialRevision);
    expect(updatedRevision).not.toBe(initialRevision);
  });
});

describe("addLocation and addScene", () => {
  it("does not seed localization-backed location descriptions or scene overlays for new content", () => {
    const project = createDefaultProjectBundle("New content");

    const location = addLocation(project);
    const scene = addScene(project, project.locations.items[0]!.id);

    expect(location).not.toHaveProperty("descriptionTextId");
    expect(scene).not.toHaveProperty("overlayTextId");
    expect(getDefaultStrings(project)[`text.${location.id}.description`]).toBeUndefined();
    expect(getDefaultStrings(project)[`text.${scene.id}.overlay`]).toBeUndefined();
  });
});

describe("createSubtitleCue", () => {
  it("creates string-backed subtitle cues with generated text ids", () => {
    const project = createDefaultProjectBundle("Subtitle cue creation");

    const cue = createSubtitleCue(project, 250, 1750, "Localized subtitle");

    expect(cue).toMatchObject({
      startMs: 250,
      endMs: 1750,
      textId: `text.${cue.id}.subtitle`
    });
    expect(getDefaultStrings(project)[cue.textId]).toBe("Localized subtitle");
  });
});

describe("addHotspot", () => {
  it("keeps hotspot numbers increasing after earlier hotspots are deleted", () => {
    const project = createDefaultProjectBundle("Hotspot numbering");
    const scene = project.scenes.items[0];
    scene.hotspots = [];

    addHotspot(project, scene.id, 0.2, 0.2);
    addHotspot(project, scene.id, 0.4, 0.4);
    addHotspot(project, scene.id, 0.6, 0.6);

    expect(scene.hotspots.map((hotspot) => hotspot.name)).toEqual([
      "Hotspot 1",
      "Hotspot 2",
      "Hotspot 3"
    ]);

    scene.hotspots.splice(0, 1);

    const hotspot = addHotspot(project, scene.id, 0.8, 0.8);

    expect(hotspot?.name).toBe("Hotspot 4");
    expect(hotspot).not.toHaveProperty("labelTextId");
    expect(getDefaultStrings(project)[`text.${hotspot!.id}.label`]).toBeUndefined();
    expect(
      hotspot?.polygon?.map((point) => ({
        x: Number(point.x.toFixed(2)),
        y: Number(point.y.toFixed(2))
      }))
    ).toEqual([
      { x: 0.72, y: 0.72 },
      { x: 0.88, y: 0.72 },
      { x: 0.88, y: 0.88 },
      { x: 0.72, y: 0.88 }
    ]);
    expect(scene.hotspots.map((entry) => entry.name)).toEqual([
      "Hotspot 2",
      "Hotspot 3",
      "Hotspot 4"
    ]);
  });

  it("keeps hotspots inside the scene when they are created near an edge", () => {
    const project = createDefaultProjectBundle("Hotspot edge placement");
    const scene = project.scenes.items[0];
    scene.hotspots = [];

    const hotspot = addHotspot(project, scene.id, 0.99, 0.99);

    expect(hotspot?.x).toBeCloseTo(0.84);
    expect(hotspot?.y).toBeCloseTo(0.84);
    expect((hotspot?.x ?? 0) + (hotspot?.width ?? 0)).toBeLessThanOrEqual(1);
    expect((hotspot?.y ?? 0) + (hotspot?.height ?? 0)).toBeLessThanOrEqual(1);
  });

  it("rounds created hotspot bounds to two decimals", () => {
    const project = createDefaultProjectBundle("Hotspot precision");
    const scene = project.scenes.items[0];
    scene.hotspots = [];

    const hotspot = addHotspot(project, scene.id, 0.8061, 0.4906);

    expect(hotspot).toMatchObject({
      x: 0.73,
      y: 0.41,
      width: 0.16,
      height: 0.16,
      polygon: [
        { x: 0.73, y: 0.41 },
        { x: 0.89, y: 0.41 },
        { x: 0.89, y: 0.57 },
        { x: 0.73, y: 0.57 }
      ]
    });
  });
});

describe("addHotspotAtBestAvailablePosition", () => {
  it("starts new scenes with a centered hotspot placement", () => {
    const project = createDefaultProjectBundle("Hotspot auto placement");
    const scene = project.scenes.items[0];
    scene.hotspots = [];

    const hotspot = addHotspotAtBestAvailablePosition(project, scene.id);

    expect(hotspot?.x).toBeCloseTo(0.42);
    expect(hotspot?.y).toBeCloseTo(0.42);
  });

  it("avoids overlapping existing hotspots when open space is available", () => {
    const project = createDefaultProjectBundle("Hotspot overlap avoidance");
    const scene = project.scenes.items[0];
    scene.hotspots = [];

    const existing = addHotspot(project, scene.id, 0.5, 0.5)!;
    const created = addHotspotAtBestAvailablePosition(project, scene.id)!;

    expect(getOverlapArea(resolveHotspotBounds(existing), resolveHotspotBounds(created))).toBe(0);
  });
});

describe("removeHotspotFromProject", () => {
  it("prunes owned generated hotspot text when it becomes unused", () => {
    const project = createDefaultProjectBundle("Hotspot text pruning");
    const scene = project.scenes.items[0];
    scene.hotspots = [];

    const hotspot = addHotspot(project, scene.id, 0.25, 0.25)!;
    const legacyLabelTextId = `text.${hotspot.id}.label`;
    getDefaultStrings(project)[legacyLabelTextId] = hotspot.name;
    hotspot.commentTextId = `text.${hotspot.id}.comment`;
    getDefaultStrings(project)[hotspot.commentTextId] = "Owned comment";

    const result = removeHotspotFromProject(project, scene.id, hotspot.id);

    expect(result).toMatchObject({
      deleted: true,
      removedTextIds: [legacyLabelTextId, hotspot.commentTextId]
    });
    expect(getDefaultStrings(project)[legacyLabelTextId]).toBeUndefined();
    expect(getDefaultStrings(project)[hotspot.commentTextId]).toBeUndefined();
  });

  it("preserves shared and manual hotspot text ids", () => {
    const project = createDefaultProjectBundle("Shared hotspot text");
    const scene = project.scenes.items[0];
    scene.hotspots = [];

    const hotspot = addHotspot(project, scene.id, 0.4, 0.4)!;
    const sharedLabelTextId = `text.${hotspot.id}.label`;
    getDefaultStrings(project)[sharedLabelTextId] = hotspot.name;
    const item = addInventoryItem(project);
    delete getDefaultStrings(project)[item.textId];
    item.textId = sharedLabelTextId;

    hotspot.commentTextId = "text.manual.hotspot.comment";
    getDefaultStrings(project)[hotspot.commentTextId] = "Manual comment";

    const result = removeHotspotFromProject(project, scene.id, hotspot.id);

    expect(result).toMatchObject({
      deleted: true,
      removedTextIds: []
    });
    expect(getDefaultStrings(project)[sharedLabelTextId]).toBe("Hotspot 1");
    expect(getDefaultStrings(project)[hotspot.commentTextId]).toBe("Manual comment");
  });
});

describe("collectAssetReferenceSummary", () => {
  it("reports scene backgrounds and ignores subtitle tracks", () => {
    const project = createDefaultProjectBundle("Asset usage");
    const scene = project.scenes.items[0];
    const primaryAsset = createAsset("asset_primary", "primary.png", "D:\\media\\primary.png");
    const secondaryAsset = createAsset("asset_secondary", "secondary.png", "D:\\other\\secondary.png");

    project.assets.assets = [primaryAsset, secondaryAsset];
    scene.backgroundAssetId = primaryAsset.id;
    scene.subtitleTracks = [createSubtitleTrack("subtitle_intro")];

    const summary = collectAssetReferenceSummary(project, primaryAsset.id);

    expect(summary).toEqual({
      sceneBackgrounds: [{ sceneId: scene.id, sceneName: scene.name }]
    });
  });
});

describe("removeAssetFromProject", () => {
  it("reassigns scene backgrounds without touching scene-owned subtitle tracks", () => {
    const project = createDefaultProjectBundle("Asset removal");
    const scene = project.scenes.items[0];
    const primaryAsset = createAsset("asset_primary", "primary.png", "D:\\media\\primary.png");
    const secondaryAsset = createAsset("asset_secondary", "secondary.png", "D:\\other\\secondary.png");

    project.assets.assets = [primaryAsset, secondaryAsset];
    addAssetRoots(project, project.assets.assets);
    scene.backgroundAssetId = primaryAsset.id;
    scene.subtitleTracks = [createSubtitleTrack("subtitle_intro")];

    const result = removeAssetFromProject(project, primaryAsset.id);

    expect(result.deleted).toBe(true);
    expect(result.fallbackAssetId).toBe(secondaryAsset.id);
    expect(result.removedSubtitleTrackIds).toEqual([]);
    expect(project.assets.assets.map((asset) => asset.id)).toEqual([secondaryAsset.id]);
    expect(project.manifest.assetRoots).toEqual(["D:\\other"]);
    expect(scene.backgroundAssetId).toBe(secondaryAsset.id);
    expect(scene.subtitleTracks).toEqual([createSubtitleTrack("subtitle_intro")]);
  });

  it("blocks deletion when the asset is still a scene background and no replacement exists", () => {
    const project = createDefaultProjectBundle("Asset removal blocked");
    const scene = project.scenes.items[0];
    const primaryAsset = createAsset("asset_primary", "primary.png", "D:\\media\\primary.png");

    project.assets.assets = [primaryAsset];
    addAssetRoots(project, project.assets.assets);
    scene.backgroundAssetId = primaryAsset.id;

    const result = removeAssetFromProject(project, primaryAsset.id);

    expect(result).toMatchObject({
      deleted: false,
      blockedReason: "background-in-use-without-replacement"
    });
    expect(project.assets.assets.map((asset) => asset.id)).toEqual([primaryAsset.id]);
    expect(scene.backgroundAssetId).toBe(primaryAsset.id);
  });

  it("allows deletion of the starter placeholder asset when another asset can replace it", () => {
    const project = createDefaultProjectBundle("Starter asset replacement");
    const scene = project.scenes.items[0];
    project.assets.assets = [
      createAsset(STARTER_PLACEHOLDER_ASSET_ID, "starter-scene.svg", "D:\\project\\assets\\starter-scene.svg"),
      createAsset("asset_replacement", "replacement.png", "D:\\project\\assets\\replacement.png")
    ];
    addAssetRoots(project, project.assets.assets);
    scene.backgroundAssetId = STARTER_PLACEHOLDER_ASSET_ID;

    const result = removeAssetFromProject(project, STARTER_PLACEHOLDER_ASSET_ID);

    expect(result.deleted).toBe(true);
    expect(result.fallbackAssetId).toBe("asset_replacement");
    expect(project.assets.assets.map((asset) => asset.id)).toEqual(["asset_replacement"]);
    expect(scene.backgroundAssetId).toBe("asset_replacement");
  });
});

describe("removeSceneFromProject", () => {
  it("cleans scene references and removes subtitle tracks owned by the deleted scene", () => {
    const project = createDefaultProjectBundle("Scene cleanup");
    const deletedScene = project.scenes.items[0];
    deletedScene.name = "Deleted Scene";
    deletedScene.subtitleTracks = [
      createSubtitleTrack("subtitle_deleted"),
      createSubtitleTrack("subtitle_deleted_two")
    ];

    const sourceScene = addScene(project, deletedScene.locationId);
    sourceScene.name = "Source Scene";
    sourceScene.subtitleTracks = [createSubtitleTrack("subtitle_source")];
    const hotspot = addHotspot(project, sourceScene.id, 0.25, 0.25)!;

    hotspot.targetSceneId = deletedScene.id;
    hotspot.conditions = [
      { type: "always" },
      { type: "sceneVisited", sceneId: deletedScene.id }
    ];
    hotspot.effects = [
      { type: "setFlag", flag: "opened", value: true },
      { type: "goToScene", sceneId: deletedScene.id }
    ];
    sourceScene.onEnterEffects = [
      { type: "goToScene", sceneId: deletedScene.id },
      { type: "setFlag", flag: "entered", value: true }
    ];
    sourceScene.onExitEffects = [
      { type: "goToScene", sceneId: deletedScene.id },
      { type: "setFlag", flag: "exited", value: true }
    ];

    project.dialogues.items = [
      {
        id: "dialogue_cleanup",
        name: "Cleanup Dialogue",
        startNodeId: "node_cleanup_start",
        nodes: [
          {
            id: "node_cleanup_start",
            speaker: "Guide",
            textId: "text.node_cleanup_start.line",
            nextNodeId: "node_cleanup_end",
            effects: [{ type: "goToScene", sceneId: deletedScene.id }],
            choices: [
              {
                id: "choice_cleanup",
                textId: "text.choice_cleanup",
                nextNodeId: "node_cleanup_end",
                conditions: [{ type: "sceneVisited", sceneId: deletedScene.id }],
                effects: [{ type: "goToScene", sceneId: deletedScene.id }]
              }
            ]
          },
          {
            id: "node_cleanup_end",
            speaker: "Guide",
            textId: "text.node_cleanup_end.line",
            choices: [],
            effects: []
          }
        ]
      }
    ];

    const summary = collectSceneReferenceSummary(project, deletedScene.id);

    expect(summary).toMatchObject({
      isStartScene: true,
      locationReferenceCount: 1,
      hotspotTargetReferenceCount: 1,
      sceneVisitedConditionCount: 2,
      goToSceneEffectCount: 5,
      removedSubtitleTrackIds: ["subtitle_deleted", "subtitle_deleted_two"]
    });
    expect(countSceneReferences(summary)).toBe(10);

    const result = removeSceneFromProject(project, deletedScene.id, { mode: "cleanup" });

    expect(result.deleted).toBe(true);
    expect(result.removedSubtitleTrackIds).toEqual(["subtitle_deleted", "subtitle_deleted_two"]);
    expect(result.removedTextIds).toEqual([]);
    expect(project.scenes.items.map((scene) => scene.id)).toEqual([sourceScene.id]);
    expect(project.locations.items[0].sceneIds).toEqual([sourceScene.id]);
    expect(project.manifest.startSceneId).toBe(deletedScene.id);
    expect(project.manifest.startLocationId).toBe(deletedScene.locationId);
    expect(sourceScene.onEnterEffects).toEqual([{ type: "setFlag", flag: "entered", value: true }]);
    expect(sourceScene.onExitEffects).toEqual([{ type: "setFlag", flag: "exited", value: true }]);
    expect(sourceScene.hotspots[0].targetSceneId).toBeUndefined();
    expect(sourceScene.hotspots[0].conditions).toEqual([{ type: "always" }]);
    expect(sourceScene.hotspots[0].effects).toEqual([{ type: "setFlag", flag: "opened", value: true }]);
    expect(project.dialogues.items[0].nodes[0].effects).toEqual([]);
    expect(project.dialogues.items[0].nodes[0].choices[0].conditions).toEqual([]);
    expect(project.dialogues.items[0].nodes[0].choices[0].effects).toEqual([]);
    expect(sourceScene.subtitleTracks.map((track) => track.id)).toEqual(["subtitle_source"]);
  });

  it("rewires scene references and updates the start location when replacing the deleted scene", () => {
    const project = createDefaultProjectBundle("Scene rewire");
    const deletedScene = project.scenes.items[0];
    deletedScene.name = "Deleted Scene";
    deletedScene.subtitleTracks = [createSubtitleTrack("subtitle_deleted")];

    const sourceScene = addScene(project, deletedScene.locationId);
    sourceScene.name = "Source Scene";
    const replacementLocation = addLocation(project);
    replacementLocation.name = "Replacement Location";
    const replacementScene = project.scenes.items.find((scene) => scene.id === replacementLocation.sceneIds[0])!;
    replacementScene.name = "Replacement Scene";
    const hotspot = addHotspot(project, sourceScene.id, 0.35, 0.35)!;

    project.manifest.startSceneId = deletedScene.id;
    project.manifest.startLocationId = deletedScene.locationId;

    hotspot.targetSceneId = deletedScene.id;
    hotspot.conditions = [{ type: "sceneVisited", sceneId: deletedScene.id }];
    hotspot.effects = [{ type: "goToScene", sceneId: deletedScene.id }];
    sourceScene.onEnterEffects = [{ type: "goToScene", sceneId: deletedScene.id }];
    sourceScene.onExitEffects = [{ type: "goToScene", sceneId: deletedScene.id }];

    project.dialogues.items = [
      {
        id: "dialogue_rewire",
        name: "Rewire Dialogue",
        startNodeId: "node_rewire_start",
        nodes: [
          {
            id: "node_rewire_start",
            speaker: "Guide",
            textId: "text.node_rewire_start.line",
            nextNodeId: "node_rewire_end",
            effects: [{ type: "goToScene", sceneId: deletedScene.id }],
            choices: [
              {
                id: "choice_rewire",
                textId: "text.choice_rewire",
                nextNodeId: "node_rewire_end",
                conditions: [{ type: "sceneVisited", sceneId: deletedScene.id }],
                effects: [{ type: "goToScene", sceneId: deletedScene.id }]
              }
            ]
          },
          {
            id: "node_rewire_end",
            speaker: "Guide",
            textId: "text.node_rewire_end.line",
            choices: [],
            effects: []
          }
        ]
      }
    ];

    const result = removeSceneFromProject(project, deletedScene.id, {
      mode: "rewire",
      replacementSceneId: replacementScene.id
    });

    expect(result.deleted).toBe(true);
    expect(result.removedSubtitleTrackIds).toEqual(["subtitle_deleted"]);
    expect(result.removedTextIds).toEqual([]);
    expect(project.manifest.startSceneId).toBe(replacementScene.id);
    expect(project.manifest.startLocationId).toBe(replacementScene.locationId);
    expect(project.locations.items.find((location) => location.id === deletedScene.locationId)?.sceneIds).toEqual([sourceScene.id]);
    expect(project.locations.items.find((location) => location.id === replacementScene.locationId)?.sceneIds).toEqual([
      replacementScene.id
    ]);
    expect(sourceScene.onEnterEffects).toEqual([{ type: "goToScene", sceneId: replacementScene.id }]);
    expect(sourceScene.onExitEffects).toEqual([{ type: "goToScene", sceneId: replacementScene.id }]);
    expect(sourceScene.hotspots[0].targetSceneId).toBe(replacementScene.id);
    expect(sourceScene.hotspots[0].conditions).toEqual([{ type: "sceneVisited", sceneId: replacementScene.id }]);
    expect(sourceScene.hotspots[0].effects).toEqual([{ type: "goToScene", sceneId: replacementScene.id }]);
    expect(project.dialogues.items[0].nodes[0].effects).toEqual([{ type: "goToScene", sceneId: replacementScene.id }]);
    expect(project.dialogues.items[0].nodes[0].choices[0].conditions).toEqual([
      { type: "sceneVisited", sceneId: replacementScene.id }
    ]);
    expect(project.dialogues.items[0].nodes[0].choices[0].effects).toEqual([
      { type: "goToScene", sceneId: replacementScene.id }
    ]);
  });

  it("prunes generated scene-owned text while preserving shared and manual text ids", () => {
    const project = createDefaultProjectBundle("Scene text pruning");
    const deletedScene = addScene(project, project.locations.items[0].id);
    deletedScene.hotspots = [];
    const legacyOverlayTextId = `text.${deletedScene.id}.overlay`;
    getDefaultStrings(project)[legacyOverlayTextId] = "Owned overlay";
    const subtitleCue = createSubtitleCue(project, 0, 1000, "Owned subtitle");
    deletedScene.subtitleTracks = [{ id: "subtitle_deleted", cues: [subtitleCue] }];

    const prunedHotspot = addHotspot(project, deletedScene.id, 0.2, 0.2)!;
    const prunedLabelTextId = `text.${prunedHotspot.id}.label`;
    getDefaultStrings(project)[prunedLabelTextId] = prunedHotspot.name;
    prunedHotspot.commentTextId = `text.${prunedHotspot.id}.comment`;
    getDefaultStrings(project)[prunedHotspot.commentTextId] = "Owned comment";

    const preservedHotspot = addHotspot(project, deletedScene.id, 0.5, 0.5)!;
    const sharedLabelTextId = `text.${preservedHotspot.id}.label`;
    getDefaultStrings(project)[sharedLabelTextId] = preservedHotspot.name;
    const item = addInventoryItem(project);
    delete getDefaultStrings(project)[item.textId];
    item.textId = sharedLabelTextId;

    preservedHotspot.commentTextId = "text.manual.scene.comment";
    getDefaultStrings(project)[preservedHotspot.commentTextId] = "Manual scene comment";

    const result = removeSceneFromProject(project, deletedScene.id, { mode: "cleanup" });

    expect(result.deleted).toBe(true);
    expect(result.removedTextIds).toEqual(
      expect.arrayContaining([legacyOverlayTextId, subtitleCue.textId, prunedLabelTextId, prunedHotspot.commentTextId!])
    );
    expect(result.removedTextIds).not.toContain(sharedLabelTextId);
    expect(result.removedTextIds).not.toContain(preservedHotspot.commentTextId);
    expect(getDefaultStrings(project)[legacyOverlayTextId]).toBeUndefined();
    expect(getDefaultStrings(project)[subtitleCue.textId]).toBeUndefined();
    expect(getDefaultStrings(project)[prunedLabelTextId]).toBeUndefined();
    expect(getDefaultStrings(project)[prunedHotspot.commentTextId!]).toBeUndefined();
    expect(getDefaultStrings(project)[sharedLabelTextId]).toBe("Hotspot 2");
    expect(getDefaultStrings(project)[preservedHotspot.commentTextId]).toBe("Manual scene comment");
  });
});

function createAsset(id: string, name: string, sourcePath: string): Asset {
  return {
    id,
    kind: "image",
    name,
    variants: {
      en: {
        sourcePath,
        importedAt: "2026-03-14T00:00:00.000Z",
        width: 1280,
        height: 720
      }
    }
  };
}

function createSubtitleTrack(id: string): SubtitleTrack {
  return {
    id,
    cues: [
      {
        id: `${id}_cue`,
        startMs: 0,
        endMs: 1000,
        textId: `text.${id}_cue.subtitle`
      }
    ]
  };
}

function getOverlapArea(
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

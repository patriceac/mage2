import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, type Asset } from "@mage2/schema";
import {
  STARTER_PLACEHOLDER_ASSET_ID,
  addLocation,
  addScene,
  addAssetRoots,
  addHotspot,
  collectSceneReferenceSummary,
  countSceneReferences,
  collectAssetReferenceSummary,
  createProjectRevision,
  removeAssetFromProject,
  removeSceneFromProject
} from "./project-helpers";

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
    expect(project.strings.values[hotspot!.labelTextId]).toBe("Hotspot 4");
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
});

describe("collectAssetReferenceSummary", () => {
  it("reports scene backgrounds and subtitle tracks that use an asset", () => {
    const project = createDefaultProjectBundle("Asset usage");
    const scene = project.scenes.items[0];
    const primaryAsset = createAsset("asset_primary", "primary.png", "D:\\media\\primary.png");
    const secondaryAsset = createAsset("asset_secondary", "secondary.png", "D:\\other\\secondary.png");

    project.assets.assets = [primaryAsset, secondaryAsset];
    scene.backgroundAssetId = primaryAsset.id;
    scene.subtitleTrackIds = ["subtitle_intro"];
    project.subtitles.items = [
      {
        id: "subtitle_intro",
        assetId: primaryAsset.id,
        cues: []
      }
    ];

    const summary = collectAssetReferenceSummary(project, primaryAsset.id);

    expect(summary).toEqual({
      sceneBackgrounds: [{ sceneId: scene.id, sceneName: scene.name }],
      subtitleTracks: [
        {
          trackId: "subtitle_intro",
          sceneIds: [scene.id],
          sceneNames: [scene.name]
        }
      ]
    });
  });
});

describe("removeAssetFromProject", () => {
  it("reassigns scene backgrounds and removes dependent subtitle tracks", () => {
    const project = createDefaultProjectBundle("Asset removal");
    const scene = project.scenes.items[0];
    const primaryAsset = createAsset("asset_primary", "primary.png", "D:\\media\\primary.png");
    const secondaryAsset = createAsset("asset_secondary", "secondary.png", "D:\\other\\secondary.png");

    project.assets.assets = [primaryAsset, secondaryAsset];
    addAssetRoots(project, project.assets.assets);
    scene.backgroundAssetId = primaryAsset.id;
    scene.subtitleTrackIds = ["subtitle_intro"];
    project.subtitles.items = [
      {
        id: "subtitle_intro",
        assetId: primaryAsset.id,
        cues: []
      }
    ];

    const result = removeAssetFromProject(project, primaryAsset.id);

    expect(result.deleted).toBe(true);
    expect(result.fallbackAssetId).toBe(secondaryAsset.id);
    expect(result.removedSubtitleTrackIds).toEqual(["subtitle_intro"]);
    expect(project.assets.assets.map((asset) => asset.id)).toEqual([secondaryAsset.id]);
    expect(project.manifest.assetRoots).toEqual(["D:\\other"]);
    expect(scene.backgroundAssetId).toBe(secondaryAsset.id);
    expect(scene.subtitleTrackIds).toEqual([]);
    expect(project.subtitles.items).toEqual([]);
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
  it("cleans scene references while leaving the start scene invalid when requested", () => {
    const project = createDefaultProjectBundle("Scene cleanup");
    const deletedScene = project.scenes.items[0];
    deletedScene.name = "Deleted Scene";

    const sourceScene = addScene(project, deletedScene.locationId);
    sourceScene.name = "Source Scene";
    const hotspot = addHotspot(project, sourceScene.id, 0.25, 0.25)!;

    sourceScene.exitSceneIds = [deletedScene.id];
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

    deletedScene.subtitleTrackIds = ["subtitle_deleted", "subtitle_shared"];
    sourceScene.subtitleTrackIds = ["subtitle_shared"];
    project.subtitles.items = [
      {
        id: "subtitle_deleted",
        assetId: deletedScene.backgroundAssetId,
        cues: []
      },
      {
        id: "subtitle_shared",
        assetId: deletedScene.backgroundAssetId,
        cues: []
      }
    ];

    const summary = collectSceneReferenceSummary(project, deletedScene.id);

    expect(summary).toMatchObject({
      isStartScene: true,
      locationReferenceCount: 1,
      exitSceneReferenceCount: 1,
      hotspotTargetReferenceCount: 1,
      sceneVisitedConditionCount: 2,
      goToSceneEffectCount: 5,
      removedSubtitleTrackIds: ["subtitle_deleted"]
    });
    expect(countSceneReferences(summary)).toBe(11);

    const result = removeSceneFromProject(project, deletedScene.id, { mode: "cleanup" });

    expect(result.deleted).toBe(true);
    expect(result.removedSubtitleTrackIds).toEqual(["subtitle_deleted"]);
    expect(project.scenes.items.map((scene) => scene.id)).toEqual([sourceScene.id]);
    expect(project.locations.items[0].sceneIds).toEqual([sourceScene.id]);
    expect(project.manifest.startSceneId).toBe(deletedScene.id);
    expect(project.manifest.startLocationId).toBe(deletedScene.locationId);
    expect(sourceScene.exitSceneIds).toEqual([]);
    expect(sourceScene.onEnterEffects).toEqual([{ type: "setFlag", flag: "entered", value: true }]);
    expect(sourceScene.onExitEffects).toEqual([{ type: "setFlag", flag: "exited", value: true }]);
    expect(sourceScene.hotspots[0].targetSceneId).toBeUndefined();
    expect(sourceScene.hotspots[0].conditions).toEqual([{ type: "always" }]);
    expect(sourceScene.hotspots[0].effects).toEqual([{ type: "setFlag", flag: "opened", value: true }]);
    expect(project.dialogues.items[0].nodes[0].effects).toEqual([]);
    expect(project.dialogues.items[0].nodes[0].choices[0].conditions).toEqual([]);
    expect(project.dialogues.items[0].nodes[0].choices[0].effects).toEqual([]);
    expect(project.subtitles.items.map((track) => track.id)).toEqual(["subtitle_shared"]);
    expect(sourceScene.subtitleTrackIds).toEqual(["subtitle_shared"]);
  });

  it("rewires scene references and updates the start location when replacing the deleted scene", () => {
    const project = createDefaultProjectBundle("Scene rewire");
    const deletedScene = project.scenes.items[0];
    deletedScene.name = "Deleted Scene";

    const sourceScene = addScene(project, deletedScene.locationId);
    sourceScene.name = "Source Scene";
    const replacementLocation = addLocation(project);
    replacementLocation.name = "Replacement Location";
    const replacementScene = project.scenes.items.find((scene) => scene.id === replacementLocation.sceneIds[0])!;
    replacementScene.name = "Replacement Scene";
    const hotspot = addHotspot(project, sourceScene.id, 0.35, 0.35)!;

    project.manifest.startSceneId = deletedScene.id;
    project.manifest.startLocationId = deletedScene.locationId;

    sourceScene.exitSceneIds = [deletedScene.id];
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

    deletedScene.subtitleTrackIds = ["subtitle_deleted"];
    project.subtitles.items = [
      {
        id: "subtitle_deleted",
        assetId: deletedScene.backgroundAssetId,
        cues: []
      }
    ];

    const result = removeSceneFromProject(project, deletedScene.id, {
      mode: "rewire",
      replacementSceneId: replacementScene.id
    });

    expect(result.deleted).toBe(true);
    expect(project.manifest.startSceneId).toBe(replacementScene.id);
    expect(project.manifest.startLocationId).toBe(replacementScene.locationId);
    expect(project.locations.items.find((location) => location.id === deletedScene.locationId)?.sceneIds).toEqual([sourceScene.id]);
    expect(project.locations.items.find((location) => location.id === replacementScene.locationId)?.sceneIds).toEqual([
      replacementScene.id
    ]);
    expect(sourceScene.exitSceneIds).toEqual([replacementScene.id]);
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
    expect(project.subtitles.items).toEqual([]);
  });
});

function createAsset(id: string, name: string, sourcePath: string): Asset {
  return {
    id,
    kind: "image",
    name,
    sourcePath,
    importedAt: "2026-03-14T00:00:00.000Z",
    width: 1280,
    height: 720
  };
}

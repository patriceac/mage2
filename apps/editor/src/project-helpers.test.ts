import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, resolveHotspotBounds, type Asset } from "@mage2/schema";
import {
  STARTER_PLACEHOLDER_ASSET_ID,
  addLocation,
  addScene,
  addDialogueTree,
  addInventoryItem,
  addAssetRoots,
  addHotspot,
  addHotspotAtBestAvailablePosition,
  collectInventoryItemReferenceSummary,
  collectSceneReferenceSummary,
  countInventoryItemReferences,
  countSceneReferences,
  collectAssetReferenceSummary,
  createProjectRevision,
  removeHotspotFromProject,
  removeAssetFromProject,
  removeLocationFromProject,
  removeInventoryItemFromProject,
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

  it("does not assign the starter placeholder as the default background for added scenes", () => {
    const project = createDefaultProjectBundle("New scenes");
    project.assets.assets.push(
      createAsset(STARTER_PLACEHOLDER_ASSET_ID, "starter-scene.png", "D:\\project\\assets\\starter-scene.png")
    );

    const scene = addScene(project, project.locations.items[0]!.id);

    expect(scene.backgroundAssetId).toBeUndefined();
  });

  it("does not reuse existing background assets for added scenes", () => {
    const project = createDefaultProjectBundle("New scenes");
    project.assets.assets.push(
      createAsset(STARTER_PLACEHOLDER_ASSET_ID, "starter-scene.png", "D:\\project\\assets\\starter-scene.png"),
      createAsset("asset_background", "background.png", "D:\\project\\assets\\background.png")
    );

    const scene = addScene(project, project.locations.items[0]!.id);

    expect(scene.backgroundAssetId).toBeUndefined();
  });
});

describe("addInventoryItem", () => {
  it("adds new inventory items before older items", () => {
    const project = createDefaultProjectBundle("Inventory ordering");

    const firstItem = addInventoryItem(project);
    const secondItem = addInventoryItem(project);

    expect(project.inventory.items.map((item) => item.id)).toEqual([secondItem.id, firstItem.id]);
    expect(project.inventory.items.map((item) => item.name)).toEqual(["Item 2", "Item 1"]);
    expect(getDefaultStrings(project)[firstItem.textId]).toBe("Item 1");
    expect(getDefaultStrings(project)[secondItem.textId]).toBe("Item 2");
  });
});

describe("removeInventoryItemFromProject", () => {
  it("cleans every authored reference and prunes generated item text", () => {
    const project = createDefaultProjectBundle("Inventory cleanup");
    const deletedItem = addInventoryItem(project);
    const scene = project.scenes.items[0];
    const hotspot = scene.hotspots[0];

    hotspot.inventoryItemId = deletedItem.id;
    hotspot.placedInventoryItemId = deletedItem.id;
    hotspot.placedInventoryGeometry = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
    hotspot.requiredItemIds = [deletedItem.id];
    hotspot.conditions = [{ type: "always" }, { type: "inventoryHas", itemId: deletedItem.id }];
    hotspot.effects = [
      { type: "addItem", itemId: deletedItem.id },
      { type: "removeItem", itemId: deletedItem.id },
      { type: "setFlag", flag: "kept", value: true }
    ];
    scene.onEnterEffects = [{ type: "addItem", itemId: deletedItem.id }];
    project.dialogues.items = [
      {
        id: "dialogue_inventory_cleanup",
        name: "Inventory Cleanup",
        startNodeId: "node_inventory_cleanup",
        nodes: [
          {
            id: "node_inventory_cleanup",
            speaker: "Guide",
            textId: "text.node_inventory_cleanup",
            effects: [{ type: "removeItem", itemId: deletedItem.id }],
            choices: [
              {
                id: "choice_inventory_cleanup",
                textId: "text.choice_inventory_cleanup",
                conditions: [{ type: "inventoryHas", itemId: deletedItem.id }],
                effects: [{ type: "addItem", itemId: deletedItem.id }]
              }
            ]
          }
        ]
      }
    ];

    const summary = collectInventoryItemReferenceSummary(project, deletedItem.id);
    expect(summary).toEqual({
      hotspotItemReferenceCount: 1,
      placementReferenceCount: 1,
      requiredItemReferenceCount: 1,
      inventoryConditionCount: 2,
      inventoryEffectCount: 5
    });
    expect(countInventoryItemReferences(summary)).toBe(10);

    const result = removeInventoryItemFromProject(project, deletedItem.id, { mode: "cleanup" });

    expect(result.deleted).toBe(true);
    expect(result.removedTextIds).toEqual(expect.arrayContaining([deletedItem.textId, deletedItem.descriptionTextId]));
    expect(project.inventory.items).toEqual([]);
    expect(hotspot.inventoryItemId).toBeUndefined();
    expect(hotspot.placedInventoryItemId).toBeUndefined();
    expect(hotspot.placedInventoryGeometry).toBeUndefined();
    expect(hotspot.requiredItemIds).toEqual([]);
    expect(hotspot.conditions).toEqual([{ type: "always" }]);
    expect(hotspot.effects).toEqual([{ type: "setFlag", flag: "kept", value: true }]);
    expect(scene.onEnterEffects).toEqual([]);
    expect(project.dialogues.items[0].nodes[0].effects).toEqual([]);
    expect(project.dialogues.items[0].nodes[0].choices[0].conditions).toEqual([]);
    expect(project.dialogues.items[0].nodes[0].choices[0].effects).toEqual([]);
    expect(getDefaultStrings(project)[deletedItem.textId]).toBeUndefined();
    expect(getDefaultStrings(project)[deletedItem.descriptionTextId!]).toBeUndefined();
  });

  it("rewires all references to another item without duplicating requirements", () => {
    const project = createDefaultProjectBundle("Inventory rewire");
    const deletedItem = addInventoryItem(project);
    const replacementItem = addInventoryItem(project);
    const scene = project.scenes.items[0];
    const hotspot = scene.hotspots[0];

    hotspot.inventoryItemId = deletedItem.id;
    hotspot.placedInventoryItemId = deletedItem.id;
    hotspot.placedInventoryGeometry = { x: 0.15, y: 0.25, width: 0.2, height: 0.2 };
    hotspot.requiredItemIds = [deletedItem.id, replacementItem.id];
    hotspot.conditions = [{ type: "inventoryHas", itemId: deletedItem.id }];
    hotspot.effects = [
      { type: "addItem", itemId: deletedItem.id },
      { type: "removeItem", itemId: deletedItem.id }
    ];
    scene.onExitEffects = [{ type: "removeItem", itemId: deletedItem.id }];

    const result = removeInventoryItemFromProject(project, deletedItem.id, {
      mode: "rewire",
      replacementItemId: replacementItem.id
    });

    expect(result.deleted).toBe(true);
    expect(project.inventory.items.map((item) => item.id)).toEqual([replacementItem.id]);
    expect(hotspot.inventoryItemId).toBe(replacementItem.id);
    expect(hotspot.placedInventoryItemId).toBe(replacementItem.id);
    expect(hotspot.placedInventoryGeometry).toEqual({ x: 0.15, y: 0.25, width: 0.2, height: 0.2 });
    expect(hotspot.requiredItemIds).toEqual([replacementItem.id]);
    expect(hotspot.conditions).toEqual([{ type: "inventoryHas", itemId: replacementItem.id }]);
    expect(hotspot.effects).toEqual([
      { type: "addItem", itemId: replacementItem.id },
      { type: "removeItem", itemId: replacementItem.id }
    ]);
    expect(scene.onExitEffects).toEqual([{ type: "removeItem", itemId: replacementItem.id }]);
    expect(countInventoryItemReferences(collectInventoryItemReferenceSummary(project, deletedItem.id))).toBe(0);
  });

  it("does not mutate the project when the replacement item is unavailable", () => {
    const project = createDefaultProjectBundle("Inventory blocked rewire");
    const deletedItem = addInventoryItem(project);
    const revision = createProjectRevision(project);

    const result = removeInventoryItemFromProject(project, deletedItem.id, {
      mode: "rewire",
      replacementItemId: "missing-item"
    });

    expect(result.deleted).toBe(false);
    expect(result.blockedReason).toBe("replacement-item-not-found");
    expect(createProjectRevision(project)).toBe(revision);
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
    expect(hotspot?.timingMode).toBe("sceneDuration");
  });

  it("avoids overlapping existing hotspots when open space is available", () => {
    const project = createDefaultProjectBundle("Hotspot overlap avoidance");
    const scene = project.scenes.items[0];
    scene.hotspots = [];

    const existing = addHotspot(project, scene.id, 0.5, 0.5)!;
    const created = addHotspotAtBestAvailablePosition(project, scene.id)!;

    expect(getOverlapArea(resolveHotspotBounds(existing), resolveHotspotBounds(created))).toBe(0);
  });

  it("respects a supplied hotspot size during best-available placement", () => {
    const project = createDefaultProjectBundle("Hotspot sized auto placement");
    const scene = project.scenes.items[0];
    scene.hotspots = [];

    const hotspot = addHotspotAtBestAvailablePosition(project, scene.id, {
      width: 0.08,
      height: 0.1
    });

    expect(hotspot).toMatchObject({
      x: 0.46,
      y: 0.45,
      width: 0.08,
      height: 0.1
    });
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
  it("reports scene backgrounds", () => {
    const project = createDefaultProjectBundle("Asset usage");
    const scene = project.scenes.items[0];
    const primaryAsset = createAsset("asset_primary", "primary.png", "D:\\media\\primary.png");
    const secondaryAsset = createAsset("asset_secondary", "secondary.png", "D:\\other\\secondary.png");

    project.assets.assets = [primaryAsset, secondaryAsset];
    scene.backgroundAssetId = primaryAsset.id;

    const summary = collectAssetReferenceSummary(project, primaryAsset.id);

    expect(summary).toEqual({
      sceneBackgrounds: [{ sceneId: scene.id, sceneName: scene.name }],
      sceneAudioAssignments: [],
      hotspotMediaAssignments: [],
      dialogueMediaAssignments: [],
      inventoryImages: [],
      responseEntries: [],
      playerPresentation: []
    });
  });

  it("reports scene audio assignments separately from visual backgrounds", () => {
    const project = createDefaultProjectBundle("Scene audio usage");
    const scene = project.scenes.items[0];
    const backgroundAsset = createAsset("asset_primary", "primary.png", "D:\\media\\primary.png");
    const sceneAudioAsset = createAsset("asset_scene_audio", "ambience.mp3", "D:\\media\\ambience.mp3", "sceneAudio", "audio");

    project.assets.assets = [backgroundAsset, sceneAudioAsset];
    scene.backgroundAssetId = backgroundAsset.id;
    scene.sceneAudioAssetId = sceneAudioAsset.id;

    expect(collectAssetReferenceSummary(project, sceneAudioAsset.id)).toEqual({
      sceneBackgrounds: [],
      sceneAudioAssignments: [{ sceneId: scene.id, sceneName: scene.name }],
      hotspotMediaAssignments: [],
      dialogueMediaAssignments: [],
      inventoryImages: [],
      responseEntries: [],
      playerPresentation: []
    });
  });

  it("reports hotspot and dialogue foreground-media assignments", () => {
    const project = createDefaultProjectBundle("Foreground media usage");
    const scene = project.scenes.items[0];
    const hotspot = scene.hotspots[0];
    const dialogue = addDialogueTree(project);
    const node = dialogue.nodes[0];
    const foregroundAsset = createAsset(
      "asset_foreground",
      "voice.mp3",
      "D:\\media\\voice.mp3",
      "foreground",
      "audio"
    );

    project.assets.assets = [foregroundAsset];
    hotspot.mediaAssetId = foregroundAsset.id;
    node.mediaAssetId = foregroundAsset.id;

    expect(collectAssetReferenceSummary(project, foregroundAsset.id)).toMatchObject({
      hotspotMediaAssignments: [
        {
          sceneId: scene.id,
          sceneName: scene.name,
          hotspotId: hotspot.id,
          hotspotName: hotspot.name
        }
      ],
      dialogueMediaAssignments: [
        {
          dialogueId: dialogue.id,
          dialogueName: dialogue.name,
          nodeId: node.id,
          nodeLabel: node.speaker
        }
      ]
    });
  });

  it("reports player presentation roles and blocks referenced artwork deletion", () => {
    const project = createDefaultProjectBundle("Player artwork usage");
    const titleAsset = createAsset(
      "asset_starter_title",
      "title.png",
      "D:\\media\\title.png",
      "player"
    );
    project.assets.assets = [titleAsset];
    project.manifest.playerPresentation.titleBackgroundAssetId = titleAsset.id;

    expect(collectAssetReferenceSummary(project, titleAsset.id).playerPresentation).toEqual([
      { role: "titleBackground" }
    ]);
    expect(removeAssetFromProject(project, titleAsset.id)).toMatchObject({
      deleted: false,
      blockedReason: "player-asset-in-use"
    });
  });
});

describe("removeAssetFromProject", () => {
  it("reassigns scene backgrounds", () => {
    const project = createDefaultProjectBundle("Asset removal");
    const scene = project.scenes.items[0];
    const primaryAsset = createAsset("asset_primary", "primary.png", "D:\\media\\primary.png");
    const secondaryAsset = createAsset("asset_secondary", "secondary.png", "D:\\other\\secondary.png");

    project.assets.assets = [primaryAsset, secondaryAsset];
    addAssetRoots(project, project.assets.assets);
    scene.backgroundAssetId = primaryAsset.id;

    const result = removeAssetFromProject(project, primaryAsset.id);

    expect(result.deleted).toBe(true);
    expect(result.fallbackAssetId).toBe(secondaryAsset.id);
    expect(project.assets.assets.map((asset) => asset.id)).toEqual([secondaryAsset.id]);
    expect(project.manifest.assetRoots).toEqual(["D:\\other"]);
    expect(scene.backgroundAssetId).toBe(secondaryAsset.id);
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
      createAsset(STARTER_PLACEHOLDER_ASSET_ID, "starter-scene.png", "D:\\project\\assets\\starter-scene.png"),
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

  it("blocks deletion when an inventory item still references the asset", () => {
    const project = createDefaultProjectBundle("Inventory asset removal blocked");
    const inventoryAsset = createAsset("asset_inventory", "lantern.png", "D:\\media\\lantern.png", "inventory");
    const item = addInventoryItem(project);

    project.assets.assets = [inventoryAsset];
    item.imageAssetId = inventoryAsset.id;

    const result = removeAssetFromProject(project, inventoryAsset.id);

    expect(result).toMatchObject({
      deleted: false,
      blockedReason: "inventory-image-in-use"
    });
  });

  it("clears scene audio assignments when deleting an in-use scene-audio asset", () => {
    const project = createDefaultProjectBundle("Scene audio asset removal");
    const backgroundAsset = createAsset("asset_background", "background.png", "D:\\media\\background.png");
    const sceneAudioAsset = createAsset("asset_scene_audio", "ambience.mp3", "D:\\media\\ambience.mp3", "sceneAudio", "audio");

    project.assets.assets = [backgroundAsset, sceneAudioAsset];
    project.scenes.items[0].backgroundAssetId = backgroundAsset.id;
    project.scenes.items[0].sceneAudioAssetId = sceneAudioAsset.id;

    const result = removeAssetFromProject(project, sceneAudioAsset.id);

    expect(result.deleted).toBe(true);
    expect(result.fallbackAssetId).toBeUndefined();
    expect(result.referenceSummary.sceneAudioAssignments).toEqual([
      { sceneId: project.scenes.items[0].id, sceneName: project.scenes.items[0].name }
    ]);
    expect(project.scenes.items[0].sceneAudioAssetId).toBeUndefined();
  });

  it("clears hotspot and dialogue references when deleting foreground media", () => {
    const project = createDefaultProjectBundle("Foreground media asset removal");
    const foregroundAsset = createAsset(
      "asset_foreground",
      "cut-in.mp4",
      "D:\\media\\cut-in.mp4",
      "foreground",
      "video"
    );
    const hotspot = project.scenes.items[0].hotspots[0];
    const node = addDialogueTree(project).nodes[0];
    project.assets.assets = [foregroundAsset];
    hotspot.mediaAssetId = foregroundAsset.id;
    node.mediaAssetId = foregroundAsset.id;

    const result = removeAssetFromProject(project, foregroundAsset.id);

    expect(result.deleted).toBe(true);
    expect(hotspot.mediaAssetId).toBeUndefined();
    expect(node.mediaAssetId).toBeUndefined();
  });

});

describe("removeSceneFromProject", () => {
  it("cleans scene references owned by the deleted scene", () => {
    const project = createDefaultProjectBundle("Scene cleanup");
    const deletedScene = project.scenes.items[0];
    deletedScene.name = "Deleted Scene";

    const sourceScene = addScene(project, deletedScene.locationId);
    sourceScene.name = "Source Scene";
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
    hotspot.clickEvent = {
      targetSceneId: deletedScene.id,
      effects: [
        { type: "setFlag", flag: "examined", value: true },
        { type: "goToScene", sceneId: deletedScene.id }
      ]
    };
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
      hotspotTargetReferenceCount: 2,
      sceneVisitedConditionCount: 2,
      goToSceneEffectCount: 6
    });
    expect(countSceneReferences(summary)).toBe(12);

    const result = removeSceneFromProject(project, deletedScene.id, { mode: "cleanup" });

    expect(result.deleted).toBe(true);
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
    expect(sourceScene.hotspots[0].clickEvent).toEqual({
      targetSceneId: undefined,
      effects: [{ type: "setFlag", flag: "examined", value: true }]
    });
    expect(project.dialogues.items[0].nodes[0].effects).toEqual([]);
    expect(project.dialogues.items[0].nodes[0].choices[0].conditions).toEqual([]);
    expect(project.dialogues.items[0].nodes[0].choices[0].effects).toEqual([]);
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

    hotspot.targetSceneId = deletedScene.id;
    hotspot.conditions = [{ type: "sceneVisited", sceneId: deletedScene.id }];
    hotspot.effects = [{ type: "goToScene", sceneId: deletedScene.id }];
    hotspot.otherItemEvent = {
      targetSceneId: deletedScene.id,
      effects: [{ type: "goToScene", sceneId: deletedScene.id }]
    };
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
    expect(result.removedTextIds).toEqual([]);
    expect(project.manifest.startSceneId).toBe(replacementScene.id);
    expect(project.manifest.startLocationId).toBe(replacementScene.locationId);
    expect(hotspot.otherItemEvent).toEqual({
      targetSceneId: replacementScene.id,
      effects: [{ type: "goToScene", sceneId: replacementScene.id }]
    });
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
      expect.arrayContaining([legacyOverlayTextId, prunedLabelTextId, prunedHotspot.commentTextId!])
    );
    expect(result.removedTextIds).not.toContain(sharedLabelTextId);
    expect(result.removedTextIds).not.toContain(preservedHotspot.commentTextId);
    expect(getDefaultStrings(project)[legacyOverlayTextId]).toBeUndefined();
    expect(getDefaultStrings(project)[prunedLabelTextId]).toBeUndefined();
    expect(getDefaultStrings(project)[prunedHotspot.commentTextId!]).toBeUndefined();
    expect(getDefaultStrings(project)[sharedLabelTextId]).toBe("Hotspot 2");
    expect(getDefaultStrings(project)[preservedHotspot.commentTextId]).toBe("Manual scene comment");
  });
});

describe("removeLocationFromProject", () => {
  it("removes a location with its scenes and repairs the start target", () => {
    const project = createDefaultProjectBundle("Location deletion");
    const deletedLocation = project.locations.items[0]!;
    const deletedScene = project.scenes.items[0]!;
    const replacementLocation = addLocation(project);
    const replacementScene = project.scenes.items.find((scene) => replacementLocation.sceneIds.includes(scene.id))!;
    const sourceScene = addScene(project, replacementLocation.id);
    const hotspot = addHotspot(project, sourceScene.id, 0.25, 0.25)!;

    hotspot.targetSceneId = deletedScene.id;
    hotspot.conditions = [{ type: "sceneVisited", sceneId: deletedScene.id }];
    hotspot.effects = [{ type: "goToScene", sceneId: deletedScene.id }];
    sourceScene.onEnterEffects = [{ type: "goToScene", sceneId: deletedScene.id }];
    project.manifest.startLocationId = deletedLocation.id;
    project.manifest.startSceneId = deletedScene.id;

    const result = removeLocationFromProject(project, deletedLocation.id);

    expect(result.deleted).toBe(true);
    expect(result.removedSceneIds).toEqual([deletedScene.id]);
    expect(project.locations.items.map((location) => location.id)).not.toContain(deletedLocation.id);
    expect(project.scenes.items.map((scene) => scene.id)).not.toContain(deletedScene.id);
    expect(project.manifest.startLocationId).toBe(replacementLocation.id);
    expect(project.manifest.startSceneId).toBe(replacementScene.id);
    expect(hotspot.targetSceneId).toBeUndefined();
    expect(hotspot.conditions).toEqual([]);
    expect(hotspot.effects).toEqual([]);
    expect(sourceScene.onEnterEffects).toEqual([]);
  });

  it("blocks deleting the final location", () => {
    const project = createDefaultProjectBundle("Last location");

    const result = removeLocationFromProject(project, project.locations.items[0]!.id);

    expect(result.deleted).toBe(false);
    expect(result.blockedReason).toBe("last-location");
    expect(project.locations.items).toHaveLength(1);
    expect(project.scenes.items).toHaveLength(1);
  });
});

function createAsset(
  id: string,
  name: string,
  sourcePath: string,
  category?: Asset["category"],
  kind: Asset["kind"] = "image"
): Asset {
  return {
    id,
    kind,
    name,
    category,
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

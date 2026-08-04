import { describe, expect, it } from "vitest";
import {
  createDefaultProjectBundle,
  createInitialSaveState,
  type Hotspot,
  type ProjectBundle,
  type Scene
} from "@mage2/schema";
import {
  createPlayerController,
  getSceneAudioPlayheadMs,
  resolveSceneAudioPlaybackDirective,
  resolveSceneAudioSyncState,
  resolveSceneTimelineDurationMs
} from "./index";

describe("player controller", () => {
  it("keeps unassigned hotspot interactions completely silent", () => {
    const project = createDefaultProjectBundle();
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    delete hotspot.response;

    const resolution = createPlayerController(project).selectHotspot(hotspot.id, 1000);

    expect(resolution.response).toBeUndefined();
    expect(resolution.startedDialogueTreeId).toBeUndefined();
  });

  it("selects response groups randomly without repeating their most recent entry", () => {
    const project = createDefaultProjectBundle();
    const group = project.dialogues.responseGroups[0]!;
    project.scenes.items[0]!.hotspots[0]!.response = { type: "group", groupId: group.id };
    const controller = createPlayerController(project, undefined, { random: () => 0 });

    const first = controller.selectHotspot("hotspot_inspect", 1000).response;
    const second = controller.selectHotspot("hotspot_inspect", 1000).response;
    const third = controller.selectHotspot("hotspot_inspect", 1000).response;

    expect(first?.entry.id).toBe(group.entries[0]!.id);
    expect(second?.entry.id).toBe(group.entries[1]!.id);
    expect(third?.entry.id).toBe(group.entries[0]!.id);
    expect(second?.sourceGroupId).toBe(group.id);
  });

  it("resets group history when a save is loaded into a new play session", () => {
    const project = createDefaultProjectBundle();
    const group = project.dialogues.responseGroups[0]!;
    project.scenes.items[0]!.hotspots[0]!.response = { type: "group", groupId: group.id };
    const firstSession = createPlayerController(project, undefined, { random: () => 0 });

    expect(firstSession.selectHotspot("hotspot_inspect", 1000).response?.entry.id).toBe(group.entries[0]!.id);
    const secondSession = createPlayerController(project, firstSession.save(), { random: () => 0 });
    expect(secondSession.selectHotspot("hotspot_inspect", 1000).response?.entry.id).toBe(group.entries[0]!.id);
  });

  it("plays a specifically assigned response and lets dialogue take precedence over responses", () => {
    const project = createDefaultProjectBundle();
    const entry = project.dialogues.responseGroups[0]!.entries[2]!;
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    hotspot.response = { type: "entry", entryId: entry.id };
    const directController = createPlayerController(project);
    expect(directController.selectHotspot(hotspot.id, 1000).response?.entry.id).toBe(entry.id);

    project.dialogues.items.push({
      id: "dialogue_test",
      name: "Test",
      startNodeId: "node_test",
      nodes: [{ id: "node_test", speaker: "NPC", textId: "text.node_test", choices: [], effects: [] }]
    });
    hotspot.dialogueTreeId = "dialogue_test";
    const dialogueController = createPlayerController(project);
    const resolution = dialogueController.selectHotspot(hotspot.id, 1000);
    expect(resolution.startedDialogueTreeId).toBe("dialogue_test");
    expect(resolution.response).toBeUndefined();
  });

  it("activates hotspots inside their timing window", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_placeholder",
      kind: "image",
      name: "Placeholder",
      variants: {
        en: {
          sourcePath: "placeholder.png",
          importedAt: new Date().toISOString()
        }
      }
    });

    const controller = createPlayerController(project);
    expect(controller.getVisibleHotspots(1000)).toHaveLength(1);
    expect(controller.getVisibleHotspots(35000)).toHaveLength(0);
  });

  it("reports foreground media when a hotspot interaction activates", () => {
    const project = createDefaultProjectBundle();
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    hotspot.mediaAssetId = "asset_interaction_clip";

    const controller = createPlayerController(project);
    const resolution = controller.selectHotspot(hotspot.id, 1000);

    expect(resolution.mediaAssetId).toBe("asset_interaction_clip");
  });

  it("falls back to a fresh state when a caller supplies a stale save directly", () => {
    const project = createDefaultProjectBundle();
    const staleState = {
      ...createInitialSaveState(project),
      currentSceneId: "scene_removed"
    };

    const controller = createPlayerController(project, staleState);

    expect(controller.getSnapshot().saveState).toEqual(createInitialSaveState(project));
  });

  it("lets default hotspot timing follow scene duration changes", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_placeholder",
      kind: "video",
      name: "Placeholder",
      variants: {
        en: {
          sourcePath: "placeholder.mp4",
          importedAt: new Date().toISOString(),
          durationMs: 10000
        }
      }
    });
    project.scenes.items[0]!.backgroundAssetId = "asset_placeholder";
    project.scenes.items[0]!.hotspots[0]!.timingMode = "sceneDuration";

    const controller = createPlayerController(project);

    expect(controller.getVisibleHotspots(9999)).toHaveLength(1);
    expect(controller.getVisibleHotspots(10001)).toHaveLength(0);

    project.assets.assets[0]!.variants.en!.durationMs = 20000;

    expect(controller.getVisibleHotspots(19000)).toHaveLength(1);
  });

  it("preserves fixed hotspot timing when scene duration changes", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_placeholder",
      kind: "video",
      name: "Placeholder",
      variants: {
        en: {
          sourcePath: "placeholder.mp4",
          importedAt: new Date().toISOString(),
          durationMs: 20000
        }
      }
    });
    project.scenes.items[0]!.hotspots[0]!.timingMode = "fixed";
    project.scenes.items[0]!.hotspots[0]!.startMs = 1000;
    project.scenes.items[0]!.hotspots[0]!.endMs = 3000;

    const controller = createPlayerController(project);

    expect(controller.getVisibleHotspots(999)).toHaveLength(0);
    expect(controller.getVisibleHotspots(2500)).toHaveLength(1);
    expect(controller.getVisibleHotspots(5000)).toHaveLength(0);
  });

  it("preserves hotspot activation behavior when a hotspot is linked to an inventory item for visuals", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_background",
      kind: "image",
      name: "Placeholder",
      variants: {
        en: {
          sourcePath: "placeholder.png",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.assets.assets.push({
      id: "asset_item",
      kind: "image",
      name: "lantern.png",
      category: "inventory",
      variants: {
        en: {
          sourcePath: "lantern.png",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.inventory.items.push({
      id: "item_lantern",
      name: "Lantern",
      textId: "text.item_lantern.name",
      imageAssetId: "asset_item"
    });
    project.scenes.items[0]!.hotspots[0]!.inventoryItemId = "item_lantern";
    project.scenes.items[0]!.hotspots[0]!.effects = [{ type: "setFlag", flag: "lanternSeen", value: true }];

    const controller = createPlayerController(project);
    controller.selectHotspot(project.scenes.items[0]!.hotspots[0]!.id, 1000);

    expect(controller.getSnapshot().flags.lanternSeen).toBe(true);
  });

  it("executes explicit hotspot interaction events without running the primary event", () => {
    const project = createDefaultProjectBundle();
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    hotspot.effects = [{ type: "setFlag", flag: "cabinet.opened", value: true }];
    hotspot.clickEvent = {
      effects: [{ type: "setFlag", flag: "cabinet.examined", value: true }]
    };
    hotspot.otherItemEvent = {
      effects: [{ type: "setFlag", flag: "cabinet.wrongItem", value: true }]
    };
    const controller = createPlayerController(project);

    expect(controller.selectHotspotEvent(hotspot.id, "click", 1000)).toEqual({});
    expect(controller.getSnapshot().flags).toMatchObject({ "cabinet.examined": true });
    expect(controller.getSnapshot().flags["cabinet.opened"]).toBeUndefined();

    expect(controller.selectHotspotEvent(hotspot.id, "otherItem", 1000)).toEqual({});
    expect(controller.getSnapshot().flags).toMatchObject({ "cabinet.wrongItem": true });

    controller.selectHotspot(hotspot.id, 1000);
    expect(controller.getSnapshot().flags).toMatchObject({
      "cabinet.examined": true,
      "cabinet.wrongItem": true,
      "cabinet.opened": true
    });
  });

  it("keeps hotspots silent when an interaction event is not authored", () => {
    const project = createDefaultProjectBundle();
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    const controller = createPlayerController(project);
    const before = controller.save();

    expect(controller.selectHotspotEvent(hotspot.id, "click", 1000)).toEqual({});
    expect(controller.selectHotspotEvent(hotspot.id, "otherItem", 1000)).toEqual({});
    expect(controller.save()).toEqual(before);
  });

  it("adds newly picked up inventory items before older items", () => {
    const project = createDefaultProjectBundle();
    const scene = project.scenes.items[0]!;
    project.inventory.items.push(
      {
        id: "item_candle",
        name: "Candle",
        textId: "text.item_candle.name"
      },
      {
        id: "item_map",
        name: "Map",
        textId: "text.item_map.name"
      }
    );
    scene.hotspots = [
      {
        id: "hotspot_candle",
        name: "Candle",
        x: 0,
        y: 0,
        width: 0.1,
        height: 0.1,
        startMs: 0,
        endMs: 30000,
        timingMode: "sceneDuration",
        requiredItemIds: [],
        conditions: [{ type: "always" }],
        effects: [{ type: "addItem", itemId: "item_candle" }]
      },
      {
        id: "hotspot_map",
        name: "Map",
        x: 0.2,
        y: 0,
        width: 0.1,
        height: 0.1,
        startMs: 0,
        endMs: 30000,
        timingMode: "sceneDuration",
        requiredItemIds: [],
        conditions: [{ type: "always" }],
        effects: [{ type: "addItem", itemId: "item_map" }]
      }
    ];

    const controller = createPlayerController(project);
    controller.selectHotspot("hotspot_candle", 1000);
    controller.selectHotspot("hotspot_map", 1000);

    expect(controller.save().inventory).toEqual(["item_map", "item_candle"]);
    expect(controller.getSnapshot().inventoryItems.map((item) => item.id)).toEqual(["item_map", "item_candle"]);
  });

  it("allows multiple copies of one inventory item and removes one copy at a time", () => {
    const project = createDefaultProjectBundle();
    const scene = project.scenes.items[0]!;
    project.inventory.items.push({
      id: "item_candle",
      name: "Candle",
      textId: "text.item_candle.name"
    });
    scene.hotspots = [
      {
        id: "hotspot_candle_one",
        name: "Candle one",
        x: 0,
        y: 0,
        width: 0.1,
        height: 0.1,
        startMs: 0,
        endMs: 30000,
        timingMode: "sceneDuration",
        requiredItemIds: [],
        conditions: [{ type: "always" }],
        effects: [{ type: "addItem", itemId: "item_candle" }]
      },
      {
        id: "hotspot_candle_two",
        name: "Candle two",
        x: 0.2,
        y: 0,
        width: 0.1,
        height: 0.1,
        startMs: 0,
        endMs: 30000,
        timingMode: "sceneDuration",
        requiredItemIds: [],
        conditions: [{ type: "always" }],
        effects: [{ type: "addItem", itemId: "item_candle" }]
      },
      {
        id: "hotspot_burn_candle",
        name: "Burn candle",
        x: 0.4,
        y: 0,
        width: 0.1,
        height: 0.1,
        startMs: 0,
        endMs: 30000,
        timingMode: "sceneDuration",
        requiredItemIds: ["item_candle"],
        conditions: [{ type: "always" }],
        effects: [{ type: "removeItem", itemId: "item_candle" }]
      }
    ];

    const controller = createPlayerController(project);
    controller.selectHotspot("hotspot_candle_one", 1000);
    controller.selectHotspot("hotspot_candle_two", 1000);

    expect(controller.save().inventory).toEqual(["item_candle", "item_candle"]);
    expect(controller.getSnapshot().inventoryItems.map((item) => item.id)).toEqual([
      "item_candle",
      "item_candle"
    ]);
    expect(controller.getVisibleHotspots(1000).map((hotspot) => hotspot.id)).toContain("hotspot_burn_candle");

    controller.selectHotspot("hotspot_burn_candle", 1000);

    expect(controller.save().inventory).toEqual(["item_candle"]);
    expect(controller.getSnapshot().inventoryItems.map((item) => item.id)).toEqual(["item_candle"]);
    expect(controller.getVisibleHotspots(1000).map((hotspot) => hotspot.id)).toContain("hotspot_burn_candle");

    controller.selectHotspot("hotspot_burn_candle", 1000);

    expect(controller.save().inventory).toEqual([]);
    expect(controller.getSnapshot().inventoryItems).toEqual([]);
    expect(controller.getVisibleHotspots(1000).map((hotspot) => hotspot.id)).not.toContain("hotspot_burn_candle");
  });

  it("treats onExit and onEnter self-transitions as no-ops", () => {
    const project = createDefaultProjectBundle();
    const sourceScene = project.scenes.items[0]!;
    const targetScene = addTestScene(project, "scene_target");
    sourceScene.onExitEffects = [
      { type: "goToScene", sceneId: sourceScene.id },
      { type: "setFlag", flag: "sourceExited", value: true }
    ];
    targetScene.onEnterEffects = [
      { type: "goToScene", sceneId: targetScene.id },
      { type: "setFlag", flag: "targetEntered", value: true }
    ];

    const controller = createPlayerController(project);

    expect(() => controller.enterScene(targetScene.id)).not.toThrow();
    expect(controller.getSnapshot().scene.id).toBe(targetScene.id);
    expect(controller.getSnapshot().flags).toMatchObject({
      sourceExited: true,
      targetEntered: true
    });
    expect(controller.getRuntimeIssues()).toEqual([]);
  });

  it("queues exit-effect transitions in authored order until the current transition completes", () => {
    const project = createDefaultProjectBundle();
    const sourceScene = project.scenes.items[0]!;
    const intermediateScene = addTestScene(project, "scene_intermediate");
    const queuedScene = addTestScene(project, "scene_queued");
    const finalScene = addTestScene(project, "scene_final");
    sourceScene.onExitEffects = [
      { type: "goToScene", sceneId: queuedScene.id },
      { type: "goToScene", sceneId: finalScene.id }
    ];
    intermediateScene.onEnterEffects = [{ type: "setFlag", flag: "intermediateEntered", value: true }];
    intermediateScene.onExitEffects = [{ type: "setFlag", flag: "intermediateExited", value: true }];
    queuedScene.onEnterEffects = [{ type: "setFlag", flag: "queuedEntered", value: true }];
    queuedScene.onExitEffects = [{ type: "setFlag", flag: "queuedExited", value: true }];
    finalScene.onEnterEffects = [{ type: "setFlag", flag: "finalEntered", value: true }];

    const controller = createPlayerController(project);

    expect(() => controller.enterScene(intermediateScene.id)).not.toThrow();
    expect(controller.getSnapshot().scene.id).toBe(finalScene.id);
    expect(controller.getSnapshot().flags).toMatchObject({
      intermediateEntered: true,
      intermediateExited: true,
      queuedEntered: true,
      queuedExited: true,
      finalEntered: true
    });
    expect(controller.save().visitedSceneIds).toEqual([
      sourceScene.id,
      intermediateScene.id,
      queuedScene.id,
      finalScene.id
    ]);
    expect(controller.getRuntimeIssues()).toEqual([]);
  });

  it("blocks cross-scene enter-effect cycles at the last reached scene", () => {
    const project = createDefaultProjectBundle();
    const sourceScene = project.scenes.items[0]!;
    const sceneB = addTestScene(project, "scene_b");
    const sceneC = addTestScene(project, "scene_c");
    sceneB.onEnterEffects = [{ type: "goToScene", sceneId: sceneC.id }];
    sceneC.onEnterEffects = [{ type: "goToScene", sceneId: sceneB.id }];

    const controller = createPlayerController(project);

    expect(() => controller.enterScene(sceneB.id)).not.toThrow();
    expect(controller.getSnapshot().scene.id).toBe(sceneC.id);
    expect(controller.getRuntimeIssues()).toEqual([
      {
        code: "scene-transition-cycle",
        message: `Scene transition cycle blocked: ${sourceScene.id} -> ${sceneB.id} -> ${sceneC.id} -> ${sceneB.id}.`,
        scenePath: [sourceScene.id, sceneB.id, sceneC.id, sceneB.id],
        effectsExecuted: 2,
        effectBudget: 256
      }
    ]);
  });

  it("honors multiple scene effects in authored order", () => {
    const project = createDefaultProjectBundle();
    const sourceScene = project.scenes.items[0]!;
    const sceneB = addTestScene(project, "scene_b");
    const sceneC = addTestScene(project, "scene_c");
    const hotspot = createTestHotspot("hotspot_multi_transition");
    hotspot.effects = [
      { type: "goToScene", sceneId: sceneB.id },
      { type: "setFlag", flag: "betweenTransitions", value: true },
      { type: "goToScene", sceneId: sceneC.id }
    ];
    sourceScene.hotspots = [hotspot];
    sourceScene.onExitEffects = [{ type: "addItem", itemId: "marker_source_exit" }];
    sceneB.onEnterEffects = [{ type: "addItem", itemId: "marker_b_enter" }];
    sceneB.onExitEffects = [{ type: "addItem", itemId: "marker_b_exit" }];
    sceneC.onEnterEffects = [{ type: "addItem", itemId: "marker_c_enter" }];

    const controller = createPlayerController(project);
    const resolution = controller.selectHotspot(hotspot.id, 1000);

    expect(resolution.transitionedToSceneId).toBe(sceneC.id);
    expect(controller.getSnapshot().scene.id).toBe(sceneC.id);
    expect(controller.getSnapshot().flags.betweenTransitions).toBe(true);
    expect(controller.save().inventory).toEqual([
      "marker_c_enter",
      "marker_b_exit",
      "marker_b_enter",
      "marker_source_exit"
    ]);
    expect(controller.getRuntimeIssues()).toEqual([]);
  });

  it("supports hotspot and dialogue transitions across ordinary backtracking", () => {
    const project = createDefaultProjectBundle();
    const sourceScene = project.scenes.items[0]!;
    const sceneB = addTestScene(project, "scene_b");
    const sceneC = addTestScene(project, "scene_c");
    const toSceneBHotspot = createTestHotspot("hotspot_to_b");
    toSceneBHotspot.targetSceneId = sceneB.id;
    sourceScene.hotspots = [toSceneBHotspot];

    const dialogueHotspot = createTestHotspot("hotspot_dialogue");
    dialogueHotspot.dialogueTreeId = "dialogue_route";
    sceneB.hotspots = [dialogueHotspot];
    sceneB.dialogueTreeIds = ["dialogue_route"];
    project.dialogues.items.push({
      id: "dialogue_route",
      name: "Route",
      startNodeId: "node_route",
      nodes: [
        {
          id: "node_route",
          speaker: "Guide",
          textId: "text.route",
          effects: [],
          choices: [
            {
              id: "choice_to_c",
              textId: "text.route.to_c",
              conditions: [{ type: "always" }],
              effects: [{ type: "goToScene", sceneId: sceneC.id }]
            }
          ]
        }
      ]
    });

    const backHotspot = createTestHotspot("hotspot_back_to_start");
    backHotspot.targetSceneId = sourceScene.id;
    sceneC.hotspots = [backHotspot];

    const controller = createPlayerController(project);

    expect(controller.selectHotspot(toSceneBHotspot.id, 1000)).toEqual({
      transitionedToSceneId: sceneB.id
    });
    expect(controller.getSnapshot().scene.id).toBe(sceneB.id);
    expect(controller.selectHotspot(dialogueHotspot.id, 1000)).toEqual({
      startedDialogueTreeId: "dialogue_route"
    });
    expect(controller.getSnapshot().activeDialogue?.tree.id).toBe("dialogue_route");

    controller.chooseDialogueChoice("choice_to_c");
    expect(controller.getSnapshot().scene.id).toBe(sceneC.id);
    expect(controller.getSnapshot().activeDialogue).toBeUndefined();

    controller.selectHotspot(backHotspot.id, 1000);
    expect(controller.getSnapshot().scene.id).toBe(sourceScene.id);
    expect(controller.save().visitedSceneIds).toEqual([sourceScene.id, sceneB.id, sceneC.id]);
    expect(controller.getRuntimeIssues()).toEqual([]);
  });

  it("bounds recursively triggered effects within one player action", () => {
    const project = createDefaultProjectBundle();
    project.dialogues.items.push({
      id: "dialogue_recursive",
      name: "Recursive dialogue",
      startNodeId: "node_recursive",
      nodes: [
        {
          id: "node_recursive",
          speaker: "Narrator",
          textId: "text.recursive",
          effects: [{ type: "playDialogue", dialogueTreeId: "dialogue_recursive" }],
          choices: []
        }
      ]
    });
    const controller = createPlayerController(project, undefined, { effectBudget: 4 });

    expect(() => controller.startDialogue("dialogue_recursive")).not.toThrow();
    expect(controller.getSnapshot().activeDialogue?.tree.id).toBe("dialogue_recursive");
    expect(controller.getRuntimeIssues()).toEqual([
      {
        code: "effect-budget-exceeded",
        message: "Effect budget of 4 exceeded after 4 effects.",
        scenePath: [project.manifest.startSceneId],
        effectsExecuted: 4,
        effectBudget: 4
      }
    ]);
  });

  it("resolves scene playback duration from active media range", () => {
    expect(resolveSceneTimelineDurationMs(undefined, 4000, 9000)).toBe(13000);
    expect(resolveSceneTimelineDurationMs(18000, 12000, 22000)).toBe(34000);
    expect(resolveSceneTimelineDurationMs()).toBe(30000);
  });

  it("maps audio playback positions back onto the scene playhead", () => {
    expect(getSceneAudioPlayheadMs(1.5, 9, 4000)).toBe(5500);
    expect(getSceneAudioPlayheadMs(15, 9, 4000)).toBe(13000);
  });

  it("resolves waiting, playing, and ended scene-audio sync states", () => {
    expect(resolveSceneAudioSyncState(1200, 4000, 9000)).toEqual({
      phase: "waiting",
      effectivePlayheadMs: 1200,
      cycleDurationMs: 13000,
      targetAudioCurrentTimeMs: 0,
      startDelayMs: 2800
    });
    expect(resolveSceneAudioSyncState(5500, 4000, 9000)).toEqual({
      phase: "playing",
      effectivePlayheadMs: 5500,
      cycleDurationMs: 13000,
      targetAudioCurrentTimeMs: 1500,
      startDelayMs: 0
    });
    expect(resolveSceneAudioSyncState(18000, 4000, 9000)).toEqual({
      phase: "ended",
      effectivePlayheadMs: 13000,
      cycleDurationMs: 13000,
      targetAudioCurrentTimeMs: 9000,
      startDelayMs: 0
    });
  });

  it("wraps looping scene-audio sync states back into the current cycle", () => {
    expect(resolveSceneAudioSyncState(14500, 4000, 9000, true)).toEqual({
      phase: "waiting",
      effectivePlayheadMs: 1500,
      cycleDurationMs: 13000,
      targetAudioCurrentTimeMs: 0,
      startDelayMs: 2500
    });
    expect(resolveSceneAudioSyncState(22500, 4000, 9000, true)).toEqual({
      phase: "playing",
      effectivePlayheadMs: 9500,
      cycleDurationMs: 13000,
      targetAudioCurrentTimeMs: 5500,
      startDelayMs: 0
    });
  });

  it("preserves paused scene-audio playback when the playhead is scrubbed", () => {
    const waitingState = resolveSceneAudioSyncState(1200, 4000, 9000);
    const playingState = resolveSceneAudioSyncState(5500, 4000, 9000);

    expect(resolveSceneAudioPlaybackDirective(waitingState, true)).toEqual({
      shouldPlay: false,
      shouldScheduleDelayedPlayback: true
    });
    expect(resolveSceneAudioPlaybackDirective(playingState, true)).toEqual({
      shouldPlay: true,
      shouldScheduleDelayedPlayback: false
    });
    expect(resolveSceneAudioPlaybackDirective(waitingState, false)).toEqual({
      shouldPlay: false,
      shouldScheduleDelayedPlayback: false
    });
    expect(resolveSceneAudioPlaybackDirective(playingState, false)).toEqual({
      shouldPlay: false,
      shouldScheduleDelayedPlayback: false
    });
  });
});

function addTestScene(project: ProjectBundle, sceneId: string): Scene {
  const location = project.locations.items[0]!;
  const scene: Scene = {
    id: sceneId,
    locationId: location.id,
    name: sceneId,
    sceneAudioLoop: true,
    sceneAudioDelayMs: 0,
    backgroundVideoLoop: false,
    hotspots: [],
    dialogueTreeIds: [],
    onEnterEffects: [],
    onExitEffects: []
  };

  project.scenes.items.push(scene);
  location.sceneIds.push(scene.id);
  return scene;
}

function createTestHotspot(hotspotId: string): Hotspot {
  return {
    id: hotspotId,
    name: hotspotId,
    x: 0,
    y: 0,
    width: 0.1,
    height: 0.1,
    startMs: 0,
    endMs: 30000,
    timingMode: "sceneDuration",
    requiredItemIds: [],
    conditions: [{ type: "always" }],
    effects: []
  };
}

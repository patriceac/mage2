import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, createInitialSaveState } from "@mage2/schema";
import {
  createPlayerController,
  getSceneAudioPlayheadMs,
  resolveSceneAudioPlaybackDirective,
  resolveSceneAudioSyncState,
  resolveSceneTimelineDurationMs
} from "./index";

describe("player controller", () => {
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

import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, createInitialSaveState } from "@mage2/schema";
import {
  createPlayerController,
  getSceneAudioPlayheadMs,
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

  it("returns active subtitle cue text from string-backed scene tracks, including overlaps and line breaks", () => {
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
    project.scenes.items[0].subtitleTracks = [
      {
        id: "subtitle_one",
        cues: [
          {
            id: "cue_one",
            startMs: 0,
            endMs: 2000,
            textId: "text.cue_one.subtitle"
          }
        ]
      },
      {
        id: "subtitle_two",
        cues: [
          {
            id: "cue_two",
            startMs: 1000,
            endMs: 3000,
            textId: "text.cue_two.subtitle"
          }
        ]
      }
    ];
    project.strings.byLocale[project.manifest.defaultLanguage]["text.cue_one.subtitle"] = "First line\nSecond line";
    project.strings.byLocale[project.manifest.defaultLanguage]["text.cue_two.subtitle"] = "Overlapping cue";

    const controller = createPlayerController(project);

    expect(controller.getSubtitleLines(500, project.manifest.defaultLanguage)).toEqual(["First line\nSecond line"]);
    expect(controller.getSubtitleLines(1500, project.manifest.defaultLanguage)).toEqual([
      "First line\nSecond line",
      "Overlapping cue"
    ]);
    expect(controller.getSubtitleLines(3500, project.manifest.defaultLanguage)).toEqual([]);
  });

  it("extends the scene timeline to cover the first delayed scene-audio pass", () => {
    expect(resolveSceneTimelineDurationMs(undefined, 4000, 9000)).toBe(30000);
    expect(resolveSceneTimelineDurationMs(18000, 12000, 22000)).toBe(34000);
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
});

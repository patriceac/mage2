import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, createInitialSaveState } from "@mage2/schema";
import { createPlayerController, resolveSceneTimelineDurationMs } from "./index";

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
});

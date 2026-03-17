import { describe, expect, it } from "vitest";
import {
  createDefaultProjectBundle,
  createInitialSaveState,
  migrateProjectBundle,
  resolveRelativeHotspotContentBox,
  validateProject
} from "./index";

describe("schema migrations", () => {
  it("upgrades a pre-versioned project bundle", () => {
    const migrated = migrateProjectBundle({
      manifest: {
        projectId: "legacy",
        projectName: "Legacy",
        defaultLanguage: "en",
        engineVersion: "0.0.1",
        startLocationId: "location_intro",
        startSceneId: "scene_intro"
      },
      assets: [],
      locations: [],
      scenes: [],
      dialogues: [],
      inventory: [],
      subtitles: [],
      strings: {}
    });

    expect(migrated.manifest.schemaVersion).toBe(3);
    expect(migrated.assets.schemaVersion).toBe(3);
    expect(migrated.strings.schemaVersion).toBe(3);
  });

  it("drops legacy segment fields while defaulting scene background video looping", () => {
    const migrated = migrateProjectBundle({
      manifest: {
        schemaVersion: 1,
        projectId: "legacy",
        projectName: "Legacy",
        defaultLanguage: "en",
        engineVersion: "0.0.1",
        startLocationId: "location_intro",
        startSceneId: "scene_intro",
        buildSettings: {
          outputDir: "build",
          includeSourceMap: false
        }
      },
      assets: {
        schemaVersion: 1,
        assets: [{ id: "asset_placeholder", kind: "image", name: "starter.png", sourcePath: "D:\\starter.png", importedAt: "2026-03-15T00:00:00.000Z" }]
      },
      locations: {
        schemaVersion: 1,
        items: [{ id: "location_intro", name: "Intro", x: 0, y: 0, sceneIds: ["scene_intro"] }]
      },
      scenes: {
        schemaVersion: 1,
        items: [
          {
            id: "scene_intro",
            locationId: "location_intro",
            name: "Opening",
            backgroundAssetId: "asset_placeholder",
            defaultSegmentId: "segment_intro",
            clipSegments: [
              {
                id: "segment_intro",
                name: "Intro",
                assetId: "asset_placeholder",
                startMs: 0,
                endMs: 1000,
                nextSceneId: "scene_later"
              }
            ]
          }
        ]
      },
      dialogues: { schemaVersion: 1, items: [] },
      inventory: { schemaVersion: 1, items: [] },
      subtitles: { schemaVersion: 1, items: [] },
      strings: { schemaVersion: 1, values: {} }
    });

    expect(migrated.scenes.items[0]?.backgroundVideoLoop).toBe(false);
    expect(migrated.scenes.items[0]?.subtitleTracks).toEqual([]);
    expect(migrated.scenes.items[0]).not.toHaveProperty("defaultSegmentId");
    expect(migrated.scenes.items[0]).not.toHaveProperty("clipSegments");
  });

  it("moves legacy normalized subtitle tracks into scenes, duplicates shared tracks, and inlines cue text", () => {
    const migrated = migrateProjectBundle({
      manifest: {
        schemaVersion: 2,
        projectId: "legacy",
        projectName: "Legacy",
        defaultLanguage: "en",
        engineVersion: "0.1.0",
        startLocationId: "location_intro",
        startSceneId: "scene_intro",
        buildSettings: {
          outputDir: "build",
          includeSourceMap: false
        }
      },
      assets: {
        schemaVersion: 2,
        assets: [
          {
            id: "asset_video",
            kind: "video",
            name: "clip.mp4",
            sourcePath: "D:\\media\\clip.mp4",
            importedAt: "2026-03-15T00:00:00.000Z"
          },
          {
            id: "asset_subtitle",
            kind: "subtitle",
            name: "captions.vtt",
            sourcePath: "D:\\media\\captions.vtt",
            importedAt: "2026-03-15T00:00:00.000Z"
          }
        ]
      },
      locations: {
        schemaVersion: 2,
        items: [
          {
            id: "location_intro",
            name: "Intro",
            x: 0,
            y: 0,
            sceneIds: ["scene_intro", "scene_two"]
          }
        ]
      },
      scenes: {
        schemaVersion: 2,
        items: [
          {
            id: "scene_intro",
            locationId: "location_intro",
            name: "Opening",
            backgroundAssetId: "asset_video",
            subtitleTrackIds: ["subtitle_shared", "subtitle_single"]
          },
          {
            id: "scene_two",
            locationId: "location_intro",
            name: "Second",
            backgroundAssetId: "asset_video",
            subtitleTrackIds: ["subtitle_shared"]
          }
        ]
      },
      dialogues: { schemaVersion: 2, items: [] },
      inventory: { schemaVersion: 2, items: [] },
      subtitles: {
        schemaVersion: 2,
        items: [
          {
            id: "subtitle_shared",
            assetId: "asset_subtitle",
            cues: [
              {
                id: "cue_shared",
                startMs: 0,
                endMs: 1000,
                textId: "text.subtitle.shared"
              }
            ]
          },
          {
            id: "subtitle_single",
            assetId: "asset_subtitle",
            cues: [
              {
                id: "cue_single",
                startMs: 1000,
                endMs: 2000,
                textId: "text.subtitle.single"
              }
            ]
          }
        ]
      },
      strings: {
        schemaVersion: 2,
        values: {
          "text.subtitle.shared": "Shared cue",
          "text.subtitle.single": "Single cue",
          "text.other": "Keep me"
        }
      }
    });

    const introScene = migrated.scenes.items.find((scene) => scene.id === "scene_intro");
    const secondScene = migrated.scenes.items.find((scene) => scene.id === "scene_two");

    expect(introScene?.subtitleTracks).toHaveLength(2);
    expect(secondScene?.subtitleTracks).toHaveLength(1);
    expect(introScene?.subtitleTracks[0]?.cues[0]?.text).toBe("Shared cue");
    expect(introScene?.subtitleTracks[1]?.cues[0]?.text).toBe("Single cue");
    expect(secondScene?.subtitleTracks[0]?.cues[0]?.text).toBe("Shared cue");
    expect(introScene?.subtitleTracks[0]?.id).not.toBe("subtitle_shared");
    expect(secondScene?.subtitleTracks[0]?.id).not.toBe("subtitle_shared");
    expect(introScene?.subtitleTracks[0]?.id).not.toBe(secondScene?.subtitleTracks[0]?.id);
    expect(migrated.assets.assets.map((asset) => asset.id)).toEqual(["asset_video"]);
    expect(migrated.strings.values).toEqual({
      "text.other": "Keep me"
    });
  });

  it("creates starter projects and save states without segment fields", () => {
    const project = createDefaultProjectBundle();

    expect(project.scenes.items[0]).not.toHaveProperty("defaultSegmentId");
    expect(project.scenes.items[0]).not.toHaveProperty("clipSegments");
    expect(createInitialSaveState(project)).not.toHaveProperty("currentSegmentId");
  });
});

describe("project validation", () => {
  it("reports missing scene media on the starter template", () => {
    const report = validateProject(createDefaultProjectBundle());

    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SCENE_BACKGROUND_MISSING")).toBe(true);
  });

  it("allows overlapping subtitle cues while still preserving inline cue text", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_placeholder",
      kind: "image",
      name: "Placeholder",
      sourcePath: "placeholder.png",
      importedAt: new Date().toISOString()
    });
    project.scenes.items[0].subtitleTracks = [
      {
        id: "subtitle_scene",
        cues: [
          { id: "cue_one", startMs: 0, endMs: 2000, text: "First line" },
          { id: "cue_two", startMs: 1000, endMs: 3000, text: "Second line" }
        ]
      }
    ];

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "SUBTITLE_RANGE_INVALID")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SUBTITLE_OVERLAP")).toBe(false);
  });

  it("aligns the starter hotspot with the placeholder scene artwork", () => {
    const project = createDefaultProjectBundle();
    const hotspot = project.scenes.items[0]?.hotspots[0];

    expect(project.scenes.items[0]?.backgroundVideoLoop).toBe(false);
    expect(hotspot?.name).toBe("Placeholder");
    expect(hotspot?.commentTextId).toBe("text.hotspot.inspect.comment");
    expect(hotspot?.x).toBeCloseTo(900 / 1280);
    expect(hotspot?.y).toBeCloseTo(360 / 720);
    expect(hotspot?.width).toBeCloseTo(220 / 1280);
    expect(hotspot?.height).toBeCloseTo(170 / 720);
    expect(hotspot?.polygon).toEqual([
      { x: 900 / 1280, y: 360 / 720 },
      { x: 1120 / 1280, y: 360 / 720 },
      { x: 1120 / 1280, y: 530 / 720 },
      { x: 900 / 1280, y: 530 / 720 }
    ]);
    expect(project.strings.values["text.hotspot.inspect"]).toBe("Placeholder");
    expect(project.strings.values["text.hotspot.inspect.comment"]).toBe("Add real hotspots in Scenes");
  });

  it("treats legacy segment links as removed during reachability checks", () => {
    const project = migrateProjectBundle({
      manifest: {
        schemaVersion: 1,
        projectId: "legacy",
        projectName: "Legacy",
        defaultLanguage: "en",
        engineVersion: "0.0.1",
        startLocationId: "location_intro",
        startSceneId: "scene_intro",
        buildSettings: {
          outputDir: "build",
          includeSourceMap: false
        }
      },
      assets: {
        schemaVersion: 1,
        assets: [
          {
            id: "asset_placeholder",
            kind: "image",
            name: "starter.png",
            sourcePath: "D:\\starter.png",
            importedAt: "2026-03-15T00:00:00.000Z"
          }
        ]
      },
      locations: {
        schemaVersion: 1,
        items: [
          {
            id: "location_intro",
            name: "Intro",
            x: 0,
            y: 0,
            sceneIds: ["scene_intro", "scene_two"]
          }
        ]
      },
      scenes: {
        schemaVersion: 1,
        items: [
          {
            id: "scene_intro",
            locationId: "location_intro",
            name: "Opening",
            backgroundAssetId: "asset_placeholder",
            clipSegments: [
              {
                id: "segment_intro",
                name: "Intro",
                assetId: "asset_placeholder",
                startMs: 0,
                endMs: 1000,
                nextSceneId: "scene_two"
              }
            ]
          },
          {
            id: "scene_two",
            locationId: "location_intro",
            name: "Second",
            backgroundAssetId: "asset_placeholder"
          }
        ]
      },
      dialogues: { schemaVersion: 1, items: [] },
      inventory: { schemaVersion: 1, items: [] },
      subtitles: { schemaVersion: 1, items: [] },
      strings: { schemaVersion: 1, values: {} }
    });

    const report = validateProject(project);

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SCENE_UNREACHABLE",
          entityId: "scene_two"
        })
      ])
    );
  });
});

describe("hotspot content placement", () => {
  it("anchors content near the polygon centroid instead of the bounding box top", () => {
    const placement = resolveRelativeHotspotContentBox({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      polygon: [
        { x: 0.33, y: 0 },
        { x: 0.9, y: 0.12 },
        { x: 1, y: 0.95 },
        { x: 0, y: 0.9 }
      ]
    });

    expect(placement.x).toBeGreaterThan(0.45);
    expect(placement.x).toBeLessThan(0.6);
    expect(placement.y).toBeGreaterThan(0.42);
    expect(placement.y).toBeLessThan(0.62);
    expect(placement.width).toBeLessThan(0.9);
    expect(placement.height).toBeLessThan(0.9);
  });
});

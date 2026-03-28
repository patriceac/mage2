import { describe, expect, it } from "vitest";
import {
  createDefaultProjectBundle,
  createInitialSaveState,
  parseProjectBundle,
  resolveAssetCategory,
  resolveHotspotBounds,
  resolveHotspotClipPath,
  resolveHotspotRotationDegrees,
  resolveRelativeHotspotContentBox,
  resolveRelativeHotspotFrame,
  resolveRelativeHotspotVisualBox,
  validateProject
} from "./index";

describe("project defaults", () => {
  it("creates starter projects and save states without segment fields", () => {
    const project = createDefaultProjectBundle();

    expect(project.scenes.items[0]).not.toHaveProperty("defaultSegmentId");
    expect(project.scenes.items[0]).not.toHaveProperty("clipSegments");
    expect(project.scenes.items[0]?.sceneAudioLoop).toBe(true);
    expect(project.scenes.items[0]?.sceneAudioDelayMs).toBe(0);
    expect(createInitialSaveState(project)).not.toHaveProperty("currentSegmentId");
  });

  it("does not seed legacy location description or scene overlay strings in starter projects", () => {
    const project = createDefaultProjectBundle();

    expect(project.locations.items[0]).not.toHaveProperty("descriptionTextId");
    expect(project.scenes.items[0]).not.toHaveProperty("overlayTextId");
    expect(project.strings.byLocale[project.manifest.defaultLanguage]).not.toHaveProperty("text.location.intro");
    expect(project.strings.byLocale[project.manifest.defaultLanguage]).not.toHaveProperty("text.scene.intro");
  });

  it("normalizes legacy visual assets to background and legacy audio assets to scene audio", () => {
    const parsed = parseProjectBundle({
      manifest: {
        schemaVersion: 4,
        projectId: "project_categories",
        projectName: "Categories",
        defaultLanguage: "en",
        supportedLocales: ["en"],
        engineVersion: "0.1.0",
        assetRoots: [],
        startLocationId: "location_intro",
        startSceneId: "scene_intro",
        buildSettings: { outputDir: "build", includeSourceMap: false }
      },
      assets: {
        schemaVersion: 4,
        assets: [
          {
            id: "asset_image",
            kind: "image",
            name: "background.png",
            variants: {
              en: {
                sourcePath: "background.png",
                importedAt: new Date().toISOString()
              }
            }
          },
          {
            id: "asset_audio",
            kind: "audio",
            name: "legacy.mp3",
            variants: {
              en: {
                sourcePath: "legacy.mp3",
                importedAt: new Date().toISOString()
              }
            }
          }
        ]
      },
      locations: { schemaVersion: 4, items: [{ id: "location_intro", name: "Intro", x: 0, y: 0, sceneIds: ["scene_intro"] }] },
      scenes: {
        schemaVersion: 4,
        items: [
          {
            id: "scene_intro",
            locationId: "location_intro",
            name: "Intro",
            backgroundAssetId: "asset_image",
            backgroundVideoLoop: false,
            hotspots: [],
            subtitleTracks: [],
            dialogueTreeIds: [],
            onEnterEffects: [],
            onExitEffects: []
          }
        ]
      },
      dialogues: { schemaVersion: 4, items: [] },
      inventory: { schemaVersion: 4, items: [] },
      strings: { schemaVersion: 4, byLocale: { en: {} } }
    });

    expect(parsed.assets.assets).toHaveLength(2);
    expect(resolveAssetCategory(parsed.assets.assets[0]!)).toBe("background");
    expect(resolveAssetCategory(parsed.assets.assets[1]!)).toBe("sceneAudio");
    expect(parsed.scenes.items[0]?.sceneAudioLoop).toBe(true);
    expect(parsed.scenes.items[0]?.sceneAudioDelayMs).toBe(0);
    expect(parsed.scenes.items[0]?.hotspots).toEqual([]);
  });

  it("parses hotspots without inventory-item links from legacy projects", () => {
    const parsed = parseProjectBundle({
      manifest: {
        schemaVersion: 5,
        projectId: "project_legacy_hotspot",
        projectName: "Legacy Hotspot",
        defaultLanguage: "en",
        supportedLocales: ["en"],
        engineVersion: "0.1.0",
        assetRoots: [],
        startLocationId: "location_intro",
        startSceneId: "scene_intro",
        buildSettings: { outputDir: "build", includeSourceMap: false }
      },
      assets: { schemaVersion: 5, assets: [] },
      locations: { schemaVersion: 5, items: [{ id: "location_intro", name: "Intro", x: 0, y: 0, sceneIds: ["scene_intro"] }] },
      scenes: {
        schemaVersion: 5,
        items: [
          {
            id: "scene_intro",
            locationId: "location_intro",
            name: "Intro",
            backgroundVideoLoop: false,
            hotspots: [
              {
                id: "hotspot_one",
                name: "Hotspot 1",
                x: 0.1,
                y: 0.2,
                width: 0.3,
                height: 0.2,
                polygon: [
                  { x: 0.1, y: 0.2 },
                  { x: 0.4, y: 0.2 },
                  { x: 0.4, y: 0.4 },
                  { x: 0.1, y: 0.4 }
                ],
                startMs: 0,
                endMs: 30000,
                requiredItemIds: [],
                conditions: [{ type: "always" }],
                effects: []
              }
            ],
            subtitleTracks: [],
            dialogueTreeIds: [],
            onEnterEffects: [],
            onExitEffects: []
          }
        ]
      },
      dialogues: { schemaVersion: 5, items: [] },
      inventory: { schemaVersion: 5, items: [] },
      strings: { schemaVersion: 5, byLocale: { en: {} } }
    });

    expect(parsed.manifest.schemaVersion).toBe(6);
    expect(parsed.scenes.items[0]?.hotspots[0]).not.toHaveProperty("inventoryItemId");
  });

  it("round-trips inventory-backed hotspot links", () => {
    const project = createDefaultProjectBundle();
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
    project.strings.byLocale.en["text.item_lantern.name"] = "Lantern";
    project.scenes.items[0]!.hotspots[0]!.inventoryItemId = "item_lantern";

    const parsed = parseProjectBundle(project);

    expect(parsed.scenes.items[0]?.hotspots[0]?.inventoryItemId).toBe("item_lantern");
  });
});

describe("project validation", () => {
  it("reports missing scene media on the starter template", () => {
    const report = validateProject(createDefaultProjectBundle());

    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SCENE_BACKGROUND_MISSING")).toBe(true);
  });

  it("allows scenes without backgroundAssetId to parse and reports them as missing background media", () => {
    const project = createDefaultProjectBundle();
    project.scenes.items.push({
      id: "scene_empty",
      locationId: project.locations.items[0]!.id,
      name: "Empty Scene",
      sceneAudioLoop: true,
      sceneAudioDelayMs: 0,
      backgroundVideoLoop: false,
      hotspots: [],
      subtitleTracks: [],
      dialogueTreeIds: [],
      onEnterEffects: [],
      onExitEffects: []
    });
    project.locations.items[0]!.sceneIds.push("scene_empty");

    const parsed = parseProjectBundle(project);
    const report = validateProject(parsed);
    const issue = report.issues.find((entry) => entry.code === "SCENE_BACKGROUND_MISSING" && entry.entityId === "scene_empty");

    expect(parsed.scenes.items.find((scene) => scene.id === "scene_empty")?.backgroundAssetId).toBeUndefined();
    expect(issue?.message).toBe("Scene 'scene_empty' does not have a background asset assigned.");
  });

  it("reports missing localized scene audio variants", () => {
    const project = createDefaultProjectBundle();
    project.manifest.supportedLocales = ["fr"];
    project.assets.assets.push(
      {
        id: "asset_placeholder",
        kind: "image",
        name: "Placeholder",
        variants: {
          en: {
            sourcePath: "placeholder.png",
            importedAt: new Date().toISOString()
          }
        }
      },
      {
        id: "asset_scene_audio",
        kind: "audio",
        name: "ambience.mp3",
        category: "sceneAudio",
        variants: {
          en: {
            sourcePath: "ambience.mp3",
            importedAt: new Date().toISOString()
          }
        }
      }
    );
    project.scenes.items[0].sceneAudioAssetId = "asset_scene_audio";

    const issue = validateProject(project).issues.find((entry) => entry.code === "SCENE_AUDIO_LOCALE_MISSING");

    expect(issue).toMatchObject({
      entityId: "asset_scene_audio",
      locale: "fr",
      level: "error"
    });
  });

  it("rejects scene audio when the background asset is a video", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push(
      {
        id: "asset_video",
        kind: "video",
        name: "intro.mp4",
        variants: {
          en: {
            sourcePath: "intro.mp4",
            importedAt: new Date().toISOString()
          }
        }
      },
      {
        id: "asset_scene_audio",
        kind: "audio",
        name: "ambience.mp3",
        category: "sceneAudio",
        variants: {
          en: {
            sourcePath: "ambience.mp3",
            importedAt: new Date().toISOString()
          }
        }
      }
    );
    project.scenes.items[0].backgroundAssetId = "asset_video";
    project.scenes.items[0].sceneAudioAssetId = "asset_scene_audio";

    expect(validateProject(project).issues.some((issue) => issue.code === "SCENE_AUDIO_REQUIRES_IMAGE_BACKGROUND")).toBe(
      true
    );
  });

  it("rejects scene audio when no background asset is assigned", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_scene_audio",
      kind: "audio",
      name: "ambience.mp3",
      category: "sceneAudio",
      variants: {
        en: {
          sourcePath: "ambience.mp3",
          importedAt: new Date().toISOString()
        }
      }
    });
    delete project.scenes.items[0].backgroundAssetId;
    project.scenes.items[0].sceneAudioAssetId = "asset_scene_audio";

    expect(validateProject(project).issues.some((issue) => issue.code === "SCENE_AUDIO_REQUIRES_IMAGE_BACKGROUND")).toBe(
      true
    );
  });

  it("allows overlapping subtitle cues when they resolve through string-backed text ids", () => {
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
        id: "subtitle_scene",
        cues: [
          { id: "cue_one", startMs: 0, endMs: 2000, textId: "text.cue_one.subtitle" },
          { id: "cue_two", startMs: 1000, endMs: 3000, textId: "text.cue_two.subtitle" }
        ]
      }
    ];
    project.strings.byLocale[project.manifest.defaultLanguage]["text.cue_one.subtitle"] = "First line";
    project.strings.byLocale[project.manifest.defaultLanguage]["text.cue_two.subtitle"] = "Second line";

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "SUBTITLE_RANGE_INVALID")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SUBTITLE_OVERLAP")).toBe(false);
  });

  it("reports missing subtitle text ids as errors", () => {
    const project = createDefaultProjectBundle();
    project.scenes.items[0].subtitleTracks = [
      {
        id: "subtitle_scene",
        cues: [{ id: "cue_missing", startMs: 0, endMs: 2000, textId: "text.cue_missing.subtitle" }]
      }
    ];

    const report = validateProject(project);
    const issue = report.issues.find((entry) => entry.code === "SUBTITLE_TEXT_MISSING");

    expect(issue).toMatchObject({
      level: "error",
      entityId: "cue_missing",
      locale: project.manifest.defaultLanguage
    });
  });

  it("reports missing inventory text warnings while ignoring legacy location and scene text fields", () => {
    const project = createDefaultProjectBundle();
    project.locations.items[0]!.descriptionTextId = "text.location.intro";
    project.inventory.items.push({
      id: "item_intro",
      name: "Lantern",
      textId: "text.item_intro.name",
      descriptionTextId: "text.item_intro.description"
    });

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "LOCATION_DESCRIPTION_TEXT_MISSING")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SCENE_OVERLAY_TEXT_MISSING")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "INVENTORY_NAME_TEXT_MISSING")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "INVENTORY_DESCRIPTION_TEXT_MISSING")).toBe(true);
  });

  it("warns when inventory items are missing assigned art", () => {
    const project = createDefaultProjectBundle();
    project.inventory.items.push({
      id: "item_intro",
      name: "Lantern",
      textId: "text.item_intro.name"
    });
    project.strings.byLocale.en["text.item_intro.name"] = "Lantern";

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "INVENTORY_IMAGE_MISSING" && issue.level === "warning")).toBe(true);
  });

  it("rejects inventory items that reference background assets as their art", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_background",
      kind: "image",
      name: "background.png",
      category: "background",
      variants: {
        en: {
          sourcePath: "background.png",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.inventory.items.push({
      id: "item_intro",
      name: "Lantern",
      textId: "text.item_intro.name",
      imageAssetId: "asset_background"
    });
    project.strings.byLocale.en["text.item_intro.name"] = "Lantern";

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "INVENTORY_IMAGE_CATEGORY_INVALID")).toBe(true);
  });

  it("rejects hotspots that reference missing linked inventory items", () => {
    const project = createDefaultProjectBundle();
    project.scenes.items[0]!.hotspots[0]!.inventoryItemId = "item_missing";

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "HOTSPOT_INVENTORY_ITEM_MISSING")).toBe(true);
  });

  it("aligns the starter hotspot with the desk doors in the placeholder scene artwork", () => {
    const project = createDefaultProjectBundle();
    const hotspot = project.scenes.items[0]?.hotspots[0];

    expect(project.scenes.items[0]?.backgroundVideoLoop).toBe(false);
    expect(hotspot?.name).toBe("Placeholder");
    expect(hotspot?.commentTextId).toBe("text.hotspot.inspect.comment");
    expect(hotspot?.x).toBeCloseTo(338 / 1280);
    expect(hotspot?.y).toBeCloseTo(444 / 720);
    expect(hotspot?.width).toBeCloseTo(244 / 1280);
    expect(hotspot?.height).toBeCloseTo(148 / 720);
    expect(hotspot?.polygon).toHaveLength(4);
    expect(hotspot?.polygon[0]?.x).toBeCloseTo(338 / 1280);
    expect(hotspot?.polygon[0]?.y).toBeCloseTo(444 / 720);
    expect(hotspot?.polygon[1]?.x).toBeCloseTo(582 / 1280);
    expect(hotspot?.polygon[1]?.y).toBeCloseTo(444 / 720);
    expect(hotspot?.polygon[2]?.x).toBeCloseTo(582 / 1280);
    expect(hotspot?.polygon[2]?.y).toBeCloseTo(592 / 720);
    expect(hotspot?.polygon[3]?.x).toBeCloseTo(338 / 1280);
    expect(hotspot?.polygon[3]?.y).toBeCloseTo(592 / 720);
    expect(hotspot).not.toHaveProperty("labelTextId");
    expect(project.strings.byLocale[project.manifest.defaultLanguage]).not.toHaveProperty("text.hotspot.inspect");
    expect(project.strings.byLocale[project.manifest.defaultLanguage]["text.hotspot.inspect.comment"]).toBe(
      "Add real hotspots in Scenes"
    );
  });

  it("treats hotspot targets and go-to-scene effects as reachable links", () => {
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
    project.locations.items[0]?.sceneIds.push("scene_two", "scene_three");
    project.scenes.items[0]!.hotspots[0]!.targetSceneId = "scene_two";
    project.scenes.items[0]!.onEnterEffects = [{ type: "goToScene", sceneId: "scene_three" }];
    project.scenes.items.push(
      {
        id: "scene_two",
        locationId: project.locations.items[0]!.id,
        name: "Second",
        backgroundAssetId: "asset_placeholder",
        sceneAudioLoop: true,
        sceneAudioDelayMs: 0,
        backgroundVideoLoop: false,
        hotspots: [],
        subtitleTracks: [],
        dialogueTreeIds: [],
        onEnterEffects: [],
        onExitEffects: []
      },
      {
        id: "scene_three",
        locationId: project.locations.items[0]!.id,
        name: "Third",
        backgroundAssetId: "asset_placeholder",
        sceneAudioLoop: true,
        sceneAudioDelayMs: 0,
        backgroundVideoLoop: false,
        hotspots: [],
        subtitleTracks: [],
        dialogueTreeIds: [],
        onEnterEffects: [],
        onExitEffects: []
      }
    );

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "SCENE_UNREACHABLE" && issue.entityId === "scene_two")).toBe(
      false
    );
    expect(
      report.issues.some((issue) => issue.code === "SCENE_UNREACHABLE" && issue.entityId === "scene_three")
    ).toBe(false);
  });

  it("describes unreachable scenes with scene names in the validation message", () => {
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
    project.locations.items[0]?.sceneIds.push("scene_bpacnlcm");
    project.scenes.items.push({
      id: "scene_bpacnlcm",
      locationId: project.locations.items[0]!.id,
      name: "Scene 2",
      backgroundAssetId: "asset_placeholder",
      sceneAudioLoop: true,
      sceneAudioDelayMs: 0,
      backgroundVideoLoop: false,
      hotspots: [],
      subtitleTracks: [],
      dialogueTreeIds: [],
      onEnterEffects: [],
      onExitEffects: []
    });

    const report = validateProject(project);
    const unreachableSceneIssue = report.issues.find((issue) => issue.code === "SCENE_UNREACHABLE");

    expect(unreachableSceneIssue?.message).toBe("Scene 'Scene 2' is unreachable from 'Opening Scene'.");
  });
});

describe("hotspot content placement", () => {
  it("honors stored inventory polygons for bounds, clip paths, and rotation", () => {
    const hotspot = {
      inventoryItemId: "item_lantern",
      x: 0.2,
      y: 0.15,
      width: 0.18,
      height: 0.16,
      polygon: [
        { x: 0.22, y: 0.15 },
        { x: 0.38, y: 0.19 },
        { x: 0.36, y: 0.32 },
        { x: 0.2, y: 0.29 }
      ]
    };

    expect(resolveHotspotBounds(hotspot)).toEqual({
      x: 0.2,
      y: 0.15,
      width: 0.18,
      height: 0.17
    });
    expect(resolveHotspotClipPath(hotspot)).toBe("polygon(11.1111% 0%, 100% 23.5294%, 88.8889% 100%, 0% 82.3529%)");
    expect(resolveHotspotRotationDegrees(hotspot)).toBeCloseTo(14.04, 2);
  });

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

  it("keeps rotated inventory art sized to the rectangle instead of the bounding box", () => {
    const visualBox = resolveRelativeHotspotVisualBox(
      {
        inventoryItemId: "item_potion",
        x: 0.36,
        y: 0.36,
        width: 0.28,
        height: 0.28,
        polygon: [
          { x: 0.5, y: 0.36 },
          { x: 0.64, y: 0.5 },
          { x: 0.5, y: 0.64 },
          { x: 0.36, y: 0.5 }
        ]
      },
      {
        width: 100,
        height: 100
      }
    );

    expect(visualBox.x).toBeCloseTo(0.1464, 3);
    expect(visualBox.y).toBeCloseTo(0.1464, 3);
    expect(visualBox.width).toBeCloseTo(0.7071, 3);
    expect(visualBox.height).toBeCloseTo(0.7071, 3);
  });

  it("rectifies rotated inventory hotspots back to a rectangle for rendering", () => {
    const frame = resolveRelativeHotspotFrame(
      {
        inventoryItemId: "item_potion",
        x: 0.2,
        y: 0.15,
        width: 0.18,
        height: 0.17,
        polygon: [
          { x: 0.22, y: 0.15 },
          { x: 0.38, y: 0.19 },
          { x: 0.36, y: 0.32 },
          { x: 0.2, y: 0.29 }
        ]
      },
      {
        width: 1600,
        height: 900
      }
    );

    expect(frame.rotationDegrees).toBeCloseTo(8.0047, 4);
    expect(frame.polygon).toHaveLength(4);
    expect(Math.min(...frame.polygon.map((point) => point.x))).toBeLessThan(0.1);
    expect(Math.max(...frame.polygon.map((point) => point.x))).toBeGreaterThan(0.9);
    expect(Math.min(...frame.polygon.map((point) => point.y))).toBeLessThan(0);
    expect(Math.max(...frame.polygon.map((point) => point.y))).toBeGreaterThan(1);
  });

  it("allows wide rotated inventory art to extend beyond the bounding box before clipping", () => {
    const visualBox = resolveRelativeHotspotVisualBox(
      {
        inventoryItemId: "item_scroll",
        x: 0.32,
        y: 0.18,
        width: 0.16,
        height: 0.29,
        polygon: [
          { x: 0.3392, y: 0.1816 },
          { x: 0.4807, y: 0.433 },
          { x: 0.4608, y: 0.4684 },
          { x: 0.3193, y: 0.217 }
        ]
      },
      {
        width: 1600,
        height: 900
      }
    );

    expect(visualBox.x).toBeLessThan(0);
    expect(visualBox.width).toBeGreaterThan(1);
  });
});

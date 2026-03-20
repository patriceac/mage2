import { describe, expect, it } from "vitest";
import {
  createDefaultProjectBundle,
  createInitialSaveState,
  resolveRelativeHotspotContentBox,
  validateProject
} from "./index";

describe("project defaults", () => {
  it("creates starter projects and save states without segment fields", () => {
    const project = createDefaultProjectBundle();

    expect(project.scenes.items[0]).not.toHaveProperty("defaultSegmentId");
    expect(project.scenes.items[0]).not.toHaveProperty("clipSegments");
    expect(createInitialSaveState(project)).not.toHaveProperty("currentSegmentId");
  });

  it("does not seed legacy location description or scene overlay strings in starter projects", () => {
    const project = createDefaultProjectBundle();

    expect(project.locations.items[0]).not.toHaveProperty("descriptionTextId");
    expect(project.scenes.items[0]).not.toHaveProperty("overlayTextId");
    expect(project.strings.values).not.toHaveProperty("text.location.intro");
    expect(project.strings.values).not.toHaveProperty("text.scene.intro");
  });
});

describe("project validation", () => {
  it("reports missing scene media on the starter template", () => {
    const report = validateProject(createDefaultProjectBundle());

    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SCENE_BACKGROUND_MISSING")).toBe(true);
  });

  it("allows overlapping subtitle cues when they resolve through string-backed text ids", () => {
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
          { id: "cue_one", startMs: 0, endMs: 2000, textId: "text.cue_one.subtitle" },
          { id: "cue_two", startMs: 1000, endMs: 3000, textId: "text.cue_two.subtitle" }
        ]
      }
    ];
    project.strings.values["text.cue_one.subtitle"] = "First line";
    project.strings.values["text.cue_two.subtitle"] = "Second line";

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "SUBTITLE_RANGE_INVALID")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SUBTITLE_OVERLAP")).toBe(false);
  });

  it("reports missing subtitle text ids as warnings", () => {
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
      level: "warning",
      entityId: "cue_missing"
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
    expect(hotspot).not.toHaveProperty("labelTextId");
    expect(project.strings.values).not.toHaveProperty("text.hotspot.inspect");
    expect(project.strings.values["text.hotspot.inspect.comment"]).toBe("Add real hotspots in Scenes");
  });

  it("treats hotspot targets and go-to-scene effects as reachable links", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_placeholder",
      kind: "image",
      name: "Placeholder",
      sourcePath: "placeholder.png",
      importedAt: new Date().toISOString()
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
      sourcePath: "placeholder.png",
      importedAt: new Date().toISOString()
    });
    project.locations.items[0]?.sceneIds.push("scene_bpacnlcm");
    project.scenes.items.push({
      id: "scene_bpacnlcm",
      locationId: project.locations.items[0]!.id,
      name: "Scene 2",
      backgroundAssetId: "asset_placeholder",
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

import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, type Asset } from "@mage2/schema";
import {
  STARTER_PLACEHOLDER_ASSET_ID,
  addAssetRoots,
  addHotspot,
  collectAssetReferenceSummary,
  createProjectRevision,
  removeAssetFromProject
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
  it("reports scene backgrounds, clip segments, and subtitle tracks that use an asset", () => {
    const project = createDefaultProjectBundle("Asset usage");
    const scene = project.scenes.items[0];
    const primaryAsset = createAsset("asset_primary", "primary.png", "D:\\media\\primary.png");
    const secondaryAsset = createAsset("asset_secondary", "secondary.png", "D:\\other\\secondary.png");

    project.assets.assets = [primaryAsset, secondaryAsset];
    scene.backgroundAssetId = primaryAsset.id;
    scene.clipSegments = [
      {
        id: "segment_intro",
        name: "Intro clip",
        assetId: primaryAsset.id,
        startMs: 0,
        endMs: 1200,
        loop: false
      }
    ];
    scene.defaultSegmentId = "segment_intro";
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
      clipSegments: [
        {
          sceneId: scene.id,
          sceneName: scene.name,
          segmentId: "segment_intro",
          segmentName: "Intro clip"
        }
      ],
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
  it("reassigns scene backgrounds and removes dependent segments and subtitle tracks", () => {
    const project = createDefaultProjectBundle("Asset removal");
    const scene = project.scenes.items[0];
    const primaryAsset = createAsset("asset_primary", "primary.png", "D:\\media\\primary.png");
    const secondaryAsset = createAsset("asset_secondary", "secondary.png", "D:\\other\\secondary.png");

    project.assets.assets = [primaryAsset, secondaryAsset];
    addAssetRoots(project, project.assets.assets);
    scene.backgroundAssetId = primaryAsset.id;
    scene.clipSegments = [
      {
        id: "segment_intro",
        name: "Intro clip",
        assetId: primaryAsset.id,
        startMs: 0,
        endMs: 1200,
        loop: false
      }
    ];
    scene.defaultSegmentId = "segment_intro";
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
    expect(result.removedSegmentIds).toEqual(["segment_intro"]);
    expect(result.removedSubtitleTrackIds).toEqual(["subtitle_intro"]);
    expect(project.assets.assets.map((asset) => asset.id)).toEqual([secondaryAsset.id]);
    expect(project.manifest.assetRoots).toEqual(["D:\\other"]);
    expect(scene.backgroundAssetId).toBe(secondaryAsset.id);
    expect(scene.clipSegments).toEqual([]);
    expect(scene.defaultSegmentId).toBeUndefined();
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

import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "./project";
import { analyzeProjectAssetReachability, collectReferencedAssetIds } from "./asset-reachability";
import type { Asset } from "./types";

function asset(id: string, kind: Asset["kind"] = "image"): Asset {
  return {
    id,
    kind,
    name: id,
    variants: {}
  };
}

describe("project asset reachability", () => {
  it("collects every exported media reference without treating library presence as usage", () => {
    const project = createDefaultProjectBundle("Reachability");
    const scene = project.scenes.items[0]!;
    const hotspot = scene.hotspots[0]!;

    scene.backgroundAssetId = "asset_background";
    scene.sceneAudioAssetId = "asset_scene_audio";
    hotspot.mediaAssetId = "asset_hotspot_media";
    project.dialogues.items = [
      {
        id: "dialogue_main",
        name: "Main",
        startNodeId: "node_start",
        nodes: [
          {
            id: "node_start",
            speaker: "Mara",
            textId: "dialogue.start",
            mediaAssetId: "asset_dialogue_media",
            effects: [],
            choices: []
          }
        ]
      }
    ];
    project.inventory.items = [
      {
        id: "item_fuse",
        name: "Fuse",
        textId: "item.fuse",
        imageAssetId: "asset_inventory"
      }
    ];
    project.dialogues.responseGroups = [
      {
        id: "response_feedback",
        name: "Feedback",
        entries: [
          { id: "response_text", kind: "text", textId: "response.text" },
          { id: "response_audio", kind: "audio", assetId: "asset_response_audio" },
          { id: "response_video", kind: "video", assetId: "asset_response_video" }
        ]
      }
    ];
    project.manifest.playerPresentation.titleBackgroundAssetId = "asset_title";
    project.manifest.playerPresentation.logoAssetId = "asset_logo";
    project.manifest.playerPresentation.appIconAssetId = "asset_icon";

    const referencedIds = collectReferencedAssetIds(project);

    expect(referencedIds).toEqual(
      new Set([
        "asset_background",
        "asset_scene_audio",
        "asset_hotspot_media",
        "asset_dialogue_media",
        "asset_inventory",
        "asset_response_audio",
        "asset_response_video",
        "asset_title",
        "asset_logo",
        "asset_icon"
      ])
    );
  });

  it("reports referenced and unused library assets in stable project order", () => {
    const project = createDefaultProjectBundle("Reachability");
    project.manifest.playerPresentation.titleScreenEnabled = false;
    project.manifest.playerPresentation.titleBackgroundAssetId = undefined;
    project.manifest.playerPresentation.logoAssetId = undefined;
    project.manifest.playerPresentation.appIconAssetId = undefined;
    project.scenes.items[0]!.backgroundAssetId = "asset_used";
    project.assets.assets = [asset("asset_unused_first"), asset("asset_used"), asset("asset_unused_last")];

    expect(analyzeProjectAssetReachability(project)).toEqual({
      totalAssetCount: 3,
      referencedAssetCount: 1,
      unusedAssetCount: 2,
      referencedAssetIds: ["asset_used"],
      unusedAssetIds: ["asset_unused_first", "asset_unused_last"]
    });
  });
});

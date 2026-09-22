import { describe, expect, it } from "vitest";
import { InventoryItemSchema, createDefaultProjectBundle, createSaveEnvelope, loadSaveForProject } from "@mage2/schema";
import { createPlayerController } from "./index";

function fixture() {
  const project = createDefaultProjectBundle();
  project.assets.assets.push({ id: "foley", name: "Foley", kind: "audio", variants: { en: { sourcePath: "foley.wav", importedAt: "2026-09-22" } } });
  const scene = project.scenes.items[0]!;
  project.scenes.items.push({ ...scene, id: "second", hotspots: [] });
  project.locations.items[0]!.sceneIds.push("second");
  project.inventory.items.push(InventoryItemSchema.parse({ id: "reward", name: "Reward", textId: "reward.name" }));
  const hotspot = scene.hotspots[0]!;
  hotspot.targetSceneId = undefined;
  hotspot.dialogueTreeId = undefined;
  hotspot.effects = [{ type: "playSound", assetId: "foley", onceKey: "door" }, { type: "playSound", assetId: "foley", gain: 0.3 }];
  return { project, scene, hotspot };
}
describe("sound effect execution", () => {
  it("consumes once keys at the action boundary, survives save/load, and leaves replayable Foley repeatable", () => {
    const { project, hotspot } = fixture();
    const player = createPlayerController(project);
    player.selectHotspot(hotspot.id, 0);
    expect(player.getSnapshot().soundCues?.map((cue) => cue.gain)).toEqual([1, 0.3]);
    player.acknowledgeSoundCues(2);
    expect(player.getSnapshot().soundCues).toEqual([]);
    player.selectHotspot(hotspot.id, 0);
    expect(player.getSnapshot().soundCues?.map((cue) => cue.gain)).toEqual([0.3]);
    const restored = createPlayerController(project, loadSaveForProject(createSaveEnvelope(project, player.save()), project).saveState);
    expect(restored.getSnapshot().soundCues).toEqual([]);
    restored.selectHotspot(hotspot.id, 0);
    expect(restored.getSnapshot().soundCues).toHaveLength(1);
    expect(restored.getSnapshot().audioSessionId).not.toBe(player.getSnapshot().audioSessionId);
  });
  it("drops old scene cues and never re-runs completion rewards when media is replayed or skipped twice", () => {
    const { project, scene, hotspot } = fixture();
    scene.onMediaEndEffects = [{ type: "playSound", assetId: "foley" }, { type: "addItem", itemId: project.inventory.items[0]!.id }];
    const player = createPlayerController(project);
    player.completeSceneMedia();
    const first = player.getSnapshot();
    player.completeSceneMedia();
    expect(player.getSnapshot().soundCues).toEqual(first.soundCues);
    expect(player.save().inventory).toEqual(first.saveState.inventory);
    player.selectHotspot(hotspot.id, 0);
    player.enterScene(project.scenes.items[1]!.id);
    expect(player.getSnapshot().soundCues).toEqual([]);
    player.enterScene(scene.id);
    hotspot.effects = [{ type: "playSound", assetId: "foley" }, { type: "goToScene", sceneId: "second" }];
    player.selectHotspot(hotspot.id, 0);
    expect(player.getSnapshot().scene.id).toBe("second");
    expect(player.getSnapshot().soundCues).toHaveLength(1);
  });
});

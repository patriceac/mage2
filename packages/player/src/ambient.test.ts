import { describe, expect, it } from "vitest";
import { AmbientRegionSchema, createDefaultProjectBundle, type AmbientClip } from "@mage2/schema";
import { chooseAmbientClip, createAmbientRandom, createPlayerController, drawAmbientDelay } from "./index";

describe("ambient scheduling", () => {
  const clips: AmbientClip[] = [1, 3, 0].map((weight, index) => ({ assetId: `clip${index}`, registrationId: "pool", weight }));
  it("is deterministic per region, weighted, nonrepeating, and quarantines failures", () => {
    const sequence = () => { const random = createAmbientRandom(42, "lamp"); let previous: string | undefined; return Array.from({ length: 12 }, () => previous = chooseAmbientClip(clips, previous, random)?.assetId); };
    expect(sequence()).toEqual(sequence());
    const list = sequence();
    expect(list.every((id, i) => id !== list[i + 1])).toBe(true);
    expect(chooseAmbientClip(clips, undefined, () => 0.2)?.assetId).toBe("clip0");
    expect(chooseAmbientClip(clips, undefined, () => 0.3)?.assetId).toBe("clip1");
    expect(chooseAmbientClip(clips, "clip0", () => 0.9, new Set(["clip1"]))?.assetId).toBe("clip0");
    expect(chooseAmbientClip(clips, undefined, () => 0, new Set(["clip0", "clip1"]))).toBeUndefined();
  });
  it("draws inclusive delays including a zero-only range", () => {
    expect(drawAmbientDelay({ minDelayMs: 5000, maxDelayMs: 9000, repeatCount: 1 }, () => 0)).toBe(5000);
    expect(drawAmbientDelay({ minDelayMs: 5000, maxDelayMs: 9000, repeatCount: 1 }, () => 0.999999)).toBe(9000);
    expect(drawAmbientDelay({ minDelayMs: 0, maxDelayMs: 0, repeatCount: 0 }, () => 0.5)).toBe(0);
    expect(drawAmbientDelay({ minDelayMs: 0, maxDelayMs: 0, repeatCount: 1 }, () => { throw new Error("Fixed delay must not change clip randomness depending on preload timing"); })).toBe(0);
  });
  it("changes active regions with gameplay conditions without restarting same-scene interactions", () => {
    const project = createDefaultProjectBundle();
    project.manifest.variables.push({ id: "moving", name: "Moving", type: "boolean", initialValue: true, description: "", system: false });
    const scene = project.scenes.items[0]!;
    scene.ambient = { enabled: true, regions: [AmbientRegionSchema.parse({ id: "lamp", name: "Lamp", x: 0, y: 0, width: 1, height: 1, sourceWidth: 320, sourceHeight: 180, registrationId: "lamp", fallbackMode: "base", conditions: [{ type: "variableCompare", variableId: "moving", operator: "equals", value: true }], clips: [] })] };
    scene.hotspots[0]!.effects = [{ type: "setVariable", variableId: "moving", value: false }];
    project.scenes.items.push({ ...scene, id: "other_scene", ambient: undefined, hotspots: [] });
    const controller = createPlayerController(project);
    const before = controller.getSnapshot();
    expect(before.activeAmbientRegionIds).toEqual(["lamp"]);
    controller.selectHotspot(scene.hotspots[0]!.id, 0);
    expect(controller.getSnapshot().activeAmbientRegionIds).toEqual([]);
    expect(controller.getSnapshot().sceneEntrySequence).toBe(before.sceneEntrySequence);
    controller.enterScene(scene.id);
    expect(controller.getSnapshot().sceneEntrySequence).toBe(before.sceneEntrySequence);
    controller.enterScene("other_scene");
    controller.enterScene(scene.id);
    expect(controller.getSnapshot().sceneEntrySequence).toBeGreaterThan(before.sceneEntrySequence!);
  });
});

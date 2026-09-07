import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, type Effect } from "@mage2/schema";
import { collectDialogueUsage } from "./dialogue-usage";
import { createEditorTranslator, EDITOR_CATALOG } from "./i18n";
import { addDialogueTree } from "./project-helpers";

const t = createEditorTranslator(EDITOR_CATALOG, "en");
const play = (dialogueTreeId: string): Effect => ({ type: "playDialogue", dialogueTreeId });
const branch = (thenEffects: Effect[], elseEffects: Effect[]): Effect => ({
  type: "conditional", conditionMode: "all", conditions: [], thenEffects, elseEffects
});

describe("collectDialogueUsage", () => {
  it("finds direct, event and nested effect launches, deduping each event independently", () => {
    const project = createDefaultProjectBundle("Usage");
    const scene = project.scenes.items[0]!;
    const hotspot = scene.hotspots[0]!;
    hotspot.name = "Radio console";
    hotspot.dialogueTreeId = "intro";
    hotspot.effects = [play("intro"), branch([play("intro")], [branch([], [play("other")])])];
    hotspot.clickEvent = { dialogueTreeId: "intro", effects: [play("intro")] };
    hotspot.otherItemEvent = { effects: [branch([], [play("intro")])] };

    const usages = collectDialogueUsage(project, t);
    expect(usages.get("intro")).toHaveLength(3);
    expect(new Set(usages.get("intro")!.map((usage) => usage.key)).size).toBe(3);
    expect(usages.get("intro")!.map((usage) => usage.label)).toEqual([
      "Radio console", "Radio console · On click", "Radio console · Any other item"
    ]);
    expect(usages.get("other")).toEqual([expect.objectContaining({ kind: "scene", sceneId: scene.id, hotspotId: hotspot.id })]);
  });

  it("includes lifecycle effects without inventing a hotspot target or counting scene dialogue metadata", () => {
    const project = createDefaultProjectBundle("Usage");
    const scene = project.scenes.items[0]!;
    scene.dialogueTreeIds = ["metadata-only"];
    scene.onEnterEffects = [play("intro")];
    scene.onExitEffects = [branch([play("intro")], [])];
    scene.onMediaEndEffects = [branch([], [play("intro")])];
    const usages = collectDialogueUsage(project, t);
    expect(usages.has("metadata-only")).toBe(false);
    expect(usages.get("intro")).toHaveLength(3);
    for (const usage of usages.get("intro")!) {
      expect(usage).toMatchObject({ kind: "scene", sceneId: scene.id });
      expect(usage).not.toHaveProperty("hotspotId");
    }
    expect(usages.get("intro")!.map((usage) => usage.label)).toEqual([
      `On entering ${scene.name}`, `On leaving ${scene.name}`, `When media ends in ${scene.name}`
    ]);
  });

  it("points dialogue line and reply launches back to their authored source", () => {
    const project = createDefaultProjectBundle("Usage");
    const source = addDialogueTree(project);
    const node = source.nodes[0]!;
    node.effects = [play("target")];
    node.choices = [{ id: "reply", textId: "reply.text", conditions: [], effects: [branch([], [play("target")])] }];
    const usages = collectDialogueUsage(project, t).get("target")!;
    expect(usages).toHaveLength(2);
    for (const usage of usages) {
      expect(usage).toMatchObject({ kind: "dialogue", sourceDialogueId: source.id, nodeId: node.id, originName: source.name });
      expect(usage).not.toHaveProperty("sceneId");
    }
    expect(new Set(usages.map((usage) => usage.key)).size).toBe(2);
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, parseProjectBundle, toExportProjectData } from "@mage2/schema";
import { PlayerDialogueBox, resolvePlayerPreferences, resolvePlayerSystemCopy } from "./index";
import { narrationReadingTimeMs } from "./narration";

describe("narration", () => {
  it("allows a relaxed reading pace for short, long and unspaced text", () => {
    expect(narrationReadingTimeMs("A moment." )).toBe(8000);
    expect(narrationReadingTimeMs("word ".repeat(120))).toBeGreaterThanOrEqual(63000);
    expect(narrationReadingTimeMs("word. ".repeat(120))).toBeGreaterThan(narrationReadingTimeMs("word ".repeat(120)));
    expect(narrationReadingTimeMs("雨".repeat(100))).toBeGreaterThan(20000);
  });

  it("defaults auto advance on for old preferences and preserves explicit opt out", () => {
    for (const raw of [null, "{}", "broken", '{"autoAdvanceNarration":"false"}']) {
      expect(resolvePlayerPreferences(raw).autoAdvanceNarration).toBe(true);
    }
    expect(resolvePlayerPreferences('{"autoAdvanceNarration":false}').autoAdvanceNarration).toBe(false);
  });

  it("keeps narration explicit through migration and export, without restyling unpictured speakers", () => {
    const project = createDefaultProjectBundle("Narration");
    const node = { id: "line", speaker: "Prologue", narration: true, textId: "line", effects: [], choices: [] };
    const tree = { id: "story", name: "Story", startNodeId: node.id, nodes: [node] };
    project.dialogues.items = [tree];
    const reopened = parseProjectBundle(JSON.parse(JSON.stringify(project)));
    expect(toExportProjectData(reopened).dialogues[0]!.nodes[0]!.narration).toBe(true);
    const legacy = JSON.parse(JSON.stringify(project));
    for (const file of ["manifest", "assets", "locations", "scenes", "dialogues", "inventory", "strings"]) legacy[file].schemaVersion = 19;
    delete legacy.dialogues.items[0].nodes[0].narration;
    expect(parseProjectBundle(legacy).dialogues.items[0]!.nodes[0]!.narration).toBeUndefined();
    const props = { activeDialogue: { tree, node, choices: [] }, strings: { line: "The road waits." }, copy: resolvePlayerSystemCopy("fr"), onChoice() {}, onContinue() {} };
    const narration = renderToStaticMarkup(<PlayerDialogueBox {...props} portraitSrc="portrait.png" />);
    expect(narration).toContain("mage2-player__dialogue--narration");
    expect(narration).not.toContain("<img");
    const speech = renderToStaticMarkup(<PlayerDialogueBox {...props} activeDialogue={{ ...props.activeDialogue, node: { ...node, narration: undefined, speaker: "Marguerite" } }} />);
    expect(speech).not.toContain("mage2-player__dialogue--narration");
  });
});

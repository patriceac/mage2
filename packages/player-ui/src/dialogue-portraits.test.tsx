import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { PlayerDialogueBox, resolvePlayerDialoguePortraitSource, resolvePlayerSystemCopy } from "./index";

describe("dialogue portraits", () => {
  it("uses the same character portrait in different dialogue trees", () => {
    const project = createDefaultProjectBundle("Portrait runtime");
    project.dialogues.speakerPortraits = { Tancrede: "portrait" };
    project.assets.assets.push({
      id: "portrait", name: "Tancrede", kind: "image",
      variants: {
        en: { sourcePath: "tancrede.png", importedAt: "2026-09-17T00:00:00.000Z" },
        fr: { sourcePath: "tancrede-fr.png", proxyPath: "tancrede-fr.webp", importedAt: "2026-09-17T00:00:00.000Z" }
      }
    });
    project.dialogues.items = ["arrival", "farewell"].map((id) => ({
      id, name: id, startNodeId: id,
      nodes: [{ id, speaker: "Tancrede", textId: id, choices: [], effects: [] }]
    }));
    for (const dialogue of project.dialogues.items) {
      expect(resolvePlayerDialoguePortraitSource(dialogue.nodes[0]!.speaker, project, "en")).toBe("tancrede.png");
      expect(resolvePlayerDialoguePortraitSource(dialogue.nodes[0]!.speaker, project, "fr")).toBe("tancrede-fr.webp");
    }
    expect(resolvePlayerDialoguePortraitSource("Narrator", project, "en")).toBeUndefined();
    expect(resolvePlayerDialoguePortraitSource("Tancrede", project, "en", true)).toBeUndefined();
    expect(resolvePlayerDialoguePortraitSource("Tancrede", project, "en", false)).toBe("tancrede.png");
    project.assets.assets = project.assets.assets.filter((asset) => asset.id !== "portrait");
    expect(resolvePlayerDialoguePortraitSource("Tancrede", project, "en")).toBeUndefined();
  });

  it("renders a portrait beside the text without repeating the accessible speaker name", () => {
    const node = { id: "line", speaker: "Tancrede", textId: "line", choices: [], effects: [] };
    const tree = { id: "dialogue", name: "Dialogue", startNodeId: node.id, nodes: [node] };
    const props = {
      activeDialogue: { tree, node, choices: [] },
      strings: { line: "We should go." },
      copy: resolvePlayerSystemCopy("en"),
      onChoice: () => undefined,
      onContinue: () => undefined
    };
    const markup = renderToStaticMarkup(<PlayerDialogueBox {...props} portraitSrc="tancrede.png" />);
    expect(markup).toMatch(/<h4[^>]*>Tancrede<\/h4>/);
    expect(markup).toMatch(/<div class="mage2-player__dialogue-body"><img[^>]*src="tancrede.png"[^>]*alt=""[^>]*\/><p/);
    expect(markup).toContain("We should go.");
    expect(markup).toContain("mage2-player__dialogue-continue");
    expect(renderToStaticMarkup(<PlayerDialogueBox {...props} />)).not.toContain("mage2-player__dialogue-portrait");
  });
});

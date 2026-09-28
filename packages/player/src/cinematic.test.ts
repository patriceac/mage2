import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, parseProjectBundle, toExportProjectData } from "@mage2/schema";
import { createPlayerController } from "./index";

function cinematicProject() {
  const project = createDefaultProjectBundle("Cinematic playback");
  project.manifest.variables = [{ id: "entries", name: "Entries", type: "integer", initialValue: 0, description: "", system: false }];
  project.dialogues.items = [{
    id: "film", name: "Film", startNodeId: "line",
    nodes: [{ id: "line", speaker: "Speaker", textId: "line", cinematic: true, mediaAssetId: "clip", nextNodeId: "menu",
      choices: [], effects: [{ type: "changeVariable", variableId: "entries", delta: 1 }] },
    { id: "menu", speaker: "Speaker", textId: "menu", effects: [], choices: [
      { id: "replay", textId: "replay", nextNodeId: "line", conditions: [], effects: [] },
      { id: "exit", textId: "exit", conditions: [], effects: [] }
    ] }]
  }];
  return project;
}

describe("cinematic dialogue", () => {
  it("preserves opt-in and per-game subtitles through parsing/export, leaving legacy dialogue manual", () => {
    const project = cinematicProject();
    project.manifest.playerPresentation.subtitles = {
      fontFamily: "Georgia, serif", color: "#ffeedd", backgroundColor: "#112233", backgroundOpacity: 0.4, fontScale: 1.2,
      lineHeight: 1.2, bottomPercent: 8
    };
    const reopened = parseProjectBundle(JSON.parse(JSON.stringify(project)));
    const exported = toExportProjectData(reopened);
    expect(exported.dialogues[0]!.nodes[0]!.cinematic).toBe(true);
    expect(exported.manifest.playerPresentation.subtitles).toEqual(project.manifest.playerPresentation.subtitles);
    const legacy = JSON.parse(JSON.stringify(project));
    for (const key of ["manifest", "assets", "locations", "scenes", "dialogues", "inventory", "strings"]) legacy[key].schemaVersion = 20;
    delete legacy.dialogues.items[0].nodes[0].cinematic;
    delete legacy.manifest.playerPresentation.subtitles;
    const migrated = parseProjectBundle(legacy);
    expect(migrated.dialogues.items[0]!.nodes[0]!.cinematic).toBeUndefined();
    expect(migrated.manifest.playerPresentation.subtitles).toBeUndefined();
  });

  it("distinguishes replay/load entries without repeating load effects, and returns to explicit choices", () => {
    const project = cinematicProject();
    const controller = createPlayerController(project);
    controller.startDialogue("film");
    const first = controller.getSnapshot();
    controller.continueDialogue();
    expect(controller.getSnapshot().activeDialogue?.node.id).toBe("menu");
    controller.continueDialogue();
    expect(controller.getSnapshot().activeDialogue?.node.id).toBe("menu");
    controller.chooseDialogueChoice("replay");
    const replay = controller.getSnapshot();
    expect(replay.activeDialogue?.entrySequence).not.toBe(first.activeDialogue?.entrySequence);
    expect(replay.variables.entries).toBe(2);
    const loaded = createPlayerController(project, replay.saveState).getSnapshot();
    expect(loaded.audioSessionId).not.toBe(replay.audioSessionId);
    expect(loaded.activeDialogue?.node.id).toBe("line");
    expect(loaded.variables.entries).toBe(2);
    controller.continueDialogue();
    controller.chooseDialogueChoice("exit");
    expect(controller.getSnapshot().activeDialogue).toBeUndefined();
  });
});

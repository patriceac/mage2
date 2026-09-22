import { expect, it } from "vitest";
import { collectSceneLinks, createDefaultProjectBundle, validateProject } from "./index";

it("follows reachable dialogue nodes, choices and nested dialogue starts without cycles or unused-library links", () => {
  const project = createDefaultProjectBundle();
  const scene = project.scenes.items[0]!;
  const destinations = ["from-node", "from-choice", "unused"];
  project.scenes.items.push(...destinations.map((id) => ({ ...scene, id, name: id, hotspots: [] })));
  project.locations.items[0]!.sceneIds.push(...destinations);
  scene.dialogueTreeIds = ["intro", "library"];
  scene.hotspots[0]!.effects = [{ type: "playDialogue", dialogueTreeId: "intro" }];
  project.dialogues.items = [
    { id: "intro", name: "Intro", startNodeId: "hello", nodes: [
      { id: "hello", speaker: "Guide", textId: "hello", effects: [], choices: [], nextNodeId: "end" },
      { id: "end", speaker: "Guide", textId: "end", effects: [{ type: "goToScene", sceneId: "from-node" }], choices: [
        { id: "choice", textId: "choice", conditions: [], effects: [{ type: "conditional", conditionMode: "all", conditions: [{ type: "always" }], thenEffects: [{ type: "playDialogue", dialogueTreeId: "followup" }], elseEffects: [] }] }
      ] },
      { id: "unwired", speaker: "Guide", textId: "unwired", effects: [{ type: "goToScene", sceneId: "unused" }], choices: [] }
    ] },
    { id: "followup", name: "Followup", startNodeId: "again", nodes: [{ id: "again", speaker: "Guide", textId: "again", effects: [
      { type: "goToScene", sceneId: "from-choice" }, { type: "playDialogue", dialogueTreeId: "intro" }
    ], choices: [] }] },
    { id: "library", name: "Unused library", startNodeId: "library_line", nodes: [{ id: "library_line", speaker: "Guide", textId: "library", effects: [{ type: "goToScene", sceneId: "unused" }], choices: [] }] }
  ];
  expect(collectSceneLinks(scene, project.dialogues.items).sort()).toEqual(["from-choice", "from-node"]);
  expect(validateProject(project).issues.filter((issue) => issue.code === "SCENE_UNREACHABLE").map((issue) => issue.entityId)).toEqual(["unused"]);
  scene.hotspots[0]!.effects = [];
  scene.hotspots[0]!.clickEvent = { effects: [], dialogueTreeId: "intro" };
  expect(collectSceneLinks(scene, project.dialogues.items).sort()).toEqual(["from-choice", "from-node"]);
});

import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import {
  collectVariableUsage,
  createGameVariableDefinition,
  createVariableId,
  isValueValidForVariable
} from "./logic-model";

describe("logic model", () => {
  it("creates stable, collision-free IDs for variables and choice options", () => {
    expect(createVariableId("Cabinet Opened", ["cabinet.opened"])).toBe("cabinet.opened.2");

    const variable = createGameVariableDefinition(
      "Character trust",
      "choice",
      [],
      ["Unknown", "Unknown", "Close Friend"]
    );

    expect(variable).toMatchObject({
      id: "character.trust",
      type: "choice",
      initialValue: "unknown",
      options: [
        { id: "unknown", name: "Unknown" },
        { id: "unknown.2", name: "Unknown" },
        { id: "close.friend", name: "Close Friend" }
      ]
    });
  });

  it("validates values according to the authored variable type", () => {
    const booleanVariable = createGameVariableDefinition("Door open", "boolean", []);
    const integerVariable = createGameVariableDefinition("Attempts", "integer", []);
    const choiceVariable = createGameVariableDefinition("Trust", "choice", [], ["Neutral", "Friend"]);

    expect(isValueValidForVariable(booleanVariable, true)).toBe(true);
    expect(isValueValidForVariable(booleanVariable, 1)).toBe(false);
    expect(isValueValidForVariable(integerVariable, 2)).toBe(true);
    expect(isValueValidForVariable(integerVariable, 2.5)).toBe(false);
    expect(isValueValidForVariable(choiceVariable, "friend")).toBe(true);
    expect(isValueValidForVariable(choiceVariable, "rival")).toBe(false);
  });

  it("counts conditions and actions across scenes, events, and dialogue", () => {
    const project = createDefaultProjectBundle("Usage");
    project.manifest.variables.push({
      id: "door.open",
      name: "Door open",
      description: "",
      type: "boolean",
      initialValue: false,
      system: false
    });
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    hotspot.conditions = [{ type: "variableCompare", variableId: "door.open", operator: "equals", value: false }];
    hotspot.effects = [{ type: "setVariable", variableId: "door.open", value: true }];
    hotspot.clickEvent = { effects: [{ type: "setVariable", variableId: "door.open", value: false }] };
    project.scenes.items[0]!.onEnterEffects = [{
      type: "conditional",
      conditionMode: "all",
      conditions: [{ type: "variableCompare", variableId: "door.open", operator: "equals", value: true }],
      thenEffects: [{ type: "setVariable", variableId: "door.open", value: false }],
      elseEffects: []
    }];
    project.dialogues.items.push({
      id: "dialogue_test",
      name: "Test",
      startNodeId: "node_test",
      nodes: [{
        id: "node_test",
        speaker: "Guide",
        textId: "text.node_test",
        effects: [{ type: "setVariable", variableId: "door.open", value: true }],
        choices: [{
          id: "choice_test",
          textId: "text.choice_test",
          conditions: [{ type: "variableCompare", variableId: "door.open", operator: "equals", value: true }],
          effects: [{ type: "setVariable", variableId: "door.open", value: false }]
        }]
      }]
    });

    expect(collectVariableUsage(project)).toEqual([
      { variableId: "door.open", conditions: 3, effects: 5 }
    ]);
  });
});

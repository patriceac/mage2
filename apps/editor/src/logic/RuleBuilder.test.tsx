import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { ConditionListEditor, EffectListEditor } from "./RuleBuilder";

describe("visual rule builders", () => {
  it("renders named, sentence-like conditions without exposing JSON", () => {
    const project = createDefaultProjectBundle("Conditions");
    project.manifest.variables.push({
      id: "door.open",
      name: "Door open",
      description: "",
      type: "boolean",
      initialValue: false,
      system: false
    });
    const markup = renderToStaticMarkup(
      <ConditionListEditor
        project={project}
        label="Available when"
        conditions={[
          { type: "variableCompare", variableId: "door.open", operator: "equals", value: true },
          { type: "sceneVisited", sceneId: project.manifest.startSceneId, visited: true }
        ]}
        mode="all"
        onChange={() => undefined}
      />
    );

    expect(markup).toContain("Available when");
    expect(markup).toContain("Door open");
    expect(markup).toContain("All conditions");
    expect(markup).toContain("Add condition...");
    expect(markup).toContain("New variable");
    expect(markup).not.toContain('value="newVariable"');
    expect(markup).not.toContain("Create a variable...");
    expect(markup).not.toContain("textarea");
    expect(markup).not.toContain("JSON");
  });

  it("shows ordered actions and warns when a terminal action is not last", () => {
    const project = createDefaultProjectBundle("Actions");
    project.manifest.variables.push({
      id: "door.open",
      name: "Door open",
      description: "",
      type: "boolean",
      initialValue: false,
      system: false
    });
    const markup = renderToStaticMarkup(
      <EffectListEditor
        project={project}
        label="Then"
        effects={[
          { type: "goToScene", sceneId: project.manifest.startSceneId },
          { type: "setVariable", variableId: "door.open", value: true }
        ]}
        onChange={() => undefined}
      />
    );

    expect(markup).toContain("Then");
    expect(markup).toContain("Go to scene");
    expect(markup).toContain("Set variable");
    expect(markup).toContain("New variable");
    expect(markup).toContain("Move it last unless that is intentional");
    expect(markup).not.toContain('value="newVariable"');
    expect(markup).not.toContain("Create a variable...");
    expect(markup).not.toContain("JSON");
  });

  it("keeps variable creation next to number fields instead of listing it as an action", () => {
    const project = createDefaultProjectBundle("Number variables");
    project.manifest.variables.push({
      id: "attempts",
      name: "Attempts",
      description: "",
      type: "integer",
      initialValue: 0,
      system: false
    });
    const markup = renderToStaticMarkup(
      <EffectListEditor
        project={project}
        label="Actions"
        effects={[{ type: "changeVariable", variableId: "attempts", delta: 1 }]}
        onChange={() => undefined}
      />
    );

    expect(markup).toContain("Number variable");
    expect(markup).toContain("New variable");
    expect(markup).not.toContain('value="newVariable"');
    expect(markup).not.toContain("Create a variable...");
  });

  it("renders action-first If / Then / Else branches without raw code", () => {
    const project = createDefaultProjectBundle("Conditional actions");
    project.manifest.variables.push({
      id: "cabinet.open",
      name: "Cabinet door open",
      description: "",
      type: "boolean",
      initialValue: false,
      system: false
    });
    const markup = renderToStaticMarkup(
      <EffectListEditor
        project={project}
        label="Actions"
        effects={[{
          type: "conditional",
          conditionMode: "all",
          conditions: [{ type: "variableCompare", variableId: "cabinet.open", operator: "equals", value: true }],
          thenEffects: [{ type: "goToScene", sceneId: project.manifest.startSceneId }],
          elseEffects: [{ type: "setVariable", variableId: "cabinet.open", value: true }]
        }]}
        onChange={() => undefined}
      />
    );

    expect(markup).toContain("If / Then / Else");
    expect(markup).toContain("Choose a branch");
    expect(markup).toContain("Cabinet door open");
    expect(markup).toContain("Then");
    expect(markup).toContain("Else");
    expect(markup).not.toContain("textarea");
    expect(markup).not.toContain("JSON");
  });

  it("exposes If / Then / Else as a direct top-level action without allowing nested decisions", () => {
    const project = createDefaultProjectBundle("Discoverable conditional actions");
    const topLevelMarkup = renderToStaticMarkup(
      <EffectListEditor
        project={project}
        label="Actions"
        effects={[]}
        onChange={() => undefined}
      />
    );
    const nestedMarkup = renderToStaticMarkup(
      <EffectListEditor
        project={project}
        label="Then"
        effects={[]}
        nestingDepth={1}
        onChange={() => undefined}
      />
    );

    expect(topLevelMarkup).toContain('class="button-secondary logic-editor__conditional-shortcut"');
    expect(topLevelMarkup).toContain("If / Then / Else");
    expect(nestedMarkup).not.toContain("logic-editor__conditional-shortcut");
    expect(nestedMarkup).not.toContain('value="conditional"');
  });

  it("starts a new decision with an explicit condition choice instead of an unrelated default", () => {
    const project = createDefaultProjectBundle("Blank decision");
    const markup = renderToStaticMarkup(
      <EffectListEditor
        project={project}
        label="Actions"
        effects={[{
          type: "conditional",
          conditionMode: "all",
          conditions: [],
          thenEffects: [],
          elseEffects: []
        }]}
        onChange={() => undefined}
      />
    );

    expect(markup).toContain('aria-label="Choose condition"');
    expect(markup).toContain("Choose condition...");
    expect(markup).not.toContain("<strong>Always</strong>");
  });
});

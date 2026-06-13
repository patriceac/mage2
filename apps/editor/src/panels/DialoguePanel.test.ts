import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle, type ProjectBundle } from "@mage2/schema";
import { addDialogueTree } from "../project-helpers";
import { DialoguePanel } from "./DialoguePanel";

const mockedStore = vi.hoisted(() => {
  const noop = () => {};

  return {
    state: {
      selectedDialogueId: undefined as string | undefined,
      selectedDialogueNodeId: undefined as string | undefined,
      setSelectedDialogueId: noop,
      setSelectedDialogueNodeId: noop
    } as any
  };
});

vi.mock("../store", () => {
  const useEditorStore = ((selector: (state: typeof mockedStore.state) => unknown) =>
    selector(mockedStore.state)) as typeof import("../store").useEditorStore;

  useEditorStore.setState = (partial) => {
    mockedStore.state = {
      ...mockedStore.state,
      ...(typeof partial === "function" ? partial(mockedStore.state as never) : partial)
    };
  };

  useEditorStore.getState = () => mockedStore.state as never;

  return { useEditorStore };
});

function renderDialoguePanel(configureProject: (project: ProjectBundle) => void) {
  const project = createDefaultProjectBundle("Dialogue test");
  configureProject(project);

  return renderToStaticMarkup(
    React.createElement(DialoguePanel, {
      project,
      mutateProject: () => {}
    })
  );
}

describe("DialoguePanel", () => {
  beforeEach(() => {
    mockedStore.state.selectedDialogueId = undefined;
    mockedStore.state.selectedDialogueNodeId = undefined;
  });

  it("presents dialogue authoring as a library, builder, preview, and launch handoff", () => {
    const markup = renderDialoguePanel((project) => {
      const dialogue = addDialogueTree(project);
      project.scenes.items[0].hotspots[0]!.dialogueTreeId = dialogue.id;
      mockedStore.state.selectedDialogueId = dialogue.id;
      mockedStore.state.selectedDialogueNodeId = dialogue.startNodeId;
    });

    expect(markup).toContain("Dialogue Authoring");
    expect(markup).toContain("Find dialogue");
    expect(markup).toContain("New Dialogue");
    expect(markup).toContain("Add Line");
    expect(markup).toContain("Write dialogue here. Start it from a hotspot in Scenes.");
    expect(markup).toContain("Set up in Scenes");
    expect(markup).toContain(">First line</span>");
    expect(markup).toContain(">Who speaks</span>");
    expect(markup).toContain(">What they say</span>");
    expect(markup).toContain(">After this line</span>");
    expect(markup).toContain(">Player replies</h5>");
    expect(markup).toContain("Add Reply");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('title="Collapse this line."');
    expect(markup).toContain("Preview");
    expect(markup).toContain("Start this dialogue from a hotspot in Scenes");
    expect(markup).toContain("Go to Scenes");
    expect(markup).toContain("Starts from 1 hotspot");
    expect(markup).toContain("Advanced line effects");
    expect(markup).toContain("Advanced reply rules");
    expect(markup).not.toContain("Dialogue map preview");
    expect(markup).not.toContain("Next Node");
  });

  it("renders one expanded line editor inside the script builder", () => {
    const markup = renderDialoguePanel((project) => {
      const dialogue = addDialogueTree(project);
      const secondNodeId = "node_second";
      const secondTextId = "text.node_second.line";
      project.strings.byLocale.en[secondTextId] = "Second line";
      dialogue.nodes.push({
        id: secondNodeId,
        speaker: "Guide",
        textId: secondTextId,
        choices: [],
        effects: []
      });
      mockedStore.state.selectedDialogueId = dialogue.id;
      mockedStore.state.selectedDialogueNodeId = dialogue.startNodeId;
    });

    expect(markup.match(/>Who speaks<\/span>/g)).toHaveLength(1);
    expect(markup.match(/>What they say<\/span>/g)).toHaveLength(1);
    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(1);
    expect(markup).toContain('title="Edit this line."');
    expect(markup).toContain("Hero: Opening line");
    expect(markup).toContain("Guide: Second line");
  });

  it("keeps dialogue lines folded when no line is selected", () => {
    const markup = renderDialoguePanel((project) => {
      const dialogue = addDialogueTree(project);
      mockedStore.state.selectedDialogueId = dialogue.id;
      mockedStore.state.selectedDialogueNodeId = undefined;
    });

    expect(markup).not.toContain(">Who speaks</span>");
    expect(markup).not.toContain(">What they say</span>");
    expect(markup).not.toContain('aria-expanded="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('title="Edit this line."');
    expect(markup).toContain("Select a line to preview it.");
  });

  it("uses a clear empty state when there are no dialogues", () => {
    const markup = renderDialoguePanel(() => {
      mockedStore.state.selectedDialogueId = undefined;
      mockedStore.state.selectedDialogueNodeId = undefined;
    });

    expect(markup).toContain("Create your first dialogue");
    expect(markup).toContain("Write the conversation here, then start it from a hotspot in Scenes.");
  });
});

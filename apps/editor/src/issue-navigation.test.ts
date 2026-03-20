import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, validateProject } from "@mage2/schema";
import { addDialogueTree } from "./project-helpers";
import { resolveIssueNavigation } from "./issue-navigation";

describe("resolveIssueNavigation", () => {
  it("routes missing hotspot comment text to the Localization tab", () => {
    const project = createDefaultProjectBundle("Hotspot comment navigation");
    delete project.strings.values[project.scenes.items[0].hotspots[0].commentTextId!];

    const issue = validateProject(project).issues.find((entry) => entry.code === "HOTSPOT_COMMENT_TEXT_MISSING");
    const target = issue ? resolveIssueNavigation(project, issue) : undefined;

    expect(target).toMatchObject({
      tab: "localization",
      textId: "text.hotspot.inspect.comment",
      label: "text.hotspot.inspect.comment"
    });
  });

  it("routes missing subtitle cue text to the Localization tab", () => {
    const project = createDefaultProjectBundle("Subtitle navigation");
    project.scenes.items[0].subtitleTracks = [
      {
        id: "subtitle_intro",
        cues: [{ id: "cue_intro", startMs: 0, endMs: 1000, textId: "text.cue_intro.subtitle" }]
      }
    ];

    const issue = validateProject(project).issues.find((entry) => entry.code === "SUBTITLE_TEXT_MISSING");
    const target = issue ? resolveIssueNavigation(project, issue) : undefined;

    expect(target).toMatchObject({
      tab: "localization",
      textId: "text.cue_intro.subtitle",
      label: "text.cue_intro.subtitle"
    });
  });

  it("routes empty subtitle cue text to the Localization tab", () => {
    const project = createDefaultProjectBundle("Empty subtitle navigation");
    project.scenes.items[0].subtitleTracks = [
      {
        id: "subtitle_intro",
        cues: [{ id: "cue_intro", startMs: 0, endMs: 1000, textId: "text.cue_intro.subtitle" }]
      }
    ];
    project.strings.values["text.cue_intro.subtitle"] = "";

    const issue = validateProject(project).issues.find((entry) => entry.code === "SUBTITLE_TEXT_EMPTY");
    const target = issue ? resolveIssueNavigation(project, issue) : undefined;

    expect(target).toMatchObject({
      tab: "localization",
      textId: "text.cue_intro.subtitle",
      label: "text.cue_intro.subtitle"
    });
  });

  it("routes missing dialogue line text to the Localization tab", () => {
    const project = createDefaultProjectBundle("Dialogue line navigation");
    const dialogue = addDialogueTree(project);
    const nodeTextId = dialogue.nodes[0].textId;
    delete project.strings.values[nodeTextId];

    const issue = validateProject(project).issues.find((entry) => entry.code === "DIALOGUE_TEXT_MISSING");
    const target = issue ? resolveIssueNavigation(project, issue) : undefined;

    expect(target).toMatchObject({
      tab: "localization",
      textId: nodeTextId,
      label: nodeTextId
    });
  });

  it("routes missing dialogue choice text to the Localization tab", () => {
    const project = createDefaultProjectBundle("Dialogue choice navigation");
    const dialogue = addDialogueTree(project);
    const choiceTextId = dialogue.nodes[0].choices[0].textId;
    delete project.strings.values[choiceTextId];

    const issue = validateProject(project).issues.find((entry) => entry.code === "DIALOGUE_CHOICE_TEXT_MISSING");
    const target = issue ? resolveIssueNavigation(project, issue) : undefined;

    expect(target).toMatchObject({
      tab: "localization",
      textId: choiceTextId,
      label: choiceTextId
    });
  });

  it("routes missing inventory name text to the Localization tab", () => {
    const project = createDefaultProjectBundle("Inventory navigation");
    const item = {
      id: "item_navigation",
      name: "Lantern",
      textId: "text.item_navigation.name",
      descriptionTextId: "text.item_navigation.description"
    };

    project.inventory.items.push(item);
    project.strings.values[item.descriptionTextId] = "A trusty lantern";

    const nameIssue = validateProject(project).issues.find((entry) => entry.code === "INVENTORY_NAME_TEXT_MISSING");
    const nameTarget = nameIssue ? resolveIssueNavigation(project, nameIssue) : undefined;

    expect(nameTarget).toMatchObject({
      tab: "localization",
      textId: item.textId,
      label: item.textId
    });
  });

  it("routes missing inventory description text to the Localization tab", () => {
    const project = createDefaultProjectBundle("Inventory description navigation");
    const item = {
      id: "item_navigation",
      name: "Lantern",
      textId: "text.item_navigation.name",
      descriptionTextId: "text.item_navigation.description"
    };

    project.inventory.items.push(item);
    project.strings.values[item.textId] = "Lantern";

    const descriptionIssue = validateProject(project).issues.find(
      (entry) => entry.code === "INVENTORY_DESCRIPTION_TEXT_MISSING"
    );
    const descriptionTarget = descriptionIssue ? resolveIssueNavigation(project, descriptionIssue) : undefined;

    expect(descriptionTarget).toMatchObject({
      tab: "localization",
      textId: item.descriptionTextId,
      label: item.descriptionTextId
    });
  });
});

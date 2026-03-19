import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, validateProject } from "@mage2/schema";
import { addDialogueTree } from "./project-helpers";
import { resolveIssueNavigation } from "./issue-navigation";

describe("resolveIssueNavigation", () => {
  it("routes missing hotspot label text to the Localization tab", () => {
    const project = createDefaultProjectBundle("Hotspot label navigation");
    delete project.strings.values[project.scenes.items[0].hotspots[0].labelTextId];

    const issue = validateProject(project).issues.find((entry) => entry.code === "HOTSPOT_TEXT_MISSING");
    const target = issue ? resolveIssueNavigation(project, issue) : undefined;

    expect(target).toMatchObject({
      tab: "localization",
      textId: "text.hotspot.inspect",
      label: "text.hotspot.inspect"
    });
  });

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
});

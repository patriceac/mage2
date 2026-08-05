import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, validateProject, validateProjectReleaseReadiness } from "@mage2/schema";
import { addDialogueTree } from "./project-helpers";
import { resolveIssueNavigation, resolveVisibleIssuesForTab } from "./issue-navigation";

function getDefaultStrings(project: ReturnType<typeof createDefaultProjectBundle>) {
  return project.strings.byLocale[project.manifest.defaultLanguage];
}

describe("resolveIssueNavigation", () => {
  it("shows all issues on World and only tab-local issues elsewhere", () => {
    const project = createDefaultProjectBundle("Contextual issue filtering");
    const openingScene = project.scenes.items[0];
    openingScene.backgroundAssetId = undefined;
    delete getDefaultStrings(project)[openingScene.hotspots[0].commentTextId!];
    project.inventory.items.push({
      id: "item_unillustrated",
      name: "Unillustrated Item",
      textId: "text.item_unillustrated.name"
    });
    getDefaultStrings(project)["text.item_unillustrated.name"] = "Unillustrated Item";

    const issues = validateProject(project).issues;
    const issueCodes = issues.map((issue) => issue.code);

    expect(issueCodes).toEqual(
      expect.arrayContaining(["SCENE_BACKGROUND_MISSING", "HOTSPOT_COMMENT_TEXT_MISSING", "INVENTORY_IMAGE_MISSING"])
    );
    expect(resolveVisibleIssuesForTab(project, issues, "world")).toHaveLength(issues.length);
    expect(resolveVisibleIssuesForTab(project, issues, "scenes").map((issue) => issue.code)).toEqual([
      "SCENE_BACKGROUND_MISSING"
    ]);
    expect(resolveVisibleIssuesForTab(project, issues, "localization").map((issue) => issue.code)).toEqual([
      "HOTSPOT_COMMENT_TEXT_MISSING"
    ]);
    expect(resolveVisibleIssuesForTab(project, issues, "inventory").map((issue) => issue.code)).toEqual([
      "INVENTORY_IMAGE_MISSING"
    ]);
    expect(resolveVisibleIssuesForTab(project, issues, "playtest")).toHaveLength(0);
  });

  it("routes missing hotspot comment text to the Localization tab", () => {
    const project = createDefaultProjectBundle("Hotspot comment navigation");
    delete getDefaultStrings(project)[project.scenes.items[0].hotspots[0].commentTextId!];

    const issue = validateProject(project).issues.find((entry) => entry.code === "HOTSPOT_COMMENT_TEXT_MISSING");
    const target = issue ? resolveIssueNavigation(project, issue) : undefined;

    expect(target).toMatchObject({
      tab: "localization",
      textId: "text.hotspot.inspect.comment",
      label: "text.hotspot.inspect.comment",
      localizationSection: "strings"
    });
  });

  it("routes missing dialogue line text to the Localization tab", () => {
    const project = createDefaultProjectBundle("Dialogue line navigation");
    const dialogue = addDialogueTree(project);
    const nodeTextId = dialogue.nodes[0].textId;
    delete getDefaultStrings(project)[nodeTextId];

    const issue = validateProject(project).issues.find((entry) => entry.code === "DIALOGUE_TEXT_MISSING");
    const target = issue ? resolveIssueNavigation(project, issue) : undefined;

    expect(target).toMatchObject({
      tab: "localization",
      textId: nodeTextId,
      label: nodeTextId,
      localizationSection: "strings"
    });
  });

  it("routes missing dialogue choice text to the Localization tab", () => {
    const project = createDefaultProjectBundle("Dialogue choice navigation");
    const dialogue = addDialogueTree(project);
    const choiceTextId = dialogue.nodes[0].choices[0].textId;
    delete getDefaultStrings(project)[choiceTextId];

    const issue = validateProject(project).issues.find((entry) => entry.code === "DIALOGUE_CHOICE_TEXT_MISSING");
    const target = issue ? resolveIssueNavigation(project, issue) : undefined;

    expect(target).toMatchObject({
      tab: "localization",
      textId: choiceTextId,
      label: choiceTextId,
      localizationSection: "strings"
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
    getDefaultStrings(project)[item.descriptionTextId] = "A trusty lantern";

    const nameIssue = validateProject(project).issues.find((entry) => entry.code === "INVENTORY_NAME_TEXT_MISSING");
    const nameTarget = nameIssue ? resolveIssueNavigation(project, nameIssue) : undefined;

    expect(nameTarget).toMatchObject({
      tab: "localization",
      textId: item.textId,
      label: item.textId,
      localizationSection: "strings"
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
    getDefaultStrings(project)[item.textId] = "Lantern";

    const descriptionIssue = validateProject(project).issues.find(
      (entry) => entry.code === "INVENTORY_DESCRIPTION_TEXT_MISSING"
    );
    const descriptionTarget = descriptionIssue ? resolveIssueNavigation(project, descriptionIssue) : undefined;

    expect(descriptionTarget).toMatchObject({
      tab: "localization",
      textId: item.descriptionTextId,
      label: item.descriptionTextId,
      localizationSection: "strings"
    });
  });

  it("routes missing localized scene media to Localization > Media", () => {
    const project = createDefaultProjectBundle("Localized media navigation");
    project.manifest.supportedLocales = ["fr"];
    project.assets.assets.push({
      id: "asset_starter_scene",
      kind: "image",
      name: "Placeholder",
      variants: {
        en: {
          sourcePath: "placeholder.png",
          importedAt: new Date().toISOString()
        }
      }
    });

    const issue = validateProject(project).issues.find((entry) => entry.code === "SCENE_BACKGROUND_LOCALE_MISSING");
    const target = issue ? resolveIssueNavigation(project, issue) : undefined;

    expect(target).toMatchObject({
      tab: "localization",
      assetId: project.scenes.items[0].backgroundAssetId,
      locale: "fr",
      localizationSection: "media"
    });
  });

  it("routes missing localized scene audio to Localization > Media", () => {
    const project = createDefaultProjectBundle("Localized scene audio navigation");
    project.manifest.supportedLocales = ["fr"];
    project.assets.assets.push(
      {
        id: "asset_placeholder",
        kind: "image",
        name: "Placeholder",
        variants: {
          en: {
            sourcePath: "placeholder.png",
            importedAt: new Date().toISOString()
          }
        }
      },
      {
        id: "asset_scene_audio",
        kind: "audio",
        name: "ambience.mp3",
        category: "sceneAudio",
        variants: {
          en: {
            sourcePath: "ambience.mp3",
            importedAt: new Date().toISOString()
          }
        }
      }
    );
    project.scenes.items[0].sceneAudioAssetId = "asset_scene_audio";

    const issue = validateProject(project).issues.find((entry) => entry.code === "SCENE_AUDIO_LOCALE_MISSING");
    const target = issue ? resolveIssueNavigation(project, issue) : undefined;

    expect(target).toMatchObject({
      tab: "localization",
      assetId: "asset_scene_audio",
      locale: "fr",
      localizationSection: "media"
    });
  });

  it("routes scene-audio image-background violations back to Scenes", () => {
    const project = createDefaultProjectBundle("Scene audio validation navigation");
    project.assets.assets.push(
      {
        id: "asset_video",
        kind: "video",
        name: "intro.mp4",
        variants: {
          en: {
            sourcePath: "intro.mp4",
            importedAt: new Date().toISOString()
          }
        }
      },
      {
        id: "asset_scene_audio",
        kind: "audio",
        name: "ambience.mp3",
        category: "sceneAudio",
        variants: {
          en: {
            sourcePath: "ambience.mp3",
            importedAt: new Date().toISOString()
          }
        }
      }
    );
    project.scenes.items[0].backgroundAssetId = "asset_video";
    project.scenes.items[0].sceneAudioAssetId = "asset_scene_audio";

    const issue = validateProject(project).issues.find((entry) => entry.code === "SCENE_AUDIO_REQUIRES_IMAGE_BACKGROUND");
    const target = issue ? resolveIssueNavigation(project, issue) : undefined;

    expect(target).toMatchObject({
      tab: "scenes",
      sceneId: project.scenes.items[0].id
    });
  });

  it("routes release-readiness blockers to the authored starter content", () => {
    const project = createDefaultProjectBundle("Release issue navigation");
    project.assets.assets.push({
      id: "asset_starter_title",
      kind: "image",
      category: "player",
      name: "Starter title",
      provenance: { source: "starter-kit", packId: "cinematic", packVersion: 1 },
      variants: {
        en: { sourcePath: "starter-title.png", importedAt: "2026-08-05T00:00:00.000Z" }
      }
    });
    const issues = validateProjectReleaseReadiness(project).issues;

    expect(resolveIssueNavigation(project, issues.find((issue) => issue.code === "STARTER_SCENE_MEDIA_IN_USE")!)).toMatchObject({
      tab: "scenes",
      sceneId: "scene_intro"
    });
    expect(resolveIssueNavigation(project, issues.find((issue) => issue.code === "STARTER_HOTSPOT_UNWIRED")!)).toMatchObject({
      tab: "scenes",
      sceneId: "scene_intro",
      hotspotId: "hotspot_inspect"
    });
    expect(resolveIssueNavigation(project, issues.find((issue) => issue.code === "STARTER_PLAYER_ARTWORK_IN_USE")!)).toMatchObject({
      tab: "player"
    });
  });
});

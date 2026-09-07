import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, validateProject } from "@mage2/schema";
import { FirstProjectChecklist } from "./FirstProjectChecklist";
import { resolveFirstProjectChecklist, resolveNewProjectWorkspace, shouldShowProjectIssuesSidebar } from "./first-project-checklist";

describe("first project checklist", () => {
  it("keeps technical health separate from the three authored setup steps", () => {
    const project = createDefaultProjectBundle("Starter guide");
    const report = validateProject(project);

    const checklist = resolveFirstProjectChecklist(project, report.valid, report.issues.length);

    expect(checklist).toMatchObject({
      isStarterProject: true,
      shouldShow: true,
      completedCount: 0,
      health: { healthy: false, blockerCount: report.issues.filter((issue) => issue.level === "error").length },
      sceneId: "scene_intro",
      hotspotId: "hotspot_inspect"
    });
    expect(checklist.steps.map((step) => [step.id, step.complete])).toEqual([
      ["media", false],
      ["interaction", false],
      ["player", false]
    ]);
  });

  it("finishes after replacing starter media, wiring the placeholder, and validating", () => {
    const project = createDefaultProjectBundle("Completed starter");
    project.assets.assets.push({
      id: "asset_opening",
      kind: "image",
      category: "background",
      name: "opening.png",
      variants: {
        en: {
          sourcePath: "C:/project/assets/opening.png",
          sha256: "opening",
          importedAt: "2026-08-03T10:00:00.000Z"
        }
      }
    });
    project.assets.assets.push({
      id: "asset_starter_title",
      kind: "image",
      category: "player",
      name: "cinematic-starter-title.png",
      provenance: { source: "starter-kit", packId: "cinematic", packVersion: 1 },
      variants: {
        en: {
          sourcePath: "C:/project/assets/cinematic-starter-title.png",
          importedAt: "2026-08-03T10:00:00.000Z"
        }
      }
    });
    project.scenes.items[0].backgroundAssetId = "asset_opening";
    project.manifest.variables.push({
      id: "started",
      name: "Started",
      description: "",
      type: "boolean",
      initialValue: false,
      system: false
    });
    project.scenes.items[0].hotspots[0].effects = [{ type: "setVariable", variableId: "started", value: true }];

    const checklist = resolveFirstProjectChecklist(project, true, 0);

    expect(checklist.completedCount).toBe(3);
    expect(checklist.shouldShow).toBe(false);
  });

  it("does not count conditions without an actual player-facing outcome", () => {
    const project = createDefaultProjectBundle("Conditions only");
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    project.manifest.variables.push({
      id: "door.open",
      name: "Door open",
      description: "",
      type: "boolean",
      initialValue: false,
      system: false
    });
    hotspot.conditions = [{ type: "variableCompare", variableId: "door.open", operator: "equals", value: false }];

    const checklist = resolveFirstProjectChecklist(project, true, 0);

    expect(checklist.steps.find((step) => step.id === "interaction")?.complete).toBe(false);
  });

  it("does not treat established projects without starter artifacts as onboarding projects", () => {
    const project = createDefaultProjectBundle("Established project");
    project.scenes.items[0].backgroundAssetId = "asset_established";
    project.scenes.items[0].hotspots = [];

    const checklist = resolveFirstProjectChecklist(project, false, 2);

    expect(checklist.isStarterProject).toBe(false);
    expect(checklist.shouldShow).toBe(false);
  });

  it("advances the prominent action to the next unfinished step", () => {
    const checklist = resolveFirstProjectChecklist(createDefaultProjectBundle("Next setup step"), true, 0);
    checklist.steps[0]!.complete = true;
    const markup = renderToStaticMarkup(React.createElement(FirstProjectChecklist, {
      state: checklist,
      onOpenSceneMedia: () => undefined,
      onOpenInteraction: () => undefined,
      onOpenPlayer: () => undefined,
      onReviewHealth: () => undefined,
      onOpenPlaytest: () => undefined,
      onDismiss: () => undefined
    }));
    expect(markup).toContain('data-first-project-next-step="interaction"');
    expect(markup).not.toContain('data-first-project-next-step="media"');
    expect(markup).toContain('data-project-health="healthy"');
  });
  it("renders actionable setup steps with progress semantics", () => {
    const project = createDefaultProjectBundle("Rendered guide");
    const checklist = resolveFirstProjectChecklist(project, false, 1);
    const markup = renderToStaticMarkup(
      React.createElement(FirstProjectChecklist, {
        state: checklist,
      onOpenSceneMedia: () => undefined,
      onOpenInteraction: () => undefined,
      onOpenPlayer: () => undefined,
        onReviewHealth: () => undefined,
        onOpenPlaytest: () => undefined,
        onDismiss: () => undefined
      })
    );

    expect(markup).toContain("Turn the starter into a playable scene");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="0"');
    expect(markup).toContain('data-first-project-step="media"');
    expect(markup).toContain('data-first-project-next-step="media"');
    expect(markup).toContain('<details class="first-project-checklist__all-steps"><summary>');
    expect(markup).not.toContain('<details open');
    expect(markup).toContain('data-first-project-step="interaction"');
    expect(markup).toContain('data-first-project-step="player"');
    expect(markup).toContain('data-project-health="blocked"');
    expect(markup).toContain("Technical checks need attention");
    expect(markup).toContain("Review issues");
  });
});

describe("first project workspace", () => {
  it("opens the configured starting scene with the guide available and no automatic hotspot inspector", () => {
    const project = createDefaultProjectBundle("Scene-first project");
    project.scenes.items.push({ ...project.scenes.items[0]!, id: "scene_opening", locationId: "location_opening" });
    project.manifest.startSceneId = "scene_opening";
    const before = structuredClone(project);

    expect(resolveNewProjectWorkspace(project)).toEqual({
      activeTab: "scenes", selectedSceneId: "scene_opening", selectedLocationId: "location_opening", selectedHotspotId: undefined
    });
    expect(project).toEqual(before);
  });

  it("falls back to an available scene or World when no scene exists", () => {
    const project = createDefaultProjectBundle("Scene fallback");
    project.manifest.startSceneId = "missing";
    expect(resolveNewProjectWorkspace(project).selectedSceneId).toBe(project.scenes.items[0]!.id);
    project.scenes.items = [];
    expect(resolveNewProjectWorkspace(project)).toEqual({
      activeTab: "world", selectedSceneId: undefined, selectedLocationId: undefined, selectedHotspotId: undefined
    });
  });

  it("keeps expected starter tasks out of an automatic diagnostics column, but lets the creator open it", () => {
    const starterIssues = [
      { code: "STARTER_SCENE_MEDIA_IN_USE" },
      { code: "STARTER_HOTSPOT_UNWIRED" },
      { code: "STARTER_PLAYER_ARTWORK_IN_USE" }
    ];
    expect(shouldShowProjectIssuesSidebar(true, false, starterIssues)).toBe(false);
    expect(shouldShowProjectIssuesSidebar(true, true, starterIssues)).toBe(true);
  });

  it("retains automatic diagnostics for real data problems and other release blockers", () => {
    for (const code of ["SCENE_BACKGROUND_ASSET_MISSING", "DIALOGUE_NEXT_NODE_UNKNOWN", "PLAYER_WEBSITE_INVALID"]) {
      expect(shouldShowProjectIssuesSidebar(true, false, [{ code }])).toBe(true);
    }
    expect(shouldShowProjectIssuesSidebar(false, false, [{ code: "STARTER_SCENE_MEDIA_IN_USE" }])).toBe(true);
    expect(shouldShowProjectIssuesSidebar(false, false, [])).toBe(false);
    expect(shouldShowProjectIssuesSidebar(false, true, [])).toBe(true);
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, validateProject } from "@mage2/schema";
import { FirstProjectChecklist } from "./FirstProjectChecklist";
import { resolveFirstProjectChecklist } from "./first-project-checklist";

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
    project.scenes.items[0].hotspots[0].effects = [{ type: "setFlag", flag: "started", value: true }];

    const checklist = resolveFirstProjectChecklist(project, true, 0);

    expect(checklist.completedCount).toBe(3);
    expect(checklist.shouldShow).toBe(false);
  });

  it("does not count conditions or required items without an actual player-facing outcome", () => {
    const project = createDefaultProjectBundle("Conditions only");
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    hotspot.requiredItemIds = ["item_key"];
    hotspot.conditions = [{ type: "flagEquals", flag: "door.open", value: false }];

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
    expect(markup).toContain('data-first-project-step="interaction"');
    expect(markup).toContain('data-first-project-step="player"');
    expect(markup).toContain('data-project-health="blocked"');
    expect(markup).toContain("Technical checks need attention");
    expect(markup).toContain("Review issues");
  });
});

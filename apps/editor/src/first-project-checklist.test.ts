import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, validateProject } from "@mage2/schema";
import { FirstProjectChecklist } from "./FirstProjectChecklist";
import { resolveFirstProjectChecklist } from "./first-project-checklist";

describe("first project checklist", () => {
  it("explains the starter template's missing media, interaction, and validation work", () => {
    const project = createDefaultProjectBundle("Starter guide");
    const report = validateProject(project);

    const checklist = resolveFirstProjectChecklist(project, report.valid, report.issues.length);

    expect(checklist).toMatchObject({
      isStarterProject: true,
      shouldShow: true,
      completedCount: 0,
      sceneId: "scene_intro",
      hotspotId: "hotspot_inspect"
    });
    expect(checklist.steps.map((step) => [step.id, step.complete])).toEqual([
      ["media", false],
      ["interaction", false],
      ["validation", false]
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
    project.scenes.items[0].backgroundAssetId = "asset_opening";
    project.scenes.items[0].hotspots[0].effects = [{ type: "setFlag", flag: "started", value: true }];

    const checklist = resolveFirstProjectChecklist(project, true, 0);

    expect(checklist.completedCount).toBe(3);
    expect(checklist.shouldShow).toBe(false);
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
        onReviewValidation: () => undefined,
        onOpenPlaytest: () => undefined,
        onDismiss: () => undefined
      })
    );

    expect(markup).toContain("Turn the starter into a playable scene");
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="0"');
    expect(markup).toContain('data-first-project-step="media"');
    expect(markup).toContain('data-first-project-step="interaction"');
    expect(markup).toContain('data-first-project-step="validation"');
    expect(markup).toContain("Review issues");
  });
});

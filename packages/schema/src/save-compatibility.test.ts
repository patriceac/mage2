import { describe, expect, it } from "vitest";
import {
  assessSaveCompatibility,
  createDefaultProjectBundle,
  createSaveCompatibilityBaseline,
  createSaveCompatibilitySnapshot,
  parseSaveCompatibilityBaseline
} from "./index";

function createTrackedProject() {
  const project = createDefaultProjectBundle("Tracked release");
  project.manifest.variables.push({
    id: "story.started",
    name: "Story started",
    description: "",
    type: "boolean",
    initialValue: false,
    system: false
  });
  project.scenes.items[0]!.onEnterEffects = [
    { type: "setVariable", variableId: "story.started", value: true }
  ];
  project.inventory.items.push({
    id: "item_lantern",
    name: "Lantern",
    textId: "text.item.lantern"
  });
  project.dialogues.items.push({
    id: "dialogue_keeper",
    name: "Keeper",
    startNodeId: "node_greeting",
    nodes: [
      {
        id: "node_greeting",
        speaker: "Keeper",
        textId: "text.dialogue.keeper.greeting",
        effects: [],
        choices: []
      }
    ]
  });
  return project;
}

describe("release save compatibility", () => {
  it("treats the first release as untracked and creates a deterministic baseline", () => {
    const project = createTrackedProject();
    const firstAssessment = assessSaveCompatibility(undefined, project);
    const baseline = createSaveCompatibilityBaseline(project, "2026-08-08T12:00:00.000Z");

    expect(firstAssessment).toMatchObject({
      status: "untracked",
      blocksRelease: false,
      currentSaveCompatibilityVersion: 1,
      nextSaveCompatibilityVersion: 2,
      issues: []
    });
    expect(parseSaveCompatibilityBaseline(baseline)).toEqual(baseline);
    expect(createSaveCompatibilitySnapshot(project)).toEqual(baseline.snapshot);
  });

  it("keeps copy, presentation, and additive content compatible", () => {
    const project = createTrackedProject();
    const baseline = createSaveCompatibilityBaseline(project);

    project.manifest.projectName = "Renamed release";
    project.strings.byLocale.en["text.extra"] = "New copy";
    project.inventory.items.push({ id: "item_new", name: "New", textId: "text.item.new" });

    expect(assessSaveCompatibility(baseline, project)).toMatchObject({
      status: "compatible",
      blocksRelease: false,
      issues: []
    });
  });

  it("detects every saved-state ID removal and scene ownership change", () => {
    const project = createTrackedProject();
    const baseline = createSaveCompatibilityBaseline(project);

    project.locations.items = [];
    project.scenes.items[0]!.locationId = "location_elsewhere";
    project.scenes.items[0]!.onEnterEffects = [];
    project.manifest.variables = [];
    project.inventory.items = [];
    project.dialogues.items[0]!.nodes = [];

    expect(assessSaveCompatibility(baseline, project)).toMatchObject({
      status: "breaking",
      blocksRelease: true,
      issues: [
        { code: "LOCATION_REMOVED", entityId: "location_intro" },
        {
          code: "SCENE_LOCATION_CHANGED",
          entityId: "scene_intro",
          previousParentId: "location_intro",
          currentParentId: "location_elsewhere"
        },
        { code: "INVENTORY_ITEM_REMOVED", entityId: "item_lantern" },
        { code: "VARIABLE_REMOVED", entityId: "story.started" },
        {
          code: "DIALOGUE_NODE_REMOVED",
          entityId: "node_greeting",
          previousParentId: "dialogue_keeper"
        }
      ]
    });
  });

  it("allows declared breaks only after the generation advances and blocks regressions", () => {
    const project = createTrackedProject();
    project.manifest.saveCompatibilityVersion = 3;
    const baseline = createSaveCompatibilityBaseline(project);
    project.scenes.items = [];
    project.manifest.variables = [];

    project.manifest.saveCompatibilityVersion = 4;
    expect(assessSaveCompatibility(baseline, project)).toMatchObject({
      status: "generation-advanced",
      blocksRelease: false,
      baselineSaveCompatibilityVersion: 3,
      issues: [
        { code: "SCENE_REMOVED", entityId: "scene_intro" },
        { code: "VARIABLE_REMOVED", entityId: "story.started" }
      ]
    });

    project.manifest.saveCompatibilityVersion = 2;
    expect(assessSaveCompatibility(baseline, project)).toMatchObject({
      status: "generation-regressed",
      blocksRelease: true,
      baselineSaveCompatibilityVersion: 3,
      nextSaveCompatibilityVersion: 4
    });
  });

  it("reads version-one flag baselines as variable IDs", () => {
    const project = createTrackedProject();
    const baseline = createSaveCompatibilityBaseline(project);
    const legacy = {
      ...baseline,
      snapshot: {
        locationIds: baseline.snapshot.locationIds,
        scenes: baseline.snapshot.scenes,
        inventoryItemIds: baseline.snapshot.inventoryItemIds,
        flagIds: baseline.snapshot.variableIds,
        dialogues: baseline.snapshot.dialogues
      }
    };

    expect(parseSaveCompatibilityBaseline(legacy).snapshot.variableIds).toEqual(["story.started"]);
  });
});

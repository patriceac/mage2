import { describe, expect, it } from "vitest";
import {
  CURRENT_SAVE_ENVELOPE_VERSION,
  CURRENT_SCHEMA_VERSION,
  SAVE_ENVELOPE_FORMAT,
  createDefaultProjectBundle,
  createInitialSaveState,
  createSaveEnvelope,
  getProjectMigrationPath,
  getSaveMigrationPath,
  loadSaveForProject,
  parseProjectBundle,
  validateProject
} from "./index";

describe("project schema evolution", () => {
  it("runs every supported migration in order before parsing a legacy project", () => {
    const project = createDefaultProjectBundle("Legacy migration");
    project.assets.assets.push({
      id: "asset_legacy",
      kind: "image",
      name: "legacy.png",
      variants: {
        en: {
          sourcePath: "legacy.png",
          importedAt: "2026-01-01T00:00:00.000Z"
        }
      }
    });
    project.scenes.items[0]!.backgroundAssetId = "asset_legacy";

    const raw = structuredClone(project) as Record<string, any>;
    for (const fileName of ["manifest", "assets", "locations", "scenes", "dialogues", "inventory", "strings"] as const) {
      raw[fileName].schemaVersion = 4;
    }
    delete raw.assets.assets[0].category;
    delete raw.scenes.items[0].hotspots[0].timingMode;

    expect(getProjectMigrationPath(4).map((migration) => [migration.fromVersion, migration.toVersion])).toEqual([
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8]
    ]);

    const parsed = parseProjectBundle(raw);

    expect(parsed.manifest.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.assets.assets[0]?.category).toBe("background");
    expect(parsed.scenes.items[0]?.hotspots[0]?.timingMode).toBe("fixed");
  });

  it("rejects future project versions before they are normalized or stripped", () => {
    const raw = structuredClone(createDefaultProjectBundle("Future project")) as Record<string, any>;
    for (const fileName of ["manifest", "assets", "locations", "scenes", "dialogues", "inventory", "strings"] as const) {
      raw[fileName].schemaVersion = CURRENT_SCHEMA_VERSION + 1;
      raw[fileName].futureOnlyField = { preserve: true };
    }
    const before = JSON.stringify(raw);

    expect(() => parseProjectBundle(raw)).toThrow(/newer than this MAGE2 build supports/);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("rejects mixed project file versions instead of guessing how to combine them", () => {
    const raw = structuredClone(createDefaultProjectBundle("Mixed project")) as Record<string, any>;
    raw.assets.schemaVersion = CURRENT_SCHEMA_VERSION - 1;

    expect(() => parseProjectBundle(raw)).toThrow(/mixed schema versions/i);
  });
});

describe("project integrity validation", () => {
  it("reports duplicate ids for every id-bearing entity type", () => {
    const project = createDefaultProjectBundle("Duplicate ids");
    const hotspot = structuredClone(project.scenes.items[0]!.hotspots[0]!);
    project.scenes.items[0]!.hotspots.push(hotspot);
    project.assets.assets.push(
      { id: "asset_duplicate", kind: "image", name: "one", variants: {} },
      { id: "asset_duplicate", kind: "image", name: "two", variants: {} }
    );
    project.locations.items.push({ ...structuredClone(project.locations.items[0]!) });
    project.scenes.items.push({ ...structuredClone(project.scenes.items[0]!), hotspots: [] });
    project.inventory.items.push(
      { id: "item_duplicate", name: "One", textId: "text.item.one" },
      { id: "item_duplicate", name: "Two", textId: "text.item.two" }
    );
    const duplicateDialogue = {
      id: "dialogue_duplicate",
      name: "Duplicate dialogue",
      startNodeId: "node_duplicate",
      nodes: [
        {
          id: "node_duplicate",
          speaker: "Guide",
          textId: "text.dialogue.one",
          effects: [],
          choices: [
            { id: "choice_duplicate", textId: "text.choice.one", conditions: [], effects: [] },
            { id: "choice_duplicate", textId: "text.choice.two", conditions: [], effects: [] }
          ]
        },
        {
          id: "node_duplicate",
          speaker: "Guide",
          textId: "text.dialogue.two",
          effects: [],
          choices: []
        }
      ]
    };
    project.dialogues.items.push(duplicateDialogue, structuredClone(duplicateDialogue));

    const codes = new Set(validateProject(project).issues.map((issue) => issue.code));

    expect([...codes]).toEqual(
      expect.arrayContaining([
        "DUPLICATE_ASSET_ID",
        "DUPLICATE_LOCATION_ID",
        "DUPLICATE_SCENE_ID",
        "DUPLICATE_DIALOGUE_ID",
        "DUPLICATE_INVENTORY_ITEM_ID",
        "DUPLICATE_HOTSPOT_ID",
        "DUPLICATE_DIALOGUE_NODE_ID",
        "DUPLICATE_DIALOGUE_CHOICE_ID"
      ])
    );
  });

  it("requires reciprocal scene/location ownership and a consistent start pair", () => {
    const project = createDefaultProjectBundle("Topology");
    const startSceneId = project.manifest.startSceneId;
    project.locations.items.push(
      { id: "location_extra_owner", name: "Extra owner", x: 1, y: 1, sceneIds: [startSceneId] },
      { id: "location_wrong_start", name: "Wrong start", x: 2, y: 2, sceneIds: [] }
    );
    project.manifest.startLocationId = "location_wrong_start";

    const codes = new Set(validateProject(project).issues.map((issue) => issue.code));

    expect([...codes]).toEqual(
      expect.arrayContaining([
        "LOCATION_SCENE_OWNERSHIP_MISMATCH",
        "SCENE_LOCATION_MULTIPLE_OWNERS",
        "START_SCENE_LOCATION_MISMATCH",
        "START_SCENE_NOT_OWNED_BY_START_LOCATION"
      ])
    );
  });

  it("rejects ambiguous and orphaned references instead of silently choosing one", () => {
    const project = createDefaultProjectBundle("Ambiguous references");
    project.inventory.items.push(
      { id: "item_one", name: "One", textId: "text.item.one" },
      { id: "item_two", name: "Two", textId: "text.item.two" }
    );
    const scene = project.scenes.items[0]!;
    const hotspot = scene.hotspots[0]!;
    scene.dialogueTreeIds = ["dialogue_missing", "dialogue_missing"];
    hotspot.inventoryItemId = "item_one";
    hotspot.placedInventoryItemId = "item_two";
    hotspot.requiredItemIds = ["item_one", "item_one"];
    hotspot.placedInventoryGeometry = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };

    const codes = new Set(validateProject(project).issues.map((issue) => issue.code));

    expect([...codes]).toEqual(
      expect.arrayContaining([
        "SCENE_DIALOGUE_MISSING",
        "SCENE_DIALOGUE_DUPLICATE",
        "HOTSPOT_INVENTORY_REFERENCE_AMBIGUOUS",
        "HOTSPOT_REQUIRED_ITEM_DUPLICATE"
      ])
    );
  });
});

describe("save evolution and recovery", () => {
  it("loads an exact versioned save and rejects stale content", () => {
    const project = createDefaultProjectBundle("Save identity");
    const state = { ...createInitialSaveState(project), flags: { opened: true }, playheadMs: 1234 };
    const envelope = createSaveEnvelope(project, state, "2026-01-01T00:00:00.000Z");

    expect(loadSaveForProject(JSON.stringify(envelope), project)).toMatchObject({
      status: "compatible",
      saveState: state,
      shouldQuarantine: false
    });

    project.manifest.projectName = "Changed content";
    expect(loadSaveForProject(JSON.stringify(envelope), project)).toMatchObject({
      status: "stale",
      saveState: createInitialSaveState(project),
      shouldQuarantine: true
    });
  });

  it("migrates the explicitly supported raw legacy save format", () => {
    const project = createDefaultProjectBundle("Legacy save");
    const legacyState = { ...createInitialSaveState(project), playheadMs: 99 };

    const result = loadSaveForProject(JSON.stringify(legacyState), project);

    expect(getSaveMigrationPath(0).map((migration) => [migration.fromVersion, migration.toVersion])).toEqual([[0, 1]]);
    expect(result).toMatchObject({
      status: "migrated",
      saveState: legacyState,
      shouldQuarantine: false
    });
    expect(result.envelope).toMatchObject({
      format: SAVE_ENVELOPE_FORMAT,
      version: CURRENT_SAVE_ENVELOPE_VERSION
    });
  });

  it("recovers safely from malformed, stale-reference, and future saves", () => {
    const project = createDefaultProjectBundle("Save recovery");
    const initial = createInitialSaveState(project);
    const corrupt = loadSaveForProject("{not-json", project);
    const invalidStateEnvelope = createSaveEnvelope(project, { ...initial, currentSceneId: "scene_missing" });
    const futureEnvelope = { ...createSaveEnvelope(project, initial), version: CURRENT_SAVE_ENVELOPE_VERSION + 1 };
    const futureBefore = JSON.stringify(futureEnvelope);

    expect(corrupt).toMatchObject({ status: "corrupt", saveState: initial, shouldQuarantine: true });
    expect(loadSaveForProject(invalidStateEnvelope, project)).toMatchObject({
      status: "corrupt",
      saveState: initial,
      shouldQuarantine: true
    });
    expect(loadSaveForProject(futureEnvelope, project)).toMatchObject({
      status: "unsupported",
      saveState: initial,
      shouldQuarantine: true
    });
    expect(JSON.stringify(futureEnvelope)).toBe(futureBefore);
  });
});

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
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 11],
      [11, 12],
      [12, 13],
      [13, 14],
      [14, 15]
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

  it("keeps pre-title-screen projects launching directly into gameplay", () => {
    const raw = structuredClone(createDefaultProjectBundle("Schema 11 player behavior")) as Record<string, any>;
    for (const fileName of ["manifest", "assets", "locations", "scenes", "dialogues", "inventory", "strings"] as const) {
      raw[fileName].schemaVersion = 11;
    }
    delete raw.manifest.playerPresentation;
    delete raw.manifest.gameVersion;
    delete raw.manifest.saveCompatibilityVersion;

    const parsed = parseProjectBundle(raw);

    expect(parsed.manifest.playerPresentation.titleScreenEnabled).toBe(false);
    expect(parsed.manifest.gameVersion).toBe("1.0.0");
    expect(parsed.manifest.saveCompatibilityVersion).toBe(1);
  });

  it("preserves the formerly muted behavior when migrating schema 12 video scenes", () => {
    const raw = structuredClone(createDefaultProjectBundle("Schema 12 video audio")) as Record<string, any>;
    for (const fileName of ["manifest", "assets", "locations", "scenes", "dialogues", "inventory", "strings"] as const) {
      raw[fileName].schemaVersion = 12;
    }
    delete raw.scenes.items[0].videoAudioMode;
    delete raw.scenes.items[0].onMediaEndEffects;

    const parsed = parseProjectBundle(raw);

    expect(parsed.scenes.items[0]?.videoAudioMode).toBe("silent");
    expect(parsed.scenes.items[0]?.onMediaEndEffects).toEqual([]);
  });

  it("migrates schema 13 flags into named Boolean variables across every rule surface", () => {
    const raw = structuredClone(createDefaultProjectBundle("Schema 13 variables")) as Record<string, any>;
    for (const fileName of ["manifest", "assets", "locations", "scenes", "dialogues", "inventory", "strings"] as const) {
      raw[fileName].schemaVersion = 13;
    }
    delete raw.manifest.variables;
    const hotspot = raw.scenes.items[0].hotspots[0];
    hotspot.conditions = [{ type: "flagEquals", flag: "door.open", value: false }];
    hotspot.effects = [{ type: "setFlag", flag: "door.open", value: true }];
    hotspot.clickEvent = { effects: [{ type: "setFlag", flag: "door.checked", value: true }] };
    raw.scenes.items[0].onEnterEffects = [{ type: "setFlag", flag: "story.started", value: true }];
    raw.dialogues.items = [{
      id: "dialogue_test",
      name: "Test",
      startNodeId: "node_test",
      nodes: [{
        id: "node_test",
        speaker: "Guide",
        textId: "text.node_test",
        effects: [{ type: "setFlag", flag: "dialogue.started", value: true }],
        choices: [{
          id: "choice_test",
          textId: "text.choice_test",
          conditions: [{ type: "flagEquals", flag: "door.open", value: true }],
          effects: [{ type: "setFlag", flag: "dialogue.finished", value: true }]
        }]
      }]
    }];

    const parsed = parseProjectBundle(raw);
    const migratedHotspot = parsed.scenes.items[0]!.hotspots[0]!;

    expect(parsed.manifest.variables.map((variable) => variable.id)).toEqual([
      "dialogue.finished",
      "dialogue.started",
      "door.checked",
      "door.open",
      "story.started"
    ]);
    expect(parsed.manifest.variables.find((variable) => variable.id === "door.open")).toMatchObject({
      name: "Door open",
      type: "boolean",
      initialValue: false,
      system: false
    });
    expect(migratedHotspot.conditions).toEqual([
      { type: "variableCompare", variableId: "door.open", operator: "equals", value: false }
    ]);
    expect(migratedHotspot.effects).toEqual([
      { type: "setVariable", variableId: "door.open", value: true }
    ]);
    expect(migratedHotspot.conditionMode).toBe("all");
    expect(parsed.dialogues.items[0]!.nodes[0]!.choices[0]!.conditionMode).toBe("all");
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
    project.manifest.variables.push(
      { id: "variable_duplicate", name: "One", description: "", type: "boolean", initialValue: false, system: false },
      { id: "variable_duplicate", name: "Two", description: "", type: "boolean", initialValue: false, system: false }
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
        "DUPLICATE_VARIABLE_ID",
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

  it("validates typed variable definitions, rule values, and action order", () => {
    const project = createDefaultProjectBundle("Variable validation");
    project.manifest.variables.push(
      { id: "door.open", name: "Door open", description: "", type: "boolean", initialValue: false, system: false },
      { id: "attempts", name: "Attempts", description: "", type: "integer", initialValue: 0, system: false },
      {
        id: "trust",
        name: "Trust",
        description: "",
        type: "choice",
        options: [{ id: "neutral", name: "" }],
        initialValue: "missing",
        system: false
      }
    );
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    hotspot.conditions = [
      { type: "variableCompare", variableId: "door.open", operator: "greaterThan", value: true },
      { type: "variableCompare", variableId: "trust", operator: "equals", value: "rival" },
      { type: "variableCompare", variableId: "missing", operator: "equals", value: true }
    ];
    hotspot.effects = [
      { type: "goToScene", sceneId: project.manifest.startSceneId },
      { type: "setVariable", variableId: "attempts", value: "many" },
      { type: "changeVariable", variableId: "door.open", delta: 1 },
      { type: "setVariable", variableId: "missing", value: true }
    ];

    const codes = new Set(validateProject(project).issues.map((issue) => issue.code));

    expect([...codes]).toEqual(expect.arrayContaining([
      "VARIABLE_CHOICES_TOO_FEW",
      "VARIABLE_CHOICE_NAME_MISSING",
      "VARIABLE_INITIAL_CHOICE_MISSING",
      "CONDITION_VARIABLE_OPERATOR_INVALID",
      "CONDITION_VARIABLE_VALUE_INVALID",
      "CONDITION_VARIABLE_MISSING",
      "EFFECT_VARIABLE_VALUE_INVALID",
      "EFFECT_VARIABLE_CHANGE_INVALID",
      "EFFECT_VARIABLE_MISSING",
      "EFFECT_TERMINAL_NOT_LAST"
    ]));
  });

  it("parses and validates conditional action branches recursively", () => {
    const project = createDefaultProjectBundle("Conditional validation");
    project.manifest.variables.push({
      id: "cabinet.open",
      name: "Cabinet open",
      description: "",
      type: "boolean",
      initialValue: false,
      system: false
    });
    project.scenes.items[0]!.hotspots[0]!.effects = [{
      type: "conditional",
      conditionMode: "all",
      conditions: [{ type: "variableCompare", variableId: "cabinet.open", operator: "equals", value: true }],
      thenEffects: [{ type: "goToScene", sceneId: "scene_missing" }],
      elseEffects: [{
        type: "conditional",
        conditionMode: "all",
        conditions: [{ type: "variableCompare", variableId: "cabinet.open", operator: "equals", value: false }],
        thenEffects: [],
        elseEffects: []
      }]
    }];

    const parsed = parseProjectBundle(project);
    expect(parsed.scenes.items[0]!.hotspots[0]!.effects[0]).toMatchObject({
      type: "conditional",
      conditionMode: "all"
    });
    const codes = new Set(validateProject(parsed).issues.map((issue) => issue.code));
    expect([...codes]).toEqual(expect.arrayContaining([
      "EFFECT_SCENE_MISSING",
      "CONDITIONAL_NESTING_TOO_DEEP",
      "CONDITIONAL_BRANCHES_EMPTY"
    ]));
  });
});

describe("save evolution and recovery", () => {
  it("keeps compatible saves across content edits and rejects creator-declared breaks", () => {
    const project = createDefaultProjectBundle("Save identity");
    project.manifest.variables.push({
      id: "opened",
      name: "Opened",
      description: "",
      type: "boolean",
      initialValue: false,
      system: false
    });
    const state = {
      ...createInitialSaveState(project),
      flags: { opened: true },
      variables: { opened: true },
      playheadMs: 1234
    };
    const hydratedState = state;
    const envelope = createSaveEnvelope(project, state, "2026-01-01T00:00:00.000Z");

    expect(loadSaveForProject(JSON.stringify(envelope), project)).toMatchObject({
      status: "compatible",
      saveState: hydratedState,
      shouldQuarantine: false
    });

    project.manifest.projectName = "Changed content";
    expect(loadSaveForProject(JSON.stringify(envelope), project)).toMatchObject({
      status: "compatible",
      saveState: hydratedState,
      shouldQuarantine: false
    });

    project.manifest.saveCompatibilityVersion += 1;
    expect(loadSaveForProject(JSON.stringify(envelope), project)).toMatchObject({
      status: "incompatible",
      saveState: createInitialSaveState(project),
      shouldQuarantine: true
    });
  });

  it("migrates the explicitly supported raw legacy save format", () => {
    const project = createDefaultProjectBundle("Legacy save");
    const legacyState = { ...createInitialSaveState(project), playheadMs: 99 };

    const result = loadSaveForProject(JSON.stringify(legacyState), project);

    expect(getSaveMigrationPath(0).map((migration) => [migration.fromVersion, migration.toVersion])).toEqual([
      [0, 1],
      [1, 2]
    ]);
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

  it("hydrates typed defaults and carries legacy Boolean flags into variable state", () => {
    const project = createDefaultProjectBundle("Typed saves");
    project.manifest.variables.push(
      { id: "door.open", name: "Door open", description: "", type: "boolean", initialValue: false, system: false },
      { id: "attempts", name: "Attempts", description: "", type: "integer", initialValue: 2, system: false },
      {
        id: "trust",
        name: "Trust",
        description: "",
        type: "choice",
        options: [{ id: "neutral", name: "Neutral" }, { id: "friend", name: "Friend" }],
        initialValue: "neutral",
        system: false
      }
    );
    const initial = createInitialSaveState(project);
    const legacyState = {
      currentLocationId: initial.currentLocationId,
      currentSceneId: initial.currentSceneId,
      inventory: initial.inventory,
      flags: { "door.open": true },
      visitedSceneIds: initial.visitedSceneIds,
      playheadMs: initial.playheadMs
    };

    const result = loadSaveForProject(JSON.stringify(legacyState), project);

    expect(result.status).toBe("migrated");
    expect(result.saveState.variables).toEqual({ "door.open": true, attempts: 2, trust: "neutral" });
    expect(result.saveState.flags).toEqual({ "door.open": true });
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
      status: "incompatible",
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

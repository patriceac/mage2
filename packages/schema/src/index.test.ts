import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  createDefaultProjectBundle,
  createInitialSaveState,
  collectSceneLinks,
  parseProjectBundle,
  resolveAssetCategory,
  resolveHotspotBounds,
  resolveHotspotClipPath,
  resolveHotspotRotationDegrees,
  resolveRelativeHotspotContentBox,
  resolveRelativeHotspotFrame,
  resolveRelativeHotspotVisualBox,
  toExportProjectData,
  validateProject
} from "./index";

describe("project defaults", () => {
  it("exports only genuine player UI overrides without mutating the project", () => {
    const project = createDefaultProjectBundle("Override export");
    project.manifest.supportedLocales = ["en", "fr"];
    project.strings.byLocale.en!["player.ui.startGame"] = "Enter the observatory";
    project.strings.byLocale.fr = {
      "player.ui.startGame": "Begin",
      "player.ui.settings": "Paramètres du jeu",
      "player.ui.menu": "Menu provisoire"
    };
    project.strings.translationStateByLocale.fr = {
      "player.ui.startGame": "inherited",
      "player.ui.settings": "reviewed",
      "player.ui.menu": "draft"
    };
    const before = structuredClone(project);

    const exported = toExportProjectData(project);

    expect(exported.playerUiOverrides).toEqual({
      en: { "player.ui.startGame": "Enter the observatory" },
      fr: { "player.ui.settings": "Paramètres du jeu" }
    });
    expect(project).toEqual(before);
  });

  it("keeps player UI override export metadata optional when no authored override exists", () => {
    expect(toExportProjectData(createDefaultProjectBundle())).not.toHaveProperty("playerUiOverrides");
  });

  it("creates starter projects and save states without segment fields", () => {
    const project = createDefaultProjectBundle();

    expect(project.scenes.items[0]).not.toHaveProperty("defaultSegmentId");
    expect(project.scenes.items[0]).not.toHaveProperty("clipSegments");
    expect(project.scenes.items[0]?.sceneAudioLoop).toBe(true);
    expect(project.scenes.items[0]?.sceneAudioDelayMs).toBe(0);
    expect(project.scenes.items[0]?.videoAudioMode).toBe("silent");
    expect(project.scenes.items[0]?.onMediaEndEffects).toEqual([]);
    expect(createInitialSaveState(project)).not.toHaveProperty("currentSegmentId");
  });

  it("preserves imported audio-stream metadata through project normalization", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_video_with_audio",
      kind: "video",
      name: "intro.mp4",
      variants: {
        en: {
          sourcePath: "intro.mp4",
          hasAudio: true,
          audioCodec: "aac",
          importedAt: "2026-08-08T00:00:00.000Z"
        }
      }
    });

    const parsed = parseProjectBundle(project);

    expect(parsed.assets.assets.at(-1)?.variants.en).toMatchObject({
      hasAudio: true,
      audioCodec: "aac"
    });
  });

  it("does not seed legacy location description or scene overlay strings in starter projects", () => {
    const project = createDefaultProjectBundle();

    expect(project.locations.items[0]).not.toHaveProperty("descriptionTextId");
    expect(project.scenes.items[0]).not.toHaveProperty("overlayTextId");
    expect(project.strings.byLocale[project.manifest.defaultLanguage]).not.toHaveProperty("text.location.intro");
    expect(project.strings.byLocale[project.manifest.defaultLanguage]).not.toHaveProperty("text.scene.intro");
  });

  it("round-trips optional location icon overrides", () => {
    const project = createDefaultProjectBundle();
    project.locations.items[0]!.icon = "forest";

    const parsed = parseProjectBundle(project);

    expect(parsed.locations.items[0]?.icon).toBe("forest");
  });

  it("normalizes legacy visual assets to background and legacy audio assets to scene audio", () => {
    const parsed = parseProjectBundle({
      manifest: {
        schemaVersion: 4,
        projectId: "project_categories",
        projectName: "Categories",
        defaultLanguage: "en",
        supportedLocales: ["en"],
        engineVersion: "0.1.0",
        assetRoots: [],
        startLocationId: "location_intro",
        startSceneId: "scene_intro",
        buildSettings: { outputDir: "build", includeSourceMap: false }
      },
      assets: {
        schemaVersion: 4,
        assets: [
          {
            id: "asset_image",
            kind: "image",
            name: "background.png",
            variants: {
              en: {
                sourcePath: "background.png",
                importedAt: new Date().toISOString()
              }
            }
          },
          {
            id: "asset_audio",
            kind: "audio",
            name: "legacy.mp3",
            variants: {
              en: {
                sourcePath: "legacy.mp3",
                importedAt: new Date().toISOString()
              }
            }
          }
        ]
      },
      locations: { schemaVersion: 4, items: [{ id: "location_intro", name: "Intro", x: 0, y: 0, sceneIds: ["scene_intro"] }] },
      scenes: {
        schemaVersion: 4,
        items: [
          {
            id: "scene_intro",
            locationId: "location_intro",
            name: "Intro",
            backgroundAssetId: "asset_image",
            backgroundVideoLoop: false,
            hotspots: [],
            dialogueTreeIds: [],
            onEnterEffects: [],
            onExitEffects: []
          }
        ]
      },
      dialogues: { schemaVersion: 4, items: [] },
      inventory: { schemaVersion: 4, items: [] },
      strings: { schemaVersion: 4, byLocale: { en: {} } }
    });

    expect(parsed.assets.assets).toHaveLength(2);
    expect(resolveAssetCategory(parsed.assets.assets[0]!)).toBe("background");
    expect(resolveAssetCategory(parsed.assets.assets[1]!)).toBe("sceneAudio");
    expect(parsed.scenes.items[0]?.sceneAudioLoop).toBe(true);
    expect(parsed.scenes.items[0]?.sceneAudioDelayMs).toBe(0);
    expect(parsed.scenes.items[0]?.hotspots).toEqual([]);
  });

  it("parses hotspots without inventory-item links from legacy projects", () => {
    const parsed = parseProjectBundle({
      manifest: {
        schemaVersion: 5,
        projectId: "project_legacy_hotspot",
        projectName: "Legacy Hotspot",
        defaultLanguage: "en",
        supportedLocales: ["en"],
        engineVersion: "0.1.0",
        assetRoots: [],
        startLocationId: "location_intro",
        startSceneId: "scene_intro",
        buildSettings: { outputDir: "build", includeSourceMap: false }
      },
      assets: { schemaVersion: 5, assets: [] },
      locations: { schemaVersion: 5, items: [{ id: "location_intro", name: "Intro", x: 0, y: 0, sceneIds: ["scene_intro"] }] },
      scenes: {
        schemaVersion: 5,
        items: [
          {
            id: "scene_intro",
            locationId: "location_intro",
            name: "Intro",
            backgroundVideoLoop: false,
            hotspots: [
              {
                id: "hotspot_one",
                name: "Hotspot 1",
                x: 0.1,
                y: 0.2,
                width: 0.3,
                height: 0.2,
                polygon: [
                  { x: 0.1, y: 0.2 },
                  { x: 0.4, y: 0.2 },
                  { x: 0.4, y: 0.4 },
                  { x: 0.1, y: 0.4 }
                ],
                startMs: 0,
                endMs: 30000,
                requiredItemIds: [],
                conditions: [{ type: "always" }],
                effects: []
              }
            ],
            dialogueTreeIds: [],
            onEnterEffects: [],
            onExitEffects: []
          }
        ]
      },
      dialogues: { schemaVersion: 5, items: [] },
      inventory: { schemaVersion: 5, items: [] },
      strings: { schemaVersion: 5, byLocale: { en: {} } }
    });

    expect(parsed.manifest.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.scenes.items[0]?.hotspots[0]).not.toHaveProperty("inventoryItemId");
    expect(parsed.scenes.items[0]?.hotspots[0]?.timingMode).toBe("fixed");
  });

  it("migrates legacy locale copies to conservative translation states", () => {
    const legacy = createDefaultProjectBundle("Legacy localization");
    const sourceTextId = legacy.scenes.items[0]!.hotspots[0]!.commentTextId!;
    legacy.manifest.supportedLocales = ["en", "fr"];
    legacy.strings.byLocale.en["text.greeting"] = "Hello";
    legacy.strings.byLocale.fr = {
      [sourceTextId]: legacy.strings.byLocale.en[sourceTextId],
      "text.greeting": "Bonjour"
    };
    delete (legacy.strings as Partial<typeof legacy.strings>).translationStateByLocale;

    const parsed = parseProjectBundle(legacy);

    expect(parsed.strings.translationStateByLocale.fr[sourceTextId]).toBe("inherited");
    expect(parsed.strings.translationStateByLocale.fr["text.greeting"]).toBe("translated");
    expect(parsed.strings.translationStateByLocale.en).toEqual({});
  });

  it("preserves explicit reviewed states and omits workflow metadata from runtime exports", () => {
    const project = createDefaultProjectBundle("Reviewed localization");
    const textId = project.scenes.items[0]!.hotspots[0]!.commentTextId!;
    project.manifest.supportedLocales = ["en", "fr"];
    project.strings.byLocale.fr = { [textId]: project.strings.byLocale.en[textId] };
    project.strings.translationStateByLocale.fr = { [textId]: "reviewed" };

    const parsed = parseProjectBundle(project);
    const exported = toExportProjectData(parsed);

    expect(parsed.strings.translationStateByLocale.fr[textId]).toBe("reviewed");
    expect(exported.strings.fr[textId]).toBe(project.strings.byLocale.en[textId]);
    expect(exported.strings).not.toHaveProperty("translationStateByLocale");
  });

  it("round-trips inventory-backed hotspot links", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_item",
      kind: "image",
      name: "lantern.png",
      category: "inventory",
      variants: {
        en: {
          sourcePath: "lantern.png",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.inventory.items.push({
      id: "item_lantern",
      name: "Lantern",
      textId: "text.item_lantern.name",
      imageAssetId: "asset_item"
    });
    project.strings.byLocale.en["text.item_lantern.name"] = "Lantern";
    project.scenes.items[0]!.hotspots[0]!.inventoryItemId = "item_lantern";

    const parsed = parseProjectBundle(project);

    expect(parsed.scenes.items[0]?.hotspots[0]?.inventoryItemId).toBe("item_lantern");
  });

  it("round-trips foreground media attached to hotspots and dialogue lines", () => {
    const project = createDefaultProjectBundle("Foreground media");
    project.assets.assets.push({
      id: "asset_voice",
      kind: "audio",
      name: "voice.mp3",
      category: "foreground",
      variants: {
        en: {
          sourcePath: "voice.mp3",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.scenes.items[0]!.hotspots[0]!.mediaAssetId = "asset_voice";
    project.dialogues.items.push({
      id: "dialogue_intro",
      name: "Intro",
      startNodeId: "node_intro",
      nodes: [
        {
          id: "node_intro",
          speaker: "Guide",
          textId: "text.node_intro",
          mediaAssetId: "asset_voice",
          effects: [],
          choices: []
        }
      ]
    });
    project.strings.byLocale.en["text.node_intro"] = "Listen.";

    const parsed = parseProjectBundle(project);

    expect(resolveAssetCategory(parsed.assets.assets.find((asset) => asset.id === "asset_voice")!)).toBe("foreground");
    expect(parsed.scenes.items[0]?.hotspots[0]?.mediaAssetId).toBe("asset_voice");
    expect(parsed.dialogues.items[0]?.nodes[0]?.mediaAssetId).toBe("asset_voice");
  });

  it("seeds editable response groups and polished starter text without enabling extra locales", () => {
    const project = createDefaultProjectBundle();

    expect(project.dialogues.responseGroups.map((group) => group.name)).toEqual([
      "Wrong item",
      "Missing prerequisite",
      "Already completed",
      "No effect",
      "Nothing useful"
    ]);
    expect(project.dialogues.responseGroups.every((group) => group.entries.length === 4)).toBe(true);
    expect(project.manifest.supportedLocales).toEqual(["en"]);
    expect(project.strings.byLocale.en?.["text.response.starter.wrong_item.1"]).toBe("I can't use that here.");
    expect(project.strings.byLocale.fr?.["text.response.starter.wrong_item.1"]).toBe("Je ne peux pas utiliser ça ici.");
    expect(project.strings.byLocale["zh-Hans"]?.["text.response.starter.no_effect.1"]).toBe("什么也没发生。");
    expect(project.strings.byLocale.ja?.["text.response.starter.already_completed.1"]).toBe("もう済んでいる。");
    expect(project.strings.byLocale.ko?.["text.response.starter.missing_prerequisite.1"]).toBe("뭔가 부족하다.");
    expect(project.strings.byLocale.ar?.["text.response.starter.no_effect.1"]).toBe("لا يحدث شيء.");
    expect(project.strings.byLocale.en?.["text.response.starter.nothing_useful.4"]).toBe(
      "There’s nothing of interest here."
    );
  });

  it("migrates existing projects once without assigning fallback behavior", () => {
    const project = createDefaultProjectBundle();
    project.dialogues = {
      schemaVersion: project.dialogues.schemaVersion,
      items: []
    } as unknown as typeof project.dialogues;
    project.scenes.items[0]!.hotspots[0]!.response = undefined;

    const migrated = parseProjectBundle(project);
    expect(migrated.dialogues.responseGroups).toHaveLength(5);
    expect(migrated.dialogues.starterResponsesVersion).toBe(2);
    expect(migrated.scenes.items[0]!.hotspots[0]!.response).toBeUndefined();

    migrated.dialogues.responseGroups = [];
    const reopened = parseProjectBundle(migrated);
    expect(reopened.dialogues.responseGroups).toEqual([]);
  });

  it("adds only newly introduced starter groups when upgrading an existing response library", () => {
    const project = createDefaultProjectBundle();
    project.dialogues.starterResponsesVersion = 1;
    project.dialogues.responseGroups = project.dialogues.responseGroups.filter(
      (group) => group.id !== "response_group_no_effect" && group.id !== "response_group_nothing_useful"
    );
    for (const strings of Object.values(project.strings.byLocale)) {
      for (const textId of Object.keys(strings)) {
        if (textId.startsWith("text.response.starter.nothing_useful.")) delete strings[textId];
      }
    }

    const upgraded = parseProjectBundle(project);

    expect(upgraded.dialogues.starterResponsesVersion).toBe(2);
    expect(upgraded.dialogues.responseGroups.map((group) => group.id)).toContain("response_group_nothing_useful");
    expect(upgraded.dialogues.responseGroups.map((group) => group.id)).not.toContain("response_group_no_effect");
    expect(upgraded.strings.byLocale.fr?.["text.response.starter.nothing_useful.1"]).toBe("Juste du bazar ordinaire.");
  });

  it("exports the response library and validates assigned response media", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_response_audio",
      name: "response.mp3",
      kind: "audio",
      category: "response",
      variants: {
        en: { sourcePath: "response.mp3", importedAt: new Date().toISOString() }
      }
    });
    project.dialogues.responseGroups.push({
      id: "response_group_audio",
      name: "Audio",
      entries: [{ id: "response_audio", kind: "audio", assetId: "asset_response_audio" }]
    });
    project.scenes.items[0]!.hotspots[0]!.response = { type: "group", groupId: "response_group_audio" };

    const exported = toExportProjectData(project);
    expect(exported.responseGroups?.at(-1)?.id).toBe("response_group_audio");
    expect(exported.starterResponsesVersion).toBe(2);
    expect(validateProject(project).issues.some((issue) => issue.code.startsWith("RESPONSE_"))).toBe(false);

    project.dialogues.responseGroups.at(-1)!.entries[0] = {
      id: "response_audio",
      kind: "video",
      assetId: "asset_response_audio"
    };
    expect(validateProject(project).issues.map((issue) => issue.code)).toContain("RESPONSE_MEDIA_KIND_INVALID");
  });

  it("round-trips explicit optional hotspot interaction events", () => {
    const project = createDefaultProjectBundle("Interaction events");
    project.manifest.variables.push(
      { id: "cabinet.examined", name: "Cabinet examined", description: "", type: "boolean", initialValue: false, system: false },
      { id: "cabinet.wrongItem", name: "Wrong item", description: "", type: "boolean", initialValue: false, system: false }
    );
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    hotspot.clickEvent = {
      dialogueTreeId: "dialogue_locked",
      targetSceneId: "scene_locked",
      effects: [{ type: "setVariable", variableId: "cabinet.examined", value: true }]
    };
    hotspot.otherItemEvent = {
      effects: [{ type: "setVariable", variableId: "cabinet.wrongItem", value: true }]
    };

    const parsed = parseProjectBundle(project);

    expect(parsed.manifest.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.scenes.items[0]?.hotspots[0]?.clickEvent).toEqual(hotspot.clickEvent);
    expect(parsed.scenes.items[0]?.hotspots[0]?.otherItemEvent).toEqual(hotspot.otherItemEvent);
    expect(toExportProjectData(parsed).scenes[0]?.hotspots[0]?.clickEvent).toEqual(hotspot.clickEvent);
    expect(toExportProjectData(parsed).scenes[0]?.hotspots[0]?.otherItemEvent).toEqual(hotspot.otherItemEvent);
  });

  it("migrates a legacy Otherwise event according to the hotspot interaction type", () => {
    const normalProject = createDefaultProjectBundle("Normal migration");
    normalProject.manifest.variables.push({ id: "cabinet.examined", name: "Cabinet examined", description: "", type: "boolean", initialValue: false, system: false });
    const normalHotspot = normalProject.scenes.items[0]!.hotspots[0]!;
    Object.assign(normalHotspot as unknown as Record<string, unknown>, {
      otherwise: {
        dialogueTreeId: "dialogue_locked",
        effects: [{ type: "setVariable", variableId: "cabinet.examined", value: true }]
      }
    });

    const parsedNormal = parseProjectBundle(normalProject);
    const migratedNormal = parsedNormal.scenes.items[0]!.hotspots[0]!;
    expect(migratedNormal.dialogueTreeId).toBe("dialogue_locked");
    expect(migratedNormal.effects).toEqual([{ type: "setVariable", variableId: "cabinet.examined", value: true }]);
    expect(migratedNormal.otherItemEvent).toEqual({
      dialogueTreeId: "dialogue_locked",
      effects: [{ type: "setVariable", variableId: "cabinet.examined", value: true }]
    });
    expect(migratedNormal).not.toHaveProperty("otherwise");

    const placementProject = createDefaultProjectBundle("Placement migration");
    placementProject.manifest.variables.push({ id: "cabinet.examined", name: "Cabinet examined", description: "", type: "boolean", initialValue: false, system: false });
    const placementHotspot = placementProject.scenes.items[0]!.hotspots[0]!;
    placementHotspot.placedInventoryItemId = "item_key";
    placementHotspot.requiredItemIds = ["item_key"];
    placementHotspot.effects = [{ type: "removeItem", itemId: "item_key" }];
    Object.assign(placementHotspot as unknown as Record<string, unknown>, {
      otherwise: {
        dialogueTreeId: "dialogue_locked",
        effects: [{ type: "setVariable", variableId: "cabinet.examined", value: true }]
      }
    });

    const migratedPlacement = parseProjectBundle(placementProject).scenes.items[0]!.hotspots[0]!;
    expect(migratedPlacement.clickEvent).toEqual(migratedPlacement.otherItemEvent);
    expect(migratedPlacement.clickEvent?.dialogueTreeId).toBe("dialogue_locked");
    expect(migratedPlacement.effects).toEqual([{ type: "removeItem", itemId: "item_key" }]);
    expect(migratedPlacement).not.toHaveProperty("otherwise");

    const emptyProject = createDefaultProjectBundle("Empty migration");
    Object.assign(emptyProject.scenes.items[0]!.hotspots[0]! as unknown as Record<string, unknown>, {
      otherwise: { effects: [] }
    });
    const emptyHotspot = parseProjectBundle(emptyProject).scenes.items[0]!.hotspots[0]!;
    expect(emptyHotspot).not.toHaveProperty("clickEvent");
    expect(emptyHotspot).not.toHaveProperty("otherItemEvent");
  });

  it("includes interaction-event navigation in scene links and validates its references", () => {
    const project = createDefaultProjectBundle("Interaction event references");
    const scene = project.scenes.items[0]!;
    scene.hotspots[0]!.clickEvent = {
      targetSceneId: "scene_click_missing",
      dialogueTreeId: "dialogue_click_missing",
      effects: [
        { type: "goToScene", sceneId: "scene_click_effect_missing" },
        { type: "addItem", itemId: "item_missing" }
      ]
    };
    scene.hotspots[0]!.otherItemEvent = {
      targetSceneId: "scene_other_missing",
      dialogueTreeId: "dialogue_other_missing",
      effects: [{ type: "goToScene", sceneId: "scene_other_effect_missing" }]
    };

    expect(collectSceneLinks(scene)).toEqual(
      expect.arrayContaining([
        "scene_click_missing",
        "scene_click_effect_missing",
        "scene_other_missing",
        "scene_other_effect_missing"
      ])
    );

    const codes = validateProject(project).issues.map((issue) => issue.code);
    expect(codes).toContain("HOTSPOT_CLICK_TARGET_SCENE_MISSING");
    expect(codes).toContain("HOTSPOT_CLICK_DIALOGUE_MISSING");
    expect(codes).toContain("HOTSPOT_OTHER_ITEM_TARGET_SCENE_MISSING");
    expect(codes).toContain("HOTSPOT_OTHER_ITEM_DIALOGUE_MISSING");
    expect(codes).toContain("EFFECT_SCENE_MISSING");
    expect(codes).toContain("EFFECT_ITEM_MISSING");
  });
});

describe("project validation", () => {
  it("reports missing scene media on the starter template", () => {
    const report = validateProject(createDefaultProjectBundle());

    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SCENE_BACKGROUND_MISSING")).toBe(true);
  });

  it("allows scenes without backgroundAssetId to parse and reports them as missing background media", () => {
    const project = createDefaultProjectBundle();
    project.scenes.items.push({
      id: "scene_empty",
      locationId: project.locations.items[0]!.id,
      name: "Empty Scene",
      sceneAudioLoop: true,
      sceneAudioDelayMs: 0,
      backgroundVideoLoop: false,
      videoAudioMode: "silent",
      hotspots: [],
      dialogueTreeIds: [],
      onEnterEffects: [],
      onExitEffects: [],
      onMediaEndEffects: []
    });
    project.locations.items[0]!.sceneIds.push("scene_empty");

    const parsed = parseProjectBundle(project);
    const report = validateProject(parsed);
    const issue = report.issues.find((entry) => entry.code === "SCENE_BACKGROUND_MISSING" && entry.entityId === "scene_empty");

    expect(parsed.scenes.items.find((scene) => scene.id === "scene_empty")?.backgroundAssetId).toBeUndefined();
    expect(issue?.message).toBe("Scene 'scene_empty' does not have a background asset assigned.");
  });

  it("reports missing localized scene audio variants", () => {
    const project = createDefaultProjectBundle();
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

    expect(issue).toMatchObject({
      entityId: "asset_scene_audio",
      locale: "fr",
      level: "error"
    });
  });

  it("accepts scene audio when a video explicitly uses an external track", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push(
      {
        id: "asset_video",
        kind: "video",
        name: "intro.mp4",
        variants: {
          en: {
            sourcePath: "intro.mp4",
            importedAt: new Date().toISOString(),
            durationMs: 5000,
            hasAudio: true
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
            importedAt: new Date().toISOString(),
            durationMs: 5000
          }
        }
      }
    );
    project.scenes.items[0].backgroundAssetId = "asset_video";
    project.scenes.items[0].sceneAudioAssetId = "asset_scene_audio";
    project.scenes.items[0].videoAudioMode = "external";

    const codes = validateProject(project).issues.map((issue) => issue.code);
    expect(codes).not.toContain("SCENE_AUDIO_MODE_INVALID");
    expect(codes).not.toContain("VIDEO_EXTERNAL_AUDIO_MISSING");
  });

  it("rejects scene audio when no background asset is assigned", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
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
    });
    delete project.scenes.items[0].backgroundAssetId;
    project.scenes.items[0].sceneAudioAssetId = "asset_scene_audio";

    expect(validateProject(project).issues.some((issue) => issue.code === "SCENE_AUDIO_MODE_INVALID")).toBe(
      true
    );
  });

  it("warns when embedded video audio is missing or was not inspected", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_video",
      kind: "video",
      name: "intro.mp4",
      category: "background",
      variants: {
        en: {
          sourcePath: "intro.mp4",
          importedAt: new Date().toISOString(),
          hasAudio: false
        }
      }
    });
    project.scenes.items[0]!.backgroundAssetId = "asset_video";
    project.scenes.items[0]!.videoAudioMode = "embedded";

    expect(validateProject(project).issues).toContainEqual(
      expect.objectContaining({
        code: "VIDEO_EMBEDDED_AUDIO_MISSING",
        entityId: project.scenes.items[0]!.id,
        level: "warning",
        locale: "en"
      })
    );

    delete project.assets.assets[0]!.variants.en!.hasAudio;
    expect(validateProject(project).issues).toContainEqual(
      expect.objectContaining({
        code: "VIDEO_EMBEDDED_AUDIO_UNVERIFIED",
        entityId: project.scenes.items[0]!.id,
        level: "warning",
        locale: "en"
      })
    );
  });

  it("rejects media-end effects on looping or non-video scenes", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_video",
      kind: "video",
      name: "intro.mp4",
      category: "background",
      variants: { en: { sourcePath: "intro.mp4", importedAt: new Date().toISOString(), hasAudio: true } }
    });
    const scene = project.scenes.items[0]!;
    scene.backgroundAssetId = "asset_video";
    scene.backgroundVideoLoop = true;
    project.manifest.variables.push({ id: "finished", name: "Finished", description: "", type: "boolean", initialValue: false, system: false });
    scene.onMediaEndEffects = [{ type: "setVariable", variableId: "finished", value: true }];

    expect(validateProject(project).issues.some((issue) => issue.code === "VIDEO_LOOP_MEDIA_END_EFFECTS_INVALID")).toBe(true);

    scene.backgroundAssetId = undefined;
    scene.backgroundVideoLoop = false;
    expect(validateProject(project).issues.some((issue) => issue.code === "MEDIA_END_EFFECTS_REQUIRE_VIDEO")).toBe(true);
  });

  it("reports missing inventory text warnings while ignoring legacy location and scene text fields", () => {
    const project = createDefaultProjectBundle();
    project.locations.items[0]!.descriptionTextId = "text.location.intro";
    project.inventory.items.push({
      id: "item_intro",
      name: "Lantern",
      textId: "text.item_intro.name",
      descriptionTextId: "text.item_intro.description"
    });

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "LOCATION_DESCRIPTION_TEXT_MISSING")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SCENE_OVERLAY_TEXT_MISSING")).toBe(false);
    expect(report.issues.some((issue) => issue.code === "INVENTORY_NAME_TEXT_MISSING")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "INVENTORY_DESCRIPTION_TEXT_MISSING")).toBe(true);
  });

  it("warns when inventory items are missing assigned art", () => {
    const project = createDefaultProjectBundle();
    project.inventory.items.push({
      id: "item_intro",
      name: "Lantern",
      textId: "text.item_intro.name"
    });
    project.strings.byLocale.en["text.item_intro.name"] = "Lantern";

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "INVENTORY_IMAGE_MISSING" && issue.level === "warning")).toBe(true);
  });

  it("rejects inventory items that reference background assets as their art", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_background",
      kind: "image",
      name: "background.png",
      category: "background",
      variants: {
        en: {
          sourcePath: "background.png",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.inventory.items.push({
      id: "item_intro",
      name: "Lantern",
      textId: "text.item_intro.name",
      imageAssetId: "asset_background"
    });
    project.strings.byLocale.en["text.item_intro.name"] = "Lantern";

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "INVENTORY_IMAGE_CATEGORY_INVALID")).toBe(true);
  });

  it("rejects hotspots that reference missing linked inventory items", () => {
    const project = createDefaultProjectBundle();
    project.scenes.items[0]!.hotspots[0]!.inventoryItemId = "item_missing";

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "HOTSPOT_INVENTORY_ITEM_MISSING")).toBe(true);
  });

  it("aligns the starter hotspot with the desk doors in the placeholder scene artwork", () => {
    const project = createDefaultProjectBundle();
    const hotspot = project.scenes.items[0]?.hotspots[0];

    expect(project.scenes.items[0]?.backgroundVideoLoop).toBe(false);
    expect(hotspot?.name).toBe("Placeholder");
    expect(hotspot?.commentTextId).toBe("text.hotspot.inspect.comment");
    expect(hotspot?.x).toBeCloseTo(338 / 1280);
    expect(hotspot?.y).toBeCloseTo(444 / 720);
    expect(hotspot?.width).toBeCloseTo(244 / 1280);
    expect(hotspot?.height).toBeCloseTo(148 / 720);
    expect(hotspot?.polygon).toHaveLength(4);
    expect(hotspot?.polygon?.[0]?.x).toBeCloseTo(338 / 1280);
    expect(hotspot?.polygon?.[0]?.y).toBeCloseTo(444 / 720);
    expect(hotspot?.polygon?.[1]?.x).toBeCloseTo(582 / 1280);
    expect(hotspot?.polygon?.[1]?.y).toBeCloseTo(444 / 720);
    expect(hotspot?.polygon?.[2]?.x).toBeCloseTo(582 / 1280);
    expect(hotspot?.polygon?.[2]?.y).toBeCloseTo(592 / 720);
    expect(hotspot?.polygon?.[3]?.x).toBeCloseTo(338 / 1280);
    expect(hotspot?.polygon?.[3]?.y).toBeCloseTo(592 / 720);
    expect(hotspot?.timingMode).toBe("sceneDuration");
    expect(hotspot).not.toHaveProperty("labelTextId");
    expect(project.strings.byLocale[project.manifest.defaultLanguage]).not.toHaveProperty("text.hotspot.inspect");
    expect(project.strings.byLocale[project.manifest.defaultLanguage]["text.hotspot.inspect.comment"]).toBe(
      "Add real hotspots in Scenes"
    );
  });

  it("treats hotspot targets and go-to-scene effects as reachable links", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_placeholder",
      kind: "image",
      name: "Placeholder",
      variants: {
        en: {
          sourcePath: "placeholder.png",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.locations.items[0]?.sceneIds.push("scene_two", "scene_three");
    project.scenes.items[0]!.hotspots[0]!.targetSceneId = "scene_two";
    project.scenes.items[0]!.onEnterEffects = [{ type: "goToScene", sceneId: "scene_three" }];
    project.scenes.items.push(
      {
        id: "scene_two",
        locationId: project.locations.items[0]!.id,
        name: "Second",
        backgroundAssetId: "asset_placeholder",
        sceneAudioLoop: true,
        sceneAudioDelayMs: 0,
        backgroundVideoLoop: false,
        hotspots: [],
        dialogueTreeIds: [],
        onEnterEffects: [],
        onExitEffects: []
      },
      {
        id: "scene_three",
        locationId: project.locations.items[0]!.id,
        name: "Third",
        backgroundAssetId: "asset_placeholder",
        sceneAudioLoop: true,
        sceneAudioDelayMs: 0,
        backgroundVideoLoop: false,
        hotspots: [],
        dialogueTreeIds: [],
        onEnterEffects: [],
        onExitEffects: []
      }
    );

    const report = validateProject(project);

    expect(report.issues.some((issue) => issue.code === "SCENE_UNREACHABLE" && issue.entityId === "scene_two")).toBe(
      false
    );
    expect(
      report.issues.some((issue) => issue.code === "SCENE_UNREACHABLE" && issue.entityId === "scene_three")
    ).toBe(false);
  });

  it("describes unreachable scenes with scene names in the validation message", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_placeholder",
      kind: "image",
      name: "Placeholder",
      variants: {
        en: {
          sourcePath: "placeholder.png",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.locations.items[0]?.sceneIds.push("scene_bpacnlcm");
    project.scenes.items.push({
      id: "scene_bpacnlcm",
      locationId: project.locations.items[0]!.id,
      name: "Scene 2",
      backgroundAssetId: "asset_placeholder",
      sceneAudioLoop: true,
      sceneAudioDelayMs: 0,
      backgroundVideoLoop: false,
      hotspots: [],
      dialogueTreeIds: [],
      onEnterEffects: [],
      onExitEffects: []
    });

    const report = validateProject(project);
    const unreachableSceneIssue = report.issues.find((issue) => issue.code === "SCENE_UNREACHABLE");

    expect(unreachableSceneIssue?.message).toBe("Scene 'Scene 2' is unreachable from 'Opening Scene'.");
  });
});

describe("hotspot content placement", () => {
  it("honors stored inventory polygons for bounds, clip paths, and rotation", () => {
    const hotspot = {
      inventoryItemId: "item_lantern",
      x: 0.2,
      y: 0.15,
      width: 0.18,
      height: 0.16,
      polygon: [
        { x: 0.22, y: 0.15 },
        { x: 0.38, y: 0.19 },
        { x: 0.36, y: 0.32 },
        { x: 0.2, y: 0.29 }
      ]
    };

    expect(resolveHotspotBounds(hotspot)).toEqual({
      x: 0.2,
      y: 0.15,
      width: 0.18,
      height: 0.17
    });
    expect(resolveHotspotClipPath(hotspot)).toBe("polygon(11.1111% 0%, 100% 23.5294%, 88.8889% 100%, 0% 82.3529%)");
    expect(resolveHotspotRotationDegrees(hotspot)).toBeCloseTo(14.04, 2);
  });

  it("validates localized foreground media for hotspot interactions and dialogue lines", () => {
    const project = createDefaultProjectBundle("Localized foreground media");
    project.manifest.supportedLocales = ["en", "fr"];
    project.assets.assets.push({
      id: "asset_foreground",
      kind: "video",
      name: "cut-in.mp4",
      category: "foreground",
      variants: {
        en: {
          sourcePath: "cut-in.mp4",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.scenes.items[0]!.hotspots[0]!.mediaAssetId = "asset_foreground";
    project.dialogues.items.push({
      id: "dialogue_intro",
      name: "Intro",
      startNodeId: "node_intro",
      nodes: [
        {
          id: "node_intro",
          speaker: "Guide",
          textId: "text.node_intro",
          mediaAssetId: "asset_foreground",
          effects: [],
          choices: []
        }
      ]
    });
    project.strings.byLocale.en["text.node_intro"] = "Watch.";
    project.strings.byLocale.fr = { "text.node_intro": "Regardez." };

    const report = validateProject(project);

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "HOTSPOT_MEDIA_LOCALE_MISSING", entityId: "asset_foreground", locale: "fr" }),
        expect.objectContaining({ code: "DIALOGUE_MEDIA_LOCALE_MISSING", entityId: "asset_foreground", locale: "fr" })
      ])
    );
  });

  it("rejects background-category media attached as foreground content", () => {
    const project = createDefaultProjectBundle("Invalid foreground category");
    project.assets.assets.push({
      id: "asset_background_video",
      kind: "video",
      name: "background.mp4",
      category: "background",
      variants: {
        en: {
          sourcePath: "background.mp4",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.scenes.items[0]!.hotspots[0]!.mediaAssetId = "asset_background_video";

    expect(validateProject(project).issues.some((issue) => issue.code === "HOTSPOT_MEDIA_CATEGORY_INVALID")).toBe(true);
  });

  it("accepts saved side-center hotspot points", () => {
    const project = createDefaultProjectBundle();
    project.scenes.items[0]!.hotspots[0]!.polygon = [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.04 },
      { x: 0.9, y: 0.1 },
      { x: 0.96, y: 0.5 },
      { x: 0.9, y: 0.9 },
      { x: 0.5, y: 0.96 },
      { x: 0.1, y: 0.9 },
      { x: 0.04, y: 0.5 }
    ];

    const parsed = parseProjectBundle(project);
    const hotspot = parsed.scenes.items[0]!.hotspots[0]!;

    expect(hotspot.polygon).toHaveLength(8);
    const bounds = resolveHotspotBounds(hotspot);
    expect(bounds.x).toBeCloseTo(0.04, 6);
    expect(bounds.y).toBeCloseTo(0.04, 6);
    expect(bounds.width).toBeCloseTo(0.92, 6);
    expect(bounds.height).toBeCloseTo(0.92, 6);
    expect(resolveHotspotRotationDegrees(hotspot)).toBe(0);
    expect(resolveHotspotClipPath(hotspot)).toContain("50% 0%");
  });

  it("anchors content near the polygon centroid instead of the bounding box top", () => {
    const placement = resolveRelativeHotspotContentBox({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      polygon: [
        { x: 0.33, y: 0 },
        { x: 0.9, y: 0.12 },
        { x: 1, y: 0.95 },
        { x: 0, y: 0.9 }
      ]
    });

    expect(placement.x).toBeGreaterThan(0.45);
    expect(placement.x).toBeLessThan(0.6);
    expect(placement.y).toBeGreaterThan(0.42);
    expect(placement.y).toBeLessThan(0.62);
    expect(placement.width).toBeLessThan(0.9);
    expect(placement.height).toBeLessThan(0.9);
  });

  it("keeps rotated inventory art sized to the rectangle instead of the bounding box", () => {
    const visualBox = resolveRelativeHotspotVisualBox(
      {
        inventoryItemId: "item_potion",
        x: 0.36,
        y: 0.36,
        width: 0.28,
        height: 0.28,
        polygon: [
          { x: 0.5, y: 0.36 },
          { x: 0.64, y: 0.5 },
          { x: 0.5, y: 0.64 },
          { x: 0.36, y: 0.5 }
        ]
      },
      {
        width: 100,
        height: 100
      }
    );

    expect(visualBox.x).toBeCloseTo(0.1464, 3);
    expect(visualBox.y).toBeCloseTo(0.1464, 3);
    expect(visualBox.width).toBeCloseTo(0.7071, 3);
    expect(visualBox.height).toBeCloseTo(0.7071, 3);
  });

  it("rectifies rotated inventory hotspots back to a rectangle for rendering", () => {
    const frame = resolveRelativeHotspotFrame(
      {
        inventoryItemId: "item_potion",
        x: 0.2,
        y: 0.15,
        width: 0.18,
        height: 0.17,
        polygon: [
          { x: 0.22, y: 0.15 },
          { x: 0.38, y: 0.19 },
          { x: 0.36, y: 0.32 },
          { x: 0.2, y: 0.29 }
        ]
      },
      {
        width: 1600,
        height: 900
      }
    );

    expect(frame.rotationDegrees).toBeCloseTo(8.0047, 4);
    expect(frame.polygon).toHaveLength(4);
    expect(Math.min(...frame.polygon.map((point) => point.x))).toBeLessThan(0.1);
    expect(Math.max(...frame.polygon.map((point) => point.x))).toBeGreaterThan(0.9);
    expect(Math.min(...frame.polygon.map((point) => point.y))).toBeLessThan(0);
    expect(Math.max(...frame.polygon.map((point) => point.y))).toBeGreaterThan(1);
  });

  it("allows wide rotated inventory art to extend beyond the bounding box before clipping", () => {
    const visualBox = resolveRelativeHotspotVisualBox(
      {
        inventoryItemId: "item_scroll",
        x: 0.32,
        y: 0.18,
        width: 0.16,
        height: 0.29,
        polygon: [
          { x: 0.3392, y: 0.1816 },
          { x: 0.4807, y: 0.433 },
          { x: 0.4608, y: 0.4684 },
          { x: 0.3193, y: 0.217 }
        ]
      },
      {
        width: 1600,
        height: 900
      }
    );

    expect(visualBox.x).toBeLessThan(0);
    expect(visualBox.width).toBeGreaterThan(1);
  });
});

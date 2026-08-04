import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, createInitialSaveState, toExportProjectData } from "@mage2/schema";
import {
  isRuntimeDebugMode,
  persistRuntimeInterfaceLocalePreference,
  resolveRuntimeHeaderContent,
  resolveRuntimeInitialContentLocale,
  resolveRuntimeInterfaceLocale,
  resolveRuntimeInterfaceLocalePreference,
  resolveRuntimeInterfaceLocaleStorageKey,
  resolveRuntimeLocaleStrings,
  resolveRuntimePlayerCopy,
  resolveRuntimeSaveLoadNotice,
  resolveRuntimeSystemCopy,
  restoreRuntimeSession
} from "./App";

describe("runtime mode", () => {
  it("requires the exact debug=1 query opt-in", () => {
    expect(isRuntimeDebugMode("?debug=1")).toBe(true);
    expect(isRuntimeDebugMode("?project=demo&debug=1")).toBe(true);
    expect(isRuntimeDebugMode("")).toBe(false);
    expect(isRuntimeDebugMode("?debug=true")).toBe(false);
    expect(isRuntimeDebugMode("?debug=01")).toBe(false);
    expect(isRuntimeDebugMode("?debug=0")).toBe(false);
  });
});

describe("restoreRuntimeSession", () => {
  it("hydrates exported response groups into the runtime controller", () => {
    const project = createDefaultProjectBundle("Runtime Responses");
    const group = project.dialogues.responseGroups[0]!;
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    hotspot.response = { type: "group", groupId: group.id };

    const restored = restoreRuntimeSession(toExportProjectData(project), null);
    const response = restored.controller.selectHotspot(hotspot.id, 1000).response;

    expect(group.entries.map((entry) => entry.id)).toContain(response?.entry.id);
    expect(response?.sourceGroupId).toBe(group.id);
  });

  it("automatically resumes a valid saved session", () => {
    const project = createDefaultProjectBundle("Runtime Save");
    const saveState = createInitialSaveState(project);
    saveState.flags.lanternLit = true;
    saveState.playheadMs = 1425;

    const restored = restoreRuntimeSession(toExportProjectData(project), JSON.stringify(saveState));

    expect(restored.recovered).toBe(false);
    expect(restored.saveState).toMatchObject({
      currentLocationId: project.manifest.startLocationId,
      currentSceneId: project.manifest.startSceneId,
      flags: { lanternLit: true },
      playheadMs: 1425
    });
    expect(restored.controller.getSnapshot().flags).toEqual({ lanternLit: true });
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["schema-invalid JSON", JSON.stringify({ currentSceneId: "scene_intro" })],
    [
      "unknown scene state",
      JSON.stringify({
        ...createInitialSaveState(createDefaultProjectBundle("Unknown Scene")),
        currentSceneId: "scene_missing"
      })
    ],
    [
      "unknown location state",
      JSON.stringify({
        ...createInitialSaveState(createDefaultProjectBundle("Unknown Location")),
        currentLocationId: "location_missing"
      })
    ],
    [
      "unknown inventory state",
      JSON.stringify({
        ...createInitialSaveState(createDefaultProjectBundle("Unknown Inventory")),
        inventory: ["item_missing"]
      })
    ],
    [
      "unknown visited scene state",
      JSON.stringify({
        ...createInitialSaveState(createDefaultProjectBundle("Unknown Visit")),
        visitedSceneIds: ["scene_missing"]
      })
    ],
    [
      "current scene missing from visit history",
      JSON.stringify({
        ...createInitialSaveState(createDefaultProjectBundle("Missing Current Visit")),
        visitedSceneIds: []
      })
    ]
  ])("recovers %s to a clean initial session", (_caseName, storedSave) => {
    const project = createDefaultProjectBundle("Runtime Recovery");
    const restored = restoreRuntimeSession(toExportProjectData(project), storedSave);

    expect(restored.recovered).toBe(true);
    expect(restored.saveState).toEqual(createInitialSaveState(project));
    expect(restored.controller.getSnapshot().scene.id).toBe(project.manifest.startSceneId);
  });

  it("recovers a save whose valid scene and location do not belong together", () => {
    const project = createDefaultProjectBundle("Runtime Mismatch");
    project.locations.items.push({
      id: "location_elsewhere",
      name: "Elsewhere",
      x: 0,
      y: 0,
      sceneIds: []
    });
    const saveState = {
      ...createInitialSaveState(project),
      currentLocationId: "location_elsewhere"
    };

    const restored = restoreRuntimeSession(toExportProjectData(project), JSON.stringify(saveState));

    expect(restored.recovered).toBe(true);
    expect(restored.saveState).toEqual(createInitialSaveState(project));
  });

  it("uses localized player copy instead of an internal diagnostic after corrupt-save recovery", () => {
    const project = createDefaultProjectBundle("Runtime Recovery Notice");
    const restored = restoreRuntimeSession(toExportProjectData(project), "{not-json");

    expect(resolveRuntimeSaveLoadNotice(restored.loadResult, "en")).toBe(
      "The saved game could not be read. A new game was started."
    );
    expect(resolveRuntimeSaveLoadNotice(restored.loadResult, "fr")).toBe(
      "La sauvegarde était illisible. Une nouvelle partie a été lancée."
    );
  });
});

describe("runtime localization", () => {
  it("resolves complete system copy through the shared seven-locale resolver", () => {
    expect(resolveRuntimeSystemCopy("fr").debugMode).toBe("Mode debug");
    expect(resolveRuntimeSystemCopy("fr-CA").gameSaved).toBe("Partie sauvegardée.");
    expect(resolveRuntimeSystemCopy("de-DE").gameSaved).toBe("Game saved.");
    expect(resolveRuntimeSystemCopy("es").loading).toBe("Cargando el juego...");
    expect(resolveRuntimeSystemCopy("zh-Hans").startupErrorTitle).toBe("无法启动此游戏");
    expect(resolveRuntimeSystemCopy("ja").saveRecovered).toContain("ニューゲーム");
    expect(resolveRuntimeSystemCopy("ko").rawSave).toBe("원시 저장 상태");
    expect(resolveRuntimeSystemCopy("ar").showHotspots).toBe("إظهار مناطق التفاعل");
    expect(resolveRuntimeSystemCopy("zh-Hant").loading).toBe("Loading game...");
    expect(resolveRuntimeSystemCopy("fr").startupErrorTitle).toBe("Impossible de lancer ce jeu");
    expect(resolveRuntimeSystemCopy("de-DE").startupErrorTitle).toBe("Unable to start this game");
  });

  it("detects and persists interface locale preferences independently", () => {
    expect(resolveRuntimeInterfaceLocale("automatic", ["de-DE", "ar-SA", "fr-FR"])).toBe("ar");
    expect(resolveRuntimeInterfaceLocale("automatic", ["zh-TW", "fr-FR"])).toBe("fr");
    expect(resolveRuntimeInterfaceLocale("automatic", ["zh-HK"])).toBe("en");
    expect(resolveRuntimeInterfaceLocale("ja", ["fr-FR"])).toBe("ja");
    expect(resolveRuntimeInterfaceLocalePreference("ko")).toBe("ko");
    expect(resolveRuntimeInterfaceLocalePreference("de")).toBe("automatic");
    expect(resolveRuntimeInterfaceLocaleStorageKey("project_one")).toBe("mage2-runtime-interface-locale:project_one");

    const calls: string[] = [];
    const storage = {
      setItem: (key: string, value: string) => calls.push(`set:${key}:${value}`),
      removeItem: (key: string) => calls.push(`remove:${key}`)
    };
    persistRuntimeInterfaceLocalePreference(storage, "interface-key", "fr");
    persistRuntimeInterfaceLocalePreference(storage, "interface-key", "automatic");
    expect(calls).toEqual(["set:interface-key:fr", "remove:interface-key"]);
  });

  it("selects content independently while preserving the backward-compatible stored choice", () => {
    const common = { supportedLocales: ["en", "fr"], defaultLanguage: "en" } as const;
    expect(resolveRuntimeInitialContentLocale({ ...common, storedContentLocale: "fr", interfaceLocale: "ar" })).toBe("fr");
    expect(resolveRuntimeInitialContentLocale({ ...common, storedContentLocale: null, interfaceLocale: "fr" })).toBe("fr");
    expect(resolveRuntimeInitialContentLocale({ ...common, storedContentLocale: null, interfaceLocale: "ar" })).toBe("en");
    expect(resolveRuntimeInitialContentLocale({
      supportedLocales: ["en", "fr-CA"], defaultLanguage: "en", storedContentLocale: null, interfaceLocale: "fr"
    })).toBe("fr-CA");
    expect(resolveRuntimeInitialContentLocale({
      supportedLocales: ["en", "zh-Hant"], defaultLanguage: "zh-Hant", storedContentLocale: null, interfaceLocale: "en"
    })).toBe("en");
  });

  it("lays active authored strings over default-locale fallbacks", () => {
    expect(
      resolveRuntimeLocaleStrings(
        {
          en: { shared: "Default text", overridden: "Default choice" },
          fr: { overridden: "Choix français" }
        },
        "fr",
        "en"
      )
    ).toEqual({
      shared: "Default text",
      overridden: "Choix français"
    });
  });

  it("adapts localized runtime copy to the shared player renderer", () => {
    const english = resolveRuntimePlayerCopy("en");
    const french = resolveRuntimePlayerCopy("fr");

    expect(english.inventoryToggleLabel({ isExpanded: false, itemCount: 1 })).toBe(
      "Open inventory (1 item)"
    );
    expect(english.inventoryToggleLabel({ isExpanded: true, itemCount: 2 })).toBe(
      "Close inventory (2 items)"
    );
    expect(french.inventoryToggleLabel({ isExpanded: false, itemCount: 0 })).toBe(
      "Ouvrir l’inventaire (0 objets)"
    );
    expect(french.continueDialogueTitle).toBe("Continuer le dialogue.");
  });
});

describe("resolveRuntimeHeaderContent", () => {
  it("keeps only project identity in the runtime header", () => {
    const content = toExportProjectData(createDefaultProjectBundle("Runtime Header"));

    expect(resolveRuntimeHeaderContent(content)).toEqual({
      projectName: "Runtime Header"
    });
  });

});

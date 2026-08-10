import { describe, expect, it } from "vitest";
import {
  PLAYER_UI_TEXT_IDS,
  assessProjectReadiness,
  createDefaultProjectBundle,
  hasPlayerFacingHotspotBehavior,
  validateProjectForRelease,
  validateProjectReleaseReadiness,
  type Asset,
  type ProjectBundle
} from "./index";

describe("release readiness", () => {
  it("keeps a structurally healthy starter project out of release builds", () => {
    const project = createCompleteStarterProject();
    const report = assessProjectReadiness(project);

    expect(report.health.valid).toBe(true);
    expect(report.ready).toBe(false);
    expect(report.status).toBe("not-ready");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "STARTER_SCENE_MEDIA_IN_USE", level: "error" }),
        expect.objectContaining({ code: "STARTER_HOTSPOT_UNWIRED", level: "error" })
      ])
    );
    expect(report.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "STARTER_PLAYER_ARTWORK_IN_USE" })])
    );
  });

  it("accepts creator-owned content with a meaningful opening interaction", () => {
    const project = createReleaseReadyProject();
    const report = validateProjectForRelease(project);

    expect(report.valid).toBe(true);
    expect(report.issues.map((issue) => issue.code)).not.toContain("STARTER_HOTSPOT_UNWIRED");
    expect(report.issues.some((issue) => issue.code.startsWith("PLAYER_") && issue.level === "error")).toBe(false);
  });

  it("does not mistake conditions or empty event shells for player-facing behavior", () => {
    const project = createReleaseReadyProject();
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    project.manifest.variables.push(
      { id: "door.open", name: "Door open", description: "", type: "boolean", initialValue: false, system: false },
      { id: "door.checked", name: "Door checked", description: "", type: "boolean", initialValue: false, system: false }
    );
    hotspot.effects = [];
    hotspot.conditions = [{ type: "variableCompare", variableId: "door.open", operator: "equals", value: false }];
    hotspot.clickEvent = { effects: [] };

    expect(hasPlayerFacingHotspotBehavior(hotspot)).toBe(false);
    expect(validateProjectReleaseReadiness(project).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "STARTER_HOTSPOT_UNWIRED", level: "error" })])
    );

    hotspot.clickEvent.effects = [{ type: "setVariable", variableId: "door.checked", value: true }];
    expect(hasPlayerFacingHotspotBehavior(hotspot)).toBe(true);
    expect(validateProjectReleaseReadiness(project).issues.map((issue) => issue.code)).not.toContain(
      "STARTER_HOTSPOT_UNWIRED"
    );
  });

  it("blocks broken title references and malformed creator links", () => {
    const project = createReleaseReadyProject();
    project.assets.assets = project.assets.assets.filter((asset) => asset.id !== "asset_starter_title");
    project.manifest.playerPresentation.websiteUrl = "creator.example.com";

    const report = validateProjectReleaseReadiness(project);
    const codes = report.issues.map((issue) => issue.code);

    expect(report.valid).toBe(false);
    expect(codes).toContain("PLAYER_TITLE_BACKGROUND_ASSET_MISSING");
    expect(codes).toContain("PLAYER_WEBSITE_INVALID");
  });

  it("blocks package identity values that desktop builds cannot represent truthfully", () => {
    const project = createReleaseReadyProject();
    project.manifest.gameVersion = "release one";
    const icon = project.assets.assets.find((asset) => asset.id === "asset_starter_icon")!;
    icon.variants.en = {
      ...icon.variants.en!,
      sourcePath: "icon.jpg",
      width: 768,
      height: 512
    };

    const report = validateProjectReleaseReadiness(project);
    const codes = report.issues.map((issue) => issue.code);

    expect(report.valid).toBe(false);
    expect(codes).toContain("PLAYER_GAME_VERSION_INVALID");
    expect(codes).toContain("PLAYER_APP_ICON_FORMAT_INVALID");
    expect(codes).toContain("PLAYER_APP_ICON_NOT_SQUARE");
  });

  it("accepts stable and prerelease semantic game versions", () => {
    const project = createReleaseReadyProject();

    for (const gameVersion of ["1.0.0", "2.4.0-beta.1", "3.0.0+build.7"]) {
      project.manifest.gameVersion = gameVersion;
      expect(validateProjectReleaseReadiness(project).issues).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "PLAYER_GAME_VERSION_INVALID" })])
      );
    }

    project.manifest.gameVersion = "1.0.0-01";
    expect(validateProjectReleaseReadiness(project).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "PLAYER_GAME_VERSION_INVALID" })])
    );
  });

  it("reports untranslated player chrome and localized artwork as release warnings", () => {
    const project = createReleaseReadyProject();
    project.manifest.supportedLocales = ["en", "fr"];
    project.strings.byLocale.fr = {
      [PLAYER_UI_TEXT_IDS.menu]: "Menu"
    };
    project.strings.translationStateByLocale.fr = {
      [PLAYER_UI_TEXT_IDS.menu]: "inherited"
    };

    const report = validateProjectReleaseReadiness(project);

    expect(report.valid).toBe(true);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PLAYER_TEXT_LOCALE_INCOMPLETE", locale: "fr", level: "warning" }),
        expect.objectContaining({ code: "PLAYER_TITLE_BACKGROUND_LOCALE_MISSING", locale: "fr", level: "warning" }),
        expect.objectContaining({ code: "PLAYER_APP_ICON_LOCALE_MISSING", locale: "fr", level: "warning" })
      ])
    );
  });
});

function createReleaseReadyProject(): ProjectBundle {
  const project = createDefaultProjectBundle("Release ready");
  project.assets.assets = [
    createImageAsset("asset_creator_scene", "background", "scene.png"),
    createImageAsset("asset_starter_title", "player", "title.png"),
    createImageAsset("asset_starter_icon", "player", "icon.png")
  ];
  project.scenes.items[0]!.backgroundAssetId = "asset_creator_scene";
  project.manifest.variables.push({ id: "opening.checked", name: "Opening checked", description: "", type: "boolean", initialValue: false, system: false });
  project.scenes.items[0]!.hotspots[0]!.effects = [{ type: "setVariable", variableId: "opening.checked", value: true }];
  return project;
}

function createCompleteStarterProject(): ProjectBundle {
  const project = createDefaultProjectBundle("Complete starter");
  project.assets.assets = [
    createImageAsset("asset_starter_scene", "background", "scene.png", "starter-kit"),
    createImageAsset("asset_starter_title", "player", "title.png", "starter-kit"),
    createImageAsset("asset_starter_icon", "player", "icon.png", "starter-kit")
  ];
  return project;
}

function createImageAsset(
  id: string,
  category: "background" | "player",
  sourcePath: string,
  provenance: "creator" | "starter-kit" = "creator"
): Asset {
  return {
    id,
    kind: "image",
    category,
    name: sourcePath,
    provenance: provenance === "starter-kit"
      ? { source: "starter-kit", packId: "cinematic", packVersion: 1 }
      : { source: "creator" },
    variants: {
      en: {
        sourcePath,
        width: 1024,
        height: 1024,
        importedAt: "2026-08-04T00:00:00.000Z"
      }
    }
  };
}

import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, migrateProjectBundle, validateProject } from "./index";

describe("schema migrations", () => {
  it("upgrades a pre-versioned project bundle", () => {
    const migrated = migrateProjectBundle({
      manifest: {
        projectId: "legacy",
        projectName: "Legacy",
        defaultLanguage: "en",
        engineVersion: "0.0.1",
        startLocationId: "location_intro",
        startSceneId: "scene_intro"
      },
      assets: [],
      locations: [],
      scenes: [],
      dialogues: [],
      inventory: [],
      subtitles: [],
      strings: {}
    });

    expect(migrated.manifest.schemaVersion).toBe(1);
    expect(migrated.assets.schemaVersion).toBe(1);
    expect(migrated.strings.schemaVersion).toBe(1);
  });
});

describe("project validation", () => {
  it("reports missing scene media on the starter template", () => {
    const report = validateProject(createDefaultProjectBundle());

    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.code === "SCENE_BACKGROUND_MISSING")).toBe(true);
  });

  it("aligns the starter hotspot with the placeholder scene artwork", () => {
    const project = createDefaultProjectBundle();
    const hotspot = project.scenes.items[0]?.hotspots[0];

    expect(hotspot?.name).toBe("Placeholder");
    expect(hotspot?.commentTextId).toBe("text.hotspot.inspect.comment");
    expect(hotspot?.x).toBeCloseTo(900 / 1280);
    expect(hotspot?.y).toBeCloseTo(360 / 720);
    expect(hotspot?.width).toBeCloseTo(220 / 1280);
    expect(hotspot?.height).toBeCloseTo(170 / 720);
    expect(project.strings.values["text.hotspot.inspect"]).toBe("Placeholder");
    expect(project.strings.values["text.hotspot.inspect.comment"]).toBe("Add real hotspots in Scenes");
  });
});

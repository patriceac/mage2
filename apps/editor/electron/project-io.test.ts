import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import {
  createProjectInDirectory,
  inspectProjectDirectory,
  loadProjectFromDirectory,
  saveProjectToDirectory
} from "./project-io";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) =>
      rm(tempDir, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("starter project repairs", () => {
  it("creates new starter projects with the visible placeholder hotspot", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-starter-"));
    tempDirs.push(projectDir);

    const project = await createProjectInDirectory(projectDir, "Fresh Starter");
    const hotspot = project.scenes.items[0].hotspots[0];
    const starterSceneSvg = await readFile(path.join(projectDir, "assets", "starter-scene.svg"), "utf8");

    expect(hotspot?.name).toBe("Placeholder");
    expect(hotspot?.commentTextId).toBe("text.hotspot.inspect.comment");
    expect(hotspot?.x).toBeCloseTo(900 / 1280);
    expect(hotspot?.y).toBeCloseTo(360 / 720);
    expect(hotspot?.width).toBeCloseTo(220 / 1280);
    expect(hotspot?.height).toBeCloseTo(170 / 720);
    expect(project.strings.values["text.hotspot.inspect"]).toBe("Placeholder");
    expect(project.strings.values["text.hotspot.inspect.comment"]).toBe("Add real hotspots in Scenes");
    expect(starterSceneSvg).not.toContain(">Placeholder</text>");
    expect(starterSceneSvg).not.toContain("Add real hotspots");
  });

  it("updates the legacy starter hotspot to match the visible placeholder card", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-starter-"));
    tempDirs.push(projectDir);

    const project = createDefaultProjectBundle("Legacy Starter");
    project.assets.assets.push({
      id: "asset_placeholder",
      kind: "image",
      name: "starter-scene.svg",
      sourcePath: path.join(projectDir, "assets", "starter-scene.svg"),
      importedAt: new Date(0).toISOString(),
      width: 1280,
      height: 720
    });

    project.scenes.items[0].hotspots[0] = {
      ...project.scenes.items[0].hotspots[0],
      name: "Inspect",
      x: 0.15,
      y: 0.2,
      width: 0.2,
      height: 0.18
    };
    project.strings.values["text.hotspot.inspect"] = "Inspect";

    const assetsDir = path.join(projectDir, "assets");
    await mkdir(assetsDir, { recursive: true });
    await writeFile(
      path.join(assetsDir, "starter-scene.svg"),
      '<svg><text>Hotspot</text><text>Click in Scenes to add more</text></svg>',
      "utf8"
    );
    await saveProjectToDirectory(projectDir, project);

    const repairedProject = await loadProjectFromDirectory(projectDir);
    const hotspot = repairedProject.scenes.items[0].hotspots[0];
    const starterSceneSvg = await readFile(path.join(projectDir, "assets", "starter-scene.svg"), "utf8");

    expect(hotspot?.name).toBe("Placeholder");
    expect(hotspot?.commentTextId).toBe("text.hotspot.inspect.comment");
    expect(hotspot?.x).toBeCloseTo(900 / 1280);
    expect(hotspot?.y).toBeCloseTo(360 / 720);
    expect(hotspot?.width).toBeCloseTo(220 / 1280);
    expect(hotspot?.height).toBeCloseTo(170 / 720);
    expect(repairedProject.strings.values["text.hotspot.inspect"]).toBe("Placeholder");
    expect(repairedProject.strings.values["text.hotspot.inspect.comment"]).toBe("Add real hotspots in Scenes");
    expect(starterSceneSvg).not.toContain(">Placeholder</text>");
    expect(starterSceneSvg).not.toContain("Add real hotspots");
  });

  it("renames the current starter hotspot copy when loading older placeholder projects", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-starter-"));
    tempDirs.push(projectDir);

    const project = createDefaultProjectBundle("Current Starter");
    const { commentTextId: _commentTextId, ...starterHotspot } = project.scenes.items[0].hotspots[0];
    project.assets.assets.push({
      id: "asset_placeholder",
      kind: "image",
      name: "starter-scene.svg",
      sourcePath: path.join(projectDir, "assets", "starter-scene.svg"),
      importedAt: new Date(0).toISOString(),
      width: 1280,
      height: 720
    });

    project.scenes.items[0].hotspots[0] = {
      ...starterHotspot,
      name: "Hotspot"
    };
    project.strings.values["text.hotspot.inspect"] = "Hotspot";

    const assetsDir = path.join(projectDir, "assets");
    await mkdir(assetsDir, { recursive: true });
    await writeFile(
      path.join(assetsDir, "starter-scene.svg"),
      '<svg><text>Hotspot</text><text>Click in Scenes to add more</text></svg>',
      "utf8"
    );
    await saveProjectToDirectory(projectDir, project);

    const repairedProject = await loadProjectFromDirectory(projectDir);
    const hotspot = repairedProject.scenes.items[0].hotspots[0];

    expect(hotspot?.name).toBe("Placeholder");
    expect(hotspot?.commentTextId).toBe("text.hotspot.inspect.comment");
    expect(repairedProject.strings.values["text.hotspot.inspect"]).toBe("Placeholder");
    expect(repairedProject.strings.values["text.hotspot.inspect.comment"]).toBe("Add real hotspots in Scenes");
  });
});

describe("inspectProjectDirectory", () => {
  it("recognizes loadable MAGE2 project folders", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-inspect-"));
    tempDirs.push(projectDir);

    const project = await createProjectInDirectory(projectDir, "Inspectable Project");
    const inspection = await inspectProjectDirectory(projectDir);

    expect(inspection).toEqual({
      isProjectDirectory: true,
      projectName: project.manifest.projectName
    });
  });

  it("rejects folders missing required project files", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-inspect-"));
    tempDirs.push(projectDir);

    const inspection = await inspectProjectDirectory(projectDir);

    expect(inspection.isProjectDirectory).toBe(false);
    expect(inspection.reason).toContain("missing");
  });
});

describe("subtitle project persistence", () => {
  it("saves projects without writing subtitles.json", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-save-"));
    tempDirs.push(projectDir);

    const project = createDefaultProjectBundle("No Subtitle File");
    project.assets.assets.push({
      id: "asset_visual",
      kind: "image",
      name: "placeholder.png",
      sourcePath: path.join(projectDir, "assets", "placeholder.png"),
      importedAt: new Date(0).toISOString()
    });
    project.scenes.items[0].backgroundAssetId = "asset_visual";
    project.scenes.items[0].subtitleTracks = [
      {
        id: "subtitle_scene",
        cues: [
          {
            id: "cue_scene",
            startMs: 0,
            endMs: 1000,
            text: "Inline text"
          }
        ]
      }
    ];

    await saveProjectToDirectory(projectDir, project);

    await expect(readFile(path.join(projectDir, "subtitles.json"), "utf8")).rejects.toThrow();
  });

  it("loads legacy subtitle files, migrates them into scenes, and removes subtitles.json", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-legacy-subtitles-"));
    tempDirs.push(projectDir);

    await mkdir(path.join(projectDir, "assets"), { recursive: true });

    await writeFile(
      path.join(projectDir, "project.json"),
      JSON.stringify({
        schemaVersion: 2,
        projectId: "legacy_subtitles",
        projectName: "Legacy Subtitles",
        defaultLanguage: "en",
        engineVersion: "0.1.0",
        assetRoots: [path.join(projectDir, "assets")],
        startLocationId: "location_intro",
        startSceneId: "scene_intro",
        buildSettings: {
          outputDir: "build",
          includeSourceMap: false
        }
      }, null, 2),
      "utf8"
    );
    await writeFile(
      path.join(projectDir, "assets.json"),
      JSON.stringify({
        schemaVersion: 2,
        assets: [
          {
            id: "asset_visual",
            kind: "image",
            name: "placeholder.png",
            sourcePath: path.join(projectDir, "assets", "placeholder.png"),
            importedAt: new Date(0).toISOString()
          },
          {
            id: "asset_subtitle",
            kind: "subtitle",
            name: "captions.vtt",
            sourcePath: path.join(projectDir, "assets", "captions.vtt"),
            importedAt: new Date(0).toISOString()
          }
        ]
      }, null, 2),
      "utf8"
    );
    await writeFile(
      path.join(projectDir, "locations.json"),
      JSON.stringify({
        schemaVersion: 2,
        items: [
          {
            id: "location_intro",
            name: "Intro",
            x: 0,
            y: 0,
            sceneIds: ["scene_intro"]
          }
        ]
      }, null, 2),
      "utf8"
    );
    await writeFile(
      path.join(projectDir, "scenes.json"),
      JSON.stringify({
        schemaVersion: 2,
        items: [
          {
            id: "scene_intro",
            locationId: "location_intro",
            name: "Intro Scene",
            backgroundAssetId: "asset_visual",
            backgroundVideoLoop: false,
            hotspots: [],
            exitSceneIds: [],
            subtitleTrackIds: ["subtitle_intro"],
            dialogueTreeIds: [],
            onEnterEffects: [],
            onExitEffects: []
          }
        ]
      }, null, 2),
      "utf8"
    );
    await writeFile(path.join(projectDir, "dialogues.json"), JSON.stringify({ schemaVersion: 2, items: [] }, null, 2), "utf8");
    await writeFile(path.join(projectDir, "inventory.json"), JSON.stringify({ schemaVersion: 2, items: [] }, null, 2), "utf8");
    await writeFile(
      path.join(projectDir, "subtitles.json"),
      JSON.stringify({
        schemaVersion: 2,
        items: [
          {
            id: "subtitle_intro",
            assetId: "asset_subtitle",
            cues: [
              {
                id: "cue_intro",
                startMs: 0,
                endMs: 1000,
                textId: "text.subtitle.intro"
              }
            ]
          }
        ]
      }, null, 2),
      "utf8"
    );
    await writeFile(
      path.join(projectDir, "strings.json"),
      JSON.stringify({
        schemaVersion: 2,
        values: {
          "text.subtitle.intro": "Legacy subtitle text"
        }
      }, null, 2),
      "utf8"
    );

    const project = await loadProjectFromDirectory(projectDir);

    expect(project.assets.assets.map((asset) => asset.id)).toEqual(["asset_visual"]);
    expect(project.scenes.items[0]?.subtitleTracks).toEqual([
      {
        id: "subtitle_intro",
        cues: [
          {
            id: "cue_intro",
            startMs: 0,
            endMs: 1000,
            text: "Legacy subtitle text"
          }
        ]
      }
    ]);
    expect(project.strings.values).toEqual({});
    await expect(readFile(path.join(projectDir, "subtitles.json"), "utf8")).rejects.toThrow();
  });
});

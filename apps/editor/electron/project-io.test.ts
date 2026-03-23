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

describe("starter project creation", () => {
  it("creates new starter projects with the placeholder hotspot on the desk doors", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-starter-"));
    tempDirs.push(projectDir);

    const project = await createProjectInDirectory(projectDir, "Fresh Starter");
    const hotspot = project.scenes.items[0].hotspots[0];
    const starterScenePng = await readFile(path.join(projectDir, "assets", "starter-scene.png"));
    const starterVariant = project.assets.assets[0]?.variants[project.manifest.defaultLanguage];

    expect(hotspot?.name).toBe("Placeholder");
    expect(hotspot?.commentTextId).toBe("text.hotspot.inspect.comment");
    expect(hotspot?.x).toBeCloseTo(338 / 1280);
    expect(hotspot?.y).toBeCloseTo(444 / 720);
    expect(hotspot?.width).toBeCloseTo(244 / 1280);
    expect(hotspot?.height).toBeCloseTo(148 / 720);
    expect(hotspot).not.toHaveProperty("labelTextId");
    expect(project.strings.byLocale[project.manifest.defaultLanguage]).not.toHaveProperty("text.hotspot.inspect");
    expect(project.strings.byLocale[project.manifest.defaultLanguage]["text.hotspot.inspect.comment"]).toBe(
      "Add real hotspots in Scenes"
    );
    expect(starterScenePng.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(starterScenePng.byteLength).toBeGreaterThan(0);
    expect(starterVariant?.proxyPath).toBe(path.join(projectDir, ".mage2", "proxies", "asset_placeholder.en.png"));
    expect(starterVariant?.posterPath).toBe(path.join(projectDir, ".mage2", "proxies", "asset_placeholder.en.thumb.png"));
    expect(await readFile(starterVariant!.proxyPath!)).not.toHaveLength(0);
    expect(await readFile(starterVariant!.posterPath!)).not.toHaveLength(0);
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
      variants: {
        en: {
          sourcePath: path.join(projectDir, "assets", "placeholder.png"),
          importedAt: new Date(0).toISOString()
        }
      }
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
            textId: "text.cue_scene.subtitle"
          }
        ]
      }
    ];
    project.strings.byLocale[project.manifest.defaultLanguage]["text.cue_scene.subtitle"] = "Localized text";

    await saveProjectToDirectory(projectDir, project);

    await expect(readFile(path.join(projectDir, "subtitles.json"), "utf8")).rejects.toThrow();
  });
});

describe("loadProjectFromDirectory", () => {
  it("backfills dedicated image thumbnails for legacy preview metadata", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-load-"));
    tempDirs.push(projectDir);

    const project = createDefaultProjectBundle("Legacy previews");
    const sourcePath = path.join(projectDir, "assets", "legacy.svg");
    const proxyPath = path.join(projectDir, ".mage2", "proxies", "asset_legacy.en.png");

    await mkdir(path.dirname(sourcePath), { recursive: true });
    await mkdir(path.dirname(proxyPath), { recursive: true });
    await writeFile(
      sourcePath,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#102030"/></svg>',
      "utf8"
    );
    await writeFile(proxyPath, "legacy proxy", "utf8");

    project.assets.assets = [
      {
        id: "asset_legacy",
        kind: "image",
        name: "legacy.svg",
        variants: {
          en: {
            sourcePath,
            proxyPath,
            posterPath: proxyPath,
            importedAt: "2026-03-21T00:00:00.000Z"
          }
        }
      }
    ];
    project.scenes.items[0].backgroundAssetId = "asset_legacy";

    await saveProjectToDirectory(projectDir, project);

    const loadedProject = await loadProjectFromDirectory(projectDir);
    const loadedVariant = loadedProject.assets.assets[0]?.variants.en;

    expect(loadedVariant?.proxyPath).toBe(proxyPath);
    expect(loadedVariant?.posterPath).toBe(path.join(projectDir, ".mage2", "proxies", "asset_legacy.en.thumb.png"));
    expect(loadedVariant?.posterPath).not.toBe(loadedVariant?.proxyPath);
    expect(await readFile(loadedVariant!.posterPath!)).not.toHaveLength(0);
  });
});

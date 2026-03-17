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
});

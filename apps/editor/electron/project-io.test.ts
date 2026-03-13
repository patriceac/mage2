import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { createProjectInDirectory, loadProjectFromDirectory, saveProjectToDirectory } from "./project-io";

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

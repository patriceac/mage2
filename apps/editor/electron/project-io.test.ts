import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { loadProjectFromDirectory, saveProjectToDirectory } from "./project-io";

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

    await saveProjectToDirectory(projectDir, project);

    const repairedProject = await loadProjectFromDirectory(projectDir);
    const hotspot = repairedProject.scenes.items[0].hotspots[0];

    expect(hotspot?.name).toBe("Hotspot");
    expect(hotspot?.x).toBeCloseTo(900 / 1280);
    expect(hotspot?.y).toBeCloseTo(360 / 720);
    expect(hotspot?.width).toBeCloseTo(220 / 1280);
    expect(hotspot?.height).toBeCloseTo(170 / 720);
    expect(repairedProject.strings.values["text.hotspot.inspect"]).toBe("Hotspot");
  });
});

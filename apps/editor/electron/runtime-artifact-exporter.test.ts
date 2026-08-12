import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";

vi.mock("electron", () => ({ app: { isPackaged: true } }));

import {
  createWindowsRuntimeFolder,
  sanitizeRuntimeArtifactName,
  suggestedRuntimeArtifactName,
  suggestedWindowsRuntimeExecutableName
} from "./runtime-artifact-exporter";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ready-to-play Windows runtime folder", () => {
  it("creates a managed folder with a named executable, runtime shell, web build, and creator icon", async () => {
    const fixture = await createPackagingFixture();
    const destinationDirectory = path.join(fixture.destinationDirectory, "Safe Game Player");
    const progressUpdates: Array<{ phase: string; progress: number }> = [];

    const result = await createWindowsRuntimeFolder({
      buildDirectory: fixture.buildDirectory,
      destinationDirectory,
      mode: "release",
      project: fixture.project,
      resources: fixture.resources,
      onProgress: (progress) => progressUpdates.push(progress)
    });

    expect(result).toBe(destinationDirectory);
    expect(progressUpdates.map((progress) => progress.phase)).toEqual([
      "assembling-player",
      "publishing",
      "complete"
    ]);
    await expect(readFile(path.join(destinationDirectory, "Safe Game Player.exe"), "utf8")).resolves.toBe(
      "template executable"
    );
    await expect(readFile(path.join(destinationDirectory, "MAGE2 Player.exe"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(readFile(path.join(destinationDirectory, "runtime", "resources", "app.asar"), "utf8")).resolves.toBe(
      "runtime app"
    );
    expect(
      (await readdir(path.join(destinationDirectory, "runtime", "resources"))).some((entry) =>
        entry.includes(".mage2-copy-")
      )
    ).toBe(false);
    await expect(
      readFile(path.join(destinationDirectory, "runtime", "resources", "player", "build-manifest.json"), "utf8")
    ).resolves.toContain("project_windows_folder_test");
    await expect(
      readFile(path.join(destinationDirectory, "runtime", "resources", "creator-icon.png"), "utf8")
    ).resolves.toBe("creator icon");
    const marker = JSON.parse(
      await readFile(path.join(destinationDirectory, ".mage2-windows-player.json"), "utf8")
    );
    expect(marker).toMatchObject({
      format: "mage2-windows-player",
      version: 1,
      projectId: "project_windows_folder_test",
      executableName: "Safe Game Player.exe"
    });
    expect(marker.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "Safe Game Player.exe" }),
        expect.objectContaining({ path: "runtime/MAGE2 Player.exe" }),
        expect.objectContaining({ path: "runtime/resources/app.asar" }),
        expect.objectContaining({ path: "runtime/resources/player/build-manifest.json" })
      ])
    );
    await expect(readdir(fixture.destinationDirectory)).resolves.toEqual(["Safe Game Player"]);
  });

  it("replaces only an intact prior managed folder and preserves it until the new folder is ready", async () => {
    const fixture = await createPackagingFixture();
    const destinationDirectory = path.join(fixture.destinationDirectory, "Safe Game Player");
    await createWindowsRuntimeFolder({
      buildDirectory: fixture.buildDirectory,
      destinationDirectory,
      mode: "release",
      project: fixture.project,
      resources: fixture.resources
    });
    await writeFile(path.join(fixture.resources.runtimeTemplateDirectory, "MAGE2 Player.exe"), "replacement executable");

    await createWindowsRuntimeFolder({
      buildDirectory: fixture.buildDirectory,
      destinationDirectory,
      mode: "release",
      project: fixture.project,
      resources: fixture.resources
    });

    await expect(readFile(path.join(destinationDirectory, "Safe Game Player.exe"), "utf8")).resolves.toBe(
      "replacement executable"
    );
  });

  it("normalizes a read-only packaged template root before atomic publication", async () => {
    const fixture = await createPackagingFixture();
    const destinationDirectory = path.join(fixture.destinationDirectory, "Safe Game Player");
    await chmod(fixture.resources.runtimeTemplateDirectory, 0o555);

    try {
      await expect(
        createWindowsRuntimeFolder({
          buildDirectory: fixture.buildDirectory,
          destinationDirectory,
          mode: "release",
          project: fixture.project,
          resources: fixture.resources
        })
      ).resolves.toBe(destinationDirectory);
      await expect(
        readFile(path.join(destinationDirectory, "Safe Game Player.exe"), "utf8")
      ).resolves.toBe("template executable");
    } finally {
      await chmod(fixture.resources.runtimeTemplateDirectory, 0o755);
    }
  });

  it("refuses linked or modified destinations without deleting their content", async () => {
    const fixture = await createPackagingFixture();
    const destinationDirectory = path.join(fixture.destinationDirectory, "Safe Game Player");
    await createWindowsRuntimeFolder({
      buildDirectory: fixture.buildDirectory,
      destinationDirectory,
      mode: "release",
      project: fixture.project,
      resources: fixture.resources
    });
    const addedFile = path.join(destinationDirectory, "keep-me.txt");
    await writeFile(addedFile, "creator-added file", "utf8");

    await expect(
      createWindowsRuntimeFolder({
        buildDirectory: fixture.buildDirectory,
        destinationDirectory,
        mode: "release",
        project: fixture.project,
        resources: fixture.resources
      })
    ).rejects.toThrow(/unknown, missing, or changed files/i);
    await expect(readFile(addedFile, "utf8")).resolves.toBe("creator-added file");

    const linkedTarget = path.join(fixture.destinationDirectory, "linked-target");
    const linkedDestination = path.join(fixture.destinationDirectory, "linked-player");
    await mkdir(linkedTarget);
    const sentinelPath = path.join(linkedTarget, "sentinel.txt");
    await writeFile(sentinelPath, "do not replace", "utf8");
    await symlink(linkedTarget, linkedDestination, process.platform === "win32" ? "junction" : "dir");
    await expect(
      createWindowsRuntimeFolder({
        buildDirectory: fixture.buildDirectory,
        destinationDirectory: linkedDestination,
        mode: "preview",
        project: fixture.project,
        resources: fixture.resources
      })
    ).rejects.toThrow(/not a normal folder/i);
    await expect(readFile(sentinelPath, "utf8")).resolves.toBe("do not replace");
  });
});

describe("runtime artifact names", () => {
  it("creates safe, recognizable suggested names", () => {
    expect(sanitizeRuntimeArtifactName('  My <Game>: Finale.  ')).toBe("My -Game-- Finale");
    expect(suggestedRuntimeArtifactName("My Game", "windows")).toBe("My Game Player");
    expect(suggestedRuntimeArtifactName("My Game", "web")).toBe("My Game Web");
    expect(suggestedRuntimeArtifactName("My Game", "windows", "preview")).toBe("My Game Preview");
    expect(suggestedRuntimeArtifactName("My Game", "web", "preview")).toBe("My Game Preview Web");
    expect(suggestedWindowsRuntimeExecutableName("My Game")).toBe("My Game Player.exe");
    expect(suggestedWindowsRuntimeExecutableName("My Game", "preview")).toBe("My Game Preview.exe");
  });
});

async function createPackagingFixture() {
  const rootDirectory = await createTempDirectory("mage2-windows-folder-test-");
  const runtimeTemplateDirectory = path.join(rootDirectory, "template");
  const buildDirectory = path.join(rootDirectory, "build");
  const destinationDirectory = path.join(rootDirectory, "destination");

  await mkdir(path.join(runtimeTemplateDirectory, "runtime", "resources"), { recursive: true });
  await writeFile(path.join(runtimeTemplateDirectory, "MAGE2 Player.exe"), "template executable", "utf8");
  await writeFile(path.join(runtimeTemplateDirectory, "runtime", "MAGE2 Player.exe"), "electron runtime", "utf8");
  await writeFile(path.join(runtimeTemplateDirectory, "runtime", "resources", "app.mage2asar"), "runtime app", "utf8");
  await mkdir(path.join(buildDirectory, "content"), { recursive: true });
  await mkdir(path.join(buildDirectory, "media"), { recursive: true });
  await mkdir(destinationDirectory);

  await writeFile(path.join(buildDirectory, "media", "icon.en.png"), "creator icon", "utf8");
  await writeFile(
    path.join(buildDirectory, "build-manifest.json"),
    JSON.stringify({
      projectId: "project_windows_folder_test",
      projectName: "Safe Game",
      contentPath: "content/project-content.json",
      assetMap: { asset_icon: { en: "media/icon.en.png" } }
    }),
    "utf8"
  );
  await writeFile(
    path.join(buildDirectory, "content", "project-content.json"),
    JSON.stringify({
      manifest: {
        defaultLanguage: "en",
        playerPresentation: { appIconAssetId: "asset_icon" }
      }
    }),
    "utf8"
  );

  const project = createDefaultProjectBundle("Safe Game");
  project.manifest.projectId = "project_windows_folder_test";
  project.manifest.gameVersion = "1.2.3-beta";

  return {
    buildDirectory,
    destinationDirectory,
    project,
    resources: {
      runtimeTemplateDirectory
    }
  };
}

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

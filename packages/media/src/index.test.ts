import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importAssetToProject } from "./index";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directoryPath) => rm(directoryPath, { recursive: true, force: true })));
});

describe("importAssetToProject", () => {
  it("copies imported files into the project's assets folder and preserves the original source path", async () => {
    const workspaceDir = await createTempWorkspace();
    const sourceDir = path.join(workspaceDir, "source");
    const projectDir = path.join(workspaceDir, "project");
    const sourcePath = path.join(sourceDir, "captions.vtt");
    const sourceContent = "WEBVTT\n\n00:00.000 --> 00:01.000\nHello there\n";

    await mkdir(sourceDir, { recursive: true });
    await writeFile(sourcePath, sourceContent, "utf8");

    const asset = await importAssetToProject(sourcePath, projectDir);

    expect(asset.kind).toBe("subtitle");
    expect(asset.name).toBe("captions.vtt");
    expect(asset.sourcePath).toBe(path.join(projectDir, "assets", "captions.vtt"));
    expect(asset.importSourcePath).toBe(sourcePath);
    expect(await readFile(asset.sourcePath, "utf8")).toBe(sourceContent);
  });

  it("chooses a unique filename when different imports share the same basename", async () => {
    const workspaceDir = await createTempWorkspace();
    const firstSourceDir = path.join(workspaceDir, "source-a");
    const secondSourceDir = path.join(workspaceDir, "source-b");
    const projectDir = path.join(workspaceDir, "project");
    const firstSourcePath = path.join(firstSourceDir, "shared.vtt");
    const secondSourcePath = path.join(secondSourceDir, "shared.vtt");

    await mkdir(firstSourceDir, { recursive: true });
    await mkdir(secondSourceDir, { recursive: true });
    await writeFile(firstSourcePath, "WEBVTT\n\n00:00.000 --> 00:01.000\nFirst\n", "utf8");
    await writeFile(secondSourcePath, "WEBVTT\n\n00:00.000 --> 00:01.000\nSecond\n", "utf8");

    const firstAsset = await importAssetToProject(firstSourcePath, projectDir);
    const secondAsset = await importAssetToProject(secondSourcePath, projectDir);

    expect(firstAsset.sourcePath).toBe(path.join(projectDir, "assets", "shared.vtt"));
    expect(secondAsset.sourcePath).toBe(path.join(projectDir, "assets", "shared-2.vtt"));
    expect(secondAsset.name).toBe("shared-2.vtt");
    expect(await readFile(firstAsset.sourcePath, "utf8")).toContain("First");
    expect(await readFile(secondAsset.sourcePath, "utf8")).toContain("Second");
  });
});

async function createTempWorkspace(): Promise<string> {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "mage2-media-"));
  tempDirectories.push(workspaceDir);
  return workspaceDir;
}

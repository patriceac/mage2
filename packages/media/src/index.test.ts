import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteGeneratedProxyFiles,
  deleteManagedAssetFiles,
  hydrateAssetSha256s,
  importAssetsToProject,
  importAssetToProject
} from "./index";

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

describe("importAssetsToProject", () => {
  it("skips new files whose SHA-256 already exists in the project", async () => {
    const workspaceDir = await createTempWorkspace();
    const sourceDir = path.join(workspaceDir, "source");
    const projectDir = path.join(workspaceDir, "project");
    const firstSourcePath = path.join(sourceDir, "first.vtt");
    const duplicateSourcePath = path.join(sourceDir, "same-content.vtt");
    const sourceContent = "WEBVTT\n\n00:00.000 --> 00:01.000\nSame bytes\n";

    await mkdir(sourceDir, { recursive: true });
    await writeFile(firstSourcePath, sourceContent, "utf8");
    await writeFile(duplicateSourcePath, sourceContent, "utf8");

    const existingAsset = await importAssetToProject(firstSourcePath, projectDir);
    const result = await importAssetsToProject([duplicateSourcePath], projectDir, [existingAsset]);

    expect(result.importedAssets).toEqual([]);
    expect(result.duplicateFilePaths).toEqual([duplicateSourcePath]);
  });
});

describe("hydrateAssetSha256s", () => {
  it("fills in missing asset hashes from the on-disk source file", async () => {
    const workspaceDir = await createTempWorkspace();
    const assetPath = path.join(workspaceDir, "legacy.vtt");
    await writeFile(assetPath, "WEBVTT\n\n00:00.000 --> 00:01.000\nLegacy\n", "utf8");

    const { assets, updated } = await hydrateAssetSha256s([
      {
        id: "asset_legacy",
        kind: "subtitle",
        name: "legacy.vtt",
        sourcePath: assetPath,
        importedAt: "2026-03-15T00:00:00.000Z"
      }
    ]);

    expect(updated).toBe(true);
    expect(assets[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("deleteGeneratedProxyFiles", () => {
  it("removes generated proxy and poster files from the project's proxy cache", async () => {
    const workspaceDir = await createTempWorkspace();
    const projectDir = path.join(workspaceDir, "project");
    const proxyDir = path.join(projectDir, ".mage2", "proxies");
    const proxyPath = path.join(proxyDir, "asset_video.mp4");
    const posterPath = path.join(proxyDir, "asset_video.jpg");

    await mkdir(proxyDir, { recursive: true });
    await writeFile(proxyPath, "proxy", "utf8");
    await writeFile(posterPath, "poster", "utf8");

    const deletedPaths = await deleteGeneratedProxyFiles(
      {
        id: "asset_video",
        kind: "video",
        name: "video.mp4",
        sourcePath: path.join(projectDir, "assets", "video.mp4"),
        proxyPath,
        posterPath,
        importedAt: "2026-03-14T00:00:00.000Z"
      },
      projectDir
    );

    expect(deletedPaths).toEqual([proxyPath, posterPath]);
    await expect(readFile(proxyPath, "utf8")).rejects.toThrow();
    await expect(readFile(posterPath, "utf8")).rejects.toThrow();
  });

  it("ignores proxy paths outside the project's generated proxy cache", async () => {
    const workspaceDir = await createTempWorkspace();
    const projectDir = path.join(workspaceDir, "project");
    const sourceDir = path.join(workspaceDir, "source");
    const outsideProxyPath = path.join(sourceDir, "outside.mp4");

    await mkdir(sourceDir, { recursive: true });
    await writeFile(outsideProxyPath, "outside", "utf8");

    const deletedPaths = await deleteGeneratedProxyFiles(
      {
        id: "asset_video",
        kind: "video",
        name: "video.mp4",
        sourcePath: path.join(projectDir, "assets", "video.mp4"),
        proxyPath: outsideProxyPath,
        importedAt: "2026-03-14T00:00:00.000Z"
      },
      projectDir
    );

    expect(deletedPaths).toEqual([]);
    expect(await readFile(outsideProxyPath, "utf8")).toBe("outside");
  });
});

describe("deleteManagedAssetFiles", () => {
  it("removes generated proxy files and the copied project asset file", async () => {
    const workspaceDir = await createTempWorkspace();
    const projectDir = path.join(workspaceDir, "project");
    const assetsDir = path.join(projectDir, "assets");
    const proxyDir = path.join(projectDir, ".mage2", "proxies");
    const sourcePath = path.join(assetsDir, "video.mp4");
    const proxyPath = path.join(proxyDir, "asset_video.mp4");
    const posterPath = path.join(proxyDir, "asset_video.jpg");

    await mkdir(assetsDir, { recursive: true });
    await mkdir(proxyDir, { recursive: true });
    await writeFile(sourcePath, "source", "utf8");
    await writeFile(proxyPath, "proxy", "utf8");
    await writeFile(posterPath, "poster", "utf8");

    const result = await deleteManagedAssetFiles(
      {
        id: "asset_video",
        kind: "video",
        name: "video.mp4",
        sourcePath,
        proxyPath,
        posterPath,
        importedAt: "2026-03-14T00:00:00.000Z"
      },
      projectDir
    );

    expect(result.deletedSourcePaths).toEqual([sourcePath]);
    expect(result.deletedProxyPaths).toEqual([proxyPath, posterPath]);
    await expect(readFile(sourcePath, "utf8")).rejects.toThrow();
    await expect(readFile(proxyPath, "utf8")).rejects.toThrow();
    await expect(readFile(posterPath, "utf8")).rejects.toThrow();
  });

  it("keeps files that are still referenced by another asset", async () => {
    const workspaceDir = await createTempWorkspace();
    const projectDir = path.join(workspaceDir, "project");
    const assetsDir = path.join(projectDir, "assets");
    const sourcePath = path.join(assetsDir, "shared.png");

    await mkdir(assetsDir, { recursive: true });
    await writeFile(sourcePath, "shared", "utf8");

    const result = await deleteManagedAssetFiles(
      {
        id: "asset_primary",
        kind: "image",
        name: "shared.png",
        sourcePath,
        importedAt: "2026-03-14T00:00:00.000Z"
      },
      projectDir,
      [
        {
          id: "asset_secondary",
          kind: "image",
          name: "shared.png",
          sourcePath,
          importedAt: "2026-03-14T00:00:00.000Z"
        }
      ]
    );

    expect(result.deletedSourcePaths).toEqual([]);
    expect(result.deletedProxyPaths).toEqual([]);
    expect(await readFile(sourcePath, "utf8")).toBe("shared");
  });

  it("leaves external source files untouched", async () => {
    const workspaceDir = await createTempWorkspace();
    const projectDir = path.join(workspaceDir, "project");
    const sourceDir = path.join(workspaceDir, "source");
    const sourcePath = path.join(sourceDir, "outside.png");

    await mkdir(sourceDir, { recursive: true });
    await writeFile(sourcePath, "outside", "utf8");

    const result = await deleteManagedAssetFiles(
      {
        id: "asset_external",
        kind: "image",
        name: "outside.png",
        sourcePath,
        importedAt: "2026-03-14T00:00:00.000Z"
      },
      projectDir
    );

    expect(result.deletedSourcePaths).toEqual([]);
    expect(result.deletedProxyPaths).toEqual([]);
    expect(await readFile(sourcePath, "utf8")).toBe("outside");
  });
});

async function createTempWorkspace(): Promise<string> {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "mage2-media-"));
  tempDirectories.push(workspaceDir);
  return workspaceDir;
}

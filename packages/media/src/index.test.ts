import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyAssetVariantForBuild,
  deleteGeneratedProxyFiles,
  deleteManagedAssetFiles,
  getFfmpegPath,
  hydrateAssetSha256s,
  importAssetsToProject,
  importAssetVariantToProject,
  importAssetToProject,
  resolvePackagedExecutablePath
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
    const sourcePath = path.join(sourceDir, "poster.png");
    const sourceContent = "fake png bytes";

    await mkdir(sourceDir, { recursive: true });
    await writeFile(sourcePath, sourceContent, "utf8");

    const asset = await importAssetToProject(sourcePath, projectDir, "en");
    const variant = asset.variants.en;

    expect(asset.kind).toBe("image");
    expect(asset.name).toBe("poster.png");
    expect(variant?.sourcePath).toBe(path.join(projectDir, "assets", "poster.png"));
    expect(variant?.importSourcePath).toBe(sourcePath);
    expect(variant?.proxyPath).toBe(path.join(projectDir, ".mage2", "proxies", `${asset.id}.en.png`));
    expect(variant?.posterPath).toBe(variant?.proxyPath);
    expect(await readFile(variant!.sourcePath, "utf8")).toBe(sourceContent);
    expect(await readFile(variant!.proxyPath!, "utf8")).toBe(sourceContent);
  });

  it("chooses a unique filename when different imports share the same basename", async () => {
    const workspaceDir = await createTempWorkspace();
    const firstSourceDir = path.join(workspaceDir, "source-a");
    const secondSourceDir = path.join(workspaceDir, "source-b");
    const projectDir = path.join(workspaceDir, "project");
    const firstSourcePath = path.join(firstSourceDir, "shared.png");
    const secondSourcePath = path.join(secondSourceDir, "shared.png");

    await mkdir(firstSourceDir, { recursive: true });
    await mkdir(secondSourceDir, { recursive: true });
    await writeFile(firstSourcePath, "first image bytes", "utf8");
    await writeFile(secondSourcePath, "second image bytes", "utf8");

    const firstAsset = await importAssetToProject(firstSourcePath, projectDir, "en");
    const secondAsset = await importAssetToProject(secondSourcePath, projectDir, "en");

    expect(firstAsset.variants.en?.sourcePath).toBe(path.join(projectDir, "assets", "shared.png"));
    expect(secondAsset.variants.en?.sourcePath).toBe(path.join(projectDir, "assets", "shared-2.png"));
    expect(secondAsset.name).toBe("shared-2.png");
    expect(await readFile(firstAsset.variants.en!.sourcePath, "utf8")).toContain("first");
    expect(await readFile(secondAsset.variants.en!.sourcePath, "utf8")).toContain("second");
  });

  it("imports audio files and generates browser-friendly mp3 proxies", async () => {
    const workspaceDir = await createTempWorkspace();
    const sourceDir = path.join(workspaceDir, "source");
    const projectDir = path.join(workspaceDir, "project");
    const sourcePath = path.join(sourceDir, "ambience.wav");

    await mkdir(sourceDir, { recursive: true });
    await createAudioFile(sourcePath);

    const asset = await importAssetToProject(sourcePath, projectDir, "en");
    const variant = asset.variants.en;

    expect(asset.kind).toBe("audio");
    expect(asset.name).toBe("ambience.wav");
    expect(variant?.sourcePath).toBe(path.join(projectDir, "assets", "ambience.wav"));
    expect(variant?.importSourcePath).toBe(sourcePath);
    expect(variant?.proxyPath).toBe(path.join(projectDir, ".mage2", "proxies", `${asset.id}.en.mp3`));
    expect(variant?.posterPath).toBeUndefined();
    expect(variant?.durationMs).toBeGreaterThan(0);
    expect(await readFile(variant!.proxyPath!)).not.toHaveLength(0);
  });

  it("rejects unsupported text imports and cleans up the copied file", async () => {
    const workspaceDir = await createTempWorkspace();
    const sourceDir = path.join(workspaceDir, "source");
    const projectDir = path.join(workspaceDir, "project");
    const sourcePath = path.join(sourceDir, "notes.txt");

    await mkdir(sourceDir, { recursive: true });
    await writeFile(sourcePath, "notes", "utf8");

    await expect(importAssetToProject(sourcePath, projectDir, "en")).rejects.toThrow(
      "Unsupported asset file type for 'notes.txt'."
    );
    await expect(readFile(path.join(projectDir, "assets", "notes.txt"), "utf8")).rejects.toThrow();
  });

  it("renders SVG previews into PNG proxies for scene-sized art", async () => {
    const workspaceDir = await createTempWorkspace();
    const sourceDir = path.join(workspaceDir, "source");
    const projectDir = path.join(workspaceDir, "project");
    const sourcePath = path.join(sourceDir, "scene.svg");

    await mkdir(sourceDir, { recursive: true });
    await writeFile(sourcePath, createSvgMarkup(1280, 720), "utf8");

    const asset = await importAssetToProject(sourcePath, projectDir, "en");
    const variant = asset.variants.en;
    const proxyBuffer = await readFile(variant!.proxyPath!);

    expect(asset.kind).toBe("image");
    expect(variant?.sourcePath).toBe(path.join(projectDir, "assets", "scene.svg"));
    expect(variant?.proxyPath).toBe(path.join(projectDir, ".mage2", "proxies", `${asset.id}.en.png`));
    expect(variant?.posterPath).toBe(variant?.proxyPath);
    expect(variant?.width).toBe(1280);
    expect(variant?.height).toBe(720);
    expect(proxyBuffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(readPngDimensions(proxyBuffer)).toEqual({ width: 1280, height: 720 });
  });

  it("fits non-scene SVG previews inside the shared preview bounds without distortion", async () => {
    const workspaceDir = await createTempWorkspace();
    const sourceDir = path.join(workspaceDir, "source");
    const projectDir = path.join(workspaceDir, "project");
    const sourcePath = path.join(sourceDir, "inventory.svg");

    await mkdir(sourceDir, { recursive: true });
    await writeFile(sourcePath, createSvgMarkup(256, 256), "utf8");

    const asset = await importAssetToProject(sourcePath, projectDir, "en");
    const variant = asset.variants.en;
    const proxyBuffer = await readFile(variant!.proxyPath!);

    expect(variant?.width).toBe(256);
    expect(variant?.height).toBe(256);
    expect(readPngDimensions(proxyBuffer)).toEqual({ width: 720, height: 720 });
  });
});

describe("importAssetsToProject", () => {
  it("skips new files whose SHA-256 already exists in the project", async () => {
    const workspaceDir = await createTempWorkspace();
    const sourceDir = path.join(workspaceDir, "source");
    const projectDir = path.join(workspaceDir, "project");
    const firstSourcePath = path.join(sourceDir, "first.png");
    const duplicateSourcePath = path.join(sourceDir, "same-content.png");
    const sourceContent = "same image bytes";

    await mkdir(sourceDir, { recursive: true });
    await writeFile(firstSourcePath, sourceContent, "utf8");
    await writeFile(duplicateSourcePath, sourceContent, "utf8");

    const existingAsset = await importAssetToProject(firstSourcePath, projectDir, "en");
    const result = await importAssetsToProject([duplicateSourcePath], projectDir, "en", [existingAsset]);

    expect(result.importedAssets).toEqual([]);
    expect(result.duplicateFilePaths).toEqual([duplicateSourcePath]);
  });

  it("detects duplicate scene-audio imports by content hash", async () => {
    const workspaceDir = await createTempWorkspace();
    const sourceDir = path.join(workspaceDir, "source");
    const projectDir = path.join(workspaceDir, "project");
    const firstSourcePath = path.join(sourceDir, "ambience-a.wav");
    const duplicateSourcePath = path.join(sourceDir, "ambience-b.wav");

    await mkdir(sourceDir, { recursive: true });
    await createAudioFile(firstSourcePath);
    await writeFile(duplicateSourcePath, await readFile(firstSourcePath));

    const existingAsset = await importAssetToProject(firstSourcePath, projectDir, "en", { category: "sceneAudio" });
    const result = await importAssetsToProject([duplicateSourcePath], projectDir, "en", [existingAsset], {
      category: "sceneAudio"
    });

    expect(existingAsset.category).toBe("sceneAudio");
    expect(result.importedAssets).toEqual([]);
    expect(result.duplicateFilePaths).toEqual([duplicateSourcePath]);
  });

  it("generates proxy files immediately for newly imported assets", async () => {
    const workspaceDir = await createTempWorkspace();
    const sourceDir = path.join(workspaceDir, "source");
    const projectDir = path.join(workspaceDir, "project");
    const sourcePath = path.join(sourceDir, "card.png");

    await mkdir(sourceDir, { recursive: true });
    await writeFile(sourcePath, "card art", "utf8");

    const result = await importAssetsToProject([sourcePath], projectDir, "en");
    const importedAsset = result.importedAssets[0];
    const variant = importedAsset?.variants.en;

    expect(result.duplicateFilePaths).toEqual([]);
    expect(importedAsset).toBeDefined();
    expect(variant?.proxyPath).toBe(path.join(projectDir, ".mage2", "proxies", `${importedAsset!.id}.en.png`));
    expect(await readFile(variant!.proxyPath!, "utf8")).toBe("card art");
  });
});

describe("importAssetVariantToProject", () => {
  it("creates a proxy for a newly added locale variant", async () => {
    const workspaceDir = await createTempWorkspace();
    const sourceDir = path.join(workspaceDir, "source");
    const projectDir = path.join(workspaceDir, "project");
    const enSourcePath = path.join(sourceDir, "poster-en.png");
    const frSourcePath = path.join(sourceDir, "poster-fr.png");

    await mkdir(sourceDir, { recursive: true });
    await writeFile(enSourcePath, "english art", "utf8");
    await writeFile(frSourcePath, "french art", "utf8");

    const asset = await importAssetToProject(enSourcePath, projectDir, "en");
    const updatedAsset = await importAssetVariantToProject(frSourcePath, projectDir, asset, "fr");
    const frVariant = updatedAsset.variants.fr;

    expect(frVariant?.sourcePath).toBe(path.join(projectDir, "assets", "poster-fr.png"));
    expect(frVariant?.proxyPath).toBe(path.join(projectDir, ".mage2", "proxies", `${asset.id}.fr.png`));
    expect(await readFile(frVariant!.proxyPath!, "utf8")).toBe("french art");
  });
});

describe("hydrateAssetSha256s", () => {
  it("fills in missing asset hashes from the on-disk source file", async () => {
    const workspaceDir = await createTempWorkspace();
    const assetPath = path.join(workspaceDir, "legacy.png");
    await writeFile(assetPath, "legacy image bytes", "utf8");

    const { assets, updated } = await hydrateAssetSha256s([
      {
        id: "asset_legacy",
        kind: "image",
        name: "legacy.png",
        variants: {
          en: {
            sourcePath: assetPath,
            importedAt: "2026-03-15T00:00:00.000Z"
          }
        }
      }
    ]);

    expect(updated).toBe(true);
    expect(assets[0]?.variants.en?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("resolvePackagedExecutablePath", () => {
  it("rewrites app.asar executable paths to the unpacked location when present", async () => {
    const workspaceDir = await createTempWorkspace();
    const unpackedBinaryPath = path.join(
      workspaceDir,
      "resources",
      "app.asar.unpacked",
      "node_modules",
      "@ffmpeg-installer",
      "win32-x64",
      "ffmpeg.exe"
    );
    await mkdir(path.dirname(unpackedBinaryPath), { recursive: true });
    await writeFile(unpackedBinaryPath, "binary", "utf8");

    const asarBinaryPath = path.join(
      workspaceDir,
      "resources",
      "app.asar",
      "node_modules",
      "@ffmpeg-installer",
      "win32-x64",
      "ffmpeg.exe"
    );

    expect(resolvePackagedExecutablePath(asarBinaryPath)).toBe(unpackedBinaryPath);
  });

  it("leaves executable paths unchanged when no unpacked copy exists", () => {
    const asarBinaryPath = path.join(
      "D:\\",
      "Apps",
      "MAGE2 Editor",
      "resources",
      "app.asar",
      "node_modules",
      "@ffmpeg-installer",
      "win32-x64",
      "ffmpeg.exe"
    );

    expect(resolvePackagedExecutablePath(asarBinaryPath)).toBe(asarBinaryPath);
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
        variants: {
          en: {
            sourcePath: path.join(projectDir, "assets", "video.mp4"),
            proxyPath,
            posterPath,
            importedAt: "2026-03-14T00:00:00.000Z"
          }
        }
      },
      projectDir,
      new Set(),
      "en"
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
        variants: {
          en: {
            sourcePath: path.join(projectDir, "assets", "video.mp4"),
            proxyPath: outsideProxyPath,
            importedAt: "2026-03-14T00:00:00.000Z"
          }
        }
      },
      projectDir,
      new Set(),
      "en"
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
        variants: {
          en: {
            sourcePath,
            proxyPath,
            posterPath,
            importedAt: "2026-03-14T00:00:00.000Z"
          }
        }
      },
      projectDir
    );

    expect(result.deletedSourcePaths).toEqual([sourcePath]);
    expect(result.deletedProxyPaths).toEqual([proxyPath, posterPath]);
    await expect(readFile(sourcePath, "utf8")).rejects.toThrow();
    await expect(readFile(proxyPath, "utf8")).rejects.toThrow();
    await expect(readFile(posterPath, "utf8")).rejects.toThrow();
  });

  it("removes generated audio proxies and the copied audio source file", async () => {
    const workspaceDir = await createTempWorkspace();
    const projectDir = path.join(workspaceDir, "project");
    const assetsDir = path.join(projectDir, "assets");
    const proxyDir = path.join(projectDir, ".mage2", "proxies");
    const sourcePath = path.join(assetsDir, "ambience.wav");
    const proxyPath = path.join(proxyDir, "asset_audio.en.mp3");

    await mkdir(assetsDir, { recursive: true });
    await mkdir(proxyDir, { recursive: true });
    await createAudioFile(sourcePath);
    await writeFile(proxyPath, "proxy", "utf8");

    const result = await deleteManagedAssetFiles(
      {
        id: "asset_audio",
        kind: "audio",
        name: "ambience.wav",
        variants: {
          en: {
            sourcePath,
            proxyPath,
            importedAt: "2026-03-14T00:00:00.000Z"
          }
        }
      },
      projectDir
    );

    expect(result.deletedSourcePaths).toEqual([sourcePath]);
    expect(result.deletedProxyPaths).toEqual([proxyPath]);
    await expect(readFile(sourcePath)).rejects.toThrow();
    await expect(readFile(proxyPath, "utf8")).rejects.toThrow();
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
        variants: {
          en: {
            sourcePath,
            importedAt: "2026-03-14T00:00:00.000Z"
          }
        }
      },
      projectDir,
      [
        {
          id: "asset_secondary",
          kind: "image",
          name: "shared.png",
          variants: {
            en: {
              sourcePath,
              importedAt: "2026-03-14T00:00:00.000Z"
            }
          }
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
        variants: {
          en: {
            sourcePath,
            importedAt: "2026-03-14T00:00:00.000Z"
          }
        }
      },
      projectDir
    );

    expect(result.deletedSourcePaths).toEqual([]);
    expect(result.deletedProxyPaths).toEqual([]);
    expect(await readFile(sourcePath, "utf8")).toBe("outside");
  });
});

describe("copyAssetVariantForBuild", () => {
  it("exports original image sources instead of preview proxies", async () => {
    const workspaceDir = await createTempWorkspace();
    const projectDir = path.join(workspaceDir, "project");
    const outputDir = path.join(workspaceDir, "build");
    const assetsDir = path.join(projectDir, "assets");
    const proxyDir = path.join(projectDir, ".mage2", "proxies");
    const sourcePath = path.join(assetsDir, "badge.svg");
    const proxyPath = path.join(proxyDir, "asset_badge.en.png");
    const sourceSvg = createSvgMarkup(320, 180);

    await mkdir(assetsDir, { recursive: true });
    await mkdir(proxyDir, { recursive: true });
    await writeFile(sourcePath, sourceSvg, "utf8");
    await writeFile(proxyPath, "preview proxy", "utf8");

    const outputPath = await copyAssetVariantForBuild(
      {
        id: "asset_badge",
        kind: "image",
        name: "badge.svg",
        variants: {
          en: {
            sourcePath,
            proxyPath,
            posterPath: proxyPath,
            importedAt: "2026-03-20T00:00:00.000Z"
          }
        }
      },
      "en",
      outputDir
    );

    expect(outputPath).toBe(path.join(outputDir, "asset_badge.en.svg"));
    expect(await readFile(outputPath, "utf8")).toBe(sourceSvg);
  });

  it("continues exporting video proxies when they exist", async () => {
    const workspaceDir = await createTempWorkspace();
    const projectDir = path.join(workspaceDir, "project");
    const outputDir = path.join(workspaceDir, "build");
    const assetsDir = path.join(projectDir, "assets");
    const proxyDir = path.join(projectDir, ".mage2", "proxies");
    const sourcePath = path.join(assetsDir, "clip.mov");
    const proxyPath = path.join(proxyDir, "asset_clip.en.mp4");

    await mkdir(assetsDir, { recursive: true });
    await mkdir(proxyDir, { recursive: true });
    await writeFile(sourcePath, "source video", "utf8");
    await writeFile(proxyPath, "proxy video", "utf8");

    const outputPath = await copyAssetVariantForBuild(
      {
        id: "asset_clip",
        kind: "video",
        name: "clip.mov",
        variants: {
          en: {
            sourcePath,
            proxyPath,
            importedAt: "2026-03-20T00:00:00.000Z"
          }
        }
      },
      "en",
      outputDir
    );

    expect(outputPath).toBe(path.join(outputDir, "asset_clip.en.mp4"));
    expect(await readFile(outputPath, "utf8")).toBe("proxy video");
  });

  it("exports audio proxies when they exist", async () => {
    const workspaceDir = await createTempWorkspace();
    const projectDir = path.join(workspaceDir, "project");
    const outputDir = path.join(workspaceDir, "build");
    const assetsDir = path.join(projectDir, "assets");
    const proxyDir = path.join(projectDir, ".mage2", "proxies");
    const sourcePath = path.join(assetsDir, "ambience.wav");
    const proxyPath = path.join(proxyDir, "asset_audio.en.mp3");

    await mkdir(assetsDir, { recursive: true });
    await mkdir(proxyDir, { recursive: true });
    await createAudioFile(sourcePath);
    await writeFile(proxyPath, "proxy audio", "utf8");

    const outputPath = await copyAssetVariantForBuild(
      {
        id: "asset_audio",
        kind: "audio",
        name: "ambience.wav",
        variants: {
          en: {
            sourcePath,
            proxyPath,
            importedAt: "2026-03-20T00:00:00.000Z"
          }
        }
      },
      "en",
      outputDir
    );

    expect(outputPath).toBe(path.join(outputDir, "asset_audio.en.mp3"));
    expect(await readFile(outputPath, "utf8")).toBe("proxy audio");
  });
});

async function createTempWorkspace(): Promise<string> {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "mage2-media-"));
  tempDirectories.push(workspaceDir);
  return workspaceDir;
}

async function createAudioFile(filePath: string, durationSeconds = 0.6): Promise<void> {
  await runCommand(getFfmpegPath(), [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=880:duration=${durationSeconds}`,
    filePath
  ]);
}

function createSvgMarkup(width: number, height: number): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#12202b"/>`,
    `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.max(12, Math.min(width, height) / 4)}" fill="#7dd3fc"/>`,
    "</svg>"
  ].join("");
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `${command} failed with code ${code}.`));
    });
  });
}

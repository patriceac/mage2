import { createReadStream, existsSync } from "node:fs";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import ffprobe from "@ffprobe-installer/ffprobe";
import type { Asset, AssetKind } from "@mage2/schema";

export interface ProbeResult {
  durationMs?: number;
  width?: number;
  height?: number;
  codec?: string;
}

export interface DeleteManagedAssetFilesResult {
  deletedProxyPaths: string[];
  deletedSourcePaths: string[];
}

export interface ImportAssetsToProjectResult {
  importedAssets: Asset[];
  duplicateFilePaths: string[];
}

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".svg"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"]);
const SUBTITLE_EXTENSIONS = new Set([".srt", ".vtt"]);

export function resolvePackagedExecutablePath(candidatePath: string): string {
  const unpackedPath = candidatePath.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");
  if (unpackedPath !== candidatePath && existsSync(unpackedPath)) {
    return unpackedPath;
  }

  return candidatePath;
}

export function getFfmpegPath(): string {
  return resolvePackagedExecutablePath(ffmpeg.path);
}

export function getFfprobePath(): string {
  return resolvePackagedExecutablePath(ffprobe.path);
}

export function detectAssetKind(filePath: string): AssetKind {
  const extension = path.extname(filePath).toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }

  if (SUBTITLE_EXTENSIONS.has(extension)) {
    return "subtitle";
  }

  return "image";
}

export async function probeAsset(filePath: string): Promise<ProbeResult> {
  const result = await runProcess(getFfprobePath(), [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    filePath
  ]);
  const parsed = JSON.parse(result.stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_name?: string; width?: number; height?: number; codec_type?: string }>;
  };
  const videoStream = parsed.streams?.find((stream) => stream.codec_type === "video");

  return {
    durationMs: parsed.format?.duration ? Math.round(Number(parsed.format.duration) * 1000) : undefined,
    width: videoStream?.width,
    height: videoStream?.height,
    codec: videoStream?.codec_name
  };
}

export async function createImportedAsset(filePath: string): Promise<Asset> {
  return createImportedAssetRecord(filePath, filePath);
}

export async function importAssetToProject(filePath: string, projectDir: string): Promise<Asset> {
  const projectAssetPath = await copyImportedAssetFile(filePath, projectDir);
  return createImportedAssetRecord(projectAssetPath, filePath);
}

export async function importAssetsToProject(
  filePaths: string[],
  projectDir: string,
  existingAssets: Asset[] = []
): Promise<ImportAssetsToProjectResult> {
  const existingHashes = new Set((await Promise.all(existingAssets.map(resolveAssetSha256))).filter(isDefined));
  const seenImportHashes = new Set<string>();
  const importedAssets: Asset[] = [];
  const duplicateFilePaths: string[] = [];

  for (const filePath of filePaths) {
    const sha256 = await computeFileSha256(filePath);
    if (existingHashes.has(sha256) || seenImportHashes.has(sha256)) {
      duplicateFilePaths.push(filePath);
      continue;
    }

    seenImportHashes.add(sha256);
    const projectAssetPath = await copyImportedAssetFile(filePath, projectDir);
    importedAssets.push(await createImportedAssetRecord(projectAssetPath, filePath, sha256));
  }

  return {
    importedAssets,
    duplicateFilePaths
  };
}

export async function hydrateAssetSha256s(
  assets: Asset[]
): Promise<{ assets: Asset[]; updated: boolean }> {
  let updated = false;

  const hydratedAssets = await Promise.all(
    assets.map(async (asset) => {
      if (asset.sha256) {
        return asset;
      }

      try {
        const sha256 = await computeFileSha256(asset.sourcePath);
        updated = true;
        return {
          ...asset,
          sha256
        };
      } catch {
        return asset;
      }
    })
  );

  return {
    assets: updated ? hydratedAssets : assets,
    updated
  };
}

export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

async function createImportedAssetRecord(
  filePath: string,
  importSourcePath: string,
  sha256?: string
): Promise<Asset> {
  const metadata = await stat(filePath);
  const kind = detectAssetKind(filePath);
  const probe = kind === "subtitle" ? {} : await probeAsset(filePath).catch(() => ({}));

  return {
    id: `asset_${crypto.randomUUID().replace(/-/g, "")}`,
    kind,
    name: path.basename(filePath),
    sourcePath: filePath,
    importSourcePath: filePath === importSourcePath ? undefined : importSourcePath,
    sha256: sha256 ?? (await computeFileSha256(filePath)),
    durationMs: probe.durationMs,
    width: probe.width,
    height: probe.height,
    codec: probe.codec,
    importedAt: metadata.birthtime.toISOString()
  };
}

async function copyImportedAssetFile(filePath: string, projectDir: string): Promise<string> {
  const assetDirectory = path.join(projectDir, "assets");
  await mkdir(assetDirectory, { recursive: true });

  const targetPath = await resolveImportedAssetPath(filePath, assetDirectory);
  if (path.resolve(filePath) === path.resolve(targetPath)) {
    return targetPath;
  }

  await cp(filePath, targetPath, {
    force: false,
    errorOnExist: true
  });
  return targetPath;
}

async function resolveImportedAssetPath(filePath: string, assetDirectory: string): Promise<string> {
  const parsedPath = path.parse(filePath);
  let suffix = 1;

  while (true) {
    const fileName = suffix === 1 ? parsedPath.base : `${parsedPath.name}-${suffix}${parsedPath.ext}`;
    const candidatePath = path.join(assetDirectory, fileName);

    if (path.resolve(filePath) === path.resolve(candidatePath)) {
      return candidatePath;
    }

    try {
      await stat(candidatePath);
      suffix += 1;
    } catch {
      return candidatePath;
    }
  }
}

export async function generateProxy(asset: Asset, projectDir: string): Promise<Asset> {
  const proxyDirectory = path.join(projectDir, ".mage2", "proxies");
  await mkdir(proxyDirectory, { recursive: true });

  if (asset.kind === "image" || asset.kind === "subtitle") {
    const extension = path.extname(asset.sourcePath);
    const proxyPath = path.join(proxyDirectory, `${asset.id}${extension}`);
    await cp(asset.sourcePath, proxyPath, { force: true });
    return {
      ...asset,
      proxyPath,
      posterPath: proxyPath
    };
  }

  if (asset.kind === "audio") {
    const proxyPath = path.join(proxyDirectory, `${asset.id}.mp3`);
    await runProcess(getFfmpegPath(), [
      "-y",
      "-i",
      asset.sourcePath,
      "-vn",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "160k",
      proxyPath
    ]);
    return {
      ...asset,
      proxyPath
    };
  }

  const proxyPath = path.join(proxyDirectory, `${asset.id}.mp4`);
  const posterPath = path.join(proxyDirectory, `${asset.id}.jpg`);
  await runProcess(getFfmpegPath(), [
    "-y",
    "-i",
    asset.sourcePath,
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "27",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    proxyPath
  ]);
  await runProcess(getFfmpegPath(), ["-y", "-i", asset.sourcePath, "-frames:v", "1", posterPath]);

  return {
    ...asset,
    proxyPath,
    posterPath
  };
}

export async function deleteGeneratedProxyFiles(
  asset: Asset,
  projectDir: string,
  referencedPaths: Set<string> = new Set()
): Promise<string[]> {
  const proxyDirectory = path.resolve(projectDir, ".mage2", "proxies");
  const candidatePaths = [
    ...new Set([asset.proxyPath, asset.posterPath].filter((candidatePath): candidatePath is string => Boolean(candidatePath)))
  ];
  const deletedPaths: string[] = [];

  for (const candidatePath of candidatePaths) {
    const resolvedPath = path.resolve(candidatePath);
    if (!isPathInsideDirectory(resolvedPath, proxyDirectory) || referencedPaths.has(resolvedPath)) {
      continue;
    }

    await rm(resolvedPath, { force: true });
    deletedPaths.push(resolvedPath);
  }

  return deletedPaths;
}

export async function deleteManagedAssetFiles(
  asset: Asset,
  projectDir: string,
  remainingAssets: Asset[] = []
): Promise<DeleteManagedAssetFilesResult> {
  const referencedPaths = collectReferencedPaths(remainingAssets);
  const deletedProxyPaths = await deleteGeneratedProxyFiles(asset, projectDir, referencedPaths);
  const deletedSourcePaths = await deleteProjectAssetSourceFiles(asset, projectDir, referencedPaths);

  return {
    deletedProxyPaths,
    deletedSourcePaths
  };
}

export async function copyAssetForBuild(asset: Asset, outputDirectory: string): Promise<string> {
  await mkdir(outputDirectory, { recursive: true });
  const sourcePath = asset.proxyPath ?? asset.sourcePath;
  const extension = path.extname(sourcePath) || guessExtensionForKind(asset.kind);
  const outputPath = path.join(outputDirectory, `${asset.id}${extension}`);
  await cp(sourcePath, outputPath, { force: true });
  return outputPath;
}

function guessExtensionForKind(kind: AssetKind): string {
  switch (kind) {
    case "audio":
      return ".mp3";
    case "video":
      return ".mp4";
    case "subtitle":
      return ".vtt";
    default:
      return ".png";
  }
}

async function deleteProjectAssetSourceFiles(
  asset: Asset,
  projectDir: string,
  referencedPaths: Set<string>
): Promise<string[]> {
  const assetsDirectory = path.resolve(projectDir, "assets");
  const resolvedSourcePath = path.resolve(asset.sourcePath);

  if (!isPathInsideDirectory(resolvedSourcePath, assetsDirectory) || referencedPaths.has(resolvedSourcePath)) {
    return [];
  }

  await rm(resolvedSourcePath, { force: true });
  return [resolvedSourcePath];
}

async function runProcess(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `Process '${command}' exited with code ${code}.`));
      }
    });
  });
}

function isPathInsideDirectory(targetPath: string, directoryPath: string): boolean {
  const relativePath = path.relative(directoryPath, targetPath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function collectReferencedPaths(assets: Asset[]): Set<string> {
  const referencedPaths = new Set<string>();

  for (const asset of assets) {
    referencedPaths.add(path.resolve(asset.sourcePath));
    if (asset.proxyPath) {
      referencedPaths.add(path.resolve(asset.proxyPath));
    }
    if (asset.posterPath) {
      referencedPaths.add(path.resolve(asset.posterPath));
    }
  }

  return referencedPaths;
}

async function resolveAssetSha256(asset: Asset): Promise<string | undefined> {
  if (asset.sha256) {
    return asset.sha256;
  }

  try {
    return await computeFileSha256(asset.sourcePath);
  } catch {
    return undefined;
  }
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

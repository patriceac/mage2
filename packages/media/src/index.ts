import { cp, mkdir, stat } from "node:fs/promises";
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

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".svg"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"]);
const SUBTITLE_EXTENSIONS = new Set([".srt", ".vtt"]);

export function getFfmpegPath(): string {
  return ffmpeg.path;
}

export function getFfprobePath(): string {
  return ffprobe.path;
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

async function createImportedAssetRecord(filePath: string, importSourcePath: string): Promise<Asset> {
  const metadata = await stat(filePath);
  const kind = detectAssetKind(filePath);
  const probe = kind === "subtitle" ? {} : await probeAsset(filePath).catch(() => ({}));

  return {
    id: `asset_${crypto.randomUUID().replace(/-/g, "")}`,
    kind,
    name: path.basename(filePath),
    sourcePath: filePath,
    importSourcePath: filePath === importSourcePath ? undefined : importSourcePath,
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

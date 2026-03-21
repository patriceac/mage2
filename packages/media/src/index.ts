import { createReadStream, existsSync } from "node:fs";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import ffprobe from "@ffprobe-installer/ffprobe";
import type { Asset, AssetCategory, AssetKind, AssetVariant } from "@mage2/schema";
import { collectAssetVariantPaths, resolveAssetCategory, resolveAssetVariant } from "@mage2/schema";
export * from "./subtitles";

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

export interface AssetImportOptions {
  category?: AssetCategory;
}

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".svg"]);

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

  throw new Error(`Unsupported asset file type for '${path.basename(filePath)}'.`);
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

export async function createImportedAsset(
  filePath: string,
  locale: string,
  options: AssetImportOptions = {}
): Promise<Asset> {
  return createImportedAssetRecord(filePath, filePath, locale, undefined, options);
}

export async function importAssetToProject(
  filePath: string,
  projectDir: string,
  locale: string,
  options: AssetImportOptions = {}
): Promise<Asset> {
  const projectAssetPath = await copyImportedAssetFile(filePath, projectDir);
  try {
    const asset = await createImportedAssetRecord(projectAssetPath, filePath, locale, undefined, options);
    return await generateProxy(asset, locale, projectDir);
  } catch (error) {
    await cleanupImportedAssetCopy(projectAssetPath, filePath);
    throw error;
  }
}

export async function importAssetsToProject(
  filePaths: string[],
  projectDir: string,
  locale: string,
  existingAssets: Asset[] = [],
  options: AssetImportOptions = {}
): Promise<ImportAssetsToProjectResult> {
  const existingCategoryAssets =
    options.category === undefined
      ? existingAssets
      : existingAssets.filter((asset) => resolveAssetCategory(asset) === options.category);
  const existingHashes = new Set(
    (await Promise.all(existingCategoryAssets.map((asset) => collectAssetVariantSha256s(asset)))).flat().filter(isDefined)
  );
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
    try {
      const asset = await createImportedAssetRecord(projectAssetPath, filePath, locale, sha256, options);
      importedAssets.push(await generateProxy(asset, locale, projectDir));
    } catch (error) {
      await cleanupImportedAssetCopy(projectAssetPath, filePath);
      throw error;
    }
  }

  return {
    importedAssets,
    duplicateFilePaths
  };
}

export async function importAssetVariantToProject(
  filePath: string,
  projectDir: string,
  asset: Asset,
  locale: string
): Promise<Asset> {
  const nextKind = detectAssetKind(filePath);
  if (nextKind !== asset.kind) {
    throw new Error(`Expected a ${asset.kind} file for '${asset.name}', but received ${nextKind}.`);
  }

  const projectAssetPath = await copyImportedAssetFile(filePath, projectDir);
  try {
    const variant = await createImportedAssetVariantRecord(projectAssetPath, filePath);
    return await generateProxy(
      {
        ...asset,
        variants: {
          ...asset.variants,
          [locale]: variant
        }
      },
      locale,
      projectDir
    );
  } catch (error) {
    await cleanupImportedAssetCopy(projectAssetPath, filePath);
    throw error;
  }
}

export async function hydrateAssetSha256s(
  assets: Asset[]
): Promise<{ assets: Asset[]; updated: boolean }> {
  let updated = false;

  const hydratedAssets = await Promise.all(
    assets.map(async (asset) => {
      let assetUpdated = false;
      const hydratedVariants = Object.fromEntries(
        await Promise.all(
          Object.entries(asset.variants).map(async ([locale, variant]) => {
            if (variant.sha256) {
              return [locale, variant] as const;
            }

            try {
              const sha256 = await computeFileSha256(variant.sourcePath);
              assetUpdated = true;
              return [
                locale,
                {
                  ...variant,
                  sha256
                }
              ] as const;
            } catch {
              return [locale, variant] as const;
            }
          })
        )
      );

      if (assetUpdated) {
        updated = true;
        return {
          ...asset,
          variants: hydratedVariants
        };
      }

      return asset;
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

export async function generateProxy(asset: Asset, locale: string, projectDir: string): Promise<Asset> {
  const variant = resolveAssetVariant(asset, locale);
  if (!variant) {
    throw new Error(`Asset '${asset.id}' has no '${locale}' variant.`);
  }

  const proxyDirectory = path.join(projectDir, ".mage2", "proxies");
  await mkdir(proxyDirectory, { recursive: true });

  if (asset.kind === "image") {
    const extension = path.extname(variant.sourcePath);
    const proxyPath = path.join(proxyDirectory, `${asset.id}.${locale}${extension}`);
    await cp(variant.sourcePath, proxyPath, { force: true });
    return updateAssetVariant(asset, locale, {
      ...variant,
      proxyPath,
      posterPath: proxyPath
    });
  }

  const proxyPath = path.join(proxyDirectory, `${asset.id}.${locale}.mp4`);
  const posterPath = path.join(proxyDirectory, `${asset.id}.${locale}.jpg`);
  await runProcess(getFfmpegPath(), [
    "-y",
    "-i",
    variant.sourcePath,
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
  await runProcess(getFfmpegPath(), ["-y", "-i", variant.sourcePath, "-frames:v", "1", posterPath]);

  return updateAssetVariant(asset, locale, {
    ...variant,
    proxyPath,
    posterPath
  });
}

export async function deleteGeneratedProxyFiles(
  asset: Asset,
  projectDir: string,
  referencedPaths: Set<string> = new Set(),
  locale?: string
): Promise<string[]> {
  const proxyDirectory = path.resolve(projectDir, ".mage2", "proxies");
  const variants = locale ? [resolveAssetVariant(asset, locale)].filter(isDefined) : Object.values(asset.variants);
  const candidatePaths = [
    ...new Set(
      variants.flatMap((variant) => [variant.proxyPath, variant.posterPath].filter((candidatePath): candidatePath is string => Boolean(candidatePath)))
    )
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

export async function deleteManagedAssetVariantFiles(
  asset: Asset,
  locale: string,
  projectDir: string,
  remainingAssets: Asset[] = []
): Promise<DeleteManagedAssetFilesResult> {
  const referencedPaths = collectReferencedPaths(remainingAssets);
  const deletedProxyPaths = await deleteGeneratedProxyFiles(asset, projectDir, referencedPaths, locale);
  const deletedSourcePaths = await deleteProjectAssetSourceFiles(asset, projectDir, referencedPaths, locale);

  return {
    deletedProxyPaths,
    deletedSourcePaths
  };
}

export async function copyAssetVariantForBuild(asset: Asset, locale: string, outputDirectory: string): Promise<string> {
  const variant = resolveAssetVariant(asset, locale);
  if (!variant) {
    throw new Error(`Asset '${asset.id}' has no '${locale}' variant to export.`);
  }

  await mkdir(outputDirectory, { recursive: true });
  const sourcePath = variant.proxyPath ?? variant.sourcePath;
  const extension = path.extname(sourcePath) || guessExtensionForKind(asset.kind);
  const outputPath = path.join(outputDirectory, `${asset.id}.${locale}${extension}`);
  await cp(sourcePath, outputPath, { force: true });
  return outputPath;
}

async function createImportedAssetRecord(
  filePath: string,
  importSourcePath: string,
  locale: string,
  sha256?: string,
  options: AssetImportOptions = {}
): Promise<Asset> {
  const kind = detectAssetKind(filePath);

  return {
    id: `asset_${crypto.randomUUID().replace(/-/g, "")}`,
    kind,
    name: path.basename(filePath),
    category: options.category,
    variants: {
      [locale]: await createImportedAssetVariantRecord(filePath, importSourcePath, sha256)
    }
  };
}

async function createImportedAssetVariantRecord(
  filePath: string,
  importSourcePath: string,
  sha256?: string
): Promise<AssetVariant> {
  const metadata = await stat(filePath);
  const probe: ProbeResult = await probeAsset(filePath).catch(() => ({}));

  return {
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

async function cleanupImportedAssetCopy(projectAssetPath: string, importSourcePath: string): Promise<void> {
  if (path.resolve(projectAssetPath) === path.resolve(importSourcePath)) {
    return;
  }

  await rm(projectAssetPath, { force: true }).catch(() => {});
}

function guessExtensionForKind(kind: AssetKind): string {
  return kind === "video" ? ".mp4" : ".png";
}

async function deleteProjectAssetSourceFiles(
  asset: Asset,
  projectDir: string,
  referencedPaths: Set<string>,
  locale?: string
): Promise<string[]> {
  const assetsDirectory = path.resolve(projectDir, "assets");
  const variants = locale ? [resolveAssetVariant(asset, locale)].filter(isDefined) : Object.values(asset.variants);
  const deletedSourcePaths: string[] = [];

  for (const variant of variants) {
    const resolvedSourcePath = path.resolve(variant.sourcePath);
    if (!isPathInsideDirectory(resolvedSourcePath, assetsDirectory) || referencedPaths.has(resolvedSourcePath)) {
      continue;
    }

    await rm(resolvedSourcePath, { force: true });
    deletedSourcePaths.push(resolvedSourcePath);
  }

  return deletedSourcePaths;
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
    for (const candidatePath of collectAssetVariantPaths(asset)) {
      referencedPaths.add(path.resolve(candidatePath));
    }
  }

  return referencedPaths;
}

async function collectAssetVariantSha256s(asset: Asset): Promise<Array<string | undefined>> {
  return Promise.all(Object.values(asset.variants).map((variant) => resolveAssetVariantSha256(variant)));
}

async function resolveAssetVariantSha256(variant: AssetVariant): Promise<string | undefined> {
  if (variant.sha256) {
    return variant.sha256;
  }

  try {
    return await computeFileSha256(variant.sourcePath);
  } catch {
    return undefined;
  }
}

function updateAssetVariant(asset: Asset, locale: string, variant: AssetVariant): Asset {
  return {
    ...asset,
    variants: {
      ...asset.variants,
      [locale]: variant
    }
  };
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

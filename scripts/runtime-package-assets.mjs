import { stat } from "node:fs/promises";
import path from "node:path";

const WINDOWS_PLAYER_ICON_EXTENSIONS = new Set([".png"]);

export async function resolveRuntimePackageIcon({
  runtimeBuildDirectory,
  buildManifest,
  projectContent
}) {
  const assetId = projectContent?.manifest?.playerPresentation?.appIconAssetId;
  if (!assetId) {
    return undefined;
  }

  const variants = buildManifest?.assetMap?.[assetId];
  if (!variants || typeof variants !== "object") {
    throw new Error(`Configured player icon '${assetId}' is missing from the runtime asset map.`);
  }

  const defaultLocale = projectContent.manifest.defaultLanguage;
  const relativePath = variants[defaultLocale] ?? Object.values(variants)[0];
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new Error(`Configured player icon '${assetId}' has no exported media variant.`);
  }

  const buildRoot = path.resolve(runtimeBuildDirectory);
  const sourcePath = path.resolve(buildRoot, ...relativePath.split("/"));
  if (sourcePath !== buildRoot && !sourcePath.startsWith(`${buildRoot}${path.sep}`)) {
    throw new Error(`Configured player icon '${assetId}' resolves outside the runtime build.`);
  }

  const extension = path.extname(sourcePath).toLowerCase();
  if (!WINDOWS_PLAYER_ICON_EXTENSIONS.has(extension)) {
    throw new Error(`Configured player icon '${assetId}' must be an exported PNG file.`);
  }

  const sourceStats = await stat(sourcePath);
  if (!sourceStats.isFile()) {
    throw new Error(`Configured player icon '${assetId}' is not a normal file.`);
  }

  return {
    assetId,
    sourcePath,
    resourceName: `creator-icon${extension}`
  };
}

export function resolveRuntimePackageVersion(gameVersion, isValidGameVersion) {
  const normalizedVersion = String(gameVersion ?? "").trim();
  if (!isValidGameVersion(normalizedVersion)) {
    throw new Error(`Runtime game version '${normalizedVersion || "(missing)"}' is not valid semantic versioning.`);
  }
  return normalizedVersion;
}

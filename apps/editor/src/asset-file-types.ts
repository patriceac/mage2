const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".avi", ".webm"] as const;
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".svg"] as const;
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".aac"] as const;
export const SUBTITLE_IMPORT_EXTENSIONS = [".srt", ".vtt"] as const;
export const BACKGROUND_IMPORT_EXTENSIONS = [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS] as const;
export const SCENE_AUDIO_IMPORT_EXTENSIONS = [...AUDIO_EXTENSIONS] as const;
export const INVENTORY_IMAGE_EXTENSIONS = [...IMAGE_EXTENSIONS] as const;

export const SUPPORTED_ASSET_EXTENSIONS = [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS] as const;

export const MEDIA_DIALOG_FILTER_EXTENSIONS = SUPPORTED_ASSET_EXTENSIONS.map((extension) => extension.slice(1));
export const SUBTITLE_DIALOG_FILTER_EXTENSIONS = SUBTITLE_IMPORT_EXTENSIONS.map((extension) => extension.slice(1));

const SUPPORTED_ASSET_EXTENSION_SET = new Set<string>(SUPPORTED_ASSET_EXTENSIONS);
const BACKGROUND_IMPORT_EXTENSION_SET = new Set<string>(BACKGROUND_IMPORT_EXTENSIONS);
const SCENE_AUDIO_IMPORT_EXTENSION_SET = new Set<string>(SCENE_AUDIO_IMPORT_EXTENSIONS);
const INVENTORY_IMAGE_IMPORT_EXTENSION_SET = new Set<string>(INVENTORY_IMAGE_EXTENSIONS);

export function isSupportedAssetPath(filePath: string): boolean {
  return SUPPORTED_ASSET_EXTENSION_SET.has(resolveFileExtension(filePath));
}

export function isBackgroundImportPath(filePath: string): boolean {
  return BACKGROUND_IMPORT_EXTENSION_SET.has(resolveFileExtension(filePath));
}

export function isSceneAudioImportPath(filePath: string): boolean {
  return SCENE_AUDIO_IMPORT_EXTENSION_SET.has(resolveFileExtension(filePath));
}

export function isInventoryImageImportPath(filePath: string): boolean {
  return INVENTORY_IMAGE_IMPORT_EXTENSION_SET.has(resolveFileExtension(filePath));
}

export function classifyImportAssetPaths(filePaths: string[]): {
  importFilePaths: string[];
  rejectedFilePaths: string[];
  duplicateFilePaths: string[];
} {
  const seenRejectedPaths = new Set<string>();
  const importFilePaths: string[] = [];
  const rejectedFilePaths: string[] = [];

  for (const filePath of filePaths) {
    const normalizedFilePath = filePath.trim();
    if (!normalizedFilePath) {
      continue;
    }

    if (isSupportedAssetPath(normalizedFilePath)) {
      importFilePaths.push(normalizedFilePath);
    } else {
      const comparableFilePath = normalizeAssetPathForComparison(normalizedFilePath);
      if (seenRejectedPaths.has(comparableFilePath)) {
        continue;
      }

      seenRejectedPaths.add(comparableFilePath);
      rejectedFilePaths.push(normalizedFilePath);
    }
  }

  return { importFilePaths, rejectedFilePaths, duplicateFilePaths: [] };
}

function resolveFileExtension(filePath: string): string {
  const fileName = filePath.replace(/^.*[\\/]/, "");
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex >= 0 ? fileName.slice(extensionIndex).toLowerCase() : "";
}

function normalizeAssetPathForComparison(filePath: string): string {
  const slashNormalizedPath = filePath.trim().replace(/\\/g, "/");
  return /^(?:[a-z]:\/|\/\/)/i.test(slashNormalizedPath) ? slashNormalizedPath.toLowerCase() : slashNormalizedPath;
}

import path from "node:path";
import type { ProjectBundle } from "@mage2/schema";

type PathApi = typeof path.posix;

function absolutePathApi(value: string): PathApi | undefined {
  if (/^[a-z]:[\\/]|^[\\/]{2}/i.test(value)) return path.win32;
  if (value.startsWith("/")) return path.posix;
  return undefined;
}

function relativeWithin(root: string, candidate: string, api: PathApi): string | undefined {
  const relative = api.relative(root, candidate);
  return relative === ".." || relative.startsWith(`..${api.sep}`) || api.isAbsolute(relative)
    ? undefined
    : relative;
}

function validateSegments(value: string): void {
  if (value.split(/[\\/]/).includes("..") || value.includes("\0")) {
    throw new Error(`Invalid project asset path: ${value}`);
  }
}

function validateRelativePath(value: string): void {
  // Reject drive-relative paths, rooted backslashes and Windows alternate data streams on every OS.
  if (/^[\\/]|:/.test(value)) {
    throw new Error(`Invalid relative project asset path: ${value}`);
  }
  validateSegments(value);
}

function mapManagedPaths(project: ProjectBundle, transform: (value: string) => string): ProjectBundle {
  // Work on a copy: renderer undo snapshots and the caller's absolute media paths must stay intact.
  const result = structuredClone(project);
  result.manifest.assetRoots = result.manifest.assetRoots.map(transform);
  for (const asset of result.assets.assets) {
    for (const variant of Object.values(asset.variants)) {
      variant.sourcePath = transform(variant.sourcePath);
      if (variant.proxyPath) variant.proxyPath = transform(variant.proxyPath);
      if (variant.posterPath) variant.posterPath = transform(variant.posterPath);
      // importSourcePath is external provenance, never a managed file or a relocation hint.
    }
  }
  return result;
}

/** Serialize only after the caller has checked the physical project boundary. */
export function projectPathsForStorage(project: ProjectBundle, projectDir: string): ProjectBundle {
  return mapManagedPaths(project, (value) => {
    validateSegments(value);
    const relative = path.isAbsolute(value) ? relativeWithin(projectDir, value, path) : undefined;
    if (relative === undefined) {
      throw new Error(`A project asset path is outside the opened project directory: ${value}`);
    }
    validateRelativePath(relative);
    return relative.split(path.sep).join("/") || ".";
  });
}

/** Resolve portable paths and conservatively recover the old root of pre-portability projects. */
export function resolveStoredProjectPaths(
  stored: ProjectBundle,
  projectDir: string
): { project: ProjectBundle; needsMigration: boolean } {
  const origins = new Map<string, { root: string; api: PathApi }>();
  const addOrigin = (root: string | undefined) => {
    if (!root) return;
    const api = absolutePathApi(root);
    if (!api || api.normalize(root) === api.parse(root).root) return;
    const normalized = api.normalize(root);
    origins.set(api === path.win32 ? normalized.toLowerCase() : normalized, { root, api });
  };
  for (const root of stored.manifest.assetRoots) {
    validateSegments(root);
    addOrigin(/^(.*)[\\/]assets[\\/]?$/i.exec(root)?.[1]);
  }
  for (const asset of stored.assets.assets) {
    for (const variant of Object.values(asset.variants)) {
      for (const generated of [variant.proxyPath, variant.posterPath]) {
        if (generated) {
          validateSegments(generated);
          addOrigin(/^(.*)[\\/]\.mage2[\\/]proxies[\\/][^\\/]+$/i.exec(generated)?.[1]);
        }
      }
    }
  }

  let needsMigration = false;
  const project = mapManagedPaths(stored, (value) => {
    validateSegments(value);
    const api = absolutePathApi(value);
    let relative: string;
    if (api) {
      needsMigration = true;
      // A project can be loaded through a directory alias; the physical check remains the caller's job.
      const nativeRelative = api === (process.platform === "win32" ? path.win32 : path.posix)
        ? relativeWithin(projectDir, value, api)
        : undefined;
      if (nativeRelative !== undefined) {
        relative = nativeRelative;
      } else {
        if (origins.size !== 1) {
          throw new Error("Cannot safely relocate this project's legacy asset paths: no single original project folder was found.");
        }
        const origin = [...origins.values()][0]!;
        const legacyRelative = origin.api === api ? relativeWithin(origin.root, value, api) : undefined;
        if (legacyRelative === undefined) {
          throw new Error(`A legacy asset path is outside the original project folder: ${value}`);
        }
        relative = legacyRelative;
      }
    } else {
      relative = value;
    }
    validateRelativePath(relative);
    return path.resolve(projectDir, ...relative.split(/[\\/]/));
  });
  return { project, needsMigration };
}

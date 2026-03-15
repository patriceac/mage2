import { existsSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

export interface FileBrowserLocation {
  label: string;
  path: string;
  kind: "favorite" | "drive" | "root";
}

export interface FileBrowserEntry {
  name: string;
  path: string;
  kind: "directory" | "file";
  extension?: string;
}

export interface FileBrowserDirectoryListing {
  path: string;
  parentPath?: string;
  entries: FileBrowserEntry[];
}

const FAVORITE_LOCATIONS = [
  { key: "home", label: "Home" },
  { key: "desktop", label: "Desktop" },
  { key: "documents", label: "Documents" },
  { key: "downloads", label: "Downloads" }
] as const;

export async function getFileBrowserLocations(): Promise<FileBrowserLocation[]> {
  const locations: FileBrowserLocation[] = [];
  const seenPaths = new Set<string>();

  const addLocation = (location: FileBrowserLocation) => {
    const comparablePath = normalizePathForComparison(location.path);
    if (seenPaths.has(comparablePath)) {
      return;
    }

    seenPaths.add(comparablePath);
    locations.push(location);
  };

  for (const favorite of FAVORITE_LOCATIONS) {
    try {
      const favoritePath = app.getPath(favorite.key);
      if (favoritePath && existsSync(favoritePath)) {
        addLocation({
          label: favorite.label,
          path: resolveDirectoryPath(favoritePath),
          kind: "favorite"
        });
      }
    } catch {
      // Ignore unavailable shell locations on the current platform.
    }
  }

  if (process.platform === "win32") {
    for (let code = 65; code <= 90; code += 1) {
      const driveRoot = `${String.fromCharCode(code)}:\\`;
      if (!existsSync(driveRoot)) {
        continue;
      }

      addLocation({
        label: `${driveRoot.slice(0, 2)} drive`,
        path: driveRoot,
        kind: "drive"
      });
    }
  } else {
    addLocation({
      label: "Root",
      path: "/",
      kind: "root"
    });
  }

  return locations;
}

export async function listDirectoryContents(inputPath: string): Promise<FileBrowserDirectoryListing> {
  const directoryPath = resolveDirectoryPath(inputPath);
  const directoryStats = await stat(directoryPath);
  if (!directoryStats.isDirectory()) {
    throw new Error(`"${directoryPath}" is not a directory.`);
  }

  const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
  const entries = (
    await Promise.all(
      directoryEntries.map(async (entry): Promise<FileBrowserEntry | undefined> => {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: entryPath,
            kind: "directory"
          };
        }

        if (entry.isFile()) {
          return {
            name: entry.name,
            path: entryPath,
            kind: "file",
            extension: resolveExtension(entry.name)
          };
        }

        if (!entry.isSymbolicLink()) {
          return undefined;
        }

        try {
          const targetStats = await stat(entryPath);
          if (targetStats.isDirectory()) {
            return {
              name: entry.name,
              path: entryPath,
              kind: "directory"
            };
          }

          if (targetStats.isFile()) {
            return {
              name: entry.name,
              path: entryPath,
              kind: "file",
              extension: resolveExtension(entry.name)
            };
          }
        } catch {
          return undefined;
        }

        return undefined;
      })
    )
  )
    .filter((entry): entry is FileBrowserEntry => Boolean(entry))
    .sort(compareEntries);

  const parentPath = resolveParentPath(directoryPath);
  return {
    path: directoryPath,
    parentPath,
    entries
  };
}

export async function createSubdirectory(parentDirectory: string, directoryName: string): Promise<string> {
  const parentPath = resolveDirectoryPath(parentDirectory);
  const targetDirectoryName = validateDirectoryName(directoryName);
  const nextDirectoryPath = path.join(parentPath, targetDirectoryName);

  await mkdir(nextDirectoryPath, { recursive: false });
  return nextDirectoryPath;
}

function resolveDirectoryPath(inputPath: string): string {
  const trimmedPath = inputPath.trim();
  if (!trimmedPath) {
    throw new Error("A directory path is required.");
  }

  if (process.platform === "win32" && /^[a-zA-Z]:$/.test(trimmedPath)) {
    return `${trimmedPath.toUpperCase()}\\`;
  }

  return path.resolve(trimmedPath);
}

function resolveParentPath(directoryPath: string): string | undefined {
  const parentPath = path.dirname(directoryPath);
  return normalizePathForComparison(parentPath) === normalizePathForComparison(directoryPath)
    ? undefined
    : parentPath;
}

function resolveExtension(fileName: string): string | undefined {
  const extension = path.extname(fileName).toLowerCase();
  return extension.length > 0 ? extension : undefined;
}

function compareEntries(left: FileBrowserEntry, right: FileBrowserEntry): number {
  if (left.kind !== right.kind) {
    return left.kind === "directory" ? -1 : 1;
  }

  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function validateDirectoryName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Folder name cannot be empty.");
  }

  if (trimmed === "." || trimmed === "..") {
    throw new Error("Folder name is not valid.");
  }

  if (/[\\/]/.test(trimmed)) {
    throw new Error("Folder names cannot contain path separators.");
  }

  return trimmed;
}

function normalizePathForComparison(inputPath: string): string {
  return process.platform === "win32" ? inputPath.toLowerCase() : inputPath;
}

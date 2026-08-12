export interface FilesystemObjectIdentity {
  dev: string;
  ino: string;
  birthtime: string;
}

export interface FilesystemIdentityStats {
  dev?: unknown;
  ino?: unknown;
  birthtimeNs?: unknown;
  birthtimeMs?: unknown;
}

/**
 * Reads the stable object fields used to detect directory replacement while an
 * export is in progress. Some Electron/Windows combinations expose birthtimeNs
 * inconsistently even when lstat was requested with bigint values, so always
 * compare creation time at millisecond precision.
 */
export function filesystemObjectIdentityFromStats(
  stats: FilesystemIdentityStats,
  label: string
): FilesystemObjectIdentity {
  const dev = requiredStatValue(stats.dev, `${label} device identifier`);
  const ino = requiredStatValue(stats.ino, `${label} file identifier`);
  const birthtimeMs = optionalStatValue(stats.birthtimeMs);
  if (birthtimeMs !== undefined) {
    return { dev, ino, birthtime: `ms:${birthtimeMs}` };
  }

  const birthtimeFromNs = nanosecondsToMilliseconds(stats.birthtimeNs);
  if (birthtimeFromNs !== undefined) {
    return { dev, ino, birthtime: `ms:${birthtimeFromNs}` };
  }

  throw new Error(
    `The filesystem does not expose a stable creation time for the ${label}; safe export cannot continue.`
  );
}

/**
 * Reports stable filesystem-object fields that changed. Node/Electron can
 * return a different directory ino across successive stats on virtualized
 * Windows NTFS volumes, so Windows identity relies on canonical real path at
 * the caller plus device and creation time. POSIX platforms retain ino checks.
 */
export function filesystemObjectIdentityChangedFields(
  left: FilesystemObjectIdentity,
  right: FilesystemObjectIdentity,
  platform: string = process.platform
): string[] {
  return [
    left.dev !== right.dev && "device",
    platform !== "win32" && left.ino !== right.ino && "file identifier",
    left.birthtime !== right.birthtime && "creation time"
  ].filter((field): field is string => Boolean(field));
}

function requiredStatValue(value: unknown, label: string): string {
  const normalized = optionalStatValue(value);
  if (normalized === undefined) {
    throw new Error(`The filesystem does not expose a stable ${label}; safe export cannot continue.`);
  }
  return normalized;
}

function optionalStatValue(value: unknown): string | undefined {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return undefined;
}

function nanosecondsToMilliseconds(value: unknown): string | undefined {
  if (typeof value === "bigint") {
    return (value / 1_000_000n).toString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value / 1_000_000).toString();
  }
  return undefined;
}

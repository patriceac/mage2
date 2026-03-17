export const PLAYHEAD_SYNC_TOLERANCE_MS = 60;

export function resolvePlayableDurationMs(durationSeconds: number, fallbackDurationMs?: number): number | undefined {
  if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
    return Math.round(durationSeconds * 1000);
  }

  return fallbackDurationMs;
}

export function clampPlayheadMs(playheadMs: number, durationMs?: number): number {
  const nextPlayheadMs = Number.isFinite(playheadMs) ? playheadMs : 0;
  const clampedPlayheadMs = Math.max(0, nextPlayheadMs);

  return durationMs !== undefined ? Math.min(clampedPlayheadMs, durationMs) : clampedPlayheadMs;
}

export function getVideoPlayheadMs(
  currentTimeSeconds: number,
  durationSeconds: number,
  fallbackDurationMs?: number
): number {
  return clampPlayheadMs(
    Math.round((Number.isFinite(currentTimeSeconds) ? currentTimeSeconds : 0) * 1000),
    resolvePlayableDurationMs(durationSeconds, fallbackDurationMs)
  );
}

export function shouldSyncPlayheadMs(
  currentPlayheadMs: number,
  nextPlayheadMs: number,
  toleranceMs = PLAYHEAD_SYNC_TOLERANCE_MS
): boolean {
  return Math.abs(currentPlayheadMs - nextPlayheadMs) > toleranceMs;
}

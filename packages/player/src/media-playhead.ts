export const PLAYHEAD_SYNC_TOLERANCE_MS = 16;

export interface SceneAudioSyncState {
  phase: "waiting" | "playing" | "ended";
  effectivePlayheadMs: number;
  cycleDurationMs?: number;
  targetAudioCurrentTimeMs: number;
  startDelayMs: number;
}

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

export function getAudioPlayheadMs(
  currentTimeSeconds: number,
  delayMs = 0,
  durationSeconds?: number,
  fallbackDurationMs?: number
): number {
  const normalizedDelayMs = Math.max(0, delayMs);
  const durationMs =
    durationSeconds !== undefined ? resolvePlayableDurationMs(durationSeconds, fallbackDurationMs) : fallbackDurationMs;

  return normalizedDelayMs + clampPlayheadMs(Math.round((Number.isFinite(currentTimeSeconds) ? currentTimeSeconds : 0) * 1000), durationMs);
}

export function getAudioCurrentTimeSeconds(playheadMs: number, delayMs = 0, durationMs?: number): number {
  const normalizedDelayMs = Math.max(0, delayMs);
  const nextAudioPlayheadMs = clampPlayheadMs(playheadMs - normalizedDelayMs, durationMs);
  return nextAudioPlayheadMs / 1000;
}

export function shouldSyncPlayheadMs(
  currentPlayheadMs: number,
  nextPlayheadMs: number,
  toleranceMs = PLAYHEAD_SYNC_TOLERANCE_MS
): boolean {
  return Math.abs(currentPlayheadMs - nextPlayheadMs) > toleranceMs;
}

export function resolveSceneAudioCycleDurationMs(
  sceneAudioDelayMs: number,
  sceneAudioDurationMs?: number
): number | undefined {
  if (sceneAudioDurationMs === undefined) {
    return undefined;
  }

  return Math.max(0, sceneAudioDelayMs) + Math.max(0, sceneAudioDurationMs);
}

export function getSceneAudioPlayheadMs(
  currentTimeSeconds: number,
  durationSeconds: number,
  sceneAudioDelayMs = 0,
  fallbackDurationMs?: number
): number {
  const delayMs = Math.max(0, sceneAudioDelayMs);
  const currentTimeMs = Math.round((Number.isFinite(currentTimeSeconds) ? currentTimeSeconds : 0) * 1000);
  const durationMs = resolvePlayableDurationMs(durationSeconds, fallbackDurationMs);
  const maxPlayheadMs = durationMs !== undefined ? delayMs + durationMs : undefined;

  return clampPlayheadMs(delayMs + currentTimeMs, maxPlayheadMs);
}

export function resolveSceneAudioSyncState(
  playheadMs: number,
  sceneAudioDelayMs = 0,
  sceneAudioDurationMs?: number,
  loop = false
): SceneAudioSyncState {
  const delayMs = Math.max(0, sceneAudioDelayMs);
  const durationMs = sceneAudioDurationMs !== undefined ? Math.max(0, sceneAudioDurationMs) : undefined;
  const cycleDurationMs = resolveSceneAudioCycleDurationMs(delayMs, durationMs);

  let effectivePlayheadMs = clampPlayheadMs(playheadMs);
  if (loop && cycleDurationMs !== undefined && cycleDurationMs > 0) {
    const wrappedPlayheadMs = effectivePlayheadMs % cycleDurationMs;
    effectivePlayheadMs =
      wrappedPlayheadMs === 0 && effectivePlayheadMs > 0 ? cycleDurationMs : wrappedPlayheadMs;
  }

  if (effectivePlayheadMs < delayMs) {
    return {
      phase: "waiting",
      effectivePlayheadMs,
      cycleDurationMs,
      targetAudioCurrentTimeMs: 0,
      startDelayMs: delayMs - effectivePlayheadMs
    };
  }

  if (durationMs === undefined) {
    return {
      phase: "playing",
      effectivePlayheadMs,
      cycleDurationMs,
      targetAudioCurrentTimeMs: effectivePlayheadMs - delayMs,
      startDelayMs: 0
    };
  }

  if (effectivePlayheadMs >= delayMs + durationMs) {
    return {
      phase: "ended",
      effectivePlayheadMs: delayMs + durationMs,
      cycleDurationMs,
      targetAudioCurrentTimeMs: durationMs,
      startDelayMs: 0
    };
  }

  return {
    phase: "playing",
    effectivePlayheadMs,
    cycleDurationMs,
    targetAudioCurrentTimeMs: effectivePlayheadMs - delayMs,
    startDelayMs: 0
  };
}

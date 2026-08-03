import { useEffect, useRef, useState, type RefObject } from "react";
import {
  PLAYHEAD_SYNC_TOLERANCE_MS,
  getSceneAudioPlayheadMs,
  resolvePlayableDurationMs,
  resolveSceneAudioPlaybackDirective,
  resolveSceneAudioSyncState,
  shouldSyncPlayheadMs
} from "@mage2/player";
import type { PlayerSourceResolver } from "./model";

export interface PlayerSceneAudioProps {
  sourcePath?: string;
  resolveSourcePath: PlayerSourceResolver;
  sceneKey: string;
  assetId?: string;
  enabled: boolean;
  playheadMs: number;
  delayMs: number;
  loop: boolean;
  durationMs?: number;
  paused?: boolean;
  playbackResetKey?: string | number;
  onPlayheadMsChange: (playheadMs: number) => void;
  controls?: boolean;
  className?: string;
  containerClassName?: string;
}

export interface PlayerSceneAudioPlaybackOptions {
  audioRef: RefObject<HTMLAudioElement | null>;
  sourceKey?: string;
  sceneKey: string;
  enabled: boolean;
  playheadMs: number;
  delayMs: number;
  loop: boolean;
  durationMs?: number;
  paused?: boolean;
  playbackResetKey?: string | number;
  onPlayheadMsChange: (playheadMs: number) => void;
}

export function PlayerSceneAudio({
  sourcePath,
  resolveSourcePath,
  sceneKey,
  assetId,
  enabled,
  playheadMs,
  delayMs,
  loop,
  durationMs,
  paused = false,
  playbackResetKey,
  onPlayheadMsChange,
  controls = false,
  className,
  containerClassName
}: PlayerSceneAudioProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sourceUrl = useResolvedSceneAudioSource(sourcePath, resolveSourcePath);

  usePlayerSceneAudioPlayback({
    audioRef,
    sourceKey: sourceUrl,
    sceneKey,
    enabled,
    playheadMs,
    delayMs,
    loop,
    durationMs,
    paused,
    playbackResetKey,
    onPlayheadMsChange
  });

  if (!sourceUrl) {
    return null;
  }

  const audio = (
    <audio
      ref={audioRef}
      src={sourceUrl}
      controls={controls}
      preload="metadata"
      className={["mage2-player__scene-audio", className].filter(Boolean).join(" ")}
      data-scene-audio-asset-id={assetId}
      data-scene-audio-scene-key={sceneKey}
      data-scene-audio-enabled={enabled ? "true" : "false"}
      data-scene-audio-loop={loop ? "true" : "false"}
      data-scene-audio-delay-ms={delayMs}
      data-scene-audio-duration-ms={durationMs}
    />
  );

  return containerClassName ? <div className={containerClassName}>{audio}</div> : audio;
}

export function usePlayerSceneAudioPlayback({
  audioRef,
  sourceKey,
  sceneKey,
  enabled,
  playheadMs,
  delayMs,
  loop,
  durationMs,
  paused = false,
  playbackResetKey,
  onPlayheadMsChange
}: PlayerSceneAudioPlaybackOptions): void {
  const timeoutRef = useRef<number | undefined>(undefined);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const audioDrivenPlayheadMsRef = useRef<number | undefined>(undefined);
  const syncToPlayheadRef = useRef<((nextPlayheadMs: number) => void) | undefined>(undefined);
  const playbackIntentRef = useRef(true);
  const internalPauseRef = useRef(false);
  const phaseRef = useRef<"idle" | "waiting" | "playing" | "ended">("idle");
  const latestPlayheadMsRef = useRef(playheadMs);
  const latestOnPlayheadMsChangeRef = useRef(onPlayheadMsChange);
  const previousPlaybackResetKeyRef = useRef(playbackResetKey);
  const active = Boolean(enabled && sourceKey);

  useEffect(() => {
    latestPlayheadMsRef.current = playheadMs;
    latestOnPlayheadMsChangeRef.current = onPlayheadMsChange;
  }, [onPlayheadMsChange, playheadMs]);

  useEffect(() => {
    if (previousPlaybackResetKeyRef.current === playbackResetKey) {
      return;
    }

    previousPlaybackResetKeyRef.current = playbackResetKey;
    playbackIntentRef.current = true;
    audioDrivenPlayheadMsRef.current = undefined;
  }, [playbackResetKey]);

  useEffect(() => {
    const audio = audioRef.current;
    syncToPlayheadRef.current = undefined;
    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    if (animationFrameRef.current !== undefined) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    if (!audio) {
      return;
    }
    internalPauseRef.current = false;

    const cancelAnimationFrameSync = () => {
      if (animationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    };

    const pauseSceneAudio = () => {
      if (audio.paused) {
        return;
      }

      internalPauseRef.current = true;
      audio.pause();
    };

    if (paused) {
      pauseSceneAudio();
      return;
    }

    const clearPlayback = () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      cancelAnimationFrameSync();
      pauseSceneAudio();
      audio.currentTime = 0;
    };

    const updatePlayheadFromSceneAudio = (nextPlayheadMs: number) => {
      audioDrivenPlayheadMsRef.current = nextPlayheadMs;
      if (!shouldSyncPlayheadMs(latestPlayheadMsRef.current, nextPlayheadMs)) {
        return;
      }

      latestPlayheadMsRef.current = nextPlayheadMs;
      latestOnPlayheadMsChangeRef.current(nextPlayheadMs);
    };

    const syncFromAudioClock = () => {
      updatePlayheadFromSceneAudio(
        getSceneAudioPlayheadMs(audio.currentTime, audio.duration, delayMs, durationMs)
      );
    };

    const startPlaybackClock = () => {
      cancelAnimationFrameSync();

      const step = () => {
        syncFromAudioClock();
        if (audio.paused || audio.ended) {
          animationFrameRef.current = undefined;
          return;
        }

        animationFrameRef.current = window.requestAnimationFrame(step);
      };

      step();
    };

    const startDelayClock = (startingPlayheadMs: number) => {
      cancelAnimationFrameSync();

      const resolvedDelayMs = Math.max(delayMs, 0);
      const anchorMs = performance.now() - startingPlayheadMs;

      const step = () => {
        const elapsedMs = performance.now() - anchorMs;
        const nextPlayheadMs = Math.min(Math.max(elapsedMs, startingPlayheadMs), resolvedDelayMs);
        updatePlayheadFromSceneAudio(nextPlayheadMs);
        if (nextPlayheadMs >= resolvedDelayMs - PLAYHEAD_SYNC_TOLERANCE_MS) {
          animationFrameRef.current = undefined;
          return;
        }

        animationFrameRef.current = window.requestAnimationFrame(step);
      };

      step();
    };

    const syncSceneAudioToPlayhead = (nextPlayheadMs: number) => {
      if (!active) {
        phaseRef.current = "idle";
        clearPlayback();
        return;
      }

      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      cancelAnimationFrameSync();

      const syncState = resolveSceneAudioSyncState(
        nextPlayheadMs,
        delayMs,
        resolvePlayableDurationMs(audio.duration, durationMs),
        loop
      );
      const playbackDirective = resolveSceneAudioPlaybackDirective(syncState, playbackIntentRef.current);
      phaseRef.current = syncState.phase;

      if (syncState.phase === "waiting") {
        pauseSceneAudio();
        if (Math.abs(audio.currentTime * 1000) > PLAYHEAD_SYNC_TOLERANCE_MS) {
          audio.currentTime = 0;
        }

        if (playbackDirective.shouldScheduleDelayedPlayback) {
          startDelayClock(syncState.effectivePlayheadMs);
          timeoutRef.current = window.setTimeout(() => {
            timeoutRef.current = undefined;
            updatePlayheadFromSceneAudio(Math.max(delayMs, 0));
            void audio
              .play()
              .then(() => {
                phaseRef.current = "playing";
                startPlaybackClock();
              })
              .catch(() => {
                // Autoplay can be blocked; a host control can still start playback.
              });
          }, syncState.startDelayMs);
          return;
        }
      }

      if (syncState.phase === "playing" || syncState.phase === "waiting") {
        if (Math.abs(audio.currentTime * 1000 - syncState.targetAudioCurrentTimeMs) > PLAYHEAD_SYNC_TOLERANCE_MS) {
          audio.currentTime = syncState.targetAudioCurrentTimeMs / 1000;
        }

        if (!playbackDirective.shouldPlay) {
          pauseSceneAudio();
          return;
        }

        if (audio.paused) {
          void audio
            .play()
            .then(() => {
              phaseRef.current = "playing";
              startPlaybackClock();
            })
            .catch(() => {
              // Autoplay can be blocked; a host control can still start playback.
            });
        } else {
          phaseRef.current = "playing";
          startPlaybackClock();
        }
        return;
      }

      pauseSceneAudio();
      if (Math.abs(audio.currentTime * 1000 - syncState.targetAudioCurrentTimeMs) > PLAYHEAD_SYNC_TOLERANCE_MS) {
        audio.currentTime = syncState.targetAudioCurrentTimeMs / 1000;
      }
      updatePlayheadFromSceneAudio(syncState.effectivePlayheadMs);
    };

    syncToPlayheadRef.current = syncSceneAudioToPlayhead;

    const handlePlay = () => {
      playbackIntentRef.current = true;
      internalPauseRef.current = false;
      phaseRef.current = "playing";
      startPlaybackClock();
    };

    const handlePause = () => {
      cancelAnimationFrameSync();
      if (internalPauseRef.current) {
        internalPauseRef.current = false;
        return;
      }

      playbackIntentRef.current = false;
      if (phaseRef.current === "playing") {
        syncFromAudioClock();
      }
    };

    const handleSeeked = () => {
      phaseRef.current = audio.paused ? "ended" : "playing";
      syncFromAudioClock();
    };

    const handleTimeUpdate = () => {
      syncFromAudioClock();
    };

    const handleLoadedMetadata = () => {
      syncSceneAudioToPlayhead(latestPlayheadMsRef.current);
    };

    const handleEnded = () => {
      cancelAnimationFrameSync();
      if (loop) {
        syncSceneAudioToPlayhead(0);
        return;
      }

      const playableDurationMs = resolvePlayableDurationMs(audio.duration, durationMs);
      phaseRef.current = "ended";
      if (playableDurationMs !== undefined) {
        updatePlayheadFromSceneAudio(Math.max(delayMs, 0) + playableDurationMs);
        return;
      }

      syncFromAudioClock();
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("seeked", handleSeeked);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    syncSceneAudioToPlayhead(latestPlayheadMsRef.current);

    return () => {
      syncToPlayheadRef.current = undefined;
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      clearPlayback();
    };
  }, [active, audioRef, delayMs, durationMs, loop, paused, sceneKey, sourceKey]);

  useEffect(() => {
    const syncToPlayhead = syncToPlayheadRef.current;
    if (!syncToPlayhead || !active) {
      return;
    }

    if (
      audioDrivenPlayheadMsRef.current !== undefined &&
      !shouldSyncPlayheadMs(audioDrivenPlayheadMsRef.current, playheadMs)
    ) {
      audioDrivenPlayheadMsRef.current = undefined;
      return;
    }

    syncToPlayhead(playheadMs);
  }, [active, playbackResetKey, playheadMs, sceneKey, sourceKey]);
}

function useResolvedSceneAudioSource(
  sourcePath: string | undefined,
  resolver: PlayerSourceResolver
): string | undefined {
  const [resolved, setResolved] = useState<{ sourcePath?: string; url?: string }>({});

  useEffect(() => {
    let cancelled = false;
    if (!sourcePath) {
      setResolved({});
      return;
    }

    void resolver(sourcePath)
      .then((url) => {
        if (!cancelled) {
          setResolved({ sourcePath, url });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolved({ sourcePath });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resolver, sourcePath]);

  return resolved.sourcePath === sourcePath ? resolved.url : undefined;
}

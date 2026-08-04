import { useEffect, useRef, useState } from "react";
import type { Asset, AssetVariant, ProjectBundle } from "@mage2/schema";
import { resolveFileUrl } from "../../file-url-cache";
import {
  PLAYHEAD_SYNC_TOLERANCE_MS,
  getSceneAudioPlayheadMs,
  resolvePlayableDurationMs,
  resolveSceneAudioPlaybackDirective,
  resolveSceneAudioSyncState,
  shouldSyncPlayheadMs
} from "../../media-playhead";

type ProjectScene = ProjectBundle["scenes"]["items"][number];

interface UseSceneMediaPlaybackOptions {
  backgroundAssetKind?: Asset["kind"];
  playheadMs: number;
  scene: ProjectScene;
  sceneAudioAsset?: Asset;
  sceneAudioVariant?: AssetVariant;
  setPlayheadMs: (playheadMs: number) => void;
}

export function useSceneMediaPlayback({
  backgroundAssetKind,
  playheadMs,
  scene,
  sceneAudioAsset,
  sceneAudioVariant,
  setPlayheadMs
}: UseSceneMediaPlaybackOptions) {
  const sceneAudioRef = useRef<HTMLAudioElement>(null);
  const sceneAudioTimeoutRef = useRef<number | undefined>(undefined);
  const sceneAudioAnimationFrameRef = useRef<number | undefined>(undefined);
  const latestPlayheadMsRef = useRef(0);
  const sceneAudioDrivenPlayheadMsRef = useRef<number | undefined>(undefined);
  const syncSceneAudioToPlayheadRef = useRef<((playheadMs: number) => void) | undefined>(undefined);
  const sceneAudioPlaybackIntentRef = useRef(true);
  const sceneAudioInternalPauseRef = useRef(false);
  const sceneAudioPhaseRef = useRef<"idle" | "waiting" | "playing" | "ended">("idle");
  const [sceneAudioUrl, setSceneAudioUrl] = useState<string>();

  useEffect(() => {
    latestPlayheadMsRef.current = playheadMs;
  }, [playheadMs]);

  useEffect(() => {
    setPlayheadMs(0);
  }, [scene.backgroundAssetId, scene.id, scene.sceneAudioAssetId, scene.sceneAudioDelayMs, setPlayheadMs]);

  useEffect(() => {
    let cancelled = false;

    async function loadSceneAudioUrl() {
      if (!sceneAudioAsset) {
        setSceneAudioUrl(undefined);
        return;
      }

      const sourcePath = sceneAudioVariant?.proxyPath ?? sceneAudioVariant?.sourcePath;
      if (!sourcePath) {
        setSceneAudioUrl(undefined);
        return;
      }

      try {
        const url = await resolveFileUrl(sourcePath);
        if (!cancelled) {
          setSceneAudioUrl(url);
        }
      } catch {
        if (!cancelled) {
          setSceneAudioUrl(undefined);
        }
      }
    }

    void loadSceneAudioUrl();
    return () => {
      cancelled = true;
    };
  }, [sceneAudioAsset?.id, sceneAudioVariant?.proxyPath, sceneAudioVariant?.sourcePath]);

  useEffect(() => {
    const audio = sceneAudioRef.current;
    syncSceneAudioToPlayheadRef.current = undefined;
    if (sceneAudioTimeoutRef.current !== undefined) {
      window.clearTimeout(sceneAudioTimeoutRef.current);
      sceneAudioTimeoutRef.current = undefined;
    }
    if (sceneAudioAnimationFrameRef.current !== undefined) {
      window.cancelAnimationFrame(sceneAudioAnimationFrameRef.current);
      sceneAudioAnimationFrameRef.current = undefined;
    }

    if (!audio) {
      return;
    }
    sceneAudioInternalPauseRef.current = false;

    const cancelAnimationFrameSync = () => {
      if (sceneAudioAnimationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(sceneAudioAnimationFrameRef.current);
        sceneAudioAnimationFrameRef.current = undefined;
      }
    };

    const pauseSceneAudio = () => {
      if (audio.paused) {
        return;
      }

      sceneAudioInternalPauseRef.current = true;
      audio.pause();
    };

    const clearPlayback = () => {
      if (sceneAudioTimeoutRef.current !== undefined) {
        window.clearTimeout(sceneAudioTimeoutRef.current);
        sceneAudioTimeoutRef.current = undefined;
      }
      cancelAnimationFrameSync();
      pauseSceneAudio();
      audio.currentTime = 0;
    };

    const updatePlayheadFromSceneAudio = (nextPlayheadMs: number) => {
      sceneAudioDrivenPlayheadMsRef.current = nextPlayheadMs;
      if (!shouldSyncPlayheadMs(latestPlayheadMsRef.current, nextPlayheadMs)) {
        return;
      }

      latestPlayheadMsRef.current = nextPlayheadMs;
      setPlayheadMs(nextPlayheadMs);
    };

    const syncFromAudioClock = () => {
      updatePlayheadFromSceneAudio(
        getSceneAudioPlayheadMs(
          audio.currentTime,
          audio.duration,
          scene.sceneAudioDelayMs,
          sceneAudioVariant?.durationMs
        )
      );
    };

    const startPlaybackClock = () => {
      cancelAnimationFrameSync();

      const step = () => {
        syncFromAudioClock();
        if (audio.paused || audio.ended) {
          sceneAudioAnimationFrameRef.current = undefined;
          return;
        }

        sceneAudioAnimationFrameRef.current = window.requestAnimationFrame(step);
      };

      step();
    };

    const startDelayClock = (startingPlayheadMs: number) => {
      cancelAnimationFrameSync();

      const delayMs = Math.max(scene.sceneAudioDelayMs, 0);
      const anchorMs = performance.now() - startingPlayheadMs;

      const step = () => {
        const elapsedMs = performance.now() - anchorMs;
        const nextPlayheadMs = Math.min(Math.max(elapsedMs, startingPlayheadMs), delayMs);
        updatePlayheadFromSceneAudio(nextPlayheadMs);
        if (nextPlayheadMs >= delayMs - PLAYHEAD_SYNC_TOLERANCE_MS) {
          sceneAudioAnimationFrameRef.current = undefined;
          return;
        }

        sceneAudioAnimationFrameRef.current = window.requestAnimationFrame(step);
      };

      step();
    };

    const syncSceneAudioToPlayhead = (nextPlayheadMs: number) => {
      if (!sceneAudioUrl || backgroundAssetKind !== "image" || !scene.sceneAudioAssetId) {
        sceneAudioPhaseRef.current = "idle";
        clearPlayback();
        return;
      }

      if (sceneAudioTimeoutRef.current !== undefined) {
        window.clearTimeout(sceneAudioTimeoutRef.current);
        sceneAudioTimeoutRef.current = undefined;
      }
      cancelAnimationFrameSync();

      const syncState = resolveSceneAudioSyncState(
        nextPlayheadMs,
        scene.sceneAudioDelayMs,
        resolvePlayableDurationMs(audio.duration, sceneAudioVariant?.durationMs),
        scene.sceneAudioLoop
      );
      const playbackDirective = resolveSceneAudioPlaybackDirective(syncState, sceneAudioPlaybackIntentRef.current);
      sceneAudioPhaseRef.current = syncState.phase;

      if (syncState.phase === "waiting") {
        pauseSceneAudio();
        if (Math.abs(audio.currentTime * 1000) > PLAYHEAD_SYNC_TOLERANCE_MS) {
          audio.currentTime = 0;
        }

        if (playbackDirective.shouldScheduleDelayedPlayback) {
          startDelayClock(syncState.effectivePlayheadMs);
          sceneAudioTimeoutRef.current = window.setTimeout(() => {
            sceneAudioTimeoutRef.current = undefined;
            updatePlayheadFromSceneAudio(Math.max(scene.sceneAudioDelayMs, 0));
            void audio
              .play()
              .then(() => {
                sceneAudioPhaseRef.current = "playing";
                startPlaybackClock();
              })
              .catch(() => {
                // Keep the editor responsive if autoplay is blocked.
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
              sceneAudioPhaseRef.current = "playing";
              startPlaybackClock();
            })
            .catch(() => {
              // Keep the editor responsive if autoplay is blocked.
            });
        } else {
          sceneAudioPhaseRef.current = "playing";
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

    syncSceneAudioToPlayheadRef.current = syncSceneAudioToPlayhead;

    const handlePlay = () => {
      sceneAudioPlaybackIntentRef.current = true;
      sceneAudioInternalPauseRef.current = false;
      sceneAudioPhaseRef.current = "playing";
      startPlaybackClock();
    };

    const handlePause = () => {
      cancelAnimationFrameSync();
      if (sceneAudioInternalPauseRef.current) {
        sceneAudioInternalPauseRef.current = false;
        return;
      }

      sceneAudioPlaybackIntentRef.current = false;
      if (sceneAudioPhaseRef.current === "playing") {
        syncFromAudioClock();
      }
    };

    const handleSeeked = () => {
      sceneAudioPhaseRef.current = audio.paused ? "ended" : "playing";
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
      if (scene.sceneAudioLoop) {
        syncSceneAudioToPlayhead(0);
        return;
      }

      const durationMs = resolvePlayableDurationMs(audio.duration, sceneAudioVariant?.durationMs);
      sceneAudioPhaseRef.current = "ended";
      if (durationMs !== undefined) {
        updatePlayheadFromSceneAudio(Math.max(scene.sceneAudioDelayMs, 0) + durationMs);
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
      syncSceneAudioToPlayheadRef.current = undefined;
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      clearPlayback();
    };
  }, [
    backgroundAssetKind,
    scene.id,
    scene.sceneAudioAssetId,
    scene.sceneAudioDelayMs,
    scene.sceneAudioLoop,
    sceneAudioUrl,
    sceneAudioVariant?.durationMs,
    setPlayheadMs
  ]);

  useEffect(() => {
    const syncSceneAudioToPlayhead = syncSceneAudioToPlayheadRef.current;
    if (!syncSceneAudioToPlayhead || !sceneAudioUrl || backgroundAssetKind !== "image" || !scene.sceneAudioAssetId) {
      return;
    }

    if (
      sceneAudioDrivenPlayheadMsRef.current !== undefined &&
      !shouldSyncPlayheadMs(sceneAudioDrivenPlayheadMsRef.current, playheadMs)
    ) {
      sceneAudioDrivenPlayheadMsRef.current = undefined;
      return;
    }

    syncSceneAudioToPlayhead(playheadMs);
  }, [backgroundAssetKind, playheadMs, scene.sceneAudioAssetId, sceneAudioUrl]);

  return {
    sceneAudioRef,
    sceneAudioUrl
  };
}

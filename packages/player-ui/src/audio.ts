import { useEffect, useRef, useState, type RefObject } from "react";

export const AUDIO_CHANNELS = ["music", "ambience", "effects", "voice"] as const;
export type AudioChannel = typeof AUDIO_CHANNELS[number];
export interface PlayerAudioLevels {
  volume?: number;
  musicVolume?: number;
  ambienceVolume?: number;
  effectsVolume?: number;
  voiceVolume?: number;
}
export function clampAudioLevel(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}
export function playerAudioGain(levels: PlayerAudioLevels, channel: AudioChannel): number {
  return clampAudioLevel(levels.volume) * clampAudioLevel(levels[`${channel}Volume`]);
}

export function usePlayerPageHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return hidden;
}

/** Observe actual playback, including native control mute/pause and decoder stalls. */
export function useAudibleMedia(
  ref: RefObject<HTMLMediaElement | null>,
  sourceKey: string | undefined,
  onAudibleChange?: (audible: boolean) => void,
  hasAudio = true
): void {
  useEffect(() => {
    const media = ref.current;
    if (!media || !onAudibleChange) return;
    let stalled = false;
    const update = (event?: Event) => {
      if (event?.type === "waiting" || event?.type === "stalled" || event?.type === "emptied") stalled = true;
      if (event?.type === "playing" || event?.type === "timeupdate") stalled = false;
      onAudibleChange(hasAudio && !stalled && !media.paused && !media.ended && !media.muted &&
        media.volume > 0 && media.readyState >= 2 && !media.error);
    };
    const events = ["playing", "timeupdate", "pause", "ended", "waiting", "stalled", "emptied", "volumechange", "error"];
    events.forEach((event) => media.addEventListener(event, update));
    update();
    return () => {
      events.forEach((event) => media.removeEventListener(event, update));
      onAudibleChange(false);
    };
  }, [ref, sourceKey, onAudibleChange, hasAudio]);
}

/** Shared volume and menu/visibility pause for foreground media in both hosts. */
export function useForegroundAudio(
  ref: RefObject<HTMLMediaElement | null>, sourceKey: string | undefined,
  volume: number, paused: boolean, onAudibleChange?: (audible: boolean) => void, hasAudio = true
): void {
  const resumeAfterPause = useRef(false);
  useAudibleMedia(ref, sourceKey, onAudibleChange, hasAudio);
  useEffect(() => {
    const media = ref.current;
    return () => { media?.pause(); };
  }, [ref, sourceKey]);
  useEffect(() => {
    if (ref.current) ref.current.volume = clampAudioLevel(volume);
  }, [ref, sourceKey, volume]);
  useEffect(() => {
    const media = ref.current;
    if (!media) return;
    if (paused) {
      resumeAfterPause.current = !media.paused || media.currentTime === 0;
      media.pause();
    } else if (resumeAfterPause.current) {
      resumeAfterPause.current = false;
      void media.play().catch(() => undefined);
    }
    const preventPlaybackWhilePaused = () => { if (paused) media.pause(); };
    media.addEventListener("play", preventPlaybackWhilePaused);
    return () => media.removeEventListener("play", preventPlaybackWhilePaused);
  }, [ref, sourceKey, paused]);
}

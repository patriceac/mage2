import { afterEach, describe, expect, it, vi } from "vitest";
import { SoundscapeLayerSchema } from "@mage2/schema";
import { SoundscapePlayer, type SoundscapeState } from "./soundscape-player";
import { resolvePlayerPreferences } from "./PlayerExperienceShell";

class AudioStub extends EventTarget {
  dataset: Record<string, string> = {};
  src = ""; preload = ""; loop = false; volume = 1; currentTime = 12; readyState = 4;
  paused = true; ended = false; removed = false;
  play = vi.fn(async () => { this.paused = false; this.dispatchEvent(new Event("playing")); });
  pause() { this.paused = true; }
  removeAttribute() { this.src = ""; }
  load() {}
  remove() { this.removed = true; }
}
function fixture() {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  const audios: AudioStub[] = [];
  const mixer = new SoundscapePlayer({ append() {} } as unknown as HTMLElement, async (path) => path, vi.fn(), () => {
    const audio = new AudioStub(); audios.push(audio); return audio as unknown as HTMLAudioElement;
  });
  const state: SoundscapeState = { sessionId: 1, sceneKey: "one", paused: false, ducked: false, levels: { volume: 0.8, musicVolume: 0.5 }, cues: [],
    layers: { music: { ...SoundscapeLayerSchema.parse({ assetId: "music", fadeInMs: 0, fadeOutMs: 0, gain: 0.5, continueAcrossScenes: true }), sourcePath: "music.wav" } } };
  return { mixer, state, audios };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("soundscape playback lifecycle", () => {
  it("preserves identity and playhead through rerenders/adjacent rooms, then releases on a non-continuing scene or load", async () => {
    const { mixer, state, audios } = fixture();
    mixer.update(state); await Promise.resolve();
    mixer.update({ ...state, layers: structuredClone(state.layers) });
    mixer.update({ ...state, sceneKey: "two" });
    expect(audios).toHaveLength(1);
    expect(audios[0]!.currentTime).toBe(12);
    expect(audios[0]!.volume).toBeCloseTo(0.2);
    mixer.update({ ...state, sceneKey: "three", layers: { music: { ...state.layers.music!, continueAcrossScenes: false } } });
    expect(audios[0]!.removed).toBe(true);
    expect(audios).toHaveLength(2);
    mixer.update({ ...state, sessionId: 2 });
    expect(audios[1]!.removed).toBe(true);
    mixer.dispose();
  });
  it("pauses, restores ducked gains, and consumes each one-shot cue once", async () => {
    const { mixer, state, audios } = fixture();
    const next = { ...state, cues: [{ sequence: 1, assetId: "click", gain: 0.5, sourcePath: "click.wav" }] };
    mixer.update(next); await Promise.resolve();
    mixer.update({ ...next, ducked: true });
    await vi.advanceTimersByTimeAsync(144);
    expect(audios[0]!.volume).toBeCloseTo(0.08);
    await vi.advanceTimersByTimeAsync(256);
    expect(audios[0]!.volume).toBeCloseTo(0.05);
    expect(audios[1]!.volume).toBeCloseTo(0.4);
    expect(audios).toHaveLength(2);
    mixer.update({ ...next, paused: true });
    expect(audios.every((audio) => audio.paused)).toBe(true);
    mixer.update(next); await vi.advanceTimersByTimeAsync(500);
    expect(audios[0]!.paused).toBe(false);
    expect(audios[0]!.currentTime).toBe(12);
    expect(audios[0]!.volume).toBeCloseTo(0.2);
    mixer.dispose();
    expect(audios.every((audio) => audio.removed && audio.paused)).toBe(true);
  });
  it("loads old preferences, clamps independent buses, and recovers malformed storage", () => {
    expect(resolvePlayerPreferences('{"volume":0.4,"textSize":"large"}')).toMatchObject({ volume: 0.4, musicVolume: 1, voiceVolume: 1, textSize: "large" });
    expect(resolvePlayerPreferences('{"musicVolume":2,"voiceVolume":-1,"effectsVolume":"bad"}')).toMatchObject({ musicVolume: 1, voiceVolume: 0, effectsVolume: 1 });
    expect(resolvePlayerPreferences("null").volume).toBe(1);
  });
});

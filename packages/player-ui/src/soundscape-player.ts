import type { PlayerSoundCue } from "@mage2/player";
import type { SoundscapeLayer } from "@mage2/schema";
import { clampAudioLevel, playerAudioGain, type AudioChannel, type PlayerAudioLevels } from "./audio";

export interface ResolvedSoundscapeLayer extends SoundscapeLayer { sourcePath: string }
export interface SoundscapeState {
  sessionId?: number;
  sceneKey: string;
  layers: Partial<Record<"music" | "ambience", ResolvedSoundscapeLayer>>;
  cues: (PlayerSoundCue & { sourcePath: string })[];
  levels: PlayerAudioLevels;
  paused: boolean;
  ducked: boolean;
}
interface Track {
  audio: HTMLAudioElement;
  channel: AudioChannel;
  layer: ResolvedSoundscapeLayer;
  fade: number;
  retiring: boolean;
  ready: boolean;
  blocked: boolean;
  failed: boolean;
  disposed: boolean;
}

/** Owns only native audio elements. Stable tracks survive React renders and opted-in scene transitions. */
export class SoundscapePlayer {
  private state?: SoundscapeState;
  private readonly layers = new Map<"music" | "ambience", Track>();
  private readonly tracks = new Set<Track>();
  private lastCue = 0;
  private duck = 1;
  private frame?: number;
  private lastFrame = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly resolveSource: (path: string) => Promise<string>,
    private readonly onStatus: (blocked: boolean, failed: boolean) => void,
    private readonly createAudio = () => document.createElement("audio")
  ) {}

  update(next: SoundscapeState): number {
    const previous = this.state;
    const reset = previous && previous.sessionId !== next.sessionId;
    if (reset) {
      this.clear();
      this.lastCue = 0;
      this.duck = 1;
    }
    this.state = next;
    const sceneChanged = previous?.sceneKey !== next.sceneKey;
    if (sceneChanged) for (const track of this.tracks) if (track.channel === "effects") this.release(track);
    for (const channel of ["music", "ambience"] as const) {
      const layer = next.layers[channel];
      const current = this.layers.get(channel);
      const same = current && layer && current.layer.assetId === layer.assetId &&
        current.layer.sourcePath === layer.sourcePath && current.layer.loop === layer.loop;
      if (same && (!sceneChanged || (current.layer.continueAcrossScenes && layer.continueAcrossScenes))) {
        current.layer = layer;
      } else {
        // At most one fading tail per channel, even after rapid room changes.
        for (const track of this.tracks) if (track.channel === channel && track.retiring) this.release(track);
        if (current) {
          current.retiring = true;
          if (!current.ready || !current.layer.fadeOutMs) this.release(current);
          this.layers.delete(channel);
        }
        if (layer) this.layers.set(channel, this.start(channel, layer));
      }
    }
    for (const cue of next.cues) {
      if (cue.sequence <= this.lastCue) continue;
      this.lastCue = cue.sequence;
      // Bound simultaneous Foley without retaining an unbounded decoder queue.
      const effects = [...this.tracks].filter((track) => track.channel === "effects");
      if (effects.length >= 16) this.release(effects[0]!);
      const track = this.start("effects", { ...cue, loop: false, fadeInMs: 0, fadeOutMs: 0, continueAcrossScenes: false });
      track.audio.dataset.soundSequence = String(cue.sequence);
    }
    for (const track of this.tracks) {
      if (next.paused) track.audio.pause();
      else if (previous?.paused && track.ready) this.play(track);
      this.applyVolume(track);
    }
    this.animate();
    this.report();
    return this.lastCue;
  }

  resume(): void {
    if (this.state?.paused) return;
    for (const track of this.tracks) if (track.ready && track.blocked) this.play(track);
  }

  dispose(): void { this.clear(); this.state = undefined; }

  private start(channel: Track["channel"], layer: ResolvedSoundscapeLayer): Track {
    const audio = this.createAudio();
    const track: Track = { audio, channel, layer, fade: layer.fadeInMs ? 0 : 1,
      retiring: false, ready: false, blocked: false, failed: false, disposed: false };
    audio.dataset.audioChannel = channel;
    audio.dataset.assetId = layer.assetId;
    audio.preload = "auto";
    audio.loop = layer.loop;
    audio.volume = 0;
    audio.addEventListener("ended", () => { if (channel === "effects") { this.release(track); this.report(); } });
    audio.addEventListener("playing", () => { track.blocked = false; this.report(); this.animate(); });
    audio.addEventListener("error", () => {
      if (track.disposed) return;
      track.failed = true;
      track.blocked = false;
      audio.dataset.audioState = "failed";
      audio.pause();
      this.report();
    });
    this.tracks.add(track);
    this.container.append(audio);
    void this.resolveSource(layer.sourcePath).then((url) => {
      if (track.disposed) return;
      audio.src = url;
      track.ready = true;
      this.applyVolume(track);
      if (!this.state?.paused) this.play(track);
    }).catch(() => { if (!track.disposed) { track.failed = true; this.report(); } });
    return track;
  }

  private play(track: Track): void {
    if (track.failed || track.disposed || (track.audio.ended && !track.audio.loop)) return;
    void track.audio.play().then(() => {
      if (track.disposed) return;
      track.blocked = false;
      this.report();
      this.animate();
    }).catch((error: unknown) => {
      if (track.disposed || this.state?.paused || (error as { name?: string })?.name === "AbortError") return;
      track.blocked = (error as { name?: string })?.name === "NotAllowedError";
      track.failed = !track.blocked;
      this.report();
    });
  }

  private applyVolume(track: Track): void {
    if (!this.state) return;
    track.audio.volume = clampAudioLevel(track.layer.gain) * playerAudioGain(this.state.levels, track.channel) *
      track.fade * (track.channel === "effects" ? 1 : this.duck);
  }

  private animate(): void {
    if (this.frame !== undefined || this.state?.paused || !this.tracks.size) return;
    this.lastFrame = performance.now();
    const tick = (now: number) => {
      this.frame = undefined;
      if (!this.state || this.state.paused) return;
      const elapsed = Math.max(0, Math.min(100, now - this.lastFrame));
      this.lastFrame = now;
      const targetDuck = this.state.ducked ? 0.25 : 1;
      const step = elapsed * 0.75 / (this.state.ducked ? 180 : 350);
      this.duck += Math.sign(targetDuck - this.duck) * Math.min(Math.abs(targetDuck - this.duck), step);
      let moving = this.duck !== targetDuck;
      for (const track of this.tracks) {
        if (track.retiring) {
          track.fade = Math.max(0, track.fade - elapsed / Math.max(1, track.layer.fadeOutMs));
          if (!track.fade) { this.release(track); continue; }
        } else if (!track.audio.paused && track.audio.readyState >= 2 && !track.failed) {
          track.fade = Math.min(1, track.fade + elapsed / Math.max(1, track.layer.fadeInMs));
        }
        this.applyVolume(track);
        moving ||= track.retiring || (!track.audio.paused && track.fade < 1 && !track.failed);
      }
      if (moving) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private release(track: Track): void {
    track.disposed = true;
    track.audio.pause();
    track.audio.removeAttribute("src");
    track.audio.load();
    track.audio.remove();
    this.tracks.delete(track);
  }
  private clear(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    for (const track of this.tracks) this.release(track);
    this.layers.clear();
  }
  private report(): void {
    this.onStatus([...this.tracks].some((track) => track.blocked), [...this.tracks].some((track) => track.failed));
  }
}

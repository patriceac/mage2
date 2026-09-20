import { chooseAmbientClip, createAmbientRandom, drawAmbientDelay } from "@mage2/player";
import { resolveAmbientSchedule, type AmbientClip, type AmbientRegion, type AmbientSchedule } from "@mage2/schema";

interface Slot { video: HTMLVideoElement; clip: AmbientClip; released: boolean; frame?: number }

/** Native Chromium video compositing: no canvas, pixel readbacks, or frame copies.
 * Only the active clip and an optional imminent successor own media elements. */
export function createAmbientPlayback(host: HTMLElement, options: {
  region: AmbientRegion;
  defaults?: AmbientSchedule;
  seed: number;
  paused: boolean;
  resolveClip: (id: string) => Promise<string | undefined>;
}) {
  const { region } = options;
  const random = createAmbientRandom(options.seed, region.id);
  const failed = new Set<string>();
  let active: Slot | undefined;
  let next: Slot | undefined;
  let previous: string | undefined;
  let completed = 0;
  let disposed = false;
  let paused = options.paused;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let pending: { remaining: number; due: number; run: () => void } | undefined;
  const schedule = (clip: AmbientClip) => resolveAmbientSchedule(options.defaults, region.schedule, clip.schedule);
  const status = (value: string) => { host.dataset.ambientState = value; };
  function clearWatchdog() { clearTimeout(watchdog); watchdog = undefined; }
  function release(slot: Slot | undefined) {
    if (!slot || slot.released) return;
    slot.released = true;
    if (slot.frame !== undefined) slot.video.cancelVideoFrameCallback?.(slot.frame);
    slot.video.pause();
    slot.video.removeAttribute("src");
    slot.video.load();
    slot.video.remove();
  }
  function armTimer() {
    if (!pending || paused || disposed) return;
    pending.due = performance.now() + pending.remaining;
    timer = setTimeout(() => {
      const run = pending?.run;
      pending = undefined;
      timer = undefined;
      if (!disposed) run?.();
    }, pending.remaining);
  }
  function wait(ms: number, run: () => void) {
    clearTimeout(timer);
    pending = { remaining: ms, due: 0, run };
    armTimer();
  }
  function watch(slot: Slot) {
    clearWatchdog();
    if (!paused) watchdog = setTimeout(() => fail(slot), 10000);
  }
  function fail(slot: Slot) {
    if (disposed || slot.released) return;
    failed.add(slot.clip.assetId);
    release(slot);
    if (slot === next) next = undefined;
    if (slot !== active) return;
    clearWatchdog();
    active = undefined;
    release(next);
    next = undefined;
    status("fallback-error");
    // Failed clips are quarantined until scene re-entry; even a zero-delay pool
    // cannot spin forever on unsupported formats or a broken URL.
    wait(0, () => selectAndStart());
  }
  function reveal(slot: Slot) {
    if (slot.released || disposed || paused || slot !== active || slot.video.readyState < 2) return;
    slot.video.style.visibility = "visible";
    clearWatchdog();
    status("playing");
  }
  function expectFrame(slot: Slot) {
    if (slot.frame !== undefined) slot.video.cancelVideoFrameCallback?.(slot.frame);
    if (slot.video.requestVideoFrameCallback) {
      slot.frame = slot.video.requestVideoFrameCallback(() => { slot.frame = undefined; reveal(slot); });
    } else if (slot.video.readyState >= 2) reveal(slot);
  }
  function play(slot: Slot) {
    if (disposed || slot.released || paused || slot !== active) return;
    expectFrame(slot);
    void slot.video.play().catch(() => { if (!paused) fail(slot); });
  }
  function load(clip: AmbientClip): Slot {
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.loop = schedule(clip).repeatCount === 0;
    video.style.visibility = "hidden";
    video.dataset.ambientClip = clip.assetId;
    video.setAttribute("aria-hidden", "true");
    const slot: Slot = { video, clip, released: false };
    video.addEventListener("error", () => fail(slot));
    video.addEventListener("loadedmetadata", () => {
      if (video.videoWidth !== region.sourceWidth || video.videoHeight !== region.sourceHeight || !Number.isFinite(video.duration) || video.duration <= 0) fail(slot);
    });
    video.addEventListener("canplay", () => play(slot));
    video.addEventListener("playing", () => { if (slot === active) expectFrame(slot); });
    video.addEventListener("waiting", () => {
      if (slot !== active || slot.released) return;
      video.style.visibility = "hidden";
      if (slot.frame !== undefined) video.cancelVideoFrameCallback?.(slot.frame);
      status("buffering");
      watch(slot);
    });
    video.addEventListener("timeupdate", () => {
      const settings = schedule(clip);
      if (slot === active && !paused && !next && settings.repeatCount > 0 && completed + 1 === settings.repeatCount && settings.maxDelayMs === 0 && video.duration - video.currentTime < 0.25) {
        const chosen = chooseAmbientClip(region.clips, clip.assetId, random, failed);
        if (chosen) next = load(chosen);
      }
    });
    video.addEventListener("ended", () => {
      if (slot !== active || slot.released) return;
      completed++;
      const settings = schedule(clip);
      if (completed < settings.repeatCount) {
        video.currentTime = 0;
        play(slot);
        return;
      }
      // Hide/remove before waiting or swapping: the neutral image stays mounted.
      release(active);
      active = undefined;
      clearWatchdog();
      previous = clip.assetId;
      status("idle");
      const delay = drawAmbientDelay(settings, random);
      const chosen = next?.clip ?? chooseAmbientClip(region.clips, previous, random, failed);
      if (!chosen) return;
      if (delay === 0) { start(next ?? load(chosen)); next = undefined; }
      else wait(Math.max(0, delay - 250), () => {
        next = load(chosen);
        status("preloading");
        wait(Math.min(delay, 250), () => {
          if (next && !next.released) start(next);
          else selectAndStart();
          next = undefined;
        });
      });
    });
    host.append(video);
    void options.resolveClip(clip.assetId).then((url) => {
      if (disposed || slot.released) return;
      if (!url) { fail(slot); return; }
      video.src = url;
      video.load();
      if (slot === active) play(slot);
    }).catch(() => fail(slot));
    return slot;
  }
  function start(slot: Slot) {
    active = slot;
    completed = 0;
    status("loading");
    watch(slot);
    if (slot.video.hasAttribute("src")) play(slot);
  }
  function selectAndStart() {
    const clip = chooseAmbientClip(region.clips, previous, random, failed);
    if (clip) start(load(clip));
    else status("fallback-error");
  }
  status("idle");
  wait(0, selectAndStart);
  return {
    setPaused(value: boolean) {
      if (paused === value || disposed) return;
      paused = value;
      if (paused) {
        if (pending && timer !== undefined) pending.remaining = Math.max(0, pending.due - performance.now());
        clearTimeout(timer);
        timer = undefined;
        clearWatchdog();
        active?.video.pause();
        if (active) active.video.style.visibility = "hidden";
        status("paused");
      } else {
        armTimer();
        if (active) { watch(active); play(active); }
      }
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      clearWatchdog();
      release(active);
      release(next);
      status("disabled");
    }
  };
}

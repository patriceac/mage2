import type { AmbientClip, AmbientSchedule } from "@mage2/schema";

/** One stream per region: adding another region never changes this region's sequence. */
export function createAmbientRandom(seed: number, regionId: string): () => number {
  let state = seed >>> 0;
  for (let i = 0; i < regionId.length; i++) state = Math.imul(state ^ regionId.charCodeAt(i), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function chooseAmbientClip(clips: readonly AmbientClip[], previousId: string | undefined, random: () => number, failed: ReadonlySet<string> = new Set()): AmbientClip | undefined {
  const eligible = clips.filter((clip) => clip.weight > 0 && !failed.has(clip.assetId));
  const pool = eligible.length > 1 ? eligible.filter((clip) => clip.assetId !== previousId) : eligible;
  // Normalize to avoid overflow when weights are individually finite but very large.
  const largest = Math.max(...pool.map((clip) => clip.weight), 1);
  let target = random() * pool.reduce((sum, clip) => sum + clip.weight / largest, 0);
  return pool.find((clip) => (target -= clip.weight / largest) < 0) ?? pool.at(-1);
}

export function drawAmbientDelay(schedule: Required<AmbientSchedule>, random: () => number): number {
  if (schedule.minDelayMs === schedule.maxDelayMs) return schedule.minDelayMs;
  return schedule.minDelayMs + Math.floor(random() * (schedule.maxDelayMs - schedule.minDelayMs + 1));
}

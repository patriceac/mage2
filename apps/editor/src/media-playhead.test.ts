import { describe, expect, it } from "vitest";
import {
  PLAYHEAD_SYNC_TOLERANCE_MS,
  clampPlayheadMs,
  getVideoPlayheadMs,
  resolvePlayableDurationMs,
  shouldSyncPlayheadMs
} from "./media-playhead";

describe("media-playhead", () => {
  it("prefers the actual media duration when metadata is available", () => {
    expect(resolvePlayableDurationMs(5.042, 7000)).toBe(5042);
    expect(resolvePlayableDurationMs(Number.NaN, 7000)).toBe(7000);
  });

  it("clamps playheads inside the available duration", () => {
    expect(clampPlayheadMs(-50, 3000)).toBe(0);
    expect(clampPlayheadMs(1250, 3000)).toBe(1250);
    expect(clampPlayheadMs(4500, 3000)).toBe(3000);
  });

  it("rounds video time to milliseconds and clamps to duration", () => {
    expect(getVideoPlayheadMs(1.2345, 5.0)).toBe(1235);
    expect(getVideoPlayheadMs(9.5, 5.042)).toBe(5042);
  });

  it("ignores tiny playhead differences to avoid sync loops", () => {
    expect(shouldSyncPlayheadMs(1000, 1000 + PLAYHEAD_SYNC_TOLERANCE_MS - 1)).toBe(false);
    expect(shouldSyncPlayheadMs(1000, 1000 + PLAYHEAD_SYNC_TOLERANCE_MS + 1)).toBe(true);
  });
});

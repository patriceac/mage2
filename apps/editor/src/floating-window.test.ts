import { describe, expect, it } from "vitest";
import {
  resolveAvoidingFloatingWindowPosition,
  clampFloatingWindowPosition,
  resolveDefaultFloatingWindowPosition,
  FLOATING_WINDOW_MARGIN_PX,
  resolveNextFloatingWindowPosition
} from "./floating-window";

describe("clampFloatingWindowPosition", () => {
  it("keeps floating windows inside the viewport bounds", () => {
    expect(
      clampFloatingWindowPosition(
        { x: 4, y: 900 },
        { width: 420, height: 320 },
        { width: 1280, height: 800 }
      )
    ).toEqual({
      x: FLOATING_WINDOW_MARGIN_PX,
      y: 464
    });
  });

  it("pins oversized floating windows to the viewport margin", () => {
    expect(
      clampFloatingWindowPosition(
        { x: 280, y: 240 },
        { width: 980, height: 780 },
        { width: 900, height: 700 }
      )
    ).toEqual({
      x: FLOATING_WINDOW_MARGIN_PX,
      y: FLOATING_WINDOW_MARGIN_PX
    });
  });
});

describe("resolveDefaultFloatingWindowPosition", () => {
  it("anchors the default position to the top-right of the owning surface", () => {
    expect(
      resolveDefaultFloatingWindowPosition(
        { width: 420, height: 320 },
        { width: 1440, height: 900 },
        { top: 140, right: 1180 }
      )
    ).toEqual({
      x: 696,
      y: 204
    });
  });

  it("falls back to a visible position when the anchor would overflow the viewport", () => {
    expect(
      resolveDefaultFloatingWindowPosition(
        { width: 520, height: 420 },
        { width: 960, height: 720 },
        { top: -80, right: 1800 }
      )
    ).toEqual({
      x: 424,
      y: FLOATING_WINDOW_MARGIN_PX
    });
  });
});

describe("resolveAvoidingFloatingWindowPosition", () => {
  it("keeps the default placement when it does not overlap the avoided area", () => {
    expect(
      resolveAvoidingFloatingWindowPosition(
        { width: 420, height: 320 },
        { width: 1280, height: 900 },
        { x: 120, y: 560, width: 180, height: 190 },
        { top: 120, right: 1220 }
      )
    ).toEqual({
      x: 736,
      y: 184
    });
  });

  it("prefers a zero-overlap placement beside the avoided area", () => {
    expect(
      resolveAvoidingFloatingWindowPosition(
        { width: 420, height: 320 },
        { width: 1280, height: 900 },
        { x: 780, y: 340, width: 180, height: 190 },
        { top: 120, right: 1220 }
      )
    ).toEqual({
      x: 296,
      y: 340
    });
  });

  it("falls back to the least-overlapping clamped placement when space is tight", () => {
    expect(
      resolveAvoidingFloatingWindowPosition(
        { width: 520, height: 420 },
        { width: 960, height: 720 },
        { x: 300, y: 200, width: 280, height: 240 },
        { top: 80, right: 920 }
      )
    ).toEqual({
      x: 424,
      y: 200
    });
  });
});

describe("resolveNextFloatingWindowPosition", () => {
  it("keeps the current placement when it does not overlap the avoided area", () => {
    const currentPosition = { x: 180, y: 120 };

    expect(
      resolveNextFloatingWindowPosition(
        currentPosition,
        { width: 420, height: 320 },
        { width: 1280, height: 900 },
        { x: 780, y: 340, width: 180, height: 190 },
        { top: 120, right: 1220 }
      )
    ).toBe(currentPosition);
  });

  it("keeps the current placement coordinates when it does not overlap the avoided area", () => {
    expect(
      resolveNextFloatingWindowPosition(
        { x: 180, y: 120 },
        { width: 420, height: 320 },
        { width: 1280, height: 900 },
        { x: 780, y: 340, width: 180, height: 190 },
        { top: 120, right: 1220 }
      )
    ).toEqual({
      x: 180,
      y: 120
    });
  });

  it("repositions when the current placement overlaps the avoided area", () => {
    expect(
      resolveNextFloatingWindowPosition(
        { x: 736, y: 184 },
        { width: 420, height: 320 },
        { width: 1280, height: 900 },
        { x: 780, y: 340, width: 180, height: 190 },
        { top: 120, right: 1220 }
      )
    ).toEqual({
      x: 296,
      y: 340
    });
  });

  it("clamps the current placement while preserving it", () => {
    expect(
      resolveNextFloatingWindowPosition(
        { x: 4, y: 900 },
        { width: 420, height: 320 },
        { width: 1280, height: 800 },
        { x: 40, y: 40, width: 120, height: 120 }
      )
    ).toEqual({
      x: FLOATING_WINDOW_MARGIN_PX,
      y: 464
    });
  });
});

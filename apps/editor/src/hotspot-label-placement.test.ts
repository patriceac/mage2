import { describe, expect, it } from "vitest";
import { resolveHotspotLabelPlacement, type HotspotLabelPlacement } from "./hotspot-label-placement";

describe("resolveHotspotLabelPlacement", () => {
  it("defaults to an above-centered tag when the hotspot has headroom", () => {
    expect(
      resolveHotspotLabelPlacement({
        x: 0.4,
        y: 0.36,
        width: 0.18,
        height: 0.14
      })
    ).toEqual({
      anchorX: 0.49,
      horizontalAlignment: "center",
      verticalPlacement: "above",
      maxWidth: 0.28
    });
  });

  it("flips the tag below hotspots near the top edge", () => {
    expect(
      resolveHotspotLabelPlacement({
        x: 0.42,
        y: 0.05,
        width: 0.18,
        height: 0.14
      })
    ).toMatchObject({
      horizontalAlignment: "center",
      verticalPlacement: "below"
    });
  });

  it("left-aligns the tag when the hotspot sits near the left edge", () => {
    expect(
      resolveHotspotLabelPlacement({
        x: 0.03,
        y: 0.34,
        width: 0.16,
        height: 0.12
      })
    ).toEqual({
      anchorX: 0.03,
      horizontalAlignment: "start",
      verticalPlacement: "above",
      maxWidth: 0.28
    });
  });

  it("right-aligns the tag when the hotspot sits near the right edge", () => {
    expect(
      resolveHotspotLabelPlacement({
        x: 0.79,
        y: 0.34,
        width: 0.14,
        height: 0.12
      })
    ).toEqual({
      anchorX: 0.93,
      horizontalAlignment: "end",
      verticalPlacement: "above",
      maxWidth: 0.28
    });
  });

  it("keeps corner hotspot tags inside the media surface horizontally", () => {
    const placements = [
      resolveHotspotLabelPlacement({
        x: 0.02,
        y: 0.03,
        width: 0.12,
        height: 0.12
      }),
      resolveHotspotLabelPlacement({
        x: 0.88,
        y: 0.03,
        width: 0.1,
        height: 0.12
      })
    ];

    for (const placement of placements) {
      const { leftEdge, rightEdge } = resolveHorizontalEdges(placement);
      expect(leftEdge).toBeGreaterThanOrEqual(0);
      expect(rightEdge).toBeLessThanOrEqual(1);
    }
  });
});

function resolveHorizontalEdges(placement: HotspotLabelPlacement): { leftEdge: number; rightEdge: number } {
  switch (placement.horizontalAlignment) {
    case "start":
      return {
        leftEdge: placement.anchorX,
        rightEdge: placement.anchorX + placement.maxWidth
      };
    case "end":
      return {
        leftEdge: placement.anchorX - placement.maxWidth,
        rightEdge: placement.anchorX
      };
    default:
      return {
        leftEdge: placement.anchorX - placement.maxWidth / 2,
        rightEdge: placement.anchorX + placement.maxWidth / 2
      };
  }
}

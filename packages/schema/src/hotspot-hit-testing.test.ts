import { describe, expect, it } from "vitest";
import {
  isHotspotSurfacePointInteractive,
  isHotspotVisualPixelOpaque,
  isPointInHotspotPolygon,
  resolveHotspotVisualPixelPoint
} from "./hotspot-hit-testing";
import type { Hotspot } from "./types";

describe("hotspot hit testing", () => {
  it("treats polygon edges as clickable", () => {
    expect(
      isPointInHotspotPolygon(
        { x: 0.5, y: 0 },
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 }
        ]
      )
    ).toBe(true);
  });

  it("maps rotated visual points back into image pixels", () => {
    expect(
      resolveHotspotVisualPixelPoint(
        { x: 0.5, y: 0.2 },
        { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
        90,
        { width: 4, height: 4 }
      )
    ).toEqual({
      x: 0,
      y: 2
    });
  });

  it("treats transparent image holes as non-interactive", () => {
    const alphaValues = new Uint8ClampedArray([
      255, 255, 255,
      255, 0, 255,
      255, 255, 255
    ]);

    expect(
      isHotspotVisualPixelOpaque(
        { x: 0.5, y: 0.5 },
        { x: 0, y: 0, width: 1, height: 1 },
        0,
        { width: 3, height: 3 },
        alphaValues
      )
    ).toBe(false);
    expect(
      isHotspotVisualPixelOpaque(
        { x: 0.1, y: 0.1 },
        { x: 0, y: 0, width: 1, height: 1 },
        0,
        { width: 3, height: 3 },
        alphaValues
      )
    ).toBe(true);
  });

  it("requires an opaque pixel for inventory-backed hotspot activation", () => {
    const hotspot: Hotspot = {
      id: "hotspot_item",
      name: "Potion",
      inventoryItemId: "item_potion",
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
      polygon: [
        { x: 0.25, y: 0.25 },
        { x: 0.75, y: 0.25 },
        { x: 0.75, y: 0.75 },
        { x: 0.25, y: 0.75 }
      ],
      startMs: 0,
      endMs: 1000,
      requiredItemIds: [],
      conditions: [],
      effects: []
    };
    const alphaValues = new Uint8ClampedArray([
      255, 255, 255,
      255, 0, 255,
      255, 255, 255
    ]);

    expect(
      isHotspotSurfacePointInteractive({
        hotspot,
        surfacePoint: { x: 0.5, y: 0.5 },
        surfaceSize: { width: 100, height: 100 },
        visualBox: { x: 0, y: 0, width: 1, height: 1 },
        rotationDegrees: 0,
        imageSize: { width: 3, height: 3 },
        alphaValues
      })
    ).toBe(false);
    expect(
      isHotspotSurfacePointInteractive({
        hotspot,
        surfacePoint: { x: 0.3, y: 0.3 },
        surfaceSize: { width: 100, height: 100 },
        visualBox: { x: 0, y: 0, width: 1, height: 1 },
        rotationDegrees: 0,
        imageSize: { width: 3, height: 3 },
        alphaValues
      })
    ).toBe(true);
  });
});

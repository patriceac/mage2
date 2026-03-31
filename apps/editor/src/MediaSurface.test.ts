import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveHotspotClipPath, type Hotspot } from "@mage2/schema";
import {
  isOpaqueHotspotVisualHit,
  resolveContainedImageBox,
  resolveHotspotVisualHitPoint
} from "./hotspot-alpha-hit-test";
import {
  MediaSurface,
  resolveHotspotRotationHandleGeometry,
  resolveHotspotSelectionAfterDrag
} from "./MediaSurface";

function renderHotspotMarkup(hotspot: Hotspot): string {
  return renderToStaticMarkup(
    React.createElement(MediaSurface, {
      hotspots: [hotspot],
      hotspotAppearance: "editor",
      showHotspotLabels: false,
      showHotspotTooltips: false
    })
  );
}

function renderEditableSelectedHotspotMarkup(hotspot: Hotspot): string {
  return renderToStaticMarkup(
    React.createElement(MediaSurface, {
      hotspots: [hotspot],
      hotspotAppearance: "editor",
      showHotspotLabels: false,
      showHotspotTooltips: false,
      selectedHotspotId: hotspot.id,
      onHotspotChange: () => {}
    })
  );
}

function renderEditableSelectedLabeledHotspotMarkup(hotspot: Hotspot): string {
  return renderToStaticMarkup(
    React.createElement(MediaSurface, {
      hotspots: [hotspot],
      hotspotAppearance: "editor",
      showHotspotLabels: true,
      showHotspotTooltips: false,
      selectedHotspotId: hotspot.id,
      onHotspotChange: () => {}
    })
  );
}

describe("MediaSurface hotspot chrome geometry", () => {
  it("applies the polygon clip path to the editor chrome for plain hotspots", () => {
    const hotspot: Hotspot = {
      id: "hotspot_map",
      name: "Map",
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
      polygon: [
        { x: 0.1, y: 0.3 },
        { x: 0.4, y: 0.2 },
        { x: 0.35, y: 0.6 },
        { x: 0.1, y: 0.5 }
      ],
      startMs: 0,
      endMs: 1_000,
      requiredItemIds: [],
      conditions: [],
      effects: []
    };

    const markup = renderHotspotMarkup(hotspot);

    expect(markup).toContain("clip-path:polygon(");
    expect(markup).toContain("hotspot__chrome-shape");
    expect(markup).toContain("hotspot__chrome-corner");
  });

  it("applies the stored polygon clip path to inventory-backed hotspots", () => {
    const hotspot: Hotspot = {
      id: "hotspot_item",
      name: "Potion",
      inventoryItemId: "item_potion",
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
      polygon: [
        { x: 0.1, y: 0.3 },
        { x: 0.4, y: 0.2 },
        { x: 0.35, y: 0.6 },
        { x: 0.1, y: 0.5 }
      ],
      startMs: 0,
      endMs: 1_000,
      requiredItemIds: [],
      conditions: [],
      effects: []
    };

    const markup = renderHotspotMarkup(hotspot);

    expect(resolveHotspotClipPath(hotspot)).toBe("polygon(0% 25%, 100% 0%, 83.3333% 100%, 0% 75%)");
    expect(markup).toContain("clip-path:polygon(");
    expect(markup).toContain("hotspot--inventory-item");
    expect(markup).toContain("hotspot__chrome-shape");
  });

  it("renders rotated inventory hotspots with polygon chrome", () => {
    const hotspot: Hotspot = {
      id: "hotspot_item",
      name: "Potion",
      inventoryItemId: "item_potion",
      x: 0.36,
      y: 0.36,
      width: 0.28,
      height: 0.28,
      polygon: [
        { x: 0.5, y: 0.36 },
        { x: 0.64, y: 0.5 },
        { x: 0.5, y: 0.64 },
        { x: 0.36, y: 0.5 }
      ],
      startMs: 0,
      endMs: 1_000,
      requiredItemIds: [],
      conditions: [],
      effects: []
    };

    const markup = renderToStaticMarkup(
      React.createElement(MediaSurface, {
        hotspots: [hotspot],
        hotspotAppearance: "editor",
        showHotspotLabels: false,
        showHotspotTooltips: false
      })
    );

    expect(markup).toContain("hotspot--polygon-chrome");
    expect(markup).toContain("hotspot__chrome-shape");
  });

  it("renders a rotation handle for selected hotspots", () => {
    const inventoryHotspot: Hotspot = {
      id: "hotspot_item",
      name: "Potion",
      inventoryItemId: "item_potion",
      x: 0.36,
      y: 0.36,
      width: 0.28,
      height: 0.28,
      polygon: [
        { x: 0.5, y: 0.36 },
        { x: 0.64, y: 0.5 },
        { x: 0.5, y: 0.64 },
        { x: 0.36, y: 0.5 }
      ],
      startMs: 0,
      endMs: 1_000,
      requiredItemIds: [],
      conditions: [],
      effects: []
    };
    const plainHotspot: Hotspot = {
      ...inventoryHotspot,
      id: "hotspot_plain",
      inventoryItemId: undefined
    };

    expect(renderEditableSelectedHotspotMarkup(inventoryHotspot)).toContain("hotspot__handle hotspot__handle--rotate");
    expect(renderEditableSelectedHotspotMarkup(inventoryHotspot)).toContain("hotspot__rotation-ui");
    expect(renderEditableSelectedHotspotMarkup(plainHotspot)).toContain("hotspot__handle hotspot__handle--rotate");
  });

  it("adds extra top clearance to selected hotspot labels above the rotation handle", () => {
    const hotspot: Hotspot = {
      id: "hotspot_item",
      name: "Potion",
      inventoryItemId: "item_potion",
      x: 0.36,
      y: 0.36,
      width: 0.28,
      height: 0.28,
      polygon: [
        { x: 0.5, y: 0.36 },
        { x: 0.64, y: 0.5 },
        { x: 0.5, y: 0.64 },
        { x: 0.36, y: 0.5 }
      ],
      startMs: 0,
      endMs: 1_000,
      requiredItemIds: [],
      conditions: [],
      effects: []
    };

    const markup = renderEditableSelectedLabeledHotspotMarkup(hotspot);

    expect(markup).toContain("--hotspot-top-control-clearance:28px");
  });

  it("places the rotation handle above the hotspot top edge", () => {
    const rotationHandle = resolveHotspotRotationHandleGeometry([
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.2, y: 0.8 }
    ]);

    expect(rotationHandle?.handleX).toBeCloseTo(0.5, 6);
    expect(rotationHandle?.handleY).toBeCloseTo(0.02, 6);
    expect(rotationHandle?.stemStartX).toBeCloseTo(0.5, 6);
    expect(rotationHandle?.stemStartY).toBeCloseTo(0.2, 6);
    expect(rotationHandle?.labelX).toBeCloseTo(0.5, 6);
    expect(rotationHandle?.labelY).toBeCloseTo(-0.1, 6);
  });

  it("aligns the rotation handle to the rendered hotspot axis for non-square frames", () => {
    const polygon = [
      { x: 0.2204, y: 0.0813 },
      { x: 0.7796, y: 0.4338 },
      { x: 0.5796, y: 0.9188 },
      { x: 0.0204, y: 0.5663 }
    ];
    const frameSize = { width: 240, height: 120 };
    const rotationHandle = resolveHotspotRotationHandleGeometry(polygon, frameSize);

    expect(rotationHandle).toBeDefined();

    const topMidpointPx = {
      x: ((polygon[0]!.x + polygon[1]!.x) / 2) * frameSize.width,
      y: ((polygon[0]!.y + polygon[1]!.y) / 2) * frameSize.height
    };
    const topVectorPx = {
      x: (polygon[1]!.x - polygon[0]!.x) * frameSize.width,
      y: (polygon[1]!.y - polygon[0]!.y) * frameSize.height
    };
    const handleVectorPx = {
      x: (rotationHandle!.handleX - (polygon[0]!.x + polygon[1]!.x) / 2) * frameSize.width,
      y: (rotationHandle!.handleY - (polygon[0]!.y + polygon[1]!.y) / 2) * frameSize.height
    };
    const dotProduct = topVectorPx.x * handleVectorPx.x + topVectorPx.y * handleVectorPx.y;
    const normalizedDotProduct =
      dotProduct /
      (Math.hypot(topVectorPx.x, topVectorPx.y) * Math.max(Math.hypot(handleVectorPx.x, handleVectorPx.y), 0.0001));

    expect(Math.abs(normalizedDotProduct)).toBeLessThan(0.01);
    expect(Math.hypot(handleVectorPx.x, handleVectorPx.y)).toBeCloseTo(18, 1);
    expect(rotationHandle!.handleY * frameSize.height).toBeLessThan(topMidpointPx.y);
  });

  it("preserves a hidden inspector state when dragging an unselected hotspot", () => {
    expect(resolveHotspotSelectionAfterDrag(undefined, "hotspot_item")).toBeUndefined();
    expect(resolveHotspotSelectionAfterDrag("hotspot_map", "hotspot_item")).toBe("hotspot_item");
  });
});

describe("hotspot alpha hit testing", () => {
  it("centers contained art inside the hotspot frame", () => {
    expect(resolveContainedImageBox(120, 120, 240, 120)).toEqual({
      x: 0,
      y: 30,
      width: 120,
      height: 60
    });
  });

  it("maps click coordinates into the contained source image", () => {
    expect(
      resolveHotspotVisualHitPoint({
        pointX: 30,
        pointY: 45,
        hotspotWidth: 120,
        hotspotHeight: 120,
        visualBox: {
          x: 0,
          y: 0,
          width: 1,
          height: 1
        },
        rotationDegrees: 0,
        imageWidth: 2,
        imageHeight: 1
      })
    ).toEqual({
      x: 0,
      y: 0
    });

    expect(
      resolveHotspotVisualHitPoint({
        pointX: 30,
        pointY: 15,
        hotspotWidth: 120,
        hotspotHeight: 120,
        visualBox: {
          x: 0,
          y: 0,
          width: 1,
          height: 1
        },
        rotationDegrees: 0,
        imageWidth: 2,
        imageHeight: 1
      })
    ).toBeUndefined();
  });

  it("rejects transparent pixels inside the hotspot bounds", () => {
    const alphaMask = {
      width: 2,
      height: 2,
      alpha: new Uint8ClampedArray([
        255,
        0,
        0,
        255
      ])
    };

    expect(
      isOpaqueHotspotVisualHit(alphaMask, {
        pointX: 25,
        pointY: 25,
        hotspotWidth: 100,
        hotspotHeight: 100,
        visualBox: {
          x: 0,
          y: 0,
          width: 1,
          height: 1
        },
        rotationDegrees: 0,
        imageWidth: alphaMask.width,
        imageHeight: alphaMask.height
      })
    ).toBe(true);

    expect(
      isOpaqueHotspotVisualHit(alphaMask, {
        pointX: 75,
        pointY: 25,
        hotspotWidth: 100,
        hotspotHeight: 100,
        visualBox: {
          x: 0,
          y: 0,
          width: 1,
          height: 1
        },
        rotationDegrees: 0,
        imageWidth: alphaMask.width,
        imageHeight: alphaMask.height
      })
    ).toBe(false);
  });

  it("accounts for rotated hotspot visuals before sampling alpha", () => {
    const alphaMask = {
      width: 2,
      height: 2,
      alpha: new Uint8ClampedArray([
        255,
        0,
        0,
        0
      ])
    };

    expect(
      isOpaqueHotspotVisualHit(alphaMask, {
        pointX: 75,
        pointY: 25,
        hotspotWidth: 100,
        hotspotHeight: 100,
        visualBox: {
          x: 0,
          y: 0,
          width: 1,
          height: 1
        },
        rotationDegrees: 90,
        imageWidth: alphaMask.width,
        imageHeight: alphaMask.height
      })
    ).toBe(true);

    expect(
      isOpaqueHotspotVisualHit(alphaMask, {
        pointX: 25,
        pointY: 25,
        hotspotWidth: 100,
        hotspotHeight: 100,
        visualBox: {
          x: 0,
          y: 0,
          width: 1,
          height: 1
        },
        rotationDegrees: 90,
        imageWidth: alphaMask.width,
        imageHeight: alphaMask.height
      })
    ).toBe(false);
  });
});

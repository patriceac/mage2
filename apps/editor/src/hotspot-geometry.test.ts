import { describe, expect, it } from "vitest";
import { resolveHotspotPolygon, resolveHotspotRotationDegrees, resolveRelativeHotspotFrame } from "@mage2/schema";
import {
  applyHotspotBounds,
  applyHotspotDrag,
  applyHotspotKeyboardTransform,
  applyHotspotRotationDegrees,
  applyHotspotRotationDrag
} from "./hotspot-geometry";

function expectRectangularPolygon(
  polygon: Array<{ x: number; y: number }>,
  surfaceSize: { width: number; height: number }
) {
  const pixelPoints = polygon.map((point) => ({
    x: point.x * surfaceSize.width,
    y: point.y * surfaceSize.height
  }));
  const edges = pixelPoints.map((point, index) => {
    const next = pixelPoints[(index + 1) % pixelPoints.length]!;
    return {
      x: next.x - point.x,
      y: next.y - point.y
    };
  });

  for (let index = 0; index < edges.length; index += 1) {
    const current = edges[index]!;
    const next = edges[(index + 1) % edges.length]!;
    const dotProduct = current.x * next.x + current.y * next.y;
    expect(Math.abs(dotProduct)).toBeLessThan(0.2);
  }
}

function toPixelPoints(polygon: Array<{ x: number; y: number }>, surfaceSize: { width: number; height: number }) {
  return polygon.map((point) => ({
    x: point.x * surfaceSize.width,
    y: point.y * surfaceSize.height
  }));
}

describe("applyHotspotDrag", () => {
  it("moves a hotspot while keeping it inside the media surface", () => {
    expect(
      applyHotspotDrag(
        {
          x: 0.12,
          y: 0.22,
          width: 0.2,
          height: 0.18
        },
        "move",
        0.25,
        -0.4
      )
    ).toEqual({
      x: 0.37,
      y: 0,
      width: 0.2,
      height: 0.18,
      polygon: [
        { x: 0.37, y: 0 },
        { x: 0.57, y: 0 },
        { x: 0.57, y: 0.18 },
        { x: 0.37, y: 0.18 }
      ]
    });
  });

  it("moves only the dragged corner so hotspots can become non-rectangular", () => {
    expect(
      applyHotspotDrag(
        {
          x: 0.2,
          y: 0.15,
          width: 0.18,
          height: 0.16
        },
        "nw",
        0.25,
        0.2
      )
    ).toEqual({
      x: 0.2,
      y: 0.15,
      width: 0.18,
      height: 0.16,
      polygon: [
        { x: 0.37, y: 0.3 },
        { x: 0.38, y: 0.15 },
        { x: 0.38, y: 0.31 },
        { x: 0.2, y: 0.31 }
      ]
    });
  });

  it("moves an edge without flattening an already skewed shape", () => {
    expect(
      applyHotspotDrag(
        {
          x: 0.2,
          y: 0.15,
          width: 0.18,
          height: 0.17,
          polygon: [
            { x: 0.22, y: 0.15 },
            { x: 0.38, y: 0.19 },
            { x: 0.36, y: 0.32 },
            { x: 0.2, y: 0.29 }
          ]
        },
        "e",
        0.08,
        0
      )
    ).toEqual({
      x: 0.2,
      y: 0.15,
      width: 0.26,
      height: 0.17,
      polygon: [
        { x: 0.22, y: 0.15 },
        { x: 0.46, y: 0.19 },
        { x: 0.44, y: 0.32 },
        { x: 0.2, y: 0.29 }
      ]
    });
  });

  it("resizes from the south-east corner without letting the hotspot spill outside the surface", () => {
    expect(
      applyHotspotDrag(
        {
          x: 0.76,
          y: 0.78,
          width: 0.18,
          height: 0.15
        },
        "se",
        0.2,
        0.2
      )
    ).toEqual({
      x: 0.76,
      y: 0.78,
      width: 0.24,
      height: 0.22,
      polygon: [
        { x: 0.76, y: 0.78 },
        { x: 0.94, y: 0.78 },
        { x: 1, y: 1 },
        { x: 0.76, y: 0.93 }
      ]
    });
  });

  it("keeps axis-aligned inventory hotspots rectangular while dragging handles", () => {
    expect(
      applyHotspotDrag(
        {
          inventoryItemId: "item_lantern",
          x: 0.2,
          y: 0.15,
          width: 0.18,
          height: 0.16
        },
        "se",
        0.06,
        0.04
      )
    ).toEqual({
      inventoryItemId: "item_lantern",
      x: 0.2,
      y: 0.15,
      width: 0.24,
      height: 0.2,
      polygon: [
        { x: 0.2, y: 0.15 },
        { x: 0.44, y: 0.15 },
        { x: 0.44, y: 0.35 },
        { x: 0.2, y: 0.35 }
      ]
    });
  });

  it("keeps rotated inventory hotspots rectangular while dragging handles", () => {
    const geometry = applyHotspotDrag(
      {
        inventoryItemId: "item_lantern",
        x: 0.36,
        y: 0.36,
        width: 0.28,
        height: 0.28,
        polygon: [
          { x: 0.5, y: 0.36 },
          { x: 0.64, y: 0.5 },
          { x: 0.5, y: 0.64 },
          { x: 0.36, y: 0.5 }
        ]
      },
      "e",
      0.05,
      0,
      {
        width: 100,
        height: 100
      }
    );

    expectRectangularPolygon(geometry.polygon ?? [], { width: 100, height: 100 });
    expect(resolveHotspotRotationDegrees(geometry)).toBeCloseTo(45, 2);
  });
});

describe("applyHotspotBounds", () => {
  it("scales polygon points when the inspector changes hotspot bounds", () => {
    expect(
      applyHotspotBounds(
        {
          x: 0.2,
          y: 0.15,
          width: 0.18,
          height: 0.16,
          polygon: [
            { x: 0.37, y: 0.3 },
            { x: 0.38, y: 0.15 },
            { x: 0.38, y: 0.31 },
            { x: 0.2, y: 0.31 }
          ]
        },
        {
          x: 0.1,
          y: 0.1,
          width: 0.24,
          height: 0.24
        }
      )
    ).toEqual({
      x: 0.1,
      y: 0.1,
      width: 0.24,
      height: 0.24,
      polygon: [
        { x: 0.3267, y: 0.325 },
        { x: 0.34, y: 0.1 },
        { x: 0.34, y: 0.34 },
        { x: 0.1, y: 0.34 }
      ]
    });
  });

  it("preserves stored inventory polygons when the inspector changes bounds", () => {
    expect(
      applyHotspotBounds(
        {
          inventoryItemId: "item_lantern",
          x: 0.2,
          y: 0.15,
          width: 0.18,
          height: 0.17,
          polygon: [
            { x: 0.22, y: 0.15 },
            { x: 0.38, y: 0.19 },
            { x: 0.36, y: 0.32 },
            { x: 0.2, y: 0.29 }
          ]
        },
        {
          x: 0.1,
          y: 0.1,
          width: 0.24,
          height: 0.24
        }
      )
    ).toEqual({
      inventoryItemId: "item_lantern",
      x: 0.1,
      y: 0.1,
      width: 0.24,
      height: 0.24,
      polygon: [
        { x: 0.1267, y: 0.1 },
        { x: 0.34, y: 0.1565 },
        { x: 0.3133, y: 0.34 },
        { x: 0.1, y: 0.2976 }
      ]
    });
  });

  it("keeps rotated inventory hotspots rectangular while dragging handles on the real surface", () => {
    const geometry = applyHotspotDrag(
      {
        inventoryItemId: "item_lantern",
        x: 0.2,
        y: 0.15,
        width: 0.18,
        height: 0.17,
        polygon: [
          { x: 0.22, y: 0.15 },
          { x: 0.38, y: 0.19 },
          { x: 0.36, y: 0.32 },
          { x: 0.2, y: 0.29 }
        ]
      },
      "e",
      0.04,
      0,
      {
        width: 1600,
        height: 900
      }
    );

    expect(geometry.inventoryItemId).toBe("item_lantern");
    expect(geometry.polygon).toHaveLength(4);

    const [nw, ne, se, sw] = geometry.polygon!;
    const topEdge = Math.hypot(ne.x - nw.x, ne.y - nw.y);
    const bottomEdge = Math.hypot(se.x - sw.x, se.y - sw.y);
    const leftEdge = Math.hypot(sw.x - nw.x, sw.y - nw.y);
    const rightEdge = Math.hypot(se.x - ne.x, se.y - ne.y);

    expect(topEdge).toBeCloseTo(bottomEdge, 4);
    expect(leftEdge).toBeCloseTo(rightEdge, 4);
  });
});

describe("applyHotspotKeyboardTransform", () => {
  it("moves inventory hotspots by surface pixels and persists the resulting polygon", () => {
    expect(
      applyHotspotKeyboardTransform(
        {
          inventoryItemId: "item_lantern",
          x: 0.2,
          y: 0.2,
          width: 0.2,
          height: 0.2
        },
        {
          kind: "move",
          deltaXPx: 10,
          deltaYPx: -10
        },
        {
          width: 200,
          height: 100
        }
      )
    ).toEqual({
      inventoryItemId: "item_lantern",
      x: 0.25,
      y: 0.1,
      width: 0.2,
      height: 0.2,
      polygon: [
        { x: 0.25, y: 0.1 },
        { x: 0.45, y: 0.1 },
        { x: 0.45, y: 0.3 },
        { x: 0.25, y: 0.3 }
      ]
    });
  });

  it("resizes regular hotspots from center without flattening their polygon", () => {
    expect(
      applyHotspotKeyboardTransform(
        {
          x: 0.15,
          y: 0.2,
          width: 0.25,
          height: 0.2,
          polygon: [
            { x: 0.2, y: 0.2 },
            { x: 0.4, y: 0.2 },
            { x: 0.35, y: 0.4 },
            { x: 0.15, y: 0.4 }
          ]
        },
        {
          kind: "resize",
          axis: "x",
          deltaPx: 20
        },
        {
          width: 100,
          height: 100
        }
      )
    ).toEqual({
      x: 0.03,
      y: 0.2,
      width: 0.5,
      height: 0.2,
      polygon: [
        { x: 0.125, y: 0.2 },
        { x: 0.525, y: 0.2 },
        { x: 0.425, y: 0.4 },
        { x: 0.025, y: 0.4 }
      ]
    });
  });

  it("resizes inventory hotspots from center using surface pixels", () => {
    expect(
      applyHotspotKeyboardTransform(
        {
          inventoryItemId: "item_lantern",
          x: 0.2,
          y: 0.2,
          width: 0.2,
          height: 0.2
        },
        {
          kind: "resize",
          axis: "x",
          deltaPx: 10
        },
        {
          width: 200,
          height: 100
        }
      )
    ).toEqual({
      inventoryItemId: "item_lantern",
      x: 0.18,
      y: 0.2,
      width: 0.25,
      height: 0.2,
      polygon: [
        { x: 0.175, y: 0.2 },
        { x: 0.425, y: 0.2 },
        { x: 0.425, y: 0.4 },
        { x: 0.175, y: 0.4 }
      ]
    });
  });

  it("rotates inventory hotspots and keeps the stored polygon authoritative", () => {
    const geometry = applyHotspotKeyboardTransform(
      {
        inventoryItemId: "item_lantern",
        x: 0.4,
        y: 0.4,
        width: 0.2,
        height: 0.2
      },
      {
        kind: "rotate",
        deltaDegrees: 45
      },
      {
        width: 100,
        height: 100
      }
    );

    expect(geometry).toEqual({
      inventoryItemId: "item_lantern",
      x: 0.36,
      y: 0.36,
      width: 0.28,
      height: 0.28,
      polygon: [
        { x: 0.5, y: 0.3586 },
        { x: 0.6414, y: 0.5 },
        { x: 0.5, y: 0.6414 },
        { x: 0.3586, y: 0.5 }
      ]
    });
    expect(resolveHotspotRotationDegrees(geometry)).toBe(45);
  });

  it("rotates regular hotspots without flattening their polygon", () => {
    const geometry = applyHotspotKeyboardTransform(
      {
        x: 0.15,
        y: 0.2,
        width: 0.25,
        height: 0.2,
        polygon: [
          { x: 0.2, y: 0.2 },
          { x: 0.4, y: 0.2 },
          { x: 0.35, y: 0.4 },
          { x: 0.15, y: 0.4 }
        ]
      },
      {
        kind: "rotate",
        deltaDegrees: 90
      },
      {
        width: 100,
        height: 100
      }
    );

    expect(geometry).toEqual({
      x: 0.18,
      y: 0.18,
      width: 0.2,
      height: 0.25,
      polygon: [
        { x: 0.375, y: 0.225 },
        { x: 0.375, y: 0.425 },
        { x: 0.175, y: 0.375 },
        { x: 0.175, y: 0.175 }
      ]
    });
  });

  it("enforces the minimum hotspot size when shrinking with the keyboard", () => {
    expect(
      applyHotspotKeyboardTransform(
        {
          inventoryItemId: "item_lantern",
          x: 0.4,
          y: 0.4,
          width: 0.02,
          height: 0.2
        },
        {
          kind: "resize",
          axis: "x",
          deltaPx: -10
        },
        {
          width: 100,
          height: 100
        }
      )
    ).toEqual({
      inventoryItemId: "item_lantern",
      x: 0.41,
      y: 0.4,
      width: 0.01,
      height: 0.2,
      polygon: [
        { x: 0.405, y: 0.4 },
        { x: 0.415, y: 0.4 },
        { x: 0.415, y: 0.6 },
        { x: 0.405, y: 0.6 }
      ]
    });
  });
});

describe("applyHotspotRotationDegrees", () => {
  it("sets a regular hotspot to an absolute rendered angle", () => {
    const geometry = applyHotspotRotationDegrees(
      {
        x: 0.4,
        y: 0.4,
        width: 0.2,
        height: 0.2
      },
      30,
      {
        width: 200,
        height: 100
      }
    );

    expect(resolveRelativeHotspotFrame(geometry, { width: 200, height: 100 }).rotationDegrees).toBeCloseTo(30, 1);
    expectRectangularPolygon(geometry.polygon ?? [], { width: 200, height: 100 });
  });
});

describe("applyHotspotRotationDrag", () => {
  it("rotates regular hotspots from the pointer while preserving size and rectangularity", () => {
    const surfaceSize = { width: 100, height: 100 };
    const result = applyHotspotRotationDrag(
      {
        x: 0.4,
        y: 0.4,
        width: 0.2,
        height: 0.2
      },
      {
        startPointerXPx: 50,
        startPointerYPx: 30,
        pointerXPx: 50 + 20 * Math.cos((-45 * Math.PI) / 180),
        pointerYPx: 50 + 20 * Math.sin((-45 * Math.PI) / 180),
        shiftKey: false,
        surfaceSize
      }
    );

    expectRectangularPolygon(result.geometry.polygon ?? [], surfaceSize);
    expect(result.rotationDegrees).toBeCloseTo(45, 1);
    expect(resolveHotspotRotationDegrees(result.geometry)).toBeCloseTo(45, 1);

    const [nw, ne, se] = toPixelPoints(result.geometry.polygon ?? [], surfaceSize);
    expect(Math.hypot(ne.x - nw.x, ne.y - nw.y)).toBeCloseTo(20, 1);
    expect(Math.hypot(se.x - ne.x, se.y - ne.y)).toBeCloseTo(20, 1);
  });

  it("rotates skewed regular hotspots from the pointer without flattening their polygon", () => {
    const surfaceSize = { width: 100, height: 100 };
    const result = applyHotspotRotationDrag(
      {
        x: 0.15,
        y: 0.2,
        width: 0.25,
        height: 0.2,
        polygon: [
          { x: 0.2, y: 0.2 },
          { x: 0.4, y: 0.2 },
          { x: 0.35, y: 0.4 },
          { x: 0.15, y: 0.4 }
        ]
      },
      {
        startPointerXPx: 27.5,
        startPointerYPx: 10,
        pointerXPx: 47.5,
        pointerYPx: 30,
        shiftKey: false,
        surfaceSize
      }
    );

    expect(result.geometry).toEqual({
      x: 0.18,
      y: 0.18,
      width: 0.2,
      height: 0.25,
      polygon: [
        { x: 0.375, y: 0.225 },
        { x: 0.375, y: 0.425 },
        { x: 0.175, y: 0.375 },
        { x: 0.175, y: 0.175 }
      ]
    });
    expect(result.rotationDegrees).toBeCloseTo(90, 1);
  });

  it("snaps pointer rotation to absolute 15-degree steps while shift is held", () => {
    const angleDegrees = -53;
    const result = applyHotspotRotationDrag(
      {
        x: 0.4,
        y: 0.4,
        width: 0.2,
        height: 0.2
      },
      {
        startPointerXPx: 50,
        startPointerYPx: 30,
        pointerXPx: 50 + 20 * Math.cos((angleDegrees * Math.PI) / 180),
        pointerYPx: 50 + 20 * Math.sin((angleDegrees * Math.PI) / 180),
        shiftKey: true,
        surfaceSize: {
          width: 100,
          height: 100
        }
      }
    );

    expect(result.snapped).toBe(true);
    expect(result.rotationDegrees).toBeCloseTo(30, 1);
    expect(resolveHotspotRotationDegrees(result.geometry)).toBeCloseTo(30, 1);
  });

  it("clamps pointer rotation when the requested angle would push the hotspot outside the surface", () => {
    const result = applyHotspotRotationDrag(
      {
        x: 0,
        y: 0,
        width: 0.2,
        height: 0.2
      },
      {
        startPointerXPx: 10,
        startPointerYPx: 0,
        pointerXPx: 10 + 20 * Math.cos((-30 * Math.PI) / 180),
        pointerYPx: 10 + 20 * Math.sin((-30 * Math.PI) / 180),
        shiftKey: true,
        surfaceSize: {
          width: 100,
          height: 100
        }
      }
    );

    expect(
      resolveHotspotPolygon(result.geometry).every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
    ).toBe(true);
    expect(result.rotationDegrees).toBeLessThan(60);
  });
});

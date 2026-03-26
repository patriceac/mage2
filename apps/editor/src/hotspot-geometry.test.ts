import { describe, expect, it } from "vitest";
import { resolveHotspotRotationDegrees } from "@mage2/schema";
import { applyHotspotBounds, applyHotspotDrag, applyHotspotKeyboardTransform } from "./hotspot-geometry";

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
        { x: 0.33, y: 0.32 },
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
        { x: 0.13, y: 0.1 },
        { x: 0.34, y: 0.16 },
        { x: 0.31, y: 0.34 },
        { x: 0.1, y: 0.3 }
      ]
    });
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
        { x: 0.18, y: 0.2 },
        { x: 0.43, y: 0.2 },
        { x: 0.43, y: 0.4 },
        { x: 0.18, y: 0.4 }
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
        { x: 0.5, y: 0.36 },
        { x: 0.64, y: 0.5 },
        { x: 0.5, y: 0.64 },
        { x: 0.36, y: 0.5 }
      ]
    });
    expect(resolveHotspotRotationDegrees(geometry)).toBe(45);
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
        { x: 0.41, y: 0.4 },
        { x: 0.42, y: 0.4 },
        { x: 0.42, y: 0.6 },
        { x: 0.41, y: 0.6 }
      ]
    });
  });
});

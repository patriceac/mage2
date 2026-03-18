import { describe, expect, it } from "vitest";
import { applyHotspotBounds, applyHotspotDrag } from "./hotspot-geometry";

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
});

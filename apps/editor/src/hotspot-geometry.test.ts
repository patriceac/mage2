import { describe, expect, it } from "vitest";
import { applyHotspotDrag } from "./hotspot-geometry";

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
      height: 0.18
    });
  });

  it("resizes from the north-west handle while preserving a minimum size", () => {
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
      x: 0.37,
      y: 0.3,
      width: 0.01,
      height: 0.01
    });
  });

  it("resizes from the south-east handle without letting the hotspot spill outside the surface", () => {
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
      height: 0.22
    });
  });
});

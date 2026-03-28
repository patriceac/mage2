import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveHotspotClipPath, type Hotspot } from "@mage2/schema";
import { MediaSurface, resolveHotspotSelectionAfterDrag } from "./MediaSurface";

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

  it("preserves a hidden inspector state when dragging an unselected hotspot", () => {
    expect(resolveHotspotSelectionAfterDrag(undefined, "hotspot_item")).toBeUndefined();
    expect(resolveHotspotSelectionAfterDrag("hotspot_map", "hotspot_item")).toBe("hotspot_item");
  });
});

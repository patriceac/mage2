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

function countClipPathOccurrences(markup: string, clipPath: string): number {
  return markup.split(`clip-path:${clipPath}`).length - 1;
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

    const clipPath = resolveHotspotClipPath(hotspot);
    const markup = renderHotspotMarkup(hotspot);

    expect(countClipPathOccurrences(markup, clipPath)).toBe(2);
    expect(markup).toContain("hotspot__chrome-shape");
    expect(markup).toContain("hotspot__chrome-corner");
  });

  it("keeps inventory-backed hotspot chrome rectangular", () => {
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

    const clipPath = resolveHotspotClipPath(hotspot);
    const markup = renderHotspotMarkup(hotspot);

    expect(clipPath).toBe("polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)");
    expect(countClipPathOccurrences(markup, clipPath)).toBe(2);
    expect(markup).toContain("hotspot--inventory-item");
    expect(markup).not.toContain("hotspot__chrome-shape");
  });

  it("preserves a hidden inspector state when dragging an unselected hotspot", () => {
    expect(resolveHotspotSelectionAfterDrag(undefined, "hotspot_item")).toBeUndefined();
    expect(resolveHotspotSelectionAfterDrag("hotspot_map", "hotspot_item")).toBe("hotspot_item");
  });
});

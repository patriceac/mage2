import type { HotspotBounds } from "@mage2/schema";

export type HotspotLabelHorizontalAlignment = "start" | "center" | "end";
export type HotspotLabelVerticalPlacement = "above" | "below";

export interface HotspotLabelPlacement {
  anchorX: number;
  horizontalAlignment: HotspotLabelHorizontalAlignment;
  verticalPlacement: HotspotLabelVerticalPlacement;
  maxWidth: number;
}

const SURFACE_PADDING = 0.04;
const MAX_LABEL_WIDTH = 0.28;
const MIN_LABEL_WIDTH = 0.16;
const TOP_CLEARANCE = 0.12;
const CENTER_ALIGNMENT_CLEARANCE = MAX_LABEL_WIDTH / 2 + SURFACE_PADDING;

export function resolveHotspotLabelPlacement(bounds: HotspotBounds): HotspotLabelPlacement {
  const centerX = bounds.x + bounds.width / 2;
  let horizontalAlignment: HotspotLabelHorizontalAlignment = "center";
  let anchorX = centerX;

  if (centerX < CENTER_ALIGNMENT_CLEARANCE) {
    horizontalAlignment = "start";
    anchorX = bounds.x;
  } else if (centerX > 1 - CENTER_ALIGNMENT_CLEARANCE) {
    horizontalAlignment = "end";
    anchorX = bounds.x + bounds.width;
  }

  const verticalPlacement: HotspotLabelVerticalPlacement = bounds.y < TOP_CLEARANCE ? "below" : "above";

  return {
    anchorX: roundToPrecision(anchorX),
    horizontalAlignment,
    verticalPlacement,
    maxWidth: roundToPrecision(clamp(resolveAvailableWidth(anchorX, horizontalAlignment), MIN_LABEL_WIDTH, MAX_LABEL_WIDTH))
  };
}

function resolveAvailableWidth(anchorX: number, horizontalAlignment: HotspotLabelHorizontalAlignment): number {
  switch (horizontalAlignment) {
    case "start":
      return 1 - anchorX;
    case "end":
      return anchorX;
    default:
      return Math.min(anchorX, 1 - anchorX) * 2 - SURFACE_PADDING * 2;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundToPrecision(value: number): number {
  return Math.round(value * 10000) / 10000;
}

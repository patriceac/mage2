import type { Hotspot } from "@mage2/schema";

export type HotspotGeometry = Pick<Hotspot, "x" | "y" | "width" | "height">;
export type HotspotDragHandle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

export const MIN_HOTSPOT_SIZE = 0.01;

export function applyHotspotDrag(
  geometry: HotspotGeometry,
  handle: HotspotDragHandle,
  deltaX: number,
  deltaY: number
): HotspotGeometry {
  return roundGeometry(
    handle === "move" ? moveHotspot(geometry, deltaX, deltaY) : resizeHotspot(geometry, handle, deltaX, deltaY)
  );
}

export function geometryMatches(a: HotspotGeometry, b: HotspotGeometry): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function moveHotspot(geometry: HotspotGeometry, deltaX: number, deltaY: number): HotspotGeometry {
  return {
    x: clamp(geometry.x + deltaX, 0, 1 - geometry.width),
    y: clamp(geometry.y + deltaY, 0, 1 - geometry.height),
    width: geometry.width,
    height: geometry.height
  };
}

function resizeHotspot(
  geometry: HotspotGeometry,
  handle: Exclude<HotspotDragHandle, "move">,
  deltaX: number,
  deltaY: number
): HotspotGeometry {
  let left = geometry.x;
  let top = geometry.y;
  let right = geometry.x + geometry.width;
  let bottom = geometry.y + geometry.height;

  if (handle.includes("w")) {
    left = clamp(left + deltaX, 0, right - MIN_HOTSPOT_SIZE);
  }

  if (handle.includes("e")) {
    right = clamp(right + deltaX, left + MIN_HOTSPOT_SIZE, 1);
  }

  if (handle.includes("n")) {
    top = clamp(top + deltaY, 0, bottom - MIN_HOTSPOT_SIZE);
  }

  if (handle.includes("s")) {
    bottom = clamp(bottom + deltaY, top + MIN_HOTSPOT_SIZE, 1);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function roundGeometry(geometry: HotspotGeometry): HotspotGeometry {
  return {
    x: roundToPrecision(geometry.x),
    y: roundToPrecision(geometry.y),
    width: roundToPrecision(geometry.width),
    height: roundToPrecision(geometry.height)
  };
}

function roundToPrecision(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

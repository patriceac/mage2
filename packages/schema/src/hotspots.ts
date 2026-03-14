import type { Hotspot, HotspotPoint } from "./types";

export interface HotspotBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type HotspotShape = Pick<Hotspot, "x" | "y" | "width" | "height" | "polygon">;

export function createRectangleHotspotPolygon(bounds: HotspotBounds): HotspotPoint[] {
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height }
  ];
}

export function resolveHotspotPolygon(hotspot: HotspotShape): HotspotPoint[] {
  const polygon = hotspot.polygon;
  if (polygon?.length === 4) {
    return polygon.map((point) => ({ ...point }));
  }

  return createRectangleHotspotPolygon(hotspot);
}

export function resolveHotspotBounds(hotspot: HotspotShape): HotspotBounds {
  if (hotspot.polygon?.length === 4) {
    return getHotspotBoundsFromPolygon(hotspot.polygon);
  }

  return {
    x: hotspot.x,
    y: hotspot.y,
    width: hotspot.width,
    height: hotspot.height
  };
}

export function getHotspotBoundsFromPolygon(polygon: HotspotPoint[]): HotspotBounds {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;

  return { x, y, width, height };
}

export function resolveRelativeHotspotPolygon(hotspot: HotspotShape): HotspotPoint[] {
  const bounds = resolveHotspotBounds(hotspot);
  const polygon = resolveHotspotPolygon(hotspot);
  const width = bounds.width || 1;
  const height = bounds.height || 1;

  return polygon.map((point) => ({
    x: clamp01((point.x - bounds.x) / width),
    y: clamp01((point.y - bounds.y) / height)
  }));
}

export function resolveHotspotClipPath(hotspot: HotspotShape): string {
  return `polygon(${resolveRelativeHotspotPolygon(hotspot)
    .map((point) => `${formatPercent(point.x)} ${formatPercent(point.y)}`)
    .join(", ")})`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatPercent(value: number): string {
  return `${roundToPrecision(clamp01(value)) * 100}%`;
}

function roundToPrecision(value: number): number {
  return Math.round(value * 10000) / 10000;
}

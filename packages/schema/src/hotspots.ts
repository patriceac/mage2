import type { Hotspot, HotspotPoint } from "./types";

export interface HotspotBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HotspotContentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type HotspotShape = Pick<Hotspot, "x" | "y" | "width" | "height" | "polygon" | "inventoryItemId">;

export function createRectangleHotspotPolygon(bounds: HotspotBounds): HotspotPoint[] {
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height }
  ];
}

export function resolveHotspotPolygon(hotspot: HotspotShape): HotspotPoint[] {
  if (shouldUseStoredPolygon(hotspot)) {
    return hotspot.polygon!.map((point) => ({ ...point }));
  }

  return createRectangleHotspotPolygon(hotspot);
}

export function resolveHotspotBounds(hotspot: HotspotShape): HotspotBounds {
  if (shouldUseStoredPolygon(hotspot)) {
    return getHotspotBoundsFromPolygon(hotspot.polygon);
  }

  return {
    x: hotspot.x,
    y: hotspot.y,
    width: hotspot.width,
    height: hotspot.height
  };
}

function shouldUseStoredPolygon(hotspot: HotspotShape): hotspot is HotspotShape & { polygon: HotspotPoint[] } {
  return !hotspot.inventoryItemId && hotspot.polygon?.length === 4;
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

export function resolveRelativeHotspotContentBox(hotspot: HotspotShape): HotspotContentBox {
  const polygon = resolveRelativeHotspotPolygon(hotspot);
  const centroid = resolvePolygonCentroid(polygon);
  const horizontalSpan = getPolygonHorizontalSpanAtY(polygon, centroid.y);
  const verticalSpan = getPolygonVerticalSpanAtX(polygon, centroid.x);

  return {
    x: clamp01(centroid.x),
    y: clamp01(centroid.y),
    width: clamp01(Math.max(0.18, horizontalSpan - 0.08)),
    height: clamp01(Math.max(0.18, verticalSpan - 0.08))
  };
}

function resolvePolygonCentroid(polygon: HotspotPoint[]): HotspotPoint {
  let twiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const cross = current.x * next.y - next.x * current.y;
    twiceArea += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }

  if (Math.abs(twiceArea) < 0.000001) {
    return {
      x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
      y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length
    };
  }

  return {
    x: centroidX / (3 * twiceArea),
    y: centroidY / (3 * twiceArea)
  };
}

function getPolygonHorizontalSpanAtY(polygon: HotspotPoint[], y: number): number {
  const intersections = getLineIntersections(polygon, y, "horizontal");
  return intersections.length >= 2 ? intersections[intersections.length - 1] - intersections[0] : 1;
}

function getPolygonVerticalSpanAtX(polygon: HotspotPoint[], x: number): number {
  const intersections = getLineIntersections(polygon, x, "vertical");
  return intersections.length >= 2 ? intersections[intersections.length - 1] - intersections[0] : 1;
}

function getLineIntersections(
  polygon: HotspotPoint[],
  lineValue: number,
  axis: "horizontal" | "vertical"
): number[] {
  const intersections: number[] = [];
  const epsilon = 0.000001;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];

    if (axis === "horizontal") {
      if (Math.abs(current.y - next.y) < epsilon) {
        if (Math.abs(lineValue - current.y) < epsilon) {
          intersections.push(current.x, next.x);
        }
        continue;
      }

      const minY = Math.min(current.y, next.y);
      const maxY = Math.max(current.y, next.y);
      if (lineValue < minY || lineValue > maxY || Math.abs(lineValue - maxY) < epsilon) {
        continue;
      }

      const t = (lineValue - current.y) / (next.y - current.y);
      intersections.push(current.x + t * (next.x - current.x));
      continue;
    }

    if (Math.abs(current.x - next.x) < epsilon) {
      if (Math.abs(lineValue - current.x) < epsilon) {
        intersections.push(current.y, next.y);
      }
      continue;
    }

    const minX = Math.min(current.x, next.x);
    const maxX = Math.max(current.x, next.x);
    if (lineValue < minX || lineValue > maxX || Math.abs(lineValue - maxX) < epsilon) {
      continue;
    }

    const t = (lineValue - current.x) / (next.x - current.x);
    intersections.push(current.y + t * (next.y - current.y));
  }

  return intersections.sort((left, right) => left - right);
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

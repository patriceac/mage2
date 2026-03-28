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

export interface HotspotSurfaceSize {
  width: number;
  height: number;
}

export interface RelativeHotspotFrame {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotationDegrees: number;
  polygon: HotspotPoint[];
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
  return hotspot.polygon?.length === 4;
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

export function resolveHotspotRotationDegrees(hotspot: HotspotShape): number {
  if (!shouldUseStoredPolygon(hotspot)) {
    return 0;
  }

  const [startPoint, endPoint] = hotspot.polygon;
  if (!startPoint || !endPoint) {
    return 0;
  }

  return roundToPrecision((Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x) * 180) / Math.PI);
}

export function resolveRelativeHotspotFrame(hotspot: HotspotShape, surfaceSize: HotspotSurfaceSize): RelativeHotspotFrame {
  const bounds = resolveHotspotBounds(hotspot);
  const relativePolygon = resolveRelativeHotspotPolygon(hotspot);
  if (surfaceSize.width <= 0 || surfaceSize.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return {
      centerX: 0.5,
      centerY: 0.5,
      width: 1,
      height: 1,
      rotationDegrees: resolveHotspotRotationDegrees(hotspot),
      polygon: relativePolygon
    };
  }

  const surfacePolygon = resolveHotspotPolygon(hotspot).map((point) => ({
    x: point.x * surfaceSize.width,
    y: point.y * surfaceSize.height
  }));
  const hotspotRotationDegrees = resolveHotspotRotationDegrees(hotspot);
  const renderedRotationDegrees = roundToPrecision(
    (resolveSurfaceAngleFromHotspotRotation(hotspotRotationDegrees, surfaceSize) * 180) / Math.PI
  );
  const orientedRect = {
    ...resolveOrientedSurfaceRectAtAngle(
      surfacePolygon,
      resolveSurfaceAngleFromHotspotRotation(hotspotRotationDegrees, surfaceSize)
    ),
    angleRad: resolveSurfaceAngleFromHotspotRotation(hotspotRotationDegrees, surfaceSize)
  };
  const boundsX = bounds.x * surfaceSize.width;
  const boundsY = bounds.y * surfaceSize.height;
  const boundsWidth = bounds.width * surfaceSize.width;
  const boundsHeight = bounds.height * surfaceSize.height;
  const framePolygon = buildSurfacePolygonFromOrientedRect(orientedRect).map((point) => ({
    x: roundToPrecision((point.x - boundsX) / boundsWidth),
    y: roundToPrecision((point.y - boundsY) / boundsHeight)
  }));

  return {
    centerX: roundToPrecision((orientedRect.centerX - boundsX) / boundsWidth),
    centerY: roundToPrecision((orientedRect.centerY - boundsY) / boundsHeight),
    width: roundToPrecision(orientedRect.width / boundsWidth),
    height: roundToPrecision(orientedRect.height / boundsHeight),
    rotationDegrees: renderedRotationDegrees,
    polygon: framePolygon
  };
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

export function resolveRelativeHotspotVisualBox(
  hotspot: HotspotShape,
  surfaceSize: HotspotSurfaceSize
): HotspotContentBox {
  const frame = resolveRelativeHotspotFrame(hotspot, surfaceSize);

  return {
    x: roundToPrecision((1 - frame.width) / 2),
    y: roundToPrecision((1 - frame.height) / 2),
    width: roundToPrecision(frame.width),
    height: roundToPrecision(frame.height)
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

interface SurfacePoint {
  x: number;
  y: number;
}

interface OrientedSurfaceRect {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  angleRad: number;
}

function resolveOrientedSurfaceRect(polygon: SurfacePoint[]): OrientedSurfaceRect {
  return resolveOrientedSurfaceRectAtAngle(polygon);
}

function resolveOrientedSurfaceRectAtAngle(
  polygon: SurfacePoint[],
  preferredAngleRad?: number
): OrientedSurfaceRect {
  if (preferredAngleRad !== undefined) {
    return resolveProjectedSurfaceRect(polygon, preferredAngleRad);
  }

  const [nw, ne, se, sw] = polygon;
  const topVector = averageVectors(subtractPoints(ne, nw), subtractPoints(se, sw));
  const leftVector = averageVectors(subtractPoints(sw, nw), subtractPoints(se, ne));

  return {
    centerX: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
    centerY: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length,
    width: average([vectorLength(subtractPoints(ne, nw)), vectorLength(subtractPoints(se, sw))]),
    height: average([vectorLength(subtractPoints(sw, nw)), vectorLength(subtractPoints(se, ne))]),
    angleRad:
      vectorLength(topVector) > 0.000001 ? Math.atan2(topVector.y, topVector.x) : Math.atan2(leftVector.x, leftVector.y)
  };
}

function resolveProjectedSurfaceRect(polygon: SurfacePoint[], angleRad: number): OrientedSurfaceRect {
  const horizontal = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
  const vertical = { x: -horizontal.y, y: horizontal.x };
  const projectedX = polygon.map((point) => point.x * horizontal.x + point.y * horizontal.y);
  const projectedY = polygon.map((point) => point.x * vertical.x + point.y * vertical.y);
  const minProjectedX = Math.min(...projectedX);
  const maxProjectedX = Math.max(...projectedX);
  const minProjectedY = Math.min(...projectedY);
  const maxProjectedY = Math.max(...projectedY);
  const centerProjectedX = (minProjectedX + maxProjectedX) / 2;
  const centerProjectedY = (minProjectedY + maxProjectedY) / 2;

  return {
    centerX: horizontal.x * centerProjectedX + vertical.x * centerProjectedY,
    centerY: horizontal.y * centerProjectedX + vertical.y * centerProjectedY,
    width: maxProjectedX - minProjectedX,
    height: maxProjectedY - minProjectedY,
    angleRad
  };
}

function buildSurfacePolygonFromOrientedRect(rect: OrientedSurfaceRect): SurfacePoint[] {
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  const cos = Math.cos(rect.angleRad);
  const sin = Math.sin(rect.angleRad);
  const horizontal = { x: cos, y: sin };
  const vertical = { x: -sin, y: cos };

  return [
    {
      x: rect.centerX - horizontal.x * halfWidth - vertical.x * halfHeight,
      y: rect.centerY - horizontal.y * halfWidth - vertical.y * halfHeight
    },
    {
      x: rect.centerX + horizontal.x * halfWidth - vertical.x * halfHeight,
      y: rect.centerY + horizontal.y * halfWidth - vertical.y * halfHeight
    },
    {
      x: rect.centerX + horizontal.x * halfWidth + vertical.x * halfHeight,
      y: rect.centerY + horizontal.y * halfWidth + vertical.y * halfHeight
    },
    {
      x: rect.centerX - horizontal.x * halfWidth + vertical.x * halfHeight,
      y: rect.centerY - horizontal.y * halfWidth + vertical.y * halfHeight
    }
  ];
}

function subtractPoints(end: SurfacePoint, start: SurfacePoint): SurfacePoint {
  return {
    x: end.x - start.x,
    y: end.y - start.y
  };
}

function averageVectors(first: SurfacePoint, second: SurfacePoint): SurfacePoint {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2
  };
}

function vectorLength(vector: SurfacePoint): number {
  return Math.hypot(vector.x, vector.y);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function resolveSurfaceAngleFromHotspotRotation(rotationDegrees: number, surfaceSize: HotspotSurfaceSize): number {
  const normalizedAngleRad = degreesToRadians(rotationDegrees);
  return Math.atan2(
    Math.sin(normalizedAngleRad) * surfaceSize.height,
    Math.cos(normalizedAngleRad) * surfaceSize.width
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function formatPercent(value: number): string {
  return `${roundToPrecision(clamp01(value) * 100)}%`;
}

function roundToPrecision(value: number): number {
  return Math.round(value * 10000) / 10000;
}

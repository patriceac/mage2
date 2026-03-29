import {
  resolveHotspotBounds,
  resolveHotspotRotationDegrees,
  resolveRelativeHotspotFrame,
  resolveRelativeHotspotPolygon,
  type HotspotContentBox,
  type HotspotShape,
  type HotspotSurfaceSize
} from "./hotspots";
import type { HotspotPoint } from "./types";

const HOTSPOT_POINT_EPSILON = 0.000001;
export const HOTSPOT_VISUAL_ALPHA_THRESHOLD = 16;

export interface RelativeHotspotPoint {
  x: number;
  y: number;
}

export function resolveHotspotRelativePoint(
  surfacePoint: RelativeHotspotPoint,
  bounds: Pick<HotspotShape, "x" | "y" | "width" | "height">
): RelativeHotspotPoint | undefined {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return undefined;
  }

  const relativePoint = {
    x: (surfacePoint.x - bounds.x) / bounds.width,
    y: (surfacePoint.y - bounds.y) / bounds.height
  };

  if (relativePoint.x < 0 || relativePoint.x > 1 || relativePoint.y < 0 || relativePoint.y > 1) {
    return undefined;
  }

  return relativePoint;
}

export function isPointInHotspotPolygon(point: RelativeHotspotPoint, polygon: HotspotPoint[]): boolean {
  let inside = false;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;

    if (isPointOnHotspotSegment(point, current, next)) {
      return true;
    }

    const intersects =
      (current.y > point.y) !== (next.y > point.y) &&
      point.x < ((next.x - current.x) * (point.y - current.y)) / (next.y - current.y) + current.x;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

export function resolveHotspotVisualPixelPoint(
  point: RelativeHotspotPoint,
  visualBox: HotspotContentBox,
  rotationDegrees: number,
  imageSize: HotspotSurfaceSize
): RelativeHotspotPoint | undefined {
  if (visualBox.width <= 0 || visualBox.height <= 0 || imageSize.width <= 0 || imageSize.height <= 0) {
    return undefined;
  }

  const centerX = visualBox.x + visualBox.width / 2;
  const centerY = visualBox.y + visualBox.height / 2;
  const rotationRad = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const translatedX = point.x - centerX;
  const translatedY = point.y - centerY;
  const unrotatedX = translatedX * cos + translatedY * sin + centerX;
  const unrotatedY = -translatedX * sin + translatedY * cos + centerY;
  const normalizedImageX = (unrotatedX - visualBox.x) / visualBox.width;
  const normalizedImageY = (unrotatedY - visualBox.y) / visualBox.height;

  if (
    normalizedImageX < 0 ||
    normalizedImageX > 1 ||
    normalizedImageY < 0 ||
    normalizedImageY > 1
  ) {
    return undefined;
  }

  return {
    x: Math.min(Math.floor(normalizedImageX * imageSize.width), imageSize.width - 1),
    y: Math.min(Math.floor(normalizedImageY * imageSize.height), imageSize.height - 1)
  };
}

export function isHotspotVisualPixelOpaque(
  point: RelativeHotspotPoint,
  visualBox: HotspotContentBox,
  rotationDegrees: number,
  imageSize: HotspotSurfaceSize,
  alphaValues: ArrayLike<number>,
  alphaThreshold = HOTSPOT_VISUAL_ALPHA_THRESHOLD
): boolean {
  const pixelPoint = resolveHotspotVisualPixelPoint(point, visualBox, rotationDegrees, imageSize);
  if (!pixelPoint) {
    return false;
  }

  const alphaIndex = pixelPoint.y * imageSize.width + pixelPoint.x;
  return (alphaValues[alphaIndex] ?? 0) >= alphaThreshold;
}

export function isHotspotSurfacePointInteractive({
  hotspot,
  surfacePoint,
  surfaceSize,
  visualBox,
  alphaValues,
  imageSize,
  rotationDegrees = resolveHotspotRotationDegrees(hotspot),
  alphaThreshold = HOTSPOT_VISUAL_ALPHA_THRESHOLD
}: {
  hotspot: HotspotShape;
  surfacePoint: RelativeHotspotPoint;
  surfaceSize: HotspotSurfaceSize;
  visualBox?: HotspotContentBox;
  alphaValues?: ArrayLike<number>;
  imageSize?: HotspotSurfaceSize;
  rotationDegrees?: number;
  alphaThreshold?: number;
}): boolean {
  const bounds = resolveHotspotBounds(hotspot);
  const relativePoint = resolveHotspotRelativePoint(surfacePoint, bounds);
  if (!relativePoint) {
    return false;
  }

  const polygon =
    hotspot.inventoryItemId && surfaceSize
      ? resolveRelativeHotspotFrame(hotspot, surfaceSize).polygon
      : resolveRelativeHotspotPolygon(hotspot);
  if (!isPointInHotspotPolygon(relativePoint, polygon)) {
    return false;
  }

  if (!visualBox || !imageSize || !alphaValues) {
    return true;
  }

  return isHotspotVisualPixelOpaque(
    relativePoint,
    visualBox,
    rotationDegrees,
    imageSize,
    alphaValues,
    alphaThreshold
  );
}

function isPointOnHotspotSegment(point: RelativeHotspotPoint, start: HotspotPoint, end: HotspotPoint): boolean {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > HOTSPOT_POINT_EPSILON) {
    return false;
  }

  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  if (dot < -HOTSPOT_POINT_EPSILON) {
    return false;
  }

  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= lengthSquared + HOTSPOT_POINT_EPSILON;
}

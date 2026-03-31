import {
  createRectangleHotspotPolygon,
  getHotspotBoundsFromPolygon,
  resolveHotspotPolygon,
  type Hotspot,
  type HotspotBounds,
  type HotspotPoint
} from "@mage2/schema";

export type HotspotGeometry = Pick<Hotspot, "x" | "y" | "width" | "height" | "polygon" | "inventoryItemId">;
export type HotspotDragHandle = "move" | "rotate" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
export type HotspotResizeHandle = Exclude<HotspotDragHandle, "move" | "rotate">;
export interface HotspotSurfaceSize {
  width: number;
  height: number;
}

export interface HotspotRotationDrag {
  startPointerXPx: number;
  startPointerYPx: number;
  pointerXPx: number;
  pointerYPx: number;
  shiftKey: boolean;
  surfaceSize: HotspotSurfaceSize;
}

export interface HotspotRotationDragResult {
  geometry: HotspotGeometry;
  rotationDegrees: number;
  snapped: boolean;
}

export type HotspotKeyboardTransform =
  | {
      kind: "move";
      deltaXPx: number;
      deltaYPx: number;
    }
  | {
      kind: "resize";
      axis: "x" | "y";
      deltaPx: number;
    }
  | {
      kind: "rotate";
      deltaDegrees: number;
    };

interface HotspotPixelPoint {
  x: number;
  y: number;
}

interface OrientedHotspotRect {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  angleRad: number;
}

export const MIN_HOTSPOT_SIZE = 0.01;
export const HOTSPOT_COORDINATE_DECIMALS = 2;
export const HOTSPOT_POLYGON_COORDINATE_DECIMALS = 4;
const HOTSPOT_COORDINATE_PRECISION_FACTOR = 10 ** HOTSPOT_COORDINATE_DECIMALS;
const HOTSPOT_POLYGON_PRECISION_FACTOR = 10 ** HOTSPOT_POLYGON_COORDINATE_DECIMALS;
const HOTSPOT_GEOMETRY_EPSILON = 0.000001;

export function applyHotspotDrag(
  geometry: HotspotGeometry,
  handle: Exclude<HotspotDragHandle, "rotate">,
  deltaX: number,
  deltaY: number,
  surfaceSize?: HotspotSurfaceSize
): HotspotGeometry {
  if (handle === "move") {
    return roundGeometry(moveHotspot(geometry, deltaX, deltaY));
  }

  if (geometry.inventoryItemId) {
    return roundGeometry(resizeInventoryHotspot(geometry, handle, deltaX, deltaY, surfaceSize));
  }

  if (handle === "n" || handle === "s" || handle === "e" || handle === "w") {
    return roundGeometry(moveHotspotEdge(geometry, handle, deltaX, deltaY));
  }

  return roundGeometry(moveHotspotCorner(geometry, handle, deltaX, deltaY));
}

export function applyHotspotBounds(geometry: HotspotGeometry, bounds: HotspotBounds): HotspotGeometry {
  const currentPolygon = resolveHotspotPolygon(geometry);
  const currentBounds = getHotspotBoundsFromPolygon(currentPolygon);
  const nextBounds = normalizeBounds(bounds);
  const relativePolygon = currentPolygon.map((point) => ({
    x: currentBounds.width <= 0 ? 0.5 : (point.x - currentBounds.x) / currentBounds.width,
    y: currentBounds.height <= 0 ? 0.5 : (point.y - currentBounds.y) / currentBounds.height
  }));

  const nextPolygon = relativePolygon.map((point) => ({
    x: nextBounds.x + point.x * nextBounds.width,
    y: nextBounds.y + point.y * nextBounds.height
  }));

  return roundGeometry(withPolygon(nextPolygon, geometry));
}

export function applyHotspotKeyboardTransform(
  geometry: HotspotGeometry,
  transform: HotspotKeyboardTransform,
  surfaceSize: HotspotSurfaceSize
): HotspotGeometry {
  if (surfaceSize.width <= 0 || surfaceSize.height <= 0) {
    return roundGeometry(geometry);
  }

  const polygon = resolveHotspotPolygon(geometry);
  const pixelPolygon = polygon.map((point) => toSurfacePixelPoint(point, surfaceSize));
  const nextPixelPolygon = resolveNextKeyboardTransformPolygon(pixelPolygon, transform, surfaceSize);

  if (pixelPolygonsMatch(pixelPolygon, nextPixelPolygon)) {
    return roundGeometry(geometry);
  }

  return roundGeometry(withPolygon(nextPixelPolygon.map((point) => toNormalizedHotspotPoint(point, surfaceSize)), geometry));
}

export function applyHotspotRotationDegrees(
  geometry: HotspotGeometry,
  rotationDegrees: number,
  surfaceSize: HotspotSurfaceSize
): HotspotGeometry {
  const workingSurfaceSize = resolveWorkingSurfaceSize(surfaceSize);
  const currentRotationDegrees = roundRotationDegrees(
    resolveSurfaceAngleFromNormalizedPolygon(resolveHotspotPolygon(geometry), workingSurfaceSize)
  );
  const deltaDegrees = radiansToDegrees(
    normalizeAngleRadians(degreesToRadians(rotationDegrees) - degreesToRadians(currentRotationDegrees))
  );

  return applyHotspotKeyboardTransform(
    geometry,
    {
      kind: "rotate",
      deltaDegrees
    },
    workingSurfaceSize
  );
}

export function applyHotspotRotationDrag(
  geometry: HotspotGeometry,
  drag: HotspotRotationDrag
): HotspotRotationDragResult {
  const workingSurfaceSize = resolveWorkingSurfaceSize(drag.surfaceSize);
  const polygon = resolveHotspotPolygon(geometry);
  const pixelPolygon = polygon.map((point) => toSurfacePixelPoint(point, workingSurfaceSize));
  const nextPixelPolygon = rotatePolygonByPointerDrag(pixelPolygon, drag, workingSurfaceSize);
  const nextGeometry = pixelPolygonsMatch(pixelPolygon, nextPixelPolygon)
    ? roundGeometry(geometry)
    : roundGeometry(
        withPolygon(nextPixelPolygon.map((point) => toNormalizedHotspotPoint(point, workingSurfaceSize)), geometry)
      );
  const nextPolygon = nextGeometry.polygon ?? resolveHotspotPolygon(nextGeometry);

  return {
    geometry: nextGeometry,
    rotationDegrees: roundRotationDegrees(resolveSurfaceAngleFromNormalizedPolygon(nextPolygon, workingSurfaceSize)),
    snapped: drag.shiftKey
  };
}

export function geometryMatches(a: HotspotGeometry, b: HotspotGeometry): boolean {
  if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height) {
    return false;
  }

  const aPolygon = a.polygon ?? [];
  const bPolygon = b.polygon ?? [];
  if (aPolygon.length !== bPolygon.length) {
    return false;
  }

  return aPolygon.every(
    (point, index) => point.x === bPolygon[index]?.x && point.y === bPolygon[index]?.y
  );
}

function moveHotspot(geometry: HotspotGeometry, deltaX: number, deltaY: number): HotspotGeometry {
  const polygon = resolveHotspotPolygon(geometry);
  const bounds = getHotspotBoundsFromPolygon(polygon);
  const shiftX = clamp(deltaX, -bounds.x, 1 - (bounds.x + bounds.width));
  const shiftY = clamp(deltaY, -bounds.y, 1 - (bounds.y + bounds.height));

  return withPolygon(
    polygon.map((point) => ({
      x: point.x + shiftX,
      y: point.y + shiftY
    })),
    geometry
  );
}

function shouldResizeInventoryHotspotAsRectangle(geometry: HotspotGeometry): boolean {
  if (!geometry.inventoryItemId) {
    return false;
  }

  return isAxisAlignedRectanglePolygon(resolveHotspotPolygon(geometry));
}

function resizeInventoryHotspot(
  geometry: HotspotGeometry,
  handle: HotspotResizeHandle,
  deltaX: number,
  deltaY: number,
  surfaceSize?: HotspotSurfaceSize
): HotspotGeometry {
  if (shouldResizeInventoryHotspotAsRectangle(geometry)) {
    return resizeRectangularHotspot(geometry, handle, deltaX, deltaY);
  }

  const workingSurfaceSize = resolveWorkingSurfaceSize(surfaceSize);
  const polygon = resolveHotspotPolygon(geometry);
  const pixelPolygon = polygon.map((point) => toSurfacePixelPoint(point, workingSurfaceSize));
  const nextPixelPolygon = resizeInventoryPolygonByPixels(
    pixelPolygon,
    handle,
    deltaX * workingSurfaceSize.width,
    deltaY * workingSurfaceSize.height,
    workingSurfaceSize,
    resolveSurfaceAngleFromNormalizedPolygon(polygon, workingSurfaceSize)
  );

  if (pixelPolygonsMatch(pixelPolygon, nextPixelPolygon)) {
    return geometry;
  }

  return withPolygon(nextPixelPolygon.map((point) => toNormalizedHotspotPoint(point, workingSurfaceSize)), geometry);
}

function resizeRectangularHotspot(
  geometry: HotspotGeometry,
  handle: HotspotResizeHandle,
  deltaX: number,
  deltaY: number
): HotspotGeometry {
  const left = geometry.x;
  const top = geometry.y;
  const right = geometry.x + geometry.width;
  const bottom = geometry.y + geometry.height;

  const nextLeft = handle.includes("w") ? clamp(left + deltaX, 0, right - MIN_HOTSPOT_SIZE) : left;
  const nextRight = handle.includes("e") ? clamp(right + deltaX, nextLeft + MIN_HOTSPOT_SIZE, 1) : right;
  const nextTop = handle.includes("n") ? clamp(top + deltaY, 0, bottom - MIN_HOTSPOT_SIZE) : top;
  const nextBottom = handle.includes("s") ? clamp(bottom + deltaY, nextTop + MIN_HOTSPOT_SIZE, 1) : bottom;

  return withBounds(
    {
      x: nextLeft,
      y: nextTop,
      width: nextRight - nextLeft,
      height: nextBottom - nextTop
    },
    geometry
  );
}

function resizeInventoryPolygonByPixels(
  polygon: HotspotPixelPoint[],
  handle: HotspotResizeHandle,
  deltaXPx: number,
  deltaYPx: number,
  surfaceSize: HotspotSurfaceSize,
  preferredAngleRad: number
): HotspotPixelPoint[] {
  const rect = resolveOrientedHotspotRect(polygon, preferredAngleRad);
  const horizontal = { x: Math.cos(rect.angleRad), y: Math.sin(rect.angleRad) };
  const vertical = { x: -horizontal.y, y: horizontal.x };
  const localDeltaX = dotProduct({ x: deltaXPx, y: deltaYPx }, horizontal);
  const localDeltaY = dotProduct({ x: deltaXPx, y: deltaYPx }, vertical);
  const minimumWidthPx = surfaceSize.width * MIN_HOTSPOT_SIZE;
  const minimumHeightPx = surfaceSize.height * MIN_HOTSPOT_SIZE;

  const buildPolygon = (scale: number) => {
    let left = -rect.width / 2;
    let right = rect.width / 2;
    let top = -rect.height / 2;
    let bottom = rect.height / 2;

    if (handle.includes("w")) {
      left += localDeltaX * scale;
    }
    if (handle.includes("e")) {
      right += localDeltaX * scale;
    }
    if (handle.includes("n")) {
      top += localDeltaY * scale;
    }
    if (handle.includes("s")) {
      bottom += localDeltaY * scale;
    }

    const width = right - left;
    const height = bottom - top;
    if (width < minimumWidthPx || height < minimumHeightPx) {
      return undefined;
    }

    return buildPolygonFromOrientedRect({
      ...rect,
      centerX: rect.centerX + horizontal.x * ((left + right) / 2) + vertical.x * ((top + bottom) / 2),
      centerY: rect.centerY + horizontal.y * ((left + right) / 2) + vertical.y * ((top + bottom) / 2),
      width,
      height
    });
  };

  const candidate = buildPolygon(1);
  if (candidate && polygonFitsSurface(candidate, surfaceSize)) {
    return candidate;
  }

  let low = 0;
  let high = 1;

  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    const midPolygon = buildPolygon(mid);
    if (midPolygon && polygonFitsSurface(midPolygon, surfaceSize)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const nextPolygon = buildPolygon(low);
  return nextPolygon && low > HOTSPOT_GEOMETRY_EPSILON ? nextPolygon : polygon;
}

function moveHotspotEdge(
  geometry: HotspotGeometry,
  handle: Extract<HotspotResizeHandle, "n" | "s" | "e" | "w">,
  deltaX: number,
  deltaY: number
): HotspotGeometry {
  const polygon = resolveHotspotPolygon(geometry);
  const nextPolygon = polygon.map((point) => ({ ...point }));

  switch (handle) {
    case "n": {
      const topYs = [polygon[0].y, polygon[1].y];
      const bottomYs = [polygon[2].y, polygon[3].y];
      const shiftY = clamp(
        deltaY,
        -Math.min(...topYs),
        Math.min(...bottomYs) - MIN_HOTSPOT_SIZE - Math.max(...topYs)
      );
      nextPolygon[0].y = polygon[0].y + shiftY;
      nextPolygon[1].y = polygon[1].y + shiftY;
      break;
    }
    case "s": {
      const topYs = [polygon[0].y, polygon[1].y];
      const bottomYs = [polygon[2].y, polygon[3].y];
      const shiftY = clamp(
        deltaY,
        Math.max(...topYs) + MIN_HOTSPOT_SIZE - Math.min(...bottomYs),
        1 - Math.max(...bottomYs)
      );
      nextPolygon[2].y = polygon[2].y + shiftY;
      nextPolygon[3].y = polygon[3].y + shiftY;
      break;
    }
    case "e": {
      const leftXs = [polygon[0].x, polygon[3].x];
      const rightXs = [polygon[1].x, polygon[2].x];
      const shiftX = clamp(
        deltaX,
        Math.max(...leftXs) + MIN_HOTSPOT_SIZE - Math.min(...rightXs),
        1 - Math.max(...rightXs)
      );
      nextPolygon[1].x = polygon[1].x + shiftX;
      nextPolygon[2].x = polygon[2].x + shiftX;
      break;
    }
    case "w": {
      const leftXs = [polygon[0].x, polygon[3].x];
      const rightXs = [polygon[1].x, polygon[2].x];
      const shiftX = clamp(
        deltaX,
        -Math.min(...leftXs),
        Math.min(...rightXs) - MIN_HOTSPOT_SIZE - Math.max(...leftXs)
      );
      nextPolygon[0].x = polygon[0].x + shiftX;
      nextPolygon[3].x = polygon[3].x + shiftX;
      break;
    }
  }

  return withPolygon(nextPolygon, geometry);
}

function moveHotspotCorner(
  geometry: HotspotGeometry,
  handle: Extract<HotspotResizeHandle, "nw" | "ne" | "sw" | "se">,
  deltaX: number,
  deltaY: number
): HotspotGeometry {
  const polygon = resolveHotspotPolygon(geometry);
  const nextPolygon = polygon.map((point) => ({ ...point }));

  switch (handle) {
    case "nw":
      nextPolygon[0] = {
        x: clamp(polygon[0].x + deltaX, 0, Math.min(polygon[1].x, polygon[2].x) - MIN_HOTSPOT_SIZE),
        y: clamp(polygon[0].y + deltaY, 0, Math.min(polygon[2].y, polygon[3].y) - MIN_HOTSPOT_SIZE)
      };
      break;
    case "ne":
      nextPolygon[1] = {
        x: clamp(polygon[1].x + deltaX, Math.max(polygon[0].x, polygon[3].x) + MIN_HOTSPOT_SIZE, 1),
        y: clamp(polygon[1].y + deltaY, 0, Math.min(polygon[2].y, polygon[3].y) - MIN_HOTSPOT_SIZE)
      };
      break;
    case "se":
      nextPolygon[2] = {
        x: clamp(polygon[2].x + deltaX, Math.max(polygon[0].x, polygon[3].x) + MIN_HOTSPOT_SIZE, 1),
        y: clamp(polygon[2].y + deltaY, Math.max(polygon[0].y, polygon[1].y) + MIN_HOTSPOT_SIZE, 1)
      };
      break;
    case "sw":
      nextPolygon[3] = {
        x: clamp(polygon[3].x + deltaX, 0, Math.min(polygon[1].x, polygon[2].x) - MIN_HOTSPOT_SIZE),
        y: clamp(polygon[3].y + deltaY, Math.max(polygon[0].y, polygon[1].y) + MIN_HOTSPOT_SIZE, 1)
      };
      break;
  }

  return withPolygon(nextPolygon, geometry);
}

function resolveNextKeyboardTransformPolygon(
  polygon: HotspotPixelPoint[],
  transform: HotspotKeyboardTransform,
  surfaceSize: HotspotSurfaceSize
): HotspotPixelPoint[] {
  switch (transform.kind) {
    case "move":
      return translatePolygonByPixels(polygon, transform.deltaXPx, transform.deltaYPx, surfaceSize);
    case "resize":
      return resizePolygonByPixels(polygon, transform.axis, transform.deltaPx, surfaceSize);
    case "rotate":
      return rotatePolygonByDegrees(polygon, transform.deltaDegrees, surfaceSize);
  }
}

function translatePolygonByPixels(
  polygon: HotspotPixelPoint[],
  deltaXPx: number,
  deltaYPx: number,
  surfaceSize: HotspotSurfaceSize
): HotspotPixelPoint[] {
  const bounds = getPixelBoundsFromPolygon(polygon);
  const shiftX = clamp(deltaXPx, -bounds.x, surfaceSize.width - (bounds.x + bounds.width));
  const shiftY = clamp(deltaYPx, -bounds.y, surfaceSize.height - (bounds.y + bounds.height));

  return polygon.map((point) => ({
    x: point.x + shiftX,
    y: point.y + shiftY
  }));
}

function resizePolygonByPixels(
  polygon: HotspotPixelPoint[],
  axis: "x" | "y",
  deltaPx: number,
  surfaceSize: HotspotSurfaceSize
): HotspotPixelPoint[] {
  const rect = resolveOrientedHotspotRect(polygon);
  const currentSizePx = axis === "x" ? rect.width : rect.height;
  const minimumSizePx =
    axis === "x" ? surfaceSize.width * MIN_HOTSPOT_SIZE : surfaceSize.height * MIN_HOTSPOT_SIZE;
  const minimumDeltaPx = minimumSizePx - currentSizePx;
  const clampedDeltaPx = Math.max(deltaPx, minimumDeltaPx);
  if (currentSizePx <= HOTSPOT_GEOMETRY_EPSILON) {
    return polygon;
  }

  const targetScale = (currentSizePx + clampedDeltaPx) / currentSizePx;
  const buildPolygon = (scale: number) =>
    transformPolygonInLocalSpace(
      polygon,
      rect.centerX,
      rect.centerY,
      rect.angleRad,
      axis === "x" ? 1 + (targetScale - 1) * scale : 1,
      axis === "y" ? 1 + (targetScale - 1) * scale : 1
    );

  if (clampedDeltaPx <= 0) {
    return buildPolygon(1);
  }

  return clampKeyboardPolygonTransform(polygon, buildPolygon, surfaceSize);
}

function rotatePolygonByDegrees(
  polygon: HotspotPixelPoint[],
  deltaDegrees: number,
  surfaceSize: HotspotSurfaceSize
): HotspotPixelPoint[] {
  const rect = resolveOrientedHotspotRect(polygon);
  const buildPolygon = (scale: number) =>
    rotatePolygonAroundCenter(polygon, rect.centerX, rect.centerY, degreesToRadians(deltaDegrees * scale));

  return clampKeyboardPolygonTransform(polygon, buildPolygon, surfaceSize);
}

function rotatePolygonByPointerDrag(
  polygon: HotspotPixelPoint[],
  drag: HotspotRotationDrag,
  surfaceSize: HotspotSurfaceSize
): HotspotPixelPoint[] {
  const rect = resolveOrientedHotspotRect(polygon);
  const startPointerAngle = resolvePointerAngleFromCenter(
    drag.startPointerXPx,
    drag.startPointerYPx,
    rect.centerX,
    rect.centerY,
    rect.angleRad
  );
  const currentPointerAngle = resolvePointerAngleFromCenter(
    drag.pointerXPx,
    drag.pointerYPx,
    rect.centerX,
    rect.centerY,
    startPointerAngle
  );
  const freeformTargetAngle = normalizeAngleRadians(rect.angleRad + normalizeAngleRadians(currentPointerAngle - startPointerAngle));
  const targetAngle = drag.shiftKey
    ? snapAngleRadians(freeformTargetAngle, degreesToRadians(15))
    : freeformTargetAngle;
  const deltaAngle = normalizeAngleRadians(targetAngle - rect.angleRad);
  const buildPolygon = (scale: number) => rotatePolygonAroundCenter(polygon, rect.centerX, rect.centerY, deltaAngle * scale);

  return clampKeyboardPolygonTransform(polygon, buildPolygon, surfaceSize);
}

function clampKeyboardPolygonTransform(
  polygon: HotspotPixelPoint[],
  buildPolygon: (scale: number) => HotspotPixelPoint[],
  surfaceSize: HotspotSurfaceSize
): HotspotPixelPoint[] {
  const candidate = buildPolygon(1);
  if (polygonFitsSurface(candidate, surfaceSize)) {
    return candidate;
  }

  let low = 0;
  let high = 1;

  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    const midPolygon = buildPolygon(mid);
    if (polygonFitsSurface(midPolygon, surfaceSize)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return low > HOTSPOT_GEOMETRY_EPSILON ? buildPolygon(low) : polygon;
}

function polygonFitsSurface(polygon: HotspotPixelPoint[], surfaceSize: HotspotSurfaceSize): boolean {
  return polygon.every(
    (point) =>
      point.x >= -HOTSPOT_GEOMETRY_EPSILON &&
      point.x <= surfaceSize.width + HOTSPOT_GEOMETRY_EPSILON &&
      point.y >= -HOTSPOT_GEOMETRY_EPSILON &&
      point.y <= surfaceSize.height + HOTSPOT_GEOMETRY_EPSILON
  );
}

function resolveOrientedHotspotRect(polygon: HotspotPixelPoint[], preferredAngleRad?: number): OrientedHotspotRect {
  if (preferredAngleRad !== undefined) {
    return resolveProjectedOrientedHotspotRect(polygon, preferredAngleRad);
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
      vectorLength(topVector) > HOTSPOT_GEOMETRY_EPSILON ? Math.atan2(topVector.y, topVector.x) : Math.atan2(leftVector.x, leftVector.y)
  };
}

function resolveProjectedOrientedHotspotRect(
  polygon: HotspotPixelPoint[],
  angleRad: number
): OrientedHotspotRect {
  const horizontal = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
  const vertical = { x: -horizontal.y, y: horizontal.x };
  const projectedX = polygon.map((point) => dotProduct(point, horizontal));
  const projectedY = polygon.map((point) => dotProduct(point, vertical));
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

function transformPolygonInLocalSpace(
  polygon: HotspotPixelPoint[],
  centerX: number,
  centerY: number,
  angleRad: number,
  scaleX: number,
  scaleY: number
): HotspotPixelPoint[] {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const horizontal = { x: cos, y: sin };
  const vertical = { x: -sin, y: cos };

  return polygon.map((point) => {
    const offset = {
      x: point.x - centerX,
      y: point.y - centerY
    };
    const localX = dotProduct(offset, horizontal) * scaleX;
    const localY = dotProduct(offset, vertical) * scaleY;

    return {
      x: centerX + horizontal.x * localX + vertical.x * localY,
      y: centerY + horizontal.y * localX + vertical.y * localY
    };
  });
}

function rotatePolygonAroundCenter(
  polygon: HotspotPixelPoint[],
  centerX: number,
  centerY: number,
  deltaAngleRad: number
): HotspotPixelPoint[] {
  if (Math.abs(deltaAngleRad) <= HOTSPOT_GEOMETRY_EPSILON) {
    return polygon;
  }

  const cos = Math.cos(deltaAngleRad);
  const sin = Math.sin(deltaAngleRad);

  return polygon.map((point) => {
    const offsetX = point.x - centerX;
    const offsetY = point.y - centerY;

    return {
      x: centerX + offsetX * cos - offsetY * sin,
      y: centerY + offsetX * sin + offsetY * cos
    };
  });
}

function buildPolygonFromOrientedRect(rect: OrientedHotspotRect): HotspotPixelPoint[] {
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

function subtractPoints(end: HotspotPixelPoint, start: HotspotPixelPoint) {
  return {
    x: end.x - start.x,
    y: end.y - start.y
  };
}

function averageVectors(first: HotspotPixelPoint, second: HotspotPixelPoint): HotspotPixelPoint {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2
  };
}

function dotProduct(first: HotspotPixelPoint, second: HotspotPixelPoint): number {
  return first.x * second.x + first.y * second.y;
}

function vectorLength(vector: HotspotPixelPoint): number {
  return Math.hypot(vector.x, vector.y);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveWorkingSurfaceSize(surfaceSize?: HotspotSurfaceSize): HotspotSurfaceSize {
  if (!surfaceSize || surfaceSize.width <= 0 || surfaceSize.height <= 0) {
    return {
      width: 1,
      height: 1
    };
  }

  return surfaceSize;
}

function resolveSurfaceAngleFromNormalizedPolygon(polygon: HotspotPoint[], surfaceSize: HotspotSurfaceSize): number {
  const [startPoint, endPoint] = polygon;
  if (!startPoint || !endPoint) {
    return 0;
  }

  return Math.atan2(
    (endPoint.y - startPoint.y) * surfaceSize.height,
    (endPoint.x - startPoint.x) * surfaceSize.width
  );
}

function getPixelBoundsFromPolygon(polygon: HotspotPixelPoint[]) {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y
  };
}

function pixelPolygonsMatch(left: HotspotPixelPoint[], right: HotspotPixelPoint[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(
    (point, index) =>
      Math.abs(point.x - right[index]!.x) < HOTSPOT_GEOMETRY_EPSILON &&
      Math.abs(point.y - right[index]!.y) < HOTSPOT_GEOMETRY_EPSILON
  );
}

function isAxisAlignedRectanglePolygon(polygon: HotspotPoint[]): boolean {
  if (polygon.length !== 4) {
    return false;
  }

  const rectangle = createRectangleHotspotPolygon(getHotspotBoundsFromPolygon(polygon));
  return polygon.every(
    (point, index) =>
      Math.abs(point.x - rectangle[index]!.x) < HOTSPOT_GEOMETRY_EPSILON &&
      Math.abs(point.y - rectangle[index]!.y) < HOTSPOT_GEOMETRY_EPSILON
  );
}

function withPolygon(polygon: HotspotPoint[], geometry?: HotspotGeometry): HotspotGeometry {
  const bounds = getHotspotBoundsFromPolygon(polygon);
  return {
    ...(geometry?.inventoryItemId ? { inventoryItemId: geometry.inventoryItemId } : {}),
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    polygon
  };
}

function withBounds(bounds: HotspotBounds, geometry?: HotspotGeometry): HotspotGeometry {
  const normalizedBounds = normalizeBounds(bounds);
  return {
    ...(geometry?.inventoryItemId ? { inventoryItemId: geometry.inventoryItemId } : {}),
    x: normalizedBounds.x,
    y: normalizedBounds.y,
    width: normalizedBounds.width,
    height: normalizedBounds.height,
    polygon: createRectangleHotspotPolygon(normalizedBounds)
  };
}

function normalizeBounds(bounds: HotspotBounds): HotspotBounds {
  const width = clamp(bounds.width, MIN_HOTSPOT_SIZE, 1);
  const height = clamp(bounds.height, MIN_HOTSPOT_SIZE, 1);
  const x = clamp(bounds.x, 0, 1 - width);
  const y = clamp(bounds.y, 0, 1 - height);

  return {
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y)
  };
}

function roundGeometry(geometry: HotspotGeometry): HotspotGeometry {
  return {
    ...(geometry.inventoryItemId ? { inventoryItemId: geometry.inventoryItemId } : {}),
    x: roundHotspotCoordinate(geometry.x),
    y: roundHotspotCoordinate(geometry.y),
    width: roundHotspotCoordinate(geometry.width),
    height: roundHotspotCoordinate(geometry.height),
    polygon: geometry.polygon?.map((point) => ({
      x: roundHotspotPolygonCoordinate(point.x),
      y: roundHotspotPolygonCoordinate(point.y)
    }))
  };
}

function toSurfacePixelPoint(point: HotspotPoint, surfaceSize: HotspotSurfaceSize): HotspotPixelPoint {
  return {
    x: point.x * surfaceSize.width,
    y: point.y * surfaceSize.height
  };
}

function toNormalizedHotspotPoint(point: HotspotPixelPoint, surfaceSize: HotspotSurfaceSize): HotspotPoint {
  return {
    x: point.x / surfaceSize.width,
    y: point.y / surfaceSize.height
  };
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function normalizeAngleRadians(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function snapAngleRadians(value: number, increment: number): number {
  if (increment <= HOTSPOT_GEOMETRY_EPSILON) {
    return normalizeAngleRadians(value);
  }

  return normalizeAngleRadians(Math.round(value / increment) * increment);
}

function resolvePointerAngleFromCenter(
  pointerX: number,
  pointerY: number,
  centerX: number,
  centerY: number,
  fallbackAngleRad: number
): number {
  const dx = pointerX - centerX;
  const dy = pointerY - centerY;
  if (Math.hypot(dx, dy) <= HOTSPOT_GEOMETRY_EPSILON) {
    return fallbackAngleRad;
  }

  return Math.atan2(dy, dx);
}

function roundRotationDegrees(angleRad: number): number {
  return Math.round(radiansToDegrees(normalizeAngleRadians(angleRad)) * 100) / 100;
}

export function roundHotspotCoordinate(value: number): number {
  return Math.round(value * HOTSPOT_COORDINATE_PRECISION_FACTOR) / HOTSPOT_COORDINATE_PRECISION_FACTOR;
}

function roundHotspotPolygonCoordinate(value: number): number {
  return Math.round(value * HOTSPOT_POLYGON_PRECISION_FACTOR) / HOTSPOT_POLYGON_PRECISION_FACTOR;
}

export function formatHotspotCoordinate(value: number): string {
  return roundHotspotCoordinate(value).toFixed(HOTSPOT_COORDINATE_DECIMALS);
}

export function formatHotspotRotationDegrees(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Object.is(rounded, -0) ? 0 : rounded}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

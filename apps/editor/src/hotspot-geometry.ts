import {
  getHotspotBoundsFromPolygon,
  resolveHotspotPolygon,
  type Hotspot,
  type HotspotBounds,
  type HotspotPoint
} from "@mage2/schema";

export type HotspotGeometry = Pick<Hotspot, "x" | "y" | "width" | "height" | "polygon">;
export type HotspotDragHandle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

export const MIN_HOTSPOT_SIZE = 0.01;
export const HOTSPOT_COORDINATE_DECIMALS = 2;
const HOTSPOT_COORDINATE_PRECISION_FACTOR = 10 ** HOTSPOT_COORDINATE_DECIMALS;

export function applyHotspotDrag(
  geometry: HotspotGeometry,
  handle: HotspotDragHandle,
  deltaX: number,
  deltaY: number
): HotspotGeometry {
  if (handle === "move") {
    return roundGeometry(moveHotspot(geometry, deltaX, deltaY));
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

  return roundGeometry(withPolygon(nextPolygon));
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
    }))
  );
}

function moveHotspotEdge(
  geometry: HotspotGeometry,
  handle: Extract<HotspotDragHandle, "n" | "s" | "e" | "w">,
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

  return withPolygon(nextPolygon);
}

function moveHotspotCorner(
  geometry: HotspotGeometry,
  handle: Extract<HotspotDragHandle, "nw" | "ne" | "sw" | "se">,
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

  return withPolygon(nextPolygon);
}

function withPolygon(polygon: HotspotPoint[]): HotspotGeometry {
  const bounds = getHotspotBoundsFromPolygon(polygon);
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    polygon
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
    x: roundHotspotCoordinate(geometry.x),
    y: roundHotspotCoordinate(geometry.y),
    width: roundHotspotCoordinate(geometry.width),
    height: roundHotspotCoordinate(geometry.height),
    polygon: geometry.polygon?.map((point) => ({
      x: roundHotspotCoordinate(point.x),
      y: roundHotspotCoordinate(point.y)
    }))
  };
}

export function roundHotspotCoordinate(value: number): number {
  return Math.round(value * HOTSPOT_COORDINATE_PRECISION_FACTOR) / HOTSPOT_COORDINATE_PRECISION_FACTOR;
}

export function formatHotspotCoordinate(value: number): string {
  return roundHotspotCoordinate(value).toFixed(HOTSPOT_COORDINATE_DECIMALS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

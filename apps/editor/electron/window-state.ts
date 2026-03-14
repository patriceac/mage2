import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WindowState = {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
};

const WINDOW_STATE_FILENAME = "window-state.json";

export const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1600,
  height: 980,
  isMaximized: false
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeWindowState(value: unknown): WindowState | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  if (!isFiniteNumber(candidate.width) || candidate.width <= 0 || !isFiniteNumber(candidate.height) || candidate.height <= 0) {
    return undefined;
  }

  return {
    width: candidate.width,
    height: candidate.height,
    x: isFiniteNumber(candidate.x) ? candidate.x : undefined,
    y: isFiniteNumber(candidate.y) ? candidate.y : undefined,
    isMaximized: candidate.isMaximized === true
  };
}

export function resolveWindowState(state: WindowState | undefined, workAreas: WindowBounds[]): WindowState {
  const resolvedState = state ?? DEFAULT_WINDOW_STATE;
  if (resolvedState.x === undefined || resolvedState.y === undefined) {
    return { ...resolvedState };
  }

  const resolvedBounds: WindowBounds = {
    x: resolvedState.x,
    y: resolvedState.y,
    width: resolvedState.width,
    height: resolvedState.height
  };

  if (workAreas.some((workArea) => rectanglesOverlap(resolvedBounds, workArea))) {
    return { ...resolvedState };
  }

  return {
    width: resolvedState.width,
    height: resolvedState.height,
    isMaximized: resolvedState.isMaximized
  };
}

export function createWindowState(bounds: WindowBounds, isMaximized: boolean): WindowState {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized
  };
}

export function loadWindowState(userDataPath: string): WindowState | undefined {
  try {
    const serialized = readFileSync(getWindowStatePath(userDataPath), "utf8");
    return normalizeWindowState(JSON.parse(serialized));
  } catch {
    return undefined;
  }
}

export function saveWindowState(userDataPath: string, state: WindowState): void {
  const filePath = getWindowStatePath(userDataPath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(state), "utf8");
}

export function getWindowStatePath(userDataPath: string): string {
  return path.join(userDataPath, WINDOW_STATE_FILENAME);
}

function rectanglesOverlap(a: WindowBounds, b: WindowBounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

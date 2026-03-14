import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWindowState,
  DEFAULT_WINDOW_STATE,
  loadWindowState,
  normalizeWindowState,
  resolveWindowState,
  saveWindowState
} from "./window-state";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) =>
      rm(tempDir, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("window state", () => {
  it("normalizes persisted state with optional position", () => {
    expect(
      normalizeWindowState({
        x: 120,
        y: 80,
        width: 1440,
        height: 900,
        isMaximized: true
      })
    ).toEqual({
      x: 120,
      y: 80,
      width: 1440,
      height: 900,
      isMaximized: true
    });
  });

  it("falls back when persisted state is invalid", () => {
    expect(normalizeWindowState({ width: 0, height: 900, isMaximized: true })).toBeUndefined();
  });

  it("drops off-screen coordinates but keeps size and maximize preference", () => {
    expect(
      resolveWindowState(
        {
          x: 4000,
          y: 2500,
          width: 1600,
          height: 980,
          isMaximized: true
        },
        [{ x: 0, y: 0, width: 1920, height: 1080 }]
      )
    ).toEqual({
      width: 1600,
      height: 980,
      isMaximized: true
    });
  });

  it("preserves visible coordinates", () => {
    expect(
      resolveWindowState(
        {
          x: 200,
          y: 120,
          width: 1600,
          height: 980,
          isMaximized: false
        },
        [{ x: 0, y: 0, width: 1920, height: 1080 }]
      )
    ).toEqual({
      x: 200,
      y: 120,
      width: 1600,
      height: 980,
      isMaximized: false
    });
  });

  it("writes and reloads persisted state", async () => {
    const userDataPath = await mkdtemp(path.join(os.tmpdir(), "mage2-window-state-"));
    tempDirs.push(userDataPath);

    const state = createWindowState(
      {
        x: 75,
        y: 50,
        width: DEFAULT_WINDOW_STATE.width,
        height: DEFAULT_WINDOW_STATE.height
      },
      true
    );

    saveWindowState(userDataPath, state);

    expect(loadWindowState(userDataPath)).toEqual(state);
  });
});

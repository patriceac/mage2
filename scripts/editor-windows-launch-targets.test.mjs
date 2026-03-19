import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isCanonicalWindowsLaunchShortcut,
  normalizeWindowsPath,
  resolveWindowsLaunchShortcutAction
} from "./editor-windows-launch-targets.mjs";

const canonicalExePath = "D:\\Disk\\Dev\\MAGE2\\output\\packaging\\editor-win\\dist\\win-unpacked\\MAGE2 Editor.exe";

describe("normalizeWindowsPath", () => {
  it("normalizes casing and separators", () => {
    expect(normalizeWindowsPath("d:/Disk/Dev/MAGE2/output/packaging/editor-win/dist/win-unpacked/MAGE2 Editor.exe")).toBe(
      normalizeWindowsPath(canonicalExePath)
    );
  });
});

describe("isCanonicalWindowsLaunchShortcut", () => {
  it("accepts a shortcut pointing at the canonical packaged exe", () => {
    expect(
      isCanonicalWindowsLaunchShortcut(
        {
          exists: true,
          targetPath: "d:/disk/dev/mage2/output/packaging/editor-win/dist/win-unpacked/MAGE2 Editor.exe",
          arguments: "",
          workingDirectory: path.win32.dirname(canonicalExePath)
        },
        canonicalExePath
      )
    ).toBe(true);
  });

  it("rejects non-canonical shortcut targets such as installed-app", () => {
    expect(
      isCanonicalWindowsLaunchShortcut(
        {
          exists: true,
          targetPath: "D:\\Disk\\Dev\\MAGE2\\output\\packaging\\editor-win\\installed-app\\MAGE2 Editor.exe",
          arguments: "",
          workingDirectory: "D:\\Disk\\Dev\\MAGE2\\output\\packaging\\editor-win\\installed-app"
        },
        canonicalExePath
      )
    ).toBe(false);
  });
});

describe("resolveWindowsLaunchShortcutAction", () => {
  it("creates missing required shortcuts", () => {
    expect(
      resolveWindowsLaunchShortcutAction(
        { createIfMissing: true },
        { exists: false },
        canonicalExePath
      )
    ).toBe("create");
  });

  it("skips missing optional shortcuts", () => {
    expect(
      resolveWindowsLaunchShortcutAction(
        { createIfMissing: false },
        { exists: false },
        canonicalExePath
      )
    ).toBe("skip");
  });

  it("repairs existing non-canonical shortcuts", () => {
    expect(
      resolveWindowsLaunchShortcutAction(
        { createIfMissing: true },
        {
          exists: true,
          targetPath: "D:\\Disk\\Dev\\MAGE2\\output\\packaging\\editor-win\\installed-app\\MAGE2 Editor.exe",
          arguments: "",
          workingDirectory: "D:\\Disk\\Dev\\MAGE2\\output\\packaging\\editor-win\\installed-app"
        },
        canonicalExePath
      )
    ).toBe("repair");
  });

  it("validates existing canonical shortcuts", () => {
    expect(
      resolveWindowsLaunchShortcutAction(
        { createIfMissing: true },
        {
          exists: true,
          targetPath: canonicalExePath,
          arguments: "",
          workingDirectory: path.win32.dirname(canonicalExePath)
        },
        canonicalExePath
      )
    ).toBe("validate");
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { addInventoryItem } from "./project-helpers";
import {
  PlaytestPanel,
  resolveInventoryCursorPreviewFrameStyle,
  resolvePlaytestInventorySummary,
  resolvePlaytestVisualDurationMs,
  resolveStoredPlaytestLocale
} from "./PlaytestPanel";
import { useEditorStore } from "./store";

describe("resolvePlaytestInventorySummary", () => {
  it("prefers localized inventory names over plain item names", () => {
    const project = createDefaultProjectBundle("Playtest inventory");
    const item = addInventoryItem(project);
    item.name = "Lantern";
    project.strings.byLocale[project.manifest.defaultLanguage][item.textId] = "Localized Lantern";

    expect(
      resolvePlaytestInventorySummary([item], project.strings.byLocale[project.manifest.defaultLanguage])
    ).toBe("Localized Lantern");
  });

  it("returns Empty when there are no inventory items", () => {
    expect(resolvePlaytestInventorySummary([], {})).toBe("Empty");
  });
});

describe("resolveStoredPlaytestLocale", () => {
  it("uses the stored locale when it is supported", () => {
    expect(resolveStoredPlaytestLocale("fr", ["en", "fr"], "en")).toBe("fr");
  });

  it("falls back to the default locale when the stored locale is missing or unsupported", () => {
    expect(resolveStoredPlaytestLocale(null, ["en", "fr"], "en")).toBe("en");
    expect(resolveStoredPlaytestLocale("de", ["en", "fr"], "en")).toBe("en");
  });
});

describe("resolvePlaytestVisualDurationMs", () => {
  it("uses observed video metadata over stored asset duration", () => {
    expect(resolvePlaytestVisualDurationMs("video", 30000, 5500)).toBe(5500);
  });

  it("falls back to stored asset duration before video metadata loads", () => {
    expect(resolvePlaytestVisualDurationMs("video", 5500, undefined)).toBe(5500);
  });

  it("ignores observed video metadata for still image scenes", () => {
    expect(resolvePlaytestVisualDurationMs("image", 30000, 5500)).toBe(30000);
  });
});

describe("resolveInventoryCursorPreviewFrameStyle", () => {
  it("centers the selected inventory art on the cursor without a frame", () => {
    const style = resolveInventoryCursorPreviewFrameStyle({ x: 120, y: 80 });

    expect(style).toMatchObject({
      left: "120px",
      top: "80px",
      transform: "translate(-50%, -50%)",
      width: "48px",
      height: "48px",
      pointerEvents: "none"
    });
    expect(style).not.toHaveProperty("border");
    expect(style).not.toHaveProperty("background");
    expect(style).not.toHaveProperty("padding");
  });
});

describe("PlaytestPanel toolbar", () => {
  it("renders shared field wrappers so playtest controls can align on one row", () => {
    const project = createDefaultProjectBundle("Playtest toolbar");
    useEditorStore.setState({
      activeTab: "playtest",
      playtestLocale: project.manifest.defaultLanguage
    });

    const markup = renderToStaticMarkup(React.createElement(PlaytestPanel, { project, onExit: () => undefined }));

    expect(markup).toContain("playtest-panel__toolbar-field--playhead");
    expect(markup).toContain("playtest-panel__toolbar-field--locale");
    expect(markup).toContain("playtest-panel__toolbar-button");
    expect(markup).toContain("playtest-panel__toolbar-toggle");
    expect(markup).toContain("playtest-panel__toolbar-field--action");
    expect(markup).toContain("playtest-panel__toolbar-field--session");
    expect(markup).toContain("playtest-panel__toolbar-field--toggle");
    expect(markup).toContain("Reset Run");
    expect(markup).toContain("Back to Editor");
  });
});

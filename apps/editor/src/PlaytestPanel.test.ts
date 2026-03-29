import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { addInventoryItem } from "./project-helpers";
import { PlaytestPanel, resolvePlaytestInventorySummary, resolveStoredPlaytestLocale } from "./PlaytestPanel";
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

describe("PlaytestPanel toolbar", () => {
  it("renders shared field wrappers so playtest controls can align on one row", () => {
    const project = createDefaultProjectBundle("Playtest toolbar");
    useEditorStore.setState({
      activeTab: "playtest",
      playtestLocale: project.manifest.defaultLanguage
    });

    const markup = renderToStaticMarkup(React.createElement(PlaytestPanel, { project }));

    expect(markup).toContain("playtest-panel__toolbar-field--playhead");
    expect(markup).toContain("playtest-panel__toolbar-field--locale");
    expect(markup).toContain("playtest-panel__toolbar-button");
    expect(markup).toContain("playtest-panel__toolbar-toggle");
    expect(markup).toContain("playtest-panel__toolbar-field--action");
    expect(markup).toContain("playtest-panel__toolbar-field--toggle");
  });
});

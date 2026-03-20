import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import { useEditorStore } from "../store";
import { LocalizationPanel, normalizeLocaleInput } from "./LocalizationPanel";

describe("LocalizationPanel area filter", () => {
  it("keeps scenes in strings and moves subtitles into their own section", () => {
    const project = createDefaultProjectBundle("Localization filter");

    useEditorStore.setState({
      activeTab: "localization",
      localizationSection: "overview",
      localizationLocale: project.manifest.defaultLanguage,
      selectedLocationId: project.locations.items[0]?.id,
      selectedSceneId: project.scenes.items[0]?.id,
      selectedHotspotId: undefined,
      selectedDialogueId: undefined,
      selectedDialogueNodeId: undefined,
      selectedInventoryItemId: undefined,
      selectedTextId: undefined
    });

    const markup = renderToStaticMarkup(
      React.createElement(
        DialogProvider,
        null,
        React.createElement(LocalizationPanel, {
          project,
          mutateProject: () => {},
          setSavedProject: () => {},
          setStatusMessage: () => {},
          setBusyLabel: () => {}
        })
      )
    );

    expect(markup).toContain('value="all"');
    expect(markup).toContain(">All areas</option>");
    expect(markup).toContain('value="scenes"');
    expect(markup).toContain(">Scenes</option>");
    expect(markup).toContain('value="dialogue"');
    expect(markup).toContain(">Dialogue</option>");
    expect(markup).toContain('value="inventory"');
    expect(markup).toContain(">Inventory</option>");
    expect(markup).not.toContain('value="subtitles"');
    expect(markup).toContain(">Subtitles</h3>");
  });
});

describe("normalizeLocaleInput", () => {
  it("trims whitespace and normalizes underscores to hyphens", () => {
    expect(normalizeLocaleInput("  pt_BR  ")).toBe("pt-BR");
  });

  it("returns undefined for empty values", () => {
    expect(normalizeLocaleInput("   ")).toBeUndefined();
    expect(normalizeLocaleInput(undefined)).toBeUndefined();
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import { useEditorStore } from "../store";
import { LocalizationPanel, normalizeLocaleInput } from "./LocalizationPanel";

describe("LocalizationPanel area filter", () => {
  it("shows all, dialogue, inventory, and subtitles options without reintroducing scenes", () => {
    const project = createDefaultProjectBundle("Localization filter");

    useEditorStore.setState({
      activeTab: "localization",
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
        React.createElement(LocalizationPanel, { project, mutateProject: () => {} })
      )
    );

    expect(markup).toContain('value="all"');
    expect(markup).toContain(">All areas</option>");
    expect(markup).toContain('value="dialogue"');
    expect(markup).toContain(">Dialogue</option>");
    expect(markup).toContain('value="inventory"');
    expect(markup).toContain(">Inventory</option>");
    expect(markup).toContain('value="subtitles"');
    expect(markup).toContain(">Subtitles</option>");
    expect(markup).not.toContain('value="scenes"');
    expect(markup).not.toContain(">Scenes</option>");
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

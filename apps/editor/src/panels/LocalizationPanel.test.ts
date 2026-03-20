import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import type { LocalizationSection } from "../store";
import { LocalizationPanel, normalizeLocaleInput } from "./LocalizationPanel";

const mockedStore = vi.hoisted(() => {
  const noop = () => {};

  return {
    state: {
      activeTab: "localization",
      localizationSection: "overview" as LocalizationSection,
      localizationLocale: "en",
      selectedLocationId: undefined as string | undefined,
      selectedSceneId: undefined as string | undefined,
      selectedHotspotId: undefined as string | undefined,
      selectedDialogueId: undefined as string | undefined,
      selectedDialogueNodeId: undefined as string | undefined,
      selectedInventoryItemId: undefined as string | undefined,
      selectedAssetId: undefined as string | undefined,
      selectedTextId: undefined as string | undefined,
      setLocalizationLocale: noop,
      setLocalizationSection: noop,
      setSelectedTextId: noop,
      setSelectedAssetId: noop,
      setActiveTab: noop,
      setSelectedLocationId: noop,
      setSelectedSceneId: noop,
      setSelectedHotspotId: noop,
      setSelectedDialogueId: noop,
      setSelectedDialogueNodeId: noop,
      setSelectedInventoryItemId: noop
    }
  };
});

vi.mock("../store", () => {
  const useEditorStore = ((selector: (state: typeof mockedStore.state) => unknown) =>
    selector(mockedStore.state)) as typeof import("../store").useEditorStore;

  useEditorStore.setState = (partial) => {
    mockedStore.state = {
      ...mockedStore.state,
      ...(typeof partial === "function" ? partial(mockedStore.state as never) : partial)
    };
  };

  useEditorStore.getState = () => mockedStore.state as never;

  return { useEditorStore };
});

function renderLocalizationPanel(section: LocalizationSection) {
  const project = createDefaultProjectBundle("Localization filter");

  mockedStore.state = {
    ...mockedStore.state,
    activeTab: "localization",
    localizationSection: section,
    localizationLocale: project.manifest.defaultLanguage,
    selectedLocationId: project.locations.items[0]?.id,
    selectedSceneId: project.scenes.items[0]?.id,
    selectedHotspotId: undefined,
    selectedDialogueId: undefined,
    selectedDialogueNodeId: undefined,
    selectedInventoryItemId: undefined,
    selectedTextId: undefined
  };

  return renderToStaticMarkup(
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
}

describe("LocalizationPanel internal subtabs", () => {
  it("renders only the overview workspace when overview is active", () => {
    const markup = renderLocalizationPanel("overview");

    expect(markup).toContain(">Localization</h3>");
    expect(markup).toContain(">Overview</h3>");
    expect(markup).toContain("Review Strings");
    expect(markup).toContain("Review Subtitles");
    expect(markup).toContain("Review Media");
    expect(markup).toContain("Add Locale");
    expect(markup).toContain("Set Default");
    expect(markup).toContain("Remove Locale");
    expect(markup).toContain('aria-selected="true"');
    expect(markup).not.toContain('placeholder="Search text id, value, usage, or owner"');
    expect(markup).not.toContain(">Usage</h3>");
    expect(markup).not.toContain("No subtitle cues yet. Add subtitle tracks in Scenes to localize them here.");
  });

  it("keeps scenes in strings and moves subtitles into their own workspace", () => {
    const markup = renderLocalizationPanel("strings");

    expect(markup).toContain('id="localization-tab-strings"');
    expect(markup).toContain('aria-controls="localization-panel-strings"');
    expect(markup).toContain('id="localization-panel-strings"');
    expect(markup).toContain(">Strings</h3>");
    expect(markup).toContain('placeholder="Search text id, value, usage, or owner"');
    expect(markup).toContain(">Usage</h3>");
    expect(markup).toContain('value="all"');
    expect(markup).toContain(">All areas</option>");
    expect(markup).toContain('value="scenes"');
    expect(markup).toContain(">Scenes</option>");
    expect(markup).toContain('value="dialogue"');
    expect(markup).toContain(">Dialogue</option>");
    expect(markup).toContain('value="inventory"');
    expect(markup).toContain(">Inventory</option>");
    expect(markup).not.toContain('value="subtitles"');
    expect(markup).not.toContain("Review Strings");
    expect(markup).not.toContain("No subtitle cues yet. Add subtitle tracks in Scenes to localize them here.");
  });

  it("renders only subtitle content when subtitles is active", () => {
    const markup = renderLocalizationPanel("subtitles");

    expect(markup).toContain('id="localization-tab-subtitles"');
    expect(markup).toContain('aria-controls="localization-panel-subtitles"');
    expect(markup).toContain('id="localization-panel-subtitles"');
    expect(markup).toContain(">Subtitles</h3>");
    expect(markup).toContain("No subtitle cues yet. Add subtitle tracks in Scenes to localize them here.");
    expect(markup).not.toContain('placeholder="Search text id, value, usage, or owner"');
    expect(markup).not.toContain(">Usage</h3>");
    expect(markup).not.toContain("Review Strings");
  });

  it("renders only media content when media is active", () => {
    const markup = renderLocalizationPanel("media");

    expect(markup).toContain('id="localization-tab-media"');
    expect(markup).toContain('aria-controls="localization-panel-media"');
    expect(markup).toContain('id="localization-panel-media"');
    expect(markup).toContain(">Media</h3>");
    expect(markup).toContain("No assets yet. Import logical assets in Assets before localizing media variants here.");
    expect(markup).not.toContain('placeholder="Search text id, value, usage, or owner"');
    expect(markup).not.toContain(">Usage</h3>");
    expect(markup).not.toContain("Review Strings");
  });
});

describe("LocalizationPanel shared header", () => {
  it("keeps locale controls visible above the active workspace", () => {
    const markup = renderLocalizationPanel("strings");

    expect(markup).toContain(">Locale</span>");
    expect(markup).toContain("Add Locale");
    expect(markup).toContain("Set Default");
    expect(markup).toContain("Remove Locale");
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

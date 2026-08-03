import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import { addProjectLocale } from "../localized-project";
import type { LocalizationSection } from "../store";
import { LocalizationPanel, normalizeLocaleInput } from "./LocalizationPanel";

const localizationPanelSource = readFileSync(new URL("./LocalizationPanel.tsx", import.meta.url), "utf8");

const mockedStore = vi.hoisted(() => {
  const noop = () => {};
  const noopLocale = (_locale?: string) => {};
  const noopSection = (_section: LocalizationSection) => {};

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
      setLocalizationLocale: noopLocale,
      setLocalizationSection: noopSection,
      setSelectedTextId: noop,
      setSelectedAssetId: noop,
      setActiveTab: noop,
      setSelectedLocationId: noop,
      setSelectedSceneId: noop,
      setSelectedHotspotId: noop,
      setSelectedDialogueId: noop,
      setSelectedDialogueNodeId: noop,
      setSelectedInventoryItemId: noop
    } as any
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

function extractSourceSection(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Missing source marker: ${startMarker}`);
  }

  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) {
    throw new Error(`Missing source marker: ${endMarker}`);
  }

  return source.slice(start, end);
}

function renderLocalizationPanel(
  section: LocalizationSection,
  configureProject?: (project: ReturnType<typeof createDefaultProjectBundle>) => void,
  locale?: string
) {
  const project = createDefaultProjectBundle("Localization filter");
  configureProject?.(project);

  mockedStore.state = {
    ...mockedStore.state,
    activeTab: "localization",
    localizationSection: section,
    localizationLocale: locale ?? project.manifest.defaultLanguage,
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
  it("renders the work queue workspace when overview is active", () => {
    const markup = renderLocalizationPanel("overview");

    expect(markup).toContain("Locale Health");
    expect(markup).toContain("Work Queue");
    expect(markup).toContain("Source authored");
    expect(markup).toContain("Source strings missing");
    expect(markup).toContain("Empty source strings");
    expect(markup).toContain("Media missing");
    expect(markup).toContain("Usage and Coverage");
    expect(markup).not.toContain("View Overview");
    expect(markup).not.toContain("View Work Queue");
    expect(markup).not.toContain("Review Strings");
    expect(markup).not.toContain("Review Media");
    expect(markup).toContain("Add Locale");
    expect(markup).toContain("Set as Default");
    expect(markup).toContain("Remove Locale");
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('placeholder="Search text id, asset, or source text..."');
    expect(markup).toContain("Usage Locations");
    expect(markup).toContain("Source text");
    expect(markup).not.toContain("localization-translation-arrow");
  });

  it("keeps project text surfaces in strings", () => {
    const markup = renderLocalizationPanel("strings");

    expect(markup).toContain('id="localization-tab-strings"');
    expect(markup).toContain('aria-controls="localization-panel-strings"');
    expect(markup).toContain('id="localization-panel-strings"');
    expect(markup).toContain(">Strings</button>");
    expect(markup).toContain('placeholder="Search text id, asset, or source text..."');
    expect(markup).toContain("Usage Locations");
    expect(markup).toContain('value="all"');
    expect(markup).toContain(">All Areas</option>");
    expect(markup).toContain('value="scenes"');
    expect(markup).toContain(">Scenes</option>");
    expect(markup).toContain('value="dialogue"');
    expect(markup).toContain(">Dialogue</option>");
    expect(markup).toContain('value="inventory"');
    expect(markup).toContain(">Inventory</option>");
    expect(markup).not.toContain("View Overview");
    expect(markup).not.toContain("View Work Queue");
    expect(markup).not.toContain("Review Strings");
    expect(markup).not.toContain("Review Media");
  });

  it("renders only media content when media is active", () => {
    const markup = renderLocalizationPanel("media");

    expect(markup).toContain('id="localization-tab-media"');
    expect(markup).toContain('aria-controls="localization-panel-media"');
    expect(markup).toContain('id="localization-panel-media"');
    expect(markup).toContain(">Media</button>");
    expect(markup).toContain("No background assets yet. Upload scene media from Scenes before localizing it here.");
    expect(markup).toContain('placeholder="Search media assets..."');
    expect(markup).toContain("Usage and Coverage");
    expect(markup).not.toContain("View Overview");
    expect(markup).not.toContain("View Work Queue");
    expect(markup).not.toContain("Review Strings");
    expect(markup).not.toContain("Review Media");
  });

  it("can open the scene-audio media library when a scene-audio asset is selected", () => {
    const markup = renderLocalizationPanel("media", (project) => {
      project.assets.assets.push({
        id: "asset_scene_audio",
        kind: "audio",
        name: "ambience.mp3",
        category: "sceneAudio",
        variants: {
          en: {
            sourcePath: "D:\\project\\assets\\ambience.mp3",
            importedAt: new Date().toISOString()
          }
        }
      });
      mockedStore.state.selectedAssetId = "asset_scene_audio";
    });

    expect(markup).toContain(">Scene Audio</option>");
    expect(markup).toContain("Scene Audio / audio");
  });

  it("keeps localization media comparison previews contained instead of cropped", () => {
    const mediaDetailPanelBlock = extractSourceSection(
      localizationPanelSource,
      "function MediaDetailPanel",
      "function CoverageRail"
    );

    expect(mediaDetailPanelBlock.match(/fit="contain"/g)).toHaveLength(2);
  });

  it("shows inherited target copies as incomplete workflow items", () => {
    const markup = renderLocalizationPanel(
      "strings",
      (project) => addProjectLocale(project, "fr"),
      "fr"
    );

    expect(markup).toContain("Translation complete");
    expect(markup).toContain("Inherited copies");
    expect(markup).toContain("Inherited (1)");
    expect(markup).toContain("Only Translated and Reviewed count toward completion");
    expect(markup).toContain("Mark Translated");
    expect(markup).toContain("Mark Reviewed");
    expect(markup).not.toContain(">Ready<");
    expect(markup).toContain("Complete: 0 (0%)");
  });

  it("uses one default media surface and compares source to target only for non-default locales", () => {
    const configureProject = (project: ReturnType<typeof createDefaultProjectBundle>) => {
      addProjectLocale(project, "fr");
      project.assets.assets.push({
        id: "asset_background",
        kind: "image",
        name: "background.png",
        category: "background",
        variants: {
          en: {
            sourcePath: "D:\\project\\assets\\background.png",
            importedAt: new Date().toISOString()
          }
        }
      });
    };

    const defaultMarkup = renderLocalizationPanel("media", configureProject);
    const targetMarkup = renderLocalizationPanel("media", configureProject, "fr");

    expect(defaultMarkup).toContain("Default media (en)");
    expect(defaultMarkup).not.toContain("Target (en)");
    expect(targetMarkup).toContain("Source (en)");
    expect(targetMarkup).toContain("Target (fr)");
    expect(targetMarkup).toContain("fr variant missing");
  });

  it("confirms before changing the project default locale", () => {
    const handler = extractSourceSection(
      localizationPanelSource,
      "async function handleSetDefaultLocale",
      "async function handleImportVariant"
    );

    expect(handler).toContain("dialogs.confirm");
    expect(handler).toContain("Change Project Default");
    expect(handler.indexOf("if (!confirmed)")).toBeLessThan(handler.indexOf("setProjectDefaultLocale"));
  });

  it("renders the locale-health separator without mojibake", () => {
    const markup = renderLocalizationPanel("overview");

    expect(markup).toContain("Locale Health - en (English)");
    expect(markup).not.toContain("â€”");
  });
});

describe("LocalizationPanel shared header", () => {
  it("keeps locale controls visible above the active workspace", () => {
    const markup = renderLocalizationPanel("strings");

    expect(markup).toContain(">Editing locale</span>");
    expect(markup).toContain("localization-locale-select__icon");
    expect(markup).not.toContain("localization-locale-select__flag");
    expect(markup).toContain("Project default");
    expect(markup).toContain("Project default locale: en");
    expect(markup).toContain("Add Locale");
    expect(markup).toContain("Set as Default");
    expect(markup).toContain("Remove Locale");
    expect(markup).toContain("button-danger-quiet");
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

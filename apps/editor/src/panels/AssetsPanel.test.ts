import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, type Asset } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import { useEditorStore } from "../store";
import {
  AssetsPanel,
  resolveAssetCardPreviewPresentation,
  resolveAssetLibraryKeyboardSelection
} from "./AssetsPanel";

describe("AssetsPanel workbench UI", () => {
  it("renders the asset workbench without localization proxy copy", () => {
    const project = createDefaultProjectBundle("Assets");
    const asset: Asset = {
      id: "asset_previewless",
      kind: "image",
      name: "poster.png",
      variants: {
        en: {
          sourcePath: "D:\\project\\assets\\poster.png",
          importedAt: "2026-03-20T00:00:00.000Z"
        }
      }
    };
    project.assets.assets = [asset];

    useEditorStore.setState({
      activeTab: "assets",
      selectedAssetId: asset.id
    });

    const markup = renderToStaticMarkup(
      React.createElement(
        DialogProvider,
        null,
        React.createElement(AssetsPanel, {
          project,
          setSavedProject: () => {},
          setStatusMessage: () => {},
          setBusyLabel: () => {}
        })
      )
    );

    expect(markup).not.toContain("Generate Missing");
    expect(markup).not.toContain("Generate Proxy");
    expect(markup).not.toContain("proxy missing");
    expect(markup).not.toContain("Preview unavailable");
    expect(markup).not.toContain("Present:");
    expect(markup).not.toContain("Manage locale-specific variants");
    expect(markup).toContain("assets-workbench-page");
    expect(markup).toContain("Search assets...");
    expect(markup).toContain("Import Asset");
    expect(markup).toContain("Asset Library");
    expect(markup).toContain("Usage and Safety");
    expect(markup).toContain("Localized Variants");
    expect(markup).toContain("Loading preview...");
    expect(markup).toContain("No project references found.");
    expect(markup).toContain("Safe to delete");
    expect(markup).toContain("assets-footer-locale-icon");
    expect(markup).not.toContain("assets-footer-locale-dot");
    expect(markup).toContain("Project default locale: en");
    expect(markup).toContain("Project default</span>");
    expect(markup).not.toContain("DEFAULT");
    const rowDeleteButtonStart = markup.indexOf("assets-delete-status");
    const rowDeleteButtonEnd = markup.indexOf("</button>", rowDeleteButtonStart);
    const rowDeleteButtonMarkup = markup.slice(rowDeleteButtonStart, rowDeleteButtonEnd);
    expect(rowDeleteButtonMarkup).toContain('aria-label="Delete poster.png"');
    expect(rowDeleteButtonMarkup).toContain("M9 7V5h6v2");
    expect(rowDeleteButtonMarkup).not.toContain("M12 2.7");
  });

  it("lists scene-audio as a first-class asset library category", () => {
    const project = createDefaultProjectBundle("Scene audio assets");
    const asset: Asset = {
      id: "asset_ambience",
      kind: "audio",
      name: "ambience.mp3",
      category: "sceneAudio",
      variants: {
        en: {
          sourcePath: "D:\\project\\assets\\ambience.mp3",
          importedAt: "2026-03-20T00:00:00.000Z"
        }
      }
    };
    project.assets.assets = [asset];

    useEditorStore.setState({
      activeTab: "assets",
      selectedAssetId: asset.id
    });

    const markup = renderToStaticMarkup(
      React.createElement(
        DialogProvider,
        null,
        React.createElement(AssetsPanel, {
          project,
          setSavedProject: () => {},
          setStatusMessage: () => {},
          setBusyLabel: () => {}
        })
      )
    );

    expect(markup).toContain(">Scene Audio</button>");
    expect(markup).toContain("Scene Audio (1)");
    expect(markup).toContain("assets-chip--sceneAudio");
    expect(markup).not.toContain("Create new inventory assets from Inventory.");
    expect(markup).toContain("ambience.mp3");
    expect(markup).toContain("Review Missing Variants");
  });

  it("uses the fixed-frame contain preview treatment for inventory assets", () => {
    expect(resolveAssetCardPreviewPresentation("inventory")).toEqual({
      fit: "contain"
    });
    expect(resolveAssetCardPreviewPresentation("background")).toEqual({
      fit: "cover"
    });
    expect(resolveAssetCardPreviewPresentation("sceneAudio")).toEqual({
      fit: "cover"
    });
  });

  it("moves keyboard selection across asset library sections", () => {
    const groupedAssetIds = [
      ["asset_background_a", "asset_background_b"],
      ["asset_scene_audio"],
      ["asset_inventory_a", "asset_inventory_b", "asset_inventory_c"]
    ];

    expect(resolveAssetLibraryKeyboardSelection("ArrowDown", groupedAssetIds, "asset_background_b")).toBe("asset_scene_audio");
    expect(resolveAssetLibraryKeyboardSelection("ArrowDown", groupedAssetIds, "asset_scene_audio")).toBe("asset_inventory_a");
    expect(resolveAssetLibraryKeyboardSelection("ArrowUp", groupedAssetIds, "asset_inventory_a")).toBe("asset_scene_audio");
    expect(resolveAssetLibraryKeyboardSelection("ArrowDown", groupedAssetIds, "asset_inventory_c")).toBe("asset_inventory_c");
    expect(resolveAssetLibraryKeyboardSelection("ArrowUp", groupedAssetIds, "asset_background_a")).toBe("asset_background_a");
    expect(resolveAssetLibraryKeyboardSelection("Home", groupedAssetIds, "asset_inventory_b")).toBe("asset_background_a");
    expect(resolveAssetLibraryKeyboardSelection("End", groupedAssetIds, "asset_background_a")).toBe("asset_inventory_c");
    expect(resolveAssetLibraryKeyboardSelection("PageDown", groupedAssetIds, "asset_background_b", 3)).toBe("asset_inventory_b");
    expect(resolveAssetLibraryKeyboardSelection("PageUp", groupedAssetIds, "asset_inventory_b", 3)).toBe("asset_background_b");
    expect(resolveAssetLibraryKeyboardSelection("PageDown", groupedAssetIds, "asset_inventory_b", 3)).toBe("asset_inventory_c");
    expect(resolveAssetLibraryKeyboardSelection("PageUp", groupedAssetIds, "asset_background_b", 3)).toBe("asset_background_a");
  });
});

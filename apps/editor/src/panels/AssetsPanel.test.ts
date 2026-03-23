import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, type Asset } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import { useEditorStore } from "../store";
import { AssetsPanel, resolveAssetCardPreviewPresentation } from "./AssetsPanel";

describe("AssetsPanel proxy UI", () => {
  it("keeps asset cards focused on asset details instead of localization status copy", () => {
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
    expect(markup).toContain("Loading preview...");
    expect(markup).toContain("Not currently in use.");
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

    expect(markup).toContain(">Scene Audio</option>");
    expect(markup).not.toContain("Create new inventory assets from Inventory.");
  });

  it("uses the intrinsic contain preview treatment for inventory assets", () => {
    expect(resolveAssetCardPreviewPresentation("inventory")).toEqual({
      aspectRatio: "intrinsic",
      fit: "contain"
    });
    expect(resolveAssetCardPreviewPresentation("background")).toEqual({
      aspectRatio: "landscape",
      fit: "cover"
    });
    expect(resolveAssetCardPreviewPresentation("sceneAudio")).toEqual({
      aspectRatio: "landscape",
      fit: "cover"
    });
  });
});

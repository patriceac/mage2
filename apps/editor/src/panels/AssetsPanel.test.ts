import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, type Asset } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import { useEditorStore } from "../store";
import { AssetsPanel } from "./AssetsPanel";

describe("AssetsPanel proxy UI", () => {
  it("does not render manual proxy generation controls or prompts", () => {
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
      selectedAssetId: asset.id,
      activeLocale: "en"
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
    expect(markup).toContain("preview unavailable");
  });
});

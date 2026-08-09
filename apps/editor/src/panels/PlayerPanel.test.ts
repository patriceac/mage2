import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle, type Asset } from "@mage2/schema";
import { playerMessages } from "../i18n/catalogs/player";

const editorI18n = vi.hoisted(() => ({ locale: "en" as "en" | "ar" }));
vi.mock("../i18n", () => ({
  useEditorI18n: () => ({
    locale: editorI18n.locale,
    t: (source: string, params?: Record<string, string | number>) =>
      source.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
        Object.prototype.hasOwnProperty.call(params ?? {}, name) ? String(params?.[name]) : placeholder
      )
  })
}));

vi.mock("../dialogs", () => ({
  useDialogs: () => ({ pickFiles: vi.fn() })
}));

import {
  PLAYER_APP_ICON_IMPORT_EXTENSIONS,
  PlayerPanel,
  resolveEditorPlayerInterfaceLocale,
  resolvePlayerArtworkImportExtensions,
  resolvePlayerArtworkImportResult
} from "./PlayerPanel";

describe("PlayerPanel", () => {
  it("provides genuine translations for every editor player message", () => {
    expect(Object.keys(playerMessages).length).toBeGreaterThan(40);
    expect(playerMessages["Player preview"].fr).toBe("Aperçu du lecteur");
    expect(playerMessages["Player preview"].ar).toBe("معاينة المشغل");
  });

  it("exposes the bounded creator controls and the shared shell preview", () => {
    const project = createDefaultProjectBundle("Player authoring");
    const markup = renderToStaticMarkup(
      React.createElement(PlayerPanel, {
        project,
        mutateProject: () => undefined,
        setStatusMessage: () => undefined,
        setBusyLabel: () => undefined
      })
    );

    expect(markup).toContain("Landscape-first shell");
    expect(markup).toContain('data-player-screen="title"');
    expect(markup).toContain("Show title screen on launch");
    expect(markup).toContain("Title alignment");
    expect(markup).toContain("Save generation");
    expect(markup).toContain("Generation 1");
    expect(markup).not.toContain('type="number"');
    expect(markup).toContain("Use a square PNG");
    expect(markup).toContain("Import Background");
    expect(markup).toContain("Import Logo");
    expect(markup).toContain("Import PNG");
    expect(markup).toContain("Use semantic versioning");
    expect(markup).toContain("Show a landscape hint in portrait");
    expect(markup).toContain("cinematic v1");
  });

  it("keeps Automatic tied to the editor locale while explicit shell choices remain independent", () => {
    expect(resolveEditorPlayerInterfaceLocale("automatic", "fr")).toBe("fr");
    expect(resolveEditorPlayerInterfaceLocale("automatic", "ar")).toBe("ar");
    expect(resolveEditorPlayerInterfaceLocale("ja", "ar")).toBe("ja");
  });

  it("renders Arabic player chrome RTL without changing project-authored content", () => {
    editorI18n.locale = "ar";
    const project = createDefaultProjectBundle("Authored Project Name");
    const markup = renderToStaticMarkup(
      React.createElement(PlayerPanel, {
        project,
        mutateProject: () => undefined,
        setStatusMessage: () => undefined,
        setBusyLabel: () => undefined
      })
    );
    editorI18n.locale = "en";

    expect(markup).toContain('lang="ar"');
    expect(markup).toContain('dir="rtl"');
    expect(markup).toContain("Authored Project Name");
    expect(project.manifest.defaultLanguage).toBe("en");
  });

  it("allows normal image formats for background and logo while keeping the icon PNG-only", () => {
    expect(PLAYER_APP_ICON_IMPORT_EXTENSIONS).toEqual([".png"]);
    expect(resolvePlayerArtworkImportExtensions("titleBackgroundAssetId")).toContain(".jpg");
    expect(resolvePlayerArtworkImportExtensions("logoAssetId")).toContain(".svg");
    expect(resolvePlayerArtworkImportExtensions("appIconAssetId")).toEqual([".png"]);
  });

  it("selects newly imported Player artwork before falling back to an existing duplicate", () => {
    const project = createDefaultProjectBundle("Player artwork import");
    const importedArtwork: Asset = {
      id: "asset_imported_artwork",
      kind: "image",
      name: "new-artwork.png",
      category: "player",
      variants: {
        en: {
          sourcePath: "D:\\project\\assets\\new-artwork.png",
          importedAt: "2026-08-05T00:00:00.000Z"
        }
      }
    };
    const existingArtwork: Asset = {
      ...importedArtwork,
      id: "asset_existing_artwork",
      name: "existing-artwork.png"
    };
    project.assets.assets.push(existingArtwork);

    expect(
      resolvePlayerArtworkImportResult(project, [importedArtwork], [{ assetId: existingArtwork.id }])
    ).toEqual({ asset: importedArtwork, imported: true });
    expect(resolvePlayerArtworkImportResult(project, [], [{ assetId: existingArtwork.id }])).toEqual({
      asset: existingArtwork,
      imported: false
    });
    expect(resolvePlayerArtworkImportResult(project, [], [])).toBeUndefined();
  });
});

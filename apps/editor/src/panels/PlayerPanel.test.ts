import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
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

import { PlayerPanel, resolveEditorPlayerInterfaceLocale } from "./PlayerPanel";

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
        setStatusMessage: () => undefined
      })
    );

    expect(markup).toContain("Landscape-first shell");
    expect(markup).toContain('data-player-screen="title"');
    expect(markup).toContain("Show title screen on launch");
    expect(markup).toContain("Title alignment");
    expect(markup).toContain("Save compatibility version");
    expect(markup).toContain("Use a square PNG");
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
        setStatusMessage: () => undefined
      })
    );
    editorI18n.locale = "en";

    expect(markup).toContain('lang="ar"');
    expect(markup).toContain('dir="rtl"');
    expect(markup).toContain("Authored Project Name");
    expect(project.manifest.defaultLanguage).toBe("en");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = [
  "./styles.css",
  "./panels/scenes/SceneShell.css",
  "./panels/scenes/SceneListRail.css",
  "./panels/scenes/SceneCanvas.css",
  "./panels/scenes/SceneMediaSection.css",
  "./panels/scenes/SceneActionRail.css",
  "./panels/scenes/HotspotInspectorWindow.css",
  "./panels/scenes/InventoryPlacementPickerWindow.css"
]
  .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
  .join("\n");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("editor chrome styles", () => {
  it("marks the title bar as draggable and keeps its controls interactive", () => {
    expect(styles).toContain(".titlebar-shell {");
    expect(styles).toContain("app-region: drag;");
    expect(styles).toContain("-webkit-app-region: drag;");
    expect(styles).toContain(".app-region-no-drag,");
    expect(styles).toContain("app-region: no-drag;");
  });

  it("keeps the welcome screen inside draggable window chrome", () => {
    expect(appSource).toContain("app-shell app-shell--landing");
    expect(appSource).toContain("titlebar-shell titlebar-shell--landing");
    expect(appSource).toContain("titlebar-shell__inner titlebar-shell__inner--landing");
    expect(appSource).toContain('className="titlebar-shell__mark"');
    expect(appSource).toContain('className="landing__workspace"');
    expect(appSource).toContain('className="landing__start-panel"');
    expect(appSource).toContain('className="recent-projects__table"');
    expect(appSource).toContain("Last opened");
    expect(appSource).toContain("revealRecentProjectEntry");
    expect(appSource).toContain("Projects");
    expect(styles).toContain(".app-shell--landing {");
    expect(styles).toContain("grid-template-rows: auto minmax(0, 1fr);");
    expect(styles).toContain(".titlebar-shell__mark {");
    expect(styles).toMatch(/\.titlebar-shell--landing\s*\{[\s\S]*?padding-block: 0\.14rem;[\s\S]*?\}/);
    expect(styles).toMatch(/\.titlebar-shell__inner--landing\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*?\}/);
    expect(styles).toMatch(/\.app-shell--landing[\s\S]*?button\.titlebar-menu__trigger[\s\S]*?border-radius: 6px;[\s\S]*?background: transparent;/);
    expect(styles).toContain(".app-shell--landing .landing {");
    expect(styles).toContain("overflow: auto;");
    expect(styles).toContain(".app-shell--landing .landing__workspace,");
    expect(styles).toContain(".app-shell--landing .landing__workspace *");
    expect(styles).toMatch(/\.app-shell--landing \.landing\s*\{[\s\S]*?-webkit-app-region: drag;[\s\S]*?\}/);
    expect(styles).toMatch(/\.app-shell--landing \.landing__workspace,[\s\S]*?-webkit-app-region: no-drag;[\s\S]*?\}/);
    expect(styles).toMatch(/\.app-shell--landing \.landing__workspace \*[\s\S]*?-webkit-app-region: no-drag;[\s\S]*?\}/);
  });

  it("uses a single scroll region with dedicated chrome rows", () => {
    expect(styles).toContain(".app-shell--project {");
    expect(styles).toContain("grid-template-rows: auto auto minmax(0, 1fr) auto;");
    expect(styles).toContain(".app-shell--editor-workbench,");
    expect(styles).toContain("grid-template-rows: auto minmax(0, 1fr) auto;");
    expect(styles).toContain(".editor-scroll-region {");
    expect(styles).toContain("overflow: auto;");
  });

  it("reserves safe width for native window controls in the title bar", () => {
    expect(styles).toContain("env(titlebar-area-width, calc(100% - var(--titlebar-controls-reserved-width)))");
    expect(styles).toContain("max-width: calc(100% - var(--titlebar-controls-reserved-width));");
  });

  it("keeps the title-bar chrome stacked above legacy tab-strip styling", () => {
    expect(styles).toContain(".titlebar-shell {");
    expect(styles).toContain("z-index: 20;");
    expect(styles).toContain(".tab-strip--chrome {");
    expect(styles).toContain("z-index: 10;");
  });

  it("keeps playtest scene and inventory surfaces viewport-safe", () => {
    expect(styles).toContain(".panel-grid--playtest > aside.panel {");
    expect(styles).toContain("max-height: calc(100vh - 13.5rem);");
    expect(styles).toContain("overflow: auto;");
    expect(styles).toContain("--playtest-inventory-slot-size: clamp(4.1rem, 4.75vw, 5.05rem);");
    expect(styles).toContain(".playtest-stage__inventory {");
    expect(styles).toContain("align-self: flex-start;");
    expect(styles).toContain("max-width: min(100%, 35rem);");
    expect(styles).toContain(".playtest-inventory-toggle {");
    expect(styles).toContain(".playtest-inventory-tray__drawer {");
    expect(styles).toContain("left: calc(100% + 0.55rem);");
    expect(styles).toContain(".playtest-inventory-tray--expanded .playtest-inventory-tray__drawer {");
    expect(styles).not.toContain(".playtest-inventory-tray:hover .playtest-inventory-tray__drawer");
    expect(styles).not.toContain(".playtest-inventory-tray:focus-within .playtest-inventory-tray__drawer");
    expect(styles).not.toContain(".playtest-inventory-tray::before");
    expect(styles).toMatch(/\.playtest-inventory-slot\s*\{[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;[\s\S]*?\}/);
    expect(styles).toContain(
      "button:not(.hotspot__body):not(.playtest-inventory-slot):not(.playtest-inventory-toggle):not(.scenes-panel__scene-list-main):not(.scenes-panel__scene-list-action) {"
    );
    expect(styles).toContain(".playtest-inventory-slot__well {");
    expect(styles).toContain("border: 0;");
    expect(styles).toContain("background: transparent;");
    expect(styles).toContain(".media-surface--playtest .media-surface__scene-overlay::before {");
    expect(styles).toContain("background: none;");
    expect(styles).toContain(".media-surface--playtest .media-surface__scene-overlay > .playtest-stage__hud {");
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr);");
  });

  it("uses full-height rails and a canvas toolbar for the scene editor surface", () => {
    expect(styles).toContain(".scenes-panel__stage-layout {");
    expect(styles).toContain(".app-shell--scene-editor {");
    expect(styles).toContain("grid-template-rows: auto minmax(0, 1fr) auto;");
    expect(styles).toContain(".app-shell--editor-workbench {");
    expect(styles).toContain(".scene-screen-tabs {");
    expect(styles).toContain(".app-shell--scene-editor .scenes-panel__stage-layout {");
    expect(styles).toContain(".app-shell--scene-editor .editor-layout:not(.editor-layout--with-issues) {");
    expect(styles).not.toContain(".app-shell--scene-editor .editor-layout {\n  display: block;");
    expect(styles).toContain(
      "grid-template-columns: minmax(17.5rem, 19.5rem) minmax(0, 1fr) minmax(8.75rem, 9.75rem);"
    );
    expect(styles).toContain("height: 100%;");
    expect(styles).toContain("min-height: 0;");
    expect(styles).toContain(".scenes-panel__canvas-toolbar {");
    expect(styles).toContain(".scenes-panel__canvas-handle-controls {");
    expect(styles).toContain(".scenes-panel__scene-list {");
    expect(styles).toContain(".scenes-panel__rail-heading {");
    expect(styles).toContain(".scenes-panel__side-controls {");
    expect(styles).toContain(".scenes-panel__action-rail {");
    expect(styles).toContain(".scenes-panel__hotspot-actions {");
    expect(styles).toContain(".scenes-panel__scene-actions-menu {");
    expect(styles).toContain(".scenes-panel__background-dropzone-hint {");
    expect(styles).toContain(".scenes-panel__background-dropzone--active .media-surface__placeholder,");
    expect(styles).toContain("visibility: hidden;");
    expect(styles).toContain(".scenes-panel__scene-audio-disabled {");
    expect(styles).toContain("padding: 0.65rem 0.75rem;");
    expect(styles).toContain(".app-shell--scene-editor .scenes-panel__tool-button--danger:disabled svg {");
    expect(styles).toContain("color: inherit;");
  });

  it("keeps compact workbench titlebar actions and screen switching visible", () => {
    expect(appSource).toContain("app-shell--editor-workbench");
    expect(appSource).toContain('className="titlebar-shell__actions app-region-no-drag"');
    expect(appSource).toContain('className="titlebar-shell__history-button"');
    expect(appSource).toContain('aria-label={t("Undo")}');
    expect(appSource).toContain('aria-label={t("Redo")}');
    expect(appSource).toContain('<nav className="scene-screen-tabs" aria-label={t("Editor screens")}>');
    expect(appSource).toContain("scene-screen-tabs__tab scene-screen-tabs__tab--active app-region-no-drag");
    expect(appSource).toContain("scene-screen-tabs__tab app-region-no-drag");
    expect(appSource).not.toContain("Open editor sections");
    expect(styles).not.toContain(".scene-titlebar-menu");
    expect(appSource).not.toContain('<nav className="scene-screen-tabs app-region-no-drag"');
    expect(appSource).not.toContain('<nav className="tab-strip tab-strip--chrome app-region-no-drag"');
  });

  it("places Assets between Localization and Playtest in the screen tabs", () => {
    const localizationTabIndex = appSource.indexOf('{ id: "localization", label: "Localization" }');
    const assetsTabIndex = appSource.indexOf('{ id: "assets", label: "Assets" }');
    const playtestTabIndex = appSource.indexOf('{ id: "playtest", label: "Playtest" }');

    expect(localizationTabIndex).toBeGreaterThanOrEqual(0);
    expect(assetsTabIndex).toBeGreaterThan(localizationTabIndex);
    expect(playtestTabIndex).toBeGreaterThan(assetsTabIndex);
  });

  it("describes the project save state without implying autosave exists", () => {
    expect(appSource).toContain('hasUnsavedChanges ? t("Unsaved changes") : t("Saved")');
    expect(appSource).not.toContain("Autosave:");
  });

  it("keeps interface language available and protects directional editor geometry", () => {
    expect(appSource).toContain('t("Interface language")');
    expect(appSource).toContain('<span>{t("Language")}</span>');
    expect(appSource).toContain('className="titlebar-menu__item titlebar-menu__submenu-trigger"');
    expect(appSource).toContain('renderInterfaceLanguageItems("file-submenu")');
    expect(styles).toContain(".titlebar-menu__submenu-panel");
    expect(appSource).toContain('t("Automatic ({autonym})"');
    expect(appSource).toContain("BUILT_IN_LOCALE_AUTONYMS[automaticLocale]");
    expect(appSource).not.toContain("BUILT_IN_LOCALE_AUTONYMS[locale]");
    expect(appSource).toContain('role="menuitemradio"');
    expect(styles).toContain('html[dir="rtl"] .titlebar-shell__history-actions');
    expect(styles).toContain('html[dir="rtl"] .media-surface');
    expect(styles).toContain("direction: ltr;");
  });
});

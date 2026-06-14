import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("editor chrome styles", () => {
  it("marks the title bar as draggable and keeps its controls interactive", () => {
    expect(styles).toContain(".titlebar-shell {");
    expect(styles).toContain("app-region: drag;");
    expect(styles).toContain("-webkit-app-region: drag;");
    expect(styles).toContain(".app-region-no-drag,");
    expect(styles).toContain("app-region: no-drag;");
  });

  it("uses a single scroll region with dedicated chrome rows", () => {
    expect(styles).toContain(".app-shell--project {");
    expect(styles).toContain("grid-template-rows: auto auto minmax(0, 1fr) auto;");
    expect(styles).toContain(".editor-scroll-region {");
    expect(styles).toContain("overflow: auto;");
  });

  it("reserves safe width for native window controls in the title bar", () => {
    expect(styles).toContain("env(titlebar-area-width, calc(100% - var(--titlebar-controls-reserved-width)))");
    expect(styles).toContain("max-width: calc(100% - var(--titlebar-controls-reserved-width));");
  });

  it("keeps the title-bar chrome stacked above the tab strip", () => {
    expect(styles).toContain(".titlebar-shell {");
    expect(styles).toContain("z-index: 20;");
    expect(styles).toContain(".tab-strip--chrome {");
    expect(styles).toContain("z-index: 10;");
  });

  it("keeps playtest scene and inventory surfaces viewport-safe", () => {
    expect(styles).toContain(".panel-grid--playtest > aside.panel {");
    expect(styles).toContain("max-height: calc(100vh - 13.5rem);");
    expect(styles).toContain("overflow: auto;");
    expect(styles).toContain("--playtest-inventory-slot-size: clamp(3.3rem, 4.1vw, 4.15rem);");
    expect(styles).toContain("grid-template-columns: auto minmax(0, 1fr);");
  });

  it("keeps scene selection controls in a side rail beside the preview", () => {
    expect(styles).toContain(".scenes-panel__stage-layout {");
    expect(styles).toContain(
      "grid-template-columns: minmax(13.25rem, 15.5rem) minmax(0, 1fr) minmax(10rem, 11.75rem);"
    );
    expect(styles).toContain(".scenes-panel__side-controls {");
    expect(styles).toContain(".scenes-panel__action-rail {");
    expect(styles).toContain(".scenes-panel__hotspot-actions {");
    expect(styles).toContain(".scenes-panel__delete-scene-button {");
    expect(styles).toContain(".scenes-panel__background-dropzone-hint {");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("hotspot idle visibility styles", () => {
  it("keeps the selected hotspot out of the preview idle-hide selectors", () => {
    const idleSelectorPrefix =
      ".media-surface:not(:hover):not(.media-surface--hotspot-locked) .hotspot:not(.hotspot--selected):not(:focus-within) ";

    expect(styles).toContain(
      `${idleSelectorPrefix}.hotspot__body:not(.hotspot__body--runtime):not(.hotspot__body--hidden)`
    );
    expect(styles).toContain(`${idleSelectorPrefix}.hotspot__chrome`);
    expect(styles).toContain(`${idleSelectorPrefix}.hotspot__chrome-shape`);
    expect(styles).toContain(`${idleSelectorPrefix}.hotspot__label-card`);
    expect(styles).toContain(`${idleSelectorPrefix}.hotspot__label-comment-shell`);
    expect(styles).toContain(`${idleSelectorPrefix}.hotspot__handles`);
  });

  it("does not let surface focus keep every non-selected hotspot visible", () => {
    expect(styles).not.toContain(".media-surface:not(:hover):not(:focus-within):not(.media-surface--hotspot-locked)");
    expect(styles).toContain(".hotspot:not(.hotspot--selected):not(:focus-within) .hotspot__chrome");
  });

  it("keeps the generic hover chrome rules available to inventory hotspots", () => {
    expect(styles).toContain(".hotspot:hover .hotspot__chrome::before");
    expect(styles).toContain(".hotspot:hover .hotspot__chrome::after");
    expect(styles).not.toContain(".hotspot--inventory-item:not(.hotspot--selected) .hotspot__chrome::before");
  });

  it("removes only the hover fill for inventory hotspots", () => {
    expect(styles).toContain(
      ".hotspot--inventory-item:hover .hotspot__body:not(.hotspot__body--runtime):not(.hotspot__body--hidden)"
    );
    expect(styles).toContain("background: transparent;");
  });

  it("keeps the selected inventory rotation affordance visible without hover", () => {
    expect(styles).toContain(".hotspot--selected .hotspot__rotation-ui");
    expect(styles).toContain(".hotspot--selected .hotspot__handle--rotate");
  });

  it("reserves top label clearance for rotation controls and keeps handles above labels", () => {
    expect(styles).toContain("bottom: calc(100% + 0.55rem + var(--hotspot-top-control-clearance, 0px));");
    expect(styles).toContain(".hotspot__handles {");
    expect(styles).toContain("z-index: 4;");
  });

  it("defines drag and no-drag regions for the title-bar overlay shell", () => {
    expect(styles).toContain(".titlebar-shell {");
    expect(styles).toContain("-webkit-app-region: drag;");
    expect(styles).toContain(".app-region-no-drag");
    expect(styles).toContain("-webkit-app-region: no-drag;");
  });

  it("keeps the title-bar save button aligned with the slimmer file trigger sizing", () => {
    expect(styles).toContain(".titlebar-shell__save-button,");
    expect(styles).toContain("min-height: 1.95rem;");
    expect(styles).toContain("padding: 0.38rem 0.78rem;");
    expect(styles).toContain(".titlebar-shell__save-button svg {");
    expect(styles).toContain("width: 1.05rem;");
    expect(styles).toContain("height: 1.05rem;");
    expect(styles).toContain(".titlebar-menu__trigger {");
    expect(styles).toContain("min-height: 1.95rem;");
    expect(styles).toContain("padding: 0.38rem 0.78rem;");
    expect(styles).toContain(".titlebar-menu__trigger svg {");
    expect(styles).toContain("width: 0.95rem;");
    expect(styles).toContain("height: 0.95rem;");
  });

  it("caps the title-bar project path so it truncates earlier for future actions", () => {
    expect(styles).toContain(".titlebar-shell__path {");
    expect(styles).toContain("--titlebar-path-max-width: clamp(10rem, 20vw, 14rem);");
    expect(styles).toContain("flex: 0 1 var(--titlebar-path-max-width);");
    expect(styles).toContain("max-width: var(--titlebar-path-max-width);");
  });

  it("defines the shared non-editable dropdown shell", () => {
    expect(styles).toContain(".dropdown-select {");
    expect(styles).toContain(".dropdown-select__native {");
    expect(styles).toContain("padding: 0.7rem 3.7rem 0.7rem 0.8rem;");
    expect(styles).toContain(".dropdown-select__trigger {");
  });
});

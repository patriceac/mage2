import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("hotspot idle visibility styles", () => {
  it("keeps the selected hotspot out of the preview idle-hide selectors", () => {
    const idleSelectorPrefix =
      ".media-surface:not(:hover):not(.media-surface--hotspot-locked) .hotspot:not(.hotspot--selected):not(:focus-within) ";

    expect(styles).toContain(
      `${idleSelectorPrefix}.hotspot__body:not(.hotspot__body--runtime):not(.hotspot__body--hidden):not(.hotspot__body--playtest)`
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

  it("uses a light hover fill for regular hotspots without changing inventory hotspot art treatment", () => {
    expect(styles).toContain(
      ".hotspot:hover .hotspot__body:not(.hotspot__body--runtime):not(.hotspot__body--hidden):not(.hotspot__body--playtest)"
    );
    expect(styles).toMatch(
      /\.hotspot:hover \.hotspot__body:not\(\.hotspot__body--runtime\):not\(\.hotspot__body--hidden\):not\(\.hotspot__body--playtest\),[\s\S]*background: rgba\(125, 211, 252, 0\.08\);/
    );
    expect(styles).not.toContain("repeating-linear-gradient(");
    expect(styles).toContain(".hotspot--inventory-item:hover .hotspot__body");
    expect(styles).toContain("background: transparent;");
  });

  it("keeps playtest hotspots out of the idle-hide and authoring hover selectors", () => {
    expect(styles).toContain(
      ".media-surface--hotspot-locked .hotspot:not(.hotspot--selected) .hotspot__body:not(.hotspot__body--runtime):not(.hotspot__body--hidden):not(.hotspot__body--playtest)"
    );
    expect(styles).toContain(
      ".hotspot--inventory-item:hover .hotspot__body:not(.hotspot__body--runtime):not(.hotspot__body--hidden):not(.hotspot__body--playtest)"
    );
  });

  it("keeps the selected inventory rotation affordance visible without hover", () => {
    expect(styles).toContain(".hotspot--selected .hotspot__rotation-ui");
    expect(styles).toContain(".hotspot--selected .hotspot__handle--rotate");
  });

  it("limits grab cursors to editable hotspots so playtest clicks stay pointer-based", () => {
    expect(styles).toContain(".hotspot--editable .hotspot__body {");
    expect(styles).toContain(".hotspot--editable .hotspot__body:active {");
    expect(styles).not.toMatch(/^\s*\.hotspot__body:active\s*\{/m);
  });

  it("gives the playtest hotspot overlay a higher-contrast debug treatment", () => {
    expect(styles).toContain(".hotspot__body--playtest {");
    expect(styles).toContain("border: 3px solid rgba(186, 230, 253, 0.94);");
    expect(styles).toContain("14px 14px,");
    expect(styles).toContain("0 0 0 6px rgba(14, 165, 233, 0.12),");
    expect(styles).toContain("0 18px 36px rgba(8, 47, 73, 0.26);");
    expect(styles).toContain(".hotspot__body--playtest .hotspot__beacon {");
    expect(styles).toContain(".hotspot__body--playtest:hover,");
    expect(styles).toContain(".hotspot__body--playtest.hotspot__body--pointer-inactive:hover {");
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

  it("lets the title-bar project path consume the remaining identity width", () => {
    expect(styles).toContain(".titlebar-shell__path {");
    expect(styles).toContain("flex: 1 1 auto;");
    expect(styles).not.toContain("--titlebar-path-max-width:");
    expect(styles).not.toContain("max-width: var(--titlebar-path-max-width);");
  });

  it("defines the shared non-editable dropdown shell", () => {
    expect(styles).toContain(".dropdown-select {");
    expect(styles).toContain(".dropdown-select__native {");
    expect(styles).toContain("padding: 0.7rem 3.7rem 0.7rem 0.8rem;");
    expect(styles).toContain(".dropdown-select__trigger {");
  });
});

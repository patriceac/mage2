import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("hotspot idle visibility styles", () => {
  it("keeps the selected hotspot out of the preview idle-hide selectors", () => {
    const idleSelectorPrefix =
      ".media-surface:not(:hover):not(:focus-within):not(.media-surface--hotspot-locked) .hotspot:not(.hotspot--selected) ";

    expect(styles).toContain(
      `${idleSelectorPrefix}.hotspot__body:not(.hotspot__body--runtime):not(.hotspot__body--hidden)`
    );
    expect(styles).toContain(`${idleSelectorPrefix}.hotspot__chrome`);
    expect(styles).toContain(`${idleSelectorPrefix}.hotspot__chrome-shape`);
    expect(styles).toContain(`${idleSelectorPrefix}.hotspot__label-card`);
    expect(styles).toContain(`${idleSelectorPrefix}.hotspot__label-comment-shell`);
    expect(styles).toContain(`${idleSelectorPrefix}.hotspot__handles`);
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
});

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
});

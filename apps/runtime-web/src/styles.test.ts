import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("runtime hotspot visibility styles", () => {
  it("keeps debug hotspots readable against busy scene art", () => {
    expect(styles).toContain(".runtime-hotspot {");
    expect(styles).toContain("border: 2px solid rgba(186, 230, 253, 0.94);");
    expect(styles).toContain("0 0 0 4px rgba(14, 165, 233, 0.14),");
    expect(styles).toContain("0 16px 34px rgba(8, 47, 73, 0.24);");
  });
});

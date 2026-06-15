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

  it("uses the shared slim switch dimensions for hotspot visibility", () => {
    expect(styles).toContain("--switch-track-width: 2.2rem;");
    expect(styles).toContain("--switch-track-height: 1.12rem;");
    expect(styles).toContain("--switch-thumb-size: 0.74rem;");
    expect(styles).toMatch(
      /\.runtime-hotspot-visibility-toggle input\s*\{[\s\S]*?width: var\(--switch-track-width\);[\s\S]*?height: var\(--switch-track-height\);[\s\S]*?min-height: var\(--switch-track-height\);[\s\S]*?padding: 0;/
    );
    expect(styles).toMatch(
      /\.runtime-hotspot-visibility-toggle input::before\s*\{[\s\S]*?width: var\(--switch-thumb-size\);[\s\S]*?height: var\(--switch-thumb-size\);/
    );
    expect(styles).toMatch(
      /\.runtime-hotspot-visibility-toggle input:checked\s*\{[\s\S]*?border-color: #f6c177;[\s\S]*?background: #f6c177;[\s\S]*?box-shadow: inset 0 1px 3px rgba\(0, 0, 0, 0\.24\);/
    );
    expect(styles).toContain("transform: translate(var(--switch-thumb-travel), -50%);");
  });
});

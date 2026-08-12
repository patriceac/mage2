import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("runtime startup shell", () => {
  it("keeps a branded surface in the initial HTML until React is ready", () => {
    const bootStart = indexHtml.indexOf('<main class="mage2-runtime-boot"');
    const bootEnd = indexHtml.indexOf("</main>", bootStart);
    const moduleStart = indexHtml.indexOf('<script type="module"');

    expect(bootStart).toBeGreaterThan(0);
    expect(bootEnd).toBeGreaterThan(bootStart);
    expect(moduleStart).toBeGreaterThan(bootEnd);
    expect(indexHtml.slice(bootStart, bootEnd)).toContain("MAGE2 PLAYER");
    expect(indexHtml.slice(bootStart, bootEnd)).not.toContain("<script");
    expect(indexHtml).toContain("prefers-reduced-motion: reduce");
  });
});

import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  net: {},
  protocol: {}
}));
import { resolveBundledRendererPath } from "./secure-protocols";

describe("secure renderer protocol", () => {
  it("maps only the trusted bundle host into the renderer root", () => {
    const rendererRoot = path.resolve("C:/synthetic/mage2-renderer");
    expect(resolveBundledRendererPath(rendererRoot, "mage2-app://bundle/index.html")).toBe(
      path.join(rendererRoot, "index.html")
    );
    expect(resolveBundledRendererPath(rendererRoot, "mage2-app://attacker/index.html")).toBeUndefined();
    expect(resolveBundledRendererPath(rendererRoot, "https://bundle/index.html")).toBeUndefined();
    expect(resolveBundledRendererPath(rendererRoot, "mage2-app://bundle/index.html?remote=1")).toBeUndefined();
  });
});

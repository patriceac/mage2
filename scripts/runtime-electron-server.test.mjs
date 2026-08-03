import { describe, expect, it } from "vitest";
import { resolveContentType, resolvePlayerPort } from "../apps/runtime-electron/server.mjs";

describe("runtime Electron server", () => {
  it("uses a stable project-specific loopback port", () => {
    const first = resolvePlayerPort("beacon-at-dusk");

    expect(resolvePlayerPort("beacon-at-dusk")).toBe(first);
    expect(first).toBeGreaterThanOrEqual(41000);
    expect(first).toBeLessThan(61000);
    expect(resolvePlayerPort("another-project")).not.toBe(first);
  });

  it("serves all supported runtime media with browser-compatible content types", () => {
    expect(resolveContentType("scene.mp4")).toBe("video/mp4");
    expect(resolveContentType("scene.webp")).toBe("image/webp");
    expect(resolveContentType("scene.bmp")).toBe("image/bmp");
    expect(resolveContentType("ambience.ogg")).toBe("audio/ogg");
    expect(resolveContentType("ambience.m4a")).toBe("audio/mp4");
    expect(resolveContentType("ambience.aac")).toBe("audio/aac");
  });
});

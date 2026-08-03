import { describe, expect, it } from "vitest";
import { EDITOR_DEVELOPMENT_CSP, EDITOR_PRODUCTION_CSP } from "./csp";

describe("editor content security policy", () => {
  it("keeps the packaged renderer script and network policy strict", () => {
    expect(EDITOR_PRODUCTION_CSP).toContain("default-src 'none'");
    expect(EDITOR_PRODUCTION_CSP).toContain("script-src 'self'");
    expect(EDITOR_PRODUCTION_CSP).toContain("connect-src 'none'");
    expect(EDITOR_PRODUCTION_CSP).toContain("object-src 'none'");
    expect(EDITOR_PRODUCTION_CSP).toContain("frame-src 'none'");
    expect(EDITOR_PRODUCTION_CSP).not.toContain("unsafe-eval");
    expect(EDITOR_PRODUCTION_CSP).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("limits development-only relaxation to loopback HMR", () => {
    expect(EDITOR_DEVELOPMENT_CSP).toContain("ws://127.0.0.1:5173");
    expect(EDITOR_DEVELOPMENT_CSP).not.toContain("https:");
    expect(EDITOR_DEVELOPMENT_CSP).not.toContain("wss:");
  });
});

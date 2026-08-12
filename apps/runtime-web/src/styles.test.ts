import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const sharedStyles = readFileSync(
  new URL("../../../packages/player-ui/src/styles.css", import.meta.url),
  "utf8"
);
const runtimeEntry = readFileSync(new URL("./main.tsx", import.meta.url), "utf8");
const runtimeApp = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const runtimeHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("runtime player layout styles", () => {
  it("uses a dynamic full viewport without document scrolling", () => {
    expect(styles).toMatch(
      /body\s*\{[\s\S]*?overflow: hidden;[\s\S]*?overscroll-behavior: none;/
    );
    expect(styles).toMatch(
      /\.runtime-shell\s*\{[\s\S]*?height: 100dvh;[\s\S]*?overflow: hidden;/
    );
    expect(styles).toMatch(
      /\.runtime-stage\s*\{[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?overflow: hidden;/
    );
  });

  it("loads the shared Playtest renderer styles instead of a runtime scene implementation", () => {
    expect(runtimeEntry).toContain('import "@mage2/player-ui/styles.css";');
    expect(styles).toContain(".runtime-player-renderer {");
    expect(styles).not.toContain(".runtime-media__asset");
    expect(styles).not.toContain(".runtime-dialogue");
    expect(styles).not.toContain(".runtime-inventory__item");
    expect(sharedStyles).toMatch(
      /\.mage2-player__media\s*\{[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?object-fit: cover;/
    );
  });

  it("turns player menus and confirmations into mobile bottom sheets", () => {
    expect(sharedStyles).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.mage2-experience__panel,[\s\S]*?\.mage2-experience__confirmation\s*\{[\s\S]*?top: auto;[\s\S]*?bottom: 0;[\s\S]*?width: 100%;[\s\S]*?border-radius: 22px 22px 0 0;/
    );
    expect(styles).not.toContain(".runtime-menu-panel");
    expect(styles).not.toContain(".runtime-confirmation");
  });

  it("opts the standalone host into the shared scene-backed portrait composition", () => {
    expect(runtimeApp).toContain('presentation="runtime-responsive"');
    expect(styles).toMatch(
      /@media \(max-width: 640px\) and \(orientation: portrait\)[\s\S]*?\.runtime-player-renderer\s*\{[\s\S]*?width: 100%;[\s\S]*?height: 100%;/
    );
    expect(sharedStyles).toMatch(
      /\.mage2-player--runtime-responsive\s*\{[\s\S]*?width: min\(100%, var\(--mage2-player-contained-width, 100%\)\);/
    );
    expect(styles).toMatch(
      /@media \(max-width: 640px\) and \(orientation: portrait\)[\s\S]*?\.runtime-player-backdrop\s*\{[\s\S]*?filter: blur\(1\.5px\) saturate\(0\.85\) brightness\(0\.56\);/
    );
    expect(sharedStyles).toMatch(
      /\.mage2-player--runtime-responsive \.mage2-player__scene-surface\s*\{[\s\S]*?position: absolute;[\s\S]*?top: clamp\(5\.25rem, 22dvh, 12rem\);[\s\S]*?aspect-ratio: var\(--mage2-player-media-aspect, 16 \/ 9\);/
    );
    expect(sharedStyles).toMatch(
      /\.mage2-player--runtime-responsive \.mage2-player__hud-plane\s*\{[\s\S]*?position: absolute;[\s\S]*?inset: 0;[\s\S]*?background: linear-gradient/
    );
  });

  it("lets shared response video cover the runtime while embedded Playtest stays bounded", () => {
    expect(sharedStyles).toMatch(
      /\.mage2-player__response-layer--runtime-responsive\s*\{[\s\S]*?position: fixed;[\s\S]*?inset: 0;/
    );
    expect(sharedStyles).toContain(".mage2-player__response-layer--video {");
    expect(runtimeApp).toContain("runtime-player-renderer--response-video");
    expect(styles).toMatch(
      /\.runtime-player-renderer--response-video\s*\{[\s\S]*?z-index: 80;[\s\S]*?overflow: visible;[\s\S]*?animation: none;[\s\S]*?transform: none;/
    );
  });

  it("keeps technical startup diagnostics behind explicit debug mode", () => {
    expect(runtimeApp).not.toContain("<h1>MAGE2 Runtime</h1>");
    expect(runtimeApp).toContain(
      'debugMode ? <pre className="runtime-error-details">{errorMessage}</pre> : null'
    );
    expect(styles).toContain(".runtime-error-details {");
  });

  it("suppresses the browser's speculative favicon request until the creator icon is ready", () => {
    expect(runtimeHtml).toContain('<link rel="icon" href="data:," />');
    expect(runtimeApp).toContain('link[rel~="icon"]');
  });
});

describe("runtime hotspot and debug styles", () => {
  it("keeps runtime host button chrome out of every shared renderer control", () => {
    expect(styles).toContain(
      ":is(.runtime-card, .runtime-debug-panel, .runtime-foreground-media) button:hover:not(:disabled) {"
    );
    expect(styles).not.toContain(".runtime-shell button:not");
    expect(styles).not.toMatch(/(^|\n)button:hover:not\(:disabled\)\s*\{/u);
  });

  it("keeps debug hotspots readable when explicitly enabled", () => {
    expect(sharedStyles).toContain(".mage2-player__hotspot-button--debug {");
    expect(sharedStyles).toContain("border-color: rgba(186, 230, 253, 0.94);");
    expect(styles).toContain(".runtime-debug-panel {");
  });

  it("keeps pointer hotspots invisible while revealing keyboard focus with a compact beacon", () => {
    expect(sharedStyles).toMatch(
      /\.mage2-player__hotspot-button--hidden,[\s\S]*?\.mage2-player__hotspot-button--hidden:hover,[\s\S]*?\.mage2-player__hotspot-button--hidden:focus-visible\s*\{[\s\S]*?border-color: transparent;[\s\S]*?outline: none;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/
    );
    expect(sharedStyles).toContain('.mage2-player[data-input-modality="keyboard"]');
    expect(sharedStyles).toMatch(
      /\.mage2-player__hotspot-button--hidden:focus-visible[\s\S]*?\.mage2-player__hotspot-beacon\s*\{[\s\S]*?display: block;[\s\S]*?width: 1\.7rem;/
    );
    expect(sharedStyles).not.toContain(".mage2-player__hotspot-button--hidden:focus-visible::after");
  });
});

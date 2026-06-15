import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const workbenchSharedButtonSelector =
  ".app-shell--editor-workbench button:not(.hotspot__body):not(.playtest-inventory-slot):not(.playtest-inventory-toggle)";
const pendingSaveButtonSelector =
  ".app-shell--editor-workbench\n  button.titlebar-shell__save-button.titlebar-shell__save-button--active:not(.hotspot__body):not(.playtest-inventory-slot):not(.playtest-inventory-toggle)";

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

  it("uses shared slim switch dimensions across toggle controls", () => {
    expect(styles).toContain("--switch-track-width: 2.2rem;");
    expect(styles).toContain("--switch-track-height: 1.12rem;");
    expect(styles).toContain("--switch-thumb-size: 0.74rem;");
    expect(styles).toContain("--switch-thumb-travel: 1.03rem;");
    expect(styles).toMatch(
      /\.scene-video-loop-toggle input\s*\{[\s\S]*?width: var\(--switch-track-width\);[\s\S]*?height: var\(--switch-track-height\);[\s\S]*?min-height: var\(--switch-track-height\);[\s\S]*?padding: 0;/
    );
    expect(styles).toMatch(
      /\.scene-video-loop-toggle input::before\s*\{[\s\S]*?width: var\(--switch-thumb-size\);[\s\S]*?height: var\(--switch-thumb-size\);/
    );
    expect(styles).toMatch(
      /\.playtest-hotspot-visibility-toggle__track\s*\{[\s\S]*?width: var\(--switch-track-width\);[\s\S]*?height: var\(--switch-track-height\);/
    );
    expect(styles).toMatch(
      /\.playtest-hotspot-visibility-toggle__thumb\s*\{[\s\S]*?width: var\(--switch-thumb-size\);[\s\S]*?height: var\(--switch-thumb-size\);/
    );
    expect(styles).toMatch(
      /\.app-shell--scene-editor \.scenes-floating-inspector__section > \.stack-inline > \.scenes-hotspot-duration-toggle input\s*\{[\s\S]*?width: var\(--switch-track-width\);[\s\S]*?height: var\(--switch-track-height\);[\s\S]*?min-height: var\(--switch-track-height\);[\s\S]*?padding: 0;/
    );
    expect(styles).toMatch(
      /\.app-shell--scene-editor \.scenes-floating-inspector__section > \.stack-inline > \.scenes-hotspot-duration-toggle input::before\s*\{[\s\S]*?width: var\(--switch-thumb-size\);[\s\S]*?height: var\(--switch-thumb-size\);/
    );
    expect(styles).toMatch(
      /\.app-shell--editor-workbench \.scenes-panel__scene-audio-loop-toggle\s*\{[\s\S]*?display: inline-flex;[\s\S]*?align-items: center;[\s\S]*?min-height: 2rem;/
    );
    expect(styles).toMatch(
      /\.app-shell--editor-workbench \.scenes-panel__scene-audio-loop-toggle input\s*\{[\s\S]*?width: var\(--switch-track-width\);[\s\S]*?height: var\(--switch-track-height\);[\s\S]*?min-height: var\(--switch-track-height\);[\s\S]*?border-radius: 999px;[\s\S]*?overflow: hidden;/
    );
    expect(styles).toMatch(
      /\.scene-video-loop-toggle input:checked\s*\{[\s\S]*?border-color: #f6c177;[\s\S]*?background: #f6c177;[\s\S]*?box-shadow: inset 0 1px 3px rgba\(0, 0, 0, 0\.24\);/
    );
    expect(styles).toMatch(
      /\.playtest-hotspot-visibility-toggle input:checked \+ \.playtest-hotspot-visibility-toggle__track\s*\{[\s\S]*?border-color: #f6c177;[\s\S]*?background: #f6c177;[\s\S]*?box-shadow: inset 0 1px 3px rgba\(0, 0, 0, 0\.24\);/
    );
    expect(styles).toMatch(
      /\.app-shell--editor-workbench \.scenes-panel__scene-audio-loop-toggle input:checked\s*\{[\s\S]*?border-color: #f6c177;[\s\S]*?background: #f6c177;[\s\S]*?box-shadow: inset 0 1px 3px rgba\(0, 0, 0, 0\.24\);/
    );
    expect(styles).toMatch(
      /\.app-shell--scene-editor \.scenes-floating-inspector__section > \.stack-inline > \.scenes-hotspot-duration-toggle input:checked\s*\{[\s\S]*?border-color: #4ade80;[\s\S]*?background: #4ade80;[\s\S]*?box-shadow: inset 0 1px 3px rgba\(0, 0, 0, 0\.24\);/
    );
    expect(styles).toContain("transform: translate(var(--switch-thumb-travel), -50%);");
    expect(styles).not.toContain("grid-template-columns: 1.4rem auto;");
  });

  it("keeps the playtest hotspot toggle label steady on hover", () => {
    expect(styles).toContain(".playtest-hotspot-visibility-toggle:hover .playtest-hotspot-visibility-toggle__track");
    expect(styles).not.toMatch(/\.playtest-hotspot-visibility-toggle:hover\s*\{[\s\S]*?font-weight:/);
    expect(styles).not.toMatch(/\.playtest-hotspot-visibility-toggle:hover\s*\{[\s\S]*?color:/);
    expect(styles).not.toMatch(/\.playtest-hotspot-visibility-toggle:hover\s*\{[\s\S]*?transform:/);
  });

  it("keeps flyover labels above hotspot art, chrome, and handles", () => {
    expect(styles).toMatch(
      /\.media-surface__scene-overlay\s*\{[\s\S]*?z-index: 4;[\s\S]*?pointer-events: auto;[\s\S]*?\}/
    );
    expect(styles).toMatch(
      /\.media-surface__label-layer\s*\{[\s\S]*?z-index: 6;[\s\S]*?pointer-events: none;[\s\S]*?\}/
    );
    expect(styles).toContain("bottom: calc(100% + 0.55rem + var(--hotspot-top-control-clearance, 0px));");
    expect(styles).toMatch(/\.hotspot:hover,\s*\.hotspot:focus-within\s*\{\s*z-index: 30;\s*\}/);
    expect(styles).toMatch(
      /\.hotspot--with-visual,[\s\S]*?\.hotspot--inventory-item\s*\{[\s\S]*?z-index: 40;[\s\S]*?\}/
    );
    expect(styles).toMatch(
      /\.hotspot--selected,[\s\S]*?\.hotspot--selected:hover,[\s\S]*?\.hotspot--selected:focus-within\s*\{[\s\S]*?z-index: 70;[\s\S]*?\}/
    );
    expect(styles).toMatch(
      /\.hotspot--with-visual:hover,[\s\S]*?\.hotspot--with-visual:focus-within,[\s\S]*?\.hotspot--inventory-item:hover,[\s\S]*?\.hotspot--inventory-item:focus-within,[\s\S]*?\.hotspot--selected:hover,[\s\S]*?\.hotspot--selected:focus-within\s*\{[\s\S]*?z-index: 90;[\s\S]*?\}/
    );
    expect(styles).toMatch(/\.hotspot__label-shell\s*\{[\s\S]*?z-index: 100;[\s\S]*?\}/);
    expect(styles).toContain(".hotspot__label-shell--active .hotspot__label-card");
    expect(styles).toMatch(/\.hotspot__handles\s*\{[\s\S]*?z-index: 4;[\s\S]*?\}/);
  });

  it("defines drag and no-drag regions for the title-bar overlay shell", () => {
    expect(styles).toContain(".titlebar-shell {");
    expect(styles).toContain("-webkit-app-region: drag;");
    expect(styles).toContain(".app-region-no-drag");
    expect(styles).toContain("-webkit-app-region: no-drag;");
  });

  it("keeps shared workbench button chrome away from hotspot hit targets", () => {
    expect(styles).toContain(`${workbenchSharedButtonSelector} {`);
    expect(styles).toContain(`${workbenchSharedButtonSelector}:hover {`);
    expect(styles).not.toContain(".app-shell--editor-workbench button {");
    expect(styles).toContain(".hotspot__body--hidden,");
  });

  it("keeps the pending save action highlighted after shared workbench button chrome", () => {
    const sharedButtonRule = styles.indexOf(`${workbenchSharedButtonSelector} {`);
    const pendingSaveRule = styles.indexOf(`${pendingSaveButtonSelector} {`);

    expect(sharedButtonRule).toBeGreaterThan(-1);
    expect(pendingSaveRule).toBeGreaterThan(sharedButtonRule);
    expect(resolveSelectorSpecificityScore(pendingSaveButtonSelector)).toBeGreaterThan(
      resolveSelectorSpecificityScore(workbenchSharedButtonSelector)
    );
    expect(styles).toMatch(
      /\.app-shell--editor-workbench\s+button\.titlebar-shell__save-button\.titlebar-shell__save-button--active:not\(\.hotspot__body\):not\(\.playtest-inventory-slot\):not\(\.playtest-inventory-toggle\)\s*\{[\s\S]*?border-color: rgba\(246, 193, 119, 0\.78\);[\s\S]*?background: #f6c177;[\s\S]*?color: #172026;[\s\S]*?\}/
    );
    expect(styles).toMatch(
      /\.app-shell--editor-workbench\s+button\.titlebar-shell__save-button\.titlebar-shell__save-button--active:not\(\.hotspot__body\):not\(\.playtest-inventory-slot\):not\(\.playtest-inventory-toggle\):hover\s*\{[\s\S]*?background: #ffd088;[\s\S]*?color: #172026;[\s\S]*?\}/
    );
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

  it("matches workbench title-bar file actions to the compact scene chrome", () => {
    expect(styles).toContain("--titlebar-overlay-height: 2.5rem;");
    expect(styles).toContain("min-height: max(2.5rem, env(titlebar-area-height, 0px));");
    expect(styles).toContain(".app-shell--editor-workbench .titlebar-shell__save-button,");
    expect(styles).toContain(".app-shell--editor-workbench .titlebar-menu__trigger {");
    expect(styles).toContain("min-height: 1.7rem;");
    expect(styles).toContain("padding: 0.25rem 0.52rem;");
    expect(styles).toContain("border-radius: 6px;");
    expect(styles).toContain("min-height: 1.42rem;");
    expect(styles).toContain(".app-shell--editor-workbench .titlebar-menu__panel {");
    expect(styles).toContain("border-radius: 8px;");
    expect(styles).toContain("background: rgba(10, 16, 22, 0.98);");
    expect(styles).toContain(".app-shell--editor-workbench .titlebar-menu__item:hover {");
    expect(styles).toContain("background: rgba(23, 119, 168, 0.28);");
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

function resolveSelectorSpecificityScore(selector: string) {
  const classLikeCount = selector.match(/\.[\w-]+/g)?.length ?? 0;
  const typeCount = selector.match(/(^|[\s>+~])button(?=[\s.#:[{]|$)/g)?.length ?? 0;
  return classLikeCount * 100 + typeCount;
}

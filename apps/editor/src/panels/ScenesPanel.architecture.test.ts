import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(new URL("./ScenesPanel.tsx", import.meta.url), "utf8");
const legacyStyles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sceneStyles = readFileSync(new URL("./scenes/scenes.css", import.meta.url), "utf8");
const mainEntry = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

const componentModules = [
  "SceneListRail",
  "SceneCanvas",
  "SceneMediaSection",
  "SceneWiringSection",
  "SceneActionRail",
  "InventoryPlacementPickerWindow",
  "HotspotInspectorWindow"
] as const;

const componentStyleFiles = [
  "SceneShell.css",
  "SceneListRail.css",
  "SceneCanvas.css",
  "SceneMediaSection.css",
  "SceneActionRail.css",
  "HotspotInspectorWindow.css",
  "InventoryPlacementPickerWindow.css"
] as const;

describe("ScenesPanel architecture boundaries", () => {
  it("keeps the orchestration component below the architectural size ceiling", () => {
    expect(panelSource.split(/\r?\n/).length).toBeLessThanOrEqual(2_000);
  });

  it("keeps extracted UI and playback implementations out of the orchestration component", () => {
    for (const moduleName of componentModules) {
      expect(panelSource).toContain(`./scenes/${moduleName}`);
      expect(panelSource).not.toContain(`function ${moduleName}(`);
    }

    expect(panelSource).toContain('./scenes/useSceneMediaPlayback');
    expect(panelSource).not.toContain("sceneAudioTimeoutRef");
    expect(panelSource).not.toContain("sceneAudioAnimationFrameRef");
    expect(panelSource).not.toContain("syncSceneAudioToPlayheadRef");
  });

  it("keeps component CSS out of the legacy global stylesheet", () => {
    expect(legacyStyles).not.toMatch(/^\.scenes-panel__canvas-toolbar \{/m);
    expect(legacyStyles).not.toMatch(/^\.scenes-panel__scene-list \{/m);
    expect(legacyStyles).not.toMatch(/^\.scenes-panel__scene-audio-frame \{/m);
    expect(legacyStyles).not.toMatch(/^\.scenes-floating-inspector \{/m);
    expect(legacyStyles).not.toMatch(/^\.scenes-inventory-picker__list \{/m);
  });

  it("loads every scene stylesheet through one explicit entrypoint", () => {
    expect(mainEntry).toContain('import "./panels/scenes/scenes.css";');

    for (const styleFile of componentStyleFiles) {
      expect(sceneStyles).toContain(`@import "./${styleFile}";`);
      const contents = readFileSync(new URL(`./scenes/${styleFile}`, import.meta.url), "utf8");
      expect(contents.trim().split(/\r?\n/).length).toBeGreaterThan(10);
    }
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPlayerController } from "@mage2/player";
import { createDefaultProjectBundle, type Hotspot } from "@mage2/schema";
import {
  PlayerDialogueBox,
  PlayerInventoryTray,
  PlayerSceneRenderer,
  isOpaqueHotspotVisualHit,
  resolvePlayerHotspotInteraction,
  resolvePlayerInventoryContextMenuAction,
  resolvePlayerSystemCopy,
  resolvePlayerTextDirection,
  resolveResponseTextDurationMs,
  type PlayerSystemCopy
} from "./index";

const copy: PlayerSystemCopy = {
  narrator: "Storyteller",
  continue: "Next",
  inventory: "Pack",
  inventoryToggleLabel: ({ isExpanded, itemCount }) =>
    `${isExpanded ? "Hide" : "Show"} pack (${itemCount})`,
  emptyInventory: "Nothing",
  chooseDialogueResponseTitle: "Pick a response",
  continueDialogueTitle: "Read on",
  activateHotspot: "Use",
  missingVisual: "Missing scene art",
  skipResponseVideo: "Skip",
  stopResponseAudio: "Stop",
  playResponseAudio: "Play",
  responseAudioPlaying: "Audio response",
  responseMediaUnavailable: "Unavailable"
};

describe("player responses", () => {
  it("keeps text feedback readable with a length-aware three-to-eight second timeout", () => {
    expect(resolveResponseTextDurationMs("")).toBe(3000);
    expect(resolveResponseTextDurationMs("Nothing happens.")).toBe(3000);
    expect(resolveResponseTextDurationMs("x".repeat(100))).toBe(6700);
    expect(resolveResponseTextDurationMs("x".repeat(1000))).toBe(8000);
  });

  it("ships localized player controls for every starter response locale", () => {
    for (const locale of ["en", "fr", "es", "zh-Hans", "ja", "ko", "ar"]) {
      const localizedCopy = resolvePlayerSystemCopy(locale);
      expect(localizedCopy.skipResponseVideo).not.toBe("");
      expect(localizedCopy.stopResponseAudio).not.toBe("");
      expect(localizedCopy.responseMediaUnavailable).not.toBe("");
    }
  });

  it("sets right-to-left presentation for Arabic while keeping other starter locales left-to-right", () => {
    expect(resolvePlayerTextDirection("ar")).toBe("rtl");
    expect(resolvePlayerTextDirection("ar-SA")).toBe("rtl");
    expect(resolvePlayerTextDirection("zh-Hans")).toBe("ltr");
  });
});

describe("inventory selection cancellation", () => {
  it("closes an open drawer before cancelling a selected item", () => {
    expect(resolvePlayerInventoryContextMenuAction(false)).toBeUndefined();
    expect(resolvePlayerInventoryContextMenuAction(false, "item_lantern")).toBe("cancel-selection");
    expect(resolvePlayerInventoryContextMenuAction(true)).toBe("close-inventory");
    expect(resolvePlayerInventoryContextMenuAction(true, "item_lantern")).toBe("close-inventory");
  });
});

function createHotspot(overrides: Partial<Hotspot> = {}): Hotspot {
  return {
    id: "hotspot",
    name: "Hotspot",
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    startMs: 0,
    endMs: 30_000,
    timingMode: "sceneDuration",
    requiredItemIds: [],
    conditions: [],
    effects: [],
    ...overrides
  };
}

describe("shared player interaction contract", () => {
  const placementHotspot = createHotspot({
    inventoryItemId: "item_key",
    requiredItemIds: ["item_key"],
    effects: [{ type: "removeItem", itemId: "item_key" }]
  });

  it("blocks every scene hotspot while dialogue is active", () => {
    expect(
      resolvePlayerHotspotInteraction({
        hasActiveDialogue: true,
        selectedInventoryItemId: "item_key",
        hotspot: placementHotspot
      })
    ).toEqual({ type: "blocked", reason: "dialogue" });
  });

  it("runs only a matching placement while an inventory item is selected", () => {
    expect(
      resolvePlayerHotspotInteraction({
        hasActiveDialogue: false,
        selectedInventoryItemId: "item_key",
        hotspot: placementHotspot
      })
    ).toMatchObject({ type: "activate", inventoryAction: { type: "placeItem", itemId: "item_key" } });
    expect(
      resolvePlayerHotspotInteraction({
        hasActiveDialogue: false,
        hotspot: placementHotspot
      })
    ).toEqual({ type: "none" });
    expect(
      resolvePlayerHotspotInteraction({
        hasActiveDialogue: false,
        selectedInventoryItemId: "item_coin",
        hotspot: placementHotspot
      })
    ).toEqual({ type: "none" });
    expect(
      resolvePlayerHotspotInteraction({
        hasActiveDialogue: false,
        selectedInventoryItemId: "item_key",
        hotspot: createHotspot()
      })
    ).toEqual({ type: "none" });
  });

  it("routes placement clicks and wrong items to their explicitly authored events", () => {
    const eventPlacementHotspot = createHotspot({
      ...placementHotspot,
      clickEvent: { effects: [{ type: "setFlag", flag: "cabinet.checked", value: true }] },
      otherItemEvent: { effects: [{ type: "setFlag", flag: "cabinet.locked", value: true }] }
    });

    expect(
      resolvePlayerHotspotInteraction({
        hasActiveDialogue: false,
        hotspot: eventPlacementHotspot
      })
    ).toEqual({ type: "event", eventType: "click" });
    expect(
      resolvePlayerHotspotInteraction({
        hasActiveDialogue: false,
        selectedInventoryItemId: "item_coin",
        hotspot: eventPlacementHotspot
      })
    ).toEqual({ type: "event", eventType: "otherItem" });
    expect(
      resolvePlayerHotspotInteraction({
        hasActiveDialogue: false,
        selectedInventoryItemId: "item_coin",
        hotspot: createHotspot({
          otherItemEvent: { effects: [{ type: "setFlag", flag: "cabinet.checked", value: true }] }
        })
      })
    ).toEqual({ type: "event", eventType: "otherItem" });
    expect(resolvePlayerHotspotInteraction({ hasActiveDialogue: false, hotspot: createHotspot() })).toEqual({
      type: "none"
    });
  });

  it("activates a normal authored event only when no inventory item is selected", () => {
    const eventHotspot = createHotspot({ effects: [{ type: "setFlag", flag: "cabinet.open", value: true }] });

    expect(
      resolvePlayerHotspotInteraction({ hasActiveDialogue: false, hotspot: eventHotspot })
    ).toMatchObject({ type: "activate", inventoryAction: { type: "none" } });
    expect(
      resolvePlayerHotspotInteraction({
        hasActiveDialogue: false,
        selectedInventoryItemId: "item_key",
        hotspot: eventHotspot
      })
    ).toEqual({ type: "none" });
  });

  it("keeps alpha-transparent parts of placed art outside its hit target", () => {
    expect(
      isOpaqueHotspotVisualHit(
        { width: 2, height: 1, alpha: new Uint8ClampedArray([0, 255]) },
        {
          pointX: 25,
          pointY: 50,
          hotspotWidth: 100,
          hotspotHeight: 100,
          visualBox: { x: 0, y: 0, width: 1, height: 1 },
          rotationDegrees: 0,
          imageWidth: 2,
          imageHeight: 1
        }
      )
    ).toBe(false);
    expect(
      isOpaqueHotspotVisualHit(
        { width: 2, height: 1, alpha: new Uint8ClampedArray([0, 255]) },
        {
          pointX: 75,
          pointY: 50,
          hotspotWidth: 100,
          hotspotHeight: 100,
          visualBox: { x: 0, y: 0, width: 1, height: 1 },
          rotationDegrees: 0,
          imageWidth: 2,
          imageHeight: 1
        }
      )
    ).toBe(true);
  });
});

describe("shared player system copy", () => {
  it("provides the same localized renderer copy to every host", () => {
    expect(resolvePlayerSystemCopy("en-GB").inventoryToggleLabel({ isExpanded: false, itemCount: 1 })).toBe(
      "Open inventory (1 item)"
    );
    expect(resolvePlayerSystemCopy("fr-CA").inventoryToggleLabel({ isExpanded: true, itemCount: 2 })).toBe(
      "Fermer l’inventaire (2 objets)"
    );
    expect(resolvePlayerSystemCopy("de").missingVisual).toBe("No playable visual for this scene.");
  });
});

describe("shared player component contract", () => {
  it("renders injected dialogue copy and choice markers", () => {
    const project = createDefaultProjectBundle("Shared dialogue");
    const tree = {
      id: "dialogue",
      name: "Dialogue",
      startNodeId: "node",
      nodes: [
        {
          id: "node",
          speaker: "",
          textId: "line",
          effects: [],
          choices: [{ id: "choice", textId: "choice", conditions: [], effects: [] }]
        }
      ]
    };
    const markup = renderToStaticMarkup(
      React.createElement(PlayerDialogueBox, {
        activeDialogue: { tree, node: tree.nodes[0]!, choices: tree.nodes[0]!.choices },
        strings: { line: "A line", choice: "A choice" },
        copy,
        onChoice: () => undefined,
        onContinue: () => undefined
      })
    );

    expect(markup).toContain("Storyteller");
    expect(markup).toContain("A line");
    expect(markup).toContain(">A</span>");
    expect(markup).toContain('title="Pick a response"');
    expect(markup).not.toContain("mage2-player__dialogue--continue");
    expect(project.manifest.projectName).toBe("Shared dialogue");
  });

  it("makes a no-choice dialogue panel clickable while retaining its continue button", () => {
    const tree = {
      id: "dialogue",
      name: "Dialogue",
      startNodeId: "node",
      nodes: [{ id: "node", speaker: "Guide", textId: "line", effects: [], choices: [] }]
    };
    const markup = renderToStaticMarkup(
      React.createElement(PlayerDialogueBox, {
        activeDialogue: { tree, node: tree.nodes[0]!, choices: [] },
        strings: { line: "Click the panel to continue." },
        copy,
        onChoice: () => undefined,
        onContinue: () => undefined
      })
    );

    expect(markup).toContain("mage2-player__dialogue--continue");
    expect(markup).toContain("Click the panel to continue.");
    expect(markup).toContain("mage2-player__dialogue-continue");
    expect(markup).toContain('title="Read on"');
    expect(markup).toContain("Next");
    expect(markup).toContain("›</span>");
  });

  it("keeps the injected bag and zero count visible for an empty inventory", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PlayerInventoryTray, {
        items: [],
        isExpanded: false,
        bagIconUrl: "bag.png",
        copy,
        onExpandedChange: () => undefined,
        onSelectItem: () => undefined
      })
    );

    expect(markup).toContain('src="bag.png"');
    expect(markup).toContain("mage2-player__inventory-count");
    expect(markup).toContain(">0</span>");
    expect(markup).toContain("Nothing");
    expect(markup).toContain('aria-label="Show pack (0)"');
  });

  it("renders the same namespaced scene shell for every host", () => {
    const project = createDefaultProjectBundle("Shared renderer");
    const controller = createPlayerController(project);
    const snapshot = controller.getSnapshot();
    const markup = renderToStaticMarkup(
      React.createElement(PlayerSceneRenderer, {
        project,
        snapshot,
        locale: project.manifest.defaultLanguage,
        strings: project.strings.byLocale[project.manifest.defaultLanguage],
        visibleHotspots: [],
        playheadMs: 0,
        showHotspots: false,
        resolveSourcePath: async (path) => path,
        bagIconUrl: "bag.png",
        copy,
        selectedInventoryItemId: undefined,
        onSelectedInventoryItemIdChange: () => undefined,
        onHotspotActivate: () => undefined,
        onDialogueChoice: () => undefined,
        onDialogueContinue: () => undefined
      })
    );
    const responsiveMarkup = renderToStaticMarkup(
      React.createElement(PlayerSceneRenderer, {
        project,
        snapshot,
        locale: project.manifest.defaultLanguage,
        strings: project.strings.byLocale[project.manifest.defaultLanguage],
        visibleHotspots: [],
        playheadMs: 0,
        showHotspots: false,
        resolveSourcePath: async (path) => path,
        bagIconUrl: "bag.png",
        copy,
        selectedInventoryItemId: undefined,
        onSelectedInventoryItemIdChange: () => undefined,
        onHotspotActivate: () => undefined,
        onDialogueChoice: () => undefined,
        onDialogueContinue: () => undefined,
        presentation: "runtime-responsive"
      })
    );

    expect(markup).toContain('class="mage2-player"');
    expect(markup).not.toContain("mage2-player--runtime-responsive");
    expect(markup).toContain("mage2-player__scene-surface");
    expect(markup).toContain("mage2-player__hotspots");
    expect(markup).toContain("mage2-player__hud-plane");
    expect(markup).toContain("mage2-player__hud");
    expect(markup).toContain("Missing scene art");
    expect(responsiveMarkup).toContain("mage2-player--runtime-responsive");
  });

  it("keeps the renderer host-neutral and its stylesheet player-namespaced", () => {
    const source = readFileSync(new URL("./PlayerSceneRenderer.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

    expect(source).not.toMatch(/useEditorStore|electronAPI|localStorage|sessionStorage/);
    expect(source).toContain("onContextMenu={handleInventoryContextMenu}");
    expect(source).toContain("resolvePlayerInventoryContextMenuAction(");
    expect(source).toContain("onClick={canContinueBySurfaceClick ? onContinue : undefined}");
    expect(styles).toContain(".mage2-player__media");
    expect(styles).toMatch(/\.mage2-player__dialogue--continue\s*\{[^}]*cursor:\s*pointer;/s);
    expect(styles).toMatch(
      /\.mage2-player__dialogue-continue\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s
    );
    expect(styles).toMatch(/\.mage2-player__media\s*\{[^}]*object-fit:\s*cover/s);
    expect(styles).not.toContain("mage2-player__inventory-hint");
    expect(styles).toMatch(
      /@media \(max-width: 780px\) and \(orientation: portrait\)[\s\S]*?\.mage2-player--runtime-responsive\s*\{[\s\S]*?height: 100%;[\s\S]*?aspect-ratio: auto;/
    );
    expect(styles).toMatch(
      /\.mage2-player--runtime-responsive \.mage2-player__scene-surface\s*\{[\s\S]*?aspect-ratio: var\(--mage2-player-media-aspect, 16 \/ 9\);/
    );
    expect(styles).toMatch(
      /\.mage2-player--runtime-responsive \.mage2-player__dialogue\s*\{[\s\S]*?max-height: min\(22rem, calc\(100% - 4\.4rem\)\);/
    );
    expect(styles).not.toMatch(/\.playtest-|\.runtime-|\.media-surface|\.dialogue-box/);
  });

  it("keeps scene-audio orchestration shared by the editor and runtime adapters", () => {
    const sharedAudioSource = readFileSync(new URL("./PlayerSceneAudio.tsx", import.meta.url), "utf8");
    const editorSource = readFileSync(
      new URL("../../../apps/editor/src/PlaytestPanel.tsx", import.meta.url),
      "utf8"
    );
    const runtimeSource = readFileSync(
      new URL("../../../apps/runtime-web/src/App.tsx", import.meta.url),
      "utf8"
    );

    expect(sharedAudioSource).toContain("export function usePlayerSceneAudioPlayback");
    expect(sharedAudioSource).toContain('"mage2-player__scene-audio"');
    expect(sharedAudioSource).not.toMatch(/useEditorStore|electronAPI|localStorage|sessionStorage/);

    for (const adapterSource of [editorSource, runtimeSource]) {
      expect(adapterSource).toContain("<PlayerSceneAudio");
      expect(adapterSource).not.toMatch(
        /sceneAudioTimeoutRef|sceneAudioAnimationFrameRef|syncSceneAudioToPlayheadRef|sceneAudioPlaybackIntentRef/
      );
      expect(adapterSource).not.toMatch(
        /getSceneAudioPlayheadMs|resolveSceneAudioPlaybackDirective|resolveSceneAudioSyncState/
      );
    }
  });
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPlayerController } from "@mage2/player";
import { BUILT_IN_LOCALES, PLAYER_UI_TEXT_IDS, createDefaultProjectBundle, type Hotspot } from "@mage2/schema";
import {
  DEFAULT_PLAYER_EXPERIENCE_PREFERENCES,
  PlayerDialogueBox,
  PlayerExperienceShell,
  PlayerInventoryTray,
  PlayerSceneRenderer,
  hasCompleteBuiltInPlayerChrome,
  isOpaqueHotspotVisualHit,
  resolvePlayerHotspotInteraction,
  resolvePlayerHotspotAccessibleName,
  resolvePlayerInventoryContextMenuAction,
  resolvePlayerExperienceShellCopy,
  resolvePlayerSystemCopy,
  resolvePlayerTextDirection,
  resolveResponseTextDurationMs,
  shouldActivatePlayerHotspotClick,
  type PlayerSystemCopy
} from "./index";

describe("player experience shell", () => {
  it("renders creator presentation and localized shell copy without host dependencies", () => {
    const project = createDefaultProjectBundle("The Glass Observatory");
    const strings = {
      ...project.strings.byLocale.en,
      [PLAYER_UI_TEXT_IDS.startGame]: "Enter the observatory"
    };
    const markup = renderToStaticMarkup(
      React.createElement(
        PlayerExperienceShell,
        {
          projectName: project.manifest.projectName,
          gameVersion: project.manifest.gameVersion,
          presentation: project.manifest.playerPresentation,
          screen: "title",
          onScreenChange: () => undefined,
          locale: "en",
          supportedLocales: ["en"],
          localeStrings: strings,
          onLocaleChange: () => undefined,
          playerUiOverrides: { en: { [PLAYER_UI_TEXT_IDS.startGame]: "Enter the observatory" } },
          preferences: DEFAULT_PLAYER_EXPERIENCE_PREFERENCES,
          onPreferencesChange: () => undefined,
          hasSavedGame: false,
          onContinue: () => undefined,
          onNewGame: () => undefined,
          titleBackgroundUrl: "title.png",
          iconUrl: "icon.png",
          status: "A recovered save is ready."
        },
        React.createElement("div", null, "Game canvas")
      )
    );

    expect(markup).toContain('data-player-screen="title"');
    expect(markup).toContain("The Glass Observatory");
    expect(markup).toContain("An interactive story");
    expect(markup).toContain("Enter the observatory");
    expect(markup).toContain("title.png");
    expect(markup).toContain("icon.png");
    expect(markup).toContain("A recovered save is ready.");
    expect(markup).toMatch(/<\/div><p class="mage2-experience__status" role="status">/u);
  });

  it("falls back to complete default confirmation copy", () => {
    expect(resolvePlayerExperienceShellCopy({})).toMatchObject({
      confirmLoadBody: "Current unsaved progress will be replaced.",
      confirmNewGameBody: "Current progress on this device will be replaced.",
      menuHeading: "Paused",
      settingsHeading: "Player settings"
    });
  });

  it("ships complete genuine chrome copy for all seven built-in locales", () => {
    expect(hasCompleteBuiltInPlayerChrome()).toBe(true);
    expect(resolvePlayerExperienceShellCopy("fr").settings).toBe("Paramètres");
    expect(resolvePlayerExperienceShellCopy("es").newGame).toBe("Nueva partida");
    expect(resolvePlayerExperienceShellCopy("zh-Hans").menuHeading).toBe("已暂停");
    expect(resolvePlayerExperienceShellCopy("ja").loadGame).toBe("ロード");
    expect(resolvePlayerExperienceShellCopy("ko").credits).toBe("제작진");
    expect(resolvePlayerExperienceShellCopy("ar").interfaceLanguage).toBe("لغة الواجهة");
    expect(BUILT_IN_LOCALES).toHaveLength(7);
  });

  it("keeps interface chrome independent from authored content language", () => {
    const project = createDefaultProjectBundle("Mixed language");
    project.manifest.playerPresentation.taglineTextId = "tagline";
    const markup = renderToStaticMarkup(
      React.createElement(PlayerExperienceShell, {
        projectName: project.manifest.projectName,
        gameVersion: project.manifest.gameVersion,
        presentation: project.manifest.playerPresentation,
        screen: "title",
        onScreenChange: () => undefined,
        locale: "fr",
        supportedLocales: ["en", "fr"],
        localeStrings: { tagline: "Une histoire en français" },
        onLocaleChange: () => undefined,
        interfaceLocale: "ar",
        interfaceLocalePreference: "ar",
        onInterfaceLocalePreferenceChange: () => undefined,
        preferences: DEFAULT_PLAYER_EXPERIENCE_PREFERENCES,
        onPreferencesChange: () => undefined,
        hasSavedGame: false,
        onContinue: () => undefined,
        onNewGame: () => undefined
      })
    );

    expect(markup).toContain('lang="ar" dir="rtl"');
    expect(markup).toContain('lang="fr" dir="ltr"');
    expect(markup).toContain("Une histoire en français");
    expect(markup).toContain("الإعدادات");
  });

  it("applies authored overrides only on top of the selected built-in interface locale", () => {
    expect(resolvePlayerExperienceShellCopy("fr").startGame).toBe("Commencer");
    expect(resolvePlayerExperienceShellCopy("fr", { [PLAYER_UI_TEXT_IDS.startGame]: "Entrer" }).startGame).toBe("Entrer");
    expect(resolvePlayerExperienceShellCopy("fr").startGame).not.toBe("Begin");
  });

  it("keeps landscape composition primary and portrait behavior bounded", () => {
    const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

    expect(styles).toMatch(/\.mage2-experience__title\s*\{[\s\S]*?background-size: cover;/);
    expect(styles).toMatch(
      /@media \(max-width: 640px\) and \(orientation: portrait\)[\s\S]*?\.mage2-experience__title-actions\s*\{[\s\S]*?grid-template-columns: 1fr 1fr;/
    );
    expect(styles).toContain(".mage2-experience__landscape-hint");
    expect(styles).toMatch(
      /\.mage2-experience\s*\{[\s\S]*?container-type: inline-size;/
    );
    expect(styles).toContain("font-size: clamp(2.75rem, 6.4cqw, 6.6rem);");
    expect(styles).not.toMatch(/\.mage2-experience__[\s\S]*?\d(?:\.\d+)?vw/u);
    expect(styles).not.toMatch(/\.mage2-experience button(?:,|\s*\{)/u);
    expect(styles).not.toMatch(/\.playtest-|\.runtime-/);
  });

  it("keeps the modal scrim full-bleed instead of inheriting pill button chrome", () => {
    const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

    expect(styles).toMatch(
      /\.mage2-experience button\.mage2-experience__scrim,[\s\S]*?:hover:not\(:disabled\),[\s\S]*?:active:not\(:disabled\)\s*\{[\s\S]*?inset: 0;[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?border-radius: 0;[\s\S]*?background: rgba\(0, 0, 0, 0\.6\);[\s\S]*?transform: none;/
    );
  });
});

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
  resumeSceneMedia: "Play with sound",
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
    expect(resolvePlayerTextDirection("zh-Hant")).toBe("ltr");
    expect(resolvePlayerSystemCopy("zh-Hant").inventory).toBe("Inventory");
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
    conditions: [],
    effects: [],
    ...overrides
  };
}

describe("shared player interaction contract", () => {
  const placementHotspot = createHotspot({
    placedInventoryItemId: "item_key",
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
      clickEvent: { effects: [{ type: "setVariable", variableId: "cabinet.checked", value: true }] },
      otherItemEvent: { effects: [{ type: "setVariable", variableId: "cabinet.locked", value: true }] }
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
          otherItemEvent: { effects: [{ type: "setVariable", variableId: "cabinet.checked", value: true }] }
        })
      })
    ).toEqual({ type: "event", eventType: "otherItem" });
    expect(resolvePlayerHotspotInteraction({ hasActiveDialogue: false, hotspot: createHotspot() })).toEqual({
      type: "none"
    });
  });

  it("activates a normal authored event only when no inventory item is selected", () => {
    const eventHotspot = createHotspot({ effects: [{ type: "setVariable", variableId: "cabinet.open", value: true }] });

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

  it("uses localized player-facing hotspot copy before the author-only name", () => {
    const hotspot = createHotspot({
      name: "Internal English name",
      commentTextId: "text.hotspot.comment"
    });

    expect(
      resolvePlayerHotspotAccessibleName(hotspot, {
        "text.hotspot.comment": "  Ouvrir   la porte  "
      })
    ).toBe("Ouvrir la porte");
    expect(resolvePlayerHotspotAccessibleName(hotspot, {})).toBe("Internal English name");
  });

  it("uses the localized inventory label when an inventory hotspot has no player-facing comment", () => {
    const hotspot = createHotspot({
      name: "Internal English pickup name",
      inventoryItemId: "item_fuse"
    });
    const inventoryItems = [
      {
        id: "item_fuse",
        name: "Internal English item name",
        textId: "text.item.fuse"
      }
    ];

    expect(
      resolvePlayerHotspotAccessibleName(
        hotspot,
        { "text.item.fuse": "  Fusible   patiné  " },
        inventoryItems
      )
    ).toBe("Fusible patiné");
    expect(resolvePlayerHotspotAccessibleName(hotspot, {}, inventoryItems)).toBe(
      "Internal English pickup name"
    );
  });

  it("lets keyboard-generated clicks bypass pointer-only alpha hit testing", () => {
    expect(
      shouldActivatePlayerHotspotClick({
        clickDetail: 0,
        hasVisual: true,
        hasAlphaMask: true,
        opaquePointerHit: false
      })
    ).toBe(true);
    expect(
      shouldActivatePlayerHotspotClick({
        clickDetail: 1,
        hasVisual: true,
        hasAlphaMask: true,
        opaquePointerHit: false
      })
    ).toBe(false);
    expect(
      shouldActivatePlayerHotspotClick({
        clickDetail: 1,
        hasVisual: true,
        hasAlphaMask: true,
        opaquePointerHit: true
      })
    ).toBe(true);
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
    expect(markup).toContain('data-input-modality="pointer"');
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

  it("keeps scene-audio orchestration inside the shared renderer", () => {
    const sharedAudioSource = readFileSync(new URL("./PlayerSceneAudio.tsx", import.meta.url), "utf8");
    const rendererSource = readFileSync(new URL("./PlayerSceneRenderer.tsx", import.meta.url), "utf8");
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
    expect(rendererSource).toContain("<PlayerSceneAudio");
    expect(rendererSource).toContain('drivePlayhead={sceneAsset?.kind !== "video"}');

    for (const adapterSource of [editorSource, runtimeSource]) {
      expect(adapterSource).not.toContain("<PlayerSceneAudio");
      expect(adapterSource).not.toMatch(
        /sceneAudioTimeoutRef|sceneAudioAnimationFrameRef|syncSceneAudioToPlayheadRef|sceneAudioPlaybackIntentRef/
      );
      expect(adapterSource).not.toMatch(
        /getSceneAudioPlayheadMs|resolveSceneAudioPlaybackDirective|resolveSceneAudioSyncState/
      );
    }
  });
});

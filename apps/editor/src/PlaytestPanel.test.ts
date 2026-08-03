import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { addDialogueTree, addInventoryItem } from "./project-helpers";
import {
  PlaytestPanel,
  PlaytestDialogueBox,
  PlaytestInventoryTray,
  resolveInventoryCursorPreviewFrameStyle,
  resolvePlaytestDialogueChoiceMarker,
  resolvePlaytestInventoryItemInitial,
  resolvePlaytestInventorySlotSelection,
  resolvePlaytestInventorySummary,
  resolvePlaytestInventoryToggleLabel,
  resolvePlaytestInventoryItemTooltip,
  resolvePlaytestStageHudClassName,
  resolvePlaytestVisualDurationMs,
  resolveStoredPlaytestLocale,
  shouldHandlePlaytestHotspotClick
} from "./PlaytestPanel";
import { useEditorStore } from "./store";

describe("resolvePlaytestInventorySummary", () => {
  it("prefers localized inventory names over plain item names", () => {
    const project = createDefaultProjectBundle("Playtest inventory");
    const item = addInventoryItem(project);
    item.name = "Lantern";
    project.strings.byLocale[project.manifest.defaultLanguage][item.textId] = "Localized Lantern";

    expect(
      resolvePlaytestInventorySummary([item], project.strings.byLocale[project.manifest.defaultLanguage])
    ).toBe("Localized Lantern");
  });

  it("returns Empty when there are no inventory items", () => {
    expect(resolvePlaytestInventorySummary([], {})).toBe("Empty");
  });
});

describe("resolveStoredPlaytestLocale", () => {
  it("uses the stored locale when it is supported", () => {
    expect(resolveStoredPlaytestLocale("fr", ["en", "fr"], "en")).toBe("fr");
  });

  it("falls back to the default locale when the stored locale is missing or unsupported", () => {
    expect(resolveStoredPlaytestLocale(null, ["en", "fr"], "en")).toBe("en");
    expect(resolveStoredPlaytestLocale("de", ["en", "fr"], "en")).toBe("en");
  });
});

describe("resolvePlaytestVisualDurationMs", () => {
  it("uses observed video metadata over stored asset duration", () => {
    expect(resolvePlaytestVisualDurationMs("video", 30000, 5500)).toBe(5500);
  });

  it("falls back to stored asset duration before video metadata loads", () => {
    expect(resolvePlaytestVisualDurationMs("video", 5500, undefined)).toBe(5500);
  });

  it("ignores observed video metadata for still image scenes", () => {
    expect(resolvePlaytestVisualDurationMs("image", 30000, 5500)).toBe(30000);
  });
});

describe("resolveInventoryCursorPreviewFrameStyle", () => {
  it("centers the selected inventory art on the cursor without a frame", () => {
    const style = resolveInventoryCursorPreviewFrameStyle({ x: 120, y: 80 });

    expect(style).toMatchObject({
      left: "120px",
      top: "80px",
      transform: "translate(-50%, -50%)",
      width: "48px",
      height: "48px",
      pointerEvents: "none"
    });
    expect(style).not.toHaveProperty("border");
    expect(style).not.toHaveProperty("background");
    expect(style).not.toHaveProperty("padding");
  });
});

describe("PlaytestInventoryTray", () => {
  it("uses compact fallback initials for inventory items without art", () => {
    expect(resolvePlaytestInventoryItemInitial(" red potion ")).toBe("R");
    expect(resolvePlaytestInventoryItemInitial("")).toBe("?");
  });

  it("uses item name and description for inventory item tooltips", () => {
    expect(resolvePlaytestInventoryItemTooltip("Red Potion", " Restores health. ")).toBe("Red Potion - Restores health.");
    expect(resolvePlaytestInventoryItemTooltip("Red Potion")).toBe("Red Potion");
  });

  it("uses the bag toggle copy for collapsed and expanded inventory states", () => {
    expect(resolvePlaytestInventoryToggleLabel(0, false)).toBe("Open inventory (0 items)");
    expect(resolvePlaytestInventoryToggleLabel(1, false)).toBe("Open inventory (1 item)");
    expect(resolvePlaytestInventoryToggleLabel(2, true)).toBe("Close inventory (2 items)");
  });

  it("closes the drawer after inventory item selection or cancellation", () => {
    expect(resolvePlaytestInventorySlotSelection("red-potion", false, { x: 120, y: 80 })).toEqual({
      nextSelectedItemId: "red-potion",
      nextIsExpanded: false,
      cursorPoint: { x: 120, y: 80 }
    });
    expect(resolvePlaytestInventorySlotSelection("red-potion", true, { x: 120, y: 80 })).toEqual({
      nextSelectedItemId: undefined,
      nextIsExpanded: false,
      cursorPoint: undefined
    });
  });

  it("marks the playtest HUD as click-catching only while the inventory drawer is open", () => {
    expect(resolvePlaytestStageHudClassName(false, false)).toBe("playtest-stage__hud");
    expect(resolvePlaytestStageHudClassName(true, false)).toBe(
      "playtest-stage__hud playtest-stage__hud--dialogue"
    );
    expect(resolvePlaytestStageHudClassName(false, true)).toBe(
      "playtest-stage__hud playtest-stage__hud--inventory-open"
    );
    expect(resolvePlaytestStageHudClassName(true, true)).toBe(
      "playtest-stage__hud playtest-stage__hud--dialogue playtest-stage__hud--inventory-open"
    );
  });

  it("renders an intentional empty state inside the inventory band", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PlaytestInventoryTray, {
        items: [],
        isExpanded: false,
        onExpandedChange: () => undefined,
        onSelectItem: () => undefined
      })
    );

    expect(markup).toContain("playtest-inventory-tray");
    expect(markup).toContain("playtest-inventory-toggle");
    expect(markup).toContain("playtest-inventory-toggle__icon");
    expect(markup).toContain("playtest-inventory-toggle__badge");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("playtest-inventory-tray__drawer");
    expect(markup).toContain("playtest-inventory-tray__empty");
    expect(markup).not.toContain("playtest-inventory-tray__ghost-slots");
    expect(markup).not.toContain("<h3>Inventory</h3>");
    expect(markup).toContain("Empty");
    expect(markup).not.toContain("No items yet");
    expect(markup).not.toContain("Picked-up items will appear here.");
    expect(markup).not.toContain("Ready an item from your pack.");
  });

  it("renders icon-only selectable item slots with no visible labels or tray counter", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PlaytestInventoryTray, {
        items: [
          {
            id: "red-potion",
            label: "Red Potion",
            tooltip: "Red Potion - Restores health.",
            selected: true
          }
        ],
        isExpanded: false,
        onExpandedChange: () => undefined,
        onSelectItem: () => undefined
      })
    );

    expect(markup).toContain("playtest-inventory-slot--selected");
    expect(markup).toContain("playtest-inventory-toggle--selected");
    expect(markup).not.toContain("playtest-inventory-tray--expanded");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="Open inventory (1 item)"');
    expect(markup).not.toContain("playtest-inventory-slot--ghost");
    expect(markup).not.toContain("empty-slot-");
    expect(markup).not.toContain("<h3>Inventory</h3>");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Red Potion"');
    expect(markup).toContain('title="Red Potion - Restores health."');
    expect(markup).not.toContain("playtest-inventory-slot__copy");
    expect(markup).not.toContain("playtest-inventory-slot__name");
    expect(markup).not.toContain("Selected");
    expect(markup).not.toContain("1 / 8");
    expect(markup).not.toContain("Use Red Potion on a compatible hotspot.");
    expect(markup).not.toContain("matching hotspot");
  });

  it("renders transient inventory feedback when provided", () => {
    const markup = renderToStaticMarkup(
      React.createElement(PlaytestInventoryTray, {
        items: [],
        hint: "Not here.",
        isExpanded: false,
        onExpandedChange: () => undefined,
        onSelectItem: () => undefined
      })
    );

    expect(markup).toContain("Not here.");
  });
});

describe("PlaytestPanel toolbar", () => {
  it("renders shared field wrappers so playtest controls can align on one row", () => {
    const project = createDefaultProjectBundle("Playtest toolbar");
    useEditorStore.setState({
      activeTab: "playtest",
      playtestLocale: project.manifest.defaultLanguage
    });

    const markup = renderToStaticMarkup(React.createElement(PlaytestPanel, { project, onExit: () => undefined }));

    expect(markup).toContain("playtest-panel__toolbar-field--playhead");
    expect(markup).toContain("playtest-panel__toolbar-field--locale");
    expect(markup).toContain("playtest-panel__toolbar-button");
    expect(markup).toContain("playtest-panel__toolbar-toggle");
    expect(markup).toContain("playtest-panel__toolbar-field--session");
    expect(markup).toContain("playtest-panel__toolbar-field--toggle");
    expect(markup).toContain('aria-label="Show hotspots in playtest"');
    expect(markup).toContain("playtest-hotspot-visibility-toggle__track");
    expect(markup).toContain("playtest-hotspot-visibility-toggle__thumb");
    expect(markup).toContain("Show hotspots");
    expect(markup).toContain("Reset Run");
    expect(markup).toContain("Save slots");
    expect(markup.match(/data-playtest-save-slot="/g)).toHaveLength(3);
    expect(markup.match(/data-playtest-save-slot-status="empty"/g)).toHaveLength(3);
    expect(markup).toContain("No save stored in this slot.");
    expect(markup).not.toContain("Back to Editor");
  });

  it("renders inventory inside the playtest canvas while keeping runtime state in the side panel", () => {
    const project = createDefaultProjectBundle("Playtest scene inventory");
    useEditorStore.setState({
      activeTab: "playtest",
      playtestLocale: project.manifest.defaultLanguage
    });

    const markup = renderToStaticMarkup(React.createElement(PlaytestPanel, { project, onExit: () => undefined }));

    expect(markup).toContain("playtest-stage");
    expect(markup).toContain("media-surface--playtest");
    expect(markup).toContain("playtest-stage__hud");
    expect(markup).toContain("playtest-stage__inventory");
    expect(markup).toContain("playtest-inventory-tray");
    expect(markup).toContain("Runtime State");
    expect(markup).not.toContain("playtest-inventory-section");
    expect(markup).not.toContain("playtest-inventory-panel");
  });
});

describe("PlaytestDialogueBox", () => {
  it("uses letter markers for the first dialogue choices and numeric markers after Z", () => {
    expect(resolvePlaytestDialogueChoiceMarker(0)).toBe("A");
    expect(resolvePlaytestDialogueChoiceMarker(25)).toBe("Z");
    expect(resolvePlaytestDialogueChoiceMarker(26)).toBe("27");
  });

  it("renders the active dialogue content and choices for the in-scene overlay", () => {
    const project = createDefaultProjectBundle("Playtest dialogue");
    const dialogue = addDialogueTree(project);
    const node = dialogue.nodes[0]!;
    const strings = project.strings.byLocale[project.manifest.defaultLanguage];

    const markup = renderToStaticMarkup(
      React.createElement(PlaytestDialogueBox, {
        activeDialogue: {
          tree: dialogue,
          node,
          choices: node.choices
        },
        strings,
        onChoice: () => undefined,
        onContinue: () => undefined
      })
    );

    expect(markup).toContain("dialogue-box--playtest-scene");
    expect(markup).toContain("dialogue-box__speaker");
    expect(markup).toContain("dialogue-box__text");
    expect(markup).toContain("dialogue-box__choices");
    expect(markup).toContain("dialogue-box__choice-marker");
    expect(markup).toContain("Hero");
    expect(markup).toContain("Opening line");
    expect(markup).toContain(">A</span>");
    expect(markup).toContain("Continue");
  });

  it("falls back to Narrator when a dialogue node has no speaker", () => {
    const project = createDefaultProjectBundle("Playtest narrator dialogue");
    const dialogue = addDialogueTree(project);
    const node = { ...dialogue.nodes[0]!, speaker: "" };

    const markup = renderToStaticMarkup(
      React.createElement(PlaytestDialogueBox, {
        activeDialogue: {
          tree: dialogue,
          node,
          choices: []
        },
        strings: project.strings.byLocale[project.manifest.defaultLanguage],
        onChoice: () => undefined,
        onContinue: () => undefined
      })
    );

    expect(markup).toContain("Narrator");
    expect(markup).toContain("dialogue-box__continue");
  });

  it("blocks map hotspot clicks while dialogue is active", () => {
    expect(shouldHandlePlaytestHotspotClick(true)).toBe(false);
    expect(shouldHandlePlaytestHotspotClick(false)).toBe(true);
  });

  it("blocks non-matching hotspot clicks while an inventory item is selected", () => {
    expect(shouldHandlePlaytestHotspotClick(false, "item_potion", { type: "none" })).toBe(false);
    expect(shouldHandlePlaytestHotspotClick(false, "item_potion", { type: "pickupItem", itemId: "item_key" })).toBe(false);
    expect(shouldHandlePlaytestHotspotClick(false, "item_potion", { type: "placeItem", itemId: "item_key" })).toBe(false);
    expect(shouldHandlePlaytestHotspotClick(false, "item_potion", { type: "placeItem", itemId: "item_potion" })).toBe(true);
  });
});

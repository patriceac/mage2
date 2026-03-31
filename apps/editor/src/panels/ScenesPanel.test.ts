import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle, type ProjectBundle } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import {
  ScenesPanel,
  filterInventoryPlacementOptions,
  resolveInventoryPickerKeyboardAction,
  resolveHotspotTransformKeyboardAction,
  resolveLocationSwitcherOptions,
  resolveNextHotspotInspectorOpenState,
  resolveInventoryPickerToggleResult,
  resolveSceneSwitcherMenuNavigation,
  resolveSceneSwitcherOptions,
  resolveScenesFloatingWindowVisibility,
  resolveDroppedInventoryHotspotBounds,
  resolveInventoryPreviewContentSize,
  resolveLinkedInventoryOptions,
  shouldDismissScenesHotspotSelectionOnEscape,
  shouldHandleHotspotTransformShortcut,
  shouldDismissScenesFloatingWindowsOnEscape
} from "./ScenesPanel";

const mockedStore = vi.hoisted(() => {
  const noop = () => {};

  return {
    state: {
      activeTab: "scenes",
      selectedSceneId: undefined as string | undefined,
      playheadMs: 0,
      selectedHotspotId: undefined as string | undefined,
      setSelectedSceneId: noop,
      setSelectedHotspotId: noop,
      setPlayheadMs: noop,
      updateProject: noop,
      captureUndoCheckpoint: noop
    } as any
  };
});

vi.mock("../store", () => {
  const useEditorStore = ((selector: (state: typeof mockedStore.state) => unknown) =>
    selector(mockedStore.state)) as typeof import("../store").useEditorStore;

  useEditorStore.setState = (partial) => {
    mockedStore.state = {
      ...mockedStore.state,
      ...(typeof partial === "function" ? partial(mockedStore.state as never) : partial)
    };
  };

  useEditorStore.getState = () => mockedStore.state as never;

  return { useEditorStore };
});

function renderScenesPanel(
  configureProject: (project: ProjectBundle) => void,
  configureStore?: (project: ProjectBundle) => void
) {
  const project = createDefaultProjectBundle("Scenes audio");
  configureProject(project);

  mockedStore.state = {
    ...mockedStore.state,
    activeTab: "scenes",
    selectedSceneId: project.scenes.items[0]?.id,
    selectedHotspotId: undefined,
    playheadMs: 0
  };
  configureStore?.(project);

  return renderToStaticMarkup(
    React.createElement(
      DialogProvider,
      null,
      React.createElement(ScenesPanel, {
        project,
        mutateProject: () => {},
        setSavedProject: () => {},
        setStatusMessage: () => {},
        setBusyLabel: () => {}
      })
    )
  );
}

describe("ScenesPanel scene audio UI", () => {
  it("shows an empty background state for scenes without assigned media", () => {
    const markup = renderScenesPanel((project) => {
      delete project.scenes.items[0].backgroundAssetId;
    });

    expect(markup).toContain("No background assigned");
    expect(markup).toContain("Upload Background");
    expect(markup).toContain("assign a background to this scene");
  });

  it("renders scene-audio authoring controls for image backgrounds", () => {
    const markup = renderScenesPanel((project) => {
      project.assets.assets.push(
        {
          id: "asset_background",
          kind: "image",
          name: "background.png",
          variants: {
            en: {
              sourcePath: "D:\\project\\assets\\background.png",
              importedAt: new Date().toISOString()
            }
          }
        },
        {
          id: "asset_scene_audio",
          kind: "audio",
          name: "ambience.mp3",
          category: "sceneAudio",
          variants: {
            en: {
              sourcePath: "D:\\project\\assets\\ambience.mp3",
              importedAt: new Date().toISOString()
            }
          }
        }
      );
      project.scenes.items[0].backgroundAssetId = "asset_background";
      project.scenes.items[0].sceneAudioAssetId = "asset_scene_audio";
    });

    expect(markup).toContain(">Scene Audio</span>");
    expect(markup).toContain("Replace Scene Audio");
    expect(markup).toContain("Clear audio");
    expect(markup).toContain('scenes-panel__scene-audio-loop-toggle');
    expect(markup).toContain(">Loop</span>");
    expect(markup).toContain(">Delay (ms)</span>");
    expect(markup).toContain("scenes-panel__scene-audio-frame");
    expect(markup).toContain("scenes-panel__scene-audio-settings");
    expect(markup).not.toContain("Loop scene audio");
    expect(markup).not.toContain("Start/Restart Delay (ms)");
    expect(markup).not.toContain("Applies before the first start and before each loop restart.");
    expect(markup).not.toContain("Clear Scene Audio");
    expect(markup).not.toContain(">Playback</span>");
    expect(markup.indexOf("Clear audio")).toBeLessThan(markup.indexOf(">Delay (ms)</span>"));
    expect(markup.indexOf(">Delay (ms)</span>")).toBeLessThan(markup.indexOf(">Loop</span>"));
  });

  it("renders a merged scene switcher and removes the standalone scene-name field", () => {
    const markup = renderScenesPanel(() => {});

    expect(markup).toContain("scene-switcher__control");
    expect(markup).toContain('aria-label="Scene name"');
    expect(markup).toContain("scene-switcher__trigger");
    expect(markup).not.toContain(">Scene Name</span>");
  });

  it("renders the location picker with the same switcher chrome in non-editable mode", () => {
    const markup = renderScenesPanel(() => {});

    expect(markup).toContain('aria-label="Switch location"');
    expect(markup).toContain("scene-switcher__control--button");
    expect(markup).toContain("scene-switcher__value");
  });

  it("uses the shared dropdown shell for non-scene selectors in the scenes workspace", () => {
    const markup = renderScenesPanel(() => {});
    const dropdownMatches = markup.match(/dropdown-select__native/g) ?? [];

    expect(dropdownMatches.length).toBeGreaterThanOrEqual(2);
    expect(markup).toContain("dropdown-select__trigger");
  });

  it("renders hotspot create, delete, and inventory placement actions above the scene-audio section", () => {
    const markup = renderScenesPanel(() => {});
    const createHotspotIndex = markup.indexOf("Create Hotspot");
    const deleteHotspotIndex = markup.indexOf("Delete Hotspot");
    const addInventoryItemIndex = markup.indexOf("Add Inventory Item");
    const backgroundAssetIndex = markup.indexOf(">Background Asset</span>");
    const sceneAudioIndex = markup.indexOf(">Scene Audio</span>");

    expect(createHotspotIndex).toBeGreaterThanOrEqual(0);
    expect(deleteHotspotIndex).toBeGreaterThanOrEqual(0);
    expect(addInventoryItemIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundAssetIndex).toBeGreaterThanOrEqual(0);
    expect(sceneAudioIndex).toBeGreaterThanOrEqual(0);
    expect(createHotspotIndex).toBeLessThan(sceneAudioIndex);
    expect(deleteHotspotIndex).toBeLessThan(sceneAudioIndex);
    expect(addInventoryItemIndex).toBeLessThan(sceneAudioIndex);
    expect(addInventoryItemIndex).toBeLessThan(backgroundAssetIndex);
    expect(backgroundAssetIndex).toBeLessThan(sceneAudioIndex);
    expect(createHotspotIndex).toBeLessThan(deleteHotspotIndex);
    expect(deleteHotspotIndex).toBeLessThan(addInventoryItemIndex);
    expect(markup).not.toContain("Clear Hotspot");
    expect(markup).toContain("button-danger-quiet");
  });

  it("builds scene switcher options with location subtitles", () => {
    const project = createDefaultProjectBundle("Scenes switcher");
    project.locations.items.push({
      id: "location_attic",
      name: "Attic",
      x: 240,
      y: 120,
      sceneIds: ["scene_attic"]
    });
    project.scenes.items.push({
      id: "scene_attic",
      locationId: "location_attic",
      name: "Opening Scene",
      backgroundAssetId: "asset_placeholder",
      sceneAudioLoop: true,
      sceneAudioDelayMs: 0,
      backgroundVideoLoop: false,
      hotspots: [],
      subtitleTracks: [],
      dialogueTreeIds: [],
      onEnterEffects: [],
      onExitEffects: []
    });

    expect(resolveSceneSwitcherOptions(project.scenes.items, project.locations.items, "scene_attic")).toEqual([
      {
        sceneId: project.scenes.items[0].id,
        sceneName: "Opening Scene",
        locationName: project.locations.items[0].name,
        isCurrent: false
      },
      {
        sceneId: "scene_attic",
        sceneName: "Opening Scene",
        locationName: "Attic",
        isCurrent: true
      }
    ]);
  });

  it("builds location switcher options with scene-count subtitles", () => {
    const project = createDefaultProjectBundle("Location switcher");
    project.locations.items.push({
      id: "location_attic",
      name: "Attic",
      x: 240,
      y: 120,
      sceneIds: []
    });
    project.scenes.items.push({
      id: "scene_attic",
      locationId: "location_attic",
      name: "Attic Scene",
      backgroundAssetId: "asset_placeholder",
      sceneAudioLoop: true,
      sceneAudioDelayMs: 0,
      backgroundVideoLoop: false,
      hotspots: [],
      subtitleTracks: [],
      dialogueTreeIds: [],
      onEnterEffects: [],
      onExitEffects: []
    });
    project.locations.items[1]!.sceneIds.push("scene_attic");

    expect(resolveLocationSwitcherOptions(project.locations.items, project.scenes.items, "location_attic")).toEqual([
      {
        locationId: project.locations.items[0].id,
        locationName: project.locations.items[0].name,
        sceneCountLabel: "1 scene",
        isCurrent: false
      },
      {
        locationId: "location_attic",
        locationName: "Attic",
        sceneCountLabel: "1 scene",
        isCurrent: true
      }
    ]);
  });

  it("navigates the scene switcher menu with arrow, home, and end keys", () => {
    expect(resolveSceneSwitcherMenuNavigation("ArrowDown", 0, 3)).toEqual({
      handled: true,
      nextIndex: 1
    });
    expect(resolveSceneSwitcherMenuNavigation("ArrowUp", 0, 3)).toEqual({
      handled: true,
      nextIndex: 2
    });
    expect(resolveSceneSwitcherMenuNavigation("Home", 2, 3)).toEqual({
      handled: true,
      nextIndex: 0
    });
    expect(resolveSceneSwitcherMenuNavigation("End", 0, 3)).toEqual({
      handled: true,
      nextIndex: 2
    });
    expect(resolveSceneSwitcherMenuNavigation("Escape", 1, 3)).toEqual({
      handled: false,
      nextIndex: 1
    });
  });

  it("renders the background selector directly above the scene-audio selector", () => {
    const markup = renderScenesPanel(() => {});
    const addInventoryItemIndex = markup.indexOf("Add Inventory Item");
    const backgroundAssetIndex = markup.indexOf(">Background Asset</span>");
    const sceneAudioIndex = markup.indexOf(">Scene Audio</span>");

    expect(addInventoryItemIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundAssetIndex).toBeGreaterThanOrEqual(0);
    expect(sceneAudioIndex).toBeGreaterThanOrEqual(0);
    expect(addInventoryItemIndex).toBeLessThan(backgroundAssetIndex);
    expect(backgroundAssetIndex).toBeLessThan(sceneAudioIndex);
  });

  it("removes the old scene-toolbar inventory hotspot flow", () => {
    const markup = renderScenesPanel(() => {});

    expect(markup).toContain("Add Inventory Item");
    expect(markup).not.toContain("Add Item Hotspot");
    expect(markup).not.toContain("No inventory items have valid art yet. Add an inventory image in Inventory first.");
    expect(markup).not.toContain("No inventory items with valid art");
  });

  it("filters placeable inventory items by display label and internal name", () => {
    const project = createDefaultProjectBundle("Scenes inventory search");
    project.assets.assets.push({
      id: "asset_item",
      kind: "image",
      name: "lantern.png",
      category: "inventory",
      variants: {
        en: {
          sourcePath: "D:\\project\\assets\\lantern.png",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.inventory.items.push({
      id: "item_lantern",
      name: "lantern_internal",
      textId: "text.item_lantern.name",
      descriptionTextId: "text.item_lantern.description",
      imageAssetId: "asset_item"
    });
    project.strings.byLocale.en["text.item_lantern.name"] = "Brass Lantern";
    project.strings.byLocale.en["text.item_lantern.description"] = "Warm brass lantern";

    const options = resolveLinkedInventoryOptions(
      project.inventory.items,
      project.assets.assets,
      project.strings.byLocale.en
    ).filter((option) => option.eligible);

    expect(filterInventoryPlacementOptions(options, "brass")).toHaveLength(1);
    expect(filterInventoryPlacementOptions(options, "lantern_internal")).toHaveLength(1);
    expect(filterInventoryPlacementOptions(options, "missing")).toHaveLength(0);
  });

  it("uses the preview content box when sizing dropped inventory items", () => {
    const previewContentSize = resolveInventoryPreviewContentSize({
      previewWidthPx: 76,
      previewHeightPx: 76,
      paddingTopPx: 7.2,
      paddingRightPx: 7.2,
      paddingBottomPx: 7.2,
      paddingLeftPx: 7.2,
      borderTopPx: 1,
      borderRightPx: 1,
      borderBottomPx: 1,
      borderLeftPx: 1
    });

    expect(previewContentSize.width).toBeCloseTo(59.6);
    expect(previewContentSize.height).toBeCloseTo(59.6);
  });

  it("converts dragged preview pixels into dropped hotspot bounds", () => {
    expect(
      resolveDroppedInventoryHotspotBounds({
        normalizedX: 0.5,
        normalizedY: 0.5,
        surfaceWidth: 400,
        surfaceHeight: 200,
        previewWidthPx: 80,
        previewHeightPx: 40
      })
    ).toEqual({
      x: 0.4,
      y: 0.4,
      width: 0.2,
      height: 0.2
    });
  });

  it("clamps dropped inventory bounds near the scene edge", () => {
    expect(
      resolveDroppedInventoryHotspotBounds({
        normalizedX: 0.98,
        normalizedY: 0.97,
        surfaceWidth: 200,
        surfaceHeight: 200,
        previewWidthPx: 80,
        previewHeightPx: 80
      })
    ).toEqual({
      x: 0.6,
      y: 0.6,
      width: 0.4,
      height: 0.4
    });
  });

  it("shows guidance and disables scene-audio imports for video backgrounds", () => {
    const markup = renderScenesPanel((project) => {
      project.assets.assets.push(
        {
          id: "asset_video",
          kind: "video",
          name: "intro.mp4",
          variants: {
            en: {
              sourcePath: "D:\\project\\assets\\intro.mp4",
              importedAt: new Date().toISOString(),
              durationMs: 5000
            }
          }
        },
        {
          id: "asset_scene_audio",
          kind: "audio",
          name: "ambience.mp3",
          category: "sceneAudio",
          variants: {
            en: {
              sourcePath: "D:\\project\\assets\\ambience.mp3",
              importedAt: new Date().toISOString(),
              durationMs: 8000
            }
          }
        }
      );
      project.scenes.items[0].backgroundAssetId = "asset_video";
      project.scenes.items[0].sceneAudioAssetId = "asset_scene_audio";
    });

    expect(markup).toContain("Scene audio imports are disabled while this scene uses a video background.");
    expect(markup).toContain(
      "Scene audio only plays when the background is an image. Clear the scene audio or switch back to an image background to resolve validation errors."
    );
  });

  it("renders the hotspot inspector as a floating window when a hotspot is selected", () => {
    const markup = renderScenesPanel(
      () => {},
      (project) => {
        mockedStore.state.selectedHotspotId = project.scenes.items[0].hotspots[0]?.id;
      }
    );

    expect(markup).toContain("scenes-floating-inspector");
    expect(markup).toContain("Hide the floating hotspot inspector.");
    expect(markup).toContain('>Inventory Item</span>');
    expect(markup).toContain(">Editing Help</summary>");
    expect(markup).not.toContain(
      '<p class="muted">Links this hotspot to an inventory item and uses that item&#x27;s art in the scene.</p>'
    );
    expect(markup).toContain(">Angle (");
    expect(markup).toContain(
      "Arrows move, Shift+arrows resize, Alt+Left/Right rotate, drag the top handle to rotate, Shift snaps, and Ctrl fine-tunes."
    );
    expect(markup).not.toContain("open=\"\"");
    expect(markup).not.toContain("scenes-floating-inspector__grip");
  });

  it("shows shared transform guidance for selected inventory hotspots", () => {
    const markup = renderScenesPanel(
      (project) => {
        project.scenes.items[0].hotspots[0]!.inventoryItemId = "item_lantern";
      },
      (project) => {
        mockedStore.state.selectedHotspotId = project.scenes.items[0].hotspots[0]?.id;
      }
    );

    expect(markup).toContain(
      "Arrows move, Shift+arrows resize, Alt+Left/Right rotate, drag the top handle to rotate, Shift snaps, and Ctrl fine-tunes."
    );
    expect(markup).toContain(">Angle (");
  });

  it("shows only the hotspot inspector when both floating-window sources are active", () => {
    expect(resolveScenesFloatingWindowVisibility(true, true, true)).toEqual({
      isInventoryPickerVisible: false,
      isHotspotInspectorVisible: true
    });
  });

  it("hides the hotspot inspector when a hotspot remains selected after the inspector closes", () => {
    expect(resolveScenesFloatingWindowVisibility(false, true, false)).toEqual({
      isInventoryPickerVisible: false,
      isHotspotInspectorVisible: false
    });
  });

  it("requires a second click to open the inspector after hotspot selection", () => {
    expect(resolveNextHotspotInspectorOpenState(false, undefined, "hotspot_item", "preserve")).toBe(false);
    expect(resolveNextHotspotInspectorOpenState(true, undefined, "hotspot_item", "preserve")).toBe(true);
    expect(resolveNextHotspotInspectorOpenState(false, undefined, "hotspot_item", "open")).toBe(true);
    expect(resolveNextHotspotInspectorOpenState(false, undefined, "hotspot_item", "toggle")).toBe(false);
    expect(resolveNextHotspotInspectorOpenState(true, "hotspot_item", "hotspot_item", "toggle")).toBe(false);
    expect(resolveNextHotspotInspectorOpenState(false, "hotspot_item", "hotspot_item", "toggle")).toBe(true);
    expect(resolveNextHotspotInspectorOpenState(false, "hotspot_other", "hotspot_item", "toggle")).toBe(false);
    expect(resolveNextHotspotInspectorOpenState(true, "hotspot_other", "hotspot_item", "toggle")).toBe(true);
    expect(resolveNextHotspotInspectorOpenState(true, "hotspot_item", undefined, "preserve")).toBe(false);
  });

  it("clears the hotspot selection when opening the inventory picker", () => {
    expect(resolveInventoryPickerToggleResult(false)).toEqual({
      nextIsInventoryPickerOpen: true,
      shouldClearSelectedHotspot: true
    });
    expect(resolveInventoryPickerToggleResult(true)).toEqual({
      nextIsInventoryPickerOpen: false,
      shouldClearSelectedHotspot: false
    });
  });

  it("dismisses floating windows only for an unmodified Escape press outside modal dialogs", () => {
    expect(
      shouldDismissScenesFloatingWindowsOnEscape(
        {
          altKey: false,
          ctrlKey: false,
          defaultPrevented: false,
          key: "Escape",
          metaKey: false,
          repeat: false,
          shiftKey: false
        },
        true,
        false
      )
    ).toBe(true);

    expect(
      shouldDismissScenesFloatingWindowsOnEscape(
        {
          altKey: false,
          ctrlKey: false,
          defaultPrevented: false,
          key: "Escape",
          metaKey: false,
          repeat: false,
          shiftKey: false
        },
        true,
        true
      )
    ).toBe(false);

    expect(
      shouldDismissScenesFloatingWindowsOnEscape(
        {
          altKey: false,
          ctrlKey: true,
          defaultPrevented: false,
          key: "Escape",
          metaKey: false,
          repeat: false,
          shiftKey: false
        },
        true,
        false
      )
    ).toBe(false);
  });

  it("clears the selected hotspot only after floating windows are already hidden", () => {
    expect(
      shouldDismissScenesHotspotSelectionOnEscape(
        {
          altKey: false,
          ctrlKey: false,
          defaultPrevented: false,
          key: "Escape",
          metaKey: false,
          repeat: false,
          shiftKey: false
        },
        true,
        false,
        false,
        false
      )
    ).toBe(true);

    expect(
      shouldDismissScenesHotspotSelectionOnEscape(
        {
          altKey: false,
          ctrlKey: false,
          defaultPrevented: false,
          key: "Escape",
          metaKey: false,
          repeat: false,
          shiftKey: false
        },
        true,
        false,
        false,
        true
      )
    ).toBe(false);

    expect(
      shouldDismissScenesHotspotSelectionOnEscape(
        {
          altKey: false,
          ctrlKey: false,
          defaultPrevented: false,
          key: "Escape",
          metaKey: false,
          repeat: false,
          shiftKey: false
        },
        true,
        false,
        true,
        false
      )
    ).toBe(false);
  });

  it("navigates the inventory picker list with arrow, home/end, and page keys", () => {
    const itemIds = ["candle", "potion", "key", "map", "coin"];

    expect(resolveInventoryPickerKeyboardAction("ArrowDown", itemIds, "potion")).toEqual({
      handled: true,
      nextActiveItemId: "key",
      shouldPlaceActiveItem: false
    });
    expect(resolveInventoryPickerKeyboardAction("ArrowUp", itemIds, "potion")).toEqual({
      handled: true,
      nextActiveItemId: "candle",
      shouldPlaceActiveItem: false
    });
    expect(resolveInventoryPickerKeyboardAction("Home", itemIds, "map")).toEqual({
      handled: true,
      nextActiveItemId: "candle",
      shouldPlaceActiveItem: false
    });
    expect(resolveInventoryPickerKeyboardAction("End", itemIds, "potion")).toEqual({
      handled: true,
      nextActiveItemId: "coin",
      shouldPlaceActiveItem: false
    });
    expect(resolveInventoryPickerKeyboardAction("PageDown", itemIds, "potion", 2)).toEqual({
      handled: true,
      nextActiveItemId: "map",
      shouldPlaceActiveItem: false
    });
    expect(resolveInventoryPickerKeyboardAction("PageUp", itemIds, "map", 2)).toEqual({
      handled: true,
      nextActiveItemId: "potion",
      shouldPlaceActiveItem: false
    });
  });

  it("places the active inventory item with Enter", () => {
    expect(resolveInventoryPickerKeyboardAction("Enter", ["candle", "potion"], "potion")).toEqual({
      handled: true,
      nextActiveItemId: "potion",
      shouldPlaceActiveItem: true
    });
    expect(resolveInventoryPickerKeyboardAction("Enter", ["candle", "potion"])).toEqual({
      handled: true,
      nextActiveItemId: "candle",
      shouldPlaceActiveItem: true
    });
    expect(resolveInventoryPickerKeyboardAction("Enter", [], "potion")).toEqual({
      handled: false,
      shouldPlaceActiveItem: false
    });
  });

  it("maps hotspot transform shortcuts to move, resize, and rotate actions", () => {
    expect(
      resolveHotspotTransformKeyboardAction("ArrowLeft", {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false
      })
    ).toEqual({
      handled: true,
      transform: {
        kind: "move",
        deltaXPx: -10,
        deltaYPx: 0
      }
    });

    expect(
      resolveHotspotTransformKeyboardAction("ArrowUp", {
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false
      })
    ).toEqual({
      handled: true,
      transform: {
        kind: "move",
        deltaXPx: 0,
        deltaYPx: -1
      }
    });

    expect(
      resolveHotspotTransformKeyboardAction("ArrowRight", {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: true
      })
    ).toEqual({
      handled: true,
      transform: {
        kind: "resize",
        axis: "x",
        deltaPx: 10
      }
    });

    expect(
      resolveHotspotTransformKeyboardAction("ArrowUp", {
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        shiftKey: true
      })
    ).toEqual({
      handled: true,
      transform: {
        kind: "resize",
        axis: "y",
        deltaPx: 1
      }
    });

    expect(
      resolveHotspotTransformKeyboardAction("ArrowDown", {
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        shiftKey: true
      })
    ).toEqual({
      handled: true,
      transform: {
        kind: "resize",
        axis: "y",
        deltaPx: -1
      }
    });

    expect(
      resolveHotspotTransformKeyboardAction("ArrowRight", {
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false
      })
    ).toEqual({
      handled: true,
      transform: {
        kind: "rotate",
        deltaDegrees: 15
      }
    });

    expect(
      resolveHotspotTransformKeyboardAction("ArrowLeft", {
        altKey: true,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false
      })
    ).toEqual({
      handled: true,
      transform: {
        kind: "rotate",
        deltaDegrees: -1
      }
    });
  });

  it("gates hotspot transforms to the focused scene preview", () => {
    expect(
      shouldHandleHotspotTransformShortcut({
        defaultPrevented: false,
        hasDialogOverlay: false,
        hasSelectedHotspot: true,
        isScenePreviewFocused: true,
        isScenesTabActive: true,
        isTargetInsideFloatingWindow: false,
        isTargetTextEntry: false
      })
    ).toBe(true);

    expect(
      shouldHandleHotspotTransformShortcut({
        defaultPrevented: false,
        hasDialogOverlay: false,
        hasSelectedHotspot: true,
        isScenePreviewFocused: false,
        isScenesTabActive: true,
        isTargetInsideFloatingWindow: false,
        isTargetTextEntry: false
      })
    ).toBe(false);

    expect(
      shouldHandleHotspotTransformShortcut({
        defaultPrevented: false,
        hasDialogOverlay: false,
        hasSelectedHotspot: true,
        isScenePreviewFocused: true,
        isScenesTabActive: true,
        isTargetInsideFloatingWindow: true,
        isTargetTextEntry: false
      })
    ).toBe(false);

    expect(
      shouldHandleHotspotTransformShortcut({
        defaultPrevented: false,
        hasDialogOverlay: false,
        hasSelectedHotspot: true,
        isScenePreviewFocused: true,
        isScenesTabActive: true,
        isTargetInsideFloatingWindow: false,
        isTargetTextEntry: true
      })
    ).toBe(false);
  });
});

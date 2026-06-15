import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle, resolveHotspotInventoryAction, type ProjectBundle } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import {
  ScenesPanel,
  applyHotspotInventoryAction,
  applyInventoryLinkToHotspot,
  filterInventoryPlacementOptions,
  formatCanvasZoomLabel,
  resolveInventoryPickerKeyboardAction,
  resolveHotspotTransformKeyboardAction,
  resolveHotspotInventoryActionSummary,
  resolveLocationSwitcherOptions,
  resolveNextHotspotInspectorOpenState,
  resolveInventoryPickerToggleResult,
  resolveSceneActionMenuItems,
  resolveSceneSwitcherMenuNavigation,
  resolveSceneSwitcherOptions,
  resolveScenesFloatingWindowVisibility,
  resolveDroppedInventoryHotspotBounds,
  resolveInventoryDragPreviewOffset,
  resolveInventoryPreviewContentSize,
  resolveLinkedInventoryOptions,
  shouldApplyHotspotInspectorOpenRequest,
  shouldDismissScenesHotspotSelectionOnEscape,
  shouldHandleHotspotTransformShortcut,
  shouldDismissScenesFloatingWindowsOnEscape
} from "./ScenesPanel";
import { addInventoryItem } from "../project-helpers";

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
    expect(markup).not.toContain("Drop image or video on the preview to replace this scene's background.");
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

  it("uses the scene list overflow menu for per-scene actions", () => {
    const markup = renderScenesPanel(() => {});

    expect(markup).toContain("scenes-panel__scene-list-action");
    expect(markup).toContain("Open actions for");
    expect(markup).not.toContain("scenes-panel__delete-scene-button");
    expect(markup).not.toContain("Delete Scene");
    expect(resolveSceneActionMenuItems()).toEqual(["rename", "delete"]);
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

  it("keeps dialogue triggering out of scene-level wiring", () => {
    const markup = renderScenesPanel((project) => {
      project.dialogues.items.push({
        id: "dialogue_intro",
        name: "Intro Dialogue",
        startNodeId: "node_intro",
        nodes: [
          {
            id: "node_intro",
            speaker: "Guide",
            textId: "text.node_intro.line",
            choices: [],
            effects: []
          }
        ]
      });
    });

    expect(markup).not.toContain("Scene Dialogues");
    expect(markup).not.toContain("Intro Dialogue");
  });

  it("renders hotspot create, inventory placement, and delete actions in the scene action rail", () => {
    const markup = renderScenesPanel(() => {});
    const createHotspotIndex = markup.indexOf("Create Hotspot");
    const addInventoryItemIndex = markup.indexOf("Add Inventory Item");
    const deleteButtonIndex = markup.indexOf(">Delete</button>");
    const actionRailIndex = markup.indexOf('class="scenes-panel__action-rail"');

    expect(actionRailIndex).toBeGreaterThanOrEqual(0);
    expect(createHotspotIndex).toBeGreaterThanOrEqual(0);
    expect(addInventoryItemIndex).toBeGreaterThanOrEqual(0);
    expect(deleteButtonIndex).toBeGreaterThanOrEqual(0);
    expect(actionRailIndex).toBeLessThan(createHotspotIndex);
    expect(createHotspotIndex).toBeLessThan(addInventoryItemIndex);
    expect(addInventoryItemIndex).toBeLessThan(deleteButtonIndex);
    expect(markup).not.toContain("Clear Hotspot");
    expect(markup).not.toContain("Delete Hotspot");
    expect(markup).toContain("button-danger-quiet");
  });

  it("renders wired canvas view controls with active tool state and zoom label", () => {
    const markup = renderScenesPanel(() => {});

    expect(markup).toContain('aria-label="Select tool"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Pan tool"');
    expect(markup).toContain('aria-label="Zoom tool"');
    expect(markup).toContain('aria-label="Fit scene preview"');
    expect(markup).toContain("Cycle the scene preview zoom level.");
    expect(markup).toContain(">100%</span>");
    expect(markup).not.toContain(">Fit</span>");
    expect(markup).not.toContain("Canvas fit mode.");
    expect(formatCanvasZoomLabel(1.25)).toBe("125%");
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
    const sceneMediaIndex = markup.indexOf(">Scene media</span>");
    const backgroundAssetIndex = markup.indexOf(">Background Asset</span>");
    const sceneAudioIndex = markup.indexOf(">Scene Audio</span>");

    expect(sceneMediaIndex).toBeGreaterThanOrEqual(0);
    expect(backgroundAssetIndex).toBeGreaterThanOrEqual(0);
    expect(sceneAudioIndex).toBeGreaterThanOrEqual(0);
    expect(sceneMediaIndex).toBeLessThan(backgroundAssetIndex);
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

  it("preserves the cursor grab point inside the inventory drag preview art", () => {
    const offset = resolveInventoryDragPreviewOffset({
      clientX: 142,
      clientY: 188,
      previewLeftPx: 100,
      previewTopPx: 150,
      previewWidthPx: 76,
      previewHeightPx: 76,
      paddingTopPx: 7,
      paddingRightPx: 7,
      paddingBottomPx: 7,
      paddingLeftPx: 7,
      borderTopPx: 1,
      borderRightPx: 1,
      borderBottomPx: 1,
      borderLeftPx: 1
    });

    expect(offset).toEqual({ x: 34, y: 30 });
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
    expect(markup).toContain(">Behavior</span>");
    expect(markup).toContain("Pick up item");
    expect(markup).toContain("Place item here");
    expect(markup).toContain(">Item</span>");
    expect(markup).toContain(">Start Dialogue</span>");
    expect(markup).toContain("Create a dialogue in the Dialogue tab, then choose it here.");
    expect(markup).toContain('class="scenes-floating-inspector__sections"');
    expect(markup).toContain(">Identity</summary>");
    expect(markup).toContain(">Action</summary>");
    expect(markup).toContain(">Geometry</summary>");
    expect(markup).toContain(">Timing</summary>");
    expect(markup).toContain(">Navigation</summary>");
    expect(markup).toContain(">Advanced</summary>");
    expect(markup).not.toContain(">Editing Help</summary>");
    expect(markup).not.toContain(
      '<p class="muted">Links this hotspot to an inventory item and uses that item&#x27;s art in the scene.</p>'
    );
    expect(markup).toContain(">Angle (");
    expect(markup).not.toContain(
      "Arrows move, Shift+arrows resize, Alt+Left/Right rotate, drag the top handle to rotate, Shift snaps, and Ctrl fine-tunes."
    );
    expect(markup).toContain("open=\"\"");
    expect(markup).not.toContain("scenes-floating-inspector__grip");
  });

  it("shows available dialogue trees in the selected hotspot inspector", () => {
    const markup = renderScenesPanel(
      (project) => {
        project.dialogues.items.push({
          id: "dialogue_intro",
          name: "Intro Dialogue",
          startNodeId: "node_intro",
          nodes: [
            {
              id: "node_intro",
              speaker: "Guide",
              textId: "text.node_intro.line",
              choices: [],
              effects: []
            }
          ]
        });
        project.scenes.items[0].hotspots[0]!.dialogueTreeId = "dialogue_intro";
      },
      (project) => {
        mockedStore.state.selectedHotspotId = project.scenes.items[0].hotspots[0]?.id;
      }
    );

    expect(markup).toContain(">Start Dialogue</span>");
    expect(markup).toContain("No dialogue");
    expect(markup).toContain("Intro Dialogue");
    expect(markup).not.toContain("Create a dialogue in the Dialogue tab");
    expect(markup).toContain("Advanced Effects JSON");
  });

  it("shows scene-duration timing for selected default hotspots", () => {
    const markup = renderScenesPanel(
      (project) => {
        project.assets.assets.push({
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
        });
        project.scenes.items[0].backgroundAssetId = "asset_video";
      },
      (project) => {
        mockedStore.state.selectedHotspotId = project.scenes.items[0].hotspots[0]?.id;
      }
    );

    expect(markup).toContain("Use scene duration");
    expect(markup).toContain('value="5000"');
    expect(markup).toContain("disabled");
  });

  it("shows shared transform controls for selected inventory hotspots", () => {
    const markup = renderScenesPanel(
      (project) => {
        project.scenes.items[0].hotspots[0]!.inventoryItemId = "item_lantern";
      },
      (project) => {
        mockedStore.state.selectedHotspotId = project.scenes.items[0].hotspots[0]?.id;
      }
    );

    expect(markup).toContain(">Geometry</summary>");
    expect(markup).toContain(">Angle (");
  });

  it("makes newly placed inventory props pickup actions by default", () => {
    const project = createDefaultProjectBundle("Scenes pickup item");
    const item = addInventoryItem(project);
    const hotspot = project.scenes.items[0]!.hotspots[0]!;
    const strings = project.strings.byLocale[project.manifest.defaultLanguage];
    strings[item.textId] = "Candle";

    applyInventoryLinkToHotspot(hotspot, item, strings);

    expect(hotspot.name).toBe("Candle");
    expect(resolveHotspotInventoryAction(hotspot)).toMatchObject({
      type: "pickupItem",
      itemId: item.id,
      completionFlag: `hotspot.${hotspot.id}.pickedUp`
    });
    expect(hotspot.conditions).toContainEqual({
      type: "flagEquals",
      flag: `hotspot.${hotspot.id}.pickedUp`,
      value: false
    });
    expect(hotspot.effects).toContainEqual({ type: "addItem", itemId: item.id });
    expect(hotspot.effects).toContainEqual({
      type: "setFlag",
      flag: `hotspot.${hotspot.id}.pickedUp`,
      value: true
    });
  });

  it("switches a pickup hotspot to a place-item target without keeping pickup effects", () => {
    const project = createDefaultProjectBundle("Scenes place item");
    const item = addInventoryItem(project);
    const hotspot = project.scenes.items[0]!.hotspots[0]!;

    applyHotspotInventoryAction(hotspot, "pickupItem", item.id);
    applyHotspotInventoryAction(hotspot, "placeItem", item.id);

    expect(resolveHotspotInventoryAction(hotspot)).toMatchObject({
      type: "placeItem",
      itemId: item.id,
      completionFlag: `hotspot.${hotspot.id}.placed`
    });
    expect(hotspot.inventoryItemId).toBeUndefined();
    expect(hotspot.placedInventoryItemId).toBe(item.id);
    expect(hotspot.requiredItemIds).toContain(item.id);
    expect(hotspot.effects).not.toContainEqual({ type: "addItem", itemId: item.id });
    expect(hotspot.effects).toContainEqual({ type: "removeItem", itemId: item.id });
  });

  it("summarizes pickup hotspots as supported inventory behavior", () => {
    expect(resolveHotspotInventoryActionSummary("pickupItem", "Candle")).toBe(
      "Adds Candle to inventory and hides this hotspot after pickup."
    );
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

  it("requires a second click to open the inspector after hotspot selection and preserves that state across deselection", () => {
    expect(resolveNextHotspotInspectorOpenState(false, undefined, "hotspot_item", "preserve")).toBe(false);
    expect(resolveNextHotspotInspectorOpenState(true, undefined, "hotspot_item", "preserve")).toBe(true);
    expect(resolveNextHotspotInspectorOpenState(false, undefined, "hotspot_item", "open")).toBe(true);
    expect(resolveNextHotspotInspectorOpenState(false, undefined, "hotspot_item", "toggle")).toBe(false);
    expect(resolveNextHotspotInspectorOpenState(true, "hotspot_item", "hotspot_item", "toggle")).toBe(false);
    expect(resolveNextHotspotInspectorOpenState(false, "hotspot_item", "hotspot_item", "toggle")).toBe(true);
    expect(resolveNextHotspotInspectorOpenState(false, "hotspot_other", "hotspot_item", "toggle")).toBe(false);
    expect(resolveNextHotspotInspectorOpenState(true, "hotspot_other", "hotspot_item", "toggle")).toBe(true);
    expect(resolveNextHotspotInspectorOpenState(false, "hotspot_item", undefined, "preserve")).toBe(false);
    expect(resolveNextHotspotInspectorOpenState(true, "hotspot_item", undefined, "preserve")).toBe(true);
    expect(resolveNextHotspotInspectorOpenState(true, undefined, "hotspot_item", "toggle")).toBe(true);
  });

  it("applies automation hotspot inspector open requests only for a new request with a selected hotspot", () => {
    expect(shouldApplyHotspotInspectorOpenRequest(1, 0, true)).toBe(true);
    expect(shouldApplyHotspotInspectorOpenRequest(1, 1, true)).toBe(false);
    expect(shouldApplyHotspotInspectorOpenRequest(1, 0, false)).toBe(false);
    expect(shouldApplyHotspotInspectorOpenRequest(undefined, undefined, true)).toBe(false);
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

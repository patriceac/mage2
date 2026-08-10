import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle, resolveHotspotInventoryAction, type HotspotEvent, type ProjectBundle } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import {
  ScenesPanel,
  resolveHotspotTransformKeyboardAction,
  resolveNextHotspotInspectorOpenState,
  resolveScenesFloatingWindowVisibility,
  shouldApplyHotspotInspectorOpenRequest,
  shouldDismissScenesHotspotSelectionOnEscape,
  shouldHandleHotspotTransformShortcut,
  shouldDismissScenesFloatingWindowsOnEscape
} from "./ScenesPanel";
import { formatCanvasZoomLabel } from "./scenes/SceneCanvas";
import {
  resolveInventoryPickerKeyboardAction,
  resolveInventoryPickerToggleResult
} from "./scenes/InventoryPlacementPickerWindow";
import {
  resolveLocationSwitcherOptions,
  resolveSceneActionMenuItems,
  resolveSceneSwitcherMenuNavigation,
  resolveSceneSwitcherOptions
} from "./scenes/SceneListRail";
import { SceneInspectorPresentationIcon } from "./scenes/SceneEditorIcons";
import {
  applyHotspotFeedbackValue,
  applyHotspotEventActionUpdate,
  applyHotspotInventoryAction,
  applyInventoryLinkToHotspot,
  resolveHotspotFeedbackValue,
  resolveHotspotInventoryActionSummary,
  updateOptionalHotspotEvent
} from "./scenes/hotspot-domain";
import {
  filterInventoryPlacementOptions,
  resolveDroppedInventoryHotspotBounds,
  resolveInventoryDragPreviewOffset,
  resolveInventoryPreviewContentSize,
  resolveLinkedInventoryOptions
} from "./scenes/inventory-placement-domain";
import {
  applySceneBackgroundAsset,
  canAssignSceneBackgroundAsset,
  loadHotspotInspectorDockWidth,
  loadHotspotInspectorPresentation,
  loadCornerFirstHotspotHandlesPreference,
  resolveCornerFirstHotspotHandlesPreferenceValue,
  resolveHotspotInspectorDockWidthValue,
  resolveHotspotInspectorPresentation,
  resolveSceneAudioDropAcceptance,
  saveCornerFirstHotspotHandlesPreference,
  saveHotspotInspectorDockWidth,
  saveHotspotInspectorPresentation
} from "./scenes/scene-domain";
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

describe("hotspot player feedback", () => {
  it("maps the single friendly selector to responses, dialogues, and silence", () => {
    const event: HotspotEvent = { effects: [] };

    applyHotspotFeedbackValue(event, "group:response_group_wrong_item");
    expect(event).toMatchObject({ response: { type: "group", groupId: "response_group_wrong_item" } });
    expect(resolveHotspotFeedbackValue(event)).toBe("group:response_group_wrong_item");

    applyHotspotFeedbackValue(event, "dialogue:dialogue_intro");
    expect(event).toMatchObject({ dialogueTreeId: "dialogue_intro" });
    expect(event).not.toHaveProperty("response");

    applyHotspotFeedbackValue(event, "");
    expect(event).not.toHaveProperty("dialogueTreeId");
    expect(event).not.toHaveProperty("response");
  });
});

describe("hotspot inspector presentation icons", () => {
  it("renders distinct decorative targets for floating and right-docked panels", () => {
    const floatingMarkup = renderToStaticMarkup(
      React.createElement(SceneInspectorPresentationIcon, { target: "floating" })
    );
    const dockedMarkup = renderToStaticMarkup(
      React.createElement(SceneInspectorPresentationIcon, { target: "docked" })
    );

    expect(floatingMarkup).toContain('data-icon="float-panel"');
    expect(dockedMarkup).toContain('data-icon="dock-right-panel"');
    expect(floatingMarkup).toContain('aria-hidden="true"');
    expect(dockedMarkup).toContain('aria-hidden="true"');
    expect(floatingMarkup).not.toBe(dockedMarkup);
  });
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
    expect(markup).toContain("scenes-panel__playhead-row scenes-panel__playhead-row--audio");
    expect(markup).not.toContain("Drop image or video on the preview to replace this scene's background.");
    expect(markup).not.toContain("Loop scene audio");
    expect(markup).not.toContain("Start/Restart Delay (ms)");
    expect(markup).not.toContain("Applies before the first start and before each loop restart.");
    expect(markup).not.toContain("Clear Scene Audio");
    expect(markup).not.toContain(">Playback</span>");
    expect(markup.indexOf("Clear audio")).toBeLessThan(markup.indexOf(">Delay (ms)</span>"));
    expect(markup.indexOf(">Delay (ms)</span>")).toBeLessThan(markup.indexOf(">Loop</span>"));
  });

  it("allows video background choices while scene audio is assigned", () => {
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
              importedAt: new Date().toISOString()
            }
          }
        }
      );
      project.scenes.items[0].backgroundAssetId = "asset_background";
      project.scenes.items[0].sceneAudioAssetId = "asset_scene_audio";
    });

    const imageOption = markup.match(/<option[^>]*value="asset_background"[^>]*>background\.png<\/option>/)?.[0];
    const videoOption = markup.match(/<option[^>]*value="asset_video"[^>]*>intro\.mp4<\/option>/)?.[0];

    expect(imageOption).toBeDefined();
    expect(imageOption).not.toContain('disabled=""');
    expect(videoOption).toBeDefined();
    expect(videoOption).not.toContain('disabled=""');
    expect(markup).not.toContain("Clear scene audio before choosing a video background.");
    expect(markup).toContain("Create a new background asset from an image or video file and assign it to this scene.");
  });

  it("keeps the empty scene-audio drop target compact", () => {
    const markup = renderScenesPanel((project) => {
      project.assets.assets.push({
        id: "asset_background",
        kind: "image",
        name: "background.png",
        variants: {
          en: {
            sourcePath: "D:\\project\\assets\\background.png",
            importedAt: new Date().toISOString()
          }
        }
      });
      project.scenes.items[0].backgroundAssetId = "asset_background";
      project.scenes.items[0].sceneAudioAssetId = undefined;
    });

    expect(markup).toContain("Drop scene audio here");
    expect(markup).toContain("scenes-panel__scene-audio-dropzone--empty");
    expect(markup).not.toContain("scenes-panel__scene-audio-frame");
    expect(markup).not.toContain("Clear audio");
    expect(markup).not.toContain(">Delay (ms)</span>");
    expect(markup).not.toContain("scenes-panel__playhead-row");
    expect(markup).not.toContain(">Playhead ");
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
    const deleteButtonIndex = markup.indexOf('class="scenes-panel__tool-label">Delete</span>');
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

  it("renders a selected hotspot inspector in the docked right workbench host", () => {
    const markup = renderScenesPanel(
      () => {},
      (project) => {
        mockedStore.state.selectedHotspotId = project.scenes.items[0]?.hotspots[0]?.id;
      }
    );

    expect(markup).toContain("scenes-panel__stage-layout--inspector-docked");
    expect(markup).toContain("scenes-panel__right-rail--inspector-docked");
    expect(markup).toContain("scenes-floating-inspector-layer--docked");
    expect(markup).toContain('role="complementary"');
    expect(markup).toContain('aria-label="Resize hotspot inspector"');
    expect(markup).toContain('aria-label="Float"');
    expect(markup).toContain('data-icon="float-panel"');
    expect(markup).not.toContain(">Float</button>");
  });

  it("renders wired canvas view controls with active tool state and zoom label", () => {
    const markup = renderScenesPanel(() => {});

    expect(markup).toContain('aria-label="Select tool"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Pan tool"');
    expect(markup).toContain('aria-label="Zoom tool"');
    expect(markup).toContain('aria-label="Fit scene preview"');
    expect(markup).toContain('aria-label="Corner-first handles"');
    expect(markup).toContain("Corner-first handles: center handles stay derived until moved.");
    expect(markup).toContain("Cycle the scene preview zoom level.");
    expect(markup).toContain(">100%</span>");
    expect(markup).not.toContain(">Fit</span>");
    expect(markup).not.toContain("Canvas fit mode.");
    expect(formatCanvasZoomLabel(1.25)).toBe("125%");
  });

  it("defaults hotspot corner handles to corner-first mode and stores the setting", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };

    expect(resolveCornerFirstHotspotHandlesPreferenceValue(undefined)).toBe(true);
    expect(resolveCornerFirstHotspotHandlesPreferenceValue("true")).toBe(true);
    expect(resolveCornerFirstHotspotHandlesPreferenceValue("false")).toBe(false);
    expect(loadCornerFirstHotspotHandlesPreference(storage)).toBe(true);

    saveCornerFirstHotspotHandlesPreference(false, storage);
    expect(loadCornerFirstHotspotHandlesPreference(storage)).toBe(false);

    saveCornerFirstHotspotHandlesPreference(true, storage);
    expect(loadCornerFirstHotspotHandlesPreference(storage)).toBe(true);
  });

  it("defaults the hotspot inspector to a docked layout and clamps its stored width", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };

    expect(resolveHotspotInspectorPresentation(undefined)).toBe("docked");
    expect(resolveHotspotInspectorPresentation("floating")).toBe("floating");
    expect(resolveHotspotInspectorPresentation("unknown")).toBe("docked");
    expect(loadHotspotInspectorPresentation(storage)).toBe("docked");

    saveHotspotInspectorPresentation("floating", storage);
    expect(loadHotspotInspectorPresentation(storage)).toBe("floating");

    expect(resolveHotspotInspectorDockWidthValue(undefined)).toBe(384);
    expect(resolveHotspotInspectorDockWidthValue("200")).toBe(320);
    expect(resolveHotspotInspectorDockWidthValue("700")).toBe(560);
    expect(resolveHotspotInspectorDockWidthValue("not-a-number")).toBe(384);

    saveHotspotInspectorDockWidth(700, storage);
    expect(loadHotspotInspectorDockWidth(storage)).toBe(560);
  });

  it("builds scene switcher options with location metadata", () => {
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
      videoAudioMode: "silent",
      hotspots: [],
      dialogueTreeIds: [],
      onEnterEffects: [],
      onExitEffects: [],
      onMediaEndEffects: []
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

  it("builds location switcher options with scene-count metadata", () => {
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
      videoAudioMode: "silent",
      hotspots: [],
      dialogueTreeIds: [],
      onEnterEffects: [],
      onExitEffects: [],
      onMediaEndEffects: []
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

  it("shows explicit video sound modes and enables a synchronized external track", () => {
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
              durationMs: 5000,
              hasAudio: true
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
      project.scenes.items[0].videoAudioMode = "external";
    });

    expect(markup).toContain("Video Sound");
    expect(markup).toContain("Embedded audio");
    expect(markup).toContain("External track");
    expect(markup).toContain("Silent");
    expect(markup).toContain("Use an audio file as a synchronized replacement track for this video.");
    expect(markup).toContain("scenes-panel__scene-audio-frame");
    expect(markup).toContain("External audio follows the video playhead and restarts with the video.");

    const sceneAudioLabelIndex = markup.indexOf(">Scene Audio</span>");
    const sceneAudioSelectIndex = markup.indexOf("<select", sceneAudioLabelIndex);
    const sceneAudioSelectTag = markup.slice(sceneAudioSelectIndex, markup.indexOf(">", sceneAudioSelectIndex) + 1);
    expect(sceneAudioSelectTag).not.toContain('disabled=""');
  });

  it("refuses non-audio files in the scene-audio drop area", () => {
    expect(resolveSceneAudioDropAcceptance([{ filePath: "D:\\project\\poster.png", mimeType: "image/png" }])).toBe(
      "reject"
    );
    expect(resolveSceneAudioDropAcceptance([{ filePath: "D:\\project\\clip.mp4", mimeType: "video/mp4" }])).toBe(
      "reject"
    );
    expect(resolveSceneAudioDropAcceptance([{ filePath: "D:\\project\\ambience.mp3", mimeType: "" }])).toBe("accept");
    expect(resolveSceneAudioDropAcceptance([{ mimeType: "audio/mpeg" }])).toBe("accept");
    expect(resolveSceneAudioDropAcceptance([{}])).toBe("unknown");
  });

  it("preserves assigned scene audio by switching a new video background to external mode", () => {
    const scene = {
      backgroundAssetId: "asset_image",
      sceneAudioAssetId: "asset_scene_audio",
      videoAudioMode: "silent" as const
    };

    const didApply = applySceneBackgroundAsset(scene, "asset_video", "video");

    expect(didApply).toBe(true);
    expect(scene).toEqual({
      backgroundAssetId: "asset_video",
      sceneAudioAssetId: "asset_scene_audio",
      videoAudioMode: "external"
    });
    expect(canAssignSceneBackgroundAsset(scene, "video")).toBe(true);
  });

  it("keeps scene audio when an image background is assigned", () => {
    const scene = {
      backgroundAssetId: "asset_video",
      sceneAudioAssetId: "asset_scene_audio",
      videoAudioMode: "external" as const
    };

    const didApply = applySceneBackgroundAsset(scene, "asset_image", "image");

    expect(didApply).toBe(true);
    expect(scene).toEqual({
      backgroundAssetId: "asset_image",
      sceneAudioAssetId: "asset_scene_audio",
      videoAudioMode: "silent"
    });
  });

  it("defaults a video with detected audio to embedded playback", () => {
    const scene = {
      backgroundAssetId: "asset_image",
      sceneAudioAssetId: undefined,
      videoAudioMode: "silent" as const
    };

    const didApply = applySceneBackgroundAsset(scene, "asset_video", "video", true);

    expect(didApply).toBe(true);
    expect(scene).toEqual({
      backgroundAssetId: "asset_video",
      sceneAudioAssetId: undefined,
      videoAudioMode: "embedded"
    });
  });

  it("renders the background video playhead in the Scene media controls", () => {
    const markup = renderScenesPanel((project) => {
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
      project.scenes.items[0].backgroundVideoLoop = true;
    });

    const sceneMediaIndex = markup.indexOf(">Scene media</span>");
    const sceneAudioIndex = markup.indexOf(">Scene Audio</span>", sceneMediaIndex);
    const detailsRowIndex = markup.indexOf('class="scenes-panel__details-row"');
    const playheadRowIndex = markup.indexOf('class="scenes-panel__playhead-row scenes-panel__playhead-row--video"');
    const playheadTrackIndex = markup.indexOf('class="scenes-panel__playhead-range"', playheadRowIndex);
    const loopToggleIndex = markup.indexOf('class="scene-video-loop-toggle scenes-panel__background-loop-toggle"', playheadRowIndex);

    expect(sceneMediaIndex).toBeGreaterThan(-1);
    expect(sceneAudioIndex).toBeGreaterThan(sceneMediaIndex);
    expect(detailsRowIndex).toBeGreaterThan(-1);
    expect(playheadRowIndex).toBeGreaterThan(-1);
    expect(playheadRowIndex).toBeGreaterThan(detailsRowIndex);
    expect(playheadRowIndex).toBeGreaterThan(sceneAudioIndex);
    expect(playheadTrackIndex).toBeGreaterThan(playheadRowIndex);
    expect(loopToggleIndex).toBeGreaterThan(playheadTrackIndex);
    expect(markup).toContain('aria-label="Loop background video indefinitely"');
    expect(markup).toContain("scene-video-loop-toggle__track");
    expect(markup).toContain("scene-video-loop-toggle__thumb");
    expect(markup).toContain(">Loop video</span>");
    expect(markup).not.toContain(">Loop background video indefinitely</span>");
  });

  it("keeps the loop control available when video-end effects need it turned off", () => {
    const markup = renderScenesPanel((project) => {
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
      project.scenes.items[0].backgroundVideoLoop = true;
      project.manifest.variables.push({ id: "finished", name: "Finished", description: "", type: "boolean", initialValue: false, system: false });
      project.scenes.items[0].onMediaEndEffects = [{ type: "setVariable", variableId: "finished", value: true }];
    });

    const loopInputIndex = markup.indexOf('aria-label="Loop background video indefinitely"');
    const loopInputTag = markup.slice(markup.lastIndexOf("<input", loopInputIndex), markup.indexOf(">", loopInputIndex));

    expect(loopInputTag).not.toContain("disabled");
    expect(markup).toContain("Turn off looping to run video-end effects.");
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
    expect(markup).toContain(">Player feedback</span>");
    expect(markup).toContain("None (silent)");
    expect(markup).toContain("Random from a response group");
    expect(markup).toContain('class="scenes-event-feedback-note"');
    expect(markup).toContain('class="scenes-floating-inspector__interaction-media-actions"');
    expect(markup).toContain('class="muted scenes-floating-inspector__interaction-media-note"');
    expect(markup).toContain('class="scenes-floating-inspector__sections"');
    expect(markup).toContain(">Identity</summary>");
    expect(markup).toContain(">Action</summary>");
    expect(markup).toContain(">Geometry</summary>");
    expect(markup).toContain(">Timing</summary>");
    expect(markup).toContain(">Availability</summary>");
    expect(markup).toContain(">On click</summary>");
    expect(markup.indexOf(">Availability</summary>")).toBeLessThan(markup.indexOf(">On click</summary>"));
    expect(markup.indexOf(">Actions</h5>")).toBeLessThan(markup.indexOf(">Target Scene</span>"));
    for (const sectionTitle of ["Action", "Geometry", "Timing", "Availability"]) {
      const summaryIndex = markup.indexOf(`>${sectionTitle}</summary>`);
      const detailsTag = markup.slice(markup.lastIndexOf("<details", summaryIndex), markup.indexOf(">", markup.lastIndexOf("<details", summaryIndex)) + 1);
      expect(detailsTag).not.toContain("open");
    }
    const onClickSummaryIndex = markup.indexOf(">On click</summary>");
    const onClickDetailsTag = markup.slice(
      markup.lastIndexOf("<details", onClickSummaryIndex),
      markup.indexOf(">", markup.lastIndexOf("<details", onClickSummaryIndex)) + 1
    );
    expect(onClickDetailsTag).toContain("open");
    expect(markup).not.toContain(">Else</summary>");
    expect(markup).not.toContain(">Any other item</summary>");
    expect(markup).toContain(">Required inventory</h5>");
    expect(markup).toContain("Require the player to own these items before this hotspot becomes available.");
    expect(markup).toContain(">No inventory required</strong>");
    expect(markup).toContain("The hotspot can be used without owning a specific item.");
    expect(markup).toContain("Choose when this hotspot appears and can be used.");
    expect(markup).toContain("Decide what happens when this interaction occurs. Actions run in order.");
    expect(markup).toContain("Add action...");
    expect(markup).toContain('class="button-secondary logic-editor__conditional-shortcut"');
    expect(markup).not.toContain(">Advanced</summary>");
    expect(markup).not.toContain("Selected item requirements");
    expect(markup).not.toContain("Require selected item");
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

  it("opens Availability when the hotspot has a real global restriction", () => {
    const markup = renderScenesPanel(
      (project) => {
        const scene = project.scenes.items[0]!;
        scene.hotspots[0]!.conditions = [{ type: "sceneVisited", sceneId: scene.id, visited: true }];
      },
      (project) => {
        mockedStore.state.selectedHotspotId = project.scenes.items[0]!.hotspots[0]!.id;
      }
    );

    const availabilitySummaryIndex = markup.indexOf(">Availability</summary>");
    const availabilityDetailsTag = markup.slice(
      markup.lastIndexOf("<details", availabilitySummaryIndex),
      markup.indexOf(">", markup.lastIndexOf("<details", availabilitySummaryIndex)) + 1
    );

    expect(availabilityDetailsTag).toContain("open");
    expect(markup.indexOf(">Availability</summary>")).toBeLessThan(markup.indexOf(">On click</summary>"));
  });

  it("widens the hotspot inspector for decisions and keeps scene changes in the action list", () => {
    const markup = renderScenesPanel(
      (project) => {
        project.scenes.items[0]!.hotspots[0]!.effects = [{
          type: "conditional",
          conditionMode: "all",
          conditions: [],
          thenEffects: [],
          elseEffects: []
        }];
      },
      (project) => {
        mockedStore.state.selectedHotspotId = project.scenes.items[0]!.hotspots[0]!.id;
      }
    );

    expect(markup).toContain("scenes-floating-inspector--logic-wide");
    expect(markup).toContain("Add scene changes as Go to scene actions above.");
    expect(markup).not.toContain(">Target Scene</span>");
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

    expect(markup).toContain(">Player feedback</span>");
    expect(markup).toContain("None (silent)");
    expect(markup).toContain("Intro Dialogue");
    expect(markup).toContain("One specific response");
    expect(markup).toContain("Add action...");
    expect(markup).not.toContain("Effects JSON");
  });

  it("shows distinct click, matching-item, and other-item events for a placement hotspot", () => {
    const markup = renderScenesPanel(
      (project) => {
        project.dialogues.items.push({
          id: "dialogue_locked",
          name: "Locked Cabinet",
          startNodeId: "node_locked",
          nodes: [
            {
              id: "node_locked",
              speaker: "Narrator",
              textId: "text.node_locked.line",
              choices: [],
              effects: []
            }
          ]
        });
        const item = addInventoryItem(project);
        item.name = "Brass Key";
        project.strings.byLocale.en[item.textId] = "Brass Key";
        const hotspot = project.scenes.items[0].hotspots[0]!;
        applyHotspotInventoryAction(hotspot, "placeItem", item.id, project.manifest.variables);
        project.manifest.variables.push(
          { id: "cabinet.examined", name: "Cabinet examined", description: "", type: "boolean", initialValue: false, system: false },
          { id: "cabinet.wrongItem", name: "Wrong item used", description: "", type: "boolean", initialValue: false, system: false }
        );
        hotspot.clickEvent = {
          dialogueTreeId: "dialogue_locked",
          effects: [{ type: "setVariable", variableId: "cabinet.examined", value: true }]
        };
        hotspot.otherItemEvent = {
          effects: [{ type: "setVariable", variableId: "cabinet.wrongItem", value: true }]
        };
      },
      (project) => {
        mockedStore.state.selectedHotspotId = project.scenes.items[0].hotspots[0]?.id;
      }
    );

    expect(markup).toContain(">On click</summary>");
    expect(markup).toContain(">Use Brass Key</summary>");
    expect(markup).toContain(">Any other item</summary>");
    expect(markup).not.toContain(">Else</summary>");
    expect(markup).toContain("Locked Cabinet");
    expect(markup).toContain("cabinet.examined");
    expect(markup).toContain("cabinet.wrongItem");
  });

  it("infers optional interaction events from their contents and removes them when empty", () => {
    const hotspot = createDefaultProjectBundle().scenes.items[0]!.hotspots[0]!;

    updateOptionalHotspotEvent(hotspot, "clickEvent", (event) => {
      event.dialogueTreeId = "dialogue_locked";
    });
    expect(hotspot.clickEvent).toEqual({ dialogueTreeId: "dialogue_locked", effects: [] });

    updateOptionalHotspotEvent(hotspot, "clickEvent", (event) => {
      event.dialogueTreeId = undefined;
    });
    expect(hotspot).not.toHaveProperty("clickEvent");

    updateOptionalHotspotEvent(hotspot, "otherItemEvent", (event) => {
      event.effects = [{ type: "setVariable", variableId: "cabinet.examined", value: true }];
    });
    expect(hotspot.otherItemEvent?.effects).toHaveLength(1);

    updateOptionalHotspotEvent(hotspot, "otherItemEvent", (event) => {
      event.effects = [];
    });
    expect(hotspot).not.toHaveProperty("otherItemEvent");
  });

  it("moves unambiguous legacy scene targets into actions and keeps real conditional fallbacks", () => {
    const simpleEvent: HotspotEvent = { targetSceneId: "scene_target", effects: [] };
    applyHotspotEventActionUpdate(simpleEvent, [{ type: "setVariable", variableId: "door.open", value: true }]);
    expect(simpleEvent).toEqual({
      effects: [
        { type: "setVariable", variableId: "door.open", value: true },
        { type: "goToScene", sceneId: "scene_target" }
      ]
    });

    const fallbackEvent: HotspotEvent = { targetSceneId: "scene_fallback", effects: [] };
    applyHotspotEventActionUpdate(fallbackEvent, [{
      type: "conditional",
      conditionMode: "all",
      conditions: [{ type: "sceneVisited", sceneId: "scene_seen", visited: true }],
      thenEffects: [{ type: "goToScene", sceneId: "scene_then" }],
      elseEffects: []
    }]);
    expect(fallbackEvent.targetSceneId).toBe("scene_fallback");

    applyHotspotEventActionUpdate(fallbackEvent, [{
      type: "conditional",
      conditionMode: "all",
      conditions: [{ type: "sceneVisited", sceneId: "scene_seen", visited: true }],
      thenEffects: [{ type: "goToScene", sceneId: "scene_then" }],
      elseEffects: [{ type: "goToScene", sceneId: "scene_else" }]
    }]);
    expect(fallbackEvent.targetSceneId).toBeUndefined();
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
      type: "variableCompare",
      variableId: `hotspot.${hotspot.id}.pickedUp`,
      operator: "equals",
      value: false
    });
    expect(hotspot.effects).toContainEqual({ type: "addItem", itemId: item.id });
    expect(hotspot.effects).toContainEqual({
      type: "setVariable",
      variableId: `hotspot.${hotspot.id}.pickedUp`,
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

  it("opens the inspector on the first hotspot click and preserves explicit closed state during drags", () => {
    expect(resolveNextHotspotInspectorOpenState(false, "hotspot_item", "preserve")).toBe(false);
    expect(resolveNextHotspotInspectorOpenState(true, "hotspot_item", "preserve")).toBe(true);
    expect(resolveNextHotspotInspectorOpenState(false, "hotspot_item", "open")).toBe(true);
    expect(resolveNextHotspotInspectorOpenState(true, "hotspot_item", "open")).toBe(true);
    expect(resolveNextHotspotInspectorOpenState(false, undefined, "preserve")).toBe(false);
    expect(resolveNextHotspotInspectorOpenState(true, undefined, "preserve")).toBe(true);
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

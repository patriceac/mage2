import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle, type ProjectBundle } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import {
  ScenesPanel,
  filterInventoryPlacementOptions,
  resolveDroppedInventoryHotspotBounds,
  resolveInventoryPreviewContentSize,
  resolveLinkedInventoryOptions
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
      updateProject: noop
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
    expect(markup).toContain("Loop scene audio with delay between restarts");
    expect(markup).toContain("Start Delay (ms)");
  });

  it("renders hotspot create, delete, and inventory placement actions above the scene-audio section", () => {
    const markup = renderScenesPanel(() => {});
    const createHotspotIndex = markup.indexOf("Create Hotspot");
    const deleteHotspotIndex = markup.indexOf("Delete Hotspot");
    const addInventoryItemIndex = markup.indexOf("Add Inventory Item");
    const sceneAudioIndex = markup.indexOf(">Scene Audio</span>");

    expect(createHotspotIndex).toBeGreaterThanOrEqual(0);
    expect(deleteHotspotIndex).toBeGreaterThanOrEqual(0);
    expect(addInventoryItemIndex).toBeGreaterThanOrEqual(0);
    expect(sceneAudioIndex).toBeGreaterThanOrEqual(0);
    expect(createHotspotIndex).toBeLessThan(sceneAudioIndex);
    expect(deleteHotspotIndex).toBeLessThan(sceneAudioIndex);
    expect(addInventoryItemIndex).toBeLessThan(sceneAudioIndex);
    expect(createHotspotIndex).toBeLessThan(deleteHotspotIndex);
    expect(deleteHotspotIndex).toBeLessThan(addInventoryItemIndex);
    expect(markup).not.toContain("Clear Hotspot");
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
    expect(markup).toContain("Links this hotspot to an inventory item and uses that item&#x27;s art in the scene.");
    expect(markup).not.toContain("scenes-floating-inspector__grip");
  });
});

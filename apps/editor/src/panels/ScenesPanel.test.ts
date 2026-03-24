import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle, type ProjectBundle } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import { ScenesPanel } from "./ScenesPanel";

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
    expect(markup).not.toContain("scenes-floating-inspector__grip");
  });
});

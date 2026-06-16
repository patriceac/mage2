import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultProjectBundle, type ProjectBundle } from "@mage2/schema";
import { addLocation } from "../project-helpers";
import { useEditorStore } from "../store";
import { resolveWorldLocationEdges, WorldPanel } from "./WorldPanel";

function renderWorldPanel(configureProject?: (project: ProjectBundle) => void) {
  const project = createDefaultProjectBundle("World test");
  configureProject?.(project);

  useEditorStore.setState({
    activeTab: "world",
    selectedLocationId: project.locations.items[0]?.id,
    selectedSceneId: project.scenes.items[0]?.id
  });

  return renderToStaticMarkup(
    React.createElement(WorldPanel, {
      project,
      mutateProject: () => {}
    })
  );
}

describe("WorldPanel", () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTab: "world",
      selectedLocationId: undefined,
      selectedSceneId: undefined
    });
  });

  it("presents world structure as locations, map, and selected location details", () => {
    const markup = renderWorldPanel();

    expect(markup).toContain("Locations");
    expect(markup).toContain("Search locations...");
    expect(markup).toContain("Location Map");
    expect(markup).toContain("Location map tools");
    expect(markup).toContain("Search map...");
    expect(markup).toContain("world-panel__map-node");
    expect(markup).toContain("Location Details");
    expect(markup).toContain(">Name</span>");
    expect(markup).toContain("Location summary");
    expect(markup).toContain("Quests");
    expect(markup).toContain("NPCs");
    expect(markup).toContain("Variables");
    expect(markup).toContain("Opening Scene");
    expect(markup).toContain("Start scene");
    expect(markup).toContain("world-panel__scene-index");
    expect(markup).toContain('title="Open Opening Scene in Scenes."');
    expect(markup).not.toContain("World Map");
    expect(markup).not.toContain("pill-list");
  });

  it("keeps Add Scene inside the selected location inspector", () => {
    const markup = renderWorldPanel();
    const addSceneIndex = markup.indexOf(">Add Scene</span>");
    const inspectorIndex = markup.indexOf("world-panel__details");
    const mapToolbarIndex = markup.indexOf("world-panel__map-toolbar");

    expect(addSceneIndex).toBeGreaterThan(inspectorIndex);
    expect(addSceneIndex).toBeGreaterThan(mapToolbarIndex);
  });

  it("shows one Add Scene action for an empty selected location", () => {
    const markup = renderWorldPanel((project) => {
      project.locations.items[0]!.sceneIds = [];
    });

    expect(markup).toContain("No scenes here");
    expect(markup.match(/>Add Scene<\/span>/g)).toHaveLength(1);
  });

  it("surfaces missing scene references in the selected location", () => {
    const markup = renderWorldPanel((project) => {
      project.locations.items[0]?.sceneIds.push("scene_missing");
    });

    expect(markup).toContain("Missing scene");
    expect(markup).toContain("scene_missing");
  });

  it("deduplicates cross-location scene links into world map edges", () => {
    const project = createDefaultProjectBundle("World links");
    const targetLocation = addLocation(project);
    const sourceScene = project.scenes.items[0]!;
    const targetScene = project.scenes.items.find((scene) => targetLocation.sceneIds.includes(scene.id))!;

    sourceScene.hotspots[0]!.targetSceneId = targetScene.id;
    sourceScene.onEnterEffects.push({ type: "goToScene", sceneId: targetScene.id });

    expect(resolveWorldLocationEdges(project)).toEqual([
      expect.objectContaining({
        id: "location_intro-" + targetLocation.id,
        source: "location_intro",
        target: targetLocation.id
      })
    ]);
  });
});

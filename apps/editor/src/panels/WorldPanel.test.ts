import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultProjectBundle, type ProjectBundle } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import { createEditorCatalog } from "../i18n/catalog";
import { worldMessages } from "../i18n/catalogs/world";
import { createEditorTranslator } from "../i18n/translate";
import { addLocation, addScene } from "../project-helpers";
import { useEditorStore } from "../store";
import { resolveLocationIconKind, resolveWorldLocationEdges, WorldPanel } from "./WorldPanel";

function renderWorldPanel(configureProject?: (project: ProjectBundle) => void) {
  const project = createDefaultProjectBundle("World test");
  configureProject?.(project);

  useEditorStore.setState({
    activeTab: "world",
    selectedLocationId: project.locations.items[0]?.id,
    selectedSceneId: project.scenes.items[0]?.id
  });

  return renderToStaticMarkup(
    React.createElement(
      DialogProvider,
      null,
      React.createElement(WorldPanel, {
        project,
        mutateProject: () => {}
      })
    )
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
    expect(markup).toContain("World Overview");
    expect(markup).toContain("World overview tools");
    expect(markup).toContain("Search map...");
    expect(markup).toContain("world-panel__map-node");
    expect(markup).toContain("Cross-location scene transitions");
    expect(markup).toContain("Read-only · derived from hotspot targets and scene effects authored in Scenes");
    expect(markup).toContain("Location Details");
    expect(markup).toContain(">Name</span>");
    expect(markup).toContain("Location summary");
    expect(markup).toContain("Dialogues");
    expect(markup).toContain("Speakers");
    expect(markup).toContain("Flags");
    expect(markup).toContain("World transitions");
    expect(markup).toContain("Opening Scene");
    expect(markup).toContain("Start scene");
    expect(markup).toContain("world-panel__scene-index");
    expect(markup).toContain('title="Open Opening Scene in Scenes."');
    expect(markup).not.toContain("Quests");
    expect(markup).not.toContain("NPCs");
    expect(markup).not.toContain("Variables");
    expect(markup).not.toContain("world-panel__map-node-port");
    expect(markup).not.toContain("world-panel__map-edge-terminal");
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

  it("uses a saved location icon override before falling back to name inference", () => {
    const project = createDefaultProjectBundle("World icons");
    const location = project.locations.items[0]!;

    location.name = "Misty Forest";
    expect(resolveLocationIconKind(location)).toBe("forest");

    location.icon = "castle";
    expect(resolveLocationIconKind(location)).toBe("castle");
  });

  it("aggregates direct cross-location scene transitions into directional routes", () => {
    const project = createDefaultProjectBundle("World links");
    const targetLocation = addLocation(project);
    const sourceScene = project.scenes.items[0]!;
    const targetScene = project.scenes.items.find((scene) => targetLocation.sceneIds.includes(scene.id))!;
    const secondSourceScene = addScene(project, sourceScene.locationId);

    sourceScene.hotspots[0]!.targetSceneId = targetScene.id;
    sourceScene.onEnterEffects.push({ type: "goToScene", sceneId: targetScene.id });
    secondSourceScene.onExitEffects.push({ type: "goToScene", sceneId: targetScene.id });

    expect(resolveWorldLocationEdges(project)).toEqual([
      {
        id: "location_intro-" + targetLocation.id,
        source: "location_intro",
        target: targetLocation.id,
        transitionCount: 2
      }
    ]);
  });

  it("renders derived transition routes with direction and without connection handles", () => {
    const markup = renderWorldPanel((project) => {
      const targetLocation = addLocation(project);
      const targetScene = project.scenes.items.find((scene) => targetLocation.sceneIds.includes(scene.id))!;
      project.scenes.items[0]!.hotspots[0]!.targetSceneId = targetScene.id;
    });

    expect(markup).toContain('marker-end="url(#world-transition-arrow-selected)"');
    expect(markup).toContain("Read-only cross-location scene transitions between locations");
    expect(markup).toContain("1 out");
    expect(markup).not.toContain("map-node-port");
    expect(markup).not.toContain("map-edge-terminal");
  });

  it("provides complete World translations with named project-authored values", () => {
    const catalog = createEditorCatalog([{ feature: "world", messages: worldMessages }]);
    const french = createEditorTranslator(catalog, "fr");
    const arabic = createEditorTranslator(catalog, "ar");

    expect(french("Add Location")).toBe("Ajouter un lieu");
    expect(french("Open {name} in Scenes.", { name: "Citadel_01" })).toBe("Ouvrir Citadel_01 dans Scènes.");
    expect(arabic("{source} to {target}: {transitionCount}", {
      source: "location_intro",
      target: "الميناء",
      transitionCount: arabic("{count} cross-location scene transitions", { count: 3 })
    })).toContain("location_intro");
    expect(arabic("{source} to {target}: {transitionCount}", {
      source: "location_intro",
      target: "الميناء",
      transitionCount: arabic("{count} cross-location scene transitions", { count: 3 })
    })).toContain("الميناء");
  });

  it("keeps map coordinates LTR while restoring translated text direction", () => {
    const source = readFileSync(new URL("./WorldPanel.tsx", import.meta.url), "utf8");

    expect(source).toContain('aria-label={t("World overview of locations and cross-location scene transitions")}');
    expect(source).toContain('dir="ltr"');
    expect(source).toContain('style={{ left: position.x, top: position.y, textAlign: direction === "rtl" ? "right" : "left" } as CSSProperties}');
    expect(source).toContain('className="world-panel__map-node-copy" dir={direction}');
    expect(source).toContain('style={direction === "rtl" ? { right: "auto", left: 0, textAlign: "right" } : undefined}');
  });
});

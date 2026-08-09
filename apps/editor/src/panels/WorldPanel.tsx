import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import {
  collectSceneLinks,
  visitEffectConditions,
  visitEffects,
  type Condition,
  type Effect,
  type Location,
  type LocationIcon,
  type ProjectBundle,
  type Scene
} from "@mage2/schema";
import { useDialogs } from "../dialogs";
import { useEditorI18n } from "../i18n/EditorI18nProvider";
import type { EditorTranslator } from "../i18n/translate";
import { addLocation, addScene, removeLocationFromProject } from "../project-helpers";
import { useEditorStore } from "../store";

const MAP_NODE_WIDTH = 214;
const MAP_NODE_HEIGHT = 82;
const MAP_MIN_CANVAS_WIDTH = 1600;
const MAP_MIN_CANVAS_HEIGHT = 1100;
const MAP_FIT_PADDING = 80;
const MAP_MIN_SCALE = 0.38;
const MAP_MAX_SCALE = 1.6;
const LOCATION_ICON_OPTIONS = [
  { icon: "mapPin", label: "Pin" },
  { icon: "settlement", label: "Settlement" },
  { icon: "forest", label: "Forest" },
  { icon: "castle", label: "Castle" },
  { icon: "mine", label: "Mine" },
  { icon: "coast", label: "Coast" },
  { icon: "crystal", label: "Crystal" },
  { icon: "mountain", label: "Mountain" }
] satisfies Array<{ icon: LocationIcon; label: string }>;

interface WorldPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}

export interface WorldLocationEdge {
  id: string;
  source: string;
  target: string;
  transitionCount: number;
}

interface WorldLocationTransitionCounts {
  incoming: number;
  outgoing: number;
  total: number;
}

type WorldPanelIconKind =
  | "castle"
  | "coast"
  | "dialogue"
  | "crystal"
  | "emptyScene"
  | "filter"
  | "fit"
  | "forest"
  | "gear"
  | "grid"
  | "item"
  | "jump"
  | "flag"
  | "locationAdd"
  | "mapPin"
  | "menu"
  | "mine"
  | "mountain"
  | "speaker"
  | "pan"
  | "scene"
  | "sceneAdd"
  | "search"
  | "select"
  | "settlement"
  | "trash"
  | "transition"
  | "zoomIn"
  | "zoomOut";

export function WorldPanel({ project, mutateProject }: WorldPanelProps) {
  const dialogs = useDialogs();
  const { direction, t } = useEditorI18n();
  const selectedLocationId = useEditorStore((state) => state.selectedLocationId);
  const selectedSceneId = useEditorStore((state) => state.selectedSceneId);
  const setSelectedLocationId = useEditorStore((state) => state.setSelectedLocationId);
  const setSelectedSceneId = useEditorStore((state) => state.setSelectedSceneId);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const [locationSearch, setLocationSearch] = useState("");
  const [showWithTransitionsOnly, setShowWithTransitionsOnly] = useState(false);
  const [showLocationSettings, setShowLocationSettings] = useState(false);
  const locationSettingsId = useId();
  const locationSettingsRef = useRef<HTMLDivElement>(null);
  const currentLocation = project.locations.items.find((entry) => entry.id === selectedLocationId) ?? project.locations.items[0];
  const locationEdges = resolveWorldLocationEdges(project);
  const locationTransitionCounts = resolveLocationTransitionCounts(locationEdges);
  const currentLocationScenes = currentLocation ? resolveLocationScenes(project, currentLocation) : [];
  const currentLocationSceneIdSet = useMemo(() => new Set(currentLocation?.sceneIds ?? []), [currentLocation?.sceneIds]);
  const currentLocationFirstScene = currentLocationScenes[0];
  const currentLocationIconKind = currentLocation ? resolveLocationIconKind(currentLocation) : "mapPin";
  const currentLocationIsStart = Boolean(currentLocation && project.manifest.startLocationId === currentLocation.id);
  const deleteWouldRemoveStart = Boolean(
    currentLocation &&
      (project.manifest.startLocationId === currentLocation.id || currentLocationSceneIdSet.has(project.manifest.startSceneId))
  );
  const replacementStartSceneAfterDelete = currentLocation
    ? findFirstSceneOutsideLocation(project, currentLocation.id)
    : undefined;
  const canDeleteCurrentLocation = Boolean(
    currentLocation &&
      project.locations.items.length > 1 &&
      (!deleteWouldRemoveStart || replacementStartSceneAfterDelete)
  );
  const deleteLocationTitle =
    project.locations.items.length <= 1
      ? t("A project needs at least one location.")
      : deleteWouldRemoveStart && !replacementStartSceneAfterDelete
        ? t("Add another scene before deleting the start location.")
        : t("Delete this location and its scenes.");
  const currentLocationSummary = currentLocation
    ? resolveLocationSummary(project, currentLocation, resolveTransitionCounts(locationTransitionCounts, currentLocation.id))
    : undefined;
  const visibleLocations = project.locations.items.filter((location) => {
    const matchesSearch = location.name.toLowerCase().includes(locationSearch.trim().toLowerCase());
    const matchesFilter =
      !showWithTransitionsOnly || resolveTransitionCounts(locationTransitionCounts, location.id).total > 0;
    return matchesSearch && matchesFilter;
  });

  useEffect(() => {
    setShowLocationSettings(false);
  }, [currentLocation?.id]);

  useEffect(() => {
    if (!showLocationSettings) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !locationSettingsRef.current?.contains(event.target)) {
        setShowLocationSettings(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowLocationSettings(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showLocationSettings]);

  const createLocation = () => {
    mutateProject((draft) => {
      const location = addLocation(draft);
      setSelectedLocationId(location.id);
      setSelectedSceneId(location.sceneIds[0]);
    });
  };

  const createSceneInCurrentLocation = () => {
    if (!currentLocation) {
      return;
    }

    mutateProject((draft) => {
      const scene = addScene(draft, currentLocation.id);
      setSelectedSceneId(scene.id);
    });
  };

  const openScene = (scene: Scene) => {
    setSelectedSceneId(scene.id);
    setActiveTab("scenes");
  };

  const moveLocation = (locationId: string, position: { x: number; y: number }) => {
    mutateProject((draft) => {
      const location = draft.locations.items.find((entry) => entry.id === locationId);
      if (location) {
        location.x = Math.round(position.x);
        location.y = Math.round(position.y);
      }
    });
  };

  const setCurrentLocationAsStart = () => {
    if (!currentLocation || !currentLocationFirstScene) {
      return;
    }

    mutateProject((draft) => {
      draft.manifest.startLocationId = currentLocation.id;
      draft.manifest.startSceneId = currentLocationFirstScene.id;
    });
    setSelectedSceneId(currentLocationFirstScene.id);
    setShowLocationSettings(false);
  };

  const setLocationIconOverride = (icon: LocationIcon | undefined) => {
    if (!currentLocation) {
      return;
    }

    mutateProject((draft) => {
      const location = draft.locations.items.find((entry) => entry.id === currentLocation.id);
      if (location) {
        location.icon = icon;
      }
    });
  };

  const deleteCurrentLocation = async () => {
    if (!currentLocation || !canDeleteCurrentLocation) {
      return;
    }

    setShowLocationSettings(false);
    const sceneCount = currentLocation.sceneIds.length;
    const confirmed = await dialogs.confirm({
      title: t("Delete Location"),
      tone: "danger",
      confirmLabel: t("Delete Location"),
      cancelLabel: t("Keep Location"),
      body: (
        <>
          <p>{t('Delete "{name}" from this project?', { name: currentLocation.name })}</p>
          {/* i18n-ignore-next-line -- CSS class names, not user-facing copy */}
          <div className="dialog-callout dialog-callout--danger">
            <strong>{t("Permanent location deletion")}</strong>
            <p>
              {sceneCount === 1
                ? t("This removes {count} scene in this location and cleans references to those scenes.", { count: sceneCount })
                : t("This removes {count} scenes in this location and cleans references to them.", { count: sceneCount })}
            </p>
          </div>
        </>
      )
    });

    if (!confirmed) {
      return;
    }

    let nextSelection: { locationId?: string; sceneId?: string } = {};
    mutateProject((draft) => {
      const deletion = removeLocationFromProject(draft, currentLocation.id);
      if (!deletion.deleted) {
        return;
      }

      const nextLocation =
        draft.locations.items.find((location) => location.id === deletion.nextStartLocationId) ?? draft.locations.items[0];
      nextSelection = {
        locationId: nextLocation?.id,
        sceneId:
          nextLocation?.sceneIds.find((sceneId) => draft.scenes.items.some((scene) => scene.id === sceneId)) ??
          deletion.nextStartSceneId
      };
    });

    if (nextSelection.locationId) {
      setSelectedLocationId(nextSelection.locationId);
    }
    if (nextSelection.sceneId) {
      setSelectedSceneId(nextSelection.sceneId);
    }
  };

  return (
    <div className="panel-grid panel-grid--world" dir={direction}>
      <section className="panel panel--flow world-panel__workspace">
        <aside className="world-panel__location-rail" aria-label={t("Locations")}>
          <div className="world-panel__rail-header">
            <h3>{t("Locations")}</h3>
            <button type="button" className="world-panel__compact-action" title={t("Create a location in the world overview.")} onClick={createLocation}>
              <WorldPanelIcon kind="locationAdd" />
              <span>{t("Add Location")}</span>
            </button>
          </div>

          <div className="world-panel__rail-controls">
            <label className="world-panel__search-field">
              <WorldPanelIcon kind="search" />
              <input
                aria-label={t("Search locations")}
                placeholder={t("Search locations...")}
                value={locationSearch}
                onChange={(event) => setLocationSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={showWithTransitionsOnly ? "world-panel__icon-action world-panel__icon-action--active" : "world-panel__icon-action"}
              aria-label={t("Show locations with world transitions only")}
              aria-pressed={showWithTransitionsOnly}
              title={t("Show locations with cross-location scene transitions only.")}
              onClick={() => setShowWithTransitionsOnly((value) => !value)}
            >
              <WorldPanelIcon kind="filter" />
            </button>
          </div>

          {project.locations.items.length > 0 ? (
            <div className="world-panel__location-list" role="list">
              {visibleLocations.length > 0 ? (
                visibleLocations.map((location) => {
                const isSelected = location.id === currentLocation?.id;

                return (
                  <button
                    key={location.id}
                    type="button"
                    className={isSelected ? "world-panel__location-row world-panel__location-row--selected" : "world-panel__location-row"}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedLocationId(location.id)}
                    title={t("Select {name}.", { name: location.name })}
                    style={direction === "rtl" ? { textAlign: "right" } : undefined}
                  >
                    <WorldPanelIcon kind={resolveLocationIconKind(location)} />
                    <span className="world-panel__location-row-copy">
                      <strong>{location.name}</strong>
                    </span>
                    <span className="world-panel__location-row-count">{formatCount(t, location.sceneIds.length, "scene")}</span>
                  </button>
                );
              })
              ) : (
                <div className="world-panel__empty-state world-panel__empty-state--rail">
                  <WorldPanelIcon kind="search" />
                  <strong>{t("No matching locations")}</strong>
                </div>
              )}
            </div>
          ) : (
            <div className="world-panel__empty-state world-panel__empty-state--rail">
              <WorldPanelIcon kind="locationAdd" />
              <strong>{t("No locations yet")}</strong>
            </div>
          )}

          <div className="world-panel__rail-footer">
            <span>{formatCount(t, project.locations.items.length, "location")}</span>
            <WorldPanelIcon kind="menu" />
          </div>
        </aside>

        <WorldLocationMap
          locations={project.locations.items}
          edges={locationEdges}
          selectedLocationId={currentLocation?.id}
          startLocationId={project.manifest.startLocationId}
          transitionCounts={locationTransitionCounts}
          onCreateLocation={createLocation}
          onMoveLocation={moveLocation}
          onSelectLocation={setSelectedLocationId}
        />
      </section>

      <aside className="panel world-panel__details">
        {currentLocation ? (
          <>
            <div className="world-panel__details-header">
              <div>
                <h3>{t("Location Details")}</h3>
              </div>
              <div className="world-panel__location-settings" ref={locationSettingsRef}>
                <button
                  type="button"
                  className={showLocationSettings ? "world-panel__icon-action world-panel__icon-action--active" : "world-panel__icon-action"}
                  aria-controls={locationSettingsId}
                  aria-expanded={showLocationSettings}
                  aria-haspopup="menu"
                  aria-label={t("Location settings")}
                  title={t("Location settings.")}
                  onClick={() => setShowLocationSettings((value) => !value)}
                >
                  <WorldPanelIcon kind="gear" />
                </button>
                {showLocationSettings ? (
                  <div
                    id={locationSettingsId}
                    className="world-panel__location-settings-menu"
                    role="menu"
                    aria-label={t("Location settings")}
                    style={direction === "rtl" ? { right: "auto", left: 0, textAlign: "right" } : undefined}
                  >
                    <button
                      type="button"
                      className="world-panel__settings-menu-item"
                      style={direction === "rtl" ? { textAlign: "right" } : undefined}
                      disabled={currentLocationIsStart || !currentLocationFirstScene}
                      title={
                        currentLocationIsStart
                          ? t("This is already the start location.")
                          : currentLocationFirstScene
                            ? t("Start the project at {name}.", { name: currentLocation.name })
                            : t("Add a scene before making this the start location.")
                      }
                      onClick={setCurrentLocationAsStart}
                    >
                      <WorldPanelIcon kind="mapPin" />
                      <span>{currentLocationIsStart ? t("Start location") : t("Set as start location")}</span>
                    </button>

                    <div className="world-panel__settings-section">
                      <span className="world-panel__settings-label">{t("Map icon")}</span>
                      <div className="world-panel__icon-choice-grid">
                        <button
                          type="button"
                          className={
                            currentLocation.icon
                              ? "world-panel__icon-choice"
                              : "world-panel__icon-choice world-panel__icon-choice--active"
                          }
                          aria-pressed={!currentLocation.icon}
                          title={t("Use the automatic icon ({icon}).", { icon: t(resolveLocationIconLabel(currentLocationIconKind)) })}
                          onClick={() => setLocationIconOverride(undefined)}
                        >
                          <WorldPanelIcon kind={resolveLocationIconKind({ ...currentLocation, icon: undefined })} />
                          <span>{t("Automatic")}</span>
                        </button>
                        {LOCATION_ICON_OPTIONS.map((option) => (
                          <button
                            key={option.icon}
                            type="button"
                            className={
                              currentLocation.icon === option.icon
                                ? "world-panel__icon-choice world-panel__icon-choice--active"
                                : "world-panel__icon-choice"
                            }
                            aria-pressed={currentLocation.icon === option.icon}
                            title={t("Use {icon} icon.", { icon: t(option.label).toLocaleLowerCase() })}
                            onClick={() => setLocationIconOverride(option.icon)}
                          >
                            <WorldPanelIcon kind={option.icon} />
                            <span>{t(option.label)}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="world-panel__settings-danger-zone">
                      <button
                        type="button"
                        className="button-danger-quiet world-panel__settings-menu-item world-panel__settings-menu-item--danger"
                        disabled={!canDeleteCurrentLocation}
                        title={deleteLocationTitle}
                        style={direction === "rtl" ? { textAlign: "right" } : undefined}
                        onClick={() => void deleteCurrentLocation()}
                      >
                        <WorldPanelIcon kind="trash" />
                        <span>{t("Delete location...")}</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <label>
              <span className="field-label--inset">{t("Name")}</span>
              <input
                value={currentLocation.name}
                title={t("Rename this location.")}
                onChange={(event) =>
                  mutateProject((draft) => {
                    const location = draft.locations.items.find((entry) => entry.id === currentLocation.id);
                    if (location) {
                      location.name = event.target.value;
                    }
                  })
                }
              />
            </label>

            <div className="world-panel__stat-grid" aria-label={t("Location summary")}>
              {currentLocationSummary
                ? [
                    { icon: "scene" as const, label: t("Scenes"), value: currentLocationSummary.scenes },
                    { icon: "dialogue" as const, label: t("Dialogues"), value: currentLocationSummary.dialogues },
                    { icon: "speaker" as const, label: t("Speakers"), value: currentLocationSummary.speakers },
                    { icon: "flag" as const, label: t("Variables"), value: currentLocationSummary.variables },
                    { icon: "item" as const, label: t("Items"), value: currentLocationSummary.items },
                    {
                      icon: "transition" as const,
                      label: t("World transitions"),
                      value: currentLocationSummary.transitions,
                      // i18n-ignore-next-line -- source key is translated inside formatCount
                      title: `${formatCount(t, currentLocationSummary.outgoingTransitions, "outgoing world transition")}; ${formatCount(
                        t,
                        currentLocationSummary.incomingTransitions,
                        // i18n-ignore-next-line -- source key is translated inside formatCount
                        "incoming world transition"
                      )}.`
                    }
                  ].map((stat) => (
                    <div key={stat.label} title={stat.title}>
                      <WorldPanelIcon kind={stat.icon} />
                      <span>{stat.label}</span>
                      <strong>{stat.value}</strong>
                    </div>
                  ))
                : null}
            </div>

            <div className="world-panel__scenes">
              <div className="world-panel__section-header">
                <h4>{t("Scenes")}</h4>
                {currentLocation.sceneIds.length > 0 ? (
                  <button
                    type="button"
                    className="world-panel__compact-action world-panel__compact-action--primary"
                    title={t("Add a scene to {name}.", { name: currentLocation.name })}
                    onClick={createSceneInCurrentLocation}
                  >
                    <WorldPanelIcon kind="sceneAdd" />
                    <span>{t("Add Scene")}</span>
                  </button>
                ) : null}
              </div>

              {currentLocation.sceneIds.length > 0 ? (
                <div className="world-panel__scene-list" role="list">
                {currentLocation.sceneIds.map((sceneId, index) => {
                  const scene = project.scenes.items.find((entry) => entry.id === sceneId);
                  if (!scene) {
                    return (
                      <div key={sceneId} className="world-panel__scene-row world-panel__scene-row--missing" role="listitem">
                        <span className="world-panel__scene-index">{formatIndex(index)}</span>
                        <span className="world-panel__scene-copy">
                          <strong>{t("Missing scene")}</strong>
                          <span>{sceneId}</span>
                        </span>
                      </div>
                    );
                  }

                  const sceneSummary = resolveSceneSummary(project, scene);

                  return (
                    <button
                      key={scene.id}
                      type="button"
                      className={scene.id === selectedSceneId ? "world-panel__scene-row world-panel__scene-row--selected" : "world-panel__scene-row"}
                      onClick={() => openScene(scene)}
                      title={t("Open {name} in Scenes.", { name: scene.name })}
                      style={direction === "rtl" ? { textAlign: "right" } : undefined}
                    >
                      <span className="world-panel__scene-index">{formatIndex(index)}</span>
                      <span className="world-panel__scene-copy">
                        <strong>{scene.name}</strong>
                        <span className="world-panel__scene-meta">
                          {scene.id === project.manifest.startSceneId ? <span>{t("Start scene")}</span> : null}
                          <span>
                            <WorldPanelIcon kind="speaker" />
                            {t("Speakers {count}", { count: sceneSummary.speakers })}
                          </span>
                          <span>
                            <WorldPanelIcon kind="dialogue" />
                            {t("Dialogues {count}", { count: sceneSummary.dialogues })}
                          </span>
                        </span>
                      </span>
                      <WorldPanelIcon kind="jump" />
                    </button>
                  );
                })}
                </div>
              ) : (
                <div className="world-panel__empty-state world-panel__empty-state--details">
                  <WorldPanelIcon kind="emptyScene" />
                  <strong>{t("No scenes here")}</strong>
                  <button type="button" onClick={createSceneInCurrentLocation}>
                    <WorldPanelIcon kind="sceneAdd" />
                    <span>{t("Add Scene")}</span>
                  </button>
                </div>
              )}
              <div className="world-panel__details-footer">{formatCount(t, currentLocation.sceneIds.length, "scene")}</div>
            </div>
          </>
        ) : (
          <div className="world-panel__empty-state world-panel__empty-state--details">
            <WorldPanelIcon kind="locationAdd" />
            <strong>{t("Choose a location")}</strong>
            <button type="button" onClick={createLocation}>
              <WorldPanelIcon kind="locationAdd" />
              <span>{t("Add Location")}</span>
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

export function resolveWorldLocationEdges(project: ProjectBundle): WorldLocationEdge[] {
  const locationEdges: WorldLocationEdge[] = [];

  for (const scene of project.scenes.items) {
    const sourceLocation = project.locations.items.find((location) => location.id === scene.locationId);
    for (const linkedSceneId of collectSceneLinks(scene)) {
      const targetScene = project.scenes.items.find((entry) => entry.id === linkedSceneId);
      const targetLocation = project.locations.items.find((location) => location.id === targetScene?.locationId);
      if (!sourceLocation || !targetLocation || sourceLocation.id === targetLocation.id) {
        continue;
      }

      const edgeId = `${sourceLocation.id}-${targetLocation.id}`;
      const existingEdge = locationEdges.find((edge) => edge.id === edgeId);
      if (existingEdge) {
        existingEdge.transitionCount += 1;
      } else {
        locationEdges.push({
          id: edgeId,
          source: sourceLocation.id,
          target: targetLocation.id,
          transitionCount: 1
        });
      }
    }
  }

  return locationEdges;
}

function resolveLocationTransitionCounts(locationEdges: WorldLocationEdge[]) {
  const counts = new Map<string, WorldLocationTransitionCounts>();

  for (const edge of locationEdges) {
    const sourceCounts = resolveTransitionCounts(counts, edge.source);
    const targetCounts = resolveTransitionCounts(counts, edge.target);
    counts.set(edge.source, {
      ...sourceCounts,
      outgoing: sourceCounts.outgoing + edge.transitionCount,
      total: sourceCounts.total + edge.transitionCount
    });
    counts.set(edge.target, {
      ...targetCounts,
      incoming: targetCounts.incoming + edge.transitionCount,
      total: targetCounts.total + edge.transitionCount
    });
  }

  return counts;
}

function resolveTransitionCounts(
  counts: Map<string, WorldLocationTransitionCounts>,
  locationId: string
): WorldLocationTransitionCounts {
  return counts.get(locationId) ?? { incoming: 0, outgoing: 0, total: 0 };
}

type WorldCountNoun =
  | "scene"
  | "location"
  | "cross-location transition"
  | "cross-location scene transition"
  | "outgoing world transition"
  | "incoming world transition";

function formatCount(t: EditorTranslator, count: number, noun: WorldCountNoun) {
  if (noun === "scene") {
    return count === 1 ? t("{count} scene", { count }) : t("{count} scenes", { count });
  }
  if (noun === "location") {
    return count === 1 ? t("{count} location", { count }) : t("{count} locations", { count });
  }
  if (noun === "cross-location transition") {
    return count === 1
      ? t("{count} cross-location transition", { count })
      : t("{count} cross-location transitions", { count });
  }
  if (noun === "cross-location scene transition") {
    return count === 1
      ? t("{count} cross-location scene transition", { count })
      : t("{count} cross-location scene transitions", { count });
  }
  if (noun === "outgoing world transition") {
    return count === 1
      ? t("{count} outgoing world transition", { count })
      : t("{count} outgoing world transitions", { count });
  }
  return count === 1
    ? t("{count} incoming world transition", { count })
    : t("{count} incoming world transitions", { count });
}

function formatTransitionDirectionCounts(t: EditorTranslator, counts: WorldLocationTransitionCounts) {
  const directions: string[] = [];

  if (counts.outgoing > 0) {
    directions.push(t("{count} out", { count: counts.outgoing }));
  }
  if (counts.incoming > 0) {
    directions.push(t("{count} in", { count: counts.incoming }));
  }

  return directions.join(" · ");
}

function formatIndex(index: number) {
  return String(index + 1).padStart(2, "0");
}

export function resolveLocationIconKind(location: Location): LocationIcon {
  if (location.icon) {
    return location.icon;
  }

  const label = `${location.name} ${location.id}`.toLowerCase();

  if (label.includes("forest") || label.includes("wood")) {
    return "forest";
  }

  if (label.includes("keep") || label.includes("castle") || label.includes("fort")) {
    return "castle";
  }

  if (label.includes("mine") || label.includes("cave")) {
    return "mine";
  }

  if (label.includes("coast") || label.includes("shore") || label.includes("sea")) {
    return "coast";
  }

  if (label.includes("crystal") || label.includes("flats")) {
    return "crystal";
  }

  if (label.includes("path") || label.includes("cliff") || label.includes("mountain")) {
    return "mountain";
  }

  if (label.includes("village") || label.includes("city") || label.includes("town") || label.includes("intro")) {
    return "settlement";
  }

  return "mapPin";
}

function resolveLocationIconLabel(icon: LocationIcon) {
  return LOCATION_ICON_OPTIONS.find((option) => option.icon === icon)?.label ?? "Pin";
}

function findFirstSceneOutsideLocation(project: ProjectBundle, locationId: string): Scene | undefined {
  for (const location of project.locations.items) {
    if (location.id === locationId) {
      continue;
    }

    for (const sceneId of location.sceneIds) {
      const scene = project.scenes.items.find((entry) => entry.id === sceneId);
      if (scene) {
        return scene;
      }
    }
  }

  return undefined;
}

function resolveLocationSummary(
  project: ProjectBundle,
  location: Location,
  transitionCounts: WorldLocationTransitionCounts
) {
  const refs = createStoryRefs();
  const speakerNames = new Set<string>();
  const scenes = resolveLocationScenes(project, location);

  for (const scene of scenes) {
    collectSceneReferences(scene, refs);
  }

  collectDialogueReferences(project, refs, speakerNames);

  return {
    scenes: scenes.length,
    dialogues: refs.dialogueIds.size,
    speakers: speakerNames.size,
    variables: refs.variableIds.size,
    items: refs.itemIds.size,
    transitions: transitionCounts.total,
    incomingTransitions: transitionCounts.incoming,
    outgoingTransitions: transitionCounts.outgoing
  };
}

function resolveSceneSummary(project: ProjectBundle, scene: Scene) {
  const refs = createStoryRefs();
  const speakerNames = new Set<string>();

  collectSceneReferences(scene, refs);
  collectDialogueReferences(project, refs, speakerNames);

  return {
    dialogues: refs.dialogueIds.size,
    speakers: speakerNames.size
  };
}

function resolveLocationScenes(project: ProjectBundle, location: Location) {
  return location.sceneIds
    .map((sceneId) => project.scenes.items.find((scene) => scene.id === sceneId))
    .filter((scene): scene is Scene => Boolean(scene));
}

function createStoryRefs() {
  return {
    dialogueIds: new Set<string>(),
    variableIds: new Set<string>(),
    itemIds: new Set<string>()
  };
}

function collectSceneReferences(scene: Scene, refs: ReturnType<typeof createStoryRefs>) {
  for (const dialogueTreeId of scene.dialogueTreeIds) {
    refs.dialogueIds.add(dialogueTreeId);
  }

  collectEffectReferences(scene.onEnterEffects, refs);
  collectEffectReferences(scene.onExitEffects, refs);
  collectEffectReferences(scene.onMediaEndEffects, refs);

  for (const hotspot of scene.hotspots) {
    if (hotspot.dialogueTreeId) {
      refs.dialogueIds.add(hotspot.dialogueTreeId);
    }
    for (const event of [hotspot.clickEvent, hotspot.otherItemEvent]) {
      if (event?.dialogueTreeId) {
        refs.dialogueIds.add(event.dialogueTreeId);
      }
    }

    if (hotspot.inventoryItemId) {
      refs.itemIds.add(hotspot.inventoryItemId);
    }

    if (hotspot.placedInventoryItemId) {
      refs.itemIds.add(hotspot.placedInventoryItemId);
    }

    for (const itemId of hotspot.requiredItemIds) {
      refs.itemIds.add(itemId);
    }

    collectConditionReferences(hotspot.conditions, refs);
    collectEffectReferences(hotspot.effects, refs);
    collectEffectReferences(hotspot.clickEvent?.effects ?? [], refs);
    collectEffectReferences(hotspot.otherItemEvent?.effects ?? [], refs);
  }
}

function collectDialogueReferences(project: ProjectBundle, refs: ReturnType<typeof createStoryRefs>, speakerNames: Set<string>) {
  for (const dialogueId of refs.dialogueIds) {
    const dialogue = project.dialogues.items.find((entry) => entry.id === dialogueId);
    if (!dialogue) {
      continue;
    }

    for (const node of dialogue.nodes) {
      speakerNames.add(node.speaker);
      collectEffectReferences(node.effects, refs);

      for (const choice of node.choices) {
        collectConditionReferences(choice.conditions, refs);
        collectEffectReferences(choice.effects, refs);
      }
    }
  }
}

function collectConditionReferences(conditions: Condition[], refs: ReturnType<typeof createStoryRefs>) {
  for (const condition of conditions) {
    if (condition.type === "variableCompare") {
      refs.variableIds.add(condition.variableId);
    }

    if (condition.type === "inventoryHas") {
      refs.itemIds.add(condition.itemId);
    }
  }
}

function collectEffectReferences(effects: Effect[], refs: ReturnType<typeof createStoryRefs>) {
  visitEffects(effects, (effect) => {
    if (effect.type === "setVariable" || effect.type === "changeVariable") {
      refs.variableIds.add(effect.variableId);
    }

    if (effect.type === "addItem" || effect.type === "removeItem") {
      refs.itemIds.add(effect.itemId);
    }

    if (effect.type === "playDialogue") {
      refs.dialogueIds.add(effect.dialogueTreeId);
    }
  });
  visitEffectConditions(effects, (conditions) => collectConditionReferences([...conditions], refs));
}

function WorldLocationMap({
  locations,
  edges,
  selectedLocationId,
  startLocationId,
  transitionCounts,
  onCreateLocation,
  onMoveLocation,
  onSelectLocation
}: {
  locations: Location[];
  edges: WorldLocationEdge[];
  selectedLocationId?: string;
  startLocationId: string;
  transitionCounts: Map<string, WorldLocationTransitionCounts>;
  onCreateLocation: () => void;
  onMoveLocation: (locationId: string, position: { x: number; y: number }) => void;
  onSelectLocation: (locationId: string) => void;
}) {
  const { direction, t } = useEditorI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const autoFitSignatureRef = useRef<string | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [mapTool, setMapTool] = useState<"select" | "pan">("select");
  const [mapSearch, setMapSearch] = useState("");
  const [showGrid, setShowGrid] = useState(true);
  const [showTransitions, setShowTransitions] = useState(true);
  const [showSceneCounts, setShowSceneCounts] = useState(true);
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [interaction, setInteraction] = useState<MapInteraction>(null);
  const [dragPreview, setDragPreview] = useState<Record<string, { x: number; y: number }>>({});
  const worldTransitionCount = useMemo(
    () => edges.reduce((total, edge) => total + edge.transitionCount, 0),
    [edges]
  );
  const renderedLocations = useMemo(
    () =>
      locations.map((location) => ({
        location,
        position: dragPreview[location.id] ?? { x: location.x, y: location.y }
      })),
    [dragPreview, locations]
  );
  const canvasSize = useMemo(() => resolveMapCanvasSize(renderedLocations), [renderedLocations]);
  const locationPositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    for (const entry of renderedLocations) {
      positions.set(entry.location.id, entry.position);
    }
    return positions;
  }, [renderedLocations]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const measure = () => {
      setStageSize({
        width: Math.max(stage.clientWidth, 1),
        height: Math.max(stage.clientHeight, 1)
      });
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const fitMap = useCallback(() => {
    if (locations.length === 0) {
      setViewport({ x: 0, y: 0, scale: 1 });
      return;
    }

    const bounds = resolveMapBounds(locations);
    const usableWidth = Math.max(stageSize.width - MAP_FIT_PADDING * 2, 1);
    const usableHeight = Math.max(stageSize.height - MAP_FIT_PADDING * 2, 1);
    const nextScale = clampScale(Math.min(1, usableWidth / bounds.width, usableHeight / bounds.height));

    setViewport({
      scale: nextScale,
      x: (stageSize.width - bounds.width * nextScale) / 2 - bounds.minX * nextScale,
      y: (stageSize.height - bounds.height * nextScale) / 2 - bounds.minY * nextScale
    });
  }, [locations, stageSize.height, stageSize.width]);

  useEffect(() => {
    const fitSignature = `${locations.length}:${stageSize.width}x${stageSize.height}`;
    if (locations.length > 0 && stageSize.width > 1 && stageSize.height > 1 && autoFitSignatureRef.current !== fitSignature) {
      fitMap();
      autoFitSignatureRef.current = fitSignature;
    }
  }, [fitMap, locations.length, stageSize.height, stageSize.width]);

  const zoomMap = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      setViewport((currentViewport) => {
        const nextScale = clampScale(currentViewport.scale * factor);
        const anchorX = anchor?.x ?? stageSize.width / 2;
        const anchorY = anchor?.y ?? stageSize.height / 2;
        const worldX = (anchorX - currentViewport.x) / currentViewport.scale;
        const worldY = (anchorY - currentViewport.y) / currentViewport.scale;

        return {
          scale: nextScale,
          x: anchorX - worldX * nextScale,
          y: anchorY - worldY * nextScale
        };
      });
    },
    [stageSize.height, stageSize.width]
  );

  const startPan = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    setInteraction({
      type: "pan",
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: viewport.x,
      originY: viewport.y
    });
  };

  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 1 || (event.button === 0 && mapTool === "pan")) {
      startPan(event);
    }
  };

  const handleNodePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, location: Location) => {
    onSelectLocation(location.id);

    if (event.button !== 0) {
      return;
    }

    if (mapTool === "pan") {
      startPan(event);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setInteraction({
      type: "node",
      locationId: location.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: location.x,
      originY: location.y,
      scale: viewport.scale
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interaction) {
      return;
    }

    if (interaction.type === "pan") {
      setViewport((currentViewport) => ({
        ...currentViewport,
        x: interaction.originX + event.clientX - interaction.startClientX,
        y: interaction.originY + event.clientY - interaction.startClientY
      }));
      return;
    }

    const nextPosition = resolveDraggedLocationPosition(interaction, event.clientX, event.clientY);
    setDragPreview({ [interaction.locationId]: nextPosition });
  };

  const endInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interaction) {
      return;
    }

    if (interaction.type === "node") {
      const nextPosition = resolveDraggedLocationPosition(interaction, event.clientX, event.clientY);
      if (Math.round(nextPosition.x) !== Math.round(interaction.originX) || Math.round(nextPosition.y) !== Math.round(interaction.originY)) {
        onMoveLocation(interaction.locationId, nextPosition);
      }
    }

    setInteraction(null);
    setDragPreview({});
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (locations.length === 0) {
      return;
    }

    event.preventDefault();
    const stageBounds = stageRef.current?.getBoundingClientRect();
    zoomMap(event.deltaY > 0 ? 0.9 : 1.1, {
      x: stageBounds ? event.clientX - stageBounds.left : stageSize.width / 2,
      y: stageBounds ? event.clientY - stageBounds.top : stageSize.height / 2
    });
  };

  const selectMapSearchMatch = () => {
    const query = mapSearch.trim().toLowerCase();
    if (!query) {
      return;
    }

    const match = locations.find((location) => location.name.toLowerCase().includes(query));
    if (match) {
      onSelectLocation(match.id);
      setMapSearch(match.name);
    }
  };

  return (
    <div className="world-panel__map-column">
      <div className="panel__toolbar world-panel__map-toolbar">
        <div className="world-panel__map-toolbar-main">
          <div className="world-panel__toolbar-title">
            <h3>{t("World Overview")}</h3>
            <span>
              {formatCount(t, locations.length, "location")} · {formatCount(t, worldTransitionCount, "cross-location transition")}
            </span>
          </div>

          <div className="world-panel__map-tools" role="toolbar" aria-label={t("World overview tools")}>
            <button
              type="button"
              className={mapTool === "select" ? "world-panel__map-tool world-panel__map-tool--active" : "world-panel__map-tool"}
              aria-label={t("Select map tool")}
              aria-pressed={mapTool === "select"}
              title={t("Select and arrange locations")}
              onClick={() => setMapTool("select")}
            >
              <WorldPanelIcon kind="select" />
            </button>
            <button
              type="button"
              className={mapTool === "pan" ? "world-panel__map-tool world-panel__map-tool--active" : "world-panel__map-tool"}
              aria-label={t("Pan map tool")}
              aria-pressed={mapTool === "pan"}
              title={t("Pan the map")}
              onClick={() => setMapTool("pan")}
            >
              <WorldPanelIcon kind="pan" />
            </button>
            <button type="button" className="world-panel__map-tool" aria-label={t("Fit map")} title={t("Fit locations in view")} onClick={fitMap}>
              <WorldPanelIcon kind="fit" />
            </button>
            <button type="button" className="world-panel__map-tool" aria-label={t("Add location")} title={t("Add location")} onClick={onCreateLocation}>
              <WorldPanelIcon kind="locationAdd" />
            </button>
            <button type="button" className="world-panel__map-tool" aria-label={t("Zoom in")} title={t("Zoom in")} onClick={() => zoomMap(1.16)}>
              <WorldPanelIcon kind="zoomIn" />
            </button>
            <button type="button" className="world-panel__map-tool" aria-label={t("Zoom out")} title={t("Zoom out")} onClick={() => zoomMap(0.86)}>
              <WorldPanelIcon kind="zoomOut" />
            </button>
            <button
              type="button"
              className={showGrid ? "world-panel__map-tool world-panel__map-tool--active" : "world-panel__map-tool"}
              aria-label={t("Toggle map grid")}
              aria-pressed={showGrid}
              title={t("Toggle map grid")}
              onClick={() => setShowGrid((value) => !value)}
            >
              <WorldPanelIcon kind="grid" />
            </button>
            <button
              type="button"
              className={showTransitions ? "world-panel__map-tool world-panel__map-tool--active" : "world-panel__map-tool"}
              aria-label={t("Toggle cross-location scene transitions")}
              aria-pressed={showTransitions}
              title={t("Show or hide cross-location scene transitions")}
              onClick={() => setShowTransitions((value) => !value)}
            >
              <WorldPanelIcon kind="transition" />
            </button>
          </div>
        </div>

        <div className="world-panel__map-toolbar-actions">
          <label className="world-panel__search-field world-panel__search-field--map">
            <WorldPanelIcon kind="search" />
            <input
              aria-label={t("Search map")}
              placeholder={t("Search map...")}
              value={mapSearch}
              onChange={(event) => setMapSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  selectMapSearchMatch();
                }
              }}
            />
          </label>
          <button
            type="button"
            className={showMapOptions ? "world-panel__icon-action world-panel__icon-action--active" : "world-panel__icon-action"}
            aria-label={t("Map options")}
            aria-expanded={showMapOptions}
            title={t("Map options.")}
            onClick={() => setShowMapOptions((value) => !value)}
          >
            <WorldPanelIcon kind="gear" />
          </button>
          {showMapOptions ? (
            <div
              className="world-panel__map-options"
              style={direction === "rtl" ? { right: "auto", left: 0, textAlign: "right" } : undefined}
            >
              <label>
                <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                <span>{t("Grid")}</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showTransitions}
                  onChange={(event) => setShowTransitions(event.target.checked)}
                />
                <span>{t("World transitions")}</span>
              </label>
              <label>
                <input type="checkbox" checked={showSceneCounts} onChange={(event) => setShowSceneCounts(event.target.checked)} />
                <span>{t("Scene counts")}</span>
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={stageRef}
        className={`world-panel__map-stage world-panel__map-stage--${mapTool}${showGrid ? " world-panel__map-stage--grid" : ""}${
          interaction?.type === "pan" ? " world-panel__map-stage--panning" : ""
        }`}
        role="application"
        aria-label={t("World overview of locations and cross-location scene transitions")}
        dir="ltr"
        onPointerDown={handleStagePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        onWheel={handleWheel}
      >
        {locations.length > 0 ? (
          <div
            className="world-panel__map-content"
            style={{
              width: `${canvasSize.width}px`,
              height: `${canvasSize.height}px`,
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
            }}
          >
            <svg
              className="world-panel__map-transitions"
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
              width={canvasSize.width}
              height={canvasSize.height}
              role="img"
              aria-label={t("Read-only cross-location scene transitions between locations")}
            >
              <defs>
                <marker
                  id="world-transition-arrow"
                  className="world-panel__map-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto"
                >
                  <path d="M 0 0 L 8 4 L 0 8 Z" />
                </marker>
                <marker
                  id="world-transition-arrow-selected"
                  className="world-panel__map-arrow world-panel__map-arrow--selected"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto"
                >
                  <path d="M 0 0 L 8 4 L 0 8 Z" />
                </marker>
              </defs>
              {showTransitions ? edges.map((edge) => {
                const geometry = resolveMapEdgeGeometry(edge, locationPositions);
                if (!geometry) {
                  return null;
                }

                const isSelected = edge.source === selectedLocationId || edge.target === selectedLocationId;
                const hasReverseRoute = edges.some(
                  (candidate) => candidate.source === edge.target && candidate.target === edge.source
                );
                const path = resolveMapEdgePath(geometry, hasReverseRoute);
                const sourceName = locations.find((location) => location.id === edge.source)?.name ?? edge.source;
                const targetName = locations.find((location) => location.id === edge.target)?.name ?? edge.target;

                return (
                  <g
                    key={edge.id}
                    className={
                      isSelected
                        ? "world-panel__map-transition world-panel__map-transition--selected"
                        : "world-panel__map-transition"
                    }
                  >
                    <title>
                      {t("{source} to {target}: {transitionCount}", {
                        source: sourceName,
                        target: targetName,
                        transitionCount: formatCount(t, edge.transitionCount, "cross-location scene transition")
                      })}
                    </title>
                    <path
                      d={path.d}
                      markerEnd={
                        isSelected
                          ? "url(#world-transition-arrow-selected)"
                          : "url(#world-transition-arrow)"
                      }
                    />
                    {edge.transitionCount > 1 ? (
                      <g
                        className="world-panel__map-transition-count"
                        transform={`translate(${path.label.x} ${path.label.y})`}
                      >
                        <circle r="11" />
                        <text textAnchor="middle" dy="0.34em">
                          {edge.transitionCount}
                        </text>
                      </g>
                    ) : null}
                  </g>
                );
              }) : null}
            </svg>

            {renderedLocations.map(({ location, position }) => {
              const isSelected = location.id === selectedLocationId;
              return (
                <button
                  key={location.id}
                  type="button"
                  className={isSelected ? "world-panel__map-node world-panel__map-node--selected" : "world-panel__map-node"}
                  style={{ left: position.x, top: position.y, textAlign: direction === "rtl" ? "right" : "left" } as CSSProperties}
                  aria-pressed={isSelected}
                  title={t("Select {name}. Drag to arrange its map position.", { name: location.name })}
                  onPointerDown={(event) => handleNodePointerDown(event, location)}
                  onClick={() => onSelectLocation(location.id)}
                >
                  <WorldPanelIcon kind={resolveLocationIconKind(location)} />
                  <span className="world-panel__map-node-copy" dir={direction}>
                    <strong>{location.name}</strong>
                    {showSceneCounts ? <span>{formatCount(t, location.sceneIds.length, "scene")}</span> : null}
                  </span>
                  {location.id === startLocationId ? <span className="world-panel__start-badge" dir={direction}>{t("Start")}</span> : null}
                  {resolveTransitionCounts(transitionCounts, location.id).total > 0 ? (
                    <span
                      className="world-panel__map-node-transitions"
                      dir={direction}
                      title={`${formatCount(
                        t,
                        resolveTransitionCounts(transitionCounts, location.id).outgoing,
                        // i18n-ignore-next-line -- source key is translated inside formatCount
                        "outgoing world transition"
                      )}; ${formatCount(
                        t,
                        resolveTransitionCounts(transitionCounts, location.id).incoming,
                        // i18n-ignore-next-line -- source key is translated inside formatCount
                        "incoming world transition"
                      )}.`}
                    >
                      {formatTransitionDirectionCounts(t, resolveTransitionCounts(transitionCounts, location.id))}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="world-panel__empty-state world-panel__empty-state--map">
            <WorldPanelIcon kind="locationAdd" />
            <strong dir={direction}>{t("No locations yet")}</strong>
            <button type="button" onClick={onCreateLocation}>
              <WorldPanelIcon kind="locationAdd" />
              <span dir={direction}>{t("Add Location")}</span>
            </button>
          </div>
        )}
        {locations.length > 0 ? (
          <div className="world-panel__topology-note" aria-label={t("Cross-location scene transition behavior")} dir={direction}>
            <WorldPanelIcon kind="transition" />
            <span>
              <strong>{t("Cross-location scene transitions")}</strong>
              <small>{t("Read-only · derived from hotspot targets and scene effects authored in Scenes")}</small>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type MapInteraction =
  | {
      type: "node";
      locationId: string;
      startClientX: number;
      startClientY: number;
      originX: number;
      originY: number;
      scale: number;
    }
  | {
      type: "pan";
      startClientX: number;
      startClientY: number;
      originX: number;
      originY: number;
    }
  | null;

function resolveMapCanvasSize(renderedLocations: Array<{ position: { x: number; y: number } }>) {
  let width = MAP_MIN_CANVAS_WIDTH;
  let height = MAP_MIN_CANVAS_HEIGHT;

  for (const entry of renderedLocations) {
    width = Math.max(width, entry.position.x + MAP_NODE_WIDTH + MAP_FIT_PADDING * 2);
    height = Math.max(height, entry.position.y + MAP_NODE_HEIGHT + MAP_FIT_PADDING * 2);
  }

  return { width, height };
}

function resolveMapBounds(locations: Location[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const location of locations) {
    minX = Math.min(minX, location.x);
    minY = Math.min(minY, location.y);
    maxX = Math.max(maxX, location.x + MAP_NODE_WIDTH);
    maxY = Math.max(maxY, location.y + MAP_NODE_HEIGHT);
  }

  return {
    minX,
    minY,
    width: Math.max(maxX - minX, MAP_NODE_WIDTH),
    height: Math.max(maxY - minY, MAP_NODE_HEIGHT)
  };
}

function resolveDraggedLocationPosition(
  interaction: Extract<MapInteraction, { type: "node" }>,
  clientX: number,
  clientY: number
) {
  return {
    x: interaction.originX + (clientX - interaction.startClientX) / interaction.scale,
    y: interaction.originY + (clientY - interaction.startClientY) / interaction.scale
  };
}

function resolveMapEdgeGeometry(edge: WorldLocationEdge, positions: Map<string, { x: number; y: number }>) {
  const sourcePosition = positions.get(edge.source);
  const targetPosition = positions.get(edge.target);

  if (!sourcePosition || !targetPosition) {
    return null;
  }

  const sourceCenter = {
    x: sourcePosition.x + MAP_NODE_WIDTH / 2,
    y: sourcePosition.y + MAP_NODE_HEIGHT / 2
  };
  const targetCenter = {
    x: targetPosition.x + MAP_NODE_WIDTH / 2,
    y: targetPosition.y + MAP_NODE_HEIGHT / 2
  };
  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return {
      source: {
        x: sourcePosition.x + (deltaX >= 0 ? MAP_NODE_WIDTH : 0),
        y: sourceCenter.y
      },
      target: {
        x: targetPosition.x + (deltaX >= 0 ? 0 : MAP_NODE_WIDTH),
        y: targetCenter.y
      }
    };
  }

  return {
    source: {
      x: sourceCenter.x,
      y: sourcePosition.y + (deltaY >= 0 ? MAP_NODE_HEIGHT : 0)
    },
    target: {
      x: targetCenter.x,
      y: targetPosition.y + (deltaY >= 0 ? 0 : MAP_NODE_HEIGHT)
    }
  };
}

function resolveMapEdgePath(
  geometry: NonNullable<ReturnType<typeof resolveMapEdgeGeometry>>,
  hasReverseRoute: boolean
) {
  const midpoint = {
    x: (geometry.source.x + geometry.target.x) / 2,
    y: (geometry.source.y + geometry.target.y) / 2
  };

  if (!hasReverseRoute) {
    return {
      d: `M ${geometry.source.x} ${geometry.source.y} L ${geometry.target.x} ${geometry.target.y}`,
      label: midpoint
    };
  }

  const deltaX = geometry.target.x - geometry.source.x;
  const deltaY = geometry.target.y - geometry.source.y;
  const length = Math.max(Math.hypot(deltaX, deltaY), 1);
  const control = {
    x: midpoint.x + (-deltaY / length) * 30,
    y: midpoint.y + (deltaX / length) * 30
  };

  return {
    d: `M ${geometry.source.x} ${geometry.source.y} Q ${control.x} ${control.y} ${geometry.target.x} ${geometry.target.y}`,
    label: {
      x: (geometry.source.x + control.x * 2 + geometry.target.x) / 4,
      y: (geometry.source.y + control.y * 2 + geometry.target.y) / 4
    }
  };
}

function clampScale(scale: number) {
  return Math.min(MAP_MAX_SCALE, Math.max(MAP_MIN_SCALE, scale));
}

function WorldPanelIcon({
  kind
}: {
  kind: WorldPanelIconKind;
}) {
  if (kind === "select") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6.2 4.6 10.6 7.1-5.2 1.2-2.3 5.1L6.2 4.6Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (kind === "search") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.8" cy="10.8" r="5.3" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path d="m15 15 4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.85" />
      </svg>
    );
  }

  if (kind === "filter") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.7 5.8h14.6l-5.8 6.7v5.1l-3 1.6v-6.7L4.7 5.8Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
      </svg>
    );
  }

  if (kind === "gear") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3.8 1.4.6.6 2 2 .9 1.9-.8 1.3 1.4-.8 1.9.8 2 1.8.9v1.9l-1.8.9-.8 2 .8 1.9-1.3 1.4-1.9-.8-2 .9-.6 2-1.4.6-1.4-.6-.6-2-2-.9-1.9.8-1.3-1.4.8-1.9-.8-2-1.8-.9v-1.9l1.8-.9.8-2-.8-1.9 1.3-1.4 1.9.8 2-.9.6-2 1.4-.6Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.45" />
        <circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.55" />
      </svg>
    );
  }

  if (kind === "trash") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.2 8.3h9.6M9.2 8.3l.4 10.3h4.8l.4-10.3M10 6.1h4l.7 2.2H9.3L10 6.1Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (kind === "menu") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 8h12M6 12h12M6 16h12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (kind === "pan") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M7.2 12.7V9.1a1.4 1.4 0 0 1 2.8 0v3.1m0-.3V7.8a1.4 1.4 0 0 1 2.8 0v4m0-.4V9a1.4 1.4 0 0 1 2.8 0v4.1m0-.6v-1.2a1.4 1.4 0 0 1 2.8 0v3.1c0 3.2-2.1 5.1-5.4 5.1h-1.1c-2.2 0-3.6-.8-4.9-2.7l-1.9-2.7a1.5 1.5 0 0 1 .3-2.1 1.6 1.6 0 0 1 2.1.3l1.1 1.4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.65"
        />
      </svg>
    );
  }

  if (kind === "fit") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.4 4.8H5v3.4M15.6 4.8H19v3.4M19 15.8v3.4h-3.4M5 15.8v3.4h3.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M9.2 9.3h5.6v5.4H9.2V9.3Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.55" />
      </svg>
    );
  }

  if (kind === "grid") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.2 5.2h13.6v13.6H5.2V5.2Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.65" />
        <path d="M9.7 5.2v13.6M14.3 5.2v13.6M5.2 9.7h13.6M5.2 14.3h13.6" fill="none" stroke="currentColor" strokeWidth="1.35" />
      </svg>
    );
  }

  if (kind === "transition") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="5.8" cy="12" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="18.2" cy="12" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8.4 12h6.2m-2.2-2.2 2.2 2.2-2.2 2.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" />
      </svg>
    );
  }

  if (kind === "zoomIn" || kind === "zoomOut") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 12h10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
        {kind === "zoomIn" ? <path d="M12 7v10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" /> : null}
      </svg>
    );
  }

  if (kind === "locationAdd") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5.5h14v13H5v-13Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
        <path d="M12 8.7v6.6M8.7 12h6.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.85" />
      </svg>
    );
  }

  if (kind === "settlement") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.8 18.5h14.4M6.5 18.5V10l5.5-4.4 5.5 4.4v8.5M10 18.5v-5h4v5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (kind === "forest") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 4.4-4 6h2.2l-3.4 5.1h4.1v3.8h2.2v-3.8h4.1l-3.4-5.1H16l-4-6Z" fill="currentColor" />
      </svg>
    );
  }

  if (kind === "castle") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 19V8.5h3V5.2h2.8v3.3h1.4V5.2h2.8v3.3h3V19M8.2 19v-4.2a3.8 3.8 0 0 1 7.6 0V19" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" />
      </svg>
    );
  }

  if (kind === "mine") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5.2 18.4 4.6-8.2 3.6 4.3 2.1-2.1 3.3 6H5.2Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        <path d="m16.2 5.2 2.6 2.6M18.8 5.2l-2.6 2.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (kind === "coast") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.6 15.7c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0M4.6 19c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.55" />
        <path d="M6.8 12.2a5.2 5.2 0 0 1 10.4 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.65" />
      </svg>
    );
  }

  if (kind === "crystal") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3.8 4.7 6.2L12 20.2 7.3 10 12 3.8Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.65" />
        <path d="M7.3 10h9.4M12 3.8V20.2" fill="none" stroke="currentColor" strokeWidth="1.35" />
      </svg>
    );
  }

  if (kind === "mountain") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4.6 18.5 5.6-9 3.2 4.2 2.1-2.8 3.9 7.6H4.6Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        <path d="m10.2 9.5 1.4 3.2 1.8 1" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
      </svg>
    );
  }

  if (kind === "mapPin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20.4s5.7-5.4 5.7-10.1a5.7 5.7 0 0 0-11.4 0c0 4.7 5.7 10.1 5.7 10.1Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.85" />
        <circle cx="12" cy="10.4" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  if (kind === "sceneAdd") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5 6.8h14v11.4H5V6.8Zm1.2 0 2-3h7.6l2 3M12 10v5M9.5 12.5h5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    );
  }

  if (kind === "scene" || kind === "emptyScene") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5 6.8h14v11.4H5V6.8Zm1.2 0 2-3h7.6l2 3"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        {kind === "emptyScene" ? (
          <path d="M8.2 13h7.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        ) : (
          <path d="M8.2 10.8h4.8M8.2 14.1h7.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.45" />
        )}
      </svg>
    );
  }

  if (kind === "dialogue") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.2 5.2h13.6v10H9.1l-3.9 3v-13Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.65" />
        <path d="M8.2 9.1h7.6M8.2 12h5.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.45" />
      </svg>
    );
  }

  if (kind === "speaker") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8.4" r="3" fill="none" stroke="currentColor" strokeWidth="1.65" />
        <path d="M6.8 18.7c.8-3.2 2.5-4.8 5.2-4.8s4.4 1.6 5.2 4.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.65" />
        <path d="M18.2 10.7a2.3 2.3 0 0 1 0 4.4M5.8 10.7a2.3 2.3 0 0 0 0 4.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
      </svg>
    );
  }

  if (kind === "flag") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 20V4.2M7 5.2h9.5l-1.8 3 1.8 3H7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (kind === "item") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8.7 12 5l5 3.7v6.6L12 19l-5-3.7V8.7Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.65" />
        <path d="m7.3 9 4.7 3.4L16.7 9M12 12.4V19" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.35" />
      </svg>
    );
  }

  if (kind === "jump") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M8 5.5h10.5V16M18.5 5.5 9.2 14.8M6 9v9h9"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return null;
}

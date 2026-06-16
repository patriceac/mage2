import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import { collectSceneLinks, type Condition, type Effect, type Location, type ProjectBundle, type Scene } from "@mage2/schema";
import { addLocation, addScene } from "../project-helpers";
import { useEditorStore } from "../store";

const MAP_NODE_WIDTH = 214;
const MAP_NODE_HEIGHT = 82;
const MAP_MIN_CANVAS_WIDTH = 1600;
const MAP_MIN_CANVAS_HEIGHT = 1100;
const MAP_FIT_PADDING = 80;
const MAP_MIN_SCALE = 0.38;
const MAP_MAX_SCALE = 1.6;

interface WorldPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}

export interface WorldLocationEdge {
  id: string;
  source: string;
  target: string;
}

type WorldPanelIconKind =
  | "castle"
  | "coast"
  | "connection"
  | "crystal"
  | "emptyScene"
  | "filter"
  | "fit"
  | "forest"
  | "gear"
  | "grid"
  | "item"
  | "jump"
  | "links"
  | "locationAdd"
  | "mapPin"
  | "menu"
  | "mine"
  | "mountain"
  | "npc"
  | "pan"
  | "quest"
  | "scene"
  | "sceneAdd"
  | "search"
  | "select"
  | "settlement"
  | "variable"
  | "zoomIn"
  | "zoomOut";

export function WorldPanel({ project, mutateProject }: WorldPanelProps) {
  const selectedLocationId = useEditorStore((state) => state.selectedLocationId);
  const selectedSceneId = useEditorStore((state) => state.selectedSceneId);
  const setSelectedLocationId = useEditorStore((state) => state.setSelectedLocationId);
  const setSelectedSceneId = useEditorStore((state) => state.setSelectedSceneId);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const [locationSearch, setLocationSearch] = useState("");
  const [showConnectedOnly, setShowConnectedOnly] = useState(false);
  const currentLocation = project.locations.items.find((entry) => entry.id === selectedLocationId) ?? project.locations.items[0];
  const locationEdges = resolveWorldLocationEdges(project);
  const locationConnectionCounts = resolveLocationConnectionCounts(locationEdges);
  const currentLocationSummary = currentLocation
    ? resolveLocationSummary(project, currentLocation, locationConnectionCounts.get(currentLocation.id) ?? 0)
    : undefined;
  const visibleLocations = project.locations.items.filter((location) => {
    const matchesSearch = location.name.toLowerCase().includes(locationSearch.trim().toLowerCase());
    const matchesFilter = !showConnectedOnly || (locationConnectionCounts.get(location.id) ?? 0) > 0;
    return matchesSearch && matchesFilter;
  });

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

  return (
    <div className="panel-grid panel-grid--world">
      <section className="panel panel--flow world-panel__workspace">
        <aside className="world-panel__location-rail" aria-label="Locations">
          <div className="world-panel__rail-header">
            <h3>Locations</h3>
            <button type="button" className="world-panel__compact-action" title="Create a location on the world map." onClick={createLocation}>
              <WorldPanelIcon kind="locationAdd" />
              <span>Add Location</span>
            </button>
          </div>

          <div className="world-panel__rail-controls">
            <label className="world-panel__search-field">
              <WorldPanelIcon kind="search" />
              <input
                aria-label="Search locations"
                placeholder="Search locations..."
                value={locationSearch}
                onChange={(event) => setLocationSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={showConnectedOnly ? "world-panel__icon-action world-panel__icon-action--active" : "world-panel__icon-action"}
              aria-label="Show connected locations only"
              aria-pressed={showConnectedOnly}
              title="Show connected locations only."
              onClick={() => setShowConnectedOnly((value) => !value)}
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
                    title={`Select ${location.name}.`}
                  >
                    <WorldPanelIcon kind={resolveLocationIconKind(location)} />
                    <span className="world-panel__location-row-copy">
                      <strong>{location.name}</strong>
                    </span>
                    <span className="world-panel__location-row-count">{formatCount(location.sceneIds.length, "scene")}</span>
                  </button>
                );
              })
              ) : (
                <div className="world-panel__empty-state world-panel__empty-state--rail">
                  <WorldPanelIcon kind="search" />
                  <strong>No matching locations</strong>
                </div>
              )}
            </div>
          ) : (
            <div className="world-panel__empty-state world-panel__empty-state--rail">
              <WorldPanelIcon kind="locationAdd" />
              <strong>No locations yet</strong>
            </div>
          )}

          <div className="world-panel__rail-footer">
            <span>{formatCount(project.locations.items.length, "location")}</span>
            <WorldPanelIcon kind="menu" />
          </div>
        </aside>

        <WorldLocationMap
          locations={project.locations.items}
          edges={locationEdges}
          selectedLocationId={currentLocation?.id}
          startLocationId={project.manifest.startLocationId}
          connectionCounts={locationConnectionCounts}
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
                <h3>Location Details</h3>
              </div>
              <button type="button" className="world-panel__icon-action" aria-label="Location settings" title="Location settings.">
                <WorldPanelIcon kind="gear" />
              </button>
            </div>
            <label>
              <span className="field-label--inset">Name</span>
              <input
                value={currentLocation.name}
                title="Rename this location."
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

            <div className="world-panel__stat-grid" aria-label="Location summary">
              {currentLocationSummary
                ? [
                    { icon: "scene" as const, label: "Scenes", value: currentLocationSummary.scenes },
                    { icon: "quest" as const, label: "Quests", value: currentLocationSummary.quests },
                    { icon: "connection" as const, label: "Connections", value: currentLocationSummary.connections },
                    { icon: "npc" as const, label: "NPCs", value: currentLocationSummary.npcs },
                    { icon: "variable" as const, label: "Variables", value: currentLocationSummary.variables },
                    { icon: "item" as const, label: "Items", value: currentLocationSummary.items }
                  ].map((stat) => (
                    <div key={stat.label}>
                      <WorldPanelIcon kind={stat.icon} />
                      <span>{stat.label}</span>
                      <strong>{stat.value}</strong>
                    </div>
                  ))
                : null}
            </div>

            <div className="world-panel__scenes">
              <div className="world-panel__section-header">
                <h4>Scenes</h4>
                <button
                  type="button"
                  className="world-panel__compact-action world-panel__compact-action--primary"
                  title={`Add a scene to ${currentLocation.name}.`}
                  onClick={createSceneInCurrentLocation}
                >
                  <WorldPanelIcon kind="sceneAdd" />
                  <span>Add Scene</span>
                </button>
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
                          <strong>Missing scene</strong>
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
                      title={`Open ${scene.name} in Scenes.`}
                    >
                      <span className="world-panel__scene-index">{formatIndex(index)}</span>
                      <span className="world-panel__scene-copy">
                        <strong>{scene.name}</strong>
                        <span className="world-panel__scene-meta">
                          {scene.id === project.manifest.startSceneId ? <span>Start scene</span> : null}
                          <span>
                            <WorldPanelIcon kind="npc" />
                            NPCs {sceneSummary.npcs}
                          </span>
                          <span>
                            <WorldPanelIcon kind="quest" />
                            Quests {sceneSummary.quests}
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
                  <strong>No scenes here</strong>
                  <button type="button" onClick={createSceneInCurrentLocation}>
                    <WorldPanelIcon kind="sceneAdd" />
                    <span>Add Scene</span>
                  </button>
                </div>
              )}
              <div className="world-panel__details-footer">{formatCount(currentLocation.sceneIds.length, "scene")}</div>
            </div>
          </>
        ) : (
          <div className="world-panel__empty-state world-panel__empty-state--details">
            <WorldPanelIcon kind="locationAdd" />
            <strong>Choose a location</strong>
            <button type="button" onClick={createLocation}>
              <WorldPanelIcon kind="locationAdd" />
              <span>Add Location</span>
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
      if (!locationEdges.some((edge) => edge.id === edgeId)) {
        locationEdges.push({
          id: edgeId,
          source: sourceLocation.id,
          target: targetLocation.id
        });
      }
    }
  }

  return locationEdges;
}

function resolveLocationConnectionCounts(locationEdges: WorldLocationEdge[]) {
  const counts = new Map<string, number>();

  for (const edge of locationEdges) {
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
    counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
  }

  return counts;
}

function formatCount(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function formatIndex(index: number) {
  return String(index + 1).padStart(2, "0");
}

function resolveLocationIconKind(location: Location): WorldPanelIconKind {
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

function resolveLocationSummary(project: ProjectBundle, location: Location, connections: number) {
  const refs = createStoryRefs();
  const npcNames = new Set<string>();
  const scenes = resolveLocationScenes(project, location);

  for (const scene of scenes) {
    collectSceneReferences(scene, refs);
  }

  collectDialogueReferences(project, refs, npcNames);

  return {
    scenes: scenes.length,
    connections,
    quests: refs.dialogueIds.size,
    npcs: npcNames.size,
    variables: refs.variableIds.size,
    items: refs.itemIds.size
  };
}

function resolveSceneSummary(project: ProjectBundle, scene: Scene) {
  const refs = createStoryRefs();
  const npcNames = new Set<string>();

  collectSceneReferences(scene, refs);
  collectDialogueReferences(project, refs, npcNames);

  return {
    quests: refs.dialogueIds.size,
    npcs: npcNames.size
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

  for (const hotspot of scene.hotspots) {
    if (hotspot.dialogueTreeId) {
      refs.dialogueIds.add(hotspot.dialogueTreeId);
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
  }
}

function collectDialogueReferences(project: ProjectBundle, refs: ReturnType<typeof createStoryRefs>, npcNames: Set<string>) {
  for (const dialogueId of refs.dialogueIds) {
    const dialogue = project.dialogues.items.find((entry) => entry.id === dialogueId);
    if (!dialogue) {
      continue;
    }

    for (const node of dialogue.nodes) {
      npcNames.add(node.speaker);
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
    if (condition.type === "flagEquals") {
      refs.variableIds.add(condition.flag);
    }

    if (condition.type === "inventoryHas") {
      refs.itemIds.add(condition.itemId);
    }
  }
}

function collectEffectReferences(effects: Effect[], refs: ReturnType<typeof createStoryRefs>) {
  for (const effect of effects) {
    if (effect.type === "setFlag") {
      refs.variableIds.add(effect.flag);
    }

    if (effect.type === "addItem" || effect.type === "removeItem") {
      refs.itemIds.add(effect.itemId);
    }

    if (effect.type === "playDialogue") {
      refs.dialogueIds.add(effect.dialogueTreeId);
    }
  }
}

function WorldLocationMap({
  locations,
  edges,
  selectedLocationId,
  startLocationId,
  connectionCounts,
  onCreateLocation,
  onMoveLocation,
  onSelectLocation
}: {
  locations: Location[];
  edges: WorldLocationEdge[];
  selectedLocationId?: string;
  startLocationId: string;
  connectionCounts: Map<string, number>;
  onCreateLocation: () => void;
  onMoveLocation: (locationId: string, position: { x: number; y: number }) => void;
  onSelectLocation: (locationId: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const autoFitSignatureRef = useRef<string | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [mapTool, setMapTool] = useState<"select" | "pan">("select");
  const [mapSearch, setMapSearch] = useState("");
  const [showGrid, setShowGrid] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [showSceneCounts, setShowSceneCounts] = useState(true);
  const [showMapOptions, setShowMapOptions] = useState(false);
  const [interaction, setInteraction] = useState<MapInteraction>(null);
  const [dragPreview, setDragPreview] = useState<Record<string, { x: number; y: number }>>({});
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
            <h3>Location Map</h3>
            <span>
              {formatCount(locations.length, "location")} / {formatCount(edges.length, "link")}
            </span>
          </div>

          <div className="world-panel__map-tools" role="toolbar" aria-label="Location map tools">
            <button
              type="button"
              className={mapTool === "select" ? "world-panel__map-tool world-panel__map-tool--active" : "world-panel__map-tool"}
              aria-label="Select map tool"
              aria-pressed={mapTool === "select"}
              title="Select and move locations"
              onClick={() => setMapTool("select")}
            >
              <WorldPanelIcon kind="select" />
            </button>
            <button
              type="button"
              className={mapTool === "pan" ? "world-panel__map-tool world-panel__map-tool--active" : "world-panel__map-tool"}
              aria-label="Pan map tool"
              aria-pressed={mapTool === "pan"}
              title="Pan the map"
              onClick={() => setMapTool("pan")}
            >
              <WorldPanelIcon kind="pan" />
            </button>
            <button type="button" className="world-panel__map-tool" aria-label="Fit map" title="Fit locations in view" onClick={fitMap}>
              <WorldPanelIcon kind="fit" />
            </button>
            <button type="button" className="world-panel__map-tool" aria-label="Add location" title="Add location" onClick={onCreateLocation}>
              <WorldPanelIcon kind="locationAdd" />
            </button>
            <button type="button" className="world-panel__map-tool" aria-label="Zoom in" title="Zoom in" onClick={() => zoomMap(1.16)}>
              <WorldPanelIcon kind="zoomIn" />
            </button>
            <button type="button" className="world-panel__map-tool" aria-label="Zoom out" title="Zoom out" onClick={() => zoomMap(0.86)}>
              <WorldPanelIcon kind="zoomOut" />
            </button>
            <button
              type="button"
              className={showGrid ? "world-panel__map-tool world-panel__map-tool--active" : "world-panel__map-tool"}
              aria-label="Toggle map grid"
              aria-pressed={showGrid}
              title="Toggle map grid"
              onClick={() => setShowGrid((value) => !value)}
            >
              <WorldPanelIcon kind="grid" />
            </button>
            <button
              type="button"
              className={showLinks ? "world-panel__map-tool world-panel__map-tool--active" : "world-panel__map-tool"}
              aria-label="Toggle location links"
              aria-pressed={showLinks}
              title="Toggle location links"
              onClick={() => setShowLinks((value) => !value)}
            >
              <WorldPanelIcon kind="links" />
            </button>
          </div>
        </div>

        <div className="world-panel__map-toolbar-actions">
          <label className="world-panel__search-field world-panel__search-field--map">
            <WorldPanelIcon kind="search" />
            <input
              aria-label="Search map"
              placeholder="Search map..."
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
            aria-label="Map options"
            aria-expanded={showMapOptions}
            title="Map options."
            onClick={() => setShowMapOptions((value) => !value)}
          >
            <WorldPanelIcon kind="gear" />
          </button>
          {showMapOptions ? (
            <div className="world-panel__map-options">
              <label>
                <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                <span>Grid</span>
              </label>
              <label>
                <input type="checkbox" checked={showLinks} onChange={(event) => setShowLinks(event.target.checked)} />
                <span>Links</span>
              </label>
              <label>
                <input type="checkbox" checked={showSceneCounts} onChange={(event) => setShowSceneCounts(event.target.checked)} />
                <span>Scene counts</span>
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
        aria-label="World location map"
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
              className="world-panel__map-links"
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
              width={canvasSize.width}
              height={canvasSize.height}
              aria-hidden="true"
            >
              {showLinks ? edges.map((edge) => {
                const geometry = resolveMapEdgeGeometry(edge, locationPositions);
                if (!geometry) {
                  return null;
                }

                const isSelected = edge.source === selectedLocationId || edge.target === selectedLocationId;

                return (
                  <g
                    key={edge.id}
                    className={isSelected ? "world-panel__map-edge world-panel__map-edge--selected" : "world-panel__map-edge"}
                  >
                    <path d={`M ${geometry.source.x} ${geometry.source.y} L ${geometry.target.x} ${geometry.target.y}`} />
                    <circle className="world-panel__map-edge-terminal" cx={geometry.source.x} cy={geometry.source.y} r="7" />
                    <circle className="world-panel__map-edge-terminal" cx={geometry.target.x} cy={geometry.target.y} r="7" />
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
                  style={{ left: position.x, top: position.y } as CSSProperties}
                  aria-pressed={isSelected}
                  title={`Select ${location.name}.`}
                  onPointerDown={(event) => handleNodePointerDown(event, location)}
                  onClick={() => onSelectLocation(location.id)}
                >
                  <WorldPanelIcon kind={resolveLocationIconKind(location)} />
                  <span className="world-panel__map-node-copy">
                    <strong>{location.name}</strong>
                    {showSceneCounts ? <span>{formatCount(location.sceneIds.length, "scene")}</span> : null}
                  </span>
                  {location.id === startLocationId ? <span className="world-panel__start-badge">Start</span> : null}
                  {connectionCounts.get(location.id) ? (
                    <span className="world-panel__map-node-links">{formatCount(connectionCounts.get(location.id) ?? 0, "link")}</span>
                  ) : null}
                  {isSelected ? (
                    <>
                      <span className="world-panel__map-node-port world-panel__map-node-port--top" />
                      <span className="world-panel__map-node-port world-panel__map-node-port--right" />
                      <span className="world-panel__map-node-port world-panel__map-node-port--bottom" />
                      <span className="world-panel__map-node-port world-panel__map-node-port--left" />
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="world-panel__empty-state world-panel__empty-state--map">
            <WorldPanelIcon kind="locationAdd" />
            <strong>No locations yet</strong>
            <button type="button" onClick={onCreateLocation}>
              <WorldPanelIcon kind="locationAdd" />
              <span>Add Location</span>
            </button>
          </div>
        )}
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

  if (kind === "links") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="6.7" cy="12" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="17.3" cy="7.4" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="17.3" cy="16.6" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="m8.9 11 6.2-2.7M8.9 13l6.2 2.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.55" />
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

  if (kind === "quest") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.2 4.8h7.2l2.4 2.4v12H7.2v-14.4Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.65" />
        <path d="M14.4 4.8v2.4h2.4M9.7 11.2h4.6M9.7 14.6h3.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.45" />
      </svg>
    );
  }

  if (kind === "npc") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8.4" r="3" fill="none" stroke="currentColor" strokeWidth="1.65" />
        <path d="M6.8 18.7c.8-3.2 2.5-4.8 5.2-4.8s4.4 1.6 5.2 4.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.65" />
        <path d="M18.2 10.7a2.3 2.3 0 0 1 0 4.4M5.8 10.7a2.3 2.3 0 0 0 0 4.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
      </svg>
    );
  }

  if (kind === "variable") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.2 7.2h13.6M5.2 12h13.6M5.2 16.8h13.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        <path d="M9 5.2v4M15 10v4M11.5 14.8v4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25" />
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

  if (kind === "connection") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.4 12.6c3.2-4.1 6-4.8 9.2-1.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <circle cx="5.6" cy="14.2" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="18.4" cy="9.8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
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

import ReactFlow, { Background, Controls, type Edge, type Node, type NodeDragHandler } from "reactflow";
import { collectSceneLinks, type Location, type ProjectBundle, type Scene } from "@mage2/schema";
import { addLocation, addScene } from "../project-helpers";
import { useEditorStore } from "../store";

interface WorldPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}

export function WorldPanel({ project, mutateProject }: WorldPanelProps) {
  const selectedLocationId = useEditorStore((state) => state.selectedLocationId);
  const selectedSceneId = useEditorStore((state) => state.selectedSceneId);
  const setSelectedLocationId = useEditorStore((state) => state.setSelectedLocationId);
  const setSelectedSceneId = useEditorStore((state) => state.setSelectedSceneId);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const currentLocation = project.locations.items.find((entry) => entry.id === selectedLocationId) ?? project.locations.items[0];
  const locationEdges = resolveWorldLocationEdges(project);
  const locationConnectionCounts = resolveLocationConnectionCounts(locationEdges);

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

  const locationNodes: Node[] = project.locations.items.map((location) => {
    const isSelected = location.id === currentLocation?.id;

    return {
      id: location.id,
      data: {
        label: (
          <LocationMapNode
            location={location}
            isSelected={isSelected}
            sceneCount={location.sceneIds.length}
            connectionCount={locationConnectionCounts.get(location.id) ?? 0}
            isStartLocation={project.manifest.startLocationId === location.id}
          />
        )
      },
      position: { x: location.x, y: location.y },
      className: isSelected ? "world-panel__flow-node world-panel__flow-node--selected" : "world-panel__flow-node",
      connectable: false,
      style: {
        background: "transparent",
        border: 0,
        color: "inherit",
        padding: 0,
        width: 190
      }
    };
  });

  const onLocationDragStop: NodeDragHandler = (_event, node) => {
    mutateProject((draft) => {
      const location = draft.locations.items.find((entry) => entry.id === node.id);
      if (location) {
        location.x = node.position.x;
        location.y = node.position.y;
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

          {project.locations.items.length > 0 ? (
            <div className="world-panel__location-list" role="list">
              {project.locations.items.map((location) => {
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
                    <WorldPanelIcon kind={isSelected ? "selectedLocation" : "location"} />
                    <span className="world-panel__location-row-copy">
                      <strong>{location.name}</strong>
                      <span>{formatCount(locationConnectionCounts.get(location.id) ?? 0, "connection")}</span>
                    </span>
                    <span className="world-panel__location-row-count">{formatCount(location.sceneIds.length, "scene")}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="world-panel__empty-state world-panel__empty-state--rail">
              <WorldPanelIcon kind="locationAdd" />
              <strong>No locations yet</strong>
            </div>
          )}

          <div className="world-panel__rail-footer">{formatCount(project.locations.items.length, "location")}</div>
        </aside>

        <div className="world-panel__map-column">
          <div className="panel__toolbar world-panel__map-toolbar">
            <div className="world-panel__toolbar-title">
              <h3>World Map</h3>
              <span>
                {formatCount(project.locations.items.length, "location")} / {formatCount(locationEdges.length, "link")}
              </span>
            </div>
          </div>

          <div className="world-panel__map-stage">
            {project.locations.items.length > 0 ? (
              <ReactFlow
                nodes={locationNodes}
                edges={locationEdges}
                fitView
                aria-label="World location map"
                onNodeClick={(_event, node) => setSelectedLocationId(node.id)}
                onNodeDragStop={onLocationDragStop}
              >
                <Background color="#30404d" />
                <Controls />
              </ReactFlow>
            ) : (
              <div className="world-panel__empty-state world-panel__empty-state--map">
                <WorldPanelIcon kind="locationAdd" />
                <strong>No locations yet</strong>
                <button type="button" onClick={createLocation}>
                  <WorldPanelIcon kind="locationAdd" />
                  <span>Add Location</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="panel world-panel__details">
        {currentLocation ? (
          <>
            <div className="world-panel__details-header">
              <div>
                <span className="world-panel__eyebrow">Location</span>
                <h3>{currentLocation.name}</h3>
              </div>
              <span className="world-panel__details-count">{formatCount(currentLocation.sceneIds.length, "scene")}</span>
            </div>
            <label>
              <span className="field-label--inset">Location Name</span>
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
              <div>
                <WorldPanelIcon kind="scene" />
                <span>Scenes</span>
                <strong>{currentLocation.sceneIds.length}</strong>
              </div>
              <div>
                <WorldPanelIcon kind="connection" />
                <span>Links</span>
                <strong>{locationConnectionCounts.get(currentLocation.id) ?? 0}</strong>
              </div>
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
                {currentLocation.sceneIds.map((sceneId) => {
                  const scene = project.scenes.items.find((entry) => entry.id === sceneId);
                  if (!scene) {
                    return (
                      <div key={sceneId} className="world-panel__scene-row world-panel__scene-row--missing" role="listitem">
                        <WorldPanelIcon kind="emptyScene" />
                        <span className="world-panel__scene-copy">
                          <strong>Missing scene</strong>
                          <span>{sceneId}</span>
                        </span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={scene.id}
                      type="button"
                      className={scene.id === selectedSceneId ? "world-panel__scene-row world-panel__scene-row--selected" : "world-panel__scene-row"}
                      onClick={() => openScene(scene)}
                      title={`Open ${scene.name} in Scenes.`}
                    >
                      <WorldPanelIcon kind="scene" />
                      <span className="world-panel__scene-copy">
                        <strong>{scene.name}</strong>
                        <span>
                          {scene.id === project.manifest.startSceneId ? "Start scene" : formatCount(scene.hotspots.length, "hotspot")}
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
            </div>
          </>
        ) : (
          <div className="world-panel__empty-state world-panel__empty-state--details">
            <WorldPanelIcon kind="selectedLocation" />
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

export function resolveWorldLocationEdges(project: ProjectBundle): Edge[] {
  const locationEdges: Edge[] = [];

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
          target: targetLocation.id,
          animated: true,
          style: { stroke: "#17b7d8" }
        });
      }
    }
  }

  return locationEdges;
}

function resolveLocationConnectionCounts(locationEdges: Edge[]) {
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

function LocationMapNode({
  location,
  isSelected,
  sceneCount,
  connectionCount,
  isStartLocation
}: {
  location: Location;
  isSelected: boolean;
  sceneCount: number;
  connectionCount: number;
  isStartLocation: boolean;
}) {
  return (
    <div className={isSelected ? "world-panel__map-node world-panel__map-node--selected" : "world-panel__map-node"}>
      <WorldPanelIcon kind={isSelected ? "selectedLocation" : "location"} />
      <span className="world-panel__map-node-copy">
        <strong>{location.name}</strong>
        <span>
          {formatCount(sceneCount, "scene")}
          {connectionCount > 0 ? ` / ${formatCount(connectionCount, "link")}` : ""}
        </span>
      </span>
      {isStartLocation ? <span className="world-panel__start-badge">Start</span> : null}
    </div>
  );
}

function WorldPanelIcon({
  kind
}: {
  kind: "location" | "locationAdd" | "scene" | "sceneAdd" | "connection" | "selectedLocation" | "jump" | "emptyScene";
}) {
  if (kind === "locationAdd") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 21s6.2-5.9 6.2-11.1a6.2 6.2 0 1 0-12.4 0C5.8 15.1 12 21 12 21Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path d="M12 7.5v5M9.5 10h5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
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

  if (kind === "connection") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.4 12.6c3.2-4.1 6-4.8 9.2-1.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <circle cx="5.6" cy="14.2" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="18.4" cy="9.8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  if (kind === "selectedLocation") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 20.4s5.7-5.4 5.7-10.1a5.7 5.7 0 0 0-11.4 0c0 4.7 5.7 10.1 5.7 10.1Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.85"
        />
        <circle cx="12" cy="10.4" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M5.2 19.5c1.4 1.1 3.8 1.8 6.8 1.8s5.4-.7 6.8-1.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.45" />
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

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s6.2-5.9 6.2-11.1a6.2 6.2 0 1 0-12.4 0C5.8 15.1 12 21 12 21Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="9.9" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

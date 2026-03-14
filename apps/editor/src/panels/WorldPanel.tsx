import ReactFlow, { Background, Controls, type Edge, type Node, type NodeDragHandler } from "reactflow";
import { collectSceneLinks, type ProjectBundle } from "@mage2/schema";
import { addLocation, addScene } from "../project-helpers";
import { useEditorStore } from "../store";

interface WorldPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}

export function WorldPanel({ project, mutateProject }: WorldPanelProps) {
  const selectedLocationId = useEditorStore((state) => state.selectedLocationId);
  const setSelectedLocationId = useEditorStore((state) => state.setSelectedLocationId);
  const setSelectedSceneId = useEditorStore((state) => state.setSelectedSceneId);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const currentLocation = project.locations.items.find((entry) => entry.id === selectedLocationId) ?? project.locations.items[0];

  const locationNodes: Node[] = project.locations.items.map((location) => ({
    id: location.id,
    data: { label: location.name },
    position: { x: location.x, y: location.y },
    style: {
      background: location.id === currentLocation?.id ? "#f6c177" : "#202b36",
      color: location.id === currentLocation?.id ? "#1c2329" : "#f7fafc",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 18,
      padding: 12,
      width: 180
    }
  }));

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
          style: { stroke: "#7dd3fc" }
        });
      }
    }
  }

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
      <section className="panel panel--flow">
        <div className="panel__toolbar">
          <h3>Location Map</h3>
          <div className="world-panel__toolbar-actions">
            <button
              type="button"
              title="Create a new world location node and select it in the inspector."
              onClick={() =>
                mutateProject((draft) => {
                  const location = addLocation(draft);
                  setSelectedLocationId(location.id);
                  setSelectedSceneId(location.sceneIds[0]);
                })
              }
            >
              Add Location
            </button>
            <button
              type="button"
              title="Add a new scene under the currently selected location."
              onClick={() =>
                mutateProject((draft) => {
                  const scene = addScene(draft, currentLocation?.id);
                  setSelectedSceneId(scene.id);
                })
              }
            >
              Add Scene
            </button>
          </div>
        </div>

        <ReactFlow
          nodes={locationNodes}
          edges={locationEdges}
          fitView
          aria-label="Location map editor"
          onNodeClick={(_event, node) => setSelectedLocationId(node.id)}
          onNodeDragStop={onLocationDragStop}
        >
          <Background color="#30404d" />
          <Controls />
        </ReactFlow>
      </section>

      <aside className="panel world-panel__details">
        {currentLocation ? (
          <>
            <h3>{currentLocation.name}</h3>
            <label>
              Name
              <input
                value={currentLocation.name}
                title="Editable display name for the selected location node."
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
            <div className="world-panel__scenes">
              <h4>Scenes</h4>
              <div className="pill-list">
                {currentLocation.sceneIds.map((sceneId) => {
                  const scene = project.scenes.items.find((entry) => entry.id === sceneId);
                  if (!scene) {
                    return null;
                  }

                  return (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => {
                        setSelectedSceneId(scene.id);
                        setActiveTab("scenes");
                      }}
                      title={`Jump to ${scene.name} in the scene editor.`}
                    >
                      {scene.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <p>Select a location node.</p>
        )}
      </aside>
    </div>
  );
}

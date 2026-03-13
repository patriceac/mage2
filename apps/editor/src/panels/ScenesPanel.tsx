import { MediaSurface } from "../MediaSurface";
import type { ProjectBundle } from "@mage2/schema";
import { addClipSegment, addHotspot, createId, ensureString } from "../project-helpers";
import { useEditorStore } from "../store";

interface ScenesPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}

export function ScenesPanel({ project, mutateProject }: ScenesPanelProps) {
  const selectedSceneId = useEditorStore((state) => state.selectedSceneId);
  const playheadMs = useEditorStore((state) => state.playheadMs);
  const setSelectedSceneId = useEditorStore((state) => state.setSelectedSceneId);
  const selectedHotspotId = useEditorStore((state) => state.selectedHotspotId);
  const setSelectedHotspotId = useEditorStore((state) => state.setSelectedHotspotId);
  const setPlayheadMs = useEditorStore((state) => state.setPlayheadMs);

  const currentScene = project.scenes.items.find((entry) => entry.id === selectedSceneId) ?? project.scenes.items[0];
  const currentAsset = project.assets.assets.find((entry) => entry.id === currentScene?.backgroundAssetId);

  if (!currentScene) {
    return <div className="panel"><p>Create a scene to begin.</p></div>;
  }

  return (
    <div className="panel-grid panel-grid--scenes">
      <section className="panel">
        <div className="panel__toolbar">
          <div className="stack-inline">
            <label>
              Location
              <select
                value={currentScene.locationId}
                onChange={(event) =>
                  mutateProject((draft) => {
                    const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                    if (!scene) {
                      return;
                    }

                    const previousLocation = draft.locations.items.find((entry) => entry.id === scene.locationId);
                    const nextLocation = draft.locations.items.find((entry) => entry.id === event.target.value);
                    if (previousLocation) {
                      previousLocation.sceneIds = previousLocation.sceneIds.filter((sceneId) => sceneId !== scene.id);
                    }
                    if (nextLocation && !nextLocation.sceneIds.includes(scene.id)) {
                      nextLocation.sceneIds.push(scene.id);
                    }
                    scene.locationId = event.target.value;
                  })
                }
                onFocus={() => setSelectedHotspotId(undefined)}
              >
                {project.locations.items.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scene
              <select
                value={currentScene.id}
                onChange={(event) => {
                  setSelectedSceneId(event.target.value);
                  setSelectedHotspotId(undefined);
                }}
              >
                {project.scenes.items.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="stack-inline">
            <button
              type="button"
              onClick={() =>
                mutateProject((draft) => {
                  addClipSegment(draft, currentScene.id);
                })
              }
            >
              Add Segment
            </button>
            <button
              type="button"
              className="button-danger"
              disabled={!selectedHotspotId}
              onClick={() =>
                mutateProject((draft) => {
                  const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                  if (!scene || !selectedHotspotId) {
                    return;
                  }

                  scene.hotspots = scene.hotspots.filter((hotspot) => hotspot.id !== selectedHotspotId);
                  setSelectedHotspotId(scene.hotspots[0]?.id);
                })
              }
            >
              Delete Hotspot
            </button>
            <button type="button" onClick={() => setSelectedHotspotId(undefined)}>
              Clear Hotspot
            </button>
          </div>
        </div>

        <label>
          Scene Name
          <input
            value={currentScene.name}
            onChange={(event) =>
              mutateProject((draft) => {
                const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                if (scene) {
                  scene.name = event.target.value;
                }
              })
            }
          />
        </label>

        <label>
          Background Asset
          <select
            value={currentScene.backgroundAssetId}
            onChange={(event) =>
              mutateProject((draft) => {
                const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                if (scene) {
                  scene.backgroundAssetId = event.target.value;
                }
              })
            }
          >
            {project.assets.assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>

        <MediaSurface
          asset={currentAsset}
          hotspots={currentScene.hotspots}
          selectedHotspotId={selectedHotspotId}
          onSurfaceClick={(x, y) =>
            mutateProject((draft) => {
              const hotspot = addHotspot(draft, currentScene.id, x, y);
              setSelectedHotspotId(hotspot?.id);
            })
          }
          onHotspotClick={(hotspotId) => setSelectedHotspotId(hotspotId)}
        />

        <label>
          Playhead {Math.round(playheadMs)}ms
          <input
            type="range"
            min={0}
            max={currentAsset?.durationMs ?? 30000}
            value={Math.min(playheadMs, currentAsset?.durationMs ?? 30000)}
            onChange={(event) => setPlayheadMs(Number(event.target.value))}
          />
        </label>

        <div className="split-columns">
          <section>
            <h4>Clip Segments</h4>
            {currentScene.clipSegments.map((segment) => (
              <div key={segment.id} className="list-card list-card--compact">
                <input
                  value={segment.name}
                  onChange={(event) =>
                    mutateProject((draft) => {
                      const target = draft.scenes.items
                        .find((entry) => entry.id === currentScene.id)
                        ?.clipSegments.find((entry) => entry.id === segment.id);
                      if (target) {
                        target.name = event.target.value;
                      }
                    })
                  }
                />
                <div className="stack-inline">
                  <input
                    type="number"
                    value={segment.startMs}
                    onChange={(event) =>
                      mutateProject((draft) => {
                        const target = draft.scenes.items
                          .find((entry) => entry.id === currentScene.id)
                          ?.clipSegments.find((entry) => entry.id === segment.id);
                        if (target) {
                          target.startMs = Number(event.target.value);
                        }
                      })
                    }
                  />
                  <input
                    type="number"
                    value={segment.endMs}
                    onChange={(event) =>
                      mutateProject((draft) => {
                        const target = draft.scenes.items
                          .find((entry) => entry.id === currentScene.id)
                          ?.clipSegments.find((entry) => entry.id === segment.id);
                        if (target) {
                          target.endMs = Number(event.target.value);
                        }
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </section>

          <section>
            <h4>Scene Wiring</h4>
            <label>
              Exit Scene IDs
              <input
                value={currentScene.exitSceneIds.join(", ")}
                onChange={(event) =>
                  mutateProject((draft) => {
                    const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                    if (scene) {
                      scene.exitSceneIds = event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean);
                    }
                  })
                }
              />
            </label>
            <JsonField
              label="On Enter Effects JSON"
              value={JSON.stringify(currentScene.onEnterEffects, null, 2)}
              onCommit={(nextValue) =>
                mutateProject((draft) => {
                  const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                  if (scene) {
                    scene.onEnterEffects = parseJson(nextValue, scene.onEnterEffects);
                  }
                })
              }
            />
            <JsonField
              label="On Exit Effects JSON"
              value={JSON.stringify(currentScene.onExitEffects, null, 2)}
              onCommit={(nextValue) =>
                mutateProject((draft) => {
                  const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                  if (scene) {
                    scene.onExitEffects = parseJson(nextValue, scene.onExitEffects);
                  }
                })
              }
            />
            <label>
              Scene Dialogues
              <div className="checkbox-list">
                {project.dialogues.items.map((dialogue) => (
                  <label key={dialogue.id}>
                    <input
                      type="checkbox"
                      checked={currentScene.dialogueTreeIds.includes(dialogue.id)}
                      onChange={(event) =>
                        mutateProject((draft) => {
                          const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                          if (!scene) {
                            return;
                          }

                          scene.dialogueTreeIds = event.target.checked
                            ? [...new Set([...scene.dialogueTreeIds, dialogue.id])]
                            : scene.dialogueTreeIds.filter((dialogueId) => dialogueId !== dialogue.id);
                        })
                      }
                    />
                    {dialogue.name}
                  </label>
                ))}
              </div>
            </label>
          </section>
        </div>

        <section>
          <div className="panel__toolbar">
            <h4>Subtitle Tracks</h4>
            <button
              type="button"
              onClick={() =>
                mutateProject((draft) => {
                  const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                  if (!scene) {
                    return;
                  }
                  const trackId = createId("subtitle");
                  const textId = `text.${trackId}.cue`;
                  ensureString(draft, textId, "A subtitle cue");
                  draft.subtitles.items.push({
                    id: trackId,
                    assetId: scene.backgroundAssetId,
                    cues: [{ id: createId("cue"), startMs: 0, endMs: 3000, textId }]
                  });
                  scene.subtitleTrackIds.push(trackId);
                })
              }
            >
              Add Track
            </button>
          </div>

          {project.subtitles.items
            .filter((track) => currentScene.subtitleTrackIds.includes(track.id))
            .map((track) => (
              <div key={track.id} className="list-card">
                <h5>{track.id}</h5>
                {track.cues.map((cue) => (
                  <div key={cue.id} className="cue-row">
                    <input
                      type="number"
                      value={cue.startMs}
                      onChange={(event) =>
                        mutateProject((draft) => {
                          const target = draft.subtitles.items
                            .find((entry) => entry.id === track.id)
                            ?.cues.find((entry) => entry.id === cue.id);
                          if (target) {
                            target.startMs = Number(event.target.value);
                          }
                        })
                      }
                    />
                    <input
                      type="number"
                      value={cue.endMs}
                      onChange={(event) =>
                        mutateProject((draft) => {
                          const target = draft.subtitles.items
                            .find((entry) => entry.id === track.id)
                            ?.cues.find((entry) => entry.id === cue.id);
                          if (target) {
                            target.endMs = Number(event.target.value);
                          }
                        })
                      }
                    />
                    <input
                      value={project.strings.values[cue.textId] ?? ""}
                      onChange={(event) =>
                        mutateProject((draft) => {
                          draft.strings.values[cue.textId] = event.target.value;
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            ))}
        </section>
      </section>

      <aside className="panel">
        <h3>Hotspot Inspector</h3>
        <p className="muted">
          These rectangles are hotspots: clickable interaction regions over the scene. Select one to edit its
          position, size, timing, and behavior.
        </p>
        {currentScene.hotspots
          .filter((hotspot) => !selectedHotspotId || hotspot.id === selectedHotspotId)
          .map((hotspot) => (
            <article
              key={hotspot.id}
              className={hotspot.id === selectedHotspotId ? "list-card list-card--selected" : "list-card"}
            >
              <div className="panel__toolbar">
                <input
                  value={hotspot.name}
                  onChange={(event) =>
                    mutateProject((draft) => {
                      const target = draft.scenes.items
                        .find((entry) => entry.id === currentScene.id)
                        ?.hotspots.find((entry) => entry.id === hotspot.id);
                      if (target) {
                        target.name = event.target.value;
                      }
                    })
                  }
                />
                <button
                  type="button"
                  className="button-danger"
                  onClick={() =>
                    mutateProject((draft) => {
                      const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                      if (!scene) {
                        return;
                      }

                      scene.hotspots = scene.hotspots.filter((entry) => entry.id !== hotspot.id);
                      if (selectedHotspotId === hotspot.id) {
                        setSelectedHotspotId(scene.hotspots[0]?.id);
                      }
                    })
                  }
                >
                  Delete
                </button>
              </div>
              <label>
                Label
                <input
                  value={project.strings.values[hotspot.labelTextId] ?? ""}
                  onChange={(event) =>
                    mutateProject((draft) => {
                      draft.strings.values[hotspot.labelTextId] = event.target.value;
                    })
                  }
                />
              </label>
              <div className="four-grid">
                {(
                  [
                    ["x", "X"],
                    ["y", "Y"],
                    ["width", "Width"],
                    ["height", "Height"]
                  ] as const
                ).map(([field, label]) => (
                  <label key={field}>
                    {label}
                    <input
                      type="number"
                      step="0.01"
                      value={hotspot[field]}
                      onChange={(event) =>
                        mutateProject((draft) => {
                          const target = draft.scenes.items
                            .find((entry) => entry.id === currentScene.id)
                            ?.hotspots.find((entry) => entry.id === hotspot.id);
                          if (target) {
                            target[field] = Number(event.target.value);
                          }
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="stack-inline">
                <label>
                  Start (ms)
                  <input
                    type="number"
                    value={hotspot.startMs}
                    onChange={(event) =>
                      mutateProject((draft) => {
                        const target = draft.scenes.items
                          .find((entry) => entry.id === currentScene.id)
                          ?.hotspots.find((entry) => entry.id === hotspot.id);
                        if (target) {
                          target.startMs = Number(event.target.value);
                        }
                      })
                    }
                  />
                </label>
                <label>
                  End (ms)
                  <input
                    type="number"
                    value={hotspot.endMs}
                    onChange={(event) =>
                      mutateProject((draft) => {
                        const target = draft.scenes.items
                          .find((entry) => entry.id === currentScene.id)
                          ?.hotspots.find((entry) => entry.id === hotspot.id);
                        if (target) {
                          target.endMs = Number(event.target.value);
                        }
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Target Scene
                <select
                  value={hotspot.targetSceneId ?? ""}
                  onChange={(event) =>
                    mutateProject((draft) => {
                      const target = draft.scenes.items
                        .find((entry) => entry.id === currentScene.id)
                        ?.hotspots.find((entry) => entry.id === hotspot.id);
                      if (target) {
                        target.targetSceneId = event.target.value || undefined;
                      }
                    })
                  }
                >
                  <option value="">None</option>
                  {project.scenes.items.map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Required Item IDs
                <input
                  value={hotspot.requiredItemIds.join(", ")}
                  onChange={(event) =>
                    mutateProject((draft) => {
                      const target = draft.scenes.items
                        .find((entry) => entry.id === currentScene.id)
                        ?.hotspots.find((entry) => entry.id === hotspot.id);
                      if (target) {
                        target.requiredItemIds = event.target.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean);
                      }
                    })
                  }
                />
              </label>
              <JsonField
                label="Conditions JSON"
                value={JSON.stringify(hotspot.conditions, null, 2)}
                onCommit={(nextValue) =>
                  mutateProject((draft) => {
                    const target = draft.scenes.items
                      .find((entry) => entry.id === currentScene.id)
                      ?.hotspots.find((entry) => entry.id === hotspot.id);
                    if (target) {
                      target.conditions = parseJson(nextValue, target.conditions);
                    }
                  })
                }
              />
              <JsonField
                label="Effects JSON"
                value={JSON.stringify(hotspot.effects, null, 2)}
                onCommit={(nextValue) =>
                  mutateProject((draft) => {
                    const target = draft.scenes.items
                      .find((entry) => entry.id === currentScene.id)
                      ?.hotspots.find((entry) => entry.id === hotspot.id);
                    if (target) {
                      target.effects = parseJson(nextValue, target.effects);
                    }
                  })
                }
              />
            </article>
          ))}
      </aside>
    </div>
  );
}

function JsonField({
  label,
  value,
  onCommit
}: {
  label: string;
  value: string;
  onCommit: (nextValue: string) => void;
}) {
  return (
    <label>
      {label}
      <textarea defaultValue={value} onBlur={(event) => onCommit(event.target.value)} />
    </label>
  );
}

function parseJson<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

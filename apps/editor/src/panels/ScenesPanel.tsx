import { MediaSurface } from "../MediaSurface";
import type { ProjectBundle } from "@mage2/schema";
import { addClipSegment, addHotspot, createId, ensureString } from "../project-helpers";
import { applyHotspotBounds, type HotspotGeometry } from "../hotspot-geometry";
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

  function updateHotspotGeometry(hotspotId: string, geometry: HotspotGeometry) {
    mutateProject((draft) => {
      const target = draft.scenes.items
        .find((entry) => entry.id === currentScene.id)
        ?.hotspots.find((entry) => entry.id === hotspotId);

      if (!target) {
        return;
      }

      target.x = geometry.x;
      target.y = geometry.y;
      target.width = geometry.width;
      target.height = geometry.height;
      target.polygon = geometry.polygon;
    });
  }

  function deleteClipSegment(segmentId: string) {
    mutateProject((draft) => {
      const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
      if (!scene) {
        return;
      }

      scene.clipSegments = scene.clipSegments.filter((entry) => entry.id !== segmentId);
      if (scene.defaultSegmentId === segmentId) {
        scene.defaultSegmentId = scene.clipSegments[0]?.id;
      }
    });
  }

  function deleteSubtitleTrack(trackId: string) {
    mutateProject((draft) => {
      const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
      if (!scene) {
        return;
      }

      scene.subtitleTrackIds = scene.subtitleTrackIds.filter((entry) => entry !== trackId);
      draft.subtitles.items = draft.subtitles.items.filter((entry) => entry.id !== trackId);
    });
  }

  return (
    <div className="panel-grid panel-grid--scenes">
      <section className="panel scenes-panel">
        <div className="panel__toolbar scenes-panel__toolbar">
          <div className="stack-inline scenes-panel__selectors">
            <label title="Choose which world location owns the currently selected scene.">
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
            <label title="Switch between scenes to edit their media, hotspots, subtitles, and wiring.">
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

          <div className="stack-inline scenes-panel__actions">
            <button
              type="button"
              title="Add a timed clip segment marker to the current scene for branch points or media slicing."
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
              title="Delete the currently selected hotspot from this scene."
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
            <button
              type="button"
              title="Deselect the current hotspot so you can inspect the scene without an active hotspot selection."
              onClick={() => setSelectedHotspotId(undefined)}
            >
              Clear Hotspot
            </button>
          </div>
        </div>

        <label title="Readable editor name for the current scene.">
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

        <label title="Background media shown for this scene in the editor and runtime.">
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
          loopVideo={currentScene.backgroundVideoLoop}
          hotspots={currentScene.hotspots}
          strings={project.strings.values}
          selectedHotspotId={selectedHotspotId}
          onSurfaceClick={(x, y) =>
            mutateProject((draft) => {
              const hotspot = addHotspot(draft, currentScene.id, x, y);
              setSelectedHotspotId(hotspot?.id);
            })
          }
          onHotspotClick={(hotspotId) => setSelectedHotspotId(hotspotId)}
          onHotspotChange={updateHotspotGeometry}
        />

        {currentAsset?.kind === "video" ? (
          <label
            className="scene-video-loop-toggle"
            title="When enabled, this scene's background video restarts automatically after it reaches the end."
          >
            <input
              type="checkbox"
              checked={currentScene.backgroundVideoLoop}
              onChange={(event) =>
                mutateProject((draft) => {
                  const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                  if (scene) {
                    scene.backgroundVideoLoop = event.target.checked;
                  }
                })
              }
            />
            <span>Loop background video indefinitely</span>
          </label>
        ) : null}

        <label>
          Playhead {Math.round(playheadMs)}ms
          <input
            type="range"
            min={0}
            max={currentAsset?.durationMs ?? 30000}
            value={Math.min(playheadMs, currentAsset?.durationMs ?? 30000)}
            title="Scrub through the current scene asset to line up hotspot timing and subtitle cues."
            onChange={(event) => setPlayheadMs(Number(event.target.value))}
          />
        </label>

        <div className="split-columns">
          <section>
            <h4>Clip Segments</h4>
            {currentScene.clipSegments.map((segment) => (
              <div key={segment.id} className="list-card list-card--compact">
                <div className="panel__toolbar">
                  <input
                    value={segment.name}
                    title="Short editor label for this clip segment."
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
                  <button
                    type="button"
                    className="button-danger"
                    title="Delete this clip segment from the current scene."
                    onClick={() => deleteClipSegment(segment.id)}
                  >
                    Delete
                  </button>
                </div>
                <div className="stack-inline">
                  <input
                    type="number"
                    value={segment.startMs}
                    title="Start time in milliseconds for this clip segment."
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
                    title="End time in milliseconds for this clip segment."
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
            <label title="Comma-separated scene IDs that this scene can lead to.">
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
              tooltip="JSON effect list that runs automatically when the player enters this scene."
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
              tooltip="JSON effect list that runs automatically when the player leaves this scene."
              onCommit={(nextValue) =>
                mutateProject((draft) => {
                  const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                  if (scene) {
                    scene.onExitEffects = parseJson(nextValue, scene.onExitEffects);
                  }
                })
              }
            />
            <label title="Enable dialogue trees that can be referenced or triggered from this scene.">
              Scene Dialogues
              <div className="checkbox-list">
                {project.dialogues.items.map((dialogue) => (
                  <label
                    key={dialogue.id}
                    title={`Attach or detach the ${dialogue.name} dialogue tree from this scene.`}
                  >
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
              title="Create a subtitle track for this scene and seed it with one editable cue."
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
                <div className="panel__toolbar">
                  <h5>{track.id}</h5>
                  <button
                    type="button"
                    className="button-danger"
                    title="Delete this subtitle track from the current scene."
                    onClick={() => deleteSubtitleTrack(track.id)}
                  >
                    Delete Track
                  </button>
                </div>
                {track.cues.map((cue) => (
                  <div key={cue.id} className="cue-row">
                    <input
                      type="number"
                      value={cue.startMs}
                      title="Subtitle cue start time in milliseconds."
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
                      title="Subtitle cue end time in milliseconds."
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
                      title="Subtitle text shown to the player during this cue."
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
          These hotspot shapes are clickable interaction regions over the scene. Select one to edit its
          bounds, timing, and behavior. Drag the shape or its orange handles in the preview for quick edits,
          or use the bounds fields below for precise values.
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
                  title="Visible hotspot title shown in the editor and runtime."
                  onChange={(event) =>
                    mutateProject((draft) => {
                      const target = draft.scenes.items
                        .find((entry) => entry.id === currentScene.id)
                        ?.hotspots.find((entry) => entry.id === hotspot.id);
                      if (target) {
                        target.name = event.target.value;
                        draft.strings.values[target.labelTextId] = event.target.value;
                      }
                    })
                  }
                />
                <button
                  type="button"
                  className="button-danger"
                  title="Delete this hotspot and remove its interaction region from the scene."
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
              <label title="Optional secondary text shown inside this hotspot under the main label.">
                Comment
                <input
                  value={hotspot.commentTextId ? project.strings.values[hotspot.commentTextId] ?? "" : ""}
                  onChange={(event) =>
                    mutateProject((draft) => {
                      const target = draft.scenes.items
                        .find((entry) => entry.id === currentScene.id)
                        ?.hotspots.find((entry) => entry.id === hotspot.id);
                      if (!target) {
                        return;
                      }

                      target.commentTextId ??= `text.${target.id}.comment`;
                      draft.strings.values[target.commentTextId] = event.target.value;
                    })
                  }
                />
              </label>
              <div className="four-grid">
                {(
                  [
                    ["x", "Bounds X", "Horizontal position of the hotspot bounds as a normalized value from 0 to 1."],
                    ["y", "Bounds Y", "Vertical position of the hotspot bounds as a normalized value from 0 to 1."],
                    ["width", "Bounds Width", "Hotspot bounds width as a normalized percentage of the scene surface."],
                    ["height", "Bounds Height", "Hotspot bounds height as a normalized percentage of the scene surface."]
                  ] as const
                ).map(([field, label, tooltip]) => (
                  <label key={field} title={tooltip}>
                    {label}
                    <input
                      type="number"
                      step="0.01"
                      value={hotspot[field]}
                      title={tooltip}
                      onChange={(event) =>
                        mutateProject((draft) => {
                          const target = draft.scenes.items
                            .find((entry) => entry.id === currentScene.id)
                            ?.hotspots.find((entry) => entry.id === hotspot.id);
                          if (target) {
                            const nextGeometry = applyHotspotBounds(
                              {
                                x: target.x,
                                y: target.y,
                                width: target.width,
                                height: target.height,
                                polygon: target.polygon
                              },
                              {
                                x: field === "x" ? Number(event.target.value) : target.x,
                                y: field === "y" ? Number(event.target.value) : target.y,
                                width: field === "width" ? Number(event.target.value) : target.width,
                                height: field === "height" ? Number(event.target.value) : target.height
                              }
                            );

                            target.x = nextGeometry.x;
                            target.y = nextGeometry.y;
                            target.width = nextGeometry.width;
                            target.height = nextGeometry.height;
                            target.polygon = nextGeometry.polygon;
                          }
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="stack-inline">
                <label title="Time in milliseconds when this hotspot becomes clickable.">
                  Start (ms)
                  <input
                    type="number"
                    value={hotspot.startMs}
                    title="Time in milliseconds when this hotspot becomes clickable."
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
                <label title="Time in milliseconds when this hotspot stops being clickable.">
                  End (ms)
                  <input
                    type="number"
                    value={hotspot.endMs}
                    title="Time in milliseconds when this hotspot stops being clickable."
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
              <label title="Scene that should open when this hotspot is activated.">
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
              <label title="Comma-separated inventory item IDs required before this hotspot can be used.">
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
                tooltip="Advanced JSON condition list that must pass before this hotspot is enabled."
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
                tooltip="Advanced JSON effect list that runs after this hotspot is activated."
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
  tooltip,
  onCommit
}: {
  label: string;
  value: string;
  tooltip?: string;
  onCommit: (nextValue: string) => void;
}) {
  return (
    <label title={tooltip}>
      {label}
      <textarea defaultValue={value} onBlur={(event) => onCommit(event.target.value)} title={tooltip} />
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

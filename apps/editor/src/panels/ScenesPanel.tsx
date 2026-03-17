import { useEffect } from "react";
import { MediaSurface } from "../MediaSurface";
import { type ProjectBundle, validateProject } from "@mage2/schema";
import { SUBTITLE_IMPORT_EXTENSIONS } from "../asset-file-types";
import { useDialogs } from "../dialogs";
import {
  addHotspot,
  addHotspotAtBestAvailablePosition,
  cloneProject,
  collectSceneReferenceSummary,
  createId,
  removeSceneFromProject,
  type RemoveSceneFromProjectResult
} from "../project-helpers";
import { applyHotspotBounds, type HotspotGeometry } from "../hotspot-geometry";
import { useEditorStore } from "../store";

interface ScenesPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  setStatusMessage: (message: string) => void;
}

export function ScenesPanel({ project, mutateProject, setStatusMessage }: ScenesPanelProps) {
  const dialogs = useDialogs();
  const selectedSceneId = useEditorStore((state) => state.selectedSceneId);
  const playheadMs = useEditorStore((state) => state.playheadMs);
  const setSelectedSceneId = useEditorStore((state) => state.setSelectedSceneId);
  const selectedHotspotId = useEditorStore((state) => state.selectedHotspotId);
  const setSelectedHotspotId = useEditorStore((state) => state.setSelectedHotspotId);
  const setPlayheadMs = useEditorStore((state) => state.setPlayheadMs);
  const updateProject = useEditorStore((state) => state.updateProject);

  const currentScene = project.scenes.items.find((entry) => entry.id === selectedSceneId) ?? project.scenes.items[0];
  const currentSceneId = currentScene?.id;
  const currentAsset = project.assets.assets.find((entry) => entry.id === currentScene?.backgroundAssetId);

  useEffect(() => {
    setPlayheadMs(0);
  }, [currentScene?.backgroundAssetId, currentSceneId, setPlayheadMs]);

  function updateHotspotGeometry(hotspotId: string, geometry: HotspotGeometry) {
    mutateProject((draft) => {
      const target = draft.scenes.items
        .find((entry) => entry.id === currentSceneId)
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

  function deleteSubtitleTrack(trackId: string) {
    mutateProject((draft) => {
      const scene = draft.scenes.items.find((entry) => entry.id === currentSceneId);
      if (!scene) {
        return;
      }

      scene.subtitleTracks = scene.subtitleTracks.filter((entry) => entry.id !== trackId);
    });
  }

  function addSubtitleTrack() {
    mutateProject((draft) => {
      const scene = draft.scenes.items.find((entry) => entry.id === currentSceneId);
      if (!scene) {
        return;
      }

      scene.subtitleTracks.push({
        id: createId("subtitle"),
        cues: [createSubtitleCue(0, 3000, "A subtitle cue")]
      });
    });
  }

  function addSubtitleCue(trackId: string) {
    mutateProject((draft) => {
      const track = draft.scenes.items
        .find((entry) => entry.id === currentSceneId)
        ?.subtitleTracks.find((entry) => entry.id === trackId);
      if (!track) {
        return;
      }

      const lastCue = track.cues.at(-1);
      const startMs = lastCue?.endMs ?? 0;
      track.cues.push(createSubtitleCue(startMs, startMs + 3000, ""));
    });
  }

  function deleteSubtitleCue(trackId: string, cueId: string) {
    mutateProject((draft) => {
      const track = draft.scenes.items
        .find((entry) => entry.id === currentSceneId)
        ?.subtitleTracks.find((entry) => entry.id === trackId);
      if (!track) {
        return;
      }

      track.cues = track.cues.filter((cue) => cue.id !== cueId);
    });
  }

  async function handleImportSubtitles() {
    const filePaths = await dialogs.pickFiles({
      title: "Import Subtitles",
      description: "Select one or more SRT or VTT files to create subtitle tracks for this scene.",
      initialPath: useEditorStore.getState().projectDir,
      confirmLabel: "Import Subtitle Files",
      allowedExtensions: [...SUBTITLE_IMPORT_EXTENSIONS]
    });
    if (filePaths.length === 0 || !currentSceneId) {
      return;
    }

    try {
      const result = await window.editorApi.parseSubtitleFiles(filePaths);
      if (result.parsedFiles.length > 0) {
        mutateProject((draft) => {
          const scene = draft.scenes.items.find((entry) => entry.id === currentSceneId);
          if (!scene) {
            return;
          }

          scene.subtitleTracks.push(
            ...result.parsedFiles.map((file) => ({
              id: createId("subtitle"),
              cues: file.cues.map((cue) => createSubtitleCue(cue.startMs, cue.endMs, cue.text))
            }))
          );
        });
      }

      setStatusMessage(resolveSubtitleImportStatusMessage(result.parsedFiles.length, result.failedFiles.length));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Subtitle import failed: ${message}`);
    }
  }

  function deleteHotspot(hotspotId: string | undefined) {
    if (!currentSceneId || !hotspotId) {
      return;
    }

    mutateProject((draft) => {
      const scene = draft.scenes.items.find((entry) => entry.id === currentSceneId);
      if (!scene) {
        return;
      }

      const nextHotspots = scene.hotspots.filter((entry) => entry.id !== hotspotId);
      if (nextHotspots.length === scene.hotspots.length) {
        return;
      }

      scene.hotspots = nextHotspots;
      if (selectedHotspotId === hotspotId) {
        setSelectedHotspotId(nextHotspots[0]?.id);
      }
    });
  }

  function createHotspotAtBestAvailablePosition() {
    if (!currentSceneId) {
      return;
    }

    mutateProject((draft) => {
      const hotspot = addHotspotAtBestAvailablePosition(draft, currentSceneId);
      setSelectedHotspotId(hotspot?.id);
    });
  }

  useEffect(() => {
    if (!currentSceneId || !selectedHotspotId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.key !== "Delete") {
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      if (document.querySelector(".dialog-overlay") || shouldIgnoreDeleteHotspotShortcut(event.target)) {
        return;
      }

      event.preventDefault();
      deleteHotspot(selectedHotspotId);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentSceneId, deleteHotspot, selectedHotspotId]);

  if (!currentScene) {
    return <div className="panel"><p>Create a scene to begin.</p></div>;
  }

  async function handleDeleteScene() {
    const dialogResult = await dialogs.deleteScene({
      project,
      sceneId: currentScene.id,
      referenceSummary: collectSceneReferenceSummary(project, currentScene.id)
    });
    if (dialogResult.action === "cancel") {
      return;
    }

    const nextProject = cloneProject(project);
    const deletion = removeSceneFromProject(
      nextProject,
      currentScene.id,
      dialogResult.action === "rewire"
        ? { mode: "rewire", replacementSceneId: dialogResult.replacementSceneId }
        : { mode: "cleanup" }
    );

    if (!deletion.deleted) {
      setStatusMessage(resolveDeleteSceneBlockedMessage(currentScene.name, deletion.blockedReason));
      return;
    }

    const nextSelectedSceneId =
      dialogResult.action === "rewire" ? dialogResult.replacementSceneId : nextProject.scenes.items[0]?.id;
    const replacementSceneName =
      dialogResult.action === "rewire"
        ? nextProject.scenes.items.find((scene) => scene.id === dialogResult.replacementSceneId)?.name
        : undefined;
    const validationReport = validateProject(nextProject);

    setSelectedHotspotId(undefined);
    setSelectedSceneId(nextSelectedSceneId);
    updateProject(nextProject);
    setStatusMessage(
      resolveDeleteSceneStatusMessage(
        currentScene.name,
        deletion,
        replacementSceneName,
        validationReport.valid,
        validationReport.issues.length
      )
    );
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
              className="button-danger"
              title="Delete this scene and choose whether to clean or rewire references to it."
              onClick={() => void handleDeleteScene()}
            >
              Delete Scene
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
          playheadMs={currentAsset?.kind === "video" ? playheadMs : undefined}
          onPlayheadMsChange={currentAsset?.kind === "video" ? setPlayheadMs : undefined}
          selectedHotspotId={selectedHotspotId}
          onSurfaceClick={({ normalizedX, normalizedY, createRequested }) => {
            if (!createRequested) {
              setSelectedHotspotId(undefined);
              return;
            }

            mutateProject((draft) => {
              const hotspot = addHotspot(draft, currentScene.id, normalizedX, normalizedY);
              setSelectedHotspotId(hotspot?.id);
            });
          }}
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

        <div className="stack-inline scenes-panel__hotspot-actions">
          <button
            type="button"
            title="Create a new hotspot in the emptiest available area of this scene. Shortcut: Ctrl+click empty space in the preview."
            onClick={createHotspotAtBestAvailablePosition}
          >
            Create Hotspot
          </button>
          <button
            type="button"
            className="button-danger"
            disabled={!selectedHotspotId}
            title="Delete the currently selected hotspot from this scene. Shortcut: Delete."
            onClick={() => deleteHotspot(selectedHotspotId)}
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
            <h4>Scene Wiring</h4>
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
            <div className="stack-inline">
              <button
                type="button"
                title="Import SRT or VTT files and create subtitle tracks for this scene."
                onClick={() => void handleImportSubtitles()}
              >
                Import Subtitles
              </button>
              <button
                type="button"
                title="Create a subtitle track for this scene and seed it with one editable cue."
                onClick={addSubtitleTrack}
              >
                Add Track
              </button>
            </div>
          </div>

          {currentScene.subtitleTracks
            .map((track, trackIndex) => (
              <div key={track.id} className="list-card subtitle-track">
                <div className="panel__toolbar">
                  <div>
                    <h5>{`Track ${trackIndex + 1}`}</h5>
                    <p className="subtitle-track__meta">
                      {track.cues.length} cue{track.cues.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="stack-inline">
                    <button
                      type="button"
                      title="Append a new subtitle cue after the current last cue."
                      onClick={() => addSubtitleCue(track.id)}
                    >
                      Add Cue
                    </button>
                    <button
                      type="button"
                      className="button-danger"
                      title="Delete this subtitle track from the current scene."
                      onClick={() => deleteSubtitleTrack(track.id)}
                    >
                      Delete Track
                    </button>
                  </div>
                </div>
                {track.cues.length > 0 ? (
                  <div className="subtitle-track__cues">
                    <div className="subtitle-track__columns" aria-hidden="true">
                      <span>Start</span>
                      <span>End</span>
                      <span>Text</span>
                      <span />
                    </div>
                    {track.cues.map((cue) => (
                      <div key={cue.id} className="cue-row cue-row--subtitle">
                        <input
                          type="number"
                          value={cue.startMs}
                          title="Subtitle cue start time in milliseconds."
                          onChange={(event) =>
                            mutateProject((draft) => {
                              const target = draft.scenes.items
                                .find((entry) => entry.id === currentScene.id)
                                ?.subtitleTracks.find((entry) => entry.id === track.id)
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
                              const target = draft.scenes.items
                                .find((entry) => entry.id === currentScene.id)
                                ?.subtitleTracks.find((entry) => entry.id === track.id)
                                ?.cues.find((entry) => entry.id === cue.id);
                              if (target) {
                                target.endMs = Number(event.target.value);
                              }
                            })
                          }
                        />
                        <textarea
                          rows={2}
                          value={cue.text}
                          title="Subtitle text shown to the player during this cue."
                          onChange={(event) =>
                            mutateProject((draft) => {
                              const target = draft.scenes.items
                                .find((entry) => entry.id === currentScene.id)
                                ?.subtitleTracks.find((entry) => entry.id === track.id)
                                ?.cues.find((entry) => entry.id === cue.id);
                              if (target) {
                                target.text = event.target.value;
                              }
                            })
                          }
                        />
                        <button
                          type="button"
                          className="button-danger cue-row__delete-button"
                          aria-label="Remove cue"
                          title="Delete this subtitle cue from the track."
                          onClick={() => deleteSubtitleCue(track.id, cue.id)}
                        >
                          ❌
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No cues yet. Add one to start timing this track.</p>
                )}
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
                  title="Delete this hotspot and remove its interaction region from the scene. Shortcut: Delete when selected."
                  onClick={() => deleteHotspot(hotspot.id)}
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

function shouldIgnoreDeleteHotspotShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}

function createSubtitleCue(startMs: number, endMs: number, text: string) {
  return {
    id: createId("cue"),
    startMs,
    endMs,
    text
  };
}

function resolveSubtitleImportStatusMessage(importedTrackCount: number, failedFileCount: number): string {
  if (importedTrackCount === 0) {
    return failedFileCount > 0
      ? `No subtitle tracks were imported. ${failedFileCount} file${failedFileCount === 1 ? "" : "s"} failed.`
      : "No subtitle tracks were imported.";
  }

  const segments = [
    `Imported ${importedTrackCount} subtitle track${importedTrackCount === 1 ? "" : "s"}.`
  ];
  if (failedFileCount > 0) {
    segments.push(`${failedFileCount} file${failedFileCount === 1 ? "" : "s"} failed.`);
  }

  return segments.join(" ");
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

function resolveDeleteSceneBlockedMessage(
  sceneName: string,
  blockedReason: RemoveSceneFromProjectResult["blockedReason"]
): string {
  if (blockedReason === "replacement-scene-not-found") {
    return `Could not delete ${sceneName} because the selected replacement scene is no longer available.`;
  }

  return `Could not delete ${sceneName} because it is no longer present in the project.`;
}

function resolveDeleteSceneStatusMessage(
  sceneName: string,
  deletion: RemoveSceneFromProjectResult,
  replacementSceneName: string | undefined,
  valid: boolean,
  issueCount: number
): string {
  const segments = [`Deleted ${sceneName}.`];

  if (deletion.strategy.mode === "rewire" && replacementSceneName) {
    segments.push(`Rewired scene references to ${replacementSceneName}.`);
  } else {
    segments.push("Cleaned references to the deleted scene.");
  }

  if (deletion.removedSubtitleTrackIds.length > 0) {
    segments.push(
      `Removed ${deletion.removedSubtitleTrackIds.length} subtitle track${
        deletion.removedSubtitleTrackIds.length === 1 ? "" : "s"
      }.`
    );
  }

  if (deletion.strategy.mode === "cleanup" && deletion.referenceSummary.isStartScene) {
    segments.push("Choose a new start scene to clear the validation error.");
  }

  if (!valid) {
    segments.push(`Project now has ${issueCount} validation issue(s).`);
  }

  return segments.join(" ");
}

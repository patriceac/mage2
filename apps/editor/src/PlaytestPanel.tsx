import { useEffect, useState } from "react";
import { createPlayerController } from "@mage2/player";
import type { ProjectBundle, SaveState } from "@mage2/schema";
import { MediaSurface } from "./MediaSurface";

interface PlaytestPanelProps {
  project: ProjectBundle;
}

const STORAGE_KEY = "mage2-editor-playtest-save";

export function PlaytestPanel({ project }: PlaytestPanelProps) {
  const [controller, setController] = useState(() => createPlayerController(project));
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());
  const [playheadMs, setPlayheadMs] = useState(0);
  const [selectedAssetId, setSelectedAssetId] = useState(snapshot.scene.backgroundAssetId);

  useEffect(() => {
    const nextController = createPlayerController(project);
    setController(nextController);
    setSnapshot(nextController.getSnapshot());
    setPlayheadMs(0);
  }, [project]);

  useEffect(() => {
    setSelectedAssetId(snapshot.scene.backgroundAssetId);
  }, [snapshot.scene.backgroundAssetId]);

  const sceneAsset = project.assets.assets.find((asset) => asset.id === selectedAssetId);
  const visibleHotspots = controller.getVisibleHotspots(playheadMs);
  const subtitleLines = controller.getSubtitleLines(playheadMs);

  return (
    <div className="panel-grid panel-grid--playtest">
      <section className="panel">
        <div className="panel__toolbar">
          <label>
            Playhead
            <input
              type="range"
              min={0}
              max={sceneAsset?.durationMs ?? 30000}
              value={Math.min(playheadMs, sceneAsset?.durationMs ?? 30000)}
              onChange={(event) => setPlayheadMs(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const serialized = JSON.stringify(controller.save());
              localStorage.setItem(STORAGE_KEY, serialized);
            }}
          >
            Save Slot
          </button>
          <button
            type="button"
            onClick={() => {
              const raw = localStorage.getItem(STORAGE_KEY);
              if (!raw) {
                return;
              }

              const saveState = JSON.parse(raw) as SaveState;
              const nextController = createPlayerController(project, saveState);
              setController(nextController);
              setSnapshot(nextController.getSnapshot());
              setPlayheadMs(saveState.playheadMs ?? 0);
            }}
          >
            Load Slot
          </button>
        </div>

        <MediaSurface
          asset={sceneAsset}
          hotspots={visibleHotspots}
          onHotspotClick={(hotspotId) => {
            controller.selectHotspot(hotspotId, playheadMs);
            const nextSnapshot = controller.getSnapshot();
            setSnapshot(nextSnapshot);
            setPlayheadMs(0);
          }}
        />

        <div className="subtitle-strip">
          {subtitleLines.length > 0 ? subtitleLines.join(" ") : "Subtitles will appear here."}
        </div>

        {snapshot.activeDialogue ? (
          <div className="dialogue-box">
            <h4>{snapshot.activeDialogue.node.speaker}</h4>
            <p>{project.strings.values[snapshot.activeDialogue.node.textId] ?? snapshot.activeDialogue.node.textId}</p>

            {snapshot.activeDialogue.choices.length > 0 ? (
              <div className="choice-list">
                {snapshot.activeDialogue.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => {
                      controller.chooseDialogueChoice(choice.id);
                      setSnapshot(controller.getSnapshot());
                    }}
                  >
                    {project.strings.values[choice.textId] ?? choice.textId}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  controller.continueDialogue();
                  setSnapshot(controller.getSnapshot());
                }}
              >
                Continue
              </button>
            )}
          </div>
        ) : null}
      </section>

      <aside className="panel">
        <h3>Runtime State</h3>
        <dl className="inspector-grid">
          <dt>Location</dt>
          <dd>{snapshot.location.name}</dd>
          <dt>Scene</dt>
          <dd>{snapshot.scene.name}</dd>
          <dt>Flags</dt>
          <dd>
            <pre>{JSON.stringify(snapshot.flags, null, 2)}</pre>
          </dd>
          <dt>Inventory</dt>
          <dd>{snapshot.inventoryItems.map((item) => item.name).join(", ") || "Empty"}</dd>
          <dt>Visited Scenes</dt>
          <dd>{snapshot.saveState.visitedSceneIds.join(", ")}</dd>
        </dl>
      </aside>
    </div>
  );
}

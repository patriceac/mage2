import { useEffect, useState } from "react";
import { createPlayerController } from "@mage2/player";
import type { InventoryItem, ProjectBundle } from "@mage2/schema";
import { MediaSurface } from "./MediaSurface";

interface PlaytestPanelProps {
  project: ProjectBundle;
}

const STORAGE_KEY = "mage2-editor-playtest-save";

export function resolvePlaytestInventorySummary(
  items: Array<Pick<InventoryItem, "name" | "textId">>,
  strings: Record<string, string>
): string {
  const labels = items
    .map((item) => strings[item.textId] ?? item.name ?? item.textId)
    .filter((label) => label.length > 0);

  return labels.join(", ") || "Empty";
}

export function PlaytestPanel({ project }: PlaytestPanelProps) {
  const [controller, setController] = useState(() => createPlayerController(project));
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());
  const [playheadMs, setPlayheadMs] = useState(0);
  const [selectedAssetId, setSelectedAssetId] = useState(snapshot.scene.backgroundAssetId);
  const [showHotspots, setShowHotspots] = useState(false);

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
        <div className="panel__toolbar playtest-panel__toolbar">
          <label>
            Playhead
            <input
              type="range"
              min={0}
              max={sceneAsset?.durationMs ?? 30000}
              value={Math.min(playheadMs, sceneAsset?.durationMs ?? 30000)}
              title="Scrub through the current scene preview to inspect timing, subtitles, and hotspot visibility."
              onChange={(event) => setPlayheadMs(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            title="Store the current runtime state in the editor's local playtest save slot."
            onClick={() => {
              const nextSave = controller.save();
              nextSave.playheadMs = playheadMs;
              const serialized = JSON.stringify(nextSave);
              localStorage.setItem(STORAGE_KEY, serialized);
            }}
          >
            Save Slot
          </button>
          <button
            type="button"
            title="Restore the last runtime state saved in the local playtest slot."
            onClick={() => {
              const raw = localStorage.getItem(STORAGE_KEY);
              if (!raw) {
                return;
              }

              const nextController = createPlayerController(project, JSON.parse(raw));
              setController(nextController);
              const nextSnapshot = nextController.getSnapshot();
              setSnapshot(nextSnapshot);
              setPlayheadMs(nextSnapshot.saveState.playheadMs ?? 0);
            }}
          >
            Load Slot
          </button>
          <label
            className="playtest-hotspot-visibility-toggle"
            title="Show translucent hotspot regions in playtest for debugging. Labels remain hidden so playtest matches runtime."
          >
            <input
              type="checkbox"
              checked={showHotspots}
              onChange={(event) => setShowHotspots(event.target.checked)}
            />
            <span>Show hotspots</span>
          </label>
        </div>

        <MediaSurface
          asset={sceneAsset}
          loopVideo={snapshot.scene.backgroundVideoLoop}
          hotspots={visibleHotspots}
          hotspotAppearance={showHotspots ? "runtime" : "hidden"}
          showHotspotLabels={false}
          strings={project.strings.values}
          playheadMs={sceneAsset?.kind === "video" ? playheadMs : undefined}
          onPlayheadMsChange={sceneAsset?.kind === "video" ? setPlayheadMs : undefined}
          onHotspotClick={(hotspotId) => {
            controller.selectHotspot(hotspotId, playheadMs);
            const nextSnapshot = controller.getSnapshot();
            setSnapshot(nextSnapshot);
            setPlayheadMs(0);
          }}
        />

        <div className="subtitle-strip">
          {subtitleLines.length > 0 ? (
            subtitleLines.map((line, index) => (
              <p key={`${index}:${line}`} className="subtitle-strip__line">
                {line}
              </p>
            ))
          ) : (
            "Subtitles will appear here."
          )}
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
                    title="Choose this dialogue response and advance to its target branch."
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
                title="Advance to the next dialogue node when there are no explicit choices."
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
          <dd>{resolvePlaytestInventorySummary(snapshot.inventoryItems, project.strings.values)}</dd>
          <dt>Visited Scenes</dt>
          <dd>{snapshot.saveState.visitedSceneIds.join(", ")}</dd>
        </dl>
      </aside>
    </div>
  );
}

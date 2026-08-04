import type { DragEvent, RefObject } from "react";
import type { Asset, ProjectBundle } from "@mage2/schema";
import { DropdownSelect } from "../../DropdownSelect";
import { AssetPreview } from "../../previews";
import {
  VIDEO_BACKGROUND_BLOCKED_BY_SCENE_AUDIO_MESSAGE,
  applySceneBackgroundAsset,
  canAssignSceneBackgroundAsset
} from "./scene-domain";

type ProjectScene = ProjectBundle["scenes"]["items"][number];
type SceneOperationFeedbackTone = "success" | "warning" | "error";

interface SceneMediaSectionProps {
  activeLocale: string;
  availableBackgroundAssets: Asset[];
  availableSceneAudioAssets: Asset[];
  backgroundImportAcceptsVideo: boolean;
  currentAsset?: Asset;
  currentSceneAudioAsset?: Asset;
  isSceneAudioDropActive: boolean;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  onClearSceneAudio: () => void;
  onImportBackground: () => void | Promise<void>;
  onImportSceneAudio: () => void | Promise<void>;
  onReportOperation: (message: string, tone: SceneOperationFeedbackTone) => void;
  onSceneAudioDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onSceneAudioDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onSceneAudioDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onSceneAudioDrop: (event: DragEvent<HTMLDivElement>) => void | Promise<void>;
  playheadMs: number;
  scene: ProjectScene;
  sceneAudioRef: RefObject<HTMLAudioElement | null>;
  sceneAudioUrl?: string;
  sceneSupportsAudio: boolean;
  sceneTimelineDurationMs: number;
  setPlayheadMs: (playheadMs: number) => void;
}

export function SceneMediaSection({
  activeLocale,
  availableBackgroundAssets,
  availableSceneAudioAssets,
  backgroundImportAcceptsVideo,
  currentAsset,
  currentSceneAudioAsset,
  isSceneAudioDropActive,
  mutateProject,
  onClearSceneAudio,
  onImportBackground,
  onImportSceneAudio,
  onReportOperation,
  onSceneAudioDragEnter,
  onSceneAudioDragLeave,
  onSceneAudioDragOver,
  onSceneAudioDrop,
  playheadMs,
  scene,
  sceneAudioRef,
  sceneAudioUrl,
  sceneSupportsAudio,
  sceneTimelineDurationMs,
  setPlayheadMs
}: SceneMediaSectionProps) {
  const isVideoScene = currentAsset?.kind === "video";
  const hasPlayableSceneAudio = sceneSupportsAudio && Boolean(currentSceneAudioAsset);

  function mutateScene(mutator: (draftScene: ProjectScene, draft: ProjectBundle) => void) {
    mutateProject((draft) => {
      const draftScene = draft.scenes.items.find((entry) => entry.id === scene.id);
      if (draftScene) {
        mutator(draftScene, draft);
      }
    });
  }

  function renderPlayheadRow(placement: "video" | "audio") {
    const isVideoPlacement = placement === "video";

    return (
      <div className={`scenes-panel__playhead-row scenes-panel__playhead-row--${placement}`}>
        <label className="scenes-panel__playhead-field">
          <span className="scenes-panel__playhead-label">Playhead {Math.round(playheadMs)}ms</span>
          <input
            className="scenes-panel__playhead-range"
            type="range"
            min={0}
            max={sceneTimelineDurationMs}
            value={Math.min(playheadMs, sceneTimelineDurationMs)}
            title="Scrub through the current scene asset to line up hotspot timing."
            onChange={(event) => setPlayheadMs(Number(event.target.value))}
          />
        </label>
        {isVideoPlacement ? (
          <label
            className="scene-video-loop-toggle scenes-panel__background-loop-toggle"
            title="When enabled, this scene's background video restarts automatically after it reaches the end."
          >
            <input
              type="checkbox"
              aria-label="Loop background video indefinitely"
              checked={scene.backgroundVideoLoop}
              onChange={(event) => {
                const checked = event.target.checked;
                mutateScene((draftScene) => {
                  draftScene.backgroundVideoLoop = checked;
                });
              }}
            />
            <span className="scene-video-loop-toggle__track" aria-hidden="true">
              <span className="scene-video-loop-toggle__thumb" />
            </span>
            <span className="scene-video-loop-toggle__label">Loop video</span>
          </label>
        ) : null}
      </div>
    );
  }

  return (
    <details className="scenes-panel__details">
      <summary className="scenes-panel__details-summary">
        <span>Scene media</span>
        <span>Background, audio, and playback</span>
      </summary>
      <div className="scenes-panel__details-body">
        <label
          title={
            backgroundImportAcceptsVideo
              ? "Background media shown for this scene in the editor and runtime."
              : "Background media shown for this scene in the editor and runtime. Clear scene audio before choosing a video background."
          }
        >
          <span className="field-label--inset">Background Asset</span>
          <div className="asset-assignment-row">
            <DropdownSelect
              value={scene.backgroundAssetId ?? ""}
              onChange={(event) => {
                const backgroundAssetId = event.target.value || undefined;
                mutateScene((draftScene, draft) => {
                  const backgroundAsset = backgroundAssetId
                    ? draft.assets.assets.find((entry) => entry.id === backgroundAssetId)
                    : undefined;
                  if (!applySceneBackgroundAsset(draftScene, backgroundAssetId, backgroundAsset?.kind)) {
                    onReportOperation(VIDEO_BACKGROUND_BLOCKED_BY_SCENE_AUDIO_MESSAGE, "error");
                  }
                });
              }}
            >
              <option value="">No background assigned</option>
              {scene.backgroundAssetId &&
              !availableBackgroundAssets.some((asset) => asset.id === scene.backgroundAssetId) ? (
                <option value={scene.backgroundAssetId}>
                  {scene.backgroundAssetId === "asset_placeholder" ? "Starter placeholder" : "Invalid background selection"}
                </option>
              ) : null}
              {availableBackgroundAssets.map((asset) => (
                <option key={asset.id} value={asset.id} disabled={!canAssignSceneBackgroundAsset(scene, asset.kind)}>
                  {asset.name}
                </option>
              ))}
            </DropdownSelect>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void onImportBackground()}
              title={
                backgroundImportAcceptsVideo
                  ? "Create a new background asset from an image or video file and assign it to this scene."
                  : "Create a new image background asset and assign it to this scene. Clear scene audio before using video."
              }
            >
              {currentAsset ? "Replace Background" : "Upload Background"}
            </button>
          </div>
        </label>

        <label
          title={
            sceneSupportsAudio
              ? "Optional ambient or music track that plays for this scene when it uses an image background."
              : "Scene audio is disabled while this scene uses a video background."
          }
        >
          <span className="field-label--inset">Scene Audio</span>
          <div className="asset-assignment-row">
            <DropdownSelect
              value={scene.sceneAudioAssetId ?? ""}
              disabled={!sceneSupportsAudio}
              onChange={(event) => {
                const sceneAudioAssetId = event.target.value || undefined;
                mutateScene((draftScene) => {
                  if (!sceneSupportsAudio && sceneAudioAssetId) {
                    onReportOperation("Scene audio is only available when the scene uses an image background.", "error");
                    return;
                  }

                  draftScene.sceneAudioAssetId = sceneAudioAssetId;
                });
              }}
            >
              <option value="">No scene audio assigned</option>
              {scene.sceneAudioAssetId &&
              !availableSceneAudioAssets.some((asset) => asset.id === scene.sceneAudioAssetId) ? (
                <option value={scene.sceneAudioAssetId}>Invalid scene audio selection</option>
              ) : null}
              {availableSceneAudioAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </DropdownSelect>
            <button
              type="button"
              className="button-secondary"
              disabled={!sceneSupportsAudio}
              onClick={() => void onImportSceneAudio()}
              title={
                sceneSupportsAudio
                  ? "Create a new scene audio asset from an audio file and assign it to this scene."
                  : "Scene audio imports are disabled while this scene uses a video background."
              }
            >
              {currentSceneAudioAsset ? "Replace Scene Audio" : "Upload Scene Audio"}
            </button>
          </div>
        </label>

        {sceneSupportsAudio ? (
          <div
            className={[
              "asset-dropzone",
              isSceneAudioDropActive ? "asset-dropzone--active" : "",
              "scenes-panel__scene-audio-dropzone",
              !scene.sceneAudioAssetId ? "scenes-panel__scene-audio-dropzone--empty" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            onDragEnter={onSceneAudioDragEnter}
            onDragOver={onSceneAudioDragOver}
            onDragLeave={onSceneAudioDragLeave}
            onDrop={(event) => void onSceneAudioDrop(event)}
          >
            <strong>{currentSceneAudioAsset ? "Drop to replace scene audio" : "Drop scene audio here"}</strong>
            <span>Use an audio file to attach optional ambience or music to this image scene.</span>
            {scene.sceneAudioAssetId ? (
              <div className="scenes-panel__scene-audio-frame">
                <div className="scenes-panel__scene-audio-preview">
                  {sceneAudioUrl ? (
                    <div
                      className="asset-preview asset-preview--audio"
                      title={`Preview ${currentSceneAudioAsset?.name ?? "scene audio"}.`}
                    >
                      <audio ref={sceneAudioRef} src={sceneAudioUrl} controls preload="metadata" className="asset-preview__audio" />
                    </div>
                  ) : (
                    <AssetPreview
                      asset={currentSceneAudioAsset}
                      locale={activeLocale}
                      allowSourceFallback
                      emptyTitle="No scene audio"
                      emptyBody="Assign or drop an audio file here to attach optional scene audio."
                    />
                  )}
                </div>
                <div className="scenes-panel__scene-audio-controls">
                  <div className="list-card__actions scenes-panel__scene-audio-actions">
                    <button
                      type="button"
                      className="button-danger-quiet scenes-panel__scene-audio-clear-button"
                      onClick={onClearSceneAudio}
                      title="Remove the current scene audio assignment from this scene."
                    >
                      Clear audio
                    </button>
                  </div>
                  <div className="scenes-panel__scene-audio-settings">
                    <label
                      className="scenes-panel__scene-audio-delay"
                      title="Delay before scene audio starts, and before it restarts again when looping."
                    >
                      <span className="scenes-panel__scene-audio-delay-label">Delay (ms)</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={scene.sceneAudioDelayMs}
                        onChange={(event) => {
                          const delayMs = Math.max(0, Number(event.target.value) || 0);
                          mutateScene((draftScene) => {
                            draftScene.sceneAudioDelayMs = delayMs;
                          });
                        }}
                      />
                    </label>
                    <label
                      className="scene-video-loop-toggle scenes-panel__scene-audio-loop-toggle"
                      title="When enabled, scene audio waits for the configured delay, then restarts again after it ends."
                    >
                      <input
                        type="checkbox"
                        checked={scene.sceneAudioLoop}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          mutateScene((draftScene) => {
                            draftScene.sceneAudioLoop = checked;
                          });
                        }}
                      />
                      <span>Loop</span>
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="scenes-panel__scene-audio-disabled">
            <div className="scenes-panel__scene-audio-disabled-copy">
              <strong>Scene audio unavailable for video backgrounds</strong>
              <span>Use an image background to import or play a separate audio file.</span>
            </div>
            {currentSceneAudioAsset ? (
              <div className="scenes-panel__scene-audio-disabled-actions">
                <span>Assigned for reference: {currentSceneAudioAsset.name}</span>
                <button
                  type="button"
                  className="button-danger-quiet scenes-panel__scene-audio-clear-button"
                  onClick={onClearSceneAudio}
                  title="Remove the current scene audio assignment from this scene."
                >
                  Clear audio
                </button>
              </div>
            ) : null}
          </div>
        )}

        {isVideoScene || hasPlayableSceneAudio ? renderPlayheadRow(isVideoScene ? "video" : "audio") : null}
      </div>
    </details>
  );
}

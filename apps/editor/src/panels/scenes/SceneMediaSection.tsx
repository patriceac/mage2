import type { DragEvent, RefObject } from "react";
import { resolveAssetVariant, type Asset, type ProjectBundle } from "@mage2/schema";
import { DropdownSelect } from "../../DropdownSelect";
import { AssetPreview } from "../../previews";
import { useEditorI18n } from "../../i18n/EditorI18nProvider";
import { applySceneBackgroundAsset } from "./scene-domain";

type ProjectScene = ProjectBundle["scenes"]["items"][number];
type SceneOperationFeedbackTone = "success" | "warning" | "error";

interface SceneMediaSectionProps {
  activeLocale: string;
  availableBackgroundAssets: Asset[];
  availableSceneAudioAssets: Asset[];
  currentAsset?: Asset;
  currentAssetHasAudio?: boolean;
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
  currentAsset,
  currentAssetHasAudio,
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
  const { t } = useEditorI18n();
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
          <span className="scenes-panel__playhead-label">{t("Playhead {playheadMs}ms", { playheadMs: Math.round(playheadMs) })}</span>
          <input
            className="scenes-panel__playhead-range"
            type="range"
            min={0}
            max={sceneTimelineDurationMs}
            value={Math.min(playheadMs, sceneTimelineDurationMs)}
            title={t("Scrub through the current scene asset to line up hotspot timing.")}
            onChange={(event) => setPlayheadMs(Number(event.target.value))}
          />
        </label>
        {isVideoPlacement ? (
          <label
            className="scene-video-loop-toggle scenes-panel__background-loop-toggle"
            title={t("When enabled, this scene's background video restarts automatically after it reaches the end.")}
          >
            <input
              type="checkbox"
              aria-label={t("Loop background video indefinitely")}
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
            <span className="scene-video-loop-toggle__label">{t("Loop video")}</span>
            {scene.backgroundVideoLoop && scene.onMediaEndEffects.length > 0 ? (
              <span className="muted">{t("Turn off looping to run video-end effects.")}</span>
            ) : null}
          </label>
        ) : null}
      </div>
    );
  }

  return (
    <details className="scenes-panel__details">
      <summary className="scenes-panel__details-summary">
        <span>{t("Scene media")}</span>
        <span>{t("Background, audio, and playback")}</span>
      </summary>
      <div className="scenes-panel__details-body">
        <label title={t("Background media shown for this scene in the editor and runtime.")}>
          <span className="field-label--inset">{t("Background Asset")}</span>
          <div className="asset-assignment-row">
            <DropdownSelect
              value={scene.backgroundAssetId ?? ""}
              onChange={(event) => {
                const backgroundAssetId = event.target.value || undefined;
                mutateScene((draftScene, draft) => {
                  const backgroundAsset = backgroundAssetId
                    ? draft.assets.assets.find((entry) => entry.id === backgroundAssetId)
                    : undefined;
                  applySceneBackgroundAsset(
                    draftScene,
                    backgroundAssetId,
                    backgroundAsset?.kind,
                    backgroundAsset ? resolveAssetVariant(backgroundAsset, activeLocale)?.hasAudio : undefined
                  );
                });
              }}
            >
              <option value="">{t("No background assigned")}</option>
              {scene.backgroundAssetId &&
              !availableBackgroundAssets.some((asset) => asset.id === scene.backgroundAssetId) ? (
                <option value={scene.backgroundAssetId}>
                  {scene.backgroundAssetId === "asset_placeholder" ? t("Starter placeholder") : t("Invalid background selection")}
                </option>
              ) : null}
              {availableBackgroundAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </DropdownSelect>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void onImportBackground()}
              title={t("Create a new background asset from an image or video file and assign it to this scene.")}
            >
              {currentAsset ? t("Replace Background") : t("Upload Background")}
            </button>
          </div>
        </label>

        {isVideoScene ? (
          <label title={t("Choose whether this video uses its embedded soundtrack, a synchronized external track, or no sound.")}>
            <span className="field-label--inset">{t("Video Sound")}</span>
            <DropdownSelect
              value={scene.videoAudioMode}
              onChange={(event) => {
                const videoAudioMode = event.target.value as ProjectScene["videoAudioMode"];
                mutateScene((draftScene) => {
                  draftScene.videoAudioMode = videoAudioMode;
                  if (videoAudioMode !== "external") {
                    draftScene.sceneAudioAssetId = undefined;
                  }
                });
              }}
            >
              <option value="embedded">{t("Embedded audio")}</option>
              <option value="external">{t("External track")}</option>
              <option value="silent">{t("Silent")}</option>
            </DropdownSelect>
            {scene.videoAudioMode === "embedded" && currentAssetHasAudio === false ? (
              <span className="muted">{t("This video has no embedded audio stream. Choose External track or Silent.")}</span>
            ) : null}
            {scene.videoAudioMode === "embedded" && currentAssetHasAudio === undefined ? (
              <span className="muted">{t("Embedded audio was not inspected for this older import. Re-import the video to verify it.")}</span>
            ) : null}
            {scene.videoAudioMode === "silent" && currentAssetHasAudio ? (
              <span className="muted">{t("This video contains audio, but the scene is intentionally silent.")}</span>
            ) : null}
          </label>
        ) : null}

        <label
          title={
            sceneSupportsAudio
              ? t("Optional scene audio, or the synchronized replacement track for a video using External track.")
              : t("Choose External track to assign separate audio to this video.")
          }
        >
          <span className="field-label--inset">{t("Scene Audio")}</span>
          <div className="asset-assignment-row">
            <DropdownSelect
              value={scene.sceneAudioAssetId ?? ""}
              disabled={!sceneSupportsAudio}
              onChange={(event) => {
                const sceneAudioAssetId = event.target.value || undefined;
                mutateScene((draftScene) => {
                  if (!sceneSupportsAudio && sceneAudioAssetId) {
                    onReportOperation(t("Choose External track before assigning separate audio to a video scene."), "error");
                    return;
                  }

                  draftScene.sceneAudioAssetId = sceneAudioAssetId;
                });
              }}
            >
              <option value="">{t("No scene audio assigned")}</option>
              {scene.sceneAudioAssetId &&
              !availableSceneAudioAssets.some((asset) => asset.id === scene.sceneAudioAssetId) ? (
                <option value={scene.sceneAudioAssetId}>{t("Invalid scene audio selection")}</option>
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
                  ? t("Create a new scene audio asset from an audio file and assign it to this scene.")
                  : t("Choose External track before importing separate audio for this video.")
              }
            >
              {currentSceneAudioAsset ? t("Replace Scene Audio") : t("Upload Scene Audio")}
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
            <strong>{currentSceneAudioAsset ? t("Drop to replace scene audio") : t("Drop scene audio here")}</strong>
            <span>
              {isVideoScene
                ? t("Use an audio file as a synchronized replacement track for this video.")
                : t("Use an audio file to attach optional ambience or music to this image scene.")}
            </span>
            {scene.sceneAudioAssetId ? (
              <div className="scenes-panel__scene-audio-frame">
                <div className="scenes-panel__scene-audio-preview">
                  {sceneAudioUrl ? (
                    <div
                      className="asset-preview asset-preview--audio"
                      title={t("Preview {assetName}.", { assetName: currentSceneAudioAsset?.name ?? t("scene audio") })}
                    >
                      <audio ref={sceneAudioRef} src={sceneAudioUrl} controls preload="metadata" className="asset-preview__audio" />
                    </div>
                  ) : (
                    <AssetPreview
                      asset={currentSceneAudioAsset}
                      locale={activeLocale}
                      allowSourceFallback
                      emptyTitle={t("No scene audio")}
                      emptyBody={t("Assign or drop an audio file here to attach optional scene audio.")}
                    />
                  )}
                </div>
                <div className="scenes-panel__scene-audio-controls">
                  <div className="list-card__actions scenes-panel__scene-audio-actions">
                    <button
                      type="button"
                      className="button-danger-quiet scenes-panel__scene-audio-clear-button"
                      onClick={onClearSceneAudio}
                      title={t("Remove the current scene audio assignment from this scene.")}
                    >
                      {t("Clear audio")}
                    </button>
                  </div>
                  <div className="scenes-panel__scene-audio-settings">
                    <label
                      className="scenes-panel__scene-audio-delay"
                      title={t("Delay before scene audio starts, and before it restarts again when looping.")}
                    >
                      <span className="scenes-panel__scene-audio-delay-label">{t("Delay (ms)")}</span>
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
                    {!isVideoScene ? (
                      <label
                        className="scene-video-loop-toggle scenes-panel__scene-audio-loop-toggle"
                        title={t("When enabled, scene audio waits for the configured delay, then restarts again after it ends.")}
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
                        <span>{t("Loop")}</span>
                      </label>
                    ) : (
                      <span className="muted">{t("External audio follows the video playhead and restarts with the video.")}</span>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="scenes-panel__scene-audio-disabled">
            <div className="scenes-panel__scene-audio-disabled-copy">
              <strong>{t("Separate audio is not active")}</strong>
              <span>{t("Choose External track above to add a synchronized replacement soundtrack.")}</span>
            </div>
            {currentSceneAudioAsset ? (
              <div className="scenes-panel__scene-audio-disabled-actions">
                <span>{t("Assigned for reference: {assetName}", { assetName: currentSceneAudioAsset.name })}</span>
                <button
                  type="button"
                  className="button-danger-quiet scenes-panel__scene-audio-clear-button"
                  onClick={onClearSceneAudio}
                  title={t("Remove the current scene audio assignment from this scene.")}
                >
                  {t("Clear audio")}
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

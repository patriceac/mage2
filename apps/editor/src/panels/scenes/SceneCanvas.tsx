import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import type { Asset, Hotspot, ProjectBundle } from "@mage2/schema";
import {
  MEDIA_SURFACE_ZOOM_LEVELS,
  MediaSurface,
  resolveNextMediaSurfaceZoomScale,
  resolveZoomedMediaSurfaceViewportTransform,
  type MediaSurfaceDropEvent,
  type MediaSurfaceViewportTool,
  type MediaSurfaceViewportTransform
} from "../../MediaSurface";
import type { HotspotGeometry } from "../../hotspot-geometry";
import type { HotspotVisual } from "../../hotspot-visuals";
import { SceneToolIcon } from "./SceneEditorIcons";
import {
  loadCornerFirstHotspotHandlesPreference,
  saveCornerFirstHotspotHandlesPreference
} from "./scene-domain";

type ProjectScene = ProjectBundle["scenes"]["items"][number];

export type SceneOperationFeedbackTone = "success" | "warning" | "error";

export interface SceneOperationFeedback {
  message: string;
  tone: SceneOperationFeedbackTone;
}

interface SceneCanvasProps {
  activeLocale: string;
  asset?: Asset;
  assetHeight?: number;
  assetWidth?: number;
  backgroundImportAcceptsVideo: boolean;
  hotspotVisuals: Record<string, HotspotVisual>;
  hotspots: Hotspot[];
  isBackgroundDropActive: boolean;
  isHotspotInspectorActive: boolean;
  isInventoryPlacementDropActive: boolean;
  localeStrings: Record<string, string>;
  onBackgroundDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onBackgroundDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onBackgroundDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onBackgroundDrop: (event: DragEvent<HTMLDivElement>) => void | Promise<void>;
  onDismissOperationFeedback: () => void;
  onHotspotChange: (hotspotId: string, geometry: HotspotGeometry) => void;
  onHotspotClick: (hotspotId: string, interaction?: "click" | "drag") => void;
  onHotspotDragStart: (hotspotId: string) => void;
  onInventoryPlacementDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onInventoryPlacementDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onInventoryPlacementDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onInventoryPlacementDrop: (event: MediaSurfaceDropEvent) => void;
  onSurfaceClick: (event: { normalizedX: number; normalizedY: number; createRequested: boolean }) => void;
  operationFeedback?: SceneOperationFeedback;
  playheadMs: number;
  scene: ProjectScene;
  selectedHotspotId?: string;
  setPlayheadMs: (playheadMs: number) => void;
}

export function SceneCanvas({
  activeLocale,
  asset,
  assetHeight,
  assetWidth,
  backgroundImportAcceptsVideo,
  hotspotVisuals,
  hotspots,
  isBackgroundDropActive,
  isHotspotInspectorActive,
  isInventoryPlacementDropActive,
  localeStrings,
  onBackgroundDragEnter,
  onBackgroundDragLeave,
  onBackgroundDragOver,
  onBackgroundDrop,
  onDismissOperationFeedback,
  onHotspotChange,
  onHotspotClick,
  onHotspotDragStart,
  onInventoryPlacementDragEnter,
  onInventoryPlacementDragLeave,
  onInventoryPlacementDragOver,
  onInventoryPlacementDrop,
  onSurfaceClick,
  operationFeedback,
  playheadMs,
  scene,
  selectedHotspotId,
  setPlayheadMs
}: SceneCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasTool, setCanvasTool] = useState<MediaSurfaceViewportTool>("select");
  const [cornerFirstHotspotHandles, setCornerFirstHotspotHandles] = useState<boolean>(() =>
    loadCornerFirstHotspotHandlesPreference()
  );
  const [canvasViewportTransform, setCanvasViewportTransform] = useState<MediaSurfaceViewportTransform>({
    scale: 1,
    offsetX: 0,
    offsetY: 0
  });
  const scenePreviewFrameStyle = resolveScenePreviewFrameStyle(assetWidth, assetHeight);

  useEffect(() => {
    saveCornerFirstHotspotHandlesPreference(cornerFirstHotspotHandles);
  }, [cornerFirstHotspotHandles]);

  useEffect(() => {
    setCanvasViewportTransform({ scale: 1, offsetX: 0, offsetY: 0 });
  }, [scene.backgroundAssetId, scene.id]);

  function resolveCurrentSurfaceSize() {
    const mediaSurface = canvasRef.current?.querySelector<HTMLElement>(".media-surface");
    if (!mediaSurface) {
      return undefined;
    }

    const bounds = mediaSurface.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return undefined;
    }

    return {
      width: bounds.width,
      height: bounds.height
    };
  }

  function resetCanvasView() {
    setCanvasViewportTransform({ scale: 1, offsetX: 0, offsetY: 0 });
  }

  function cycleCanvasZoomLevel() {
    const surfaceSize = resolveCurrentSurfaceSize();
    setCanvasViewportTransform((currentTransform) => {
      const maxScale = MEDIA_SURFACE_ZOOM_LEVELS[MEDIA_SURFACE_ZOOM_LEVELS.length - 1];
      const nextScale =
        currentTransform.scale >= maxScale - 0.001
          ? MEDIA_SURFACE_ZOOM_LEVELS[0]
          : resolveNextMediaSurfaceZoomScale(currentTransform.scale, "in");

      if (!surfaceSize) {
        return nextScale <= 1
          ? { scale: 1, offsetX: 0, offsetY: 0 }
          : { ...currentTransform, scale: nextScale };
      }

      return resolveZoomedMediaSurfaceViewportTransform({
        currentTransform,
        nextScale,
        localX: surfaceSize.width / 2,
        localY: surfaceSize.height / 2,
        viewportSize: surfaceSize
      });
    });
  }

  return (
    <>
      <div className="scenes-panel__canvas-toolbar" aria-label="Scene canvas toolbar">
        <div className="scenes-panel__canvas-toolset" role="toolbar" aria-label="Canvas tools">
          <button
            type="button"
            className={resolveCanvasToolButtonClassName(canvasTool === "select")}
            aria-label="Select tool"
            aria-pressed={canvasTool === "select"}
            onClick={() => setCanvasTool("select")}
            title="Select and edit hotspots."
          >
            <SceneToolIcon kind="select" />
          </button>
          <button
            type="button"
            className={resolveCanvasToolButtonClassName(canvasTool === "pan")}
            aria-label="Pan tool"
            aria-pressed={canvasTool === "pan"}
            onClick={() => setCanvasTool("pan")}
            title="Pan the scene view."
          >
            <SceneToolIcon kind="pan" />
          </button>
          <button
            type="button"
            className={resolveCanvasToolButtonClassName(canvasTool === "zoom")}
            aria-label="Zoom tool"
            aria-pressed={canvasTool === "zoom"}
            onClick={() => setCanvasTool("zoom")}
            title="Zoom the scene view. Click the preview to zoom in; Shift-click to zoom out."
          >
            <SceneToolIcon kind="zoom" />
          </button>
          <button
            type="button"
            className="scenes-panel__canvas-tool"
            aria-label="Fit scene preview"
            onClick={resetCanvasView}
            title="Fit the scene preview."
          >
            <SceneToolIcon kind="fit" />
          </button>
        </div>
        <div className="scenes-panel__canvas-handle-controls" role="toolbar" aria-label="Hotspot handle settings">
          <button
            type="button"
            className={`${resolveCanvasToolButtonClassName(cornerFirstHotspotHandles)} scenes-panel__canvas-tool--setting`}
            aria-label="Corner-first handles"
            aria-pressed={cornerFirstHotspotHandles}
            onClick={() => setCornerFirstHotspotHandles((enabled) => !enabled)}
            title={
              cornerFirstHotspotHandles
                ? "Corner-first handles: center handles stay derived until moved."
                : "Independent center handles: corner drags keep current center dots."
            }
          >
            <SceneToolIcon kind="corner-first" />
          </button>
        </div>
        <div className="scenes-panel__canvas-view-controls" aria-label="Scene view controls">
          <button
            type="button"
            className="scenes-panel__view-select"
            onClick={cycleCanvasZoomLevel}
            title="Cycle the scene preview zoom level."
          >
            <span>{formatCanvasZoomLabel(canvasViewportTransform.scale)}</span>
          </button>
        </div>
      </div>

      {operationFeedback ? (
        <div
          className={`scenes-panel__operation-feedback scenes-panel__operation-feedback--${operationFeedback.tone}`}
          role={operationFeedback.tone === "error" ? "alert" : "status"}
          aria-live={operationFeedback.tone === "error" ? "assertive" : "polite"}
          data-scene-operation-feedback={operationFeedback.tone}
        >
          <span className="scenes-panel__operation-feedback-mark" aria-hidden="true" />
          <span>{operationFeedback.message}</span>
          <button
            type="button"
            className="scenes-panel__operation-feedback-dismiss"
            aria-label="Dismiss scene message"
            title="Dismiss this scene message."
            onClick={onDismissOperationFeedback}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}

      <div
        ref={canvasRef}
        className={[
          "scenes-panel__background-dropzone",
          isBackgroundDropActive ? "scenes-panel__background-dropzone--active" : "",
          isInventoryPlacementDropActive ? "scenes-panel__background-dropzone--inventory-active" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        onDragEnter={onBackgroundDragEnter}
        onDragOver={onBackgroundDragOver}
        onDragLeave={onBackgroundDragLeave}
        onDrop={(event) => void onBackgroundDrop(event)}
      >
        <div className="scenes-panel__background-dropzone-frame" style={scenePreviewFrameStyle}>
          <MediaSurface
            asset={asset}
            className={isHotspotInspectorActive ? "media-surface--hotspot-locked" : undefined}
            locale={activeLocale}
            loopVideo={scene.backgroundVideoLoop}
            hotspots={hotspots}
            hotspotVisuals={hotspotVisuals}
            onSurfaceDragEnter={onInventoryPlacementDragEnter}
            onSurfaceDragOver={onInventoryPlacementDragOver}
            onSurfaceDragLeave={onInventoryPlacementDragLeave}
            onSurfaceDrop={onInventoryPlacementDrop}
            strings={localeStrings}
            showSurfaceTooltips={false}
            showHotspotTooltips={false}
            playheadMs={asset?.kind === "video" ? playheadMs : undefined}
            onPlayheadMsChange={asset?.kind === "video" ? setPlayheadMs : undefined}
            selectedHotspotId={selectedHotspotId}
            viewportTool={canvasTool}
            viewportTransform={canvasViewportTransform}
            onViewportTransformChange={setCanvasViewportTransform}
            materializeHotspotMidpointsOnCornerDrag={!cornerFirstHotspotHandles}
            onSurfaceClick={onSurfaceClick}
            onHotspotClick={onHotspotClick}
            onHotspotDragStart={onHotspotDragStart}
            onHotspotChange={onHotspotChange}
          />
          {isBackgroundDropActive ? (
            <div className="scenes-panel__background-dropzone-overlay" aria-hidden="true">
              <strong>{asset ? "Drop to replace background" : "Drop to assign background"}</strong>
              <span>{backgroundImportAcceptsVideo ? "Use an image or video file." : "Use an image file."}</span>
            </div>
          ) : isInventoryPlacementDropActive ? (
            <div
              className="scenes-panel__background-dropzone-overlay scenes-panel__background-dropzone-overlay--inventory"
              aria-hidden="true"
            >
              <strong>Drop to place item</strong>
              <span>Release to create a linked inventory hotspot at this position.</span>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function resolveCanvasToolButtonClassName(active: boolean) {
  return active ? "scenes-panel__canvas-tool scenes-panel__canvas-tool--active" : "scenes-panel__canvas-tool";
}

export function formatCanvasZoomLabel(scale: number) {
  const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return `${Math.round(normalizedScale * 100)}%`;
}

function resolveScenePreviewFrameStyle(
  width: number | undefined,
  height: number | undefined
): CSSProperties | undefined {
  if (!isPositiveFiniteNumber(width) || !isPositiveFiniteNumber(height)) {
    return undefined;
  }

  return {
    aspectRatio: `${width} / ${height}`
  };
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

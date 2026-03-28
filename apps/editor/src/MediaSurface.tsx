import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  resolveHotspotBounds,
  resolveRelativeHotspotFrame,
  resolveHotspotRotationDegrees,
  resolveRelativeHotspotVisualBox,
  resolveRelativeHotspotPolygon,
  type Asset,
  type Hotspot,
  type HotspotSurfaceSize
} from "@mage2/schema";
import { applyHotspotDrag, geometryMatches, type HotspotDragHandle, type HotspotGeometry } from "./hotspot-geometry";
import { resolveHotspotLabelPlacement, type HotspotLabelPlacement } from "./hotspot-label-placement";
import { getLocalizedAssetVariant } from "./localized-project";
import {
  clampPlayheadMs,
  getVideoPlayheadMs,
  resolvePlayableDurationMs,
  shouldSyncPlayheadMs
} from "./media-playhead";
import { resolveFileUrl } from "./file-url-cache";
import type { HotspotVisual } from "./hotspot-visuals";

interface MediaSurfaceProps {
  asset?: Asset;
  locale?: string;
  hotspots?: Hotspot[];
  hotspotVisuals?: Record<string, HotspotVisual | undefined>;
  strings?: Record<string, string>;
  hotspotAppearance?: "editor" | "runtime" | "hidden";
  showHotspotLabels?: boolean;
  showHotspotTooltips?: boolean;
  showSurfaceTooltips?: boolean;
  loopVideo?: boolean;
  playheadMs?: number;
  onPlayheadMsChange?: (playheadMs: number) => void;
  onSurfaceClick?: (event: MediaSurfaceClickEvent) => void;
  onSurfaceDragEnter?: React.DragEventHandler<HTMLDivElement>;
  onSurfaceDragLeave?: React.DragEventHandler<HTMLDivElement>;
  onSurfaceDragOver?: React.DragEventHandler<HTMLDivElement>;
  onSurfaceDrop?: (event: MediaSurfaceDropEvent) => void;
  onHotspotClick?: (hotspotId: string, interaction?: "click" | "drag") => void;
  onHotspotDragStart?: (hotspotId: string) => void;
  onHotspotChange?: (hotspotId: string, geometry: HotspotGeometry) => void;
  selectedHotspotId?: string;
  className?: string;
}

export function MediaSurface({
  asset,
  locale,
  hotspots = [],
  hotspotVisuals,
  strings,
  hotspotAppearance = "editor",
  showHotspotLabels = true,
  showHotspotTooltips = true,
  showSurfaceTooltips = true,
  loopVideo = false,
  playheadMs,
  onPlayheadMsChange,
  onSurfaceClick,
  onSurfaceDragEnter,
  onSurfaceDragLeave,
  onSurfaceDragOver,
  onSurfaceDrop,
  onHotspotClick,
  onHotspotDragStart,
  onHotspotChange,
  selectedHotspotId,
  className
}: MediaSurfaceProps) {
  const [assetUrl, setAssetUrl] = useState<string>();
  const [hotspotVisualUrls, setHotspotVisualUrls] = useState<Record<string, string>>({});
  const [overlaySurfaceSize, setOverlaySurfaceSize] = useState<HotspotSurfaceSize>();
  const hotspotVisualEntries = Object.entries(hotspotVisuals ?? {}).filter(([, visual]) => Boolean(visual?.sourcePath));
  const hotspotVisualSourceSignature = hotspotVisualEntries
    .map(([hotspotId, visual]) => `${hotspotId}:${visual!.sourcePath}`)
    .sort()
    .join("|");
  const overlayRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragCleanupRef = useRef<(() => void) | undefined>(undefined);
  const suppressHotspotClickRef = useRef(false);
  const suppressHotspotClickTimeoutRef = useRef<number | undefined>(undefined);
  const suppressSurfaceClickRef = useRef(false);
  const suppressSurfaceClickTimeoutRef = useRef<number | undefined>(undefined);
  const previousLoopVideoRef = useRef(loopVideo);
  const shouldResumeLoopPlaybackRef = useRef(false);
  const previousVideoAssetKeyRef = useRef<string | undefined>(undefined);
  const isControlledVideoPlayhead = asset?.kind === "video" && playheadMs !== undefined && onPlayheadMsChange !== undefined;
  const assetVariant = asset ? getLocalizedAssetVariant(asset, locale ?? Object.keys(asset.variants)[0] ?? "") : undefined;
  const sourcePath = assetVariant?.proxyPath ?? assetVariant?.sourcePath;

  useEffect(() => {
    let cancelled = false;

    async function loadAssetUrl() {
      if (!asset) {
        setAssetUrl(undefined);
        return;
      }

      if (!sourcePath) {
        setAssetUrl(undefined);
        return;
      }

      const url = await resolveFileUrl(sourcePath);
      if (!cancelled) {
        setAssetUrl(url);
      }
    }

    void loadAssetUrl();
    return () => {
      cancelled = true;
    };
  }, [asset?.id, sourcePath]);

  useEffect(() => {
    let cancelled = false;

    async function loadHotspotVisualUrls() {
      if (hotspotVisualEntries.length === 0) {
        setHotspotVisualUrls({});
        return;
      }

      const resolvedEntries = await Promise.all(
        hotspotVisualEntries.map(async ([hotspotId, visual]) => {
          try {
            return [hotspotId, await resolveFileUrl(visual!.sourcePath)] as const;
          } catch {
            return undefined;
          }
        })
      );

      if (!cancelled) {
        setHotspotVisualUrls(
          Object.fromEntries(resolvedEntries.filter((entry): entry is readonly [string, string] => Boolean(entry)))
        );
      }
    }

    void loadHotspotVisualUrls();
    return () => {
      cancelled = true;
    };
  }, [hotspotVisualSourceSignature]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      if (suppressHotspotClickTimeoutRef.current !== undefined) {
        window.clearTimeout(suppressHotspotClickTimeoutRef.current);
      }
      if (suppressSurfaceClickTimeoutRef.current !== undefined) {
        window.clearTimeout(suppressSurfaceClickTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateOverlaySurfaceSize = () => {
      const bounds = overlay.getBoundingClientRect();
      setOverlaySurfaceSize(
        bounds.width > 0 && bounds.height > 0
          ? {
              width: bounds.width,
              height: bounds.height
            }
          : undefined
      );
    };

    updateOverlaySurfaceSize();

    const observer = new ResizeObserver(updateOverlaySurfaceSize);
    observer.observe(overlay);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (loopVideo && !previousLoopVideoRef.current) {
      shouldResumeLoopPlaybackRef.current = true;
    }

    if (!loopVideo) {
      shouldResumeLoopPlaybackRef.current = false;
    }

    previousLoopVideoRef.current = loopVideo;
  }, [loopVideo]);

  useEffect(() => {
    const nextVideoAssetKey = asset?.kind === "video" ? `${asset.id}:${assetUrl ?? ""}` : undefined;
    const hasVideoAssetChanged =
      nextVideoAssetKey !== undefined && previousVideoAssetKeyRef.current !== nextVideoAssetKey;

    previousVideoAssetKeyRef.current = nextVideoAssetKey;

    const video = videoRef.current;
    if (!video || asset?.kind !== "video") {
      return;
    }

    const shouldStartPlayback = hasVideoAssetChanged || (loopVideo && shouldResumeLoopPlaybackRef.current);
    if (!shouldStartPlayback) {
      return;
    }

    shouldResumeLoopPlaybackRef.current = false;

    if (
      hasVideoAssetChanged ||
      video.ended ||
      (Number.isFinite(video.duration) && video.currentTime >= Math.max(video.duration - 0.05, 0))
    ) {
      const durationMs = resolvePlayableDurationMs(video.duration, assetVariant?.durationMs);
      const nextPlayheadMs = isControlledVideoPlayhead ? clampPlayheadMs(playheadMs, durationMs) : 0;
      video.currentTime = nextPlayheadMs / 1000;
    }

    void video.play().catch(() => {
      // If autoplay is blocked or the file cannot play, keep the surface clean and leave playback stopped.
    });
  }, [asset?.kind, assetUrl, assetVariant?.durationMs, isControlledVideoPlayhead, loopVideo, playheadMs]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isControlledVideoPlayhead) {
      return;
    }

    const durationMs = resolvePlayableDurationMs(video.duration, assetVariant?.durationMs);
    const nextPlayheadMs = clampPlayheadMs(playheadMs, durationMs);
    const currentPlayheadMs = getVideoPlayheadMs(video.currentTime, video.duration, assetVariant?.durationMs);
    if (!shouldSyncPlayheadMs(currentPlayheadMs, nextPlayheadMs)) {
      return;
    }

    video.currentTime = nextPlayheadMs / 1000;
  }, [asset?.id, assetUrl, assetVariant?.durationMs, isControlledVideoPlayhead, playheadMs]);

  function syncPlayheadFromVideo(video: HTMLVideoElement) {
    if (!isControlledVideoPlayhead) {
      return;
    }

    const nextPlayheadMs = getVideoPlayheadMs(video.currentTime, video.duration, assetVariant?.durationMs);
    if (!shouldSyncPlayheadMs(playheadMs, nextPlayheadMs)) {
      return;
    }

    onPlayheadMsChange(nextPlayheadMs);
  }

  function syncVideoFromPlayhead(video: HTMLVideoElement) {
    if (!isControlledVideoPlayhead) {
      return;
    }

    const durationMs = resolvePlayableDurationMs(video.duration, assetVariant?.durationMs);
    const nextPlayheadMs = clampPlayheadMs(playheadMs, durationMs);
    const currentPlayheadMs = getVideoPlayheadMs(video.currentTime, video.duration, assetVariant?.durationMs);
    if (!shouldSyncPlayheadMs(currentPlayheadMs, nextPlayheadMs)) {
      return;
    }

    video.currentTime = nextPlayheadMs / 1000;
  }

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!onSurfaceClick) {
      return;
    }

    if (suppressSurfaceClickRef.current) {
      suppressSurfaceClickRef.current = false;
      event.stopPropagation();
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    focusSurface();
    onSurfaceClick({
      normalizedX: (event.clientX - bounds.left) / bounds.width,
      normalizedY: (event.clientY - bounds.top) / bounds.height,
      createRequested: event.ctrlKey || event.metaKey
    });
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    if (!onSurfaceDrop) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    onSurfaceDrop({
      normalizedX: Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1),
      normalizedY: Math.min(Math.max((event.clientY - bounds.top) / bounds.height, 0), 1),
      surfaceWidth: bounds.width,
      surfaceHeight: bounds.height,
      dataTransfer: event.dataTransfer,
      originalEvent: event
    });
  };

  const editableHotspots = Boolean(onHotspotChange);

  function focusSurface() {
    surfaceRef.current?.focus({ preventScroll: true });
  }

  const startHotspotDrag =
    (hotspot: Hotspot, handle: HotspotDragHandle) => (event: React.MouseEvent<HTMLElement>) => {
      if (!onHotspotChange || event.button !== 0) {
        return;
      }

      const overlay = overlayRef.current;
      if (!overlay) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const bounds = overlay.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      dragCleanupRef.current?.();

      const startingGeometry: HotspotGeometry = {
        inventoryItemId: hotspot.inventoryItemId,
        x: hotspot.x,
        y: hotspot.y,
        width: hotspot.width,
        height: hotspot.height,
        polygon: hotspot.polygon
      };
      const startClientX = event.clientX;
      const startClientY = event.clientY;

      let latestGeometry = startingGeometry;
      let didDrag = false;
      const body = document.body;
      const previousCursor = body.style.cursor;
      const previousUserSelect = body.style.userSelect;
      body.style.cursor = handle === "move" ? "grabbing" : resolveResizeCursor(handle);
      body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextGeometry = applyHotspotDrag(
          startingGeometry,
          handle,
          (moveEvent.clientX - startClientX) / bounds.width,
          (moveEvent.clientY - startClientY) / bounds.height,
          {
            width: bounds.width,
            height: bounds.height
          }
        );

        if (geometryMatches(nextGeometry, latestGeometry)) {
          return;
        }

        if (!didDrag) {
          onHotspotDragStart?.(hotspot.id);
        }
        latestGeometry = nextGeometry;
        didDrag = true;
        onHotspotChange(hotspot.id, nextGeometry);
      };

      const finishDrag = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", finishDrag);
        body.style.cursor = previousCursor;
        body.style.userSelect = previousUserSelect;
        dragCleanupRef.current = undefined;

        // Hotspot interactions should never fall through to the scene surface,
        // even if the cursor is outside the hotspot when the mouse button is released.
        suppressSurfaceClickRef.current = true;
        if (suppressSurfaceClickTimeoutRef.current !== undefined) {
          window.clearTimeout(suppressSurfaceClickTimeoutRef.current);
        }
        suppressSurfaceClickTimeoutRef.current = window.setTimeout(() => {
          suppressSurfaceClickRef.current = false;
          suppressSurfaceClickTimeoutRef.current = undefined;
        }, 0);

        if (didDrag) {
          focusSurface();
          suppressHotspotClickRef.current = true;
          if (suppressHotspotClickTimeoutRef.current !== undefined) {
            window.clearTimeout(suppressHotspotClickTimeoutRef.current);
          }
          suppressHotspotClickTimeoutRef.current = window.setTimeout(() => {
            suppressHotspotClickRef.current = false;
            suppressHotspotClickTimeoutRef.current = undefined;
          }, 0);

          const nextSelectedHotspotId = resolveHotspotSelectionAfterDrag(selectedHotspotId, hotspot.id);
          if (nextSelectedHotspotId) {
            onHotspotClick?.(nextSelectedHotspotId, "drag");
          }
        }
      };

      dragCleanupRef.current = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", finishDrag);
        body.style.cursor = previousCursor;
        body.style.userSelect = previousUserSelect;
        dragCleanupRef.current = undefined;
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", finishDrag);
    };

  return (
    <div
      ref={surfaceRef}
      className={className ? `media-surface ${className}` : "media-surface"}
      onClick={handleClick}
      onDragEnter={onSurfaceDragEnter}
      onDragLeave={onSurfaceDragLeave}
      onDragOver={onSurfaceDragOver}
      onDrop={handleDrop}
      tabIndex={editableHotspots ? 0 : undefined}
      title={
        showSurfaceTooltips
          ? onSurfaceClick
            ? editableHotspots
              ? "Scene preview. Click empty space to clear the hotspot selection, Ctrl+click empty space to add a hotspot, drag a hotspot to move it, or drag the orange handles to reshape it."
              : "Scene preview. Ctrl+click anywhere on the media to add a hotspot at that normalized position."
            : "Scene preview with active hotspots overlaid on the selected media."
          : undefined
      }
    >
      {asset && assetUrl ? (
        asset.kind === "video" ? (
          <video
            ref={videoRef}
            src={assetUrl}
            autoPlay
            loop={loopVideo}
            muted
            playsInline
            className="media-surface__media"
            title={showSurfaceTooltips ? "Preview the selected video asset directly inside the editor." : undefined}
            onLoadedMetadata={(event) => {
              syncVideoFromPlayhead(event.currentTarget);
              syncPlayheadFromVideo(event.currentTarget);
            }}
            onSeeked={(event) => syncPlayheadFromVideo(event.currentTarget)}
            onTimeUpdate={(event) => syncPlayheadFromVideo(event.currentTarget)}
          />
        ) : asset.kind === "image" ? (
          <img
            src={assetUrl}
            alt={asset.name}
            className="media-surface__media"
            title={showSurfaceTooltips ? "Preview the selected image asset directly inside the editor." : undefined}
          />
        ) : (
          <div
            className="media-surface__placeholder"
            title={
              showSurfaceTooltips
                ? "The selected asset is not a visual media file, so the editor cannot draw a frame preview."
                : undefined
            }
          >
            Non-visual asset selected
          </div>
        )
      ) : (
        <div
          className="media-surface__placeholder"
          title={
            showSurfaceTooltips
              ? "Upload or assign background media in the Scenes tab to preview it here."
              : undefined
          }
        >
          Upload or assign background media for this scene.
        </div>
      )}

      <div
        ref={overlayRef}
        className={editableHotspots ? "media-surface__overlay media-surface__overlay--editable" : "media-surface__overlay"}
      >
        {hotspots.map((hotspot) => (
          <HotspotButton
            key={hotspot.id}
            hotspot={hotspot}
            visual={
              hotspotVisuals?.[hotspot.id]
                ? {
                    alt: hotspotVisuals[hotspot.id]!.alt,
                    url: hotspotVisualUrls[hotspot.id]
                  }
                : undefined
            }
            strings={strings}
            surfaceSize={overlaySurfaceSize}
            appearance={hotspotAppearance}
            editable={editableHotspots}
            selected={hotspot.id === selectedHotspotId}
            showLabels={showHotspotLabels}
            showTooltips={showHotspotTooltips}
            onClick={(event) => {
              event.stopPropagation();
              if (suppressHotspotClickRef.current) {
                event.preventDefault();
                return;
              }
              focusSurface();
              onHotspotClick?.(hotspot.id, "click");
            }}
            onMoveStart={startHotspotDrag(hotspot, "move")}
            onResizeStart={(handle) => startHotspotDrag(hotspot, handle)}
            ariaLabel={`${resolveHotspotTitle(hotspot, strings)}: interactive region over the scene. Click to ${
              onSurfaceClick ? "select and edit" : "activate"
            } this hotspot.`}
          />
        ))}
      </div>
    </div>
  );
}

interface MediaSurfaceClickEvent {
  normalizedX: number;
  normalizedY: number;
  createRequested: boolean;
}

export interface MediaSurfaceDropEvent {
  normalizedX: number;
  normalizedY: number;
  surfaceHeight: number;
  surfaceWidth: number;
  dataTransfer: DataTransfer;
  originalEvent: React.DragEvent<HTMLDivElement>;
}

interface HotspotButtonProps {
  hotspot: Hotspot;
  visual?: {
    alt: string;
    url?: string;
  };
  strings?: Record<string, string>;
  surfaceSize?: HotspotSurfaceSize;
  appearance: "editor" | "runtime" | "hidden";
  editable: boolean;
  selected: boolean;
  showLabels: boolean;
  showTooltips: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  onMoveStart: React.MouseEventHandler<HTMLButtonElement>;
  onResizeStart: (handle: Exclude<HotspotDragHandle, "move">) => React.MouseEventHandler<HTMLSpanElement>;
  ariaLabel: string;
}

function HotspotButton({
  hotspot,
  visual,
  strings,
  surfaceSize,
  appearance,
  editable,
  selected,
  showLabels,
  showTooltips,
  onClick,
  onMoveStart,
  onResizeStart,
  ariaLabel
}: HotspotButtonProps) {
  const comment = hotspot.commentTextId ? normalizeHotspotText(strings?.[hotspot.commentTextId]) : "";
  const bounds = resolveHotspotBounds(hotspot);
  const relativeFrame = surfaceSize ? resolveRelativeHotspotFrame(hotspot, surfaceSize) : undefined;
  const relativePolygon = hotspot.inventoryItemId && relativeFrame ? relativeFrame.polygon : resolveRelativeHotspotPolygon(hotspot);
  const clipPath = resolveRelativeHotspotClipPath(relativePolygon);
  const rotationDegrees =
    hotspot.inventoryItemId && relativeFrame ? relativeFrame.rotationDegrees : resolveHotspotRotationDegrees(hotspot);
  const visualBox = resolveRelativeHotspotVisualBox(hotspot, surfaceSize ?? { width: 1, height: 1 });
  const polygonPointList = resolveHotspotPolygonPointList(relativePolygon);
  const cornerSegments = resolveHotspotCornerSegments(relativePolygon);
  const labelPlacement = resolveHotspotLabelPlacement(bounds);
  const handlePositions = resolveHotspotHandlePositions(relativePolygon);
  const showsShapeChrome = appearance === "editor" && (!hotspot.inventoryItemId || Math.abs(rotationDegrees) > 0.001);
  const suppressAxisAlignedChrome = Boolean(hotspot.inventoryItemId) && Math.abs(rotationDegrees) > 0.001;
  const [tooltipText, setTooltipText] = useState<string>();
  const stopHandleClick: React.MouseEventHandler<HTMLSpanElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className={resolveHotspotClassName(
        selected,
        editable,
        Boolean(visual),
        Boolean(hotspot.inventoryItemId),
        suppressAxisAlignedChrome
      )}
      style={{
        left: `${bounds.x * 100}%`,
        top: `${bounds.y * 100}%`,
        width: `${bounds.width * 100}%`,
        height: `${bounds.height * 100}%`
      }}
    >
      {appearance === "editor" ? <div className="hotspot__chrome" style={{ clipPath }} aria-hidden="true" /> : null}
      {showsShapeChrome ? (
        <svg className="hotspot__chrome-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon className="hotspot__chrome-shape-outline hotspot__chrome-shape-outline--outer" points={polygonPointList} />
          <polygon className="hotspot__chrome-shape-outline" points={polygonPointList} />
          {cornerSegments.map((segment, index) => (
            <line
              key={index}
              className="hotspot__chrome-corner"
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
            />
          ))}
        </svg>
      ) : null}
      {visual?.url ? (
        <div className="hotspot__visual-frame" style={{ clipPath }} aria-hidden="true">
          <div className="hotspot__visual-content" style={resolveHotspotVisualContentStyle(visualBox, rotationDegrees)}>
            <img src={visual.url} alt="" className="hotspot__visual" draggable={false} />
          </div>
        </div>
      ) : null}
      <button
        className={resolveHotspotBodyClassName(appearance, Boolean(visual))}
        onClick={onClick}
        onMouseDown={editable ? onMoveStart : undefined}
        style={{ clipPath }}
        aria-label={ariaLabel}
        title={showLabels && showTooltips ? tooltipText : undefined}
        type="button"
      >
        <span className="hotspot__beacon" aria-hidden="true" />
      </button>

      {showLabels && (hotspot.name || comment) ? (
        <HotspotLabelContent
          titleText={hotspot.name}
          commentText={comment}
          placement={labelPlacement}
          style={resolveHotspotLabelStyle(bounds, labelPlacement)}
          onTooltipTextChange={setTooltipText}
        />
      ) : null}

      {editable && selected ? (
        <div className="hotspot__handles" aria-hidden="true">
          {handlePositions.map(({ handle, x, y }) => (
            <span
              key={handle}
              className={`hotspot__handle hotspot__handle--${handle}`}
              onClick={stopHandleClick}
              onMouseDown={onResizeStart(handle)}
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function resolveHotspotTitle(hotspot: Hotspot, strings?: Record<string, string>): string {
  const comment = hotspot.commentTextId ? normalizeHotspotText(strings?.[hotspot.commentTextId]) : "";
  return hotspot.name || comment || hotspot.id;
}

function normalizeHotspotText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function HotspotLabelContent({
  titleText,
  commentText,
  placement,
  style,
  onTooltipTextChange
}: {
  titleText?: string;
  commentText?: string;
  placement: HotspotLabelPlacement;
  style: React.CSSProperties;
  onTooltipTextChange: (tooltipText: string | undefined) => void;
}) {
  const primaryText = titleText || commentText;
  const secondaryText = titleText ? commentText : undefined;
  const [isTitleTruncated, setIsTitleTruncated] = useState(false);
  const [isCommentTruncated, setIsCommentTruncated] = useState(false);

  useEffect(() => {
    onTooltipTextChange(buildHotspotTooltip(primaryText, secondaryText, isTitleTruncated, isCommentTruncated));
  }, [isCommentTruncated, isTitleTruncated, onTooltipTextChange, primaryText, secondaryText]);

  if (!primaryText) {
    return null;
  }

  return (
    <span
      className={[
        "hotspot__label-shell",
        `hotspot__label-shell--${placement.verticalPlacement}`,
        `hotspot__label-shell--${placement.horizontalAlignment}`
      ].join(" ")}
      style={style}
    >
      <span className="hotspot__label-card">
        <OverflowAwareHotspotTitle
          text={primaryText}
          className="hotspot__label-title"
          onTruncationChange={setIsTitleTruncated}
        />
        {secondaryText ? (
          <OverflowingHotspotComment
            text={secondaryText}
            className="hotspot__label-comment"
            onTruncationChange={setIsCommentTruncated}
          />
        ) : null}
      </span>
    </span>
  );
}

function OverflowAwareHotspotTitle({
  text,
  className,
  onTruncationChange
}: {
  text: string;
  className: string;
  onTruncationChange: (isTruncated: boolean) => void;
}) {
  const titleRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const title = titleRef.current;
    if (!title) {
      return;
    }

    let frame = 0;

    const updateTruncation = () => {
      onTruncationChange(title.scrollWidth > title.clientWidth + 1 || title.scrollHeight > title.clientHeight + 1);
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateTruncation);
    };

    scheduleUpdate();

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(title);

    void document.fonts.ready.then(() => {
      if (title.isConnected) {
        scheduleUpdate();
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [onTruncationChange, text]);

  return (
    <span ref={titleRef} className={className}>
      {text}
    </span>
  );
}

function OverflowingHotspotComment({
  text,
  className,
  onTruncationChange
}: {
  text: string;
  className: string;
  onTruncationChange: (isTruncated: boolean) => void;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [displayText, setDisplayText] = useState(text);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) {
      return;
    }

    let frame = 0;

    const updateDisplayText = () => {
      if (container.clientHeight <= 0 || container.clientWidth <= 0) {
        setDisplayText(text);
        onTruncationChange(false);
        return;
      }

      measure.textContent = text;
      if (textFits(measure)) {
        setDisplayText(text);
        onTruncationChange(false);
        return;
      }

      let low = 0;
      let high = text.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        measure.textContent = truncateHotspotComment(text, mid);
        if (textFits(measure)) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }

      const nextDisplayText = low > 0 ? truncateHotspotComment(text, low) : "...";
      setDisplayText(nextDisplayText);
      onTruncationChange(nextDisplayText !== text);
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateDisplayText);
    };

    scheduleUpdate();

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(container);

    void document.fonts.ready.then(() => {
      if (container.isConnected) {
        scheduleUpdate();
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [onTruncationChange, text]);

  return (
    <span ref={containerRef} className={`${className}-shell`}>
      <span className={className}>{displayText}</span>
      <span ref={measureRef} aria-hidden="true" className={`${className} ${className}--measure`} />
    </span>
  );
}

function textFits(element: HTMLSpanElement): boolean {
  return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1;
}

function truncateHotspotComment(text: string, length: number): string {
  if (length >= text.length) {
    return text;
  }

  const rawTruncated = text.slice(0, length).trimEnd();
  const wordBoundary = rawTruncated.replace(/\s+\S*$/, "").trimEnd();
  const truncated =
    wordBoundary.length >= Math.max(6, Math.floor(rawTruncated.length * 0.7)) ? wordBoundary : rawTruncated;

  return `${truncated || rawTruncated || text.slice(0, length).trim()}...`;
}

function buildHotspotTooltip(
  titleText: string | undefined,
  commentText: string | undefined,
  isTitleTruncated: boolean,
  isCommentTruncated: boolean
): string | undefined {
  if (!((titleText && isTitleTruncated) || (commentText && isCommentTruncated))) {
    return undefined;
  }

  return [titleText, commentText].filter(Boolean).join("\n");
}

function resolveHotspotLabelStyle(bounds: { x: number; width: number }, placement: HotspotLabelPlacement): React.CSSProperties {
  const width = Math.max(bounds.width, 0.0001);

  return {
    left: `${((placement.anchorX - bounds.x) / width) * 100}%`
  };
}

function resolveHotspotClassName(
  selected: boolean,
  editable: boolean,
  hasVisual: boolean,
  isInventoryItem: boolean,
  suppressAxisAlignedChrome: boolean
): string {
  const classNames = ["hotspot"];

  if (selected) {
    classNames.push("hotspot--selected");
  }

  if (editable) {
    classNames.push("hotspot--editable");
  }

  if (hasVisual) {
    classNames.push("hotspot--with-visual");
  }

  if (isInventoryItem) {
    classNames.push("hotspot--inventory-item");
  }

  if (suppressAxisAlignedChrome) {
    classNames.push("hotspot--polygon-chrome");
  }

  return classNames.join(" ");
}

function resolveHotspotVisualContentStyle(
  visualBox: { x: number; y: number; width: number; height: number },
  rotationDegrees: number
): React.CSSProperties | undefined {
  const style: React.CSSProperties = {
    left: `${visualBox.x * 100}%`,
    top: `${visualBox.y * 100}%`,
    width: `${visualBox.width * 100}%`,
    height: `${visualBox.height * 100}%`
  };

  if (Math.abs(rotationDegrees) > 0.001) {
    style.transform = `rotate(${rotationDegrees}deg)`;
  }

  return style;
}

export function resolveHotspotSelectionAfterDrag(
  selectedHotspotId: string | undefined,
  draggedHotspotId: string
): string | undefined {
  return selectedHotspotId ? draggedHotspotId : undefined;
}

function resolveHotspotBodyClassName(appearance: "editor" | "runtime" | "hidden", hasVisual: boolean): string {
  const classNames = ["hotspot__body"];

  if (appearance === "runtime") {
    classNames.push("hotspot__body--runtime");
  } else if (appearance === "hidden") {
    classNames.push("hotspot__body--hidden");
  }

  if (hasVisual) {
    classNames.push("hotspot__body--with-visual");
  }

  return classNames.join(" ");
}

function resolveHotspotHandlePositions(polygon: Array<{ x: number; y: number }>): Array<{
  handle: Exclude<HotspotDragHandle, "move">;
  x: number;
  y: number;
}> {
  const [nw, ne, se, sw] = polygon;

  return [
    { handle: "nw", x: nw.x, y: nw.y },
    { handle: "n", x: (nw.x + ne.x) / 2, y: (nw.y + ne.y) / 2 },
    { handle: "ne", x: ne.x, y: ne.y },
    { handle: "e", x: (ne.x + se.x) / 2, y: (ne.y + se.y) / 2 },
    { handle: "se", x: se.x, y: se.y },
    { handle: "s", x: (se.x + sw.x) / 2, y: (se.y + sw.y) / 2 },
    { handle: "sw", x: sw.x, y: sw.y },
    { handle: "w", x: (sw.x + nw.x) / 2, y: (sw.y + nw.y) / 2 }
  ];
}

function resolveRelativeHotspotClipPath(polygon: Array<{ x: number; y: number }>): string {
  return `polygon(${polygon.map((point) => `${formatHotspotPercent(point.x)} ${formatHotspotPercent(point.y)}`).join(", ")})`;
}

function formatHotspotPercent(value: number): string {
  const percent = Math.max(0, Math.min(1, value)) * 100;
  return `${Math.round(percent * 10000) / 10000}%`;
}

function resolveHotspotPolygonPointList(polygon: Array<{ x: number; y: number }>): string {
  return polygon.map((point) => `${point.x * 100},${point.y * 100}`).join(" ");
}

function resolveHotspotCornerSegments(
  polygon: Array<{ x: number; y: number }>
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  return polygon.flatMap((point, index) => {
    const previous = polygon[(index - 1 + polygon.length) % polygon.length];
    const next = polygon[(index + 1) % polygon.length];
    return [resolveHotspotCornerSegment(point, previous), resolveHotspotCornerSegment(point, next)];
  });
}

function resolveHotspotCornerSegment(
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const segmentLength = Math.min(0.12, length * 0.45);

  return {
    x1: start.x * 100,
    y1: start.y * 100,
    x2: (start.x + (dx / length) * segmentLength) * 100,
    y2: (start.y + (dy / length) * segmentLength) * 100
  };
}

function resolveResizeCursor(handle: HotspotDragHandle): string {
  switch (handle) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "nw":
    case "se":
      return "nwse-resize";
    default:
      return "grabbing";
  }
}

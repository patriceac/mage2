import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import {
  applyHotspotDrag,
  applyHotspotRotationDrag,
  geometryMatches,
  type HotspotDragHandle,
  type HotspotGeometry
} from "./hotspot-geometry";
import {
  isOpaqueHotspotVisualHit,
  loadHotspotVisualAlphaMask,
  type HotspotVisualAlphaMask
} from "./hotspot-alpha-hit-test";
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
import { useEditorI18n } from "./i18n";

interface MediaSurfaceProps {
  asset?: Asset;
  locale?: string;
  hotspots?: Hotspot[];
  hotspotVisuals?: Record<string, HotspotVisual | undefined>;
  strings?: Record<string, string>;
  hotspotAppearance?: "editor" | "runtime" | "playtest" | "hidden";
  showHotspotLabels?: boolean;
  showHotspotTooltips?: boolean;
  showSurfaceTooltips?: boolean;
  loopVideo?: boolean;
  videoMuted?: boolean;
  playheadMs?: number;
  playbackResetKey?: string | number;
  onPlayheadMsChange?: (playheadMs: number) => void;
  onPlayableDurationMsChange?: (durationMs: number) => void;
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
  children?: React.ReactNode;
  viewportTool?: MediaSurfaceViewportTool;
  viewportTransform?: MediaSurfaceViewportTransform;
  onViewportTransformChange?: (transform: MediaSurfaceViewportTransform) => void;
  materializeHotspotMidpointsOnCornerDrag?: boolean;
}

export type MediaSurfaceViewportTool = "select" | "pan" | "zoom";

export interface MediaSurfaceViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface MediaSurfaceViewportSize {
  width: number;
  height: number;
}

export const MEDIA_SURFACE_ZOOM_LEVELS = [1, 1.25, 1.5, 2, 3, 4] as const;

const MEDIA_SURFACE_WHEEL_ZOOM_SENSITIVITY = 0.0014;
const MEDIA_SURFACE_WHEEL_ZOOM_MAX_DELTA = 240;
const MEDIA_SURFACE_VIEWPORT_ANIMATION_MS = 110;

const DEFAULT_MEDIA_SURFACE_VIEWPORT_TRANSFORM: MediaSurfaceViewportTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0
};

export function stopMediaSurfaceForegroundEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation();
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
  videoMuted = true,
  playheadMs,
  playbackResetKey,
  onPlayheadMsChange,
  onPlayableDurationMsChange,
  onSurfaceClick,
  onSurfaceDragEnter,
  onSurfaceDragLeave,
  onSurfaceDragOver,
  onSurfaceDrop,
  onHotspotClick,
  onHotspotDragStart,
  onHotspotChange,
  selectedHotspotId,
  className,
  children,
  viewportTool = "select",
  viewportTransform = DEFAULT_MEDIA_SURFACE_VIEWPORT_TRANSFORM,
  onViewportTransformChange,
  materializeHotspotMidpointsOnCornerDrag = false
}: MediaSurfaceProps) {
  const { t } = useEditorI18n();
  const [assetUrl, setAssetUrl] = useState<string>();
  const [hotspotVisualUrls, setHotspotVisualUrls] = useState<Record<string, string>>({});
  const [hotspotVisualAlphaMasks, setHotspotVisualAlphaMasks] = useState<Record<string, HotspotVisualAlphaMask>>({});
  const [overlaySurfaceSize, setOverlaySurfaceSize] = useState<HotspotSurfaceSize>();
  const [activeLabelHotspotId, setActiveLabelHotspotId] = useState<string>();
  const [hotspotTooltipTexts, setHotspotTooltipTexts] = useState<Record<string, string | undefined>>({});
  const hotspotVisualEntries = Object.entries(hotspotVisuals ?? {}).filter(([, visual]) => Boolean(visual?.sourcePath));
  const hotspotVisualSourceSignature = hotspotVisualEntries
    .map(([hotspotId, visual]) => `${hotspotId}:${visual!.sourcePath}`)
    .sort()
    .join("|");
  const overlayRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragCleanupRef = useRef<(() => void) | undefined>(undefined);
  const viewportPanCleanupRef = useRef<(() => void) | undefined>(undefined);
  const suppressHotspotClickRef = useRef(false);
  const suppressHotspotClickTimeoutRef = useRef<number | undefined>(undefined);
  const suppressSurfaceClickRef = useRef(false);
  const suppressSurfaceClickTimeoutRef = useRef<number | undefined>(undefined);
  const previousLoopVideoRef = useRef(loopVideo);
  const shouldResumeLoopPlaybackRef = useRef(false);
  const previousVideoAssetKeyRef = useRef<string | undefined>(undefined);
  const previousPlaybackResetKeyRef = useRef(playbackResetKey);
  const latestControlledPlayheadMsRef = useRef(playheadMs);
  const latestOnPlayheadMsChangeRef = useRef(onPlayheadMsChange);
  const [hotspotRotationFeedback, setHotspotRotationFeedback] = useState<{
    hotspotId: string;
    rotationDegrees: number;
    snapped: boolean;
  }>();
  const isControlledVideoPlayhead = asset?.kind === "video" && playheadMs !== undefined && onPlayheadMsChange !== undefined;
  const assetVariant = asset ? getLocalizedAssetVariant(asset, locale ?? Object.keys(asset.variants)[0] ?? "") : undefined;
  const sourcePath = assetVariant?.proxyPath ?? assetVariant?.sourcePath;
  const normalizedViewportTransform = normalizeMediaSurfaceViewportTransform(viewportTransform);
  const [renderedViewportTransform, setRenderedViewportTransform] = useState(normalizedViewportTransform);
  const renderedViewportTransformRef = useRef(normalizedViewportTransform);
  const viewportAnimationFrameRef = useRef<number | undefined>(undefined);
  const isRenderedViewportTransformed =
    renderedViewportTransform.scale !== 1 ||
    renderedViewportTransform.offsetX !== 0 ||
    renderedViewportTransform.offsetY !== 0;
  const surfaceAspectRatioStyle = resolveMediaSurfaceAspectRatioStyle(assetVariant?.width, assetVariant?.height);
  const [isViewportPanning, setIsViewportPanning] = useState(false);
  const handleHotspotLabelActiveChange = useCallback((hotspotId: string, active: boolean) => {
    setActiveLabelHotspotId((currentHotspotId) => {
      if (active) {
        return hotspotId;
      }

      return currentHotspotId === hotspotId ? undefined : currentHotspotId;
    });
  }, []);
  const handleHotspotTooltipTextChange = useCallback((hotspotId: string, tooltipText: string | undefined) => {
    setHotspotTooltipTexts((currentTooltipTexts) => {
      if (currentTooltipTexts[hotspotId] === tooltipText) {
        return currentTooltipTexts;
      }

      return {
        ...currentTooltipTexts,
        [hotspotId]: tooltipText
      };
    });
  }, []);

  useEffect(() => {
    latestControlledPlayheadMsRef.current = playheadMs;
    latestOnPlayheadMsChangeRef.current = onPlayheadMsChange;
  }, [onPlayheadMsChange, playheadMs]);

  useEffect(() => {
    renderedViewportTransformRef.current = renderedViewportTransform;
  }, [renderedViewportTransform]);

  useEffect(() => {
    if (viewportAnimationFrameRef.current !== undefined) {
      window.cancelAnimationFrame(viewportAnimationFrameRef.current);
      viewportAnimationFrameRef.current = undefined;
    }

    const targetTransform = normalizedViewportTransform;
    const startTransform = renderedViewportTransformRef.current;
    if (
      isViewportPanning ||
      areMediaSurfaceViewportTransformsClose(startTransform, targetTransform) ||
      !shouldAnimateMediaSurfaceViewportTransform(startTransform, targetTransform)
    ) {
      renderedViewportTransformRef.current = targetTransform;
      setRenderedViewportTransform(targetTransform);
      return;
    }

    const startedAt = window.performance.now();
    const animateViewportTransform = (timestamp: number) => {
      const progress = clampNumber((timestamp - startedAt) / MEDIA_SURFACE_VIEWPORT_ANIMATION_MS, 0, 1);
      const easedProgress = easeOutCubic(progress);
      const nextTransform = interpolateMediaSurfaceViewportTransform(startTransform, targetTransform, easedProgress);

      renderedViewportTransformRef.current = nextTransform;
      setRenderedViewportTransform(nextTransform);

      if (progress < 1) {
        viewportAnimationFrameRef.current = window.requestAnimationFrame(animateViewportTransform);
      } else {
        viewportAnimationFrameRef.current = undefined;
      }
    };

    viewportAnimationFrameRef.current = window.requestAnimationFrame(animateViewportTransform);
    return () => {
      if (viewportAnimationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(viewportAnimationFrameRef.current);
        viewportAnimationFrameRef.current = undefined;
      }
    };
  }, [
    isViewportPanning,
    normalizedViewportTransform.scale,
    normalizedViewportTransform.offsetX,
    normalizedViewportTransform.offsetY
  ]);

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
    let cancelled = false;

    async function loadHotspotVisualAlphaMasks() {
      const hotspotVisualUrlEntries = Object.entries(hotspotVisualUrls);
      if (hotspotVisualUrlEntries.length === 0) {
        setHotspotVisualAlphaMasks({});
        return;
      }

      const resolvedEntries = await Promise.all(
        hotspotVisualUrlEntries.map(async ([hotspotId, hotspotVisualUrl]) => {
          try {
            const alphaMask = await loadHotspotVisualAlphaMask(hotspotVisualUrl);
            return alphaMask ? ([hotspotId, alphaMask] as const) : undefined;
          } catch {
            return undefined;
          }
        })
      );

      if (!cancelled) {
        setHotspotVisualAlphaMasks(
          Object.fromEntries(
            resolvedEntries.filter(
              (entry): entry is readonly [string, HotspotVisualAlphaMask] => Boolean(entry)
            )
          )
        );
      }
    }

    void loadHotspotVisualAlphaMasks();
    return () => {
      cancelled = true;
    };
  }, [hotspotVisualUrls]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      viewportPanCleanupRef.current?.();
      if (suppressHotspotClickTimeoutRef.current !== undefined) {
        window.clearTimeout(suppressHotspotClickTimeoutRef.current);
      }
      if (suppressSurfaceClickTimeoutRef.current !== undefined) {
        window.clearTimeout(suppressSurfaceClickTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (viewportTool !== "pan") {
      viewportPanCleanupRef.current?.();
    }
  }, [viewportTool]);

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
    const hasPlaybackResetRequest = playbackResetKey !== previousPlaybackResetKeyRef.current;

    previousVideoAssetKeyRef.current = nextVideoAssetKey;
    previousPlaybackResetKeyRef.current = playbackResetKey;

    const video = videoRef.current;
    if (!video || asset?.kind !== "video") {
      return;
    }

    const shouldStartPlayback = shouldStartMediaSurfaceVideoPlayback(
      hasVideoAssetChanged,
      hasPlaybackResetRequest,
      loopVideo,
      shouldResumeLoopPlaybackRef.current
    );
    if (!shouldStartPlayback) {
      return;
    }

    shouldResumeLoopPlaybackRef.current = false;

    if (
      hasVideoAssetChanged ||
      hasPlaybackResetRequest ||
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
  }, [asset?.kind, assetUrl, assetVariant?.durationMs, isControlledVideoPlayhead, loopVideo, playheadMs, playbackResetKey]);

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isControlledVideoPlayhead) {
      return;
    }

    let animationFrameId: number | undefined;
    let videoFrameRequestId: number | undefined;

    const cancelScheduledSync = () => {
      if (animationFrameId !== undefined) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = undefined;
      }

      if (videoFrameRequestId !== undefined && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(videoFrameRequestId);
        videoFrameRequestId = undefined;
      }
    };

    const syncFromVideoClock = () => {
      const nextPlayheadMs = getVideoPlayheadMs(video.currentTime, video.duration, assetVariant?.durationMs);
      if (!shouldSyncPlayheadMs(latestControlledPlayheadMsRef.current ?? 0, nextPlayheadMs)) {
        return;
      }

      latestOnPlayheadMsChangeRef.current?.(nextPlayheadMs);
    };

    const step = () => {
      syncFromVideoClock();
      if (video.paused || video.ended) {
        return;
      }

      if (typeof video.requestVideoFrameCallback === "function") {
        videoFrameRequestId = video.requestVideoFrameCallback(() => {
          videoFrameRequestId = undefined;
          step();
        });
        return;
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = undefined;
        step();
      });
    };

    const startSync = () => {
      cancelScheduledSync();
      step();
    };

    const stopSync = () => {
      cancelScheduledSync();
      syncFromVideoClock();
    };

    if (!video.paused && !video.ended) {
      startSync();
    } else {
      syncFromVideoClock();
    }

    video.addEventListener("play", startSync);
    video.addEventListener("pause", stopSync);
    video.addEventListener("ended", stopSync);
    video.addEventListener("seeked", syncFromVideoClock);

    return () => {
      cancelScheduledSync();
      video.removeEventListener("play", startSync);
      video.removeEventListener("pause", stopSync);
      video.removeEventListener("ended", stopSync);
      video.removeEventListener("seeked", syncFromVideoClock);
    };
  }, [asset?.id, assetUrl, assetVariant?.durationMs, isControlledVideoPlayhead]);

  function syncPlayheadFromVideo(video: HTMLVideoElement) {
    if (!isControlledVideoPlayhead) {
      return;
    }

    const nextPlayheadMs = getVideoPlayheadMs(video.currentTime, video.duration, assetVariant?.durationMs);
    if (!shouldSyncPlayheadMs(latestControlledPlayheadMsRef.current ?? 0, nextPlayheadMs)) {
      return;
    }

    latestOnPlayheadMsChangeRef.current?.(nextPlayheadMs);
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
    if (suppressSurfaceClickRef.current) {
      suppressSurfaceClickRef.current = false;
      event.stopPropagation();
      return;
    }

    if (viewportTool === "zoom") {
      event.preventDefault();
      focusSurface();
      zoomViewportAtPointer(event);
      return;
    }

    if (viewportTool !== "select") {
      event.preventDefault();
      focusSurface();
      return;
    }

    if (!onSurfaceClick) {
      return;
    }

    const bounds = getViewportInteractionBounds(event.currentTarget);
    focusSurface();
    onSurfaceClick({
      normalizedX: clampNormalizedCoordinate((event.clientX - bounds.left) / bounds.width),
      normalizedY: clampNormalizedCoordinate((event.clientY - bounds.top) / bounds.height),
      createRequested: event.ctrlKey || event.metaKey
    });
  };

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    if (!onSurfaceDrop) {
      return;
    }

    const bounds = getViewportInteractionBounds(event.currentTarget);
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

  const editableHotspots = viewportTool === "select" && Boolean(onHotspotChange);

  function focusSurface() {
    surfaceRef.current?.focus({ preventScroll: true });
  }

  function getViewportInteractionBounds(fallbackElement: HTMLElement) {
    return viewportRef.current?.getBoundingClientRect() ?? fallbackElement.getBoundingClientRect();
  }

  function getViewportSize(): MediaSurfaceViewportSize | undefined {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    return bounds && bounds.width > 0 && bounds.height > 0
      ? {
          width: bounds.width,
          height: bounds.height
        }
      : undefined;
  }

  function zoomViewportAtPointer(event: React.MouseEvent<HTMLElement>) {
    const direction = event.shiftKey || event.altKey ? "out" : "in";
    zoomViewportAtPoint(event.clientX, event.clientY, direction);
  }

  function zoomViewportAtPoint(clientX: number, clientY: number, direction: "in" | "out") {
    const nextScale = resolveNextMediaSurfaceZoomScale(normalizedViewportTransform.scale, direction);
    zoomViewportToScaleAtPoint(clientX, clientY, nextScale);
  }

  function zoomViewportToScaleAtPoint(clientX: number, clientY: number, nextScale: number) {
    if (!onViewportTransformChange) {
      return;
    }

    const viewportSize = getViewportSize();
    if (!viewportSize) {
      return;
    }

    const surfaceBounds = surfaceRef.current?.getBoundingClientRect();
    if (!surfaceBounds) {
      return;
    }

    onViewportTransformChange(
      resolveZoomedMediaSurfaceViewportTransform({
        currentTransform: normalizedViewportTransform,
        nextScale,
        localX: clientX - surfaceBounds.left,
        localY: clientY - surfaceBounds.top,
        viewportSize
      })
    );
  }

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    const nextScale = resolveMediaSurfaceWheelZoomScale({
      currentScale: normalizedViewportTransform.scale,
      deltaY: event.deltaY
    });
    if (nextScale === undefined) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    focusSurface();
    zoomViewportToScaleAtPoint(event.clientX, event.clientY, nextScale);
  };

  const startViewportPan: React.MouseEventHandler<HTMLDivElement> = (event) => {
    const applyViewportTransform = onViewportTransformChange;
    if (
      !shouldStartMediaSurfaceViewportPan({
        viewportTool,
        button: event.button
      }) ||
      !applyViewportTransform
    ) {
      return;
    }
    const applyNextViewportTransform: (transform: MediaSurfaceViewportTransform) => void = applyViewportTransform;
    const shouldSuppressClickWithoutMovement = viewportTool === "pan";

    const viewportSize = getViewportSize();
    if (!viewportSize) {
      return;
    }

    event.preventDefault();
    focusSurface();

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startTransform = clampMediaSurfaceViewportTransform(normalizedViewportTransform, viewportSize);
    const body = document.body;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    let didPan = false;

    body.style.cursor = "grabbing";
    body.style.userSelect = "none";
    setIsViewportPanning(true);
    viewportPanCleanupRef.current?.();

    const finishPan = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", finishPan);
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
      setIsViewportPanning(false);
      viewportPanCleanupRef.current = undefined;

      if (shouldSuppressClickWithoutMovement || didPan) {
        suppressSurfaceClickRef.current = true;
        suppressHotspotClickRef.current = true;
        if (suppressSurfaceClickTimeoutRef.current !== undefined) {
          window.clearTimeout(suppressSurfaceClickTimeoutRef.current);
        }
        if (suppressHotspotClickTimeoutRef.current !== undefined) {
          window.clearTimeout(suppressHotspotClickTimeoutRef.current);
        }
        suppressSurfaceClickTimeoutRef.current = window.setTimeout(() => {
          suppressSurfaceClickRef.current = false;
          suppressSurfaceClickTimeoutRef.current = undefined;
        }, 0);
        suppressHotspotClickTimeoutRef.current = window.setTimeout(() => {
          suppressHotspotClickRef.current = false;
          suppressHotspotClickTimeoutRef.current = undefined;
        }, 0);
      }
    };

    const cleanupPan = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", finishPan);
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
      setIsViewportPanning(false);
      viewportPanCleanupRef.current = undefined;
    };

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextTransform = clampMediaSurfaceViewportTransform(
        {
          scale: startTransform.scale,
          offsetX: startTransform.offsetX + moveEvent.clientX - startClientX,
          offsetY: startTransform.offsetY + moveEvent.clientY - startClientY
        },
        viewportSize
      );

      if (
        nextTransform.offsetX === startTransform.offsetX &&
        nextTransform.offsetY === startTransform.offsetY &&
        didPan
      ) {
        return;
      }

      didPan = true;
      applyNextViewportTransform(nextTransform);
    }

    viewportPanCleanupRef.current = cleanupPan;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", finishPan);
  };

  const startHotspotDrag =
    (hotspot: Hotspot, handle: HotspotDragHandle) => (event: React.MouseEvent<HTMLElement>) => {
      if (!onHotspotChange || event.button !== 0 || event.ctrlKey) {
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
      body.style.cursor =
        handle === "move" ? "move" : handle === "rotate" || !hotspot.inventoryItemId ? "grabbing" : resolveResizeCursor(handle);
      body.style.userSelect = "none";

      const surfaceSize = {
        width: bounds.width,
        height: bounds.height
      };
      const startPointerXPx = startClientX - bounds.left;
      const startPointerYPx = startClientY - bounds.top;

      if (handle === "rotate") {
        const initialRotation = applyHotspotRotationDrag(startingGeometry, {
          startPointerXPx,
          startPointerYPx,
          pointerXPx: startPointerXPx,
          pointerYPx: startPointerYPx,
          shiftKey: event.shiftKey,
          surfaceSize
        });
        setHotspotRotationFeedback({
          hotspotId: hotspot.id,
          rotationDegrees: initialRotation.rotationDegrees,
          snapped: initialRotation.snapped
        });
      }

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (handle === "rotate") {
          const nextRotation = applyHotspotRotationDrag(startingGeometry, {
            startPointerXPx,
            startPointerYPx,
            pointerXPx: moveEvent.clientX - bounds.left,
            pointerYPx: moveEvent.clientY - bounds.top,
            shiftKey: moveEvent.shiftKey,
            surfaceSize
          });
          setHotspotRotationFeedback({
            hotspotId: hotspot.id,
            rotationDegrees: nextRotation.rotationDegrees,
            snapped: nextRotation.snapped
          });

          if (geometryMatches(nextRotation.geometry, latestGeometry)) {
            return;
          }

          if (!didDrag) {
            onHotspotDragStart?.(hotspot.id);
          }
          latestGeometry = nextRotation.geometry;
          didDrag = true;
          onHotspotChange(hotspot.id, nextRotation.geometry);
          return;
        }

        const nextGeometry = applyHotspotDrag(
          startingGeometry,
          handle,
          (moveEvent.clientX - startClientX) / bounds.width,
          (moveEvent.clientY - startClientY) / bounds.height,
          surfaceSize,
          { materializeCornerMidpoints: materializeHotspotMidpointsOnCornerDrag }
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
        setHotspotRotationFeedback((currentFeedback) =>
          currentFeedback?.hotspotId === hotspot.id ? undefined : currentFeedback
        );

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
        setHotspotRotationFeedback((currentFeedback) =>
          currentFeedback?.hotspotId === hotspot.id ? undefined : currentFeedback
        );
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", finishDrag);
    };

  return (
    <div
      ref={surfaceRef}
      className={[
        "media-surface",
        className,
        viewportTool === "pan" ? "media-surface--viewport-pan" : undefined,
        viewportTool === "zoom" ? "media-surface--viewport-zoom" : undefined,
        isViewportPanning ? "media-surface--viewport-panning" : undefined
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={handleClick}
      onMouseDown={startViewportPan}
      onWheel={handleWheel}
      onDragEnter={onSurfaceDragEnter}
      onDragLeave={onSurfaceDragLeave}
      onDragOver={onSurfaceDragOver}
      onDrop={handleDrop}
      tabIndex={editableHotspots ? 0 : undefined}
      style={surfaceAspectRatioStyle}
      title={
        showSurfaceTooltips
          ? viewportTool === "pan"
            ? t("Scene preview. Drag to pan the zoomed view, or use the mouse wheel to zoom.")
            : viewportTool === "zoom"
              ? t("Scene preview. Click to zoom in, Shift-click to zoom out, or use the mouse wheel to zoom.")
              : onSurfaceClick
            ? editableHotspots
              ? t("Scene preview. Click empty space to clear the hotspot selection, Ctrl+click empty space to add a hotspot, drag empty space to pan, use the mouse wheel to zoom, drag a hotspot to move it, or drag the orange handles to reshape it.")
              : t("Scene preview. Ctrl+click anywhere on the media to add a hotspot at that normalized position. Drag empty space to pan and use the mouse wheel to zoom.")
            : undefined
          : undefined
      }
    >
      <div
        ref={viewportRef}
        className="media-surface__viewport"
        style={
          isRenderedViewportTransformed
            ? {
                transform: `translate3d(${renderedViewportTransform.offsetX}px, ${renderedViewportTransform.offsetY}px, 0) scale(${renderedViewportTransform.scale})`
              }
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
              muted={videoMuted}
              playsInline
              className="media-surface__media"
              title={showSurfaceTooltips ? t("Preview the selected video asset directly inside the editor.") : undefined}
              dir="ltr"
              onLoadedMetadata={(event) => {
                const playableDurationMs = resolvePlayableDurationMs(event.currentTarget.duration, assetVariant?.durationMs);
                if (playableDurationMs !== undefined) {
                  onPlayableDurationMsChange?.(playableDurationMs);
                }

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
              title={showSurfaceTooltips ? t("Preview the selected image asset directly inside the editor.") : undefined}
            />
          ) : (
            <div
              className="media-surface__placeholder"
              title={
                showSurfaceTooltips
                  ? t("The selected asset is not a visual media file, so the editor cannot draw a frame preview.")
                  : undefined
              }
            >
              {t("Non-visual asset selected")}
            </div>
          )
        ) : (
          <div
            className="media-surface__placeholder"
            title={
              showSurfaceTooltips
                ? t("Upload or assign background media in the Scenes tab to preview it here.")
                : undefined
            }
          >
            {t("Upload or assign background media for this scene.")}
          </div>
        )}

        <div
          ref={overlayRef}
          className={editableHotspots ? "media-surface__overlay media-surface__overlay--editable" : "media-surface__overlay"}
          dir="ltr"
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
              surfaceSize={overlaySurfaceSize}
              appearance={hotspotAppearance}
              alphaMask={hotspotVisualAlphaMasks[hotspot.id]}
              editable={editableHotspots}
              selected={hotspot.id === selectedHotspotId}
              showTooltips={showHotspotTooltips}
              tooltipText={hotspotTooltipTexts[hotspot.id]}
              onLabelActiveChange={handleHotspotLabelActiveChange}
              onClick={(event) => {
                event.stopPropagation();
                if (suppressHotspotClickRef.current) {
                  event.preventDefault();
                  return;
                }
                if (viewportTool === "zoom") {
                  event.preventDefault();
                  focusSurface();
                  zoomViewportAtPointer(event);
                  return;
                }
                if (viewportTool !== "select") {
                  event.preventDefault();
                  focusSurface();
                  return;
                }
                focusSurface();
                onHotspotClick?.(hotspot.id, "click");
              }}
              onMoveStart={startHotspotDrag(hotspot, "move")}
              onRotateStart={startHotspotDrag(hotspot, "rotate")}
              onResizeStart={(handle) => startHotspotDrag(hotspot, handle)}
              rotationFeedback={
                hotspotRotationFeedback?.hotspotId === hotspot.id ? hotspotRotationFeedback : undefined
              }
              ariaLabel={
                onSurfaceClick
                  ? t("{name}: interactive region over the scene. Click to select and edit this hotspot.", {
                      name: resolveHotspotTitle(hotspot, strings)
                    })
                  : t("{name}: interactive region over the scene. Click to activate this hotspot.", {
                      name: resolveHotspotTitle(hotspot, strings)
                    })
              }
            />
          ))}
        </div>
        {children ? (
          <div
            className="media-surface__scene-overlay"
            onClick={stopMediaSurfaceForegroundEvent}
            onMouseDown={stopMediaSurfaceForegroundEvent}
            onMouseUp={stopMediaSurfaceForegroundEvent}
            onPointerDown={stopMediaSurfaceForegroundEvent}
            onPointerUp={stopMediaSurfaceForegroundEvent}
          >
            {children}
          </div>
        ) : null}
      </div>
      {showHotspotLabels ? (
        <HotspotLabelLayer
          hotspots={hotspots}
          strings={strings}
          surfaceSize={overlaySurfaceSize}
          selectedHotspotId={selectedHotspotId}
          activeHotspotId={activeLabelHotspotId}
          viewportTransform={renderedViewportTransform}
          onTooltipTextChange={handleHotspotTooltipTextChange}
        />
      ) : null}
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

function normalizeMediaSurfaceViewportTransform(
  transform: MediaSurfaceViewportTransform | undefined
): MediaSurfaceViewportTransform {
  const scale = normalizeMediaSurfaceViewportScale(transform?.scale);
  if (scale <= 1) {
    return DEFAULT_MEDIA_SURFACE_VIEWPORT_TRANSFORM;
  }

  return {
    scale,
    offsetX: Number.isFinite(transform?.offsetX) ? transform!.offsetX : 0,
    offsetY: Number.isFinite(transform?.offsetY) ? transform!.offsetY : 0
  };
}

function normalizeMediaSurfaceViewportScale(scale: number | undefined) {
  if (!Number.isFinite(scale)) {
    return 1;
  }

  const minScale = MEDIA_SURFACE_ZOOM_LEVELS[0];
  const maxScale = MEDIA_SURFACE_ZOOM_LEVELS[MEDIA_SURFACE_ZOOM_LEVELS.length - 1];
  return Math.min(Math.max(scale ?? 1, minScale), maxScale);
}

export function clampMediaSurfaceViewportTransform(
  transform: MediaSurfaceViewportTransform,
  viewportSize?: MediaSurfaceViewportSize
): MediaSurfaceViewportTransform {
  const normalizedTransform = normalizeMediaSurfaceViewportTransform(transform);
  if (normalizedTransform.scale <= 1) {
    return DEFAULT_MEDIA_SURFACE_VIEWPORT_TRANSFORM;
  }

  if (!viewportSize || viewportSize.width <= 0 || viewportSize.height <= 0) {
    return normalizedTransform;
  }

  return {
    scale: normalizedTransform.scale,
    offsetX: clampNumber(normalizedTransform.offsetX, viewportSize.width * (1 - normalizedTransform.scale), 0),
    offsetY: clampNumber(normalizedTransform.offsetY, viewportSize.height * (1 - normalizedTransform.scale), 0)
  };
}

export function resolveNextMediaSurfaceZoomScale(currentScale: number, direction: "in" | "out") {
  const scale = normalizeMediaSurfaceViewportScale(currentScale);

  if (direction === "out") {
    return [...MEDIA_SURFACE_ZOOM_LEVELS].reverse().find((level) => level < scale - 0.001) ?? MEDIA_SURFACE_ZOOM_LEVELS[0];
  }

  return MEDIA_SURFACE_ZOOM_LEVELS.find((level) => level > scale + 0.001) ??
    MEDIA_SURFACE_ZOOM_LEVELS[MEDIA_SURFACE_ZOOM_LEVELS.length - 1];
}

export function resolveMediaSurfaceWheelZoomScale({
  currentScale,
  deltaY
}: {
  currentScale: number;
  deltaY: number;
}): number | undefined {
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return undefined;
  }

  const scale = normalizeMediaSurfaceViewportScale(currentScale);
  const delta = clampNumber(deltaY, -MEDIA_SURFACE_WHEEL_ZOOM_MAX_DELTA, MEDIA_SURFACE_WHEEL_ZOOM_MAX_DELTA);
  return normalizeMediaSurfaceViewportScale(scale * Math.exp(-delta * MEDIA_SURFACE_WHEEL_ZOOM_SENSITIVITY));
}

export function shouldStartMediaSurfaceViewportPan({
  viewportTool,
  button
}: {
  viewportTool: MediaSurfaceViewportTool;
  button: number;
}) {
  return button === 0 && (viewportTool === "pan" || viewportTool === "select");
}

export function resolveZoomedMediaSurfaceViewportTransform({
  currentTransform,
  nextScale,
  localX,
  localY,
  viewportSize
}: {
  currentTransform: MediaSurfaceViewportTransform;
  nextScale: number;
  localX: number;
  localY: number;
  viewportSize?: MediaSurfaceViewportSize;
}): MediaSurfaceViewportTransform {
  const current = clampMediaSurfaceViewportTransform(currentTransform, viewportSize);
  const scale = normalizeMediaSurfaceViewportScale(nextScale);
  if (scale <= 1) {
    return DEFAULT_MEDIA_SURFACE_VIEWPORT_TRANSFORM;
  }

  const unscaledX = (localX - current.offsetX) / current.scale;
  const unscaledY = (localY - current.offsetY) / current.scale;
  return clampMediaSurfaceViewportTransform(
    {
      scale,
      offsetX: localX - unscaledX * scale,
      offsetY: localY - unscaledY * scale
    },
    viewportSize
  );
}

function clampNormalizedCoordinate(value: number) {
  return clampNumber(Number.isFinite(value) ? value : 0, 0, 1);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function shouldAnimateMediaSurfaceViewportTransform(
  startTransform: MediaSurfaceViewportTransform,
  targetTransform: MediaSurfaceViewportTransform
) {
  return (
    Math.abs(startTransform.scale - targetTransform.scale) > 0.001 ||
    Math.abs(startTransform.offsetX - targetTransform.offsetX) > 0.5 ||
    Math.abs(startTransform.offsetY - targetTransform.offsetY) > 0.5
  );
}

function areMediaSurfaceViewportTransformsClose(
  startTransform: MediaSurfaceViewportTransform,
  targetTransform: MediaSurfaceViewportTransform
) {
  return (
    Math.abs(startTransform.scale - targetTransform.scale) <= 0.0001 &&
    Math.abs(startTransform.offsetX - targetTransform.offsetX) <= 0.01 &&
    Math.abs(startTransform.offsetY - targetTransform.offsetY) <= 0.01
  );
}

function interpolateMediaSurfaceViewportTransform(
  startTransform: MediaSurfaceViewportTransform,
  targetTransform: MediaSurfaceViewportTransform,
  progress: number
): MediaSurfaceViewportTransform {
  return {
    scale: interpolateNumber(startTransform.scale, targetTransform.scale, progress),
    offsetX: interpolateNumber(startTransform.offsetX, targetTransform.offsetX, progress),
    offsetY: interpolateNumber(startTransform.offsetY, targetTransform.offsetY, progress)
  };
}

function interpolateNumber(startValue: number, targetValue: number, progress: number) {
  return startValue + (targetValue - startValue) * progress;
}

function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3;
}

interface HotspotButtonProps {
  hotspot: Hotspot;
  visual?: {
    alt: string;
    url?: string;
  };
  surfaceSize?: HotspotSurfaceSize;
  appearance: "editor" | "runtime" | "playtest" | "hidden";
  alphaMask?: HotspotVisualAlphaMask;
  editable: boolean;
  selected: boolean;
  showTooltips: boolean;
  tooltipText?: string;
  onLabelActiveChange: (hotspotId: string, active: boolean) => void;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  onMoveStart: React.MouseEventHandler<HTMLButtonElement>;
  onRotateStart?: React.MouseEventHandler<HTMLSpanElement>;
  onResizeStart: (handle: Exclude<HotspotDragHandle, "move" | "rotate">) => React.MouseEventHandler<HTMLSpanElement>;
  rotationFeedback?: {
    rotationDegrees: number;
    snapped: boolean;
  };
  ariaLabel: string;
}

function isOpaqueHotspotPointerEvent(
  event: Pick<React.MouseEvent<HTMLButtonElement>, "clientX" | "clientY" | "currentTarget">,
  alphaMask: HotspotVisualAlphaMask | undefined,
  visualUrl: string | undefined,
  visualBox: { x: number; y: number; width: number; height: number },
  rotationDegrees: number
): boolean {
  if (!visualUrl || !alphaMask) {
    return false;
  }

  const bounds = event.currentTarget.getBoundingClientRect();
  return isOpaqueHotspotVisualHit(alphaMask, {
    pointX: event.clientX - bounds.left,
    pointY: event.clientY - bounds.top,
    hotspotWidth: bounds.width,
    hotspotHeight: bounds.height,
    visualBox,
    rotationDegrees,
    imageWidth: alphaMask.width,
    imageHeight: alphaMask.height
  });
}

function HotspotButton({
  hotspot,
  visual,
  surfaceSize,
  appearance,
  alphaMask,
  editable,
  selected,
  showTooltips,
  tooltipText,
  onLabelActiveChange,
  onClick,
  onMoveStart,
  onRotateStart,
  onResizeStart,
  rotationFeedback,
  ariaLabel
}: HotspotButtonProps) {
  const { t } = useEditorI18n();
  const bounds = resolveHotspotBounds(hotspot);
  const relativeFrame = surfaceSize ? resolveRelativeHotspotFrame(hotspot, surfaceSize) : undefined;
  const relativePolygon = hotspot.inventoryItemId && relativeFrame ? relativeFrame.polygon : resolveRelativeHotspotPolygon(hotspot);
  const clipPath = resolveRelativeHotspotClipPath(relativePolygon);
  const rotationDegrees =
    hotspot.inventoryItemId && relativeFrame ? relativeFrame.rotationDegrees : resolveHotspotRotationDegrees(hotspot);
  const visualBox = resolveRelativeHotspotVisualBox(hotspot, surfaceSize ?? { width: 1, height: 1 });
  const polygonPointList = resolveHotspotPolygonPointList(relativePolygon);
  const cornerSegments = resolveHotspotCornerSegments(relativePolygon);
  const handlePositions = resolveHotspotHandlePositions(relativePolygon);
  const rotationHandle = resolveHotspotRotationHandleGeometry(
    relativePolygon,
    surfaceSize
      ? {
          width: Math.max(bounds.width * surfaceSize.width, 1),
          height: Math.max(bounds.height * surfaceSize.height, 1)
        }
      : undefined
  );
  const showsShapeChrome = appearance === "editor" && (!hotspot.inventoryItemId || Math.abs(rotationDegrees) > 0.001);
  const suppressAxisAlignedChrome = Math.abs(rotationDegrees) > 0.001;
  const [isPointerOverOpaquePixel, setIsPointerOverOpaquePixel] = useState(false);
  const usesAlphaAwarePointerFeedback = appearance !== "editor" && Boolean(visual?.url);
  const stopHandleClick: React.MouseEventHandler<HTMLSpanElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const handleBodyClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (appearance !== "editor" && visual?.url && alphaMask) {
      const isPointerHit = isOpaqueHotspotPointerEvent(event, alphaMask, visual.url, visualBox, rotationDegrees);
      setIsPointerOverOpaquePixel(isPointerHit);
      if (!isPointerHit) {
        return;
      }
    }

    onClick(event);
  };
  const handleBodyMouseMoveOrEnter: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (!usesAlphaAwarePointerFeedback) {
      return;
    }

    if (!alphaMask) {
      setIsPointerOverOpaquePixel(false);
      return;
    }

    setIsPointerOverOpaquePixel(isOpaqueHotspotPointerEvent(event, alphaMask, visual?.url, visualBox, rotationDegrees));
  };
  const handleBodyMouseEnter: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    onLabelActiveChange(hotspot.id, true);
    handleBodyMouseMoveOrEnter(event);
  };
  const handleBodyMouseLeave: React.MouseEventHandler<HTMLButtonElement> = () => {
    onLabelActiveChange(hotspot.id, false);
    setIsPointerOverOpaquePixel(false);
  };
  const bodyClassName = [
    resolveHotspotBodyClassName(appearance, Boolean(visual)),
    usesAlphaAwarePointerFeedback && !isPointerOverOpaquePixel ? "hotspot__body--pointer-inactive" : undefined
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={resolveHotspotClassName(
        selected,
        editable,
        Boolean(visual),
        Boolean(hotspot.inventoryItemId),
        suppressAxisAlignedChrome,
        Boolean(rotationFeedback)
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
        className={bodyClassName}
        onClick={handleBodyClick}
        onMouseEnter={handleBodyMouseEnter}
        onMouseMove={handleBodyMouseMoveOrEnter}
        onMouseLeave={handleBodyMouseLeave}
        onFocus={() => onLabelActiveChange(hotspot.id, true)}
        onBlur={() => onLabelActiveChange(hotspot.id, false)}
        onMouseDown={editable ? onMoveStart : undefined}
        style={{
          clipPath,
          ...(usesAlphaAwarePointerFeedback ? { cursor: isPointerOverOpaquePixel ? "pointer" : "default" } : undefined)
        }}
        aria-label={ariaLabel}
        title={showTooltips ? tooltipText : undefined}
        type="button"
      >
        <span className="hotspot__beacon" aria-hidden="true" />
      </button>

      {editable && selected ? (
        <div className="hotspot__handles" aria-hidden="true" dir="ltr">
          {rotationHandle && onRotateStart ? (
            <>
              <svg className="hotspot__rotation-ui" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line
                  className="hotspot__rotation-stem"
                  x1={rotationHandle.stemStartX * 100}
                  y1={rotationHandle.stemStartY * 100}
                  x2={rotationHandle.handleX * 100}
                  y2={rotationHandle.handleY * 100}
                />
              </svg>
              <span
                className="hotspot__handle hotspot__handle--rotate"
                onClick={stopHandleClick}
                onMouseDown={onRotateStart}
                style={{
                  left: `${rotationHandle.handleX * 100}%`,
                  top: `${rotationHandle.handleY * 100}%`
                }}
              />
              {rotationFeedback ? (
                <span
                  className="hotspot__rotation-readout"
                  style={{
                    left: `${rotationHandle.labelX * 100}%`,
                    top: `${rotationHandle.labelY * 100}%`
                  }}
                >
                  <span className="hotspot__rotation-readout-angle">
                    {formatHotspotRotationReadout(rotationFeedback.rotationDegrees)}
                  </span>
                  {rotationFeedback.snapped ? (
                    <span className="hotspot__rotation-readout-snap">{t("15° snap")}</span>
                  ) : null}
                </span>
              ) : null}
            </>
          ) : null}
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

function HotspotLabelLayer({
  hotspots,
  strings,
  surfaceSize,
  selectedHotspotId,
  activeHotspotId,
  viewportTransform,
  onTooltipTextChange
}: {
  hotspots: Hotspot[];
  strings?: Record<string, string>;
  surfaceSize?: HotspotSurfaceSize;
  selectedHotspotId?: string;
  activeHotspotId?: string;
  viewportTransform: MediaSurfaceViewportTransform;
  onTooltipTextChange: (hotspotId: string, tooltipText: string | undefined) => void;
}) {
  return (
    <div className="media-surface__label-layer">
      {hotspots.map((hotspot) => {
        const comment = hotspot.commentTextId ? normalizeHotspotText(strings?.[hotspot.commentTextId]) : "";

        if (!hotspot.name && !comment) {
          return null;
        }

        const bounds = resolveHotspotBounds(hotspot);
        const screenBounds = resolveScreenSpaceHotspotLabelBounds(bounds, viewportTransform, surfaceSize);
        const visibleScreenBounds = resolveVisibleScreenSpaceHotspotLabelAnchorBounds(screenBounds);

        if (!visibleScreenBounds) {
          return null;
        }

        const relativeFrame = surfaceSize ? resolveRelativeHotspotFrame(hotspot, surfaceSize) : undefined;
        const relativePolygon =
          hotspot.inventoryItemId && relativeFrame ? relativeFrame.polygon : resolveRelativeHotspotPolygon(hotspot);
        const labelPlacement = resolveHotspotLabelPlacement(visibleScreenBounds);
        const rotationHandle = resolveHotspotRotationHandleGeometry(
          relativePolygon,
          surfaceSize
            ? {
                width: Math.max(bounds.width * surfaceSize.width, 1),
                height: Math.max(bounds.height * surfaceSize.height, 1)
              }
            : undefined
        );
        const isActive = hotspot.id === selectedHotspotId || hotspot.id === activeHotspotId;

        return (
          <div
            key={hotspot.id}
            className="media-surface__label-anchor"
            style={resolveHotspotLabelAnchorStyle(visibleScreenBounds, surfaceSize)}
          >
            <HotspotLabelContent
              titleText={hotspot.name}
              commentText={comment}
              placement={labelPlacement}
              active={isActive}
              style={resolveHotspotLabelStyle(
                visibleScreenBounds,
                labelPlacement,
                hotspot.id === selectedHotspotId && Boolean(rotationHandle) && labelPlacement.verticalPlacement === "above"
              )}
              onTooltipTextChange={(tooltipText) => onTooltipTextChange(hotspot.id, tooltipText)}
            />
          </div>
        );
      })}
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
  active,
  style,
  onTooltipTextChange
}: {
  titleText?: string;
  commentText?: string;
  placement: HotspotLabelPlacement;
  active: boolean;
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
        active ? "hotspot__label-shell--active" : undefined,
        `hotspot__label-shell--${placement.verticalPlacement}`,
        `hotspot__label-shell--${placement.horizontalAlignment}`
      ]
        .filter(Boolean)
        .join(" ")}
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

function resolveMediaSurfaceAspectRatioStyle(
  width: number | undefined,
  height: number | undefined
): React.CSSProperties | undefined {
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

function resolveHotspotLabelStyle(
  bounds: { x: number; width: number },
  placement: HotspotLabelPlacement,
  reserveTopControlClearance = false,
  topControlClearancePx = 28
): React.CSSProperties {
  const width = Math.max(bounds.width, 0.0001);

  return {
    left: `${((placement.anchorX - bounds.x) / width) * 100}%`,
    ...(reserveTopControlClearance
      ? ({ "--hotspot-top-control-clearance": `${topControlClearancePx}px` } as React.CSSProperties)
      : undefined)
  };
}

export function resolveScreenSpaceHotspotLabelBounds(
  bounds: { x: number; y: number; width: number; height: number },
  viewportTransform: MediaSurfaceViewportTransform,
  surfaceSize?: HotspotSurfaceSize
) {
  const transform = normalizeMediaSurfaceViewportTransform(viewportTransform);

  return {
    x: roundViewportCoordinate(bounds.x * transform.scale + (surfaceSize?.width ? transform.offsetX / surfaceSize.width : 0)),
    y: roundViewportCoordinate(bounds.y * transform.scale + (surfaceSize?.height ? transform.offsetY / surfaceSize.height : 0)),
    width: roundViewportCoordinate(bounds.width * transform.scale),
    height: roundViewportCoordinate(bounds.height * transform.scale)
  };
}

export function resolveVisibleScreenSpaceHotspotLabelAnchorBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const left = clampNormalizedViewportCoordinate(bounds.x);
  const top = clampNormalizedViewportCoordinate(bounds.y);
  const right = clampNormalizedViewportCoordinate(bounds.x + bounds.width);
  const bottom = clampNormalizedViewportCoordinate(bounds.y + bounds.height);

  if (right <= left || bottom <= top) {
    return undefined;
  }

  const isClippedAtTop = bounds.y < 0;
  const isClippedAtBottom = bounds.y + bounds.height > 1;
  const anchorY = isClippedAtTop ? 0 : isClippedAtBottom ? 1 : top;
  const anchorHeight = isClippedAtTop || isClippedAtBottom ? 0 : bottom - top;

  return {
    x: roundViewportCoordinate(left),
    y: roundViewportCoordinate(anchorY),
    width: roundViewportCoordinate(right - left),
    height: roundViewportCoordinate(anchorHeight)
  };
}

export function resolveHotspotLabelAnchorStyle(
  bounds: { x: number; y: number; width: number; height: number },
  surfaceSize?: HotspotSurfaceSize
): React.CSSProperties {
  if (surfaceSize?.width && surfaceSize.height) {
    return {
      left: formatPixelValue(bounds.x * surfaceSize.width),
      top: formatPixelValue(bounds.y * surfaceSize.height),
      width: formatPixelValue(bounds.width * surfaceSize.width),
      height: formatPixelValue(bounds.height * surfaceSize.height)
    };
  }

  return {
    left: formatHotspotPercent(bounds.x),
    top: formatHotspotPercent(bounds.y),
    width: formatHotspotPercent(bounds.width),
    height: formatHotspotPercent(bounds.height)
  };
}

function formatPixelValue(value: number) {
  return `${Math.round(value * 100) / 100}px`;
}

function roundViewportCoordinate(value: number) {
  return Math.round(value * 10000) / 10000;
}

function clampNormalizedViewportCoordinate(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function resolveHotspotClassName(
  selected: boolean,
  editable: boolean,
  hasVisual: boolean,
  isInventoryItem: boolean,
  suppressAxisAlignedChrome: boolean,
  isRotating: boolean
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

  if (isRotating) {
    classNames.push("hotspot--rotating");
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

export function shouldStartMediaSurfaceVideoPlayback(
  hasVideoAssetChanged: boolean,
  hasPlaybackResetRequest: boolean,
  loopVideo: boolean,
  shouldResumeLoopPlayback: boolean
): boolean {
  return hasVideoAssetChanged || hasPlaybackResetRequest || (loopVideo && shouldResumeLoopPlayback);
}

function resolveHotspotBodyClassName(
  appearance: "editor" | "runtime" | "playtest" | "hidden",
  hasVisual: boolean
): string {
  const classNames = ["hotspot__body"];

  if (appearance === "runtime") {
    classNames.push("hotspot__body--runtime");
  } else if (appearance === "playtest") {
    classNames.push("hotspot__body--playtest");
  } else if (appearance === "hidden") {
    classNames.push("hotspot__body--hidden");
  }

  if (hasVisual) {
    classNames.push("hotspot__body--with-visual");
  }

  return classNames.join(" ");
}

export function resolveHotspotHandlePositions(polygon: Array<{ x: number; y: number }>): Array<{
  handle: Exclude<HotspotDragHandle, "move" | "rotate">;
  x: number;
  y: number;
}> {
  if (polygon.length === 8) {
    const [nw, n, ne, e, se, s, sw, w] = polygon;

    return [
      { handle: "nw", x: nw.x, y: nw.y },
      { handle: "n", x: n.x, y: n.y },
      { handle: "ne", x: ne.x, y: ne.y },
      { handle: "e", x: e.x, y: e.y },
      { handle: "se", x: se.x, y: se.y },
      { handle: "s", x: s.x, y: s.y },
      { handle: "sw", x: sw.x, y: sw.y },
      { handle: "w", x: w.x, y: w.y }
    ];
  }

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

export function resolveHotspotRotationHandleGeometry(
  polygon: Array<{ x: number; y: number }>,
  frameSize?: {
    width: number;
    height: number;
  }
): {
  handleX: number;
  handleY: number;
  stemStartX: number;
  stemStartY: number;
  labelX: number;
  labelY: number;
} | undefined {
  const topEdge = resolveHotspotTopControlGeometryPoints(polygon);
  if (!topEdge) {
    return undefined;
  }
  const { startPoint, midpoint, endPoint } = topEdge;
  const effectiveFrameSize =
    frameSize && frameSize.width > 0 && frameSize.height > 0
      ? frameSize
      : {
          width: 1,
          height: 1
        };
  const usesPixelOffsets = effectiveFrameSize.width > 1 || effectiveFrameSize.height > 1;

  const topVector = {
    x: (endPoint.x - startPoint.x) * effectiveFrameSize.width,
    y: (endPoint.y - startPoint.y) * effectiveFrameSize.height
  };
  const topLength = Math.hypot(topVector.x, topVector.y) || 1;
  const outwardNormal = {
    x: topVector.y / topLength,
    y: -topVector.x / topLength
  };
  const outwardNormalLocal = {
    x: outwardNormal.x / effectiveFrameSize.width,
    y: outwardNormal.y / effectiveFrameSize.height
  };
  const handleOffset = usesPixelOffsets ? 18 : 0.18;
  const labelOffset = usesPixelOffsets ? 14 : 0.12;
  const handleX = midpoint.x + outwardNormalLocal.x * handleOffset;
  const handleY = midpoint.y + outwardNormalLocal.y * handleOffset;

  return {
    handleX: roundRotationControlCoordinate(handleX),
    handleY: roundRotationControlCoordinate(handleY),
    stemStartX: roundRotationControlCoordinate(midpoint.x),
    stemStartY: roundRotationControlCoordinate(midpoint.y),
    labelX: roundRotationControlCoordinate(handleX + outwardNormal.x * labelOffset),
    labelY: roundRotationControlCoordinate(handleY + outwardNormal.y * labelOffset)
  };
}

function resolveHotspotTopControlGeometryPoints(
  polygon: Array<{ x: number; y: number }>
):
  | {
      startPoint: { x: number; y: number };
      midpoint: { x: number; y: number };
      endPoint: { x: number; y: number };
    }
  | undefined {
  if (polygon.length === 8) {
    const [startPoint, midpoint, endPoint] = polygon;
    return startPoint && midpoint && endPoint ? { startPoint, midpoint, endPoint } : undefined;
  }

  const [startPoint, endPoint] = polygon;
  if (!startPoint || !endPoint) {
    return undefined;
  }

  return {
    startPoint,
    midpoint: {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2
    },
    endPoint
  };
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

function formatHotspotRotationReadout(rotationDegrees: number): string {
  const rounded = Math.round(rotationDegrees * 10) / 10;
  return `${Object.is(rounded, -0) ? 0 : rounded}°`;
}

function roundRotationControlCoordinate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

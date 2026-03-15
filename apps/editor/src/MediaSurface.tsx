import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  resolveHotspotBounds,
  resolveHotspotClipPath,
  resolveRelativeHotspotContentBox,
  resolveRelativeHotspotPolygon,
  type Asset,
  type Hotspot
} from "@mage2/schema";
import { applyHotspotDrag, geometryMatches, type HotspotDragHandle, type HotspotGeometry } from "./hotspot-geometry";

interface MediaSurfaceProps {
  asset?: Asset;
  hotspots?: Hotspot[];
  strings?: Record<string, string>;
  loopVideo?: boolean;
  onSurfaceClick?: (normalizedX: number, normalizedY: number) => void;
  onHotspotClick?: (hotspotId: string) => void;
  onHotspotChange?: (hotspotId: string, geometry: HotspotGeometry) => void;
  selectedHotspotId?: string;
  className?: string;
}

export function MediaSurface({
  asset,
  hotspots = [],
  strings,
  loopVideo = false,
  onSurfaceClick,
  onHotspotClick,
  onHotspotChange,
  selectedHotspotId,
  className
}: MediaSurfaceProps) {
  const [assetUrl, setAssetUrl] = useState<string>();
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragCleanupRef = useRef<(() => void) | undefined>(undefined);
  const suppressSurfaceClickRef = useRef(false);
  const suppressSurfaceClickTimeoutRef = useRef<number | undefined>(undefined);
  const previousLoopVideoRef = useRef(loopVideo);
  const shouldResumeLoopPlaybackRef = useRef(false);
  const previousVideoAssetKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function loadAssetUrl() {
      if (!asset) {
        setAssetUrl(undefined);
        return;
      }

      const sourcePath = asset.proxyPath ?? asset.sourcePath;
      const url = await window.editorApi.pathToFileUrl(sourcePath);
      if (!cancelled) {
        setAssetUrl(url);
      }
    }

    void loadAssetUrl();
    return () => {
      cancelled = true;
    };
  }, [asset]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      if (suppressSurfaceClickTimeoutRef.current !== undefined) {
        window.clearTimeout(suppressSurfaceClickTimeoutRef.current);
      }
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
      video.currentTime = 0;
    }

    void video.play().catch(() => {
      // If playback is blocked or the file cannot play, leave the controls available for manual retry.
    });
  }, [asset?.kind, assetUrl, loopVideo]);

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
    onSurfaceClick((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
  };

  const editableHotspots = Boolean(onHotspotChange);

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
      onHotspotClick?.(hotspot.id);

      const bounds = overlay.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      dragCleanupRef.current?.();

      const startingGeometry: HotspotGeometry = {
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
          (moveEvent.clientY - startClientY) / bounds.height
        );

        if (geometryMatches(nextGeometry, latestGeometry)) {
          return;
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

        if (didDrag) {
          suppressSurfaceClickRef.current = true;
          if (suppressSurfaceClickTimeoutRef.current !== undefined) {
            window.clearTimeout(suppressSurfaceClickTimeoutRef.current);
          }
          suppressSurfaceClickTimeoutRef.current = window.setTimeout(() => {
            suppressSurfaceClickRef.current = false;
            suppressSurfaceClickTimeoutRef.current = undefined;
          }, 0);
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
      className={className ? `media-surface ${className}` : "media-surface"}
      onClick={handleClick}
      title={
        onSurfaceClick
          ? editableHotspots
            ? "Scene preview. Click empty space to add a hotspot, drag a hotspot to move it, or drag the orange handles to reshape it."
            : "Scene preview. Click anywhere on the media to add a hotspot at that normalized position."
          : "Scene preview with active hotspots overlaid on the selected media."
      }
    >
      {asset && assetUrl ? (
        asset.kind === "video" ? (
          <video
            ref={videoRef}
            src={assetUrl}
            autoPlay
            controls
            loop={loopVideo}
            muted
            className="media-surface__media"
            title="Preview the selected video asset directly inside the editor."
          />
        ) : asset.kind === "image" ? (
          <img
            src={assetUrl}
            alt={asset.name}
            className="media-surface__media"
            title="Preview the selected image asset directly inside the editor."
          />
        ) : (
          <div
            className="media-surface__placeholder"
            title="The selected asset is audio or another non-visual file, so the editor cannot draw a frame preview."
          >
            Non-visual asset selected
          </div>
        )
      ) : (
        <div
          className="media-surface__placeholder"
          title="Import media in the Assets tab and assign one as the scene background to preview it here."
        >
          Import media and assign it to this scene.
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
            strings={strings}
            editable={editableHotspots}
            selected={hotspot.id === selectedHotspotId}
            onClick={(event) => {
              event.stopPropagation();
              onHotspotClick?.(hotspot.id);
            }}
            onMoveStart={startHotspotDrag(hotspot, "move")}
            onResizeStart={(handle) => startHotspotDrag(hotspot, handle)}
            title={`${resolveHotspotTitle(hotspot, strings)}: interactive region over the scene. Click to ${
              onSurfaceClick ? "select and edit" : "activate"
            } this hotspot.`}
          />
        ))}
      </div>
    </div>
  );
}

interface HotspotButtonProps {
  hotspot: Hotspot;
  strings?: Record<string, string>;
  editable: boolean;
  selected: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  onMoveStart: React.MouseEventHandler<HTMLButtonElement>;
  onResizeStart: (handle: Exclude<HotspotDragHandle, "move">) => React.MouseEventHandler<HTMLSpanElement>;
  title: string;
}

function HotspotButton({
  hotspot,
  strings,
  editable,
  selected,
  onClick,
  onMoveStart,
  onResizeStart,
  title
}: HotspotButtonProps) {
  const comment = hotspot.commentTextId ? normalizeHotspotText(strings?.[hotspot.commentTextId]) : "";
  const bounds = resolveHotspotBounds(hotspot);
  const clipPath = resolveHotspotClipPath(hotspot);
  const contentBox = resolveRelativeHotspotContentBox(hotspot);
  const handlePositions = resolveHotspotHandlePositions(hotspot);
  const stopHandleClick: React.MouseEventHandler<HTMLSpanElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className={resolveHotspotClassName(selected, editable)}
      style={{
        left: `${bounds.x * 100}%`,
        top: `${bounds.y * 100}%`,
        width: `${bounds.width * 100}%`,
        height: `${bounds.height * 100}%`
      }}
    >
      <button
        className="hotspot__body"
        onClick={onClick}
        onMouseDown={editable ? onMoveStart : undefined}
        style={{ clipPath }}
        title={title}
        type="button"
      >
        {hotspot.name || comment ? (
          <span
            className="hotspot__content"
            style={{
              left: `${contentBox.x * 100}%`,
              top: `${contentBox.y * 100}%`,
              width: `${contentBox.width * 100}%`,
              height: `${contentBox.height * 100}%`
            }}
          >
            {hotspot.name ? <span className="hotspot__title">{hotspot.name}</span> : null}
            {comment ? <OverflowingHotspotComment text={comment} className="hotspot__comment" /> : null}
          </span>
        ) : null}
      </button>

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
  void strings;
  return hotspot.name;
}

function normalizeHotspotText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function OverflowingHotspotComment({ text, className }: { text: string; className: string }) {
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
        return;
      }

      measure.textContent = text;
      if (textFits(measure)) {
        setDisplayText(text);
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

      setDisplayText(low > 0 ? truncateHotspotComment(text, low) : "...");
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
  }, [text]);

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

function resolveHotspotClassName(selected: boolean, editable: boolean): string {
  const classNames = ["hotspot"];

  if (selected) {
    classNames.push("hotspot--selected");
  }

  if (editable) {
    classNames.push("hotspot--editable");
  }

  return classNames.join(" ");
}

function resolveHotspotHandlePositions(hotspot: Hotspot): Array<{
  handle: Exclude<HotspotDragHandle, "move">;
  x: number;
  y: number;
}> {
  const [nw, ne, se, sw] = resolveRelativeHotspotPolygon(hotspot);

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

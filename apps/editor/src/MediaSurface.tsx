import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Asset, Hotspot } from "@mage2/schema";

interface MediaSurfaceProps {
  asset?: Asset;
  hotspots?: Hotspot[];
  strings?: Record<string, string>;
  onSurfaceClick?: (normalizedX: number, normalizedY: number) => void;
  onHotspotClick?: (hotspotId: string) => void;
  selectedHotspotId?: string;
  className?: string;
}

export function MediaSurface({
  asset,
  hotspots = [],
  strings,
  onSurfaceClick,
  onHotspotClick,
  selectedHotspotId,
  className
}: MediaSurfaceProps) {
  const [assetUrl, setAssetUrl] = useState<string>();

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

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!onSurfaceClick) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    onSurfaceClick((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
  };

  return (
    <div
      className={className ? `media-surface ${className}` : "media-surface"}
      onClick={handleClick}
      title={
        onSurfaceClick
          ? "Scene preview. Click anywhere on the media to add a hotspot at that normalized position."
          : "Scene preview with active hotspots overlaid on the selected media."
      }
    >
      {asset && assetUrl ? (
        asset.kind === "video" ? (
          <video
            src={assetUrl}
            controls
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

      <div className="media-surface__overlay">
        {hotspots.map((hotspot) => (
          <HotspotButton
            key={hotspot.id}
            hotspot={hotspot}
            strings={strings}
            selected={hotspot.id === selectedHotspotId}
            onClick={(event) => {
              event.stopPropagation();
              onHotspotClick?.(hotspot.id);
            }}
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
  selected: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  title: string;
}

function HotspotButton({ hotspot, strings, selected, onClick, title }: HotspotButtonProps) {
  const comment = hotspot.commentTextId ? normalizeHotspotText(strings?.[hotspot.commentTextId]) : "";

  return (
    <button
      className={selected ? "hotspot hotspot--selected" : "hotspot"}
      style={{
        left: `${hotspot.x * 100}%`,
        top: `${hotspot.y * 100}%`,
        width: `${hotspot.width * 100}%`,
        height: `${hotspot.height * 100}%`
      }}
      onClick={onClick}
      title={title}
      type="button"
    >
      {hotspot.name || comment ? (
        <span className="hotspot__content">
          {hotspot.name ? <span className="hotspot__title">{hotspot.name}</span> : null}
          {comment ? <OverflowingHotspotComment text={comment} className="hotspot__comment" /> : null}
        </span>
      ) : null}
    </button>
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

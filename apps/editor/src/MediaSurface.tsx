import { useEffect, useState } from "react";
import type { Asset, Hotspot } from "@mage2/schema";

interface MediaSurfaceProps {
  asset?: Asset;
  hotspots?: Hotspot[];
  onSurfaceClick?: (normalizedX: number, normalizedY: number) => void;
  onHotspotClick?: (hotspotId: string) => void;
  selectedHotspotId?: string;
  className?: string;
}

export function MediaSurface({
  asset,
  hotspots = [],
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
    <div className={className ? `media-surface ${className}` : "media-surface"} onClick={handleClick}>
      {asset && assetUrl ? (
        asset.kind === "video" ? (
          <video src={assetUrl} controls muted className="media-surface__media" />
        ) : asset.kind === "image" ? (
          <img src={assetUrl} alt={asset.name} className="media-surface__media" />
        ) : (
          <div className="media-surface__placeholder">Non-visual asset selected</div>
        )
      ) : (
        <div className="media-surface__placeholder">Import media and assign it to this scene.</div>
      )}

      <div className="media-surface__overlay">
        {hotspots.map((hotspot) => (
          <button
            key={hotspot.id}
            className={hotspot.id === selectedHotspotId ? "hotspot hotspot--selected" : "hotspot"}
            style={{
              left: `${hotspot.x * 100}%`,
              top: `${hotspot.y * 100}%`,
              width: `${hotspot.width * 100}%`,
              height: `${hotspot.height * 100}%`
            }}
            onClick={(event) => {
              event.stopPropagation();
              onHotspotClick?.(hotspot.id);
            }}
            title={hotspot.name}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}

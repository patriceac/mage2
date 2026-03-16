import { useEffect, useState } from "react";
import type { Asset, Scene } from "@mage2/schema";

interface AssetPreviewProps {
  asset?: Asset;
  interactive?: boolean;
  allowSourceFallback?: boolean;
}

interface ScenePreviewCardProps {
  label: string;
  scene?: Scene;
  locationName?: string;
  asset?: Asset;
  emptyTitle?: string;
  emptyBody?: string;
}

export function AssetPreview({ asset, interactive = true, allowSourceFallback = false }: AssetPreviewProps) {
  const [assetUrl, setAssetUrl] = useState<string>();
  const [posterUrl, setPosterUrl] = useState<string>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadPreviewUrls() {
      if (!asset) {
        setAssetUrl(undefined);
        setPosterUrl(undefined);
        setLoadState("ready");
        return;
      }

      if (asset.kind === "subtitle") {
        setAssetUrl(undefined);
        setPosterUrl(undefined);
        setLoadState("ready");
        return;
      }

      const sourcePath = asset.proxyPath ?? (allowSourceFallback ? asset.sourcePath : undefined);
      if (!sourcePath) {
        setAssetUrl(undefined);
        setPosterUrl(undefined);
        setLoadState("ready");
        return;
      }

      setLoadState("loading");

      try {
        const nextAssetUrl = await window.editorApi.pathToFileUrl(sourcePath);
        const nextPosterUrl =
          asset.posterPath && asset.posterPath !== sourcePath
            ? await window.editorApi.pathToFileUrl(asset.posterPath)
            : undefined;

        if (!cancelled) {
          setAssetUrl(nextAssetUrl);
          setPosterUrl(nextPosterUrl);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) {
          setAssetUrl(undefined);
          setPosterUrl(undefined);
          setLoadState("error");
        }
      }
    }

    void loadPreviewUrls();
    return () => {
      cancelled = true;
    };
  }, [allowSourceFallback, asset?.id, asset?.kind, asset?.proxyPath, asset?.posterPath, asset?.sourcePath]);

  if (!asset) {
    return (
      <div className="asset-preview asset-preview--placeholder" title="Preview unavailable because no background asset is assigned.">
        <strong>No background asset</strong>
        <span>Assign an image or video to preview this scene.</span>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="asset-preview asset-preview--placeholder" title={`Preview unavailable for ${asset.name}.`}>
        <strong>Preview unavailable</strong>
        <span>{asset.name}</span>
      </div>
    );
  }

  if (!asset.proxyPath && !allowSourceFallback) {
    return (
      <div className="asset-preview asset-preview--placeholder" title={`Generate a proxy to preview ${asset.name}.`}>
        <strong>Proxy required</strong>
        <span>Generate a proxy to preview this asset.</span>
      </div>
    );
  }

  if (asset.kind === "image" && assetUrl) {
    return (
      <img
        src={assetUrl}
        alt={asset.name}
        className="asset-preview asset-preview__media"
        title={`Preview ${asset.name}.`}
      />
    );
  }

  if (asset.kind === "video" && assetUrl) {
    return (
      <video
        src={assetUrl}
        poster={posterUrl}
        controls={interactive}
        muted
        preload="metadata"
        className="asset-preview asset-preview__media"
        title={`Preview ${asset.name}.`}
      />
    );
  }

  if (asset.kind === "audio" && assetUrl && interactive) {
    return (
      <div className="asset-preview asset-preview--audio" title={`Preview ${asset.name}.`}>
        <strong>Audio Preview</strong>
        <span>{asset.name}</span>
        <audio controls preload="metadata" src={assetUrl} className="asset-preview__audio-player" />
      </div>
    );
  }

  if (asset.kind === "audio") {
    return (
      <div className="asset-preview asset-preview--placeholder" title={`Audio asset ${asset.name}.`}>
        <strong>Audio Asset</strong>
        <span>{asset.name}</span>
      </div>
    );
  }

  if (asset.kind === "subtitle") {
    return (
      <div className="asset-preview asset-preview--placeholder" title={`Subtitle asset ${asset.name}.`}>
        <strong>Subtitle File</strong>
        <span>{asset.name}</span>
      </div>
    );
  }

  return (
    <div className="asset-preview asset-preview--placeholder" title={`Loading preview for ${asset.name}.`}>
      <strong>Loading preview...</strong>
      <span>{asset.name}</span>
    </div>
  );
}

export function ScenePreviewCard({
  label,
  scene,
  locationName,
  asset,
  emptyTitle = "No scene selected",
  emptyBody = "Pick another scene to preview it here."
}: ScenePreviewCardProps) {
  if (!scene) {
    return (
      <article className="scene-preview-card scene-preview-card--empty">
        <div className="scene-preview-card__header">
          <p className="dialog-eyebrow">{label}</p>
          <h3>{emptyTitle}</h3>
        </div>
        <p className="muted">{emptyBody}</p>
      </article>
    );
  }

  return (
    <article className="scene-preview-card">
      <div className="scene-preview-card__header">
        <p className="dialog-eyebrow">{label}</p>
        <h3>{scene.name}</h3>
      </div>
      <AssetPreview asset={asset} interactive={false} allowSourceFallback />
      <div className="scene-preview-card__meta">
        <p>{locationName ?? "Unknown location"}</p>
        <p>
          {scene.hotspots.length} hotspot{scene.hotspots.length === 1 ? "" : "s"} / {scene.subtitleTrackIds.length} subtitle
          track{scene.subtitleTrackIds.length === 1 ? "" : "s"}
        </p>
      </div>
    </article>
  );
}

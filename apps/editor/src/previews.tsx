import { useEffect, useState } from "react";
import type { Asset, Scene } from "@mage2/schema";
import { resolveFileUrl } from "./file-url-cache";
import { getLocalizedAssetVariant } from "./localized-project";

interface AssetPreviewProps {
  asset?: Asset;
  locale?: string;
  interactive?: boolean;
  allowSourceFallback?: boolean;
  preferPosterForImages?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
}

interface ScenePreviewCardProps {
  label: string;
  scene?: Scene;
  locationName?: string;
  asset?: Asset;
  locale?: string;
  emptyTitle?: string;
  emptyBody?: string;
}

export function AssetPreview({
  asset,
  locale,
  interactive = true,
  allowSourceFallback = false,
  preferPosterForImages = false,
  emptyTitle = "No background asset",
  emptyBody = "Assign an image or video to preview this scene."
}: AssetPreviewProps) {
  const [assetUrl, setAssetUrl] = useState<string>();
  const [posterUrl, setPosterUrl] = useState<string>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const resolvedLocale = locale ?? Object.keys(asset?.variants ?? {})[0] ?? "";
  const variant = asset ? getLocalizedAssetVariant(asset, resolvedLocale) : undefined;
  const sourcePath = resolveAssetPreviewPath(asset, variant, allowSourceFallback, preferPosterForImages);
  const previewPosterPath =
    asset?.kind === "video" && variant?.posterPath && variant.posterPath !== sourcePath ? variant.posterPath : undefined;
  const hasManagedPreview = asset?.kind === "image" ? Boolean(variant?.posterPath ?? variant?.proxyPath) : Boolean(variant?.proxyPath);

  useEffect(() => {
    let cancelled = false;

    async function loadPreviewUrls() {
      if (!asset) {
        setAssetUrl(undefined);
        setPosterUrl(undefined);
        setLoadState("ready");
        return;
      }

      if (!sourcePath) {
        setAssetUrl(undefined);
        setPosterUrl(undefined);
        setLoadState("ready");
        return;
      }

      setLoadState("loading");

      try {
        const nextAssetUrl = await resolveFileUrl(sourcePath);
        const nextPosterUrl = previewPosterPath ? await resolveFileUrl(previewPosterPath) : undefined;

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
  }, [asset?.id, asset?.kind, previewPosterPath, sourcePath]);

  if (!asset) {
    return (
      <div className="asset-preview asset-preview--placeholder" title={`Preview unavailable because ${emptyTitle.toLowerCase()} is assigned.`}>
        <strong>{emptyTitle}</strong>
        <span>{emptyBody}</span>
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

  if (!hasManagedPreview && !allowSourceFallback) {
    return (
      <div className="asset-preview asset-preview--placeholder" title={`Preview unavailable for ${asset.name}.`}>
        <strong>Preview unavailable</strong>
        <span>No preview file is available for this asset.</span>
      </div>
    );
  }

  if (asset.kind === "image" && assetUrl) {
    return (
      <img
        src={assetUrl}
        alt={asset.name}
        className="asset-preview asset-preview__media"
        decoding="async"
        loading={preferPosterForImages ? "lazy" : "eager"}
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

  if (asset.kind === "audio" && assetUrl) {
    return (
      <div className="asset-preview asset-preview--audio" title={`Preview ${asset.name}.`}>
        <audio src={assetUrl} controls preload="metadata" className="asset-preview__audio" />
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
  locale,
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
      <AssetPreview
        asset={asset}
        locale={locale}
        interactive={false}
        allowSourceFallback
        preferPosterForImages
      />
      <div className="scene-preview-card__meta">
        <p>{locationName ?? "Unknown location"}</p>
        <p>
          {scene.hotspots.length} hotspot{scene.hotspots.length === 1 ? "" : "s"} / {scene.subtitleTracks.length} subtitle
          track{scene.subtitleTracks.length === 1 ? "" : "s"}
        </p>
      </div>
    </article>
  );
}

function resolveAssetPreviewPath(
  asset: Asset | undefined,
  variant: Asset["variants"][string] | undefined,
  allowSourceFallback: boolean,
  preferPosterForImages: boolean
): string | undefined {
  if (!asset || !variant) {
    return undefined;
  }

  if (asset.kind === "image") {
    if (preferPosterForImages) {
      return variant.posterPath ?? variant.proxyPath ?? (allowSourceFallback ? variant.sourcePath : undefined);
    }

    return variant.proxyPath ?? (allowSourceFallback ? variant.sourcePath : undefined);
  }

  return variant.proxyPath ?? (allowSourceFallback ? variant.sourcePath : undefined);
}

import { useEffect, useState } from "react";
import type { Asset, Scene } from "@mage2/schema";
import { resolveFileUrl } from "./file-url-cache";
import { useEditorI18n } from "./i18n";
import { getLocalizedAssetVariant } from "./localized-project";

interface AssetPreviewProps {
  asset?: Asset;
  locale?: string;
  interactive?: boolean;
  allowSourceFallback?: boolean;
  preferPosterForImages?: boolean;
  fit?: "cover" | "contain";
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
  fit = "cover",
  emptyTitle,
  emptyBody
}: AssetPreviewProps) {
  const { t } = useEditorI18n();
  const resolvedEmptyTitle = emptyTitle ?? t("No background asset");
  const resolvedEmptyBody = emptyBody ?? t("Assign an image or video to preview this scene.");
  const [assetUrl, setAssetUrl] = useState<string>();
  const [posterUrl, setPosterUrl] = useState<string>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const resolvedLocale = locale ?? Object.keys(asset?.variants ?? {})[0] ?? "";
  const variant = asset ? getLocalizedAssetVariant(asset, resolvedLocale) : undefined;
  const sourcePath = resolveAssetPreviewPath(asset, variant, allowSourceFallback, preferPosterForImages);
  const previewPosterPath =
    asset?.kind === "video" && variant?.posterPath && variant.posterPath !== sourcePath ? variant.posterPath : undefined;
  const hasManagedPreview = asset?.kind === "image" ? Boolean(variant?.posterPath ?? variant?.proxyPath) : Boolean(variant?.proxyPath);
  const previewClassName = "asset-preview";
  const mediaClassName = `${previewClassName} asset-preview__media${fit === "contain" ? " asset-preview__media--contain" : ""}`;

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
      <div
        className={`${previewClassName} asset-preview--placeholder`}
        title={t("Preview unavailable because {reason} is assigned.", { reason: resolvedEmptyTitle })}
      >
        <strong>{resolvedEmptyTitle}</strong>
        <span>{resolvedEmptyBody}</span>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className={`${previewClassName} asset-preview--placeholder`} title={t("Preview unavailable for {name}.", { name: asset.name })}>
        <strong>{t("Preview unavailable")}</strong>
        <span>{asset.name}</span>
      </div>
    );
  }

  if (!hasManagedPreview && !allowSourceFallback) {
    return (
      <div className={`${previewClassName} asset-preview--placeholder`} title={t("Preview unavailable for {name}.", { name: asset.name })}>
        <strong>{t("Preview unavailable")}</strong>
        <span>{t("No preview file is available for this asset.")}</span>
      </div>
    );
  }

  if (asset.kind === "image" && assetUrl) {
    return (
      <img
        src={assetUrl}
        alt={asset.name}
        className={mediaClassName}
        decoding="async"
        loading={preferPosterForImages ? "lazy" : "eager"}
        title={t("Preview {name}.", { name: asset.name })}
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
        className={mediaClassName}
        title={t("Preview {name}.", { name: asset.name })}
        dir="ltr"
      />
    );
  }

  if (asset.kind === "audio" && assetUrl) {
    return (
      <div className={`${previewClassName} asset-preview--audio`} title={t("Preview {name}.", { name: asset.name })}>
        <audio src={assetUrl} controls preload="metadata" className="asset-preview__audio" dir="ltr" />
      </div>
    );
  }

  return (
    <div className={`${previewClassName} asset-preview--placeholder`} title={t("Loading preview for {name}.", { name: asset.name })}>
      <strong>{t("Loading preview...")}</strong>
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
  emptyTitle,
  emptyBody
}: ScenePreviewCardProps) {
  const { locale: editorLocale, t } = useEditorI18n();
  const resolvedEmptyTitle = emptyTitle ?? t("No scene selected");
  const resolvedEmptyBody = emptyBody ?? t("Pick another scene to preview it here.");
  if (!scene) {
    return (
      <article className="scene-preview-card scene-preview-card--empty">
        <div className="scene-preview-card__header">
          <p className="dialog-eyebrow">{label}</p>
          <h3>{resolvedEmptyTitle}</h3>
        </div>
        <p className="muted">{resolvedEmptyBody}</p>
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
        <p>{locationName ?? t("Unknown location")}</p>
        <p>
          {t("Hotspots: {count}", { count: new Intl.NumberFormat(editorLocale).format(scene.hotspots.length) })}
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

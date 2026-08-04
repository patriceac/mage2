import { useEffect, useRef, useState } from "react";
import type { Asset } from "@mage2/schema";
import { resolveFileUrl } from "./file-url-cache";
import { useEditorI18n } from "./i18n";
import { getLocalizedAssetVariant } from "./localized-project";

interface ForegroundMediaPlayerProps {
  asset?: Asset;
  locale: string;
  label?: string;
  autoPlay?: boolean;
  className?: string;
  onDismiss?: () => void;
  volume?: number;
}

export function ForegroundMediaPlayer({
  asset,
  locale,
  label,
  autoPlay = true,
  className,
  onDismiss,
  volume = 1
}: ForegroundMediaPlayerProps) {
  const { t } = useEditorI18n();
  const resolvedLabel = label ? t(label) : t("Foreground media");
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [posterUrl, setPosterUrl] = useState<string>();
  const variant = asset ? getLocalizedAssetVariant(asset, locale) : undefined;
  const sourcePath = variant?.proxyPath ?? variant?.sourcePath;
  const posterPath = asset?.kind === "video" ? variant?.posterPath : undefined;
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const nextVolume = Math.min(1, Math.max(0, volume));
    if (videoRef.current) {
      videoRef.current.volume = nextVolume;
    }
    if (audioRef.current) {
      audioRef.current.volume = nextVolume;
    }
  }, [volume]);

  useEffect(() => {
    let cancelled = false;

    async function loadUrls() {
      if (!sourcePath) {
        setSourceUrl(undefined);
        setPosterUrl(undefined);
        return;
      }

      try {
        const [nextSourceUrl, nextPosterUrl] = await Promise.all([
          resolveFileUrl(sourcePath),
          posterPath ? resolveFileUrl(posterPath) : Promise.resolve(undefined)
        ]);
        if (!cancelled) {
          setSourceUrl(nextSourceUrl);
          setPosterUrl(nextPosterUrl);
        }
      } catch {
        if (!cancelled) {
          setSourceUrl(undefined);
          setPosterUrl(undefined);
        }
      }
    }

    void loadUrls();
    return () => {
      cancelled = true;
    };
  }, [posterPath, sourcePath]);

  if (!asset) {
    return null;
  }

  const rootClassName = ["foreground-media-player", `foreground-media-player--${asset.kind}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={rootClassName} aria-label={t("{label}: {name}", { label: resolvedLabel, name: asset.name })}>
      <header className="foreground-media-player__header">
        <span>{resolvedLabel}</span>
        <strong>{asset.name}</strong>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("Close {name}", { name: asset.name })}
            title={t("Close foreground media")}
          >
            {/* i18n-ignore-next-line -- multiplication-sign close glyph, not language */}
            &times;
          </button>
        ) : null}
      </header>
      {sourceUrl && asset.kind === "video" ? (
        <video
          ref={videoRef}
          src={sourceUrl}
          poster={posterUrl}
          autoPlay={autoPlay}
          controls
          playsInline
          preload="auto"
          className="foreground-media-player__video"
          dir="ltr"
        />
      ) : sourceUrl && asset.kind === "audio" ? (
        <audio
          ref={audioRef}
          src={sourceUrl}
          autoPlay={autoPlay}
          controls
          preload="auto"
          className="foreground-media-player__audio"
          dir="ltr"
        />
      ) : (
        <div className="foreground-media-player__unavailable">
          {t("No playable {locale} variant.", { locale })}
        </div>
      )}
    </section>
  );
}

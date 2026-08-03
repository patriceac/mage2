import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivePlayerResponse } from "@mage2/player";
import { resolveAssetVariant, type ProjectBundle } from "@mage2/schema";
import type { PlayerScenePresentation, PlayerSourceResolver, PlayerSystemCopy } from "./model";

const RESPONSE_TEXT_BASE_DURATION_MS = 2200;
const RESPONSE_TEXT_PER_CHARACTER_MS = 45;
const RESPONSE_TEXT_MIN_DURATION_MS = 3000;
const RESPONSE_TEXT_MAX_DURATION_MS = 8000;

export interface PlayerResponsePresenterProps {
  project: Pick<ProjectBundle, "assets">;
  activeResponse?: ActivePlayerResponse;
  locale: string;
  strings: Record<string, string>;
  resolveSourcePath: PlayerSourceResolver;
  presentation: PlayerScenePresentation;
  copy: Pick<
    PlayerSystemCopy,
    "skipResponseVideo" | "stopResponseAudio" | "playResponseAudio" | "responseAudioPlaying" | "responseMediaUnavailable"
  >;
  onComplete: (sequence: number) => void;
}

export function resolveResponseTextDurationMs(text: string): number {
  const characterCount = Array.from(text.trim()).length;
  return Math.min(
    RESPONSE_TEXT_MAX_DURATION_MS,
    Math.max(RESPONSE_TEXT_MIN_DURATION_MS, RESPONSE_TEXT_BASE_DURATION_MS + characterCount * RESPONSE_TEXT_PER_CHARACTER_MS)
  );
}

export function PlayerResponsePresenter({
  project,
  activeResponse,
  locale,
  strings,
  resolveSourcePath,
  presentation,
  copy,
  onComplete
}: PlayerResponsePresenterProps) {
  const entry = activeResponse?.entry;
  const mediaAsset =
    entry && entry.kind !== "text" && entry.assetId
      ? project.assets.assets.find((asset) => asset.id === entry.assetId)
      : undefined;
  const mediaVariant = mediaAsset ? resolveAssetVariant(mediaAsset, locale) : undefined;
  const sourcePath = mediaVariant?.proxyPath ?? mediaVariant?.sourcePath;
  const resolvedSource = useResolvedResponseSource(sourcePath, resolveSourcePath);

  useEffect(() => {
    if (!activeResponse || activeResponse.entry.kind !== "text") {
      return;
    }

    const text = strings[activeResponse.entry.textId] ?? "";
    const timeout = window.setTimeout(
      () => onComplete(activeResponse.sequence),
      resolveResponseTextDurationMs(text)
    );
    return () => window.clearTimeout(timeout);
  }, [activeResponse, onComplete, strings]);

  useEffect(() => {
    if (!activeResponse || activeResponse.entry.kind !== "video") {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      onComplete(activeResponse.sequence);
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [activeResponse, onComplete]);

  if (!activeResponse || !entry) {
    return null;
  }

  if (entry.kind === "text") {
    const text = strings[entry.textId]?.trim();
    if (!text) {
      return null;
    }
    return (
      <div className="mage2-player__response-layer mage2-player__response-layer--nonblocking" aria-live="polite">
        <p className="mage2-player__response-text" role="status">
          {text}
        </p>
      </div>
    );
  }

  const isExpectedKind = mediaAsset?.kind === entry.kind;
  if (!entry.assetId || !mediaAsset || !mediaVariant || !sourcePath || !isExpectedKind || resolvedSource.status === "error") {
    return (
      <div
        className={
          entry.kind === "video"
            ? `mage2-player__response-layer mage2-player__response-layer--video mage2-player__response-layer--${presentation}`
            : "mage2-player__response-layer mage2-player__response-layer--nonblocking"
        }
      >
        <div className="mage2-player__response-unavailable" role="status">
          <span>{copy.responseMediaUnavailable}</span>
          <button type="button" onClick={() => onComplete(activeResponse.sequence)}>
            {entry.kind === "video" ? copy.skipResponseVideo : copy.stopResponseAudio}
          </button>
        </div>
      </div>
    );
  }

  if (resolvedSource.status !== "ready") {
    return entry.kind === "video" ? (
      <div
        className={`mage2-player__response-layer mage2-player__response-layer--video mage2-player__response-layer--${presentation}`}
        aria-busy="true"
      />
    ) : null;
  }

  if (entry.kind === "audio") {
    return (
      <ResponseAudio
        key={activeResponse.sequence}
        sequence={activeResponse.sequence}
        sourceUrl={resolvedSource.url}
        copy={copy}
        onComplete={onComplete}
      />
    );
  }

  return (
    <ResponseVideo
      key={activeResponse.sequence}
      sequence={activeResponse.sequence}
      sourceUrl={resolvedSource.url}
      presentation={presentation}
      skipLabel={copy.skipResponseVideo}
      playLabel={copy.playResponseAudio}
      onComplete={onComplete}
    />
  );
}

function ResponseAudio({
  sequence,
  sourceUrl,
  copy,
  onComplete
}: {
  sequence: number;
  sourceUrl: string;
  copy: PlayerResponsePresenterProps["copy"];
  onComplete: (sequence: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [requiresPlay, setRequiresPlay] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    void audio.play().then(() => setRequiresPlay(false)).catch(() => setRequiresPlay(true));
    return () => audio.pause();
  }, [sourceUrl]);

  return (
    <div className="mage2-player__response-layer mage2-player__response-layer--nonblocking" aria-live="polite">
      <div className="mage2-player__response-audio" role="status">
        <span className="mage2-player__response-audio-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{copy.responseAudioPlaying}</span>
        {requiresPlay ? (
          <button type="button" onClick={() => void audioRef.current?.play().then(() => setRequiresPlay(false))}>
            {copy.playResponseAudio}
          </button>
        ) : null}
        <button type="button" className="mage2-player__response-quiet-action" onClick={() => onComplete(sequence)}>
          {copy.stopResponseAudio}
        </button>
        <audio
          ref={audioRef}
          src={sourceUrl}
          preload="auto"
          onEnded={() => onComplete(sequence)}
          onError={() => onComplete(sequence)}
        />
      </div>
    </div>
  );
}

function ResponseVideo({
  sequence,
  sourceUrl,
  presentation,
  skipLabel,
  playLabel,
  onComplete
}: {
  sequence: number;
  sourceUrl: string;
  presentation: PlayerScenePresentation;
  skipLabel: string;
  playLabel: string;
  onComplete: (sequence: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [requiresPlay, setRequiresPlay] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    void video.play().then(() => setRequiresPlay(false)).catch(() => setRequiresPlay(true));
    return () => video.pause();
  }, [sourceUrl]);

  return (
    <div
      className={`mage2-player__response-layer mage2-player__response-layer--video mage2-player__response-layer--${presentation}`}
      role="dialog"
      aria-modal="true"
    >
      <video
        ref={videoRef}
        src={sourceUrl}
        autoPlay
        playsInline
        preload="auto"
        className="mage2-player__response-video"
        onEnded={() => onComplete(sequence)}
        onError={() => onComplete(sequence)}
      />
      <div className="mage2-player__response-video-actions">
        {requiresPlay ? (
          <button type="button" onClick={() => void videoRef.current?.play().then(() => setRequiresPlay(false))}>
            {playLabel}
          </button>
        ) : null}
        <button type="button" className="mage2-player__response-skip" onClick={() => onComplete(sequence)} autoFocus>
          {skipLabel}
        </button>
      </div>
    </div>
  );
}

type ResolvedResponseSource =
  | { status: "idle" | "loading" | "error"; url?: undefined }
  | { status: "ready"; url: string };

function useResolvedResponseSource(
  sourcePath: string | undefined,
  resolver: PlayerSourceResolver
): ResolvedResponseSource {
  const [state, setState] = useState<ResolvedResponseSource>(() => (sourcePath ? { status: "loading" } : { status: "idle" }));
  const signature = useMemo(() => sourcePath ?? "", [sourcePath]);

  useEffect(() => {
    let cancelled = false;
    if (!sourcePath) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    void resolver(sourcePath)
      .then((url) => {
        if (!cancelled) {
          setState({ status: "ready", url });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [resolver, signature, sourcePath]);

  return state;
}

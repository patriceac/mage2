import { useEffect, useRef, useState } from "react";
import {
  PLAYHEAD_SYNC_TOLERANCE_MS,
  clampPlayheadMs,
  createPlayerController,
  getSceneAudioPlayheadMs,
  getVideoPlayheadMs,
  resolvePlayableDurationMs,
  resolveSceneAudioSyncState,
  resolveSceneTimelineDurationMs,
  shouldSyncPlayheadMs
} from "@mage2/player";
import {
  createInitialSaveState,
  normalizeSupportedLocales,
  resolveAssetCategory,
  resolveAssetVariant,
  parseSaveState,
  resolveHotspotBounds,
  resolveHotspotClipPath,
  resolveRelativeHotspotFrame,
  resolveHotspotRotationDegrees,
  resolveRelativeHotspotVisualBox,
  type Asset,
  type BuildManifest,
  type ExportProjectData,
  type Hotspot,
  type HotspotSurfaceSize,
  type InventoryItem,
  parseBuildManifest
} from "@mage2/schema";
import {
  isOpaqueHotspotVisualHit,
  loadHotspotVisualAlphaMask,
  type HotspotVisualAlphaMask
} from "./hotspot-alpha-hit-test";

export function resolveRuntimeHeaderContent(content: Pick<ExportProjectData, "manifest">): {
  projectName: string;
} {
  return {
    projectName: content.manifest.projectName
  };
}

export function resolveRuntimeInventoryItems(
  items: InventoryItem[],
  assets: Asset[],
  locale: string,
  strings: Record<string, string>
): Array<{ id: string; label: string; imageSrc?: string }> {
  return items.map((item) => {
    const asset = item.imageAssetId ? assets.find((entry) => entry.id === item.imageAssetId) : undefined;
    const variant = asset ? resolveAssetVariant(asset, locale) : undefined;

    return {
      id: item.id,
      label: strings[item.textId] ?? item.name ?? item.textId,
      imageSrc: asset?.kind === "image" ? variant?.sourcePath : undefined
    };
  });
}

export function resolveRuntimeHotspotVisuals(
  hotspots: Hotspot[],
  inventoryItems: InventoryItem[],
  assets: Asset[],
  locale: string,
  strings: Record<string, string>
): Record<string, { imageSrc: string; alt: string }> {
  const itemsById = new Map(inventoryItems.map((item) => [item.id, item] as const));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset] as const));
  const visuals: Record<string, { imageSrc: string; alt: string }> = {};

  for (const hotspot of hotspots) {
    if (!hotspot.inventoryItemId) {
      continue;
    }

    const item = itemsById.get(hotspot.inventoryItemId);
    if (!item?.imageAssetId) {
      continue;
    }

    const asset = assetsById.get(item.imageAssetId);
    if (!asset || asset.kind !== "image" || resolveAssetCategory(asset) !== "inventory") {
      continue;
    }

    const variant = resolveAssetVariant(asset, locale);
    const imageSrc = variant?.proxyPath ?? variant?.sourcePath;
    if (!imageSrc) {
      continue;
    }

    visuals[hotspot.id] = {
      imageSrc,
      alt: strings[item.textId] ?? item.name ?? hotspot.name ?? hotspot.id
    };
  }

  return visuals;
}

export function App() {
  const [buildManifest, setBuildManifest] = useState<BuildManifest>();
  const [content, setContent] = useState<ExportProjectData>();
  const [controller, setController] = useState<ReturnType<typeof createPlayerController>>();
  const [activeLocale, setActiveLocale] = useState<string>();
  const [playheadMs, setPlayheadMs] = useState(0);
  const [showHotspots, setShowHotspots] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [snapshot, setSnapshot] = useState(() => controller?.getSnapshot());
  const runtimeVideoRef = useRef<HTMLVideoElement>(null);
  const runtimeAudioRef = useRef<HTMLAudioElement>(null);
  const runtimeOverlayRef = useRef<HTMLDivElement>(null);
  const sceneAudioTimeoutRef = useRef<number | undefined>(undefined);
  const sceneAudioAnimationFrameRef = useRef<number | undefined>(undefined);
  const sceneAudioDrivenPlayheadMsRef = useRef<number | undefined>(undefined);
  const syncSceneAudioToPlayheadRef = useRef<((playheadMs: number) => void) | undefined>(undefined);
  const sceneAudioPhaseRef = useRef<"idle" | "waiting" | "playing" | "ended">("idle");
  const latestPlayheadMsRef = useRef(playheadMs);
  const [runtimeOverlaySize, setRuntimeOverlaySize] = useState<HotspotSurfaceSize>();
  const [runtimeHotspotAlphaMasks, setRuntimeHotspotAlphaMasks] = useState<Record<string, HotspotVisualAlphaMask>>({});

  useEffect(() => {
    latestPlayheadMsRef.current = playheadMs;
  }, [playheadMs]);

  useEffect(() => {
    async function loadBuild() {
      try {
        const manifestResponse = await fetch("./build-manifest.json");
        if (!manifestResponse.ok) {
          throw new Error("build-manifest.json not found. Export a project and open the generated folder.");
        }

        const manifest = parseBuildManifest(await manifestResponse.json());
        const contentResponse = await fetch(`./${manifest.contentPath}`);
        const parsedContent = (await contentResponse.json()) as ExportProjectData;
        const supportedLocales = normalizeSupportedLocales(
          parsedContent.manifest.defaultLanguage,
          parsedContent.manifest.supportedLocales
        );

        const storageKey = `mage2-runtime-save:${manifest.projectId}`;
        const localeStorageKey = `mage2-runtime-locale:${manifest.projectId}`;
        const storedSave = localStorage.getItem(storageKey);
        const storedLocale = localStorage.getItem(localeStorageKey);
        const nextLocale =
          storedLocale && supportedLocales.includes(storedLocale)
            ? storedLocale
            : parsedContent.manifest.defaultLanguage;
        const loadedProject = {
          manifest: parsedContent.manifest,
          assets: { schemaVersion: parsedContent.schemaVersion, assets: parsedContent.assets },
          locations: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.locations },
          scenes: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.scenes },
          dialogues: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.dialogues },
          inventory: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.inventoryItems },
          strings: { schemaVersion: parsedContent.schemaVersion, byLocale: parsedContent.strings }
        };
        const normalizedSaveState = storedSave
          ? parseSaveState({
              ...createInitialSaveState(loadedProject),
              ...(JSON.parse(storedSave) as object)
            })
          : undefined;
        const nextController = createPlayerController(
          loadedProject,
          normalizedSaveState
        );

        setBuildManifest(manifest);
        setContent(parsedContent);
        setController(nextController);
        setActiveLocale(nextLocale);
        setSnapshot(nextController.getSnapshot());
        setPlayheadMs(normalizedSaveState?.playheadMs ?? 0);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }

    void loadBuild();
  }, [Boolean(buildManifest && content && controller && snapshot)]);

  const storageKey = buildManifest ? `mage2-runtime-save:${buildManifest.projectId}` : "";
  const localeStorageKey = buildManifest ? `mage2-runtime-locale:${buildManifest.projectId}` : "";
  const supportedLocales =
    content
      ? normalizeSupportedLocales(content.manifest.defaultLanguage, content.manifest.supportedLocales)
      : [];
  const locale = activeLocale ?? content?.manifest.defaultLanguage ?? "en";
  const localeStrings = content?.strings[locale] ?? {};
  const currentAsset =
    content && snapshot
      ? (content.assets.find((asset) => asset.id === snapshot.scene.backgroundAssetId) as Asset | undefined)
      : undefined;
  const currentAssetVariant = currentAsset ? resolveAssetVariant(currentAsset, locale) : undefined;
  const sceneAudioAsset =
    content && snapshot?.scene.sceneAudioAssetId
      ? (content.assets.find((asset) => asset.id === snapshot.scene.sceneAudioAssetId) as Asset | undefined)
      : undefined;
  const sceneAudioVariant = sceneAudioAsset ? resolveAssetVariant(sceneAudioAsset, locale) : undefined;
  const sceneTimelineDurationMs = resolveSceneTimelineDurationMs(
    currentAssetVariant?.durationMs,
    currentAsset?.kind === "image" ? snapshot?.scene.sceneAudioDelayMs ?? 0 : 0,
    currentAsset?.kind === "image" ? sceneAudioVariant?.durationMs : undefined
  );
  const visibleHotspots = controller ? controller.getVisibleHotspots(playheadMs) : [];
  const subtitleLines = controller ? controller.getSubtitleLines(playheadMs, locale) : [];
  const runtimeInventoryItems =
    content && snapshot ? resolveRuntimeInventoryItems(snapshot.inventoryItems, content.assets, locale, localeStrings) : [];
  const runtimeHotspotVisuals =
    content && snapshot
      ? resolveRuntimeHotspotVisuals(visibleHotspots, content.inventoryItems, content.assets, locale, localeStrings)
      : {};
  const runtimeHotspotVisualEntries = Object.entries(runtimeHotspotVisuals);
  const runtimeHotspotVisualSignature = runtimeHotspotVisualEntries
    .map(([hotspotId, visual]) => `${hotspotId}:${visual.imageSrc}`)
    .sort()
    .join("|");

  useEffect(() => {
    const video = runtimeVideoRef.current;
    if (!video || currentAsset?.kind !== "video" || !snapshot) {
      return;
    }

    video.currentTime = 0;
    void video.play().catch(() => {
      // If autoplay is blocked, keep the runtime surface clean and leave playback stopped.
    });
  }, [currentAsset?.id, currentAsset?.kind, currentAssetVariant?.sourcePath, snapshot?.scene.id]);

  useEffect(() => {
    const video = runtimeVideoRef.current;
    if (!video || currentAsset?.kind !== "video") {
      return;
    }

    const durationMs = resolvePlayableDurationMs(video.duration, currentAssetVariant?.durationMs);
    const nextPlayheadMs = clampPlayheadMs(playheadMs, durationMs);
    const currentPlayheadMs = getVideoPlayheadMs(video.currentTime, video.duration, currentAssetVariant?.durationMs);
    if (!shouldSyncPlayheadMs(currentPlayheadMs, nextPlayheadMs)) {
      return;
    }

    video.currentTime = nextPlayheadMs / 1000;
  }, [currentAsset?.id, currentAsset?.kind, currentAssetVariant?.durationMs, currentAssetVariant?.sourcePath, playheadMs]);

  useEffect(() => {
    const video = runtimeVideoRef.current;
    if (!video || currentAsset?.kind !== "video") {
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
      const nextPlayheadMs = getVideoPlayheadMs(video.currentTime, video.duration, currentAssetVariant?.durationMs);
      if (!shouldSyncPlayheadMs(latestPlayheadMsRef.current, nextPlayheadMs)) {
        return;
      }

      setPlayheadMs(nextPlayheadMs);
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
  }, [currentAsset?.id, currentAsset?.kind, currentAssetVariant?.durationMs, currentAssetVariant?.sourcePath]);

  useEffect(() => {
    const audio = runtimeAudioRef.current;
    syncSceneAudioToPlayheadRef.current = undefined;
    if (sceneAudioTimeoutRef.current !== undefined) {
      window.clearTimeout(sceneAudioTimeoutRef.current);
      sceneAudioTimeoutRef.current = undefined;
    }
    if (sceneAudioAnimationFrameRef.current !== undefined) {
      window.cancelAnimationFrame(sceneAudioAnimationFrameRef.current);
      sceneAudioAnimationFrameRef.current = undefined;
    }

    if (!audio || !snapshot) {
      return;
    }

    const cancelAnimationFrameSync = () => {
      if (sceneAudioAnimationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(sceneAudioAnimationFrameRef.current);
        sceneAudioAnimationFrameRef.current = undefined;
      }
    };

    const clearPlayback = () => {
      if (sceneAudioTimeoutRef.current !== undefined) {
        window.clearTimeout(sceneAudioTimeoutRef.current);
        sceneAudioTimeoutRef.current = undefined;
      }
      cancelAnimationFrameSync();
      audio.pause();
      audio.currentTime = 0;
    };

    const updatePlayheadFromSceneAudio = (nextPlayheadMs: number) => {
      sceneAudioDrivenPlayheadMsRef.current = nextPlayheadMs;
      if (!shouldSyncPlayheadMs(latestPlayheadMsRef.current, nextPlayheadMs)) {
        return;
      }

      latestPlayheadMsRef.current = nextPlayheadMs;
      setPlayheadMs(nextPlayheadMs);
    };

    const syncFromAudioClock = () => {
      updatePlayheadFromSceneAudio(
        getSceneAudioPlayheadMs(
          audio.currentTime,
          audio.duration,
          snapshot.scene.sceneAudioDelayMs,
          sceneAudioVariant?.durationMs
        )
      );
    };

    const startPlaybackClock = () => {
      cancelAnimationFrameSync();

      const step = () => {
        syncFromAudioClock();
        if (audio.paused || audio.ended) {
          sceneAudioAnimationFrameRef.current = undefined;
          return;
        }

        sceneAudioAnimationFrameRef.current = window.requestAnimationFrame(step);
      };

      step();
    };

    const startDelayClock = (startingPlayheadMs: number) => {
      cancelAnimationFrameSync();

      const delayMs = Math.max(snapshot.scene.sceneAudioDelayMs, 0);
      const anchorMs = performance.now() - startingPlayheadMs;

      const step = () => {
        const elapsedMs = performance.now() - anchorMs;
        const nextPlayheadMs = Math.min(Math.max(elapsedMs, startingPlayheadMs), delayMs);
        updatePlayheadFromSceneAudio(nextPlayheadMs);
        if (nextPlayheadMs >= delayMs - PLAYHEAD_SYNC_TOLERANCE_MS) {
          sceneAudioAnimationFrameRef.current = undefined;
          return;
        }

        sceneAudioAnimationFrameRef.current = window.requestAnimationFrame(step);
      };

      step();
    };

    const syncSceneAudioToPlayhead = (nextPlayheadMs: number) => {
      if (!sceneAudioVariant?.sourcePath || currentAsset?.kind !== "image" || !snapshot.scene.sceneAudioAssetId) {
        sceneAudioPhaseRef.current = "idle";
        clearPlayback();
        return;
      }

      if (sceneAudioTimeoutRef.current !== undefined) {
        window.clearTimeout(sceneAudioTimeoutRef.current);
        sceneAudioTimeoutRef.current = undefined;
      }
      cancelAnimationFrameSync();

      const syncState = resolveSceneAudioSyncState(
        nextPlayheadMs,
        snapshot.scene.sceneAudioDelayMs,
        resolvePlayableDurationMs(audio.duration, sceneAudioVariant?.durationMs),
        snapshot.scene.sceneAudioLoop
      );
      sceneAudioPhaseRef.current = syncState.phase;

      if (syncState.phase === "waiting") {
        audio.pause();
        if (Math.abs(audio.currentTime * 1000) > PLAYHEAD_SYNC_TOLERANCE_MS) {
          audio.currentTime = 0;
        }

        if (syncState.startDelayMs > PLAYHEAD_SYNC_TOLERANCE_MS) {
          startDelayClock(syncState.effectivePlayheadMs);
          sceneAudioTimeoutRef.current = window.setTimeout(() => {
            sceneAudioTimeoutRef.current = undefined;
            updatePlayheadFromSceneAudio(Math.max(snapshot.scene.sceneAudioDelayMs, 0));
            void audio
              .play()
              .then(() => {
                sceneAudioPhaseRef.current = "playing";
                startPlaybackClock();
              })
              .catch(() => {
                // If autoplay is blocked, leave playback stopped without interrupting runtime.
              });
          }, syncState.startDelayMs);
          return;
        }
      }

      if (syncState.phase === "playing" || syncState.phase === "waiting") {
        if (Math.abs(audio.currentTime * 1000 - syncState.targetAudioCurrentTimeMs) > PLAYHEAD_SYNC_TOLERANCE_MS) {
          audio.currentTime = syncState.targetAudioCurrentTimeMs / 1000;
        }

        if (audio.paused) {
          void audio
            .play()
            .then(() => {
              sceneAudioPhaseRef.current = "playing";
              startPlaybackClock();
            })
            .catch(() => {
              // If autoplay is blocked, leave playback stopped without interrupting runtime.
            });
        } else {
          sceneAudioPhaseRef.current = "playing";
          startPlaybackClock();
        }
        return;
      }

      audio.pause();
      if (Math.abs(audio.currentTime * 1000 - syncState.targetAudioCurrentTimeMs) > PLAYHEAD_SYNC_TOLERANCE_MS) {
        audio.currentTime = syncState.targetAudioCurrentTimeMs / 1000;
      }
      updatePlayheadFromSceneAudio(syncState.effectivePlayheadMs);
    };

    syncSceneAudioToPlayheadRef.current = syncSceneAudioToPlayhead;

    const handlePlay = () => {
      sceneAudioPhaseRef.current = "playing";
      startPlaybackClock();
    };

    const handlePause = () => {
      cancelAnimationFrameSync();
      if (sceneAudioPhaseRef.current === "playing") {
        syncFromAudioClock();
      }
    };

    const handleSeeked = () => {
      sceneAudioPhaseRef.current = audio.paused ? "ended" : "playing";
      syncFromAudioClock();
    };

    const handleTimeUpdate = () => {
      syncFromAudioClock();
    };

    const handleLoadedMetadata = () => {
      syncSceneAudioToPlayhead(latestPlayheadMsRef.current);
    };

    const handleEnded = () => {
      cancelAnimationFrameSync();
      if (snapshot.scene.sceneAudioLoop) {
        syncSceneAudioToPlayhead(0);
        return;
      }

      const durationMs = resolvePlayableDurationMs(audio.duration, sceneAudioVariant?.durationMs);
      sceneAudioPhaseRef.current = "ended";
      if (durationMs !== undefined) {
        updatePlayheadFromSceneAudio(Math.max(snapshot.scene.sceneAudioDelayMs, 0) + durationMs);
        return;
      }

      syncFromAudioClock();
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("seeked", handleSeeked);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    syncSceneAudioToPlayhead(latestPlayheadMsRef.current);

    return () => {
      syncSceneAudioToPlayheadRef.current = undefined;
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      clearPlayback();
    };
  }, [
    currentAsset?.kind,
    sceneAudioVariant?.sourcePath,
    snapshot?.scene.id,
    snapshot?.scene.sceneAudioAssetId,
    snapshot?.scene.sceneAudioDelayMs,
    snapshot?.scene.sceneAudioLoop,
    sceneAudioVariant?.durationMs
  ]);

  useEffect(() => {
    const syncSceneAudioToPlayhead = syncSceneAudioToPlayheadRef.current;
    if (!syncSceneAudioToPlayhead || !sceneAudioVariant?.sourcePath || currentAsset?.kind !== "image" || !snapshot?.scene.sceneAudioAssetId) {
      return;
    }

    if (
      sceneAudioDrivenPlayheadMsRef.current !== undefined &&
      !shouldSyncPlayheadMs(sceneAudioDrivenPlayheadMsRef.current, playheadMs)
    ) {
      sceneAudioDrivenPlayheadMsRef.current = undefined;
      return;
    }

    syncSceneAudioToPlayhead(playheadMs);
  }, [playheadMs, currentAsset?.kind, sceneAudioVariant?.sourcePath, snapshot?.scene.sceneAudioAssetId]);

  useEffect(() => {
    if (localeStorageKey && activeLocale) {
      localStorage.setItem(localeStorageKey, activeLocale);
    }
  }, [activeLocale, localeStorageKey]);

  useEffect(() => {
    const overlay = runtimeOverlayRef.current;
    if (!overlay || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateOverlaySize = () => {
      const bounds = overlay.getBoundingClientRect();
      setRuntimeOverlaySize(
        bounds.width > 0 && bounds.height > 0
          ? {
              width: bounds.width,
              height: bounds.height
            }
          : undefined
      );
    };

    updateOverlaySize();

    const observer = new ResizeObserver(updateOverlaySize);
    observer.observe(overlay);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntimeHotspotAlphaMasks() {
      if (runtimeHotspotVisualEntries.length === 0) {
        setRuntimeHotspotAlphaMasks({});
        return;
      }

      const resolvedEntries = await Promise.all(
        runtimeHotspotVisualEntries.map(async ([hotspotId, visual]) => {
          try {
            const alphaMask = await loadHotspotVisualAlphaMask(visual.imageSrc);
            return alphaMask ? ([hotspotId, alphaMask] as const) : undefined;
          } catch {
            return undefined;
          }
        })
      );

      if (!cancelled) {
        setRuntimeHotspotAlphaMasks(
          Object.fromEntries(
            resolvedEntries.filter(
              (entry): entry is readonly [string, HotspotVisualAlphaMask] => Boolean(entry)
            )
          )
        );
      }
    }

    void loadRuntimeHotspotAlphaMasks();
    return () => {
      cancelled = true;
    };
  }, [runtimeHotspotVisualSignature]);

  if (errorMessage) {
    return (
      <main className="runtime-shell">
        <section className="runtime-card">
          <h1>MAGE2 Runtime</h1>
          <p>{errorMessage}</p>
        </section>
      </main>
    );
  }

  if (!buildManifest || !content || !controller || !snapshot) {
    return (
      <main className="runtime-shell">
        <section className="runtime-card">
          <h1>MAGE2 Runtime</h1>
          <p>Loading export...</p>
        </section>
      </main>
    );
  }

  const headerContent = resolveRuntimeHeaderContent(content);

  return (
    <main className="runtime-shell">
      <section className="runtime-stage">
        <header className="runtime-header">
          <div>
            <p className="runtime-eyebrow">{headerContent.projectName}</p>
          </div>
          <div className="runtime-actions">
            <button
              type="button"
              onClick={() => {
                const nextSave = controller.save();
                nextSave.playheadMs = playheadMs;
                localStorage.setItem(storageKey, JSON.stringify(nextSave));
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                const storedSave = localStorage.getItem(storageKey);
                if (!storedSave) {
                  return;
                }

                const loadedProject = {
                  manifest: content.manifest,
                  assets: { schemaVersion: content.schemaVersion, assets: content.assets },
                  locations: { schemaVersion: content.schemaVersion, items: content.locations },
                  scenes: { schemaVersion: content.schemaVersion, items: content.scenes },
                  dialogues: { schemaVersion: content.schemaVersion, items: content.dialogues },
                  inventory: { schemaVersion: content.schemaVersion, items: content.inventoryItems },
                  strings: { schemaVersion: content.schemaVersion, byLocale: content.strings }
                };
                const nextSaveState = parseSaveState({
                  ...createInitialSaveState(loadedProject),
                  ...(JSON.parse(storedSave) as object)
                });
                const nextController = createPlayerController(
                  loadedProject,
                  nextSaveState
                );
                setController(nextController);
                setSnapshot(nextController.getSnapshot());
                setPlayheadMs(nextSaveState.playheadMs ?? 0);
              }}
            >
              Load
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(storageKey);
                const nextController = createPlayerController({
                  manifest: content.manifest,
                  assets: { schemaVersion: content.schemaVersion, assets: content.assets },
                  locations: { schemaVersion: content.schemaVersion, items: content.locations },
                  scenes: { schemaVersion: content.schemaVersion, items: content.scenes },
                  dialogues: { schemaVersion: content.schemaVersion, items: content.dialogues },
                  inventory: { schemaVersion: content.schemaVersion, items: content.inventoryItems },
                  strings: { schemaVersion: content.schemaVersion, byLocale: content.strings }
                });
                setController(nextController);
                setSnapshot(nextController.getSnapshot());
                setPlayheadMs(0);
              }}
            >
              Restart
            </button>
            <label
              className="runtime-hotspot-visibility-toggle"
              title="Show translucent hotspot regions for debugging. Labels remain hidden."
            >
              <input
                type="checkbox"
                checked={showHotspots}
                onChange={(event) => setShowHotspots(event.target.checked)}
              />
              <span>Show hotspots</span>
            </label>
            <label className="runtime-hotspot-visibility-toggle" title="Switch the active runtime locale.">
              <span>Locale</span>
              <select value={locale} onChange={(event) => setActiveLocale(event.target.value)}>
                {supportedLocales.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <div className="runtime-media">
          {currentAsset?.kind === "video" && currentAssetVariant ? (
            <video
              ref={runtimeVideoRef}
              key={`${snapshot.scene.id}:${currentAsset.id}`}
              src={currentAssetVariant.sourcePath}
              autoPlay
              loop={snapshot.scene.backgroundVideoLoop}
              playsInline
              className="runtime-media__asset"
              onLoadedMetadata={(event) => {
                const durationMs = resolvePlayableDurationMs(event.currentTarget.duration, currentAssetVariant?.durationMs);
                const nextPlayheadMs = clampPlayheadMs(playheadMs, durationMs);
                const currentPlayheadMs = getVideoPlayheadMs(
                  event.currentTarget.currentTime,
                  event.currentTarget.duration,
                  currentAssetVariant?.durationMs
                );

                if (shouldSyncPlayheadMs(currentPlayheadMs, nextPlayheadMs)) {
                  event.currentTarget.currentTime = nextPlayheadMs / 1000;
                }

                setPlayheadMs(
                  getVideoPlayheadMs(
                    event.currentTarget.currentTime,
                    event.currentTarget.duration,
                    currentAssetVariant?.durationMs
                  )
                );
              }}
              onSeeked={(event) =>
                setPlayheadMs(
                  getVideoPlayheadMs(event.currentTarget.currentTime, event.currentTarget.duration, currentAssetVariant?.durationMs)
                )
              }
            />
          ) : currentAsset?.kind === "image" && currentAssetVariant ? (
            <img src={currentAssetVariant.sourcePath} alt={currentAsset.name} className="runtime-media__asset" />
          ) : (
            <div className="runtime-media__placeholder">No playable visual asset for this scene.</div>
          )}
          {sceneAudioVariant?.sourcePath ? (
            <audio ref={runtimeAudioRef} src={sceneAudioVariant.sourcePath} preload="metadata" className="runtime-scene-audio" />
          ) : null}

          <div ref={runtimeOverlayRef} className="runtime-media__overlay">
            {visibleHotspots.map((hotspot) => {
              return (
                <RuntimeHotspotButton
                  key={hotspot.id}
                  hotspot={hotspot}
                  showHotspots={showHotspots}
                  surfaceSize={runtimeOverlaySize}
                  visual={runtimeHotspotVisuals[hotspot.id]}
                  alphaMask={runtimeHotspotAlphaMasks[hotspot.id]}
                  strings={localeStrings}
                  onActivate={() => {
                    controller.selectHotspot(hotspot.id, playheadMs);
                    setSnapshot(controller.getSnapshot());
                    setPlayheadMs(0);
                  }}
                />
              );
            })}
          </div>
        </div>

        <label className="runtime-scrubber">
          Playhead {Math.round(playheadMs)}ms
          <input
            type="range"
            min={0}
            max={sceneTimelineDurationMs}
            value={Math.min(playheadMs, sceneTimelineDurationMs)}
            onChange={(event) => setPlayheadMs(Number(event.target.value))}
          />
        </label>

        <div className="runtime-subtitles">
          {subtitleLines.length > 0 ? (
            subtitleLines.map((line, index) => (
              <p key={`${index}:${line}`} className="runtime-subtitles__line">
                {line}
              </p>
            ))
          ) : (
            "Subtitles will appear here."
          )}
        </div>

        {snapshot.activeDialogue ? (
          <div className="runtime-dialogue">
            <h2>{snapshot.activeDialogue.node.speaker}</h2>
            <p>{localeStrings[snapshot.activeDialogue.node.textId] ?? snapshot.activeDialogue.node.textId}</p>
            {snapshot.activeDialogue.choices.length > 0 ? (
              <div className="runtime-choices">
                {snapshot.activeDialogue.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => {
                      controller.chooseDialogueChoice(choice.id);
                      setSnapshot(controller.getSnapshot());
                    }}
                  >
                    {localeStrings[choice.textId] ?? choice.textId}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  controller.continueDialogue();
                  setSnapshot(controller.getSnapshot());
                }}
              >
                Continue
              </button>
            )}
          </div>
        ) : null}

        <aside className="runtime-sidebar">
          <section className="runtime-sidebar__section">
            <h3>Inventory</h3>
            {runtimeInventoryItems.length > 0 ? (
              <div className="runtime-inventory">
                {runtimeInventoryItems.map((item) => (
                  <article key={item.id} className="runtime-inventory__item">
                    {item.imageSrc ? (
                      <img src={item.imageSrc} alt={item.label} className="runtime-inventory__thumb" />
                    ) : (
                      <div className="runtime-inventory__thumb runtime-inventory__thumb--placeholder">No art</div>
                    )}
                    <strong>{item.label}</strong>
                  </article>
                ))}
              </div>
            ) : (
              <p className="runtime-sidebar__empty">Inventory empty.</p>
            )}
          </section>

          <section className="runtime-sidebar__section">
            <h3>State</h3>
            <pre>{JSON.stringify(snapshot.saveState, null, 2)}</pre>
          </section>
        </aside>
      </section>
    </main>
  );
}

function RuntimeHotspotButton({
  hotspot,
  showHotspots,
  surfaceSize,
  visual,
  alphaMask,
  strings,
  onActivate
}: {
  hotspot: Hotspot;
  showHotspots: boolean;
  surfaceSize?: HotspotSurfaceSize;
  visual?: {
    imageSrc: string;
    alt: string;
  };
  alphaMask?: HotspotVisualAlphaMask;
  strings: Record<string, string>;
  onActivate: () => void;
}) {
  const bounds = resolveHotspotBounds(hotspot);
  const relativeFrame = surfaceSize ? resolveRelativeHotspotFrame(hotspot, surfaceSize) : undefined;
  const clipPath =
    hotspot.inventoryItemId && relativeFrame ? resolveRelativeHotspotClipPath(relativeFrame.polygon) : resolveHotspotClipPath(hotspot);
  const rotationDegrees =
    hotspot.inventoryItemId && relativeFrame ? relativeFrame.rotationDegrees : resolveHotspotRotationDegrees(hotspot);
  const visualBox = resolveRelativeHotspotVisualBox(hotspot, surfaceSize ?? { width: 1, height: 1 });
  const [isPointerOverOpaquePixel, setIsPointerOverOpaquePixel] = useState(false);
  const usesAlphaAwarePointerFeedback = Boolean(visual?.imageSrc);
  const isOpaquePointerEvent = (
    event: Pick<React.MouseEvent<HTMLButtonElement>, "clientX" | "clientY" | "currentTarget">
  ) => {
    if (!visual?.imageSrc || !alphaMask) {
      return false;
    }

    return isOpaqueHotspotVisualHit(alphaMask, {
      pointX: event.clientX - event.currentTarget.getBoundingClientRect().left,
      pointY: event.clientY - event.currentTarget.getBoundingClientRect().top,
      hotspotWidth: event.currentTarget.getBoundingClientRect().width,
      hotspotHeight: event.currentTarget.getBoundingClientRect().height,
      visualBox,
      rotationDegrees,
      imageWidth: alphaMask.width,
      imageHeight: alphaMask.height
    });
  };
  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (visual?.imageSrc && alphaMask) {
      const isPointerHit = isOpaquePointerEvent(event);
      setIsPointerOverOpaquePixel(isPointerHit);
      if (!isPointerHit) {
        return;
      }
    }

    onActivate();
  };
  const handleMouseMoveOrEnter: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (!usesAlphaAwarePointerFeedback) {
      return;
    }

    if (!alphaMask) {
      setIsPointerOverOpaquePixel(false);
      return;
    }

    setIsPointerOverOpaquePixel(isOpaquePointerEvent(event));
  };
  const className = [
    showHotspots ? "runtime-hotspot" : "runtime-hotspot runtime-hotspot--hidden",
    usesAlphaAwarePointerFeedback && !isPointerOverOpaquePixel ? "runtime-hotspot--pointer-inactive" : undefined
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      aria-label={`${resolveRuntimeHotspotTitle(hotspot, strings)}: activate this hotspot.`}
      style={{
        left: `${bounds.x * 100}%`,
        top: `${bounds.y * 100}%`,
        width: `${bounds.width * 100}%`,
        height: `${bounds.height * 100}%`,
        clipPath,
        ...(usesAlphaAwarePointerFeedback ? { cursor: isPointerOverOpaquePixel ? "pointer" : "default" } : undefined)
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseMoveOrEnter}
      onMouseMove={handleMouseMoveOrEnter}
      onMouseLeave={() => setIsPointerOverOpaquePixel(false)}
    >
      {visual ? (
        <div className="runtime-hotspot__visual-content" style={resolveRuntimeHotspotVisualContentStyle(visualBox, rotationDegrees)}>
          <img src={visual.imageSrc} alt="" aria-hidden="true" className="runtime-hotspot__visual" />
        </div>
      ) : null}
    </button>
  );
}

function resolveRuntimeHotspotVisualContentStyle(
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

function resolveRelativeHotspotClipPath(polygon?: Array<{ x: number; y: number }>): string | undefined {
  if (!polygon || polygon.length === 0) {
    return undefined;
  }

  return `polygon(${polygon.map((point) => `${formatHotspotPercent(point.x)} ${formatHotspotPercent(point.y)}`).join(", ")})`;
}

function formatHotspotPercent(value: number): string {
  const percent = Math.max(0, Math.min(1, value)) * 100;
  return `${Math.round(percent * 10000) / 10000}%`;
}

function normalizeHotspotText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function resolveRuntimeHotspotTitle(hotspot: Hotspot, strings: Record<string, string>): string {
  const comment = hotspot.commentTextId ? normalizeHotspotText(strings[hotspot.commentTextId]) : "";
  return hotspot.name || comment || hotspot.id;
}

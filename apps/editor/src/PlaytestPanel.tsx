import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPlayerController, resolveSceneTimelineDurationMs, type ActivePlayerResponse } from "@mage2/player";
import {
  PlayerSceneRenderer,
  resolvePlayerHotspotVisuals,
  resolvePlayerSystemCopy,
  resolvePlayerSceneHotspots,
  type PlayerSceneRendererHandle
} from "@mage2/player-ui";
import {
  getLocaleStringValues,
  normalizeSupportedLocales,
  type Asset,
  type InventoryItem,
  type ProjectBundle
} from "@mage2/schema";
import { DropdownSelect } from "./DropdownSelect";
import { resolveFileUrl } from "./file-url-cache";
import { getLocalizedAssetVariant } from "./localized-project";
import type { EditorAutomationPlaytestState } from "./automation-commands";
import {
  PLAYHEAD_SYNC_TOLERANCE_MS,
  getSceneAudioPlayheadMs,
  resolvePlayableDurationMs,
  resolveSceneAudioPlaybackDirective,
  resolveSceneAudioSyncState,
  shouldSyncPlayheadMs
} from "./media-playhead";
import { useEditorStore } from "./store";

interface PlaytestPanelProps {
  project: ProjectBundle;
  onExit?: () => void;
}

const STORAGE_KEY = "mage2-editor-playtest-save";
const LOCALE_STORAGE_KEY = "mage2-editor-playtest-locale";
const PLAYTEST_INVENTORY_BAG_ICON_SRC = new URL("./assets/playtest-inventory-bag.png", import.meta.url).href;

export function resolvePlaytestPlayerCopy(locale: string) {
  return resolvePlayerSystemCopy(locale);
}

export function resolvePlaytestInventorySummary(
  items: Array<Pick<InventoryItem, "name" | "textId">>,
  strings: Record<string, string>
): string {
  const labels = items
    .map((item) => strings[item.textId] ?? item.name ?? item.textId)
    .filter((label) => label.length > 0);

  return labels.join(", ") || "Empty";
}

export function resolveStoredPlaytestLocale(
  storedLocale: string | null,
  supportedLocales: readonly string[],
  fallbackLocale: string
): string {
  return storedLocale && supportedLocales.includes(storedLocale) ? storedLocale : fallbackLocale;
}

export function resolvePlaytestVisualDurationMs(
  assetKind: Asset["kind"] | undefined,
  assetDurationMs: number | undefined,
  observedVideoDurationMs: number | undefined
): number | undefined {
  return assetKind === "video" ? observedVideoDurationMs ?? assetDurationMs : assetDurationMs;
}

export {
  PlayerDialogueBox as PlaytestDialogueBox,
  PlayerInventoryTray as PlaytestInventoryTray,
  resolveInventoryCursorPreviewFrameStyle,
  resolvePlayerDialogueChoiceMarker as resolvePlaytestDialogueChoiceMarker,
  resolvePlayerInventoryItemInitial as resolvePlaytestInventoryItemInitial,
  resolvePlayerInventoryItemTooltip as resolvePlaytestInventoryItemTooltip,
  resolvePlayerInventorySlotSelection as resolvePlaytestInventorySlotSelection,
  resolvePlayerStageHudClassName as resolvePlaytestStageHudClassName,
  shouldHandlePlayerHotspotClick as shouldHandlePlaytestHotspotClick
} from "@mage2/player-ui";

export function resolvePlaytestInventoryToggleLabel(itemCount: number, isExpanded: boolean): string {
  return resolvePlaytestPlayerCopy("en").inventoryToggleLabel({ itemCount, isExpanded });
}

export function PlaytestPanel({ project, onExit }: PlaytestPanelProps) {
  const activeLocale = useEditorStore((state) => state.playtestLocale) ?? project.manifest.defaultLanguage;
  const setActiveLocale = useEditorStore((state) => state.setPlaytestLocale);
  const [controller, setController] = useState(() => createPlayerController(project));
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playbackResetKey, setPlaybackResetKey] = useState(0);
  const [observedVideoDuration, setObservedVideoDuration] = useState<{
    assetId: string;
    sourcePath?: string;
    durationMs: number;
  }>();
  const [showHotspots, setShowHotspots] = useState(false);
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string>();
  const selectedInventoryItemIdRef = useRef<string | undefined>(undefined);
  const playerRendererRef = useRef<PlayerSceneRendererHandle>(null);
  const [lastActivatedHotspotId, setLastActivatedHotspotId] = useState<string>();
  const [sceneAudioUrl, setSceneAudioUrl] = useState<string>();
  const [activeResponse, setActiveResponse] = useState<ActivePlayerResponse>();
  const sceneAudioRef = useRef<HTMLAudioElement>(null);
  const sceneAudioTimeoutRef = useRef<number | undefined>(undefined);
  const sceneAudioAnimationFrameRef = useRef<number | undefined>(undefined);
  const latestPlayheadMsRef = useRef(playheadMs);
  const sceneAudioDrivenPlayheadMsRef = useRef<number | undefined>(undefined);
  const syncSceneAudioToPlayheadRef = useRef<((playheadMs: number) => void) | undefined>(undefined);
  const sceneAudioPlaybackIntentRef = useRef(true);
  const sceneAudioInternalPauseRef = useRef(false);
  const sceneAudioPhaseRef = useRef<"idle" | "waiting" | "playing" | "ended">("idle");
  const supportedLocales = useMemo(
    () => normalizeSupportedLocales(project.manifest.defaultLanguage, project.manifest.supportedLocales),
    [project.manifest.defaultLanguage, project.manifest.supportedLocales]
  );
  const localeStrings = getLocaleStringValues(project, activeLocale);
  const playerCopy = resolvePlaytestPlayerCopy(activeLocale);

  useEffect(() => {
    latestPlayheadMsRef.current = playheadMs;
  }, [playheadMs]);

  useEffect(() => {
    const nextController = createPlayerController(project);
    setController(nextController);
    setSnapshot(nextController.getSnapshot());
    setPlayheadMs(0);
    setActiveResponse(undefined);
    selectPlaytestInventoryItem(undefined);
  }, [project]);

  useEffect(() => {
    const nextLocale = resolveStoredPlaytestLocale(
      localStorage.getItem(LOCALE_STORAGE_KEY),
      supportedLocales,
      project.manifest.defaultLanguage
    );
    if (nextLocale !== useEditorStore.getState().playtestLocale) {
      setActiveLocale(nextLocale);
    }
  }, [project.manifest.defaultLanguage, setActiveLocale, supportedLocales]);

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, activeLocale);
  }, [activeLocale]);

  useEffect(() => {
    if (!onExit) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.repeat ||
        event.defaultPrevented ||
        document.querySelector(".dialog-overlay")
      ) {
        return;
      }

      if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea")) {
        return;
      }

      event.preventDefault();
      onExit();
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onExit]);

  function resetPlaytestRun() {
    const nextController = createPlayerController(project);
    const nextSnapshot = nextController.getSnapshot();
    sceneAudioPlaybackIntentRef.current = true;
    sceneAudioDrivenPlayheadMsRef.current = undefined;
    setController(nextController);
    setSnapshot(nextSnapshot);
    setPlayheadMs(0);
    setPlaybackResetKey((value) => value + 1);
    selectPlaytestInventoryItem(undefined);
    setLastActivatedHotspotId(undefined);
    setActiveResponse(undefined);
    return nextSnapshot;
  }

  function selectPlaytestInventoryItem(itemId: string | undefined) {
    selectedInventoryItemIdRef.current = itemId;
    setSelectedInventoryItemId(itemId);
  }

  function activatePlaytestHotspot(hotspotId: string) {
    const activeSelectedInventoryItemId = selectedInventoryItemIdRef.current;
    setLastActivatedHotspotId(hotspotId);
    const resolution = controller.selectHotspot(hotspotId, playheadMs, sceneTimelineDurationMs);
    applyPlayerResponseResolution(resolution);
    const nextSnapshot = controller.getSnapshot();
    setSnapshot(nextSnapshot);
    setPlayheadMs(0);
    return { snapshot: nextSnapshot, selectedInventoryItemId: activeSelectedInventoryItemId, activated: true };
  }

  function activatePlaytestHotspotEvent(hotspotId: string, eventType: "click" | "otherItem") {
    setLastActivatedHotspotId(hotspotId);
    const resolution = controller.selectHotspotEvent(hotspotId, eventType, playheadMs, sceneTimelineDurationMs);
    applyPlayerResponseResolution(resolution);
    setSnapshot(controller.getSnapshot());
    setPlayheadMs(0);
  }

  function applyPlayerResponseResolution(resolution: ReturnType<typeof controller.selectHotspot>) {
    if (resolution.response) {
      setActiveResponse(resolution.response);
    } else if (resolution.startedDialogueTreeId || resolution.transitionedToSceneId) {
      setActiveResponse(undefined);
    }
  }

  const completeResponse = useCallback((sequence: number) => {
    setActiveResponse((current) => (current?.sequence === sequence ? undefined : current));
  }, []);

  const sceneAsset = project.assets.assets.find((asset) => asset.id === snapshot.scene.backgroundAssetId);
  const sceneAssetVariant = getLocalizedAssetVariant(sceneAsset, activeLocale);
  const sceneAudioAsset = snapshot.scene.sceneAudioAssetId
    ? project.assets.assets.find((asset) => asset.id === snapshot.scene.sceneAudioAssetId)
    : undefined;
  const sceneAudioVariant = getLocalizedAssetVariant(sceneAudioAsset, activeLocale);
  const sceneAssetSourcePath = sceneAssetVariant?.proxyPath ?? sceneAssetVariant?.sourcePath;
  const observedVideoDurationMs =
    sceneAsset?.kind === "video" &&
    observedVideoDuration?.assetId === sceneAsset.id &&
    observedVideoDuration.sourcePath === sceneAssetSourcePath
      ? observedVideoDuration.durationMs
      : undefined;
  const sceneTimelineDurationMs = resolveSceneTimelineDurationMs(
    resolvePlaytestVisualDurationMs(sceneAsset?.kind, sceneAssetVariant?.durationMs, observedVideoDurationMs),
    sceneAsset?.kind === "image" ? snapshot.scene.sceneAudioDelayMs : 0,
    sceneAsset?.kind === "image" ? sceneAudioVariant?.durationMs : undefined
  );
  const visibleHotspots = controller.getVisibleHotspots(playheadMs, sceneTimelineDurationMs);
  const gameplayPaused = activeResponse?.entry.kind === "video";
  const sceneHotspots = resolvePlayerSceneHotspots(visibleHotspots, snapshot.scene.hotspots, snapshot.flags);
  const hotspotVisuals = resolvePlayerHotspotVisuals({
    hotspots: sceneHotspots.surfaceHotspots,
    inventoryItems: project.inventory.items,
    assets: project.assets.assets,
    locale: activeLocale,
    strings: localeStrings,
    flags: snapshot.flags
  });

  function resolvePlaytestAutomationState(): EditorAutomationPlaytestState {
    const placedVisuals: Record<string, string> = {};
    for (const instance of sceneHotspots.placedInstances) {
      if (hotspotVisuals[instance.id]) {
        placedVisuals[instance.id] = instance.itemId;
        placedVisuals[instance.dropTargetHotspotId] = instance.itemId;
      }
    }

    return {
      sceneId: snapshot.scene.id,
      visibleHotspotIds: visibleHotspots.map((hotspot) => hotspot.id),
      surfaceHotspotIds: sceneHotspots.surfaceHotspots.map((hotspot) => hotspot.id),
      inventoryItemIds: snapshot.inventoryItems.map((item) => item.id),
      selectedInventoryItemId: selectedInventoryItemIdRef.current,
      lastActivatedHotspotId,
      flags: snapshot.flags,
      placedVisuals,
      placedObjects: sceneHotspots.placedInstances.map((instance) => ({
        id: instance.id,
        itemId: instance.itemId,
        dropTargetHotspotId: instance.dropTargetHotspotId,
        sourceHotspotId: instance.sourceHotspotId,
        x: instance.hotspot.x,
        y: instance.hotspot.y,
        width: instance.hotspot.width,
        height: instance.hotspot.height
      }))
    };
  }

  useEffect(() => {
    window.__mage2PlaytestAutomation = {
      getState: resolvePlaytestAutomationState,
      reset: () => {
        resetPlaytestRun();
        return resolvePlaytestAutomationState();
      },
      clickHotspot: (hotspotId: string) => {
        playerRendererRef.current?.activateHotspot(hotspotId);
        return resolvePlaytestAutomationState();
      },
      selectInventoryItem: (itemId?: string) => {
        if (itemId && !snapshot.inventoryItems.some((item) => item.id === itemId)) {
          throw new Error(`Inventory item '${itemId}' is not currently available in playtest.`);
        }

        playerRendererRef.current?.selectInventoryItem(itemId);
        return resolvePlaytestAutomationState();
      },
      assertPlacedItemVisible: (hotspotId: string, itemId: string) => {
        const state = resolvePlaytestAutomationState();
        if (state.placedVisuals[hotspotId] !== itemId) {
          throw new Error(`Expected '${itemId}' to be visibly placed on hotspot '${hotspotId}'.`);
        }

        return state;
      }
    };

    return () => {
      delete window.__mage2PlaytestAutomation;
    };
  });

  useEffect(() => {
    if (selectedInventoryItemId && !snapshot.inventoryItems.some((item) => item.id === selectedInventoryItemId)) {
      selectPlaytestInventoryItem(undefined);
    }
  }, [selectedInventoryItemId, snapshot.inventoryItems]);

  useEffect(() => {
    let cancelled = false;

    async function loadSceneAudioUrl() {
      if (!sceneAudioAsset) {
        setSceneAudioUrl(undefined);
        return;
      }

      const sourcePath = sceneAudioVariant?.proxyPath ?? sceneAudioVariant?.sourcePath;
      if (!sourcePath) {
        setSceneAudioUrl(undefined);
        return;
      }

      const url = await resolveFileUrl(sourcePath);
      if (!cancelled) {
        setSceneAudioUrl(url);
      }
    }

    void loadSceneAudioUrl();
    return () => {
      cancelled = true;
    };
  }, [sceneAudioAsset?.id, sceneAudioVariant?.proxyPath, sceneAudioVariant?.sourcePath]);

  useEffect(() => {
    const audio = sceneAudioRef.current;
    syncSceneAudioToPlayheadRef.current = undefined;
    if (sceneAudioTimeoutRef.current !== undefined) {
      window.clearTimeout(sceneAudioTimeoutRef.current);
      sceneAudioTimeoutRef.current = undefined;
    }
    if (sceneAudioAnimationFrameRef.current !== undefined) {
      window.cancelAnimationFrame(sceneAudioAnimationFrameRef.current);
      sceneAudioAnimationFrameRef.current = undefined;
    }

    if (!audio) {
      return;
    }
    sceneAudioInternalPauseRef.current = false;

    const cancelAnimationFrameSync = () => {
      if (sceneAudioAnimationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(sceneAudioAnimationFrameRef.current);
        sceneAudioAnimationFrameRef.current = undefined;
      }
    };

    const pauseSceneAudio = () => {
      if (audio.paused) {
        return;
      }

      sceneAudioInternalPauseRef.current = true;
      audio.pause();
    };

    if (gameplayPaused) {
      pauseSceneAudio();
      return;
    }

    const clearPlayback = () => {
      if (sceneAudioTimeoutRef.current !== undefined) {
        window.clearTimeout(sceneAudioTimeoutRef.current);
        sceneAudioTimeoutRef.current = undefined;
      }
      cancelAnimationFrameSync();
      pauseSceneAudio();
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
      if (!sceneAudioUrl || sceneAsset?.kind !== "image" || !snapshot.scene.sceneAudioAssetId) {
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
      const playbackDirective = resolveSceneAudioPlaybackDirective(syncState, sceneAudioPlaybackIntentRef.current);
      sceneAudioPhaseRef.current = syncState.phase;

      if (syncState.phase === "waiting") {
        pauseSceneAudio();
        if (Math.abs(audio.currentTime * 1000) > PLAYHEAD_SYNC_TOLERANCE_MS) {
          audio.currentTime = 0;
        }

        if (playbackDirective.shouldScheduleDelayedPlayback) {
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
                // Keep the playtest responsive if autoplay is blocked.
              });
          }, syncState.startDelayMs);
          return;
        }
      }

      if (syncState.phase === "playing" || syncState.phase === "waiting") {
        if (Math.abs(audio.currentTime * 1000 - syncState.targetAudioCurrentTimeMs) > PLAYHEAD_SYNC_TOLERANCE_MS) {
          audio.currentTime = syncState.targetAudioCurrentTimeMs / 1000;
        }

        if (!playbackDirective.shouldPlay) {
          pauseSceneAudio();
          return;
        }

        if (audio.paused) {
          void audio
            .play()
            .then(() => {
              sceneAudioPhaseRef.current = "playing";
              startPlaybackClock();
            })
            .catch(() => {
              // Keep the playtest responsive if autoplay is blocked.
            });
        } else {
          sceneAudioPhaseRef.current = "playing";
          startPlaybackClock();
        }
        return;
      }

      pauseSceneAudio();
      if (Math.abs(audio.currentTime * 1000 - syncState.targetAudioCurrentTimeMs) > PLAYHEAD_SYNC_TOLERANCE_MS) {
        audio.currentTime = syncState.targetAudioCurrentTimeMs / 1000;
      }
      updatePlayheadFromSceneAudio(syncState.effectivePlayheadMs);
    };

    syncSceneAudioToPlayheadRef.current = syncSceneAudioToPlayhead;

    const handlePlay = () => {
      sceneAudioPlaybackIntentRef.current = true;
      sceneAudioInternalPauseRef.current = false;
      sceneAudioPhaseRef.current = "playing";
      startPlaybackClock();
    };

    const handlePause = () => {
      cancelAnimationFrameSync();
      if (sceneAudioInternalPauseRef.current) {
        sceneAudioInternalPauseRef.current = false;
        return;
      }

      sceneAudioPlaybackIntentRef.current = false;
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
    sceneAudioUrl,
    sceneAsset?.kind,
    snapshot.scene.id,
    snapshot.scene.sceneAudioAssetId,
    snapshot.scene.sceneAudioDelayMs,
    snapshot.scene.sceneAudioLoop,
    sceneAudioVariant?.durationMs,
    gameplayPaused
  ]);

  useEffect(() => {
    const syncSceneAudioToPlayhead = syncSceneAudioToPlayheadRef.current;
    if (!syncSceneAudioToPlayhead || !sceneAudioUrl || sceneAsset?.kind !== "image" || !snapshot.scene.sceneAudioAssetId) {
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
  }, [playheadMs, playbackResetKey, sceneAudioUrl, sceneAsset?.kind, snapshot.scene.sceneAudioAssetId]);

  return (
    <div className="panel-grid panel-grid--playtest">
      <section className="panel">
        <div className="panel__toolbar playtest-panel__toolbar">
          <label className="playtest-panel__toolbar-field playtest-panel__toolbar-field--playhead">
            <span className="playtest-panel__toolbar-label">Playhead</span>
            <input
              className="playtest-panel__toolbar-range"
              type="range"
              min={0}
              max={sceneTimelineDurationMs}
              value={Math.min(playheadMs, sceneTimelineDurationMs)}
              title="Scrub through the current scene preview to inspect timing and hotspot visibility."
              onChange={(event) => setPlayheadMs(Number(event.target.value))}
            />
          </label>
          <label className="playtest-panel__toolbar-field playtest-panel__toolbar-field--locale">
            <span className="playtest-panel__toolbar-label">Locale</span>
            <DropdownSelect value={activeLocale} onChange={(event) => setActiveLocale(event.target.value)}>
              {supportedLocales.map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </DropdownSelect>
          </label>
          <div className="playtest-panel__toolbar-field playtest-panel__toolbar-field--action">
            <button
              type="button"
              className="playtest-panel__toolbar-button"
              title="Store the current runtime state in the editor's local playtest save slot."
              onClick={() => {
                const nextSave = controller.save();
                nextSave.playheadMs = playheadMs;
                const serialized = JSON.stringify(nextSave);
                localStorage.setItem(STORAGE_KEY, serialized);
              }}
            >
              Save Slot
            </button>
          </div>
          <div className="playtest-panel__toolbar-field playtest-panel__toolbar-field--action">
            <button
              type="button"
              className="playtest-panel__toolbar-button"
              title="Restore the last runtime state saved in the local playtest slot."
              onClick={() => {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) {
                  return;
                }

                const nextController = createPlayerController(project, JSON.parse(raw));
                setController(nextController);
                const nextSnapshot = nextController.getSnapshot();
                setSnapshot(nextSnapshot);
                setPlayheadMs(nextSnapshot.saveState.playheadMs ?? 0);
                selectPlaytestInventoryItem(undefined);
                setActiveResponse(undefined);
              }}
            >
              Load Slot
            </button>
          </div>
          <div className="playtest-panel__toolbar-field playtest-panel__toolbar-field--session" aria-label="Playtest session controls">
            <button
              type="button"
              className="playtest-panel__toolbar-button playtest-panel__toolbar-button--secondary"
              title="Reset this playtest run to the project's starting scene without changing the saved slot."
              onClick={resetPlaytestRun}
            >
              Reset Run
            </button>
          </div>
          <div className="playtest-panel__toolbar-field playtest-panel__toolbar-field--toggle">
            <label
              className="playtest-hotspot-visibility-toggle playtest-panel__toolbar-toggle"
              title="Show translucent hotspot regions in playtest for debugging. Labels remain hidden so playtest matches runtime."
            >
              <input
                type="checkbox"
                aria-label="Show hotspots in playtest"
                checked={showHotspots}
                onChange={(event) => setShowHotspots(event.target.checked)}
              />
              <span className="playtest-hotspot-visibility-toggle__track" aria-hidden="true">
                <span className="playtest-hotspot-visibility-toggle__thumb" />
              </span>
              <span className="playtest-hotspot-visibility-toggle__label">Show hotspots</span>
            </label>
          </div>
        </div>

        <div className="playtest-stage">
          <PlayerSceneRenderer
            ref={playerRendererRef}
            className="playtest-shared-renderer"
            project={project}
            snapshot={snapshot}
            locale={activeLocale}
            strings={localeStrings}
            visibleHotspots={visibleHotspots}
            playheadMs={playheadMs}
            showHotspots={showHotspots}
            resolveSourcePath={resolveFileUrl}
            bagIconUrl={PLAYTEST_INVENTORY_BAG_ICON_SRC}
            copy={playerCopy}
            selectedInventoryItemId={selectedInventoryItemId}
            onSelectedInventoryItemIdChange={selectPlaytestInventoryItem}
            onHotspotActivate={activatePlaytestHotspot}
            onHotspotEventActivate={activatePlaytestHotspotEvent}
            onPlacedHotspotActivate={(hotspotId) => setLastActivatedHotspotId(hotspotId)}
            onDialogueChoice={(choiceId) => {
              controller.chooseDialogueChoice(choiceId);
              setSnapshot(controller.getSnapshot());
            }}
            onDialogueContinue={() => {
              controller.continueDialogue();
              setSnapshot(controller.getSnapshot());
            }}
            activeResponse={activeResponse}
            onResponseComplete={completeResponse}
            playbackResetKey={playbackResetKey}
            onPlayheadMsChange={sceneAsset?.kind === "video" ? setPlayheadMs : undefined}
            onPlayableDurationMsChange={
              sceneAsset?.kind === "video"
                ? (durationMs) => {
                    setObservedVideoDuration({
                      assetId: sceneAsset.id,
                      sourcePath: sceneAssetSourcePath,
                      durationMs
                    });
                  }
                : undefined
            }
          />
        </div>

        {sceneAudioUrl ? (
          <div className="scene-audio-strip">
            <audio ref={sceneAudioRef} src={sceneAudioUrl} controls preload="metadata" className="asset-preview__audio" />
          </div>
        ) : null}

      </section>

      <aside className="panel">
        <h3>Runtime State</h3>
        <dl className="inspector-grid">
          <dt>Location</dt>
          <dd>{snapshot.location.name}</dd>
          <dt>Scene</dt>
          <dd>{snapshot.scene.name}</dd>
          <dt>Flags</dt>
          <dd>
            <pre>{JSON.stringify(snapshot.flags, null, 2)}</pre>
          </dd>
          <dt>Inventory</dt>
          <dd>{resolvePlaytestInventorySummary(snapshot.inventoryItems, localeStrings)}</dd>
          <dt>Visited Scenes</dt>
          <dd>{snapshot.saveState.visitedSceneIds.join(", ")}</dd>
        </dl>
      </aside>
    </div>
  );
}

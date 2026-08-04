import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPlayerController, resolveSceneTimelineDurationMs, type ActivePlayerResponse } from "@mage2/player";
import {
  DEFAULT_PLAYER_EXPERIENCE_PREFERENCES,
  PlayerExperienceShell,
  PlayerSceneAudio,
  PlayerSceneRenderer,
  resolvePlayerHotspotVisuals,
  resolvePlayerSystemCopy,
  resolvePlayerSceneHotspots,
  type PlayerExperiencePreferences,
  type PlayerExperienceScreen,
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
import { ForegroundMediaPlayer } from "./ForegroundMedia";
import { resolveFileUrl } from "./file-url-cache";
import { useEditorAssetFileUrl } from "./player-asset-url";
import { getLocalizedAssetVariant } from "./localized-project";
import type { EditorAutomationPlaytestState } from "./automation-commands";
import {
  PLAYTEST_SAVE_SLOT_IDS,
  createEmptyPlaytestSaveSlotInspection,
  createPlaytestSaveEnvelope,
  formatPlaytestSaveTimestamp,
  getPlaytestSaveSlotStorageKey,
  readPlaytestSaveSlot,
  resolvePlaytestSaveStatusLabel,
  type PlaytestSaveSlotId,
  type PlaytestSaveSlotInspection,
  type PlaytestSaveStorage
} from "./playtest-save-slots";
import { useEditorStore } from "./store";

interface PlaytestPanelProps {
  project: ProjectBundle;
  onExit?: () => void;
}

const LOCALE_STORAGE_KEY = "mage2-editor-playtest-locale";
const PLAYTEST_INVENTORY_BAG_ICON_SRC = new URL("./assets/playtest-inventory-bag.png", import.meta.url).href;

export function resolvePlaytestPlayerCopy(locale: string) {
  return resolvePlayerSystemCopy(locale);
}

interface PlaytestSaveFeedback {
  tone: "success" | "error";
  message: string;
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
  const [playerScreen, setPlayerScreen] = useState<PlayerExperienceScreen>("game");
  const [playerPreferences, setPlayerPreferences] = useState<PlayerExperiencePreferences>(
    DEFAULT_PLAYER_EXPERIENCE_PREFERENCES
  );
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string>();
  const selectedInventoryItemIdRef = useRef<string | undefined>(undefined);
  const playerRendererRef = useRef<PlayerSceneRendererHandle>(null);
  const [lastActivatedHotspotId, setLastActivatedHotspotId] = useState<string>();
  const [interactionMediaPlayback, setInteractionMediaPlayback] = useState<{ assetId: string; sequence: number }>();
  const interactionMediaSequenceRef = useRef(0);
  const [activeResponse, setActiveResponse] = useState<ActivePlayerResponse>();
  const [saveSlotInspections, setSaveSlotInspections] = useState<PlaytestSaveSlotInspection[]>(() =>
    PLAYTEST_SAVE_SLOT_IDS.map(createEmptyPlaytestSaveSlotInspection)
  );
  const [saveFeedback, setSaveFeedback] = useState<PlaytestSaveFeedback>();
  const supportedLocales = useMemo(
    () => normalizeSupportedLocales(project.manifest.defaultLanguage, project.manifest.supportedLocales),
    [project.manifest.defaultLanguage, project.manifest.supportedLocales]
  );
  const localeStrings = getLocaleStringValues(project, activeLocale);
  const playerCopy = resolvePlaytestPlayerCopy(activeLocale);
  const presentation = project.manifest.playerPresentation;
  const titleAsset = project.assets.assets.find((asset) => asset.id === presentation.titleBackgroundAssetId);
  const logoAsset = project.assets.assets.find((asset) => asset.id === presentation.logoAssetId);
  const iconAsset = project.assets.assets.find((asset) => asset.id === presentation.appIconAssetId);
  const titleBackgroundUrl = useEditorAssetFileUrl(titleAsset, activeLocale);
  const logoUrl = useEditorAssetFileUrl(logoAsset, activeLocale);
  const iconUrl = useEditorAssetFileUrl(iconAsset, activeLocale);

  useEffect(() => {
    const nextController = createPlayerController(project);
    setController(nextController);
    setSnapshot(nextController.getSnapshot());
    setPlayheadMs(0);
    setInteractionMediaPlayback(undefined);
    setActiveResponse(undefined);
    selectPlaytestInventoryItem(undefined);
  }, [project]);

  useEffect(() => {
    refreshPlaytestSaveSlots();
    setSaveFeedback(undefined);
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
        shellMenuOpen ||
        playerScreen === "title" ||
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
  }, [onExit, playerScreen, shellMenuOpen]);

  function resetPlaytestRun() {
    const nextController = createPlayerController(project);
    const nextSnapshot = nextController.getSnapshot();
    setController(nextController);
    setSnapshot(nextSnapshot);
    setPlayheadMs(0);
    setPlaybackResetKey((value) => value + 1);
    selectPlaytestInventoryItem(undefined);
    setLastActivatedHotspotId(undefined);
    setInteractionMediaPlayback(undefined);
    setActiveResponse(undefined);
    return nextSnapshot;
  }

  function refreshPlaytestSaveSlots() {
    const storage = resolveBrowserPlaytestSaveStorage();
    setSaveSlotInspections(PLAYTEST_SAVE_SLOT_IDS.map((slotId) => readPlaytestSaveSlot(storage, project, slotId)));
  }

  function replaceSaveSlotInspection(nextInspection: PlaytestSaveSlotInspection) {
    setSaveSlotInspections((currentInspections) =>
      currentInspections.map((inspection) =>
        inspection.slotId === nextInspection.slotId ? nextInspection : inspection
      )
    );
  }

  function savePlaytestSlot(slotId: PlaytestSaveSlotId) {
    const storage = resolveBrowserPlaytestSaveStorage();
    if (!storage) {
      setSaveFeedback({ tone: "error", message: `Slot ${slotId} could not be saved because local storage is unavailable.` });
      replaceSaveSlotInspection(readPlaytestSaveSlot(storage, project, slotId));
      return;
    }

    try {
      const nextSave = controller.save();
      nextSave.playheadMs = playheadMs;
      const envelope = createPlaytestSaveEnvelope(project, nextSave);
      storage.setItem(getPlaytestSaveSlotStorageKey(slotId), JSON.stringify(envelope));
      const inspection = readPlaytestSaveSlot(storage, project, slotId);
      replaceSaveSlotInspection(inspection);
      setSaveFeedback({
        tone: "success",
        message: `Saved Slot ${slotId} at ${formatPlaytestSaveTimestamp(envelope.savedAt)}.`
      });
    } catch (error) {
      setSaveFeedback({ tone: "error", message: `Slot ${slotId} could not be saved: ${resolvePlaytestSaveError(error)}` });
      replaceSaveSlotInspection(readPlaytestSaveSlot(storage, project, slotId));
    }
  }

  function loadPlaytestSlot(slotId: PlaytestSaveSlotId) {
    const storage = resolveBrowserPlaytestSaveStorage();
    const inspection = readPlaytestSaveSlot(storage, project, slotId);
    replaceSaveSlotInspection(inspection);
    if (inspection.status !== "ready" || !inspection.envelope) {
      setSaveFeedback({
        tone: "error",
        message: `Slot ${slotId} cannot be loaded. ${inspection.message}`
      });
      return;
    }

    try {
      const nextController = createPlayerController(project, inspection.envelope.state);
      const nextSnapshot = nextController.getSnapshot();
      setController(nextController);
      setSnapshot(nextSnapshot);
      setPlayheadMs(nextSnapshot.saveState.playheadMs ?? 0);
      setPlaybackResetKey((value) => value + 1);
      selectPlaytestInventoryItem(undefined);
      setLastActivatedHotspotId(undefined);
      setInteractionMediaPlayback(undefined);
      setActiveResponse(undefined);
      setSaveFeedback({
        tone: "success",
        message: `Loaded Slot ${slotId} from ${formatPlaytestSaveTimestamp(inspection.envelope.savedAt)}.`
      });
    } catch (error) {
      setSaveFeedback({ tone: "error", message: `Slot ${slotId} could not be loaded safely: ${resolvePlaytestSaveError(error)}` });
    }
  }

  function clearPlaytestSlot(slotId: PlaytestSaveSlotId) {
    const storage = resolveBrowserPlaytestSaveStorage();
    if (!storage) {
      setSaveFeedback({ tone: "error", message: `Slot ${slotId} could not be cleared because local storage is unavailable.` });
      return;
    }

    try {
      storage.removeItem(getPlaytestSaveSlotStorageKey(slotId));
      replaceSaveSlotInspection(createEmptyPlaytestSaveSlotInspection(slotId));
      setSaveFeedback({ tone: "success", message: `Cleared Slot ${slotId}.` });
    } catch (error) {
      setSaveFeedback({ tone: "error", message: `Slot ${slotId} could not be cleared: ${resolvePlaytestSaveError(error)}` });
      replaceSaveSlotInspection(readPlaytestSaveSlot(storage, project, slotId));
    }
  }

  function selectPlaytestInventoryItem(itemId: string | undefined) {
    selectedInventoryItemIdRef.current = itemId;
    setSelectedInventoryItemId(itemId);
  }

  function activatePlaytestHotspot(hotspotId: string) {
    const activeSelectedInventoryItemId = selectedInventoryItemIdRef.current;
    setLastActivatedHotspotId(hotspotId);
    const resolution = controller.selectHotspot(hotspotId, playheadMs, sceneTimelineDurationMs);
    if (resolution.mediaAssetId) {
      interactionMediaSequenceRef.current += 1;
      setInteractionMediaPlayback({ assetId: resolution.mediaAssetId, sequence: interactionMediaSequenceRef.current });
    } else {
      setInteractionMediaPlayback(undefined);
    }
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
  const dialogueMediaAssetId = snapshot.activeDialogue?.node.mediaAssetId;
  const foregroundMediaAssetId = dialogueMediaAssetId ?? interactionMediaPlayback?.assetId;
  const foregroundMediaAsset = foregroundMediaAssetId
    ? project.assets.assets.find((asset) => asset.id === foregroundMediaAssetId)
    : undefined;
  const foregroundMediaPlaybackKey = dialogueMediaAssetId
    ? `dialogue:${snapshot.activeDialogue?.tree.id}:${snapshot.activeDialogue?.node.id}:${activeLocale}`
    : interactionMediaPlayback
      ? `interaction:${interactionMediaPlayback.sequence}:${activeLocale}`
      : undefined;

  useEffect(() => {
    if (dialogueMediaAssetId) {
      setInteractionMediaPlayback(undefined);
    }
  }, [dialogueMediaAssetId]);
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
  const gameplayPaused = activeResponse?.entry.kind === "video" || shellMenuOpen || playerScreen === "title";
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

  const preferredLoadSlotId = saveSlotInspections.find((slot) => slot.status === "ready")?.slotId;

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
          <div className="playtest-panel__toolbar-field playtest-panel__toolbar-field--session" aria-label="Playtest session controls">
            <button
              type="button"
              className="playtest-panel__toolbar-button playtest-panel__toolbar-button--secondary"
              title="Preview the creator-configured title screen and player menu used by exported builds."
              onClick={() => setPlayerScreen("title")}
            >
              Title Screen
            </button>
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

        <section className="playtest-save-slots" aria-labelledby="playtest-save-slots-title">
          <header className="playtest-save-slots__header">
            <div>
              <h3 id="playtest-save-slots-title">Save slots</h3>
              <p>Stored on this computer and checked against the open project before loading.</p>
            </div>
            {saveFeedback ? (
              <div
                className={`playtest-save-slots__feedback playtest-save-slots__feedback--${saveFeedback.tone}`}
                role={saveFeedback.tone === "error" ? "alert" : "status"}
                aria-live={saveFeedback.tone === "error" ? "assertive" : "polite"}
                data-playtest-save-feedback={saveFeedback.tone}
              >
                {saveFeedback.message}
              </div>
            ) : null}
          </header>
          <div className="playtest-save-slots__grid">
            {saveSlotInspections.map((slot) => {
              const statusLabel = resolvePlaytestSaveStatusLabel(slot.status);
              const canLoad = slot.status === "ready";
              const canClear = slot.status !== "empty" && slot.status !== "unavailable";
              const canSave = slot.status !== "unavailable";

              return (
                <article
                  key={slot.slotId}
                  className={`playtest-save-slot playtest-save-slot--${slot.status}`}
                  data-playtest-save-slot={slot.slotId}
                  data-playtest-save-slot-status={slot.status}
                >
                  <div className="playtest-save-slot__summary">
                    <strong>Slot {slot.slotId}</strong>
                    <span className={`playtest-save-slot__status playtest-save-slot__status--${slot.status}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <p className="playtest-save-slot__timestamp">
                    {slot.savedAt ? formatPlaytestSaveTimestamp(slot.savedAt) : slot.status === "empty" ? "Available" : "Not loadable"}
                  </p>
                  <p className="playtest-save-slot__detail" title={slot.message}>{slot.message}</p>
                  <div className="playtest-save-slot__actions">
                    <button
                      type="button"
                      className="playtest-save-slot__save"
                      disabled={!canSave}
                      data-playtest-save-action="save"
                      onClick={() => savePlaytestSlot(slot.slotId)}
                      title={canSave ? `Save the current run to Slot ${slot.slotId}.` : slot.message}
                    >
                      {slot.status === "empty" ? "Save" : "Overwrite"}
                    </button>
                    <button
                      type="button"
                      className="playtest-save-slot__load"
                      disabled={!canLoad}
                      data-playtest-save-action="load"
                      onClick={() => loadPlaytestSlot(slot.slotId)}
                      title={canLoad ? `Load Slot ${slot.slotId}.` : slot.message}
                    >
                      Load
                    </button>
                    {canClear ? (
                      <button
                        type="button"
                        className="playtest-save-slot__clear"
                        data-playtest-save-action="clear"
                        onClick={() => clearPlaytestSlot(slot.slotId)}
                        title={`Clear Slot ${slot.slotId}.`}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <div className="playtest-stage">
          <PlayerExperienceShell
            projectName={project.manifest.projectName}
            gameVersion={project.manifest.gameVersion}
            presentation={presentation}
            screen={playerScreen}
            onScreenChange={setPlayerScreen}
            locale={activeLocale}
            supportedLocales={supportedLocales}
            localeStrings={localeStrings}
            onLocaleChange={setActiveLocale}
            preferences={playerPreferences}
            onPreferencesChange={setPlayerPreferences}
            hasSavedGame={Boolean(preferredLoadSlotId)}
            onContinue={() => {
              if (preferredLoadSlotId) {
                loadPlaytestSlot(preferredLoadSlotId);
              }
            }}
            onNewGame={() => {
              resetPlaytestRun();
            }}
            onSave={() => savePlaytestSlot(1)}
            onLoad={preferredLoadSlotId ? () => loadPlaytestSlot(preferredLoadSlotId) : undefined}
            onQuit={onExit}
            titleBackgroundUrl={titleBackgroundUrl}
            logoUrl={logoUrl}
            iconUrl={iconUrl}
            onMenuOpenChange={setShellMenuOpen}
          >
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
            volume={playerPreferences.volume}
            paused={gameplayPaused}
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
          {foregroundMediaAsset && foregroundMediaPlaybackKey ? (
            <ForegroundMediaPlayer
              key={foregroundMediaPlaybackKey}
              asset={foregroundMediaAsset}
              locale={activeLocale}
              label={dialogueMediaAssetId ? "Dialogue media" : "Interaction media"}
              className="foreground-media-player--playtest"
              volume={playerPreferences.volume}
              onDismiss={dialogueMediaAssetId ? undefined : () => setInteractionMediaPlayback(undefined)}
            />
          ) : null}
          </PlayerExperienceShell>
        </div>

        <PlayerSceneAudio
          sourcePath={sceneAudioVariant?.proxyPath ?? sceneAudioVariant?.sourcePath}
          resolveSourcePath={resolveFileUrl}
          sceneKey={snapshot.scene.id}
          assetId={snapshot.scene.sceneAudioAssetId}
          enabled={sceneAsset?.kind === "image" && Boolean(snapshot.scene.sceneAudioAssetId)}
          playheadMs={playheadMs}
          delayMs={snapshot.scene.sceneAudioDelayMs}
          loop={snapshot.scene.sceneAudioLoop}
          durationMs={sceneAudioVariant?.durationMs}
          paused={gameplayPaused}
          volume={playerPreferences.volume}
          playbackResetKey={playbackResetKey}
          onPlayheadMsChange={setPlayheadMs}
        />

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


function resolveBrowserPlaytestSaveStorage(): PlaytestSaveStorage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function resolvePlaytestSaveError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

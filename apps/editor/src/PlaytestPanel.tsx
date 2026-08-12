import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPlayerController,
  resolveSceneTimelineDurationMs,
  type ActivePlayerResponse,
  type ConditionEvaluation,
  type HotspotAvailabilityExplanation,
  type LogicTraceEntry,
  type PlayerRuntimeIssue,
  type PlayerSnapshot
} from "@mage2/player";
import {
  DEFAULT_PLAYER_EXPERIENCE_PREFERENCES,
  PlayerExperienceShell,
  PlayerSceneRenderer,
  resolvePlayerHotspotVisuals,
  resolvePlayerSystemCopy,
  resolvePlayerSceneHotspots,
  type PlayerExperiencePreferences,
  type PlayerExperienceScreen,
  type PlayerSceneRendererHandle
} from "@mage2/player-ui";
import {
  collectPlayerUiOverrides,
  getLocaleStringValues,
  normalizeSupportedLocales,
  type Asset,
  type BuiltInLocale,
  type InventoryItem,
  type ProjectBundle
} from "@mage2/schema";
import { DropdownSelect } from "./DropdownSelect";
import { ForegroundMediaPlayer } from "./ForegroundMedia";
import { resolveFileUrl } from "./file-url-cache";
import { useEditorAssetFileUrl } from "./player-asset-url";
import { getLocalizedAssetVariant } from "./localized-project";
import { useEditorI18n, type EditorTranslator } from "./i18n";
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
import "./PlaytestDiagnostics.css";

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

type PlaytestCompactView = "player" | "diagnostics";

export function resolvePlaytestInventorySummary(
  items: Array<Pick<InventoryItem, "name" | "textId">>,
  strings: Record<string, string>,
  emptyLabel = "Empty"
): string {
  const labels = items
    .map((item) => strings[item.textId] ?? item.name ?? item.textId)
    .filter((label) => label.length > 0);

  return labels.join(", ") || emptyLabel;
}

export function resolveStoredPlaytestLocale(
  storedLocale: string | null,
  supportedLocales: readonly string[],
  fallbackLocale: string
): string {
  return storedLocale && supportedLocales.includes(storedLocale) ? storedLocale : fallbackLocale;
}

export function resolvePlaytestLocaleStrings(project: ProjectBundle, locale: string): Record<string, string> {
  return {
    ...getLocaleStringValues(project, project.manifest.defaultLanguage),
    ...getLocaleStringValues(project, locale)
  };
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
  const { locale: editorLocale, t } = useEditorI18n();
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
  const [compactView, setCompactView] = useState<PlaytestCompactView>("player");
  const [playerScreen, setPlayerScreen] = useState<PlayerExperienceScreen>("game");
  const [playerPreferences, setPlayerPreferences] = useState<PlayerExperiencePreferences>(
    DEFAULT_PLAYER_EXPERIENCE_PREFERENCES
  );
  const [interfaceLocalePreference, setInterfaceLocalePreference] = useState<"automatic" | BuiltInLocale>("automatic");
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string>();
  const selectedInventoryItemIdRef = useRef<string | undefined>(undefined);
  const playerRendererRef = useRef<PlayerSceneRendererHandle>(null);
  const [lastActivatedHotspotId, setLastActivatedHotspotId] = useState<string>();
  const [interactionMediaPlayback, setInteractionMediaPlayback] = useState<{ assetId: string; sequence: number }>();
  const interactionMediaSequenceRef = useRef(0);
  const [activeResponse, setActiveResponse] = useState<ActivePlayerResponse>();
  const [saveSlotInspections, setSaveSlotInspections] = useState<PlaytestSaveSlotInspection[]>(() =>
    PLAYTEST_SAVE_SLOT_IDS.map((slotId) => createEmptyPlaytestSaveSlotInspection(slotId, t))
  );
  const [saveFeedback, setSaveFeedback] = useState<PlaytestSaveFeedback>();
  const supportedLocales = useMemo(
    () => normalizeSupportedLocales(project.manifest.defaultLanguage, project.manifest.supportedLocales),
    [project.manifest.defaultLanguage, project.manifest.supportedLocales]
  );
  const contentLocale = supportedLocales.includes(activeLocale) ? activeLocale : project.manifest.defaultLanguage;
  const interfaceLocale = interfaceLocalePreference === "automatic" ? editorLocale : interfaceLocalePreference;
  const localeStrings = resolvePlaytestLocaleStrings(project, contentLocale);
  const playerCopy = resolvePlaytestPlayerCopy(interfaceLocale);
  const playerUiOverrides = collectPlayerUiOverrides(project);
  const presentation = project.manifest.playerPresentation;
  const titleAsset = project.assets.assets.find((asset) => asset.id === presentation.titleBackgroundAssetId);
  const logoAsset = project.assets.assets.find((asset) => asset.id === presentation.logoAssetId);
  const iconAsset = project.assets.assets.find((asset) => asset.id === presentation.appIconAssetId);
  const titleBackgroundUrl = useEditorAssetFileUrl(titleAsset, contentLocale);
  const logoUrl = useEditorAssetFileUrl(logoAsset, contentLocale);
  const iconUrl = useEditorAssetFileUrl(iconAsset, contentLocale);

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
  }, [project, t]);

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
    localStorage.setItem(LOCALE_STORAGE_KEY, contentLocale);
  }, [contentLocale]);

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
    setSaveSlotInspections(PLAYTEST_SAVE_SLOT_IDS.map((slotId) => readPlaytestSaveSlot(storage, project, slotId, t)));
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
      setSaveFeedback({ tone: "error", message: t("Slot {slotId} could not be saved because local storage is unavailable.", { slotId }) });
      replaceSaveSlotInspection(readPlaytestSaveSlot(storage, project, slotId, t));
      return;
    }

    try {
      const nextSave = controller.save();
      nextSave.playheadMs = playheadMs;
      const envelope = createPlaytestSaveEnvelope(project, nextSave);
      storage.setItem(getPlaytestSaveSlotStorageKey(slotId), JSON.stringify(envelope));
      const inspection = readPlaytestSaveSlot(storage, project, slotId, t);
      replaceSaveSlotInspection(inspection);
      setSaveFeedback({
        tone: "success",
        message: t("Saved Slot {slotId} at {time}.", { slotId, time: formatPlaytestSaveTimestamp(envelope.savedAt, editorLocale, t) })
      });
    } catch (error) {
      setSaveFeedback({ tone: "error", message: t("Slot {slotId} could not be saved: {message}", { slotId, message: resolvePlaytestSaveError(error) }) });
      replaceSaveSlotInspection(readPlaytestSaveSlot(storage, project, slotId, t));
    }
  }

  function loadPlaytestSlot(slotId: PlaytestSaveSlotId) {
    const storage = resolveBrowserPlaytestSaveStorage();
    const inspection = readPlaytestSaveSlot(storage, project, slotId, t);
    replaceSaveSlotInspection(inspection);
    if (inspection.status !== "ready" || !inspection.envelope) {
      setSaveFeedback({
        tone: "error",
        message: t("Slot {slotId} cannot be loaded. {message}", { slotId, message: inspection.message })
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
        message: t("Loaded Slot {slotId} from {time}.", { slotId, time: formatPlaytestSaveTimestamp(inspection.envelope.savedAt, editorLocale, t) })
      });
    } catch (error) {
      setSaveFeedback({ tone: "error", message: t("Slot {slotId} could not be loaded safely: {message}", { slotId, message: resolvePlaytestSaveError(error) }) });
    }
  }

  function clearPlaytestSlot(slotId: PlaytestSaveSlotId) {
    const storage = resolveBrowserPlaytestSaveStorage();
    if (!storage) {
      setSaveFeedback({ tone: "error", message: t("Slot {slotId} could not be cleared because local storage is unavailable.", { slotId }) });
      return;
    }

    try {
      storage.removeItem(getPlaytestSaveSlotStorageKey(slotId));
      replaceSaveSlotInspection(createEmptyPlaytestSaveSlotInspection(slotId, t));
      setSaveFeedback({ tone: "success", message: t("Cleared Slot {slotId}.", { slotId }) });
    } catch (error) {
      setSaveFeedback({ tone: "error", message: t("Slot {slotId} could not be cleared: {message}", { slotId, message: resolvePlaytestSaveError(error) }) });
      replaceSaveSlotInspection(readPlaytestSaveSlot(storage, project, slotId, t));
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
  const sceneAssetVariant = getLocalizedAssetVariant(sceneAsset, contentLocale);
  const sceneAudioAsset = snapshot.scene.sceneAudioAssetId
    ? project.assets.assets.find((asset) => asset.id === snapshot.scene.sceneAudioAssetId)
    : undefined;
  const sceneAudioVariant = getLocalizedAssetVariant(sceneAudioAsset, contentLocale);
  const dialogueMediaAssetId = snapshot.activeDialogue?.node.mediaAssetId;
  const foregroundMediaAssetId = dialogueMediaAssetId ?? interactionMediaPlayback?.assetId;
  const foregroundMediaAsset = foregroundMediaAssetId
    ? project.assets.assets.find((asset) => asset.id === foregroundMediaAssetId)
    : undefined;
  const foregroundMediaPlaybackKey = dialogueMediaAssetId
    ? `dialogue:${snapshot.activeDialogue?.tree.id}:${snapshot.activeDialogue?.node.id}:${contentLocale}`
    : interactionMediaPlayback
      ? `interaction:${interactionMediaPlayback.sequence}:${contentLocale}`
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
    locale: contentLocale,
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
          throw new Error(t("Inventory item '{itemId}' is not currently available in playtest.", { itemId }));
        }

        playerRendererRef.current?.selectInventoryItem(itemId);
        return resolvePlaytestAutomationState();
      },
      assertPlacedItemVisible: (hotspotId: string, itemId: string) => {
        const state = resolvePlaytestAutomationState();
        if (state.placedVisuals[hotspotId] !== itemId) {
          throw new Error(t("Expected '{itemId}' to be visibly placed on hotspot '{hotspotId}'.", { itemId, hotspotId }));
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
  const hotspotAvailability = controller.explainHotspotAvailability(playheadMs, sceneTimelineDurationMs);
  const logicTrace = controller.getLogicTrace();

  return (
    <div className={`panel-grid panel-grid--playtest panel-grid--playtest-${compactView}`}>
      <nav className="playtest-compact-switcher" aria-label={t("Playtest")}>
        <button
          type="button"
          className={compactView === "player" ? "playtest-compact-switcher__button playtest-compact-switcher__button--active" : "playtest-compact-switcher__button"}
          aria-controls="playtest-player-pane"
          aria-pressed={compactView === "player"}
          onClick={() => setCompactView("player")}
        >
          {t("Player")}
        </button>
        <button
          type="button"
          className={compactView === "diagnostics" ? "playtest-compact-switcher__button playtest-compact-switcher__button--active" : "playtest-compact-switcher__button"}
          aria-controls="playtest-diagnostics-pane"
          aria-pressed={compactView === "diagnostics"}
          onClick={() => setCompactView("diagnostics")}
        >
          {t("Playtest diagnostics")}
        </button>
      </nav>
      <section id="playtest-player-pane" className="panel playtest-primary">
        <div className="panel__toolbar playtest-panel__toolbar">
          <label className="playtest-panel__toolbar-field playtest-panel__toolbar-field--playhead">
            <span className="playtest-panel__toolbar-label">{t("Playhead")}</span>
            <input
              className="playtest-panel__toolbar-range"
              type="range"
              min={0}
              max={sceneTimelineDurationMs}
              value={Math.min(playheadMs, sceneTimelineDurationMs)}
              title={t("Scrub through the current scene preview to inspect timing and hotspot visibility.")}
              onChange={(event) => setPlayheadMs(Number(event.target.value))}
            />
          </label>
          <label className="playtest-panel__toolbar-field playtest-panel__toolbar-field--locale">
            <span className="playtest-panel__toolbar-label">{t("Game locale")}</span>
            <DropdownSelect value={contentLocale} onChange={(event) => setActiveLocale(event.target.value)}>
              {supportedLocales.map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </DropdownSelect>
          </label>
          <div className="playtest-panel__toolbar-field playtest-panel__toolbar-field--session" aria-label={t("Playtest session controls")}>
            <button
              type="button"
              className="playtest-panel__toolbar-button playtest-panel__toolbar-button--secondary"
              title={t("Preview the creator-configured title screen and player menu used by exported builds.")}
              onClick={() => setPlayerScreen("title")}
            >
              {t("Title Screen")}
            </button>
            <button
              type="button"
              className="playtest-panel__toolbar-button playtest-panel__toolbar-button--secondary"
              title={t("Reset this playtest run to the project's starting scene without changing the saved slot.")}
              onClick={resetPlaytestRun}
            >
              {t("Reset Run")}
            </button>
          </div>
          <div className="playtest-panel__toolbar-field playtest-panel__toolbar-field--toggle">
            <label
              className="playtest-hotspot-visibility-toggle playtest-panel__toolbar-toggle"
              title={t("Show translucent hotspot regions in playtest for debugging. Labels remain hidden so playtest matches runtime.")}
            >
              <input
                type="checkbox"
                aria-label={t("Show hotspots in playtest")}
                checked={showHotspots}
                onChange={(event) => setShowHotspots(event.target.checked)}
              />
              <span className="playtest-hotspot-visibility-toggle__track" aria-hidden="true">
                <span className="playtest-hotspot-visibility-toggle__thumb" />
              </span>
              <span className="playtest-hotspot-visibility-toggle__label">{t("Show hotspots")}</span>
            </label>
          </div>
        </div>

        <section className="playtest-save-slots" aria-labelledby="playtest-save-slots-title">
          <header className="playtest-save-slots__header">
            <div>
              <h3 id="playtest-save-slots-title">{t("Save slots")}</h3>
              <p>{t("Stored on this computer and checked against the open project before loading.")}</p>
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
              const statusLabel = resolvePlaytestSaveStatusLabel(slot.status, t);
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
                    <strong>{t("Slot {slotId}", { slotId: slot.slotId })}</strong>
                    <span className={`playtest-save-slot__status playtest-save-slot__status--${slot.status}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <p className="playtest-save-slot__timestamp">
                    {slot.savedAt
                      ? formatPlaytestSaveTimestamp(slot.savedAt, editorLocale, t)
                      : slot.status === "empty"
                        ? t("Available")
                        : t("Not loadable")}
                  </p>
                  <p className="playtest-save-slot__detail" title={slot.message}>{slot.message}</p>
                  <div className="playtest-save-slot__actions">
                    <button
                      type="button"
                      className="playtest-save-slot__save"
                      disabled={!canSave}
                      data-playtest-save-action="save"
                      onClick={() => savePlaytestSlot(slot.slotId)}
                      title={canSave ? t("Save the current run to Slot {slotId}.", { slotId: slot.slotId }) : slot.message}
                    >
                      {slot.status === "empty" ? t("Save") : t("Overwrite")}
                    </button>
                    <button
                      type="button"
                      className="playtest-save-slot__load"
                      disabled={!canLoad}
                      data-playtest-save-action="load"
                      onClick={() => loadPlaytestSlot(slot.slotId)}
                      title={canLoad ? t("Load Slot {slotId}.", { slotId: slot.slotId }) : slot.message}
                    >
                      {t("Load")}
                    </button>
                    {canClear ? (
                      <button
                        type="button"
                        className="playtest-save-slot__clear"
                        data-playtest-save-action="clear"
                        onClick={() => clearPlaytestSlot(slot.slotId)}
                        title={t("Clear Slot {slotId}.", { slotId: slot.slotId })}
                      >
                        {t("Clear")}
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
            onGameplayStartRequest={() => playerRendererRef.current?.resumeSceneMedia()}
            locale={contentLocale}
            supportedLocales={supportedLocales}
            localeStrings={localeStrings}
            onLocaleChange={setActiveLocale}
            interfaceLocale={interfaceLocale}
            interfaceLocalePreference={interfaceLocalePreference}
            onInterfaceLocalePreferenceChange={setInterfaceLocalePreference}
            playerUiOverrides={playerUiOverrides}
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
            locale={contentLocale}
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
            onPlayheadMsChange={setPlayheadMs}
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
            onSceneMediaEnd={() => {
              const completedSceneId = snapshot.scene.id;
              const resolution = controller.completeSceneMedia();
              applyPlayerResponseResolution(resolution);
              const nextSnapshot = controller.getSnapshot();
              setSnapshot(nextSnapshot);
              if (nextSnapshot.scene.id !== completedSceneId) {
                setPlayheadMs(0);
              }
            }}
          />
          {foregroundMediaAsset && foregroundMediaPlaybackKey ? (
            <ForegroundMediaPlayer
              key={foregroundMediaPlaybackKey}
              asset={foregroundMediaAsset}
              locale={contentLocale}
              label={dialogueMediaAssetId ? t("Dialogue media") : t("Interaction media")}
              className="foreground-media-player--playtest"
              volume={playerPreferences.volume}
              onDismiss={dialogueMediaAssetId ? undefined : () => setInteractionMediaPlayback(undefined)}
            />
          ) : null}
          </PlayerExperienceShell>
        </div>

      </section>

      <PlaytestDiagnostics
        project={project}
        snapshot={snapshot}
        hotspotAvailability={hotspotAvailability}
        logicTrace={logicTrace}
        runtimeIssues={controller.getRuntimeIssues()}
        localeStrings={localeStrings}
        onClearTrace={() => {
          controller.clearLogicTrace();
          setSnapshot(controller.getSnapshot());
        }}
      />
    </div>
  );
}

function PlaytestDiagnostics({
  project,
  snapshot,
  hotspotAvailability,
  logicTrace,
  runtimeIssues,
  localeStrings,
  onClearTrace
}: {
  project: ProjectBundle;
  snapshot: PlayerSnapshot;
  hotspotAvailability: HotspotAvailabilityExplanation[];
  logicTrace: LogicTraceEntry[];
  runtimeIssues: PlayerRuntimeIssue[];
  localeStrings: Record<string, string>;
  onClearTrace: () => void;
}) {
  const { t } = useEditorI18n();
  const recentTrace = logicTrace.slice(-12);
  return (
    <aside id="playtest-diagnostics-pane" className="panel playtest-diagnostics" aria-label={t("Playtest diagnostics")}>
      <header className="playtest-diagnostics__header">
        <div>
          <h3>{t("Playtest diagnostics")}</h3>
          <p>{t("Author-only state and rule explanations. These are never shown in exported games.")}</p>
        </div>
      </header>

      <section className="playtest-diagnostics__context" aria-label={t("Current context")}>
        <div><span>{t("Location")}</span><strong>{snapshot.location.name}</strong></div>
        <div><span>{t("Scene")}</span><strong>{snapshot.scene.name}</strong></div>
        <div>
          <span>{t("Inventory")}</span>
          <strong>{resolvePlaytestInventorySummary(snapshot.inventoryItems, localeStrings, t("Empty"))}</strong>
        </div>
      </section>

      {runtimeIssues.length > 0 ? (
        <section className="playtest-diagnostics__section playtest-diagnostics__section--warning">
          <h4>{t("Runtime warnings")}</h4>
          {runtimeIssues.map((issue, index) => <p key={`${issue.code}:${index}`}>{issue.message}</p>)}
        </section>
      ) : null}

      <section className="playtest-diagnostics__section">
        <header><h4>{t("Variables")}</h4><span>{project.manifest.variables.length}</span></header>
        {project.manifest.variables.length > 0 ? (
          <dl className="playtest-variable-list">
            {project.manifest.variables.map((variable) => (
              <div key={variable.id}>
                <dt>
                  <span>{variable.name}</span>
                  {variable.system ? <small>{t("managed")}</small> : null}
                </dt>
                <dd>{formatPlaytestVariableValue(variable, snapshot.variables[variable.id] ?? variable.initialValue, t)}</dd>
              </div>
            ))}
          </dl>
        ) : <p className="playtest-diagnostics__empty">{t("No variables in this project.")}</p>}
      </section>

      <section className="playtest-diagnostics__section">
        <header>
          <h4>{t("Hotspot availability")}</h4>
          <span>{hotspotAvailability.filter((entry) => entry.available).length}/{hotspotAvailability.length}</span>
        </header>
        {hotspotAvailability.length > 0 ? (
          <div className="playtest-hotspot-diagnostics">
            {hotspotAvailability.map((entry) => (
              <article key={entry.hotspotId} className={entry.available ? "playtest-hotspot-check playtest-hotspot-check--available" : "playtest-hotspot-check"}>
                <header>
                  <strong>{entry.hotspotName}</strong>
                  <span>{entry.available ? t("Available") : t("Blocked")}</span>
                </header>
                {!entry.available ? (
                  <ul>
                    {!entry.timing.passed ? (
                      <li>{t("Outside its timing window: now {current}, active {start} to {end}.", {
                        current: formatDiagnosticTime(entry.timing.currentMs),
                        start: formatDiagnosticTime(entry.timing.startMs),
                        end: formatDiagnosticTime(entry.timing.endMs)
                      })}</li>
                    ) : null}
                    {entry.placementItem && !entry.placementItem.present ? (
                      <li>{t("Missing inventory item: {name}.", {
                        name: project.inventory.items.find((candidate) => candidate.id === entry.placementItem?.itemId)?.name
                          ?? entry.placementItem.itemId
                      })}</li>
                    ) : null}
                    {entry.conditions.filter((condition) => !condition.passed).map((condition, index) => (
                      <li key={index}>{formatConditionEvaluation(condition, project, t)}</li>
                    ))}
                  </ul>
                ) : <p>{t("Timing, inventory, and conditions all pass.")}</p>}
              </article>
            ))}
          </div>
        ) : <p className="playtest-diagnostics__empty">{t("This scene has no hotspots.")}</p>}
      </section>

      <section className="playtest-diagnostics__section">
        <header>
          <div className="playtest-diagnostics__section-heading">
            <h4>{t("Execution order")}</h4>
            <span>{t("Oldest first")}</span>
          </div>
          {logicTrace.length > 0 ? <button type="button" onClick={onClearTrace}>{t("Clear")}</button> : null}
        </header>
        {recentTrace.length > 0 ? (
          <ol className="playtest-trace-list">
            {recentTrace.map((entry) => (
              <li key={entry.sequence}>
                <span className={entry.applied ? "playtest-trace-list__status playtest-trace-list__status--applied" : "playtest-trace-list__status"} aria-hidden="true" />
                <div>
                  <strong>{formatLogicTraceEffect(entry, project, t)}</strong>
                  <small>{formatLogicTraceSource(entry, project, t)}</small>
                </div>
              </li>
            ))}
          </ol>
        ) : <p className="playtest-diagnostics__empty">{t("Actions will appear here as you play.")}</p>}
      </section>
    </aside>
  );
}

function formatPlaytestVariableValue(
  variable: ProjectBundle["manifest"]["variables"][number],
  value: boolean | number | string,
  t: EditorTranslator
): string {
  if (variable.type === "boolean") return value === true ? t("Yes") : t("No");
  if (variable.type === "choice") {
    return variable.options.find((option) => option.id === value)?.name ?? String(value);
  }
  return String(value);
}

function formatConditionEvaluation(
  evaluation: ConditionEvaluation,
  project: ProjectBundle,
  t: EditorTranslator
): string {
  const condition = evaluation.condition;
  if (condition.type === "variableCompare") {
    const variable = project.manifest.variables.find((entry) => entry.id === condition.variableId);
    const variableName = variable?.name ?? condition.variableId;
    const expected = variable
      ? formatPlaytestVariableValue(variable, condition.value, t)
      : String(condition.value);
    const actual = variable && evaluation.actualValue !== undefined
      ? formatPlaytestVariableValue(variable, evaluation.actualValue, t)
      : String(evaluation.actualValue ?? t("missing"));
    return t("{name} {operator} {expected}; currently {actual}.", {
      name: variableName,
      operator: formatDiagnosticOperator(condition.operator, t),
      expected,
      actual
    });
  }
  if (condition.type === "inventoryHas") {
    const itemName = project.inventory.items.find((entry) => entry.id === condition.itemId)?.name ?? condition.itemId;
    return condition.present === false
      ? t("Inventory must not contain {name}.", { name: itemName })
      : t("Inventory must contain {name}.", { name: itemName });
  }
  if (condition.type === "sceneVisited") {
    const sceneName = project.scenes.items.find((entry) => entry.id === condition.sceneId)?.name ?? condition.sceneId;
    return condition.visited === false
      ? t("Scene must not have been visited: {name}.", { name: sceneName })
      : t("Scene must have been visited: {name}.", { name: sceneName });
  }
  return t("Condition did not pass.");
}

function formatDiagnosticOperator(
  operator: Extract<ConditionEvaluation["condition"], { type: "variableCompare" }>["operator"],
  t: EditorTranslator
): string {
  switch (operator) {
    case "equals": return t("must be");
    case "notEquals": return t("must not be");
    case "greaterThan": return t("must be greater than");
    case "greaterThanOrEqual": return t("must be at least");
    case "lessThan": return t("must be less than");
    case "lessThanOrEqual": return t("must be at most");
  }
}

function formatLogicTraceEffect(entry: LogicTraceEntry, project: ProjectBundle, t: EditorTranslator): string {
  const effect = entry.effect;
  if (effect.type === "setVariable" || effect.type === "changeVariable") {
    const variable = project.manifest.variables.find((candidate) => candidate.id === effect.variableId);
    const name = variable?.name ?? effect.variableId;
    const previous = variable && entry.previousValue !== undefined
      ? formatPlaytestVariableValue(variable, entry.previousValue, t)
      : String(entry.previousValue ?? t("missing"));
    const next = variable && entry.nextValue !== undefined
      ? formatPlaytestVariableValue(variable, entry.nextValue, t)
      : String(entry.nextValue ?? t("missing"));
    return entry.applied
      ? t("{name}: {previous} → {next}", { name, previous, next })
      : t("Could not change {name}", { name });
  }
  if (effect.type === "addItem" || effect.type === "removeItem") {
    const name = project.inventory.items.find((candidate) => candidate.id === effect.itemId)?.name ?? effect.itemId;
    if (!entry.applied) return t("Could not remove {name}; it was not in inventory.", { name });
    return effect.type === "addItem"
      ? t("Added {name} to inventory", { name })
      : t("Removed {name} from inventory", { name });
  }
  if (effect.type === "goToScene") {
    const name = project.scenes.items.find((candidate) => candidate.id === effect.sceneId)?.name ?? effect.sceneId;
    return entry.applied ? t("Go to {name}", { name }) : t("Already in {name}", { name });
  }
  if (effect.type === "conditional") {
    return entry.branch === "then"
      ? t("Decision: Then branch")
      : t("Decision: Else branch");
  }
  const name = project.dialogues.items.find((candidate) => candidate.id === effect.dialogueTreeId)?.name ?? effect.dialogueTreeId;
  return t("Start dialogue: {name}", { name });
}

function formatLogicTraceSource(entry: LogicTraceEntry, project: ProjectBundle, t: EditorTranslator): string {
  const id = entry.source.entityId;
  switch (entry.source.kind) {
    case "sceneEnter":
      return t("On entering {name}", { name: project.scenes.items.find((scene) => scene.id === id)?.name ?? id });
    case "sceneExit":
      return t("On leaving {name}", { name: project.scenes.items.find((scene) => scene.id === id)?.name ?? id });
    case "sceneMediaEnd":
      return t("When media ends in {name}", { name: project.scenes.items.find((scene) => scene.id === id)?.name ?? id });
    case "hotspot":
    case "hotspotClick":
    case "hotspotOtherItem": {
      const hotspot = project.scenes.items.flatMap((scene) => scene.hotspots).find((candidate) => candidate.id === id);
      return t("From hotspot {name}", { name: hotspot?.name ?? id });
    }
    case "dialogueNode":
      return t("From dialogue line {id}", { id });
    case "dialogueChoice":
      return t("From dialogue choice {id}", { id });
  }
}

function formatDiagnosticTime(timeMs: number): string {
  return `${(Math.max(0, timeMs) / 1000).toFixed(1)}s`;
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

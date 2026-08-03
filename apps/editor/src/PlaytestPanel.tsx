import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { createPlayerController, resolveSceneTimelineDurationMs, type ActiveDialogueState } from "@mage2/player";
import {
  getLocaleStringValues,
  normalizeSupportedLocales,
  resolveHotspotInventoryAction,
  resolvePlacedInventoryHotspotInstance,
  resolvePlacedInventoryItemId,
  type Asset,
  type InventoryItem,
  type ProjectBundle
} from "@mage2/schema";
import { DropdownSelect } from "./DropdownSelect";
import { MediaSurface } from "./MediaSurface";
import { resolveFileUrl } from "./file-url-cache";
import { resolveHotspotVisuals } from "./hotspot-visuals";
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

const INVENTORY_CURSOR_PREVIEW_SIZE_PX = 48;
const PLAYTEST_INVENTORY_DRAWER_ID = "playtest-inventory-drawer";
const PLAYTEST_INVENTORY_BAG_ICON_SRC = new URL("./assets/playtest-inventory-bag.png", import.meta.url).href;

interface PlaytestDialogueBoxProps {
  activeDialogue: ActiveDialogueState;
  strings: Record<string, string>;
  onChoice: (choiceId: string) => void;
  onContinue: () => void;
}

interface PlaytestInventoryItemView {
  id: string;
  label: string;
  tooltip: string;
  imageSrc?: string;
  selected: boolean;
}

interface InventoryCursorPoint {
  x: number;
  y: number;
}

interface PlaytestInventoryTrayProps {
  items: PlaytestInventoryItemView[];
  hint?: string;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  onSelectItem: (itemId?: string, cursorPoint?: InventoryCursorPoint) => void;
}

export function resolvePlaytestInventorySlotSelection(
  itemId: string,
  isSelected: boolean,
  cursorPoint?: InventoryCursorPoint
) {
  const nextSelectedItemId = isSelected ? undefined : itemId;
  return {
    nextSelectedItemId,
    nextIsExpanded: false,
    cursorPoint: nextSelectedItemId ? cursorPoint : undefined
  };
}

export function PlaytestDialogueBox({
  activeDialogue,
  strings,
  onChoice,
  onContinue
}: PlaytestDialogueBoxProps) {
  const speaker = activeDialogue.node.speaker.trim() || "Narrator";
  const line = strings[activeDialogue.node.textId] ?? activeDialogue.node.textId;

  return (
    <div className="dialogue-box dialogue-box--playtest-scene" aria-live="polite">
      <div className="dialogue-box__speaker-row">
        <h4 className="dialogue-box__speaker">{speaker}</h4>
      </div>
      <p className="dialogue-box__text">{line}</p>

      {activeDialogue.choices.length > 0 ? (
        <div className="dialogue-box__choices">
          {activeDialogue.choices.map((choice, index) => (
            <button
              key={choice.id}
              type="button"
              className="dialogue-box__choice"
              title="Choose this dialogue response and advance to its target branch."
              onClick={() => onChoice(choice.id)}
            >
              <span className="dialogue-box__choice-marker" aria-hidden="true">
                {resolvePlaytestDialogueChoiceMarker(index)}
              </span>
              <span className="dialogue-box__choice-text">{strings[choice.textId] ?? choice.textId}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="dialogue-box__actions">
          <button
            type="button"
            className="dialogue-box__continue"
            title="Advance to the next dialogue node when there are no explicit choices."
            onClick={onContinue}
          >
            Continue
            <span aria-hidden="true">&gt;</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function resolvePlaytestDialogueChoiceMarker(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode("A".charCodeAt(0) + index) : String(index + 1);
}

export function shouldHandlePlaytestHotspotClick(
  hasActiveDialogue: boolean,
  selectedInventoryItemId?: string,
  inventoryAction: Pick<ReturnType<typeof resolveHotspotInventoryAction>, "type" | "itemId"> = { type: "none" }
): boolean {
  if (hasActiveDialogue) {
    return false;
  }

  if (!selectedInventoryItemId) {
    return true;
  }

  return inventoryAction.type === "placeItem" && inventoryAction.itemId === selectedInventoryItemId;
}

export function resolvePlaytestInventoryItemInitial(label: string): string {
  const firstGlyph = label.trim().charAt(0);
  return firstGlyph ? firstGlyph.toLocaleUpperCase() : "?";
}

export function resolvePlaytestInventoryItemTooltip(label: string, description?: string): string {
  const normalizedDescription = description?.trim().replace(/\s+/g, " ");
  return normalizedDescription && normalizedDescription !== label ? `${label} - ${normalizedDescription}` : label;
}

export function resolvePlaytestInventoryToggleLabel(itemCount: number, isExpanded: boolean): string {
  const itemLabel = itemCount === 1 ? "1 item" : `${itemCount} items`;
  return `${isExpanded ? "Close" : "Open"} inventory (${itemLabel})`;
}

export function resolvePlaytestStageHudClassName(hasActiveDialogue: boolean, isInventoryDrawerExpanded: boolean): string {
  return [
    "playtest-stage__hud",
    hasActiveDialogue ? "playtest-stage__hud--dialogue" : undefined,
    isInventoryDrawerExpanded ? "playtest-stage__hud--inventory-open" : undefined
  ]
    .filter(Boolean)
    .join(" ");
}

export function PlaytestInventoryTray({
  items,
  hint,
  isExpanded,
  onExpandedChange,
  onSelectItem
}: PlaytestInventoryTrayProps) {
  const previousItemCountRef = useRef(items.length);
  const autoCollapseTimeoutRef = useRef<number | undefined>(undefined);
  const hasSelectedItem = items.some((item) => item.selected);
  const isDrawerExpanded = isExpanded;

  const clearAutoCollapseTimeout = () => {
    if (autoCollapseTimeoutRef.current !== undefined) {
      window.clearTimeout(autoCollapseTimeoutRef.current);
      autoCollapseTimeoutRef.current = undefined;
    }
  };

  useEffect(() => {
    if (items.length === 0) {
      onExpandedChange(false);
      clearAutoCollapseTimeout();
    } else if (items.length > previousItemCountRef.current) {
      onExpandedChange(true);
      clearAutoCollapseTimeout();
      autoCollapseTimeoutRef.current = window.setTimeout(() => {
        onExpandedChange(false);
        autoCollapseTimeoutRef.current = undefined;
      }, 1800);
    }

    previousItemCountRef.current = items.length;
  }, [items.length, onExpandedChange]);

  useEffect(() => {
    return () => {
      if (autoCollapseTimeoutRef.current !== undefined) {
        window.clearTimeout(autoCollapseTimeoutRef.current);
      }
    };
  }, []);

  const toggleDrawer = () => {
    clearAutoCollapseTimeout();
    onExpandedChange(!isExpanded);
  };

  const selectInventorySlot = (item: PlaytestInventoryItemView, event: MouseEvent<HTMLButtonElement>) => {
    const clickPoint = event.detail > 0 ? { x: event.clientX, y: event.clientY } : undefined;
    const selection = resolvePlaytestInventorySlotSelection(item.id, item.selected, clickPoint);
    clearAutoCollapseTimeout();
    onSelectItem(selection.nextSelectedItemId, selection.cursorPoint);
    onExpandedChange(selection.nextIsExpanded);
  };

  return (
    <section
      className={
        isDrawerExpanded
          ? "playtest-inventory-tray playtest-inventory-tray--expanded"
          : "playtest-inventory-tray"
      }
      aria-label="Inventory"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={
          hasSelectedItem
            ? "playtest-inventory-toggle playtest-inventory-toggle--selected"
            : "playtest-inventory-toggle"
        }
        aria-controls={PLAYTEST_INVENTORY_DRAWER_ID}
        aria-expanded={isDrawerExpanded}
        aria-label={resolvePlaytestInventoryToggleLabel(items.length, isDrawerExpanded)}
        title={resolvePlaytestInventoryToggleLabel(items.length, isDrawerExpanded)}
        onClick={toggleDrawer}
      >
        <img className="playtest-inventory-toggle__icon" src={PLAYTEST_INVENTORY_BAG_ICON_SRC} alt="" draggable={false} />
        <span className="playtest-inventory-toggle__badge" aria-hidden="true">
          {items.length}
        </span>
      </button>

      <div id={PLAYTEST_INVENTORY_DRAWER_ID} className="playtest-inventory-tray__drawer">
        {items.length > 0 ? (
          <div className="playtest-inventory-tray__slots">
            {items.map((item, index) => (
              <button
                key={`${item.id}:${index}`}
                type="button"
                className={
                  item.selected
                    ? "playtest-inventory-slot playtest-inventory-slot--selected"
                    : "playtest-inventory-slot"
                }
                aria-pressed={item.selected}
                aria-label={item.label}
                title={item.tooltip}
                onClick={(event) => selectInventorySlot(item, event)}
              >
                <span className="playtest-inventory-slot__well" aria-hidden="true">
                  {item.imageSrc ? (
                    <img src={item.imageSrc} alt="" draggable={false} />
                  ) : (
                    <span>{resolvePlaytestInventoryItemInitial(item.label)}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="playtest-inventory-tray__empty">
            <strong>Empty</strong>
          </div>
        )}

        <div className="playtest-inventory-tray__hint" aria-live="polite">
          {hint ? <span>{hint}</span> : null}
        </div>
      </div>
    </section>
  );
}

export function resolveInventoryCursorPreviewFrameStyle(
  point: { x: number; y: number },
  sizePx = INVENTORY_CURSOR_PREVIEW_SIZE_PX
): CSSProperties {
  return {
    position: "fixed",
    left: `${point.x}px`,
    top: `${point.y}px`,
    transform: "translate(-50%, -50%)",
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    zIndex: 10000,
    pointerEvents: "none",
    display: "grid",
    placeItems: "center"
  };
}

export function PlaytestPanel({ project, onExit }: PlaytestPanelProps) {
  const activeLocale = useEditorStore((state) => state.playtestLocale) ?? project.manifest.defaultLanguage;
  const setActiveLocale = useEditorStore((state) => state.setPlaytestLocale);
  const [controller, setController] = useState(() => createPlayerController(project));
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());
  const [playheadMs, setPlayheadMs] = useState(0);
  const [selectedAssetId, setSelectedAssetId] = useState(snapshot.scene.backgroundAssetId);
  const [playbackResetKey, setPlaybackResetKey] = useState(0);
  const [observedVideoDuration, setObservedVideoDuration] = useState<{
    assetId: string;
    sourcePath?: string;
    durationMs: number;
  }>();
  const [showHotspots, setShowHotspots] = useState(false);
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string>();
  const selectedInventoryItemIdRef = useRef<string | undefined>(undefined);
  const [inventoryHint, setInventoryHint] = useState<string>();
  const [isInventoryDrawerExpanded, setIsInventoryDrawerExpanded] = useState(false);
  const [inventoryCursorPoint, setInventoryCursorPoint] = useState<InventoryCursorPoint>();
  const [inventoryCursorPreviewUrl, setInventoryCursorPreviewUrl] = useState<string>();
  const [inventoryItemImageUrls, setInventoryItemImageUrls] = useState<Record<string, string>>({});
  const [lastActivatedHotspotId, setLastActivatedHotspotId] = useState<string>();
  const [sceneAudioUrl, setSceneAudioUrl] = useState<string>();
  const [saveSlotInspections, setSaveSlotInspections] = useState<PlaytestSaveSlotInspection[]>(() =>
    PLAYTEST_SAVE_SLOT_IDS.map(createEmptyPlaytestSaveSlotInspection)
  );
  const [saveFeedback, setSaveFeedback] = useState<PlaytestSaveFeedback>();
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

  useEffect(() => {
    latestPlayheadMsRef.current = playheadMs;
  }, [playheadMs]);

  useEffect(() => {
    const nextController = createPlayerController(project);
    setController(nextController);
    setSnapshot(nextController.getSnapshot());
    setPlayheadMs(0);
    selectPlaytestInventoryItem(undefined);
    setInventoryHint(undefined);
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
    setSelectedAssetId(snapshot.scene.backgroundAssetId);
  }, [snapshot.scene.backgroundAssetId]);

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
    setSelectedAssetId(nextSnapshot.scene.backgroundAssetId);
    setPlayheadMs(0);
    setPlaybackResetKey((value) => value + 1);
    selectPlaytestInventoryItem(undefined);
    setInventoryHint(undefined);
    setLastActivatedHotspotId(undefined);
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
      sceneAudioPlaybackIntentRef.current = true;
      sceneAudioDrivenPlayheadMsRef.current = undefined;
      setController(nextController);
      setSnapshot(nextSnapshot);
      setSelectedAssetId(nextSnapshot.scene.backgroundAssetId);
      setPlayheadMs(nextSnapshot.saveState.playheadMs ?? 0);
      setPlaybackResetKey((value) => value + 1);
      selectPlaytestInventoryItem(undefined);
      setInventoryHint(undefined);
      setLastActivatedHotspotId(undefined);
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

  function selectPlaytestInventoryItem(itemId: string | undefined, cursorPoint?: InventoryCursorPoint) {
    selectedInventoryItemIdRef.current = itemId;
    setSelectedInventoryItemId(itemId);
    setInventoryCursorPoint(itemId && cursorPoint ? cursorPoint : undefined);
  }

  function closePlaytestInventoryDrawer() {
    setIsInventoryDrawerExpanded(false);
  }

  function activatePlaytestHotspot(hotspotId: string) {
    const activeSelectedInventoryItemId = selectedInventoryItemIdRef.current;
    const hotspot = visibleHotspots.find((entry) => entry.id === hotspotId);
    const placedHotspot = placedInventoryHotspots.find((entry) => entry.id === hotspotId);
    if (!hotspot && placedHotspot) {
      setLastActivatedHotspotId(hotspotId);
      setInventoryHint(
        placedHotspot.inventoryItemId
          ? `${resolveInventoryItemLabel(placedHotspot.inventoryItemId, project.inventory.items, localeStrings)} placed.`
          : "Placed."
      );
      return { snapshot, selectedInventoryItemId: activeSelectedInventoryItemId, activated: true };
    }

    const inventoryAction = hotspot ? resolveHotspotInventoryAction(hotspot) : { type: "none" as const };
    if (hotspot && activeSelectedInventoryItemId && !shouldHandlePlaytestHotspotClick(false, activeSelectedInventoryItemId, inventoryAction)) {
      setInventoryHint(
        "Not here."
      );
      return { snapshot, selectedInventoryItemId: activeSelectedInventoryItemId, activated: false };
    }

    if (hotspot && inventoryAction.type === "placeItem" && inventoryAction.itemId !== activeSelectedInventoryItemId) {
      setInventoryHint(
        inventoryAction.itemId
          ? `Needs ${resolveInventoryItemLabel(inventoryAction.itemId, project.inventory.items, localeStrings)}.`
          : "Needs matching item."
      );
      return { snapshot, selectedInventoryItemId: activeSelectedInventoryItemId, activated: false };
    }

    setLastActivatedHotspotId(hotspotId);
    controller.selectHotspot(hotspotId, playheadMs, sceneTimelineDurationMs);
    const nextSnapshot = controller.getSnapshot();
    setSnapshot(nextSnapshot);
    setPlayheadMs(0);

    if (inventoryAction.type === "pickupItem" || inventoryAction.type === "placeItem") {
      selectPlaytestInventoryItem(undefined);
      setInventoryHint(undefined);
      return { snapshot: nextSnapshot, selectedInventoryItemId: undefined, activated: true };
    }

    return { snapshot: nextSnapshot, selectedInventoryItemId: activeSelectedInventoryItemId, activated: true };
  }

  const sceneAsset = project.assets.assets.find((asset) => asset.id === selectedAssetId);
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
  const selectedInventoryItem = snapshot.inventoryItems.find((item) => item.id === selectedInventoryItemId);
  const selectedInventoryItemAsset = selectedInventoryItem?.imageAssetId
    ? project.assets.assets.find((asset) => asset.id === selectedInventoryItem.imageAssetId)
    : undefined;
  const selectedInventoryItemVariant = getLocalizedAssetVariant(selectedInventoryItemAsset, activeLocale);
  const selectedInventoryCursorSourcePath =
    selectedInventoryItemVariant?.proxyPath ?? selectedInventoryItemVariant?.sourcePath;
  const selectedInventoryCursorLabel = selectedInventoryItem
    ? localeStrings[selectedInventoryItem.textId] ?? selectedInventoryItem.name ?? selectedInventoryItem.id
    : undefined;
  const inventoryItemImageSources = useMemo(() => {
    return Object.fromEntries(
      snapshot.inventoryItems.map((item) => {
        const itemAsset = item.imageAssetId
          ? project.assets.assets.find((asset) => asset.id === item.imageAssetId)
          : undefined;
        const itemVariant = getLocalizedAssetVariant(itemAsset, activeLocale);
        return [item.id, itemVariant?.proxyPath ?? itemVariant?.sourcePath] as const;
      })
    );
  }, [activeLocale, project.assets.assets, snapshot.inventoryItems]);
  const inventoryItemImageSourceSignature = Object.entries(inventoryItemImageSources)
    .map(([itemId, sourcePath]) => `${itemId}:${sourcePath ?? ""}`)
    .sort()
    .join("|");
  const playtestInventoryItems = snapshot.inventoryItems.map((item): PlaytestInventoryItemView => {
    const label = localeStrings[item.textId] ?? item.name ?? item.id;
    const description = item.descriptionTextId ? localeStrings[item.descriptionTextId] : undefined;
    return {
      id: item.id,
      label,
      tooltip: resolvePlaytestInventoryItemTooltip(label, description),
      imageSrc: inventoryItemImageUrls[item.id],
      selected: item.id === selectedInventoryItemId
    };
  });
  const placedInventoryInstances = snapshot.scene.hotspots
    .map((hotspot) =>
      resolvePlacedInventoryItemId(hotspot, snapshot.flags)
        ? resolvePlacedInventoryHotspotInstance(hotspot, snapshot.scene.hotspots)
        : undefined
    )
    .filter((instance): instance is NonNullable<typeof instance> => Boolean(instance));
  const placedInventoryHotspots = placedInventoryInstances.map((instance) => instance.hotspot);
  const surfaceHotspots = [...visibleHotspots, ...placedInventoryHotspots];
  const hotspotVisuals = resolveHotspotVisuals({
    hotspots: surfaceHotspots,
    inventoryItems: project.inventory.items,
    assets: project.assets.assets,
    locale: activeLocale,
    strings: localeStrings,
    flags: snapshot.flags
  });

  useEffect(() => {
    if (!selectedInventoryItemId) {
      setInventoryCursorPoint(undefined);
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setInventoryCursorPoint({ x: event.clientX, y: event.clientY });
    };
    const clearPointer = () => setInventoryCursorPoint(undefined);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("blur", clearPointer);
    document.addEventListener("mouseleave", clearPointer);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", clearPointer);
      document.removeEventListener("mouseleave", clearPointer);
    };
  }, [selectedInventoryItemId]);

  useEffect(() => {
    let cancelled = false;

    async function loadInventoryCursorPreviewUrl() {
      if (!selectedInventoryCursorSourcePath) {
        setInventoryCursorPreviewUrl(undefined);
        return;
      }

      try {
        const url = await resolveFileUrl(selectedInventoryCursorSourcePath);
        if (!cancelled) {
          setInventoryCursorPreviewUrl(url);
        }
      } catch {
        if (!cancelled) {
          setInventoryCursorPreviewUrl(undefined);
        }
      }
    }

    void loadInventoryCursorPreviewUrl();
    return () => {
      cancelled = true;
    };
  }, [selectedInventoryCursorSourcePath]);

  useEffect(() => {
    let cancelled = false;

    async function loadInventoryItemImageUrls() {
      const sourceEntries = Object.entries(inventoryItemImageSources);
      if (sourceEntries.length === 0) {
        setInventoryItemImageUrls({});
        return;
      }

      const resolvedEntries = await Promise.all(
        sourceEntries.map(async ([itemId, sourcePath]) => {
          if (!sourcePath) {
            return undefined;
          }

          try {
            return [itemId, await resolveFileUrl(sourcePath)] as const;
          } catch {
            return undefined;
          }
        })
      );

      if (!cancelled) {
        setInventoryItemImageUrls(
          Object.fromEntries(resolvedEntries.filter((entry): entry is readonly [string, string] => Boolean(entry)))
        );
      }
    }

    void loadInventoryItemImageUrls();
    return () => {
      cancelled = true;
    };
  }, [inventoryItemImageSourceSignature]);

  function resolvePlaytestAutomationState(): EditorAutomationPlaytestState {
    const placedVisuals: Record<string, string> = {};
    for (const instance of placedInventoryInstances) {
      if (hotspotVisuals[instance.id]) {
        placedVisuals[instance.id] = instance.itemId;
        placedVisuals[instance.dropTargetHotspotId] = instance.itemId;
      }
    }

    return {
      sceneId: snapshot.scene.id,
      visibleHotspotIds: visibleHotspots.map((hotspot) => hotspot.id),
      surfaceHotspotIds: surfaceHotspots.map((hotspot) => hotspot.id),
      inventoryItemIds: snapshot.inventoryItems.map((item) => item.id),
      selectedInventoryItemId: selectedInventoryItemIdRef.current,
      lastActivatedHotspotId,
      flags: snapshot.flags,
      placedVisuals,
      placedObjects: placedInventoryInstances.map((instance) => ({
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
        activatePlaytestHotspot(hotspotId);
        return resolvePlaytestAutomationState();
      },
      selectInventoryItem: (itemId?: string) => {
        if (itemId && !snapshot.inventoryItems.some((item) => item.id === itemId)) {
          throw new Error(`Inventory item '${itemId}' is not currently available in playtest.`);
        }

        selectPlaytestInventoryItem(itemId);
        setInventoryHint(undefined);
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
    sceneAudioVariant?.durationMs
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
          <MediaSurface
            className="media-surface--playtest"
            asset={sceneAsset}
            locale={activeLocale}
            loopVideo={snapshot.scene.backgroundVideoLoop}
            hotspots={surfaceHotspots}
            hotspotVisuals={hotspotVisuals}
            hotspotAppearance={showHotspots ? "playtest" : "hidden"}
            showHotspotLabels={false}
            strings={localeStrings}
            playheadMs={sceneAsset?.kind === "video" ? playheadMs : undefined}
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
            onHotspotClick={(hotspotId) => {
              if (!shouldHandlePlaytestHotspotClick(Boolean(snapshot.activeDialogue))) {
                return;
              }

              activatePlaytestHotspot(hotspotId);
            }}
          >
            <div
              className={resolvePlaytestStageHudClassName(Boolean(snapshot.activeDialogue), isInventoryDrawerExpanded)}
              onClick={isInventoryDrawerExpanded ? closePlaytestInventoryDrawer : undefined}
            >
              {snapshot.activeDialogue ? (
                <PlaytestDialogueBox
                  activeDialogue={snapshot.activeDialogue}
                  strings={localeStrings}
                  onChoice={(choiceId) => {
                    controller.chooseDialogueChoice(choiceId);
                    setSnapshot(controller.getSnapshot());
                  }}
                  onContinue={() => {
                    controller.continueDialogue();
                    setSnapshot(controller.getSnapshot());
                  }}
                />
              ) : null}
              <div className="playtest-stage__inventory">
                <PlaytestInventoryTray
                  items={playtestInventoryItems}
                  hint={inventoryHint}
                  isExpanded={isInventoryDrawerExpanded}
                  onExpandedChange={setIsInventoryDrawerExpanded}
                  onSelectItem={(itemId, cursorPoint) => {
                    selectPlaytestInventoryItem(itemId, cursorPoint);
                    setInventoryHint(undefined);
                  }}
                />
              </div>
            </div>
          </MediaSurface>
        </div>
        <InventoryCursorPreview
          imageSrc={inventoryCursorPreviewUrl}
          label={selectedInventoryCursorLabel}
          point={inventoryCursorPoint}
        />

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

function resolveInventoryItemLabel(itemId: string, items: InventoryItem[], strings: Record<string, string>): string {
  const item = items.find((entry) => entry.id === itemId);
  return item ? strings[item.textId] ?? item.name ?? item.id : itemId;
}

function InventoryCursorPreview({
  imageSrc,
  label,
  point
}: {
  imageSrc?: string;
  label?: string;
  point?: { x: number; y: number };
}) {
  if (!imageSrc || !point) {
    return null;
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-label={label ? `Selected item: ${label}` : "Selected inventory item"}
      role="img"
      style={resolveInventoryCursorPreviewFrameStyle(point)}
    >
      <img
        src={imageSrc}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          filter: "drop-shadow(0 8px 10px rgba(0, 0, 0, 0.35))"
        }}
      />
    </div>,
    document.body
  );
}

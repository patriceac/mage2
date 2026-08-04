import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent
} from "react";
import { createPortal } from "react-dom";
import {
  clampPlayheadMs,
  getVideoPlayheadMs,
  resolvePlayableDurationMs,
  shouldSyncPlayheadMs,
  type ActivePlayerResponse,
  type ActiveDialogueState,
  type HotspotInteractionEventType,
  type PlayerSnapshot
} from "@mage2/player";
import {
  resolveAssetVariant,
  resolveHotspotBounds,
  resolveHotspotRotationDegrees,
  resolveRelativeHotspotFrame,
  resolveRelativeHotspotPolygon,
  resolveRelativeHotspotVisualBox,
  type Hotspot,
  type HotspotSurfaceSize,
  type ProjectBundle
} from "@mage2/schema";
import {
  isOpaqueHotspotVisualHit,
  loadHotspotVisualAlphaMask,
  type HotspotVisualAlphaMask
} from "./hotspot-alpha-hit-test";
import {
  resolvePlayerDialogueChoiceMarker,
  resolvePlayerHotspotInteraction,
  resolvePlayerHotspotVisuals,
  resolvePlayerInventoryItemInitial,
  resolvePlayerInventoryItemTooltip,
  resolvePlayerInventorySlotSelection,
  resolvePlayerInventoryToggleLabel,
  resolvePlayerInventoryContextMenuAction,
  resolvePlayerSceneHotspots,
  resolvePlayerStageHudClassName,
  resolvePlayerTextDirection,
  type PlayerCursorPoint,
  type PlayerHotspotInteraction,
  type PlayerHotspotVisual,
  type PlayerInventoryItemView,
  type PlayerScenePresentation,
  type PlayerSourceResolver,
  type PlayerSystemCopy
} from "./model";
import { PlayerResponsePresenter } from "./PlayerResponsePresenter";

const INVENTORY_CURSOR_PREVIEW_SIZE_PX = 48;
const INVENTORY_DRAWER_ID = "mage2-player-inventory-drawer";
const NOOP_RESPONSE_COMPLETE = () => undefined;

export interface PlayerSceneRendererProps {
  project: Pick<ProjectBundle, "assets" | "inventory">;
  snapshot: PlayerSnapshot;
  locale: string;
  strings: Record<string, string>;
  visibleHotspots: Hotspot[];
  playheadMs: number;
  showHotspots: boolean;
  resolveSourcePath: PlayerSourceResolver;
  bagIconUrl: string;
  copy: PlayerSystemCopy;
  selectedInventoryItemId?: string;
  onSelectedInventoryItemIdChange: (itemId?: string) => void;
  onHotspotActivate: (hotspotId: string) => void;
  onHotspotEventActivate?: (hotspotId: string, eventType: HotspotInteractionEventType) => void;
  onPlacedHotspotActivate?: (hotspotId: string, itemId?: string) => void;
  onDialogueChoice: (choiceId: string) => void;
  onDialogueContinue: () => void;
  onInteractionBlocked?: (reason: "dialogue" | "response", hotspotId: string) => void;
  activeResponse?: ActivePlayerResponse;
  onResponseComplete?: (sequence: number) => void;
  onPlayheadMsChange?: (playheadMs: number) => void;
  onPlayableDurationMsChange?: (durationMs: number) => void;
  playbackResetKey?: string | number;
  volume?: number;
  paused?: boolean;
  presentation?: PlayerScenePresentation;
  className?: string;
}

export interface PlayerSceneRendererHandle {
  activateHotspot(hotspotId: string): PlayerHotspotInteraction;
  selectInventoryItem(itemId?: string): void;
  getInteractionState(): {
    selectedInventoryItemId?: string;
    isInventoryDrawerExpanded: boolean;
  };
}

export interface PlayerDialogueBoxProps {
  activeDialogue: ActiveDialogueState;
  strings: Record<string, string>;
  copy: Pick<
    PlayerSystemCopy,
    "narrator" | "continue" | "chooseDialogueResponseTitle" | "continueDialogueTitle"
  >;
  onChoice: (choiceId: string) => void;
  onContinue: () => void;
}

export function PlayerDialogueBox({
  activeDialogue,
  strings,
  copy,
  onChoice,
  onContinue
}: PlayerDialogueBoxProps) {
  const speaker = activeDialogue.node.speaker.trim() || copy.narrator;
  const line = strings[activeDialogue.node.textId] ?? activeDialogue.node.textId;
  const canContinueBySurfaceClick = activeDialogue.choices.length === 0;
  const dialogueClassName = [
    "mage2-player__dialogue",
    canContinueBySurfaceClick ? "mage2-player__dialogue--continue" : undefined
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={dialogueClassName}
      aria-live="polite"
      onClick={canContinueBySurfaceClick ? onContinue : undefined}
    >
      <div className="mage2-player__dialogue-speaker-row">
        <h4 className="mage2-player__dialogue-speaker">{speaker}</h4>
      </div>
      <p className="mage2-player__dialogue-text">{line}</p>

      {activeDialogue.choices.length > 0 ? (
        <div className="mage2-player__dialogue-choices">
          {activeDialogue.choices.map((choice, index) => (
            <button
              key={choice.id}
              type="button"
              className="mage2-player__dialogue-choice"
              title={copy.chooseDialogueResponseTitle}
              onClick={() => onChoice(choice.id)}
            >
              <span className="mage2-player__dialogue-choice-marker" aria-hidden="true">
                {resolvePlayerDialogueChoiceMarker(index)}
              </span>
              <span className="mage2-player__dialogue-choice-text">
                {strings[choice.textId] ?? choice.textId}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mage2-player__dialogue-actions">
          <button
            type="button"
            className="mage2-player__dialogue-continue"
            title={copy.continueDialogueTitle}
            onClick={(event) => {
              event.stopPropagation();
              onContinue();
            }}
          >
            {copy.continue}
            <span aria-hidden="true">›</span>
          </button>
        </div>
      )}
    </div>
  );
}

export interface PlayerInventoryTrayProps {
  items: PlayerInventoryItemView[];
  isExpanded: boolean;
  bagIconUrl: string;
  copy: Pick<PlayerSystemCopy, "inventory" | "inventoryToggleLabel" | "emptyInventory">;
  onExpandedChange: (isExpanded: boolean) => void;
  onSelectItem: (itemId?: string, cursorPoint?: PlayerCursorPoint) => void;
}

export function PlayerInventoryTray({
  items,
  isExpanded,
  bagIconUrl,
  copy,
  onExpandedChange,
  onSelectItem
}: PlayerInventoryTrayProps) {
  const previousItemCountRef = useRef(items.length);
  const autoCollapseTimeoutRef = useRef<number | undefined>(undefined);
  const hasSelectedItem = items.some((item) => item.selected);

  const clearAutoCollapseTimeout = useCallback(() => {
    if (autoCollapseTimeoutRef.current !== undefined) {
      window.clearTimeout(autoCollapseTimeoutRef.current);
      autoCollapseTimeoutRef.current = undefined;
    }
  }, []);

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
  }, [clearAutoCollapseTimeout, items.length, onExpandedChange]);

  useEffect(
    () => () => {
      if (autoCollapseTimeoutRef.current !== undefined) {
        window.clearTimeout(autoCollapseTimeoutRef.current);
      }
    },
    []
  );

  const toggleLabel = resolvePlayerInventoryToggleLabel(items.length, isExpanded, copy);
  const selectInventorySlot = (item: PlayerInventoryItemView, event: MouseEvent<HTMLButtonElement>) => {
    const clickPoint = event.detail > 0 ? { x: event.clientX, y: event.clientY } : undefined;
    const selection = resolvePlayerInventorySlotSelection(item.id, item.selected, clickPoint);
    clearAutoCollapseTimeout();
    onSelectItem(selection.nextSelectedItemId, selection.cursorPoint);
    onExpandedChange(selection.nextIsExpanded);
  };

  return (
    <section
      className={
        isExpanded
          ? "mage2-player__inventory mage2-player__inventory--expanded"
          : "mage2-player__inventory"
      }
      aria-label={copy.inventory}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={
          hasSelectedItem
            ? "mage2-player__inventory-toggle mage2-player__inventory-toggle--selected"
            : "mage2-player__inventory-toggle"
        }
        aria-controls={INVENTORY_DRAWER_ID}
        aria-expanded={isExpanded}
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={() => {
          clearAutoCollapseTimeout();
          onExpandedChange(!isExpanded);
        }}
      >
        <img className="mage2-player__inventory-bag" src={bagIconUrl} alt="" draggable={false} />
        <span className="mage2-player__inventory-count" aria-hidden="true">
          {items.length}
        </span>
      </button>

      <div id={INVENTORY_DRAWER_ID} className="mage2-player__inventory-drawer">
        {items.length > 0 ? (
          <div className="mage2-player__inventory-slots">
            {items.map((item, index) => (
              <button
                key={`${item.id}:${index}`}
                type="button"
                className={
                  item.selected
                    ? "mage2-player__inventory-slot mage2-player__inventory-slot--selected"
                    : "mage2-player__inventory-slot"
                }
                aria-pressed={item.selected}
                aria-label={item.label}
                title={item.tooltip}
                onClick={(event) => selectInventorySlot(item, event)}
              >
                <span className="mage2-player__inventory-slot-well" aria-hidden="true">
                  {item.imageSrc ? (
                    <img src={item.imageSrc} alt="" draggable={false} />
                  ) : (
                    <span>{resolvePlayerInventoryItemInitial(item.label)}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mage2-player__inventory-empty">
            <strong>{copy.emptyInventory}</strong>
          </div>
        )}
      </div>
    </section>
  );
}

export const PlayerSceneRenderer = forwardRef<PlayerSceneRendererHandle, PlayerSceneRendererProps>(
  function PlayerSceneRenderer(
    {
      project,
      snapshot,
      locale,
      strings,
      visibleHotspots,
      playheadMs,
      showHotspots,
      resolveSourcePath,
      bagIconUrl,
      copy,
      selectedInventoryItemId,
      onSelectedInventoryItemIdChange,
      onHotspotActivate,
      onHotspotEventActivate,
      onPlacedHotspotActivate,
      onDialogueChoice,
      onDialogueContinue,
      onInteractionBlocked,
      activeResponse,
      onResponseComplete,
      onPlayheadMsChange,
      onPlayableDurationMsChange,
      playbackResetKey,
      volume = 1,
      paused = false,
      presentation = "embedded",
      className
    },
    ref
  ) {
    const [isInventoryDrawerExpanded, setIsInventoryDrawerExpanded] = useState(false);
    const [inventoryCursorPoint, setInventoryCursorPoint] = useState<PlayerCursorPoint>();
    const overlayRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [overlaySurfaceSize, setOverlaySurfaceSize] = useState<HotspotSurfaceSize>();
    const gameplayPaused = paused || activeResponse?.entry.kind === "video";

    const sceneAsset = project.assets.assets.find((asset) => asset.id === snapshot.scene.backgroundAssetId);
    const sceneAssetVariant = sceneAsset ? resolveAssetVariant(sceneAsset, locale) : undefined;
    const sceneSourcePath = sceneAssetVariant?.proxyPath ?? sceneAssetVariant?.sourcePath;
    const sceneUrl = useResolvedSource(sceneSourcePath, resolveSourcePath);
    const sceneHotspots = useMemo(
      () => resolvePlayerSceneHotspots(visibleHotspots, snapshot.scene.hotspots, snapshot.flags),
      [snapshot.flags, snapshot.scene.hotspots, visibleHotspots]
    );
    const hotspotVisuals = useMemo(
      () =>
        resolvePlayerHotspotVisuals({
          hotspots: sceneHotspots.surfaceHotspots,
          inventoryItems: project.inventory.items,
          assets: project.assets.assets,
          locale,
          strings,
          flags: snapshot.flags
        }),
      [
        locale,
        project.assets.assets,
        project.inventory.items,
        sceneHotspots.surfaceHotspots,
        snapshot.flags,
        strings
      ]
    );
    const hotspotVisualSourcePaths = useMemo(
      () => Object.fromEntries(Object.entries(hotspotVisuals).map(([id, visual]) => [id, visual.sourcePath])),
      [hotspotVisuals]
    );
    const hotspotVisualUrls = useResolvedSourceMap(hotspotVisualSourcePaths, resolveSourcePath);
    const hotspotAlphaMasks = useHotspotAlphaMasks(hotspotVisualUrls);
    const inventorySourcePaths = useMemo(
      () =>
        Object.fromEntries(
          snapshot.inventoryItems.map((item) => {
            const asset = item.imageAssetId
              ? project.assets.assets.find((entry) => entry.id === item.imageAssetId)
              : undefined;
            const variant = asset ? resolveAssetVariant(asset, locale) : undefined;
            return [item.id, variant?.proxyPath ?? variant?.sourcePath] as const;
          })
        ),
      [locale, project.assets.assets, snapshot.inventoryItems]
    );
    const inventoryImageUrls = useResolvedSourceMap(inventorySourcePaths, resolveSourcePath);
    const selectedInventoryItem = snapshot.inventoryItems.find((item) => item.id === selectedInventoryItemId);
    const selectedInventoryLabel = selectedInventoryItem
      ? strings[selectedInventoryItem.textId] ?? selectedInventoryItem.name ?? selectedInventoryItem.id
      : undefined;
    const inventoryItems = snapshot.inventoryItems.map((item): PlayerInventoryItemView => {
      const label = strings[item.textId] ?? item.name ?? item.id;
      const description = item.descriptionTextId ? strings[item.descriptionTextId] : undefined;
      return {
        id: item.id,
        label,
        tooltip: resolvePlayerInventoryItemTooltip(label, description),
        imageSrc: inventoryImageUrls[item.id],
        selected: item.id === selectedInventoryItemId
      };
    });

    const selectInventoryItem = useCallback(
      (itemId?: string, cursorPoint?: PlayerCursorPoint) => {
        setInventoryCursorPoint(itemId && cursorPoint ? cursorPoint : undefined);
        onSelectedInventoryItemIdChange(itemId);
      },
      [onSelectedInventoryItemIdChange]
    );

    const handleInventoryContextMenu = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        const action = resolvePlayerInventoryContextMenuAction(
          isInventoryDrawerExpanded,
          selectedInventoryItemId
        );
        if (!action) {
          return;
        }

        event.preventDefault();
        if (action === "close-inventory") {
          setIsInventoryDrawerExpanded(false);
          return;
        }

        selectInventoryItem(undefined);
      },
      [isInventoryDrawerExpanded, selectInventoryItem, selectedInventoryItemId]
    );

    const activateHotspot = useCallback(
      (hotspotId: string): PlayerHotspotInteraction => {
        if (gameplayPaused) {
          onInteractionBlocked?.("response", hotspotId);
          return { type: "blocked", reason: "response" };
        }
        const hotspot = visibleHotspots.find((entry) => entry.id === hotspotId);
        const placedInstance = sceneHotspots.placedInstances.find((entry) => entry.id === hotspotId);
        const placedHotspot = placedInstance?.hotspot;
        const interaction = resolvePlayerHotspotInteraction({
          hasActiveDialogue: Boolean(snapshot.activeDialogue),
          selectedInventoryItemId,
          hotspot,
          placedHotspot
        });

        if (interaction.type === "blocked") {
          onInteractionBlocked?.(interaction.reason, hotspotId);
          return interaction;
        }

        if (interaction.type === "none") {
          return interaction;
        }

        if (interaction.type === "event") {
          onHotspotEventActivate?.(
            placedInstance?.dropTargetHotspotId ?? hotspotId,
            interaction.eventType
          );
          return interaction;
        }

        if (interaction.type === "placed") {
          onPlacedHotspotActivate?.(hotspotId, interaction.itemId);
          return interaction;
        }

        onHotspotActivate(hotspotId);
        if (interaction.inventoryAction.type === "pickupItem" || interaction.inventoryAction.type === "placeItem") {
          selectInventoryItem(undefined);
        }
        return interaction;
      },
      [
        onHotspotActivate,
        onHotspotEventActivate,
        onInteractionBlocked,
        onPlacedHotspotActivate,
        sceneHotspots.placedInstances,
        selectInventoryItem,
        selectedInventoryItemId,
        snapshot.activeDialogue,
        visibleHotspots,
        gameplayPaused
      ]
    );

    useImperativeHandle(
      ref,
      () => ({
        activateHotspot,
        selectInventoryItem: (itemId?: string) => selectInventoryItem(itemId),
        getInteractionState: () => ({
          selectedInventoryItemId,
          isInventoryDrawerExpanded
        })
      }),
      [activateHotspot, isInventoryDrawerExpanded, selectInventoryItem, selectedInventoryItemId]
    );

    useEffect(() => {
      if (
        selectedInventoryItemId &&
        !snapshot.inventoryItems.some((item) => item.id === selectedInventoryItemId)
      ) {
        selectInventoryItem(undefined);
      }
    }, [selectInventoryItem, selectedInventoryItemId, snapshot.inventoryItems]);

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
      const overlay = overlayRef.current;
      if (!overlay || typeof ResizeObserver === "undefined") {
        return;
      }

      const updateSize = () => {
        const bounds = overlay.getBoundingClientRect();
        setOverlaySurfaceSize(
          bounds.width > 0 && bounds.height > 0 ? { width: bounds.width, height: bounds.height } : undefined
        );
      };
      updateSize();
      const observer = new ResizeObserver(updateSize);
      observer.observe(overlay);
      return () => observer.disconnect();
    }, []);

    useControlledVideoPlayback({
      videoRef,
      assetId: sceneAsset?.id,
      assetUrl: sceneUrl,
      assetDurationMs: sceneAssetVariant?.durationMs,
      loop: snapshot.scene.backgroundVideoLoop,
      playheadMs,
      playbackResetKey,
      onPlayheadMsChange,
      paused: gameplayPaused
    });

    const surfaceStyle = resolvePlayerMediaAspectRatioStyle(sceneAssetVariant?.width, sceneAssetVariant?.height);
    const responsiveRootStyle =
      presentation === "runtime-responsive" &&
      isPositiveFiniteNumber(sceneAssetVariant?.width) &&
      isPositiveFiniteNumber(sceneAssetVariant?.height)
        ? ({
            "--mage2-player-media-aspect": sceneAssetVariant.width / sceneAssetVariant.height
          } as CSSProperties)
        : undefined;
    const rootClassName = [
      "mage2-player",
      presentation === "runtime-responsive" ? "mage2-player--runtime-responsive" : undefined,
      showHotspots ? "mage2-player--debug-hotspots" : undefined,
      gameplayPaused ? "mage2-player--response-blocking" : undefined,
      className
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <>
        <div
          className={rootClassName}
          style={presentation === "runtime-responsive" ? responsiveRootStyle : surfaceStyle}
          lang={locale}
          dir={resolvePlayerTextDirection(locale)}
          onClick={isInventoryDrawerExpanded ? () => setIsInventoryDrawerExpanded(false) : undefined}
          onContextMenu={handleInventoryContextMenu}
        >
          <div className="mage2-player__scene-surface" style={surfaceStyle}>
            {sceneAsset && sceneUrl && (sceneAsset.kind === "image" || sceneAsset.kind === "video") ? (
              sceneAsset.kind === "video" ? (
                <video
                  ref={videoRef}
                  src={sceneUrl}
                  autoPlay
                  loop={snapshot.scene.backgroundVideoLoop}
                  muted
                  playsInline
                  className="mage2-player__media"
                  onLoadedMetadata={(event) => {
                    const durationMs = resolvePlayableDurationMs(
                      event.currentTarget.duration,
                      sceneAssetVariant?.durationMs
                    );
                    if (durationMs !== undefined) {
                      onPlayableDurationMsChange?.(durationMs);
                    }
                    syncVideoFromPlayhead(event.currentTarget, playheadMs, sceneAssetVariant?.durationMs);
                  }}
                />
              ) : (
                <img src={sceneUrl} alt={sceneAsset.name} className="mage2-player__media" draggable={false} />
              )
            ) : (
              <div className="mage2-player__placeholder">{copy.missingVisual}</div>
            )}

            <div ref={overlayRef} className="mage2-player__hotspots">
              {sceneHotspots.surfaceHotspots.map((hotspot) => (
                <PlayerHotspotButton
                  key={hotspot.id}
                  hotspot={hotspot}
                  surfaceSize={overlaySurfaceSize}
                  visual={
                    hotspotVisuals[hotspot.id]
                      ? {
                          ...hotspotVisuals[hotspot.id]!,
                          url: hotspotVisualUrls[hotspot.id]
                        }
                      : undefined
                  }
                  alphaMask={hotspotAlphaMasks[hotspot.id]}
                  showHotspots={showHotspots}
                  sceneInteractionBlocked={Boolean(snapshot.activeDialogue) || gameplayPaused}
                  ariaLabel={`${resolvePlayerHotspotTitle(hotspot, strings)}: ${copy.activateHotspot}`}
                  onActivate={() => activateHotspot(hotspot.id)}
                />
              ))}
            </div>
          </div>

          <div className="mage2-player__scene-overlay mage2-player__hud-plane">
            <div
              className={resolvePlayerStageHudClassName(
                Boolean(snapshot.activeDialogue),
                isInventoryDrawerExpanded
              )}
            >
              {snapshot.activeDialogue ? (
                <PlayerDialogueBox
                  activeDialogue={snapshot.activeDialogue}
                  strings={strings}
                  copy={copy}
                  onChoice={onDialogueChoice}
                  onContinue={onDialogueContinue}
                />
              ) : null}
              <div className="mage2-player__inventory-anchor">
                <PlayerInventoryTray
                  items={inventoryItems}
                  isExpanded={isInventoryDrawerExpanded}
                  bagIconUrl={bagIconUrl}
                  copy={copy}
                  onExpandedChange={setIsInventoryDrawerExpanded}
                  onSelectItem={selectInventoryItem}
                />
              </div>
            </div>
          </div>

          <PlayerResponsePresenter
            project={project}
            activeResponse={activeResponse}
            locale={locale}
            strings={strings}
            resolveSourcePath={resolveSourcePath}
            presentation={presentation}
            copy={copy}
            volume={volume}
            onComplete={onResponseComplete ?? NOOP_RESPONSE_COMPLETE}
          />
        </div>

        <InventoryCursorPreview
          imageSrc={selectedInventoryItem ? inventoryImageUrls[selectedInventoryItem.id] : undefined}
          label={selectedInventoryLabel}
          point={inventoryCursorPoint}
          inventoryLabel={copy.inventory}
        />
      </>
    );
  }
);

function PlayerHotspotButton({
  hotspot,
  surfaceSize,
  visual,
  alphaMask,
  showHotspots,
  sceneInteractionBlocked,
  ariaLabel,
  onActivate
}: {
  hotspot: Hotspot;
  surfaceSize?: HotspotSurfaceSize;
  visual?: PlayerHotspotVisual & { url?: string };
  alphaMask?: HotspotVisualAlphaMask;
  showHotspots: boolean;
  sceneInteractionBlocked: boolean;
  ariaLabel: string;
  onActivate: () => void;
}) {
  const bounds = resolveHotspotBounds(hotspot);
  const relativeFrame = surfaceSize ? resolveRelativeHotspotFrame(hotspot, surfaceSize) : undefined;
  const relativePolygon = hotspot.inventoryItemId && relativeFrame
    ? relativeFrame.polygon
    : resolveRelativeHotspotPolygon(hotspot);
  const clipPath = resolveRelativeHotspotClipPath(relativePolygon);
  const rotationDegrees = hotspot.inventoryItemId && relativeFrame
    ? relativeFrame.rotationDegrees
    : resolveHotspotRotationDegrees(hotspot);
  const visualBox = resolveRelativeHotspotVisualBox(hotspot, surfaceSize ?? { width: 1, height: 1 });
  const [isPointerOverOpaquePixel, setIsPointerOverOpaquePixel] = useState(false);
  const usesAlphaAwarePointerFeedback = Boolean(visual?.url);
  const isOpaquePointerEvent = (
    event: Pick<MouseEvent<HTMLButtonElement>, "clientX" | "clientY" | "currentTarget">
  ) => {
    if (!visual?.url || !alphaMask) {
      return false;
    }

    const eventBounds = event.currentTarget.getBoundingClientRect();
    return isOpaqueHotspotVisualHit(alphaMask, {
      pointX: event.clientX - eventBounds.left,
      pointY: event.clientY - eventBounds.top,
      hotspotWidth: eventBounds.width,
      hotspotHeight: eventBounds.height,
      visualBox,
      rotationDegrees,
      imageWidth: alphaMask.width,
      imageHeight: alphaMask.height
    });
  };
  const handlePointerFeedback = (event: MouseEvent<HTMLButtonElement>) => {
    if (!usesAlphaAwarePointerFeedback) {
      return;
    }
    setIsPointerOverOpaquePixel(alphaMask ? isOpaquePointerEvent(event) : false);
  };
  const buttonClassName = [
    "mage2-player__hotspot-button",
    showHotspots ? "mage2-player__hotspot-button--debug" : "mage2-player__hotspot-button--hidden",
    usesAlphaAwarePointerFeedback && !isPointerOverOpaquePixel
      ? "mage2-player__hotspot-button--pointer-inactive"
      : undefined
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="mage2-player__hotspot"
      style={{
        left: `${bounds.x * 100}%`,
        top: `${bounds.y * 100}%`,
        width: `${bounds.width * 100}%`,
        height: `${bounds.height * 100}%`
      }}
    >
      {visual?.url ? (
        <div className="mage2-player__hotspot-visual-frame" style={{ clipPath }} aria-hidden="true">
          <div
            className="mage2-player__hotspot-visual-content"
            style={resolvePlayerHotspotVisualContentStyle(visualBox, rotationDegrees)}
          >
            <img src={visual.url} alt="" className="mage2-player__hotspot-visual" draggable={false} />
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={buttonClassName}
        style={{
          clipPath,
          ...(usesAlphaAwarePointerFeedback
            ? { cursor: isPointerOverOpaquePixel ? "pointer" : "default" }
            : undefined)
        }}
        aria-label={ariaLabel}
        aria-disabled={sceneInteractionBlocked || undefined}
        tabIndex={sceneInteractionBlocked ? -1 : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (sceneInteractionBlocked) {
            return;
          }
          if (visual?.url && alphaMask && !isOpaquePointerEvent(event)) {
            setIsPointerOverOpaquePixel(false);
            return;
          }
          onActivate();
        }}
        onMouseEnter={handlePointerFeedback}
        onMouseMove={handlePointerFeedback}
        onMouseLeave={() => setIsPointerOverOpaquePixel(false)}
      >
        <span className="mage2-player__hotspot-beacon" aria-hidden="true" />
      </button>
    </div>
  );
}

function useResolvedSource(sourcePath: string | undefined, resolver: PlayerSourceResolver): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    if (!sourcePath) {
      setUrl(undefined);
      return;
    }

    void resolver(sourcePath)
      .then((nextUrl) => {
        if (!cancelled) {
          setUrl(nextUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUrl(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [resolver, sourcePath]);
  return url;
}

function useResolvedSourceMap(
  sourcePaths: Record<string, string | undefined>,
  resolver: PlayerSourceResolver
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const signature = Object.entries(sourcePaths)
    .map(([id, path]) => `${id}:${path ?? ""}`)
    .sort()
    .join("|");

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(sourcePaths);
    if (entries.length === 0) {
      setUrls({});
      return;
    }

    void Promise.all(
      entries.map(async ([id, sourcePath]) => {
        if (!sourcePath) {
          return undefined;
        }
        try {
          return [id, await resolver(sourcePath)] as const;
        } catch {
          return undefined;
        }
      })
    ).then((resolvedEntries) => {
      if (!cancelled) {
        setUrls(
          Object.fromEntries(resolvedEntries.filter((entry): entry is readonly [string, string] => Boolean(entry)))
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [resolver, signature]);

  return urls;
}

function useHotspotAlphaMasks(urls: Record<string, string>): Record<string, HotspotVisualAlphaMask> {
  const [masks, setMasks] = useState<Record<string, HotspotVisualAlphaMask>>({});
  const signature = Object.entries(urls)
    .map(([id, url]) => `${id}:${url}`)
    .sort()
    .join("|");

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(urls);
    if (entries.length === 0) {
      setMasks({});
      return;
    }

    void Promise.all(
      entries.map(async ([id, url]) => {
        try {
          const mask = await loadHotspotVisualAlphaMask(url);
          return mask ? ([id, mask] as const) : undefined;
        } catch {
          return undefined;
        }
      })
    ).then((resolvedEntries) => {
      if (!cancelled) {
        setMasks(
          Object.fromEntries(
            resolvedEntries.filter(
              (entry): entry is readonly [string, HotspotVisualAlphaMask] => Boolean(entry)
            )
          )
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [signature]);

  return masks;
}

function useControlledVideoPlayback(options: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  assetId?: string;
  assetUrl?: string;
  assetDurationMs?: number;
  loop: boolean;
  playheadMs: number;
  playbackResetKey?: string | number;
  onPlayheadMsChange?: (playheadMs: number) => void;
  paused?: boolean;
}) {
  const {
    videoRef,
    assetId,
    assetUrl,
    assetDurationMs,
    loop,
    playheadMs,
    playbackResetKey,
    onPlayheadMsChange,
    paused = false
  } = options;
  const latestPlayheadRef = useRef(playheadMs);
  const latestOnPlayheadChangeRef = useRef(onPlayheadMsChange);
  const previousAssetKeyRef = useRef<string | undefined>(undefined);
  const previousResetKeyRef = useRef(playbackResetKey);

  useEffect(() => {
    latestPlayheadRef.current = playheadMs;
    latestOnPlayheadChangeRef.current = onPlayheadMsChange;
  }, [onPlayheadMsChange, playheadMs]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !assetId || !assetUrl) {
      return;
    }

    const assetKey = `${assetId}:${assetUrl}`;
    const assetChanged = previousAssetKeyRef.current !== assetKey;
    const resetRequested = previousResetKeyRef.current !== playbackResetKey;
    previousAssetKeyRef.current = assetKey;
    previousResetKeyRef.current = playbackResetKey;
    if (!assetChanged && !resetRequested) {
      return;
    }

    syncVideoFromPlayhead(video, resetRequested ? 0 : playheadMs, assetDurationMs);
  }, [assetDurationMs, assetId, assetUrl, playbackResetKey, playheadMs, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !assetId || !assetUrl) {
      return;
    }
    if (paused) {
      video.pause();
      return;
    }
    void video.play().catch(() => {
      // Autoplay may be unavailable; user interaction can still start playback.
    });
  }, [assetId, assetUrl, paused, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onPlayheadMsChange) {
      return;
    }
    syncVideoFromPlayhead(video, playheadMs, assetDurationMs);
  }, [assetDurationMs, assetId, assetUrl, onPlayheadMsChange, playheadMs, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onPlayheadMsChange) {
      return;
    }

    let animationFrameId: number | undefined;
    const cancelFrame = () => {
      if (animationFrameId !== undefined) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = undefined;
      }
    };
    const syncFromClock = () => {
      const nextPlayheadMs = getVideoPlayheadMs(video.currentTime, video.duration, assetDurationMs);
      if (shouldSyncPlayheadMs(latestPlayheadRef.current, nextPlayheadMs)) {
        latestOnPlayheadChangeRef.current?.(nextPlayheadMs);
      }
    };
    const step = () => {
      syncFromClock();
      if (!video.paused && !video.ended) {
        animationFrameId = window.requestAnimationFrame(step);
      }
    };
    const start = () => {
      cancelFrame();
      step();
    };
    const stop = () => {
      cancelFrame();
      syncFromClock();
    };

    if (!video.paused && !video.ended) {
      start();
    }
    video.addEventListener("play", start);
    video.addEventListener("pause", stop);
    video.addEventListener("ended", loop ? start : stop);
    video.addEventListener("seeked", syncFromClock);
    return () => {
      cancelFrame();
      video.removeEventListener("play", start);
      video.removeEventListener("pause", stop);
      video.removeEventListener("ended", loop ? start : stop);
      video.removeEventListener("seeked", syncFromClock);
    };
  }, [assetDurationMs, assetId, assetUrl, loop, onPlayheadMsChange, videoRef]);
}

function syncVideoFromPlayhead(video: HTMLVideoElement, playheadMs: number, fallbackDurationMs?: number) {
  const durationMs = resolvePlayableDurationMs(video.duration, fallbackDurationMs);
  const nextPlayheadMs = clampPlayheadMs(playheadMs, durationMs);
  const currentPlayheadMs = getVideoPlayheadMs(video.currentTime, video.duration, fallbackDurationMs);
  if (shouldSyncPlayheadMs(currentPlayheadMs, nextPlayheadMs)) {
    video.currentTime = nextPlayheadMs / 1000;
  }
}

export function resolveInventoryCursorPreviewFrameStyle(
  point: PlayerCursorPoint,
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

function InventoryCursorPreview({
  imageSrc,
  label,
  point,
  inventoryLabel
}: {
  imageSrc?: string;
  label?: string;
  point?: PlayerCursorPoint;
  inventoryLabel: string;
}) {
  if (!imageSrc || !point || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div aria-label={label ? `${inventoryLabel}: ${label}` : inventoryLabel} role="img" style={resolveInventoryCursorPreviewFrameStyle(point)}>
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

export function resolvePlayerMediaAspectRatioStyle(
  width: number | undefined,
  height: number | undefined
): CSSProperties | undefined {
  if (!isPositiveFiniteNumber(width) || !isPositiveFiniteNumber(height)) {
    return undefined;
  }
  return {
    aspectRatio: `${width} / ${height}`,
    "--mage2-player-media-aspect": width / height
  } as CSSProperties;
}

export function resolvePlayerHotspotVisualContentStyle(
  visualBox: { x: number; y: number; width: number; height: number },
  rotationDegrees: number
): CSSProperties {
  return {
    left: `${visualBox.x * 100}%`,
    top: `${visualBox.y * 100}%`,
    width: `${visualBox.width * 100}%`,
    height: `${visualBox.height * 100}%`,
    ...(Math.abs(rotationDegrees) > 0.001 ? { transform: `rotate(${rotationDegrees}deg)` } : undefined)
  };
}

export function resolveRelativeHotspotClipPath(polygon?: Array<{ x: number; y: number }>): string | undefined {
  if (!polygon || polygon.length === 0) {
    return undefined;
  }
  return `polygon(${polygon.map((point) => `${formatPercent(point.x)} ${formatPercent(point.y)}`).join(", ")})`;
}

function formatPercent(value: number): string {
  const percent = Math.max(0, Math.min(1, value)) * 100;
  return `${Math.round(percent * 10000) / 10000}%`;
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function resolvePlayerHotspotTitle(hotspot: Hotspot, strings: Record<string, string>): string {
  const comment = hotspot.commentTextId ? strings[hotspot.commentTextId]?.replace(/\s+/g, " ").trim() : undefined;
  return hotspot.name || comment || hotspot.id;
}

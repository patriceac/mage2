import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  resolveHotspotInventoryAction,
  resolveHotspotRotationDegrees,
  resolveRelativeHotspotFrame,
  type Asset,
  type Effect,
  type GameVariableDefinition,
  type Hotspot,
  type HotspotEvent,
  type ProjectBundle,
  type ResponseGroup
} from "@mage2/schema";
import { resolveHotspotTimingWindow } from "@mage2/player";
import { DropdownSelect } from "../../DropdownSelect";
import {
  applyHotspotBounds,
  formatHotspotCoordinate,
  formatHotspotRotationDegrees,
  type HotspotSurfaceSize
} from "../../hotspot-geometry";
import {
  clampFloatingWindowPosition,
  resolveNextFloatingWindowPosition,
  type FloatingWindowPosition
} from "../../floating-window";
import { setEditorLocalizedText } from "../../localized-project";
import { useEditorI18n } from "../../i18n/EditorI18nProvider";
import type { EditorTranslator } from "../../i18n/translate";
import { ConditionListEditor, EffectListEditor } from "../../logic/RuleBuilder";
import {
  applyHotspotFeedbackValue,
  applyHotspotEventActionUpdate,
  applyHotspotInventoryAction,
  effectsAlwaysTransitionToScene,
  resolveHotspotFeedbackValue,
  resolveHotspotInventoryActionSummary,
  resolveHotspotInventoryActivationSummary,
  updateOptionalHotspotEvent,
  type HotspotInventoryActionType
} from "./hotspot-domain";
import type { LinkedInventoryOption } from "./inventory-placement-domain";
import {
  MAX_HOTSPOT_INSPECTOR_DOCK_WIDTH,
  MIN_HOTSPOT_INSPECTOR_DOCK_WIDTH,
  type HotspotInspectorPresentation
} from "./scene-domain";
import { SceneInspectorPresentationIcon } from "./SceneEditorIcons";
import { getFloatingWindowSize, getViewportSize, shouldStartFloatingWindowDrag } from "./floating-window-dom";

interface HotspotInspectorWindowProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  activeLocale: string;
  assets: ProjectBundle["assets"]["assets"];
  dialogueOptions: ProjectBundle["dialogues"]["items"];
  dockWidth: number;
  foregroundMediaAssets: Asset[];
  responseGroups: ProjectBundle["dialogues"]["responseGroups"];
  inventoryItemOptions: LinkedInventoryOption[];
  localeStrings: Record<string, string>;
  project: ProjectBundle;
  presentation: HotspotInspectorPresentation;
  position?: FloatingWindowPosition;
  rotationSurfaceSize?: HotspotSurfaceSize;
  sceneTimelineDurationMs: number;
  scenes: ProjectBundle["scenes"]["items"];
  selectedHotspot: Hotspot;
  mutateSelectedHotspot: (mutator: (hotspot: Hotspot, draft: ProjectBundle) => void) => void;
  onRotationDegreesChange: (rotationDegrees: number) => void;
  onPositionChange: React.Dispatch<React.SetStateAction<FloatingWindowPosition | undefined>>;
  onDockWidthChange: (width: number) => void;
  onPresentationChange: (presentation: HotspotInspectorPresentation) => void;
  onInteractionActiveChange: (active: boolean) => void;
  onImportInteractionMedia: (hotspot: Hotspot) => void;
  onDismiss: () => void;
}

const HOTSPOT_INSPECTOR_FALLBACK_SIZE = {
  width: 736,
  height: 800
};
const identityEditorTranslator: EditorTranslator = (source, params = {}) =>
  source.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder
  );

function effectsContainConditional(effects: readonly Effect[]): boolean {
  return effects.some((effect) => effect.type === "conditional");
}

function resolveDockWidthForViewport(width: number): number {
  const viewportLimit = typeof window === "undefined"
    ? MAX_HOTSPOT_INSPECTOR_DOCK_WIDTH
    : Math.max(MIN_HOTSPOT_INSPECTOR_DOCK_WIDTH, window.innerWidth - 520);
  return Math.min(
    Math.max(Math.round(width), MIN_HOTSPOT_INSPECTOR_DOCK_WIDTH),
    Math.min(MAX_HOTSPOT_INSPECTOR_DOCK_WIDTH, viewportLimit)
  );
}

const useFloatingWindowLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function HotspotInspectorWindow({
  anchorRef,
  activeLocale,
  assets,
  dialogueOptions,
  dockWidth,
  foregroundMediaAssets,
  responseGroups,
  inventoryItemOptions,
  localeStrings,
  project,
  presentation,
  position,
  rotationSurfaceSize,
  sceneTimelineDurationMs,
  scenes,
  selectedHotspot,
  mutateSelectedHotspot,
  onRotationDegreesChange,
  onPositionChange,
  onDockWidthChange,
  onPresentationChange,
  onInteractionActiveChange,
  onImportInteractionMedia,
  onDismiss
}: HotspotInspectorWindowProps) {
  const { t } = useEditorI18n();
  const inspectorRef = useRef<HTMLElement>(null);
  const dragCleanupRef = useRef<(() => void) | undefined>(undefined);
  const dockResizeCleanupRef = useRef<(() => void) | undefined>(undefined);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusedWithin, setIsFocusedWithin] = useState(false);

  useFloatingWindowLayoutEffect(() => {
    if (typeof window === "undefined" || presentation !== "floating") {
      return;
    }

    const syncPosition = () => {
      const viewport = getViewportSize();
      const size = getFloatingWindowSize(inspectorRef.current, HOTSPOT_INSPECTOR_FALLBACK_SIZE);
      const anchorRect = anchorRef.current?.getBoundingClientRect();
      const actionRailRect = anchorRef.current
        ?.querySelector<HTMLElement>(".scenes-panel__action-rail")
        ?.getBoundingClientRect();
      const selectedHotspotRect = resolveSelectedHotspotRect();
      const inspectorAnchor = actionRailRect
        ? {
            top: anchorRect?.top ?? actionRailRect.top,
            right: actionRailRect.left
          }
        : anchorRect
          ? {
              top: anchorRect.top,
              right: anchorRect.right
            }
          : undefined;

      onPositionChange((currentPosition) => {
        return resolveNextFloatingWindowPosition(
          currentPosition,
          size,
          viewport,
          selectedHotspotRect,
          inspectorAnchor
        );
      });
    };

    syncPosition();

    const handleResize = () => {
      syncPosition();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [anchorRef, onPositionChange, presentation, selectedHotspot.id]);

  const selectedHotspotRotationDegrees = rotationSurfaceSize
    ? resolveRelativeHotspotFrame(selectedHotspot, rotationSurfaceSize).rotationDegrees
    : resolveHotspotRotationDegrees(selectedHotspot);
  const selectedHotspotTimingWindow = resolveHotspotTimingWindow(selectedHotspot, sceneTimelineDurationMs);
  const isUsingSceneDurationTiming = selectedHotspot.timingMode === "sceneDuration";
  const inventoryAction = resolveHotspotInventoryAction(selectedHotspot);
  const isPlacementHotspot = inventoryAction.type === "placeItem";
  const placementItemLabel = inventoryAction.itemId
    ? inventoryItemOptions
        .find((option) => option.itemId === inventoryAction.itemId)
        ?.baseLabel ?? inventoryAction.itemId
    : t("configured item");
  const primaryHotspotEventLabel = isPlacementHotspot ? t("Use {itemLabel}", { itemLabel: placementItemLabel }) : t("On click");

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dockResizeCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    onInteractionActiveChange(isHovered || isFocusedWithin);
  }, [isFocusedWithin, isHovered, onInteractionActiveChange]);

  useEffect(() => {
    return () => {
      onInteractionActiveChange(false);
    };
  }, [onInteractionActiveChange]);

  function startDrag(event: React.MouseEvent<HTMLElement>) {
    if (presentation !== "floating" || event.button !== 0 || typeof window === "undefined") {
      return;
    }

    const inspectorElement = inspectorRef.current;
    if (!inspectorElement || !shouldStartFloatingWindowDrag(event.target)) {
      return;
    }

    event.preventDefault();
    dragCleanupRef.current?.();

    const bounds = inspectorElement.getBoundingClientRect();
    const dragOffsetX = event.clientX - bounds.left;
    const dragOffsetY = event.clientY - bounds.top;
    const body = document.body;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    body.style.cursor = "grabbing";
    body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const size = getFloatingWindowSize(inspectorRef.current, HOTSPOT_INSPECTOR_FALLBACK_SIZE);
      const viewport = getViewportSize();
      onPositionChange(
        clampFloatingWindowPosition(
          {
            x: moveEvent.clientX - dragOffsetX,
            y: moveEvent.clientY - dragOffsetY
          },
          size,
          viewport
        )
      );
    };

    const finishDrag = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", finishDrag);
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
      dragCleanupRef.current = undefined;
    };

    dragCleanupRef.current = finishDrag;

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", finishDrag);
  }

  function startDockResize(event: React.PointerEvent<HTMLElement>) {
    if (presentation !== "docked" || event.button !== 0 || typeof window === "undefined") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dockResizeCleanupRef.current?.();

    const startX = event.clientX;
    const startWidth = dockWidth;
    const body = document.body;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    body.style.cursor = "col-resize";
    body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      onDockWidthChange(resolveDockWidthForViewport(startWidth + startX - moveEvent.clientX));
    };

    const finishResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
      dockResizeCleanupRef.current = undefined;
    };

    dockResizeCleanupRef.current = finishResize;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
  }

  function handleDockResizeKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") {
      return;
    }

    event.preventDefault();
    if (event.key === "Home") {
      onDockWidthChange(MIN_HOTSPOT_INSPECTOR_DOCK_WIDTH);
      return;
    }

    if (event.key === "End") {
      onDockWidthChange(resolveDockWidthForViewport(MAX_HOTSPOT_INSPECTOR_DOCK_WIDTH));
      return;
    }

    onDockWidthChange(
      resolveDockWidthForViewport(dockWidth + (event.key === "ArrowLeft" ? 16 : -16))
    );
  }

  const inspectorTitleId = `hotspot-inspector-title-${selectedHotspot.id}`;
  const hasConditionalActions = [
    selectedHotspot.effects,
    selectedHotspot.clickEvent?.effects ?? [],
    selectedHotspot.otherItemEvent?.effects ?? []
  ].some(effectsContainConditional);
  const hasAvailabilityRestrictions = selectedHotspot.conditions.some((condition) => condition.type !== "always");
  const inspectorClassName = [
    "panel",
    "scenes-floating-inspector",
    presentation === "docked" ? "scenes-floating-inspector--docked" : "",
    presentation === "floating" && position ? "scenes-floating-inspector--ready" : "",
    hasConditionalActions ? "scenes-floating-inspector--logic-wide" : ""
  ].filter(Boolean).join(" ");
  const inspectorStyle: CSSProperties = {
    ...(presentation === "floating" && position
      ? { left: `${position.x}px`, top: `${position.y}px` }
      : {}),
    ...(presentation === "docked"
      ? { "--hotspot-inspector-dock-width": `${dockWidth}px` }
      : {})
  } as CSSProperties;
  const nextPresentation: HotspotInspectorPresentation = presentation === "docked" ? "floating" : "docked";
  const presentationActionLabel = t(nextPresentation === "floating" ? "Float" : "Dock right");

  return (
    <div
      className={[
        "scenes-floating-inspector-layer",
        presentation === "docked" ? "scenes-floating-inspector-layer--docked" : ""
      ].filter(Boolean).join(" ")}
    >
      <aside
        ref={inspectorRef}
        role={presentation === "docked" ? "complementary" : "dialog"}
        aria-labelledby={inspectorTitleId}
        onMouseDown={presentation === "floating" ? startDrag : undefined}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setIsFocusedWithin(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsFocusedWithin(false);
          }
        }}
        className={inspectorClassName}
        style={inspectorStyle}
      >
        {presentation === "docked" ? (
          <div
            className="scenes-floating-inspector__resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("Resize hotspot inspector")}
            aria-valuemin={MIN_HOTSPOT_INSPECTOR_DOCK_WIDTH}
            aria-valuemax={MAX_HOTSPOT_INSPECTOR_DOCK_WIDTH}
            aria-valuenow={dockWidth}
            tabIndex={0}
            onPointerDown={startDockResize}
            onKeyDown={handleDockResizeKeyDown}
          />
        ) : null}
        <header className="scenes-floating-inspector__header">
          <div className="scenes-floating-inspector__title-group">
            <p className="eyebrow">{t("Hotspot Inspector")}</p>
            <h3 id={inspectorTitleId}>{t("Hotspot Inspector")}</h3>
          </div>
          <div className="scenes-floating-inspector__header-actions">
            <button
              type="button"
              className="button-secondary scenes-floating-inspector__presentation-toggle"
              aria-label={presentationActionLabel}
              title={presentationActionLabel}
              onClick={() => onPresentationChange(nextPresentation)}
            >
              <SceneInspectorPresentationIcon target={nextPresentation} />
            </button>
            <button
              type="button"
              className="button-secondary scenes-floating-inspector__close"
              aria-label={t("Close hotspot inspector")}
              title={t("Hide the floating hotspot inspector.")}
              onClick={onDismiss}
            >
              <span aria-hidden="true">x</span>
            </button>
          </div>
        </header>

        <div className="scenes-floating-inspector__body">
          <div className="scenes-floating-inspector__sections">
            <details open className="scenes-floating-inspector__section">
              <summary className="scenes-floating-inspector__section-title">{t("Identity")}</summary>
            <label title={t("Visible hotspot title shown in the editor and runtime.")}>
              <span className="field-label--inset">{t("Name")}</span>
              <input
                value={selectedHotspot.name}
                title={t("Visible hotspot title shown in the editor and runtime.")}
                onChange={(event) =>
                  mutateSelectedHotspot((hotspot) => {
                    hotspot.name = event.target.value;
                  })
                }
              />
            </label>
            <label title={t("Optional secondary text shown inside this hotspot under the main label.")}>
              <span className="field-label--inset">{t("Comment")}</span>
              <input
                value={selectedHotspot.commentTextId ? localeStrings[selectedHotspot.commentTextId] ?? "" : ""}
                onChange={(event) =>
                  mutateSelectedHotspot((hotspot, draft) => {
                    hotspot.commentTextId ??= `text.${hotspot.id}.comment`;
                    setEditorLocalizedText(draft, activeLocale, hotspot.commentTextId, event.target.value);
                  })
                }
              />
            </label>
            </details>
            <details className="scenes-floating-inspector__section">
              <summary className="scenes-floating-inspector__section-title">{t("Action")}</summary>
            <HotspotInventoryActionControls
              inventoryAction={resolveHotspotInventoryAction(selectedHotspot)}
              inventoryItemOptions={inventoryItemOptions}
              selectedHotspot={selectedHotspot}
              mutateSelectedHotspot={mutateSelectedHotspot}
            />
            </details>
            <details className="scenes-floating-inspector__section">
              <summary className="scenes-floating-inspector__section-title">{t("Geometry")}</summary>
            <div className="four-grid">
              {(
                [
                  ["x", "X", t("Horizontal position of the hotspot bounds as a normalized value from 0 to 1.")],
                  ["y", "Y", t("Vertical position of the hotspot bounds as a normalized value from 0 to 1.")],
                  ["width", "W", t("Hotspot bounds width as a normalized percentage of the scene surface.")],
                  ["height", "H", t("Hotspot bounds height as a normalized percentage of the scene surface.")]
                ] as const
              ).map(([field, label, tooltip]) => (
                <label key={field} title={tooltip}>
                  <span className="field-label--inset">{label}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formatHotspotCoordinate(selectedHotspot[field])}
                    title={tooltip}
                    onChange={(event) =>
                      mutateSelectedHotspot((hotspot) => {
                        const nextGeometry = applyHotspotBounds(
                          {
                            inventoryItemId: hotspot.inventoryItemId,
                            x: hotspot.x,
                            y: hotspot.y,
                            width: hotspot.width,
                            height: hotspot.height,
                            polygon: hotspot.polygon
                          },
                          {
                            x: field === "x" ? Number(event.target.value) : hotspot.x,
                            y: field === "y" ? Number(event.target.value) : hotspot.y,
                            width: field === "width" ? Number(event.target.value) : hotspot.width,
                            height: field === "height" ? Number(event.target.value) : hotspot.height
                          }
                        );

                        hotspot.x = nextGeometry.x;
                        hotspot.y = nextGeometry.y;
                        hotspot.width = nextGeometry.width;
                        hotspot.height = nextGeometry.height;
                        hotspot.polygon = nextGeometry.polygon;
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="stack-inline">
              <label title={t("Rendered rotation angle in degrees for this hotspot.")}>
                  <span className="field-label--inset">{t("Angle (degrees)")}</span>
                  <input
                    type="number"
                    step="0.1"
                    value={formatHotspotRotationDegrees(selectedHotspotRotationDegrees)}
                    title={t("Rendered rotation angle in degrees for this hotspot.")}
                    disabled={!rotationSurfaceSize}
                    onChange={(event) => {
                      const nextRotationDegrees = Number(event.target.value);
                      if (!Number.isFinite(nextRotationDegrees)) {
                        return;
                      }

                      onRotationDegreesChange(nextRotationDegrees);
                    }}
                  />
              </label>
            </div>
            </details>
            <details className="scenes-floating-inspector__section scenes-floating-inspector__section--timing">
              <summary className="scenes-floating-inspector__section-title">{t("Timing")}</summary>
            <div className="stack-inline">
              <label
                className="scene-video-loop-toggle scenes-hotspot-duration-toggle"
                title={t("Keep this hotspot active for the full scene timeline.")}
              >
                <input
                  type="checkbox"
                  checked={isUsingSceneDurationTiming}
                  onChange={(event) =>
                    mutateSelectedHotspot((hotspot) => {
                      if (event.target.checked) {
                        hotspot.timingMode = "sceneDuration";
                        hotspot.startMs = 0;
                        hotspot.endMs = sceneTimelineDurationMs;
                        return;
                      }

                      hotspot.timingMode = "fixed";
                      hotspot.startMs = selectedHotspotTimingWindow.startMs;
                      hotspot.endMs = selectedHotspotTimingWindow.endMs;
                    })
                  }
                />
                <span>{t("Use scene duration")}</span>
              </label>
            </div>
            <div className="stack-inline scenes-floating-inspector__timing-fields">
              <label title={t("Time in milliseconds when this hotspot becomes clickable.")}>
                <span className="field-label--inset">{t("Start (ms)")}</span>
                <input
                  type="number"
                  value={selectedHotspotTimingWindow.startMs}
                  title={t("Time in milliseconds when this hotspot becomes clickable.")}
                  disabled={isUsingSceneDurationTiming}
                  onChange={(event) =>
                    mutateSelectedHotspot((hotspot) => {
                      hotspot.timingMode = "fixed";
                      hotspot.startMs = Number(event.target.value);
                    })
                  }
                />
              </label>
              <label title={t("Time in milliseconds when this hotspot stops being clickable.")}>
                <span className="field-label--inset">{t("End (ms)")}</span>
                <input
                  type="number"
                  value={selectedHotspotTimingWindow.endMs}
                  title={t("Time in milliseconds when this hotspot stops being clickable.")}
                  disabled={isUsingSceneDurationTiming}
                  onChange={(event) =>
                    mutateSelectedHotspot((hotspot) => {
                      hotspot.timingMode = "fixed";
                      hotspot.endMs = Number(event.target.value);
                    })
                  }
                />
              </label>
            </div>
            </details>
            <details
              open={hasAvailabilityRestrictions}
              className="scenes-floating-inspector__section scenes-floating-inspector__section--availability"
            >
              <summary className="scenes-floating-inspector__section-title">{t("Availability")}</summary>
              <ConditionListEditor
                compact
                project={project}
                label={t("Available when")}
                description={t("Choose when this hotspot appears and can be used. Every condition uses names from this project.")}
                conditions={selectedHotspot.conditions}
                mode={selectedHotspot.conditionMode ?? "all"}
                onChange={(conditions, conditionMode, variables) =>
                  mutateSelectedHotspot((hotspot, draft) => {
                    hotspot.conditions = conditions;
                    hotspot.conditionMode = conditionMode;
                    if (variables) draft.manifest.variables = variables;
                  })
                }
              />
            </details>
            {isPlacementHotspot ? (
              <HotspotEventSection
                project={project}
                open
                title={t("On click")}
                description={t("Runs only when the player clicks this hotspot without an inventory item selected. Leave every field empty for no response.")}
                event={selectedHotspot.clickEvent ?? { effects: [] }}
                scenes={scenes}
                dialogueOptions={dialogueOptions}
                responseGroups={responseGroups}
                assets={assets}
                localeStrings={localeStrings}
                onChange={(mutator, variables) =>
                  mutateSelectedHotspot((hotspot, draft) => {
                    updateOptionalHotspotEvent(hotspot, "clickEvent", mutator);
                    if (variables) draft.manifest.variables = variables;
                  })
                }
              />
            ) : null}
            <HotspotEventSection
              project={project}
              open
              title={primaryHotspotEventLabel}
              description={
                isPlacementHotspot
                  ? t("Runs only when {itemLabel} is selected and used on this hotspot.", { itemLabel: placementItemLabel })
                  : t("Runs when the player clicks this hotspot without an inventory item selected.")
              }
              event={selectedHotspot}
              scenes={scenes}
              dialogueOptions={dialogueOptions}
              responseGroups={responseGroups}
              assets={assets}
              localeStrings={localeStrings}
              onChange={(mutator, variables) =>
                mutateSelectedHotspot((hotspot, draft) => {
                  mutator(hotspot);
                  if (variables) draft.manifest.variables = variables;
                })
              }
            />
            {isPlacementHotspot || selectedHotspot.otherItemEvent ? (
              <HotspotEventSection
                project={project}
                title={isPlacementHotspot ? t("Any other item") : t("Use any item")}
                description={
                  isPlacementHotspot
                    ? t("Runs only when the player uses a selected item other than {itemLabel}. Leave every field empty for no response.", { itemLabel: placementItemLabel })
                    : t("Runs when the player uses any selected inventory item on this hotspot. Leave every field empty for no response.")
                }
                event={selectedHotspot.otherItemEvent ?? { effects: [] }}
                scenes={scenes}
                dialogueOptions={dialogueOptions}
                responseGroups={responseGroups}
                assets={assets}
                localeStrings={localeStrings}
                onChange={(mutator, variables) =>
                  mutateSelectedHotspot((hotspot, draft) => {
                    updateOptionalHotspotEvent(hotspot, "otherItemEvent", mutator);
                    if (variables) draft.manifest.variables = variables;
                  })
                }
              />
            ) : null}
            <details open className="scenes-floating-inspector__section">
              <summary className="scenes-floating-inspector__section-title">{t("Interaction Media")}</summary>
              <label title={t("Audio or video that plays once when this hotspot is activated, independently of scene background media.")}>
                <span className="field-label--inset">{t("Foreground Media")}</span>
                <DropdownSelect
                  value={selectedHotspot.mediaAssetId ?? ""}
                  onChange={(event) =>
                    mutateSelectedHotspot((hotspot) => {
                      hotspot.mediaAssetId = event.target.value || undefined;
                    })
                  }
                >
                  <option value="">{t("No interaction media")}</option>
                  {selectedHotspot.mediaAssetId &&
                  !foregroundMediaAssets.some((asset) => asset.id === selectedHotspot.mediaAssetId) ? (
                    <option value={selectedHotspot.mediaAssetId}>{t("Missing foreground media")}</option>
                  ) : null}
                  {foregroundMediaAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name} ({asset.kind})
                    </option>
                  ))}
                </DropdownSelect>
              </label>
              <div className="scenes-floating-inspector__interaction-media-actions">
                <button type="button" className="button-secondary" onClick={() => onImportInteractionMedia(selectedHotspot)}>
                  {t("Import Audio / Video")}
                </button>
                <p className="muted scenes-floating-inspector__interaction-media-note">
                  {t("Plays once on activation; it does not replace or loop with the scene background.")}
                </p>
              </div>
            </details>
          </div>
        </div>
      </aside>
    </div>
  );
}

interface HotspotEventSectionProps {
  project: ProjectBundle;
  title: string;
  description: string;
  event: HotspotEvent;
  scenes: ProjectBundle["scenes"]["items"];
  assets: ProjectBundle["assets"]["assets"];
  dialogueOptions: ProjectBundle["dialogues"]["items"];
  responseGroups: ProjectBundle["dialogues"]["responseGroups"];
  localeStrings: Record<string, string>;
  open?: boolean;
  onChange: (mutator: (event: HotspotEvent) => void, variables?: GameVariableDefinition[]) => void;
}

function HotspotEventSection({
  project,
  title,
  description,
  event,
  scenes,
  assets,
  dialogueOptions,
  responseGroups,
  localeStrings,
  open,
  onChange
}: HotspotEventSectionProps) {
  const { t } = useEditorI18n();
  const feedbackValue = resolveHotspotFeedbackValue(event);
  const feedbackOptions = buildHotspotFeedbackOptions(responseGroups, dialogueOptions, assets, localeStrings, t);
  const hasActions = event.effects.length > 0;
  const hasReachableFallbackScene = Boolean(event.targetSceneId) && !effectsAlwaysTransitionToScene(event.effects);
  return (
    <details open={open} className="scenes-floating-inspector__section">
      <summary className="scenes-floating-inspector__section-title">{title}</summary>
      <p className="muted">{description}</p>
      <EffectListEditor
        compact
        project={project}
        label={t("Actions")}
        description={t("Decide what happens when this interaction occurs. Actions run in order.")}
        effects={event.effects}
        onChange={(effects, variables) =>
          onChange((hotspotEvent) => { applyHotspotEventActionUpdate(hotspotEvent, effects); }, variables)
        }
      />
      {!hasActions || hasReachableFallbackScene ? (
        <label title={hasActions
          ? t("Used only if the actions above do not already go to a scene for {eventTitle}.", { eventTitle: title })
          : t("Scene that should open for {eventTitle}.", { eventTitle: title })}>
          <span className="field-label--inset">{hasActions ? t("Fallback Scene") : t("Target Scene")}</span>
          <DropdownSelect
            value={event.targetSceneId ?? ""}
            onChange={(changeEvent) =>
              onChange((hotspotEvent) => {
                hotspotEvent.targetSceneId = changeEvent.target.value || undefined;
              })
            }
          >
            <option value="">{t("None")}</option>
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </DropdownSelect>
          {hasActions ? (
            <span className="scenes-event-transition-note">
              {t("Used only when the actions above do not already go to a scene.")}
            </span>
          ) : null}
        </label>
      ) : (
        <p className="muted scenes-event-transition-note">
          {t("Add scene changes as Go to scene actions above.")}
        </p>
      )}
      <label title={t("Optional player-facing feedback for {eventTitle}. None means the interaction stays silent.", { eventTitle: title })}>
        <span className="field-label--inset">{t("Player feedback")}</span>
        <DropdownSelect
          value={feedbackValue}
          onChange={(changeEvent) =>
            onChange((hotspotEvent) => {
              applyHotspotFeedbackValue(hotspotEvent, changeEvent.target.value);
            })
          }
        >
          <option value="">{t("None (silent)")}</option>
          {feedbackValue && !feedbackOptions.some((option) => option.value === feedbackValue) ? (
            <option value={feedbackValue}>{t("Missing player feedback")}</option>
          ) : null}
          <optgroup label={t("Random from a response group")}>
            {feedbackOptions.filter((option) => option.kind === "group").map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </optgroup>
          <optgroup label={t("One specific response")}>
            {feedbackOptions.filter((option) => option.kind === "entry").map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </optgroup>
          <optgroup label={t("Dialogue")}>
            {feedbackOptions.filter((option) => option.kind === "dialogue").map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </optgroup>
        </DropdownSelect>
        <span className="scenes-event-feedback-note">
          {t("Choose a group for variety, one response for an exact line, or a dialogue for a conversation. None does nothing.")}
        </span>
      </label>
    </details>
  );
}

type HotspotFeedbackOption = {
  kind: "group" | "entry" | "dialogue";
  value: string;
  label: string;
};
function buildHotspotFeedbackOptions(
  responseGroups: ResponseGroup[],
  dialogues: ProjectBundle["dialogues"]["items"],
  assets: ProjectBundle["assets"]["assets"],
  strings: Record<string, string>,
  t: EditorTranslator = identityEditorTranslator
): HotspotFeedbackOption[] {
  const options: HotspotFeedbackOption[] = [];
  for (const group of responseGroups) {
    options.push({
      kind: "group",
      value: `group:${group.id}`,
      label: t("{groupName} ({count})", { groupName: group.name, count: group.entries.length })
    });
    for (const [index, entry] of group.entries.entries()) {
      const entryLabel =
        entry.kind === "text"
          ? strings[entry.textId]?.trim() || t("Untitled text {number}", { number: index + 1 })
          : assets.find((asset) => asset.id === entry.assetId)?.name ?? t("Choose {mediaKind}", { mediaKind: entry.kind });
      options.push({
        kind: "entry",
        value: `entry:${entry.id}`,
        label: t("{groupName} — {entryLabel}", { groupName: group.name, entryLabel })
      });
    }
  }
  for (const dialogue of dialogues) {
    options.push({ kind: "dialogue", value: `dialogue:${dialogue.id}`, label: dialogue.name });
  }
  return options;
}

function resolveSelectedHotspotRect() {
  const selectedHotspotBody = document.querySelector(".media-surface .hotspot--selected .hotspot__body");
  const selectedHotspotHandles = document.querySelector(".media-surface .hotspot--selected .hotspot__handles");
  const fallbackHotspot = document.querySelector(".media-surface .hotspot--selected");

  const bodyRect =
    selectedHotspotBody instanceof HTMLElement ? selectedHotspotBody.getBoundingClientRect() : undefined;
  const handlesRect =
    selectedHotspotHandles instanceof HTMLElement ? selectedHotspotHandles.getBoundingClientRect() : undefined;

  const bounds = bodyRect
    ? handlesRect
      ? {
          left: Math.min(bodyRect.left, handlesRect.left),
          top: Math.min(bodyRect.top, handlesRect.top),
          right: Math.max(bodyRect.right, handlesRect.right),
          bottom: Math.max(bodyRect.bottom, handlesRect.bottom)
        }
      : bodyRect
    : fallbackHotspot instanceof HTMLElement
      ? fallbackHotspot.getBoundingClientRect()
      : undefined;

  if (!bounds) {
    return undefined;
  }

  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top
  };
}

function HotspotInventoryActionControls({
  inventoryAction,
  inventoryItemOptions,
  selectedHotspot,
  mutateSelectedHotspot
}: {
  inventoryAction: ReturnType<typeof resolveHotspotInventoryAction>;
  inventoryItemOptions: LinkedInventoryOption[];
  selectedHotspot: Hotspot;
  mutateSelectedHotspot: (mutator: (hotspot: Hotspot, draft: ProjectBundle) => void) => void;
}) {
  const { t } = useEditorI18n();
  const actionItemId = inventoryAction.itemId ?? selectedHotspot.placedInventoryItemId ?? selectedHotspot.inventoryItemId ?? "";
  const hasInventoryItems = inventoryItemOptions.length > 0;
  const firstEligibleItemId = inventoryItemOptions.find((option) => option.eligible)?.itemId ?? "";
  const actionType = inventoryAction.type;
  const selectedActionLabel = inventoryItemOptions.find((option) => option.itemId === actionItemId)?.label ?? actionItemId;

  return (
    <section className="scenes-hotspot-action-card" aria-label={t("Hotspot action")}>
      <div className="scenes-hotspot-action-card__header">
        <span className="field-label--inset">{t("Action")}</span>
        <p className="muted scenes-hotspot-action-card__summary">
          {resolveHotspotInventoryActionSummary(inventoryAction.type, selectedActionLabel, t)}
        </p>
      </div>
      <label title={t("Choose whether this hotspot picks up an item, accepts a placed item, or stays as a normal hotspot.")}>
        <span className="field-label--inset">{t("Behavior")}</span>
        <DropdownSelect
          value={actionType}
          onChange={(event) => {
            const nextActionType = event.target.value as HotspotInventoryActionType;
            const nextItemId = actionItemId || firstEligibleItemId;
            mutateSelectedHotspot((hotspot, draft) => {
              applyHotspotInventoryAction(hotspot, nextActionType, nextItemId, draft.manifest.variables);
            });
          }}
        >
          <option value="none">{t("No inventory action")}</option>
          <option value="pickupItem" disabled={!hasInventoryItems}>
            {t("Pick up item")}
          </option>
          <option value="placeItem" disabled={!hasInventoryItems}>
            {t("Place item here")}
          </option>
        </DropdownSelect>
      </label>
      <label title={t("Inventory item used by the selected hotspot behavior. Choosing an item on a normal hotspot makes it pick-upable.")}>
        <span className="field-label--inset">{t("Item")}</span>
        <DropdownSelect
          value={actionItemId}
          onChange={(event) =>
            mutateSelectedHotspot((hotspot, draft) => {
              const nextItemId = event.target.value;
              const nextActionType = actionType === "placeItem" ? "placeItem" : nextItemId ? "pickupItem" : "none";
              applyHotspotInventoryAction(hotspot, nextActionType, nextItemId, draft.manifest.variables);
            })
          }
        >
          <option value="">{hasInventoryItems ? t("No item") : t("No inventory items")}</option>
          {inventoryItemOptions.map((option) => (
            <option key={option.itemId} value={option.itemId}>
              {option.label}
            </option>
          ))}
        </DropdownSelect>
      </label>
      <div
        className="scenes-hotspot-action-card__derived"
        title={t("This behavior is derived from the selected inventory action.")}
      >
        <span className="field-label--inset">{t("When activated")}</span>
        <p className="muted scenes-hotspot-action-card__summary">
          {resolveHotspotInventoryActivationSummary(actionType, Boolean(actionItemId), t)}
        </p>
      </div>
    </section>
  );
}

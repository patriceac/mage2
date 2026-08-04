import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  resolveHotspotInventoryAction,
  resolveHotspotRotationDegrees,
  resolveRelativeHotspotFrame,
  type Asset,
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
import { JsonField, parseJsonWithFallback } from "./JsonField";
import {
  applyHotspotFeedbackValue,
  applyHotspotInventoryAction,
  resolveHotspotFeedbackValue,
  resolveHotspotInventoryActionSummary,
  resolveHotspotInventoryActivationSummary,
  updateOptionalHotspotEvent,
  type HotspotInventoryActionType
} from "./hotspot-domain";
import type { LinkedInventoryOption } from "./inventory-placement-domain";
import { getFloatingWindowSize, getViewportSize, shouldStartFloatingWindowDrag } from "./floating-window-dom";

interface HotspotInspectorWindowProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  activeLocale: string;
  assets: ProjectBundle["assets"]["assets"];
  dialogueOptions: ProjectBundle["dialogues"]["items"];
  foregroundMediaAssets: Asset[];
  responseGroups: ProjectBundle["dialogues"]["responseGroups"];
  inventoryItemOptions: LinkedInventoryOption[];
  localeStrings: Record<string, string>;
  position?: FloatingWindowPosition;
  rotationSurfaceSize?: HotspotSurfaceSize;
  sceneTimelineDurationMs: number;
  scenes: ProjectBundle["scenes"]["items"];
  selectedHotspot: Hotspot;
  mutateSelectedHotspot: (mutator: (hotspot: Hotspot, draft: ProjectBundle) => void) => void;
  onRotationDegreesChange: (rotationDegrees: number) => void;
  onPositionChange: React.Dispatch<React.SetStateAction<FloatingWindowPosition | undefined>>;
  onInteractionActiveChange: (active: boolean) => void;
  onImportInteractionMedia: (hotspot: Hotspot) => void;
  onDismiss: () => void;
}

const HOTSPOT_INSPECTOR_FALLBACK_SIZE = {
  width: 420,
  height: 640
};

const useFloatingWindowLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function HotspotInspectorWindow({
  anchorRef,
  activeLocale,
  assets,
  dialogueOptions,
  foregroundMediaAssets,
  responseGroups,
  inventoryItemOptions,
  localeStrings,
  position,
  rotationSurfaceSize,
  sceneTimelineDurationMs,
  scenes,
  selectedHotspot,
  mutateSelectedHotspot,
  onRotationDegreesChange,
  onPositionChange,
  onInteractionActiveChange,
  onImportInteractionMedia,
  onDismiss
}: HotspotInspectorWindowProps) {
  const inspectorRef = useRef<HTMLElement>(null);
  const dragCleanupRef = useRef<(() => void) | undefined>(undefined);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusedWithin, setIsFocusedWithin] = useState(false);

  useFloatingWindowLayoutEffect(() => {
    if (typeof window === "undefined") {
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
  }, [anchorRef, onPositionChange, selectedHotspot.id]);

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
        ?.label.replace(/ \(missing valid art\)$/u, "") ?? inventoryAction.itemId
    : "configured item";
  const primaryHotspotEventLabel = isPlacementHotspot ? `Use ${placementItemLabel}` : "On click";

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
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
    if (event.button !== 0 || typeof window === "undefined") {
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

  const inspectorTitleId = `hotspot-inspector-title-${selectedHotspot.id}`;

  return (
    <div className="scenes-floating-inspector-layer">
      <aside
        ref={inspectorRef}
        role="dialog"
        aria-labelledby={inspectorTitleId}
        onMouseDown={startDrag}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setIsFocusedWithin(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsFocusedWithin(false);
          }
        }}
        className={
          position
            ? "panel scenes-floating-inspector scenes-floating-inspector--ready"
            : "panel scenes-floating-inspector"
        }
        style={position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
      >
        <header className="scenes-floating-inspector__header">
          <div className="scenes-floating-inspector__title-group">
            <p className="eyebrow">Hotspot Inspector</p>
            <h3 id={inspectorTitleId}>Hotspot Inspector</h3>
          </div>
          <button
            type="button"
            className="button-secondary scenes-floating-inspector__close"
            aria-label="Close hotspot inspector"
            title="Hide the floating hotspot inspector."
            onClick={onDismiss}
          >
            <span aria-hidden="true">x</span>
          </button>
        </header>

        <div className="scenes-floating-inspector__body">
          <div className="scenes-floating-inspector__sections">
            <details open className="scenes-floating-inspector__section">
              <summary className="scenes-floating-inspector__section-title">Identity</summary>
            <label title="Visible hotspot title shown in the editor and runtime.">
              <span className="field-label--inset">Name</span>
              <input
                value={selectedHotspot.name}
                title="Visible hotspot title shown in the editor and runtime."
                onChange={(event) =>
                  mutateSelectedHotspot((hotspot) => {
                    hotspot.name = event.target.value;
                  })
                }
              />
            </label>
            <label title="Optional secondary text shown inside this hotspot under the main label.">
              <span className="field-label--inset">Comment</span>
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
            <details open className="scenes-floating-inspector__section">
              <summary className="scenes-floating-inspector__section-title">Action</summary>
            <HotspotInventoryActionControls
              inventoryAction={resolveHotspotInventoryAction(selectedHotspot)}
              inventoryItemOptions={inventoryItemOptions}
              selectedHotspot={selectedHotspot}
              mutateSelectedHotspot={mutateSelectedHotspot}
            />
            </details>
            <details open className="scenes-floating-inspector__section">
              <summary className="scenes-floating-inspector__section-title">Geometry</summary>
            <div className="four-grid">
              {(
                [
                  ["x", "X", "Horizontal position of the hotspot bounds as a normalized value from 0 to 1."],
                  ["y", "Y", "Vertical position of the hotspot bounds as a normalized value from 0 to 1."],
                  ["width", "W", "Hotspot bounds width as a normalized percentage of the scene surface."],
                  ["height", "H", "Hotspot bounds height as a normalized percentage of the scene surface."]
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
              <label title="Rendered rotation angle in degrees for this hotspot.">
                  <span className="field-label--inset">Angle (&deg;)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={formatHotspotRotationDegrees(selectedHotspotRotationDegrees)}
                    title="Rendered rotation angle in degrees for this hotspot."
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
            <details open className="scenes-floating-inspector__section scenes-floating-inspector__section--timing">
              <summary className="scenes-floating-inspector__section-title">Timing</summary>
            <div className="stack-inline">
              <label
                className="scene-video-loop-toggle scenes-hotspot-duration-toggle"
                title="Keep this hotspot active for the full scene timeline."
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
                <span>Use scene duration</span>
              </label>
            </div>
            <div className="stack-inline scenes-floating-inspector__timing-fields">
              <label title="Time in milliseconds when this hotspot becomes clickable.">
                <span className="field-label--inset">Start (ms)</span>
                <input
                  type="number"
                  value={selectedHotspotTimingWindow.startMs}
                  title="Time in milliseconds when this hotspot becomes clickable."
                  disabled={isUsingSceneDurationTiming}
                  onChange={(event) =>
                    mutateSelectedHotspot((hotspot) => {
                      hotspot.timingMode = "fixed";
                      hotspot.startMs = Number(event.target.value);
                    })
                  }
                />
              </label>
              <label title="Time in milliseconds when this hotspot stops being clickable.">
                <span className="field-label--inset">End (ms)</span>
                <input
                  type="number"
                  value={selectedHotspotTimingWindow.endMs}
                  title="Time in milliseconds when this hotspot stops being clickable."
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
            {isPlacementHotspot ? (
              <HotspotEventSection
                open
                title="On click"
                description="Runs only when the player clicks this hotspot without an inventory item selected. Leave every field empty for no response."
                event={selectedHotspot.clickEvent ?? { effects: [] }}
                scenes={scenes}
                dialogueOptions={dialogueOptions}
                responseGroups={responseGroups}
                assets={assets}
                localeStrings={localeStrings}
                onChange={(mutator) =>
                  mutateSelectedHotspot((hotspot) => {
                    updateOptionalHotspotEvent(hotspot, "clickEvent", mutator);
                  })
                }
              />
            ) : null}
            <HotspotEventSection
              open
              title={primaryHotspotEventLabel}
              description={
                isPlacementHotspot
                  ? `Runs only when ${placementItemLabel} is selected and used on this hotspot.`
                  : "Runs when the player clicks this hotspot without an inventory item selected."
              }
              event={selectedHotspot}
              scenes={scenes}
              dialogueOptions={dialogueOptions}
              responseGroups={responseGroups}
              assets={assets}
              localeStrings={localeStrings}
              onChange={(mutator) =>
                mutateSelectedHotspot((hotspot) => {
                  mutator(hotspot);
                })
              }
            />
            {isPlacementHotspot || selectedHotspot.otherItemEvent ? (
              <HotspotEventSection
                title={isPlacementHotspot ? "Any other item" : "Use any item"}
                description={
                  isPlacementHotspot
                    ? `Runs only when the player uses a selected item other than ${placementItemLabel}. Leave every field empty for no response.`
                    : "Runs when the player uses any selected inventory item on this hotspot. Leave every field empty for no response."
                }
                event={selectedHotspot.otherItemEvent ?? { effects: [] }}
                scenes={scenes}
                dialogueOptions={dialogueOptions}
                responseGroups={responseGroups}
                assets={assets}
                localeStrings={localeStrings}
                onChange={(mutator) =>
                  mutateSelectedHotspot((hotspot) => {
                    updateOptionalHotspotEvent(hotspot, "otherItemEvent", mutator);
                  })
                }
              />
            ) : null}
            <details open className="scenes-floating-inspector__section">
              <summary className="scenes-floating-inspector__section-title">Interaction Media</summary>
              <label title="Audio or video that plays once when this hotspot is activated, independently of scene background media.">
                <span className="field-label--inset">Foreground Media</span>
                <DropdownSelect
                  value={selectedHotspot.mediaAssetId ?? ""}
                  onChange={(event) =>
                    mutateSelectedHotspot((hotspot) => {
                      hotspot.mediaAssetId = event.target.value || undefined;
                    })
                  }
                >
                  <option value="">No interaction media</option>
                  {selectedHotspot.mediaAssetId &&
                  !foregroundMediaAssets.some((asset) => asset.id === selectedHotspot.mediaAssetId) ? (
                    <option value={selectedHotspot.mediaAssetId}>Missing foreground media</option>
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
                  Import Audio / Video
                </button>
                <p className="muted scenes-floating-inspector__interaction-media-note">
                  Plays once on activation; it does not replace or loop with the scene background.
                </p>
              </div>
            </details>
            <details className="scenes-floating-inspector__section scenes-floating-inspector__section--advanced">
              <summary className="scenes-floating-inspector__section-title">Advanced</summary>
            <label title="Comma-separated inventory item IDs required before this hotspot can be used.">
              <span className="field-label--inset">Required Item IDs</span>
              <input
                value={selectedHotspot.requiredItemIds.join(", ")}
                onChange={(event) =>
                  mutateSelectedHotspot((hotspot) => {
                    hotspot.requiredItemIds = event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean);
                  })
                }
              />
            </label>
            <JsonField
              label="Conditions JSON"
              value={JSON.stringify(selectedHotspot.conditions, null, 2)}
              tooltip="Advanced JSON condition list that must pass before this hotspot is enabled."
              labelClassName="field-label--inset"
              onCommit={(nextValue) =>
                mutateSelectedHotspot((hotspot) => {
                  hotspot.conditions = parseJsonWithFallback(nextValue, hotspot.conditions);
                })
              }
            />
            </details>
          </div>
        </div>
      </aside>
    </div>
  );
}

interface HotspotEventSectionProps {
  title: string;
  description: string;
  event: HotspotEvent;
  scenes: ProjectBundle["scenes"]["items"];
  assets: ProjectBundle["assets"]["assets"];
  dialogueOptions: ProjectBundle["dialogues"]["items"];
  responseGroups: ProjectBundle["dialogues"]["responseGroups"];
  localeStrings: Record<string, string>;
  open?: boolean;
  onChange: (mutator: (event: HotspotEvent) => void) => void;
}

function HotspotEventSection({
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
  const feedbackValue = resolveHotspotFeedbackValue(event);
  const feedbackOptions = buildHotspotFeedbackOptions(responseGroups, dialogueOptions, assets, localeStrings);
  return (
    <details open={open} className="scenes-floating-inspector__section">
      <summary className="scenes-floating-inspector__section-title">{title}</summary>
      <p className="muted">{description}</p>
      <label title={`Scene that should open for ${title}.`}>
        <span className="field-label--inset">Target Scene</span>
        <DropdownSelect
          value={event.targetSceneId ?? ""}
          onChange={(changeEvent) =>
            onChange((hotspotEvent) => {
              hotspotEvent.targetSceneId = changeEvent.target.value || undefined;
            })
          }
        >
          <option value="">None</option>
          {scenes.map((scene) => (
            <option key={scene.id} value={scene.id}>
              {scene.name}
            </option>
          ))}
        </DropdownSelect>
      </label>
      <label title={`Optional player-facing feedback for ${title}. None means the interaction stays silent.`}>
        <span className="field-label--inset">Player feedback</span>
        <DropdownSelect
          value={feedbackValue}
          onChange={(changeEvent) =>
            onChange((hotspotEvent) => {
              applyHotspotFeedbackValue(hotspotEvent, changeEvent.target.value);
            })
          }
        >
          <option value="">None (silent)</option>
          {feedbackValue && !feedbackOptions.some((option) => option.value === feedbackValue) ? (
            <option value={feedbackValue}>Missing player feedback</option>
          ) : null}
          <optgroup label="Random from a response group">
            {feedbackOptions.filter((option) => option.kind === "group").map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </optgroup>
          <optgroup label="One specific response">
            {feedbackOptions.filter((option) => option.kind === "entry").map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </optgroup>
          <optgroup label="Dialogue">
            {feedbackOptions.filter((option) => option.kind === "dialogue").map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </optgroup>
        </DropdownSelect>
        <span className="scenes-event-feedback-note">
          Choose a group for variety, one response for an exact line, or a dialogue for a conversation. None does nothing.
        </span>
      </label>
      <JsonField
        label="Effects JSON"
        value={JSON.stringify(event.effects, null, 2)}
        tooltip={`Custom effects that run only for ${title}.`}
        labelClassName="field-label--inset"
        onCommit={(nextValue) =>
          onChange((hotspotEvent) => {
            hotspotEvent.effects = parseJsonWithFallback(nextValue, hotspotEvent.effects);
          })
        }
      />
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
  strings: Record<string, string>
): HotspotFeedbackOption[] {
  const options: HotspotFeedbackOption[] = [];
  for (const group of responseGroups) {
    options.push({ kind: "group", value: `group:${group.id}`, label: `${group.name} (${group.entries.length})` });
    for (const [index, entry] of group.entries.entries()) {
      const entryLabel =
        entry.kind === "text"
          ? strings[entry.textId]?.trim() || `Untitled text ${index + 1}`
          : assets.find((asset) => asset.id === entry.assetId)?.name ?? `Choose ${entry.kind}`;
      options.push({
        kind: "entry",
        value: `entry:${entry.id}`,
        label: `${group.name} \u2014 ${entryLabel}`
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
  const actionItemId = inventoryAction.itemId ?? selectedHotspot.placedInventoryItemId ?? selectedHotspot.inventoryItemId ?? "";
  const hasInventoryItems = inventoryItemOptions.length > 0;
  const firstEligibleItemId = inventoryItemOptions.find((option) => option.eligible)?.itemId ?? "";
  const actionType = inventoryAction.type;
  const selectedActionLabel = inventoryItemOptions.find((option) => option.itemId === actionItemId)?.label ?? actionItemId;

  return (
    <section className="scenes-hotspot-action-card" aria-label="Hotspot action">
      <div className="scenes-hotspot-action-card__header">
        <span className="field-label--inset">Action</span>
        <p className="muted scenes-hotspot-action-card__summary">
          {resolveHotspotInventoryActionSummary(inventoryAction.type, selectedActionLabel)}
        </p>
      </div>
      <label title="Choose whether this hotspot picks up an item, accepts a placed item, or stays as a normal hotspot.">
        <span className="field-label--inset">Behavior</span>
        <DropdownSelect
          value={actionType}
          onChange={(event) => {
            const nextActionType = event.target.value as HotspotInventoryActionType;
            const nextItemId = actionItemId || firstEligibleItemId;
            mutateSelectedHotspot((hotspot) => {
              applyHotspotInventoryAction(hotspot, nextActionType, nextItemId);
            });
          }}
        >
          <option value="none">No inventory action</option>
          <option value="pickupItem" disabled={!hasInventoryItems}>
            Pick up item
          </option>
          <option value="placeItem" disabled={!hasInventoryItems}>
            Place item here
          </option>
        </DropdownSelect>
      </label>
      <label title="Inventory item used by the selected hotspot behavior. Choosing an item on a normal hotspot makes it pick-upable.">
        <span className="field-label--inset">Item</span>
        <DropdownSelect
          value={actionItemId}
          onChange={(event) =>
            mutateSelectedHotspot((hotspot) => {
              const nextItemId = event.target.value;
              const nextActionType = actionType === "placeItem" ? "placeItem" : nextItemId ? "pickupItem" : "none";
              applyHotspotInventoryAction(hotspot, nextActionType, nextItemId);
            })
          }
        >
          <option value="">{hasInventoryItems ? "No item" : "No inventory items"}</option>
          {inventoryItemOptions.map((option) => (
            <option key={option.itemId} value={option.itemId}>
              {option.label}
            </option>
          ))}
        </DropdownSelect>
      </label>
      <div
        className="scenes-hotspot-action-card__derived"
        title="This behavior is derived from the selected inventory action."
      >
        <span className="field-label--inset">When activated</span>
        <p className="muted scenes-hotspot-action-card__summary">
          {resolveHotspotInventoryActivationSummary(actionType, Boolean(actionItemId))}
        </p>
      </div>
    </section>
  );
}

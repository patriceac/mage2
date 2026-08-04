import { useEffect, useLayoutEffect, useRef } from "react";
import { AssetPreview } from "../../previews";
import {
  clampFloatingWindowPosition,
  resolveNextFloatingWindowPosition,
  type FloatingWindowPosition
} from "../../floating-window";
import {
  INVENTORY_ITEM_DRAG_SIZE_TYPE,
  INVENTORY_ITEM_DRAG_TYPE,
  resolveInventoryDragPreviewSize,
  resolveInventoryPlacementActionPreviewSize,
  setTransparentInventoryDragImage,
  type LinkedInventoryOption
} from "./inventory-placement-domain";
import { getFloatingWindowSize, getViewportSize, shouldStartFloatingWindowDrag } from "./floating-window-dom";

interface InventoryPlacementPickerWindowProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  activeItem?: LinkedInventoryOption;
  activeLocale: string;
  options: LinkedInventoryOption[];
  position?: FloatingWindowPosition;
  search: string;
  showEmptyInventoryState: boolean;
  onActiveItemIdChange: (itemId?: string) => void;
  onDragStart: (itemId: string, previewSize: { width: number; height: number }) => void;
  onDragEnd: () => void;
  onPlaceItem: (itemId: string, previewSize?: { width: number; height: number }) => void;
  onPositionChange: React.Dispatch<React.SetStateAction<FloatingWindowPosition | undefined>>;
  onSearchChange: (value: string) => void;
  onDismiss: () => void;
}

const INVENTORY_PICKER_FALLBACK_SIZE = {
  width: 520,
  height: 620
};

const useFloatingWindowLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function InventoryPlacementPickerWindow({
  anchorRef,
  activeItem,
  activeLocale,
  options,
  position,
  search,
  showEmptyInventoryState,
  onActiveItemIdChange,
  onDragStart,
  onDragEnd,
  onPlaceItem,
  onPositionChange,
  onSearchChange,
  onDismiss
}: InventoryPlacementPickerWindowProps) {
  const pickerRef = useRef<HTMLElement>(null);
  const itemListRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dragCleanupRef = useRef<(() => void) | undefined>(undefined);
  const dragImageCleanupRef = useRef<(() => void) | undefined>(undefined);

  useFloatingWindowLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncPosition = () => {
      const viewport = getViewportSize();
      const size = getFloatingWindowSize(pickerRef.current, INVENTORY_PICKER_FALLBACK_SIZE);
      const anchorRect = anchorRef.current?.getBoundingClientRect();

      onPositionChange((currentPosition) => {
        return resolveNextFloatingWindowPosition(
          currentPosition,
          size,
          viewport,
          undefined,
          anchorRect
            ? {
                top: anchorRect.bottom,
                right: anchorRect.right
              }
            : undefined
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
  }, [anchorRef, onPositionChange, options.length, showEmptyInventoryState]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragImageCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      pickerRef.current?.focus();

      if (!showEmptyInventoryState) {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [showEmptyInventoryState]);

  useEffect(() => {
    if (!activeItem?.itemId) {
      return;
    }

    itemListRef.current
      ?.querySelector<HTMLElement>(`[data-inventory-item-id="${activeItem.itemId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeItem?.itemId]);

  function startDrag(event: React.MouseEvent<HTMLElement>) {
    if (event.button !== 0 || typeof window === "undefined") {
      return;
    }

    const pickerElement = pickerRef.current;
    if (!pickerElement || !shouldStartFloatingWindowDrag(event.target)) {
      return;
    }

    event.preventDefault();
    dragCleanupRef.current?.();

    const bounds = pickerElement.getBoundingClientRect();
    const dragOffsetX = event.clientX - bounds.left;
    const dragOffsetY = event.clientY - bounds.top;
    const body = document.body;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    body.style.cursor = "grabbing";
    body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const size = getFloatingWindowSize(pickerRef.current, INVENTORY_PICKER_FALLBACK_SIZE);
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

  function handleItemDragStart(event: React.DragEvent<HTMLDivElement>, itemId: string) {
    const previewSize = resolveInventoryDragPreviewSize(event.currentTarget);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(INVENTORY_ITEM_DRAG_TYPE, itemId);
    event.dataTransfer.setData(INVENTORY_ITEM_DRAG_SIZE_TYPE, JSON.stringify(previewSize));
    event.dataTransfer.setData("text/plain", itemId);
    dragImageCleanupRef.current?.();
    dragImageCleanupRef.current = setTransparentInventoryDragImage(event.dataTransfer, event.currentTarget, event.nativeEvent);
    onActiveItemIdChange(itemId);
    onDragStart(itemId, previewSize);
  }

  function handleItemDragEnd() {
    dragImageCleanupRef.current?.();
    dragImageCleanupRef.current = undefined;
    onDragEnd();
  }

  function handlePlaceButtonClick(event: React.MouseEvent<HTMLButtonElement>, itemId: string) {
    const previewSize = resolveInventoryPlacementActionPreviewSize(event.currentTarget);
    onPlaceItem(itemId, previewSize);
  }

  function handlePlaceActiveItem() {
    if (!activeItem?.itemId) {
      return;
    }

    const placeButton = itemListRef.current?.querySelector<HTMLButtonElement>(
      `[data-inventory-item-id="${activeItem.itemId}"] [data-inventory-picker-place-button="true"]`
    );
    const previewSize = placeButton ? resolveInventoryPlacementActionPreviewSize(placeButton) : undefined;
    onPlaceItem(activeItem.itemId, previewSize);
  }

  function handlePickerKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.target instanceof HTMLElement && event.target.closest(".scenes-floating-inspector__header")) {
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const action = resolveInventoryPickerKeyboardAction(
      event.key,
      options.map((option) => option.itemId),
      activeItem?.itemId
    );
    if (!action.handled) {
      return;
    }

    event.preventDefault();

    if (action.nextActiveItemId) {
      onActiveItemIdChange(action.nextActiveItemId);
    }

    if (action.shouldPlaceActiveItem) {
      handlePlaceActiveItem();
    }
  }

  const pickerTitleId = "inventory-placement-picker-title";

  return (
    <div className="scenes-floating-inspector-layer">
      <aside
        ref={pickerRef}
        role="dialog"
        aria-labelledby={pickerTitleId}
        tabIndex={-1}
        onMouseDown={startDrag}
        onKeyDownCapture={handlePickerKeyDown}
        className={
          position
            ? "panel scenes-floating-inspector scenes-floating-inspector--inventory-picker scenes-floating-inspector--ready"
            : "panel scenes-floating-inspector scenes-floating-inspector--inventory-picker"
        }
        style={position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
      >
        <header className="scenes-floating-inspector__header">
          <div className="scenes-floating-inspector__title-group">
            <p className="eyebrow">Scene Placement</p>
            <h3 id={pickerTitleId}>Add inventory item</h3>
          </div>
          <button
            type="button"
            className="button-secondary scenes-floating-inspector__close"
            title="Hide the inventory placement picker."
            onClick={onDismiss}
          >
            Close
          </button>
        </header>

        <div className="scenes-floating-inspector__body scenes-floating-inspector__body--inventory-picker">
          {showEmptyInventoryState ? (
            <div className="list-card scenes-inventory-picker__empty-state">
              <strong>No items are ready to place</strong>
              <p className="muted">Add artwork to an item to make it available here.</p>
            </div>
          ) : (
            <>
              <label className="localization-filter localization-filter--search scenes-inventory-picker__search">
                <span className="field-label--inset">Search</span>
                <input
                  ref={searchInputRef}
                  value={search}
                  placeholder="Search inventory items"
                  onChange={(event) => onSearchChange(event.target.value)}
                />
              </label>

              <div className="list-card list-card--compact scenes-inventory-picker__preview">
                <strong>{activeItem?.label ?? "No matching items"}</strong>
                <p className="muted scenes-inventory-picker__description">
                  {activeItem?.description?.trim() || (options.length === 0 ? "No matching items" : "No description available.")}
                </p>
                <p className="muted scenes-inventory-picker__drag-hint">Drag an item onto the scene to place it</p>
              </div>

              {options.length === 0 ? (
                <div className="list-card list-card--compact scenes-inventory-picker__empty-state">
                  <strong>No matching items</strong>
                </div>
              ) : (
                <div ref={itemListRef} className="list-stack scenes-inventory-picker__list">
                  {options.map((option) => (
                    <article
                      key={option.itemId}
                      data-inventory-item-id={option.itemId}
                      className={
                        activeItem?.itemId === option.itemId
                          ? "list-card list-card--compact list-card--selected scenes-inventory-picker__item"
                          : "list-card list-card--compact scenes-inventory-picker__item"
                      }
                      title={option.internalName !== option.label ? option.internalName : undefined}
                      onMouseEnter={() => onActiveItemIdChange(option.itemId)}
                      onFocusCapture={() => onActiveItemIdChange(option.itemId)}
                    >
                      <div
                        draggable
                        data-floating-window-drag-ignore="true"
                        className="scenes-inventory-picker__item-drag-handle"
                        title={`Drag ${option.label} onto the scene to place it.`}
                        onMouseDown={(event) => event.stopPropagation()}
                        onDragStart={(event) => handleItemDragStart(event, option.itemId)}
                        onDragEnd={handleItemDragEnd}
                      >
                        <div className="scenes-inventory-picker__item-thumb">
                          <AssetPreview
                            asset={option.asset}
                            locale={activeLocale}
                            interactive={false}
                            allowSourceFallback
                            preferPosterForImages
                            fit="contain"
                            emptyTitle="No item image"
                            emptyBody="Assign item artwork in Inventory."
                          />
                        </div>
                      </div>
                      <div className="scenes-inventory-picker__item-copy">
                        <strong>{option.label}</strong>
                      </div>
                      <button
                        type="button"
                        data-inventory-picker-place-button="true"
                        className="button-secondary"
                        onFocus={() => onActiveItemIdChange(option.itemId)}
                        onClick={(event) => handlePlaceButtonClick(event, option.itemId)}
                      >
                        Place
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

export function resolveInventoryPickerToggleResult(isInventoryPickerOpen: boolean) {
  return {
    nextIsInventoryPickerOpen: !isInventoryPickerOpen,
    shouldClearSelectedHotspot: !isInventoryPickerOpen
  };
}

const INVENTORY_PICKER_PAGE_SIZE = 6;

export function resolveInventoryPickerKeyboardAction(
  key: string,
  itemIds: string[],
  activeItemId?: string,
  pageSize = INVENTORY_PICKER_PAGE_SIZE
) {
  if (itemIds.length === 0) {
    return {
      handled: false,
      shouldPlaceActiveItem: false
    };
  }

  const lastIndex = itemIds.length - 1;
  const activeIndex = Math.max(0, itemIds.indexOf(activeItemId ?? itemIds[0]!));

  switch (key) {
    case "ArrowDown":
      return {
        handled: true,
        nextActiveItemId: itemIds[Math.min(activeIndex + 1, lastIndex)],
        shouldPlaceActiveItem: false
      };
    case "ArrowUp":
      return {
        handled: true,
        nextActiveItemId: itemIds[Math.max(activeIndex - 1, 0)],
        shouldPlaceActiveItem: false
      };
    case "Home":
      return {
        handled: true,
        nextActiveItemId: itemIds[0],
        shouldPlaceActiveItem: false
      };
    case "End":
      return {
        handled: true,
        nextActiveItemId: itemIds[lastIndex],
        shouldPlaceActiveItem: false
      };
    case "PageDown":
      return {
        handled: true,
        nextActiveItemId: itemIds[Math.min(activeIndex + pageSize, lastIndex)],
        shouldPlaceActiveItem: false
      };
    case "PageUp":
      return {
        handled: true,
        nextActiveItemId: itemIds[Math.max(activeIndex - pageSize, 0)],
        shouldPlaceActiveItem: false
      };
    case "Enter":
      return {
        handled: true,
        nextActiveItemId: itemIds[activeIndex],
        shouldPlaceActiveItem: true
      };
    default:
      return {
        handled: false,
        shouldPlaceActiveItem: false
      };
  }
}

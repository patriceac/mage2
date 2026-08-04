import type { Asset, InventoryItem } from "@mage2/schema";
import { isInventoryImageAsset } from "../../project-helpers";
import { MIN_HOTSPOT_SIZE } from "../../hotspot-geometry";

export const INVENTORY_ITEM_DRAG_TYPE = "application/x-mage2-inventory-item";
export const INVENTORY_ITEM_DRAG_SIZE_TYPE = "application/x-mage2-inventory-preview-size";

const INVENTORY_DRAG_PREVIEW_SCALE = 2 / 3;

export interface LinkedInventoryOption {
  asset?: Asset;
  description?: string;
  internalName: string;
  itemId: string;
  label: string;
  eligible: boolean;
  searchText: string;
}

export function resolveLinkedInventoryOptions(
  items: InventoryItem[],
  assets: Asset[],
  strings: Record<string, string>,
  currentItemId?: string
): LinkedInventoryOption[] {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset] as const));
  const options: LinkedInventoryOption[] = [];

  for (const item of items) {
    const asset = item.imageAssetId ? assetsById.get(item.imageAssetId) : undefined;
    if (!asset || !isInventoryImageAsset(asset)) {
      continue;
    }

    options.push({
      asset,
      description: normalizeInventoryPickerText(item.descriptionTextId ? strings[item.descriptionTextId] : undefined),
      internalName: item.name,
      itemId: item.id,
      label: strings[item.textId] ?? item.name ?? item.id,
      eligible: true,
      searchText: `${strings[item.textId] ?? item.name ?? item.id}\n${item.name}`.toLowerCase()
    });
  }

  if (!currentItemId || options.some((option) => option.itemId === currentItemId)) {
    return options;
  }

  const currentItem = items.find((item) => item.id === currentItemId);
  if (!currentItem) {
    return [
      {
        internalName: currentItemId,
        itemId: currentItemId,
        label: `Missing inventory item (${currentItemId})`,
        eligible: false,
        searchText: currentItemId.toLowerCase()
      },
      ...options
    ];
  }

  return [
    {
      asset: currentItem.imageAssetId ? assetsById.get(currentItem.imageAssetId) : undefined,
      description: normalizeInventoryPickerText(currentItem.descriptionTextId ? strings[currentItem.descriptionTextId] : undefined),
      internalName: currentItem.name,
      itemId: currentItem.id,
      label: `${strings[currentItem.textId] ?? currentItem.name ?? currentItem.id} (missing valid art)`,
      eligible: false,
      searchText: `${strings[currentItem.textId] ?? currentItem.name ?? currentItem.id}\n${currentItem.name}`.toLowerCase()
    },
    ...options
  ];
}

export function filterInventoryPlacementOptions(options: LinkedInventoryOption[], search: string): LinkedInventoryOption[] {
  const normalizedSearch = search.trim().toLowerCase();
  if (normalizedSearch.length === 0) {
    return options;
  }

  return options.filter((option) => option.searchText.includes(normalizedSearch));
}

function normalizeInventoryPickerText(value: string | undefined) {
  const normalizedValue = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

export function resolveDraggedInventoryItemId(dataTransfer: DataTransfer, options: LinkedInventoryOption[]) {
  const customItemId = dataTransfer.getData(INVENTORY_ITEM_DRAG_TYPE).trim();
  if (customItemId.length > 0) {
    return customItemId;
  }

  const plainTextItemId = dataTransfer.getData("text/plain").trim();
  return options.some((option) => option.itemId === plainTextItemId) ? plainTextItemId : undefined;
}

export function resolveDraggedInventoryPreviewSize(dataTransfer: DataTransfer) {
  const serializedSize = dataTransfer.getData(INVENTORY_ITEM_DRAG_SIZE_TYPE).trim();
  if (serializedSize.length === 0) {
    return undefined;
  }

  try {
    const parsedSize = JSON.parse(serializedSize) as {
      width?: unknown;
      height?: unknown;
    };
    if (typeof parsedSize.width !== "number" || typeof parsedSize.height !== "number") {
      return undefined;
    }

    return parsedSize.width > 0 && parsedSize.height > 0
      ? {
          widthPx: parsedSize.width,
          heightPx: parsedSize.height
        }
      : undefined;
  } catch {
    return undefined;
  }
}

export function resolveInventoryDragPreviewSize(dragHandle: HTMLElement) {
  const sourceImage = dragHandle.querySelector<HTMLElement>("img.asset-preview__media");
  if (!sourceImage) {
    const previewBounds = dragHandle.getBoundingClientRect();
    return {
      width: Math.max(previewBounds.width, 1),
      height: Math.max(previewBounds.height, 1)
    };
  }

  const previewBounds = sourceImage.getBoundingClientRect();
  const previewStyles = window.getComputedStyle(sourceImage);
  return resolveInventoryPreviewContentSize({
    previewWidthPx: previewBounds.width,
    previewHeightPx: previewBounds.height,
    paddingTopPx: parseCssPixelValue(previewStyles.paddingTop),
    paddingRightPx: parseCssPixelValue(previewStyles.paddingRight),
    paddingBottomPx: parseCssPixelValue(previewStyles.paddingBottom),
    paddingLeftPx: parseCssPixelValue(previewStyles.paddingLeft),
    borderTopPx: parseCssPixelValue(previewStyles.borderTopWidth),
    borderRightPx: parseCssPixelValue(previewStyles.borderRightWidth),
    borderBottomPx: parseCssPixelValue(previewStyles.borderBottomWidth),
    borderLeftPx: parseCssPixelValue(previewStyles.borderLeftWidth)
  });
}

export function resolveInventoryPlacementActionPreviewSize(button: HTMLButtonElement) {
  const dragHandle = button
    .closest<HTMLElement>(".scenes-inventory-picker__item")
    ?.querySelector<HTMLElement>(".scenes-inventory-picker__item-drag-handle");
  return dragHandle ? resolveInventoryDragPreviewSize(dragHandle) : undefined;
}

export function resolveInventoryPreviewContentSize({
  previewWidthPx,
  previewHeightPx,
  paddingTopPx,
  paddingRightPx,
  paddingBottomPx,
  paddingLeftPx,
  borderTopPx,
  borderRightPx,
  borderBottomPx,
  borderLeftPx
}: {
  previewWidthPx: number;
  previewHeightPx: number;
  paddingTopPx: number;
  paddingRightPx: number;
  paddingBottomPx: number;
  paddingLeftPx: number;
  borderTopPx: number;
  borderRightPx: number;
  borderBottomPx: number;
  borderLeftPx: number;
}) {
  return {
    width: Math.max(previewWidthPx - paddingLeftPx - paddingRightPx - borderLeftPx - borderRightPx, 1),
    height: Math.max(previewHeightPx - paddingTopPx - paddingBottomPx - borderTopPx - borderBottomPx, 1)
  };
}

export function resolveInventoryDragPreviewOffset({
  clientX,
  clientY,
  previewLeftPx,
  previewTopPx,
  previewWidthPx,
  previewHeightPx,
  paddingTopPx,
  paddingRightPx,
  paddingBottomPx,
  paddingLeftPx,
  borderTopPx,
  borderRightPx,
  borderBottomPx,
  borderLeftPx
}: {
  clientX: number;
  clientY: number;
  previewLeftPx: number;
  previewTopPx: number;
  previewWidthPx: number;
  previewHeightPx: number;
  paddingTopPx: number;
  paddingRightPx: number;
  paddingBottomPx: number;
  paddingLeftPx: number;
  borderTopPx: number;
  borderRightPx: number;
  borderBottomPx: number;
  borderLeftPx: number;
}) {
  const contentSize = resolveInventoryPreviewContentSize({
    previewWidthPx,
    previewHeightPx,
    paddingTopPx,
    paddingRightPx,
    paddingBottomPx,
    paddingLeftPx,
    borderTopPx,
    borderRightPx,
    borderBottomPx,
    borderLeftPx
  });
  const contentLeft = previewLeftPx + paddingLeftPx + borderLeftPx;
  const contentTop = previewTopPx + paddingTopPx + borderTopPx;

  return {
    x: Math.min(Math.max(clientX - contentLeft, 0), contentSize.width),
    y: Math.min(Math.max(clientY - contentTop, 0), contentSize.height)
  };
}

function parseCssPixelValue(value: string) {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function resolveDroppedInventoryHotspotBounds({
  normalizedX,
  normalizedY,
  surfaceWidth,
  surfaceHeight,
  previewWidthPx,
  previewHeightPx
}: {
  normalizedX: number;
  normalizedY: number;
  surfaceWidth: number;
  surfaceHeight: number;
  previewWidthPx: number;
  previewHeightPx: number;
}) {
  if (surfaceWidth <= 0 || surfaceHeight <= 0 || previewWidthPx <= 0 || previewHeightPx <= 0) {
    return undefined;
  }

  const width = Math.min(Math.max(previewWidthPx / surfaceWidth, MIN_HOTSPOT_SIZE), 1);
  const height = Math.min(Math.max(previewHeightPx / surfaceHeight, MIN_HOTSPOT_SIZE), 1);
  const x = Math.min(Math.max(normalizedX - width / 2, 0), 1 - width);
  const y = Math.min(Math.max(normalizedY - height / 2, 0), 1 - height);

  return {
    x,
    y,
    width,
    height
  };
}

export function setTransparentInventoryDragImage(
  dataTransfer: DataTransfer,
  dragHandle: HTMLElement,
  dragEvent?: DragEvent
) {
  if (typeof document === "undefined") {
    return undefined;
  }

  const sourceImage = dragHandle.querySelector<HTMLImageElement>("img.asset-preview__media");
  if (sourceImage && (sourceImage.currentSrc || sourceImage.src)) {
    const bounds = sourceImage.getBoundingClientRect();
    const sourceImageStyles = window.getComputedStyle(sourceImage);
    const previewMetrics = {
      previewWidthPx: bounds.width,
      previewHeightPx: bounds.height,
      paddingTopPx: parseCssPixelValue(sourceImageStyles.paddingTop),
      paddingRightPx: parseCssPixelValue(sourceImageStyles.paddingRight),
      paddingBottomPx: parseCssPixelValue(sourceImageStyles.paddingBottom),
      paddingLeftPx: parseCssPixelValue(sourceImageStyles.paddingLeft),
      borderTopPx: parseCssPixelValue(sourceImageStyles.borderTopWidth),
      borderRightPx: parseCssPixelValue(sourceImageStyles.borderRightWidth),
      borderBottomPx: parseCssPixelValue(sourceImageStyles.borderBottomWidth),
      borderLeftPx: parseCssPixelValue(sourceImageStyles.borderLeftWidth)
    };
    const contentSize = resolveInventoryPreviewContentSize(previewMetrics);
    const dragOffset =
      dragEvent && dragEvent.clientX > 0 && dragEvent.clientY > 0
        ? resolveInventoryDragPreviewOffset({
            clientX: dragEvent.clientX,
            clientY: dragEvent.clientY,
            previewLeftPx: bounds.left,
            previewTopPx: bounds.top,
            ...previewMetrics
          })
        : {
            x: 0,
            y: 0
          };
    const width = Math.max(Math.round(contentSize.width * INVENTORY_DRAG_PREVIEW_SCALE), 1);
    const height = Math.max(Math.round(contentSize.height * INVENTORY_DRAG_PREVIEW_SCALE), 1);

    const dragImage = document.createElement("img");
    dragImage.src = sourceImage.currentSrc || sourceImage.src;
    dragImage.alt = "";
    dragImage.draggable = false;
    dragImage.dataset.inventoryDragImage = "true";
    Object.assign(dragImage.style, {
      position: "fixed",
      left: "-10000px",
      top: "-10000px",
      display: "block",
      width: `${width}px`,
      height: `${height}px`,
      margin: "0",
      minWidth: `${width}px`,
      minHeight: `${height}px`,
      maxWidth: `${width}px`,
      maxHeight: `${height}px`,
      padding: "0",
      border: "0",
      borderRadius: "0",
      background: "transparent",
      boxShadow: "none",
      boxSizing: "border-box",
      objectFit: sourceImageStyles.objectFit,
      objectPosition: sourceImageStyles.objectPosition,
      imageRendering: sourceImageStyles.imageRendering,
      pointerEvents: "none"
    });
    document.body.appendChild(dragImage);
    dataTransfer.setDragImage(
      dragImage,
      Math.min(Math.max(Math.round(dragOffset.x * INVENTORY_DRAG_PREVIEW_SCALE), 0), width),
      Math.min(Math.max(Math.round(dragOffset.y * INVENTORY_DRAG_PREVIEW_SCALE), 0), height)
    );
    return () => {
      dragImage.remove();
    };
  }

  const fallbackDragImage = document.createElement("span");
  fallbackDragImage.dataset.inventoryDragImage = "fallback";
  Object.assign(fallbackDragImage.style, {
    position: "fixed",
    left: "-10000px",
    top: "-10000px",
    width: "1px",
    height: "1px",
    margin: "0",
    padding: "0",
    border: "0",
    background: "transparent",
    boxShadow: "none",
    pointerEvents: "none"
  });
  document.body.appendChild(fallbackDragImage);
  dataTransfer.setDragImage(fallbackDragImage, 0, 0);
  return () => {
    fallbackDragImage.remove();
  };
}

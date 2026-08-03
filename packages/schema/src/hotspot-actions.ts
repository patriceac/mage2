import type { Condition, Effect, Hotspot, HotspotEvent } from "./types";

export type HotspotInventoryActionType = "none" | "pickupItem" | "placeItem";

export interface HotspotInventoryAction {
  type: HotspotInventoryActionType;
  itemId?: string;
  completionFlag?: string;
}

export interface PlacedInventoryHotspotInstance {
  id: string;
  itemId: string;
  dropTargetHotspotId: string;
  sourceHotspotId?: string;
  hotspot: Hotspot;
}

export function hasHotspotEvent(
  event: Pick<HotspotEvent, "targetSceneId" | "dialogueTreeId" | "response" | "effects"> | undefined
): boolean {
  return Boolean(event && (event.targetSceneId || event.dialogueTreeId || event.response || event.effects.length > 0));
}

export function buildHotspotPickupFlag(hotspotId: string): string {
  return `hotspot.${hotspotId}.pickedUp`;
}

export function buildHotspotPlacementFlag(hotspotId: string): string {
  return `hotspot.${hotspotId}.placed`;
}

export function buildPlacedInventoryHotspotId(dropTargetHotspotId: string, itemId: string): string {
  return `placed:${dropTargetHotspotId}:${itemId}`;
}

export function resolveHotspotInventoryAction(hotspot: Hotspot): HotspotInventoryAction {
  const placedItemId = hotspot.placedInventoryItemId;
  if (placedItemId && hasInventoryEffect(hotspot.effects, "removeItem", placedItemId) && hotspot.requiredItemIds.includes(placedItemId)) {
    return {
      type: "placeItem",
      itemId: placedItemId,
      completionFlag: resolveCompletionFlag(hotspot, buildHotspotPlacementFlag(hotspot.id))
    };
  }

  const itemId = hotspot.inventoryItemId;
  if (itemId && hasInventoryEffect(hotspot.effects, "removeItem", itemId) && hotspot.requiredItemIds.includes(itemId)) {
    return {
      type: "placeItem",
      itemId,
      completionFlag: resolveCompletionFlag(hotspot, buildHotspotPlacementFlag(hotspot.id))
    };
  }

  if (itemId && hasInventoryEffect(hotspot.effects, "addItem", itemId)) {
    return {
      type: "pickupItem",
      itemId,
      completionFlag: resolveCompletionFlag(hotspot, buildHotspotPickupFlag(hotspot.id))
    };
  }

  if (placedItemId) {
    return { type: "none", itemId: placedItemId };
  }

  return { type: "none", itemId };
}

export function isHotspotCompatibleWithInventoryItem(hotspot: Hotspot, itemId: string | undefined): boolean {
  if (!itemId) {
    return false;
  }

  const action = resolveHotspotInventoryAction(hotspot);
  return action.type === "placeItem" && action.itemId === itemId;
}

export function resolvePlacedInventoryItemId(hotspot: Hotspot, flags: Record<string, boolean>): string | undefined {
  const action = resolveHotspotInventoryAction(hotspot);
  if (action.type !== "placeItem" || !action.itemId || !action.completionFlag) {
    return undefined;
  }

  return flags[action.completionFlag] ? action.itemId : undefined;
}

export function resolvePlacedInventoryVisualHotspot(hotspot: Hotspot, sceneHotspots: Hotspot[]): Hotspot {
  return resolvePlacedInventoryHotspotInstance(hotspot, sceneHotspots)?.hotspot ?? hotspot;
}

export function resolvePlacedInventoryHotspotInstance(
  dropTargetHotspot: Hotspot,
  sceneHotspots: Hotspot[]
): PlacedInventoryHotspotInstance | undefined {
  const action = resolveHotspotInventoryAction(dropTargetHotspot);
  if (action.type !== "placeItem" || !action.itemId) {
    return undefined;
  }

  const sourceHotspot = resolvePlacedInventorySourceHotspot(dropTargetHotspot, sceneHotspots, action.itemId);
  const visualHotspot = resolvePlacedInventoryVisualHotspotFrame(dropTargetHotspot, sourceHotspot);
  const id = buildPlacedInventoryHotspotId(dropTargetHotspot.id, action.itemId);

  return {
    id,
    itemId: action.itemId,
    dropTargetHotspotId: dropTargetHotspot.id,
    sourceHotspotId: sourceHotspot?.id,
    hotspot: {
      ...visualHotspot,
      id,
      name: sourceHotspot?.name ?? visualHotspot.name,
      conditions: [],
      effects: [],
      requiredItemIds: [],
      inventoryItemId: action.itemId,
      polygon: dropTargetHotspot.placedInventoryGeometry?.polygon
    }
  };
}

function resolvePlacedInventorySourceHotspot(
  dropTargetHotspot: Hotspot,
  sceneHotspots: Hotspot[],
  itemId: string
): Hotspot | undefined {
  return sceneHotspots.find((candidate) => {
    if (candidate.id === dropTargetHotspot.id || candidate.inventoryItemId !== itemId) {
      return false;
    }

    return resolveHotspotInventoryAction(candidate).type === "pickupItem";
  });
}

function resolvePlacedInventoryVisualHotspotFrame(hotspot: Hotspot, sourceHotspot: Hotspot | undefined): Hotspot {
  const action = resolveHotspotInventoryAction(hotspot);
  if (action.type === "placeItem" && action.itemId && hotspot.placedInventoryGeometry) {
    return {
      ...hotspot,
      ...hotspot.placedInventoryGeometry
    };
  }

  if (action.type !== "placeItem" || !action.itemId || !sourceHotspot) {
    return hotspot;
  }

  const width = clampHotspotSize(sourceHotspot.width);
  const height = clampHotspotSize(sourceHotspot.height);
  const centerX = hotspot.x + hotspot.width / 2;
  const centerY = hotspot.y + hotspot.height / 2;

  return {
    ...hotspot,
    x: clampHotspotPosition(centerX - width / 2, width),
    y: clampHotspotPosition(centerY - height / 2, height),
    width,
    height,
    polygon: undefined
  };
}

export function shouldDisplayHotspotInventoryVisual(hotspot: Hotspot, flags?: Record<string, boolean>): boolean {
  const action = resolveHotspotInventoryAction(hotspot);
  if (action.type !== "placeItem" || !action.completionFlag) {
    return true;
  }

  return false;
}

function hasInventoryEffect(effects: Effect[], type: "addItem" | "removeItem", itemId: string): boolean {
  if (type === "addItem") {
    return effects.some((effect) => effect.type === "addItem" && effect.itemId === itemId);
  }

  return effects.some((effect) => effect.type === "removeItem" && effect.itemId === itemId);
}

function resolveCompletionFlag(hotspot: Hotspot, fallbackFlag: string): string {
  const guardedFlags = new Set(
    hotspot.conditions
      .filter((condition): condition is Extract<Condition, { type: "flagEquals" }> => condition.type === "flagEquals")
      .filter((condition) => condition.value === false)
      .map((condition) => condition.flag)
  );

  const guardedCompletionEffect = hotspot.effects.find(
    (effect): effect is Extract<Effect, { type: "setFlag" }> =>
      effect.type === "setFlag" && effect.value === true && guardedFlags.has(effect.flag)
  );
  if (guardedCompletionEffect) {
    return guardedCompletionEffect.flag;
  }

  const completionEffect = hotspot.effects.find(
    (effect): effect is Extract<Effect, { type: "setFlag" }> => effect.type === "setFlag" && effect.value === true
  );
  return completionEffect?.flag ?? fallbackFlag;
}

function clampHotspotSize(value: number): number {
  return Math.min(Math.max(value, 0.01), 1);
}

function clampHotspotPosition(value: number, size: number): number {
  return Math.min(Math.max(value, 0), Math.max(1 - size, 0));
}

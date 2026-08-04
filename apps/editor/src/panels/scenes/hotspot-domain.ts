import {
  buildHotspotPickupFlag,
  buildHotspotPlacementFlag,
  hasHotspotEvent,
  resolveHotspotInventoryAction,
  type Condition,
  type Effect,
  type Hotspot,
  type HotspotEvent,
  type InventoryItem
} from "@mage2/schema";

export type HotspotInventoryActionType = "none" | "pickupItem" | "placeItem";
export type OptionalHotspotEventKey = "clickEvent" | "otherItemEvent";

export function resolveHotspotFeedbackValue(event: Pick<HotspotEvent, "dialogueTreeId" | "response">): string {
  if (event.dialogueTreeId) {
    return `dialogue:${event.dialogueTreeId}`;
  }
  if (event.response?.type === "group") {
    return `group:${event.response.groupId}`;
  }
  if (event.response?.type === "entry") {
    return `entry:${event.response.entryId}`;
  }
  return "";
}

export function applyHotspotFeedbackValue(event: HotspotEvent, value: string): void {
  delete event.dialogueTreeId;
  delete event.response;
  const separatorIndex = value.indexOf(":");
  if (separatorIndex < 1) {
    return;
  }
  const type = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);
  if (!id) {
    return;
  }
  if (type === "dialogue") {
    event.dialogueTreeId = id;
  } else if (type === "group") {
    event.response = { type, groupId: id };
  } else if (type === "entry") {
    event.response = { type, entryId: id };
  }
}

export function updateOptionalHotspotEvent(
  hotspot: Hotspot,
  key: OptionalHotspotEventKey,
  mutator: (event: HotspotEvent) => void
) {
  const event = hotspot[key] ?? { effects: [] };
  mutator(event);

  if (hasHotspotEvent(event)) {
    hotspot[key] = event;
  } else {
    delete hotspot[key];
  }
}

export function resolveHotspotInventoryActionSummary(
  actionType: HotspotInventoryActionType,
  itemLabel: string
): string {
  if (actionType === "pickupItem") {
    return itemLabel
      ? `Adds ${itemLabel} to inventory and hides this hotspot after pickup.`
      : "Choose the inventory item this hotspot adds to inventory.";
  }

  if (actionType === "placeItem") {
    return itemLabel
      ? `Requires ${itemLabel}, removes it from inventory, and reveals it here after placement.`
      : "Choose the inventory item that can be placed here.";
  }

  return "Choose whether this hotspot changes inventory, starts dialogue, or only uses advanced fields.";
}

export function resolveHotspotInventoryActivationSummary(
  actionType: HotspotInventoryActionType,
  hasItem: boolean
): string {
  if (actionType === "pickupItem") {
    return hasItem ? "Add item to inventory" : "Choose item to pick up";
  }

  if (actionType === "placeItem") {
    return hasItem ? "Require selected inventory item" : "Choose item to place";
  }

  return "No inventory change";
}

export function applyHotspotInventoryAction(
  hotspot: Hotspot,
  actionType: HotspotInventoryActionType,
  itemId: string
) {
  const previousAction = resolveHotspotInventoryAction(hotspot);
  removeHotspotInventoryActionConvention(hotspot, previousAction);

  if (actionType === "none" || !itemId) {
    delete hotspot.inventoryItemId;
    delete hotspot.placedInventoryItemId;
    delete hotspot.placedInventoryGeometry;
    return;
  }

  if (actionType === "pickupItem") {
    hotspot.inventoryItemId = itemId;
    delete hotspot.placedInventoryItemId;
    delete hotspot.placedInventoryGeometry;
    const completionFlag = buildHotspotPickupFlag(hotspot.id);
    hotspot.conditions = [...hotspot.conditions, { type: "flagEquals", flag: completionFlag, value: false }];
    hotspot.effects = [
      ...hotspot.effects,
      { type: "addItem", itemId },
      { type: "setFlag", flag: completionFlag, value: true }
    ];
    return;
  }

  if (previousAction.type !== "placeItem" || previousAction.itemId !== itemId) {
    delete hotspot.placedInventoryGeometry;
  }

  delete hotspot.inventoryItemId;
  hotspot.placedInventoryItemId = itemId;
  const completionFlag = buildHotspotPlacementFlag(hotspot.id);
  hotspot.requiredItemIds = Array.from(new Set([...hotspot.requiredItemIds, itemId]));
  hotspot.conditions = [...hotspot.conditions, { type: "flagEquals", flag: completionFlag, value: false }];
  hotspot.effects = [
    ...hotspot.effects,
    { type: "removeItem", itemId },
    { type: "setFlag", flag: completionFlag, value: true }
  ];
}

export function applyInventoryLinkToHotspot(
  hotspot: Hotspot,
  item: InventoryItem,
  strings: Record<string, string>
) {
  applyHotspotInventoryAction(hotspot, "pickupItem", item.id);
  hotspot.name = strings[item.textId] ?? item.name ?? hotspot.name;
}

function removeHotspotInventoryActionConvention(
  hotspot: Hotspot,
  action: ReturnType<typeof resolveHotspotInventoryAction>
) {
  const actionType = action.type;
  if (actionType === "none") {
    return;
  }

  const actionItemId = action.itemId;
  const actionFlag = action.completionFlag;

  hotspot.effects = hotspot.effects.filter(
    (effect) => !isHotspotInventoryActionEffect(effect, actionType, actionItemId, actionFlag)
  );
  hotspot.conditions = hotspot.conditions.filter(
    (condition) => !isHotspotInventoryActionCondition(condition, actionFlag)
  );

  if (actionType === "placeItem" && actionItemId) {
    hotspot.requiredItemIds = hotspot.requiredItemIds.filter((itemId) => itemId !== actionItemId);
  }
}

function isHotspotInventoryActionEffect(
  effect: Effect,
  actionType: Exclude<HotspotInventoryActionType, "none">,
  itemId?: string,
  completionFlag?: string
): boolean {
  if (effect.type === "setFlag") {
    return Boolean(completionFlag && effect.flag === completionFlag);
  }

  if (actionType === "pickupItem") {
    return effect.type === "addItem" && effect.itemId === itemId;
  }

  return effect.type === "removeItem" && effect.itemId === itemId;
}

function isHotspotInventoryActionCondition(condition: Condition, completionFlag?: string): boolean {
  return Boolean(completionFlag && condition.type === "flagEquals" && condition.flag === completionFlag);
}

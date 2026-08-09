import {
  buildHotspotPickupFlag,
  buildHotspotPlacementFlag,
  hasHotspotEvent,
  resolveHotspotInventoryAction,
  type Condition,
  type Effect,
  type GameVariableDefinition,
  type Hotspot,
  type HotspotEvent,
  type InventoryItem
} from "@mage2/schema";
import type { EditorTranslator } from "../../i18n/translate";

const identityEditorTranslator: EditorTranslator = (source, params = {}) =>
  source.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder
  );

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
  itemLabel: string,
  t: EditorTranslator = identityEditorTranslator
): string {
  if (actionType === "pickupItem") {
    return itemLabel
      ? t("Adds {itemLabel} to inventory and hides this hotspot after pickup.", { itemLabel })
      : t("Choose the inventory item this hotspot adds to inventory.");
  }

  if (actionType === "placeItem") {
    return itemLabel
      ? t("Requires {itemLabel}, removes it from inventory, and reveals it here after placement.", { itemLabel })
      : t("Choose the inventory item that can be placed here.");
  }

  return t("Choose whether this hotspot changes inventory, starts dialogue, or only uses advanced fields.");
}

export function resolveHotspotInventoryActivationSummary(
  actionType: HotspotInventoryActionType,
  hasItem: boolean,
  t: EditorTranslator = identityEditorTranslator
): string {
  if (actionType === "pickupItem") {
    return hasItem ? t("Add item to inventory") : t("Choose item to pick up");
  }

  if (actionType === "placeItem") {
    return hasItem ? t("Require selected inventory item") : t("Choose item to place");
  }

  return t("No inventory change");
}

export function applyHotspotInventoryAction(
  hotspot: Hotspot,
  actionType: HotspotInventoryActionType,
  itemId: string,
  variables?: GameVariableDefinition[]
) {
  const previousAction = resolveHotspotInventoryAction(hotspot);
  removeHotspotInventoryActionConvention(hotspot, previousAction, variables);

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
    ensureManagedBooleanVariable(variables, completionFlag, `${hotspot.name} picked up`);
    hotspot.conditions = [...hotspot.conditions, { type: "variableCompare", variableId: completionFlag, operator: "equals", value: false }];
    hotspot.effects = [
      ...hotspot.effects,
      { type: "addItem", itemId },
      { type: "setVariable", variableId: completionFlag, value: true }
    ];
    return;
  }

  if (previousAction.type !== "placeItem" || previousAction.itemId !== itemId) {
    delete hotspot.placedInventoryGeometry;
  }

  delete hotspot.inventoryItemId;
  hotspot.placedInventoryItemId = itemId;
  const completionFlag = buildHotspotPlacementFlag(hotspot.id);
  ensureManagedBooleanVariable(variables, completionFlag, `${hotspot.name} item placed`);
  hotspot.requiredItemIds = Array.from(new Set([...hotspot.requiredItemIds, itemId]));
  hotspot.conditions = [...hotspot.conditions, { type: "variableCompare", variableId: completionFlag, operator: "equals", value: false }];
  hotspot.effects = [
    ...hotspot.effects,
    { type: "removeItem", itemId },
    { type: "setVariable", variableId: completionFlag, value: true }
  ];
}

export function applyInventoryLinkToHotspot(
  hotspot: Hotspot,
  item: InventoryItem,
  strings: Record<string, string>,
  variables?: GameVariableDefinition[]
) {
  applyHotspotInventoryAction(hotspot, "pickupItem", item.id, variables);
  hotspot.name = strings[item.textId] ?? item.name ?? hotspot.name;
}

function removeHotspotInventoryActionConvention(
  hotspot: Hotspot,
  action: ReturnType<typeof resolveHotspotInventoryAction>,
  variables?: GameVariableDefinition[]
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
  if (variables && actionFlag) {
    const variableIndex = variables.findIndex((variable) => variable.id === actionFlag && variable.system);
    if (variableIndex >= 0) variables.splice(variableIndex, 1);
  }

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
  if (effect.type === "setVariable") {
    return Boolean(completionFlag && effect.variableId === completionFlag);
  }

  if (actionType === "pickupItem") {
    return effect.type === "addItem" && effect.itemId === itemId;
  }

  return effect.type === "removeItem" && effect.itemId === itemId;
}

function isHotspotInventoryActionCondition(condition: Condition, completionFlag?: string): boolean {
  return Boolean(completionFlag && condition.type === "variableCompare" && condition.variableId === completionFlag);
}

function ensureManagedBooleanVariable(
  variables: GameVariableDefinition[] | undefined,
  id: string,
  name: string
): void {
  if (!variables || variables.some((variable) => variable.id === id)) {
    return;
  }
  variables.push({ id, name, description: "", type: "boolean", initialValue: false, system: true });
}

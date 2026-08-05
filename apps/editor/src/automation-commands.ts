import type { BuiltInLocale } from "@mage2/schema";
import type { EditorTab } from "./store";
import { isBuiltInLocale } from "./i18n/preference";
import { interpolateEditorMessage, type EditorTranslator } from "./i18n/translate";

export type EditorAutomationHotspotAction = "none" | "pickupItem" | "placeItem";

export interface EditorAutomationHotspotGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  polygon?: Array<{ x: number; y: number }>;
}

export type EditorAutomationCommand =
  | { command: "ping" }
  | { command: "getState" }
  | { command: "closeApplication" }
  | { command: "security.getState" }
  | { command: "setInterfaceLocale"; locale: BuiltInLocale }
  | { command: "resetInterfaceLocale" }
  | { command: "createProject"; projectDir: string; projectName: string }
  | { command: "saveProject" }
  | {
      command: "exportProject";
      format?: "windows" | "web";
      mode?: "preview" | "release";
      destinationPath?: string;
    }
  | { command: "listHotspots"; sceneId?: string }
  | { command: "listInventoryItems" }
  | { command: "openProject"; projectDir: string; tab?: EditorTab }
  | { command: "selectTab"; tab: EditorTab }
  | { command: "selectScene"; sceneId: string }
  | { command: "selectHotspot"; hotspotId?: string }
  | { command: "setHotspotInventoryAction"; hotspotId: string; action: EditorAutomationHotspotAction; itemId?: string }
  | { command: "editor.undo" }
  | { command: "editor.redo" }
  | { command: "editor.openFileMenu" }
  | { command: "editor.closeFileMenu" }
  | { command: "editor.openHotspotInspector"; hotspotId?: string }
  | { command: "editor.selectHotspotActionItem"; hotspotId: string; itemId: string }
  | {
      command: "editor.setPlacedObjectGeometry";
      geometry: EditorAutomationHotspotGeometry;
      placedObjectId?: string;
      dropTargetHotspotId?: string;
      itemId?: string;
    }
  | { command: "editor.assertPlacedObjectExists"; dropTargetHotspotId: string; itemId: string }
  | { command: "enterPlaytest" }
  | { command: "playtest.getState" }
  | { command: "playtest.reset" }
  | { command: "playtest.clickHotspot"; hotspotId: string }
  | { command: "playtest.selectInventoryItem"; itemId?: string }
  | { command: "playtest.assertPlacedItemVisible"; hotspotId: string; itemId: string };

export interface EditorAutomationPlaytestState {
  sceneId: string;
  visibleHotspotIds: string[];
  surfaceHotspotIds: string[];
  inventoryItemIds: string[];
  selectedInventoryItemId?: string;
  lastActivatedHotspotId?: string;
  flags: Record<string, boolean>;
  placedVisuals: Record<string, string>;
  placedObjects: Array<{
    id: string;
    itemId: string;
    dropTargetHotspotId: string;
    sourceHotspotId?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface EditorAutomationPlaytestApi {
  getState: () => EditorAutomationPlaytestState;
  reset: () => EditorAutomationPlaytestState;
  clickHotspot: (hotspotId: string) => EditorAutomationPlaytestState;
  selectInventoryItem: (itemId?: string) => EditorAutomationPlaytestState;
  assertPlacedItemVisible: (hotspotId: string, itemId: string) => EditorAutomationPlaytestState;
}

const EDITOR_TABS = new Set<EditorTab>([
  "assets",
  "world",
  "scenes",
  "dialogue",
  "inventory",
  "localization",
  "player",
  "playtest"
]);

const HOTSPOT_ACTIONS = new Set<EditorAutomationHotspotAction>(["none", "pickupItem", "placeItem"]);

export function parseEditorAutomationCommand(input: unknown, t: EditorTranslator = interpolateEditorMessage): EditorAutomationCommand {
  if (!input || typeof input !== "object" || !("command" in input)) {
    throw new Error(t("Automation command must be an object with a command field."));
  }

  const candidate = input as Record<string, unknown>;
  const command = candidate.command;
  if (typeof command !== "string") {
    throw new Error(t("Automation command field must be a string."));
  }

  switch (command) {
    case "ping":
    case "getState":
    case "closeApplication":
    case "security.getState":
    case "resetInterfaceLocale":
    case "saveProject":
    case "listInventoryItems":
    case "enterPlaytest":
    case "playtest.getState":
    case "playtest.reset":
    case "editor.undo":
    case "editor.redo":
    case "editor.openFileMenu":
    case "editor.closeFileMenu":
      return { command };
    case "exportProject": {
      if (candidate.mode !== undefined && candidate.mode !== "preview" && candidate.mode !== "release") {
        throw new Error(t("Automation runtime export mode must be 'preview' or 'release'."));
      }
      if (candidate.format === undefined && candidate.destinationPath === undefined) {
        if (candidate.mode === "preview") {
          throw new Error(t("Automation preview export requires a format and destinationPath."));
        }
        return {
          command,
          ...(candidate.mode ? { mode: candidate.mode } : {})
        };
      }
      if (candidate.format !== "windows" && candidate.format !== "web") {
        throw new Error(t("Automation runtime export format must be 'windows' or 'web'."));
      }
      return {
        command,
        format: candidate.format,
        ...(candidate.mode ? { mode: candidate.mode } : {}),
        destinationPath: requireString(candidate.destinationPath, "destinationPath")
      };
    }
    case "setInterfaceLocale":
      return { command, locale: requireBuiltInLocale(candidate.locale, "locale", t) };
    case "createProject":
      return {
        command,
        projectDir: requireString(candidate.projectDir, "projectDir"),
        projectName: requireString(candidate.projectName, "projectName")
      };
    case "listHotspots":
      return {
        command,
        sceneId: candidate.sceneId === undefined ? undefined : requireString(candidate.sceneId, "sceneId")
      };
    case "openProject":
      return {
        command,
        projectDir: requireString(candidate.projectDir, "projectDir"),
        tab: candidate.tab === undefined ? undefined : requireEditorTab(candidate.tab, "tab")
      };
    case "selectTab":
      return { command, tab: requireEditorTab(candidate.tab, "tab") };
    case "selectScene":
      return { command, sceneId: requireString(candidate.sceneId, "sceneId") };
    case "selectHotspot":
      return {
        command,
        hotspotId: candidate.hotspotId === undefined ? undefined : requireString(candidate.hotspotId, "hotspotId")
      };
    case "setHotspotInventoryAction":
      return {
        command,
        hotspotId: requireString(candidate.hotspotId, "hotspotId"),
        action: requireHotspotAction(candidate.action, "action"),
        itemId: candidate.itemId === undefined ? undefined : requireString(candidate.itemId, "itemId")
      };
    case "editor.openHotspotInspector":
      return {
        command,
        hotspotId: candidate.hotspotId === undefined ? undefined : requireString(candidate.hotspotId, "hotspotId")
      };
    case "editor.selectHotspotActionItem":
      return {
        command,
        hotspotId: requireString(candidate.hotspotId, "hotspotId"),
        itemId: requireString(candidate.itemId, "itemId")
      };
    case "editor.setPlacedObjectGeometry":
      return {
        command,
        placedObjectId: candidate.placedObjectId === undefined ? undefined : requireString(candidate.placedObjectId, "placedObjectId"),
        dropTargetHotspotId:
          candidate.dropTargetHotspotId === undefined ? undefined : requireString(candidate.dropTargetHotspotId, "dropTargetHotspotId"),
        itemId: candidate.itemId === undefined ? undefined : requireString(candidate.itemId, "itemId"),
        geometry: requireHotspotGeometry(candidate.geometry, "geometry")
      };
    case "editor.assertPlacedObjectExists":
      return {
        command,
        dropTargetHotspotId: requireString(candidate.dropTargetHotspotId, "dropTargetHotspotId"),
        itemId: requireString(candidate.itemId, "itemId")
      };
    case "playtest.clickHotspot":
      return { command, hotspotId: requireString(candidate.hotspotId, "hotspotId") };
    case "playtest.selectInventoryItem":
      return {
        command,
        itemId: candidate.itemId === undefined ? undefined : requireString(candidate.itemId, "itemId")
      };
    case "playtest.assertPlacedItemVisible":
      return {
        command,
        hotspotId: requireString(candidate.hotspotId, "hotspotId"),
        itemId: requireString(candidate.itemId, "itemId")
      };
    default:
      throw new Error(t("Unknown automation command '{command}'.", { command }));
  }
}

function requireBuiltInLocale(value: unknown, field: string, t: EditorTranslator = interpolateEditorMessage): BuiltInLocale {
  if (!isBuiltInLocale(value)) {
    throw new Error(t("Automation command field '{field}' must be a built-in interface locale.", { field }));
  }
  return value;
}

function requireString(value: unknown, field: string, t: EditorTranslator = interpolateEditorMessage): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(t("Automation command field '{field}' must be a non-empty string.", { field }));
  }

  return value;
}

function requireEditorTab(value: unknown, field: string): EditorTab {
  const tab = requireString(value, field) as EditorTab;
  if (!EDITOR_TABS.has(tab)) {
    throw new Error(`Automation command field '${field}' must be a known editor tab.`);
  }

  return tab;
}

function requireHotspotAction(value: unknown, field: string): EditorAutomationHotspotAction {
  const action = requireString(value, field) as EditorAutomationHotspotAction;
  if (!HOTSPOT_ACTIONS.has(action)) {
    throw new Error(`Automation command field '${field}' must be none, pickupItem, or placeItem.`);
  }

  return action;
}

function requireHotspotGeometry(value: unknown, field: string): EditorAutomationHotspotGeometry {
  if (!value || typeof value !== "object") {
    throw new Error(`Automation command field '${field}' must be a hotspot geometry object.`);
  }

  const candidate = value as Record<string, unknown>;
  const geometry = {
    x: requireUnitNumber(candidate.x, `${field}.x`),
    y: requireUnitNumber(candidate.y, `${field}.y`),
    width: requireSizeNumber(candidate.width, `${field}.width`),
    height: requireSizeNumber(candidate.height, `${field}.height`),
    polygon: candidate.polygon === undefined ? undefined : requireHotspotPolygon(candidate.polygon, `${field}.polygon`)
  };

  return geometry;
}

function requireUnitNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Automation command field '${field}' must be a number from 0 to 1.`);
  }

  return value;
}

function requireSizeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0.01 || value > 1) {
    throw new Error(`Automation command field '${field}' must be a number from 0.01 to 1.`);
  }

  return value;
}

function requireHotspotPolygon(value: unknown, field: string): Array<{ x: number; y: number }> {
  if (!Array.isArray(value) || (value.length !== 4 && value.length !== 8)) {
    throw new Error(`Automation command field '${field}' must be an array of 4 or 8 points.`);
  }

  return value.map((point, index) => {
    if (!point || typeof point !== "object") {
      throw new Error(`Automation command field '${field}[${index}]' must be a point object.`);
    }

    const candidate = point as Record<string, unknown>;
    return {
      x: requireUnitNumber(candidate.x, `${field}[${index}].x`),
      y: requireUnitNumber(candidate.y, `${field}[${index}].y`)
    };
  });
}

declare global {
  interface Window {
    __mage2PlaytestAutomation?: EditorAutomationPlaytestApi;
  }
}

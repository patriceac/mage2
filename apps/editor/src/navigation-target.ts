import type { EditorTab } from "./store";

export interface EditorNavigationTarget {
  label: string;
  tab: EditorTab;
  locationId?: string;
  sceneId?: string;
  hotspotId?: string;
  dialogueId?: string;
  dialogueNodeId?: string;
  inventoryItemId?: string;
  assetId?: string;
  textId?: string;
  locale?: string;
}

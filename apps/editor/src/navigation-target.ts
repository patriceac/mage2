import type { DialogueSection, EditorTab, LocalizationSection } from "./store";

export interface EditorNavigationTarget {
  label: string;
  tab: EditorTab;
  locationId?: string;
  sceneId?: string;
  hotspotId?: string;
  dialogueId?: string;
  dialogueNodeId?: string;
  dialogueSection?: DialogueSection;
  responseGroupId?: string;
  responseEntryId?: string;
  inventoryItemId?: string;
  assetId?: string;
  textId?: string;
  locale?: string;
  localizationSection?: LocalizationSection;
}

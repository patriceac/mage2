import { create } from "zustand";
import { normalizeSupportedLocales, type ProjectBundle } from "@mage2/schema";
import { createProjectRevision } from "./project-helpers";

export type EditorTab = "assets" | "world" | "scenes" | "dialogue" | "inventory" | "localization" | "playtest";
export type LocalizationSection = "overview" | "strings" | "subtitles" | "media";

interface EditorState {
  projectDir?: string;
  project?: ProjectBundle;
  savedProjectRevision?: string;
  hasUnsavedChanges: boolean;
  activeTab: EditorTab;
  selectedLocationId?: string;
  selectedSceneId?: string;
  selectedDialogueId?: string;
  selectedHotspotId?: string;
  selectedDialogueNodeId?: string;
  selectedInventoryItemId?: string;
  selectedAssetId?: string;
  selectedTextId?: string;
  localizationLocale?: string;
  playtestLocale?: string;
  localizationSection: LocalizationSection;
  playheadMs: number;
  setProjectContext: (project: ProjectBundle, projectDir: string) => void;
  updateProject: (project: ProjectBundle) => void;
  markProjectSaved: (project: ProjectBundle) => void;
  clearProjectContext: () => void;
  setActiveTab: (activeTab: EditorTab) => void;
  setSelectedLocationId: (selectedLocationId?: string) => void;
  setSelectedSceneId: (selectedSceneId?: string) => void;
  setSelectedDialogueId: (selectedDialogueId?: string) => void;
  setSelectedHotspotId: (selectedHotspotId?: string) => void;
  setSelectedDialogueNodeId: (selectedDialogueNodeId?: string) => void;
  setSelectedInventoryItemId: (selectedInventoryItemId?: string) => void;
  setSelectedAssetId: (selectedAssetId?: string) => void;
  setSelectedTextId: (selectedTextId?: string) => void;
  setLocalizationLocale: (localizationLocale?: string) => void;
  setPlaytestLocale: (playtestLocale?: string) => void;
  setLocalizationSection: (localizationSection: LocalizationSection) => void;
  setPlayheadMs: (playheadMs: number) => void;
}

function resolveProjectSelectionState(project: ProjectBundle, state?: Partial<EditorState>) {
  const supportedLocales = normalizeSupportedLocales(project.manifest.defaultLanguage, project.manifest.supportedLocales);
  return {
    selectedLocationId: state?.selectedLocationId ?? project.locations.items[0]?.id,
    selectedSceneId: state?.selectedSceneId ?? project.scenes.items[0]?.id,
    selectedDialogueId: state?.selectedDialogueId ?? project.dialogues.items[0]?.id,
    selectedHotspotId: state?.selectedHotspotId,
    selectedDialogueNodeId: state?.selectedDialogueNodeId,
    selectedInventoryItemId: state?.selectedInventoryItemId,
    selectedAssetId: state?.selectedAssetId ?? project.assets.assets[0]?.id,
    selectedTextId: state?.selectedTextId,
    localizationLocale:
      state?.localizationLocale && supportedLocales.includes(state.localizationLocale)
        ? state.localizationLocale
        : project.manifest.defaultLanguage,
    playtestLocale:
      state?.playtestLocale && supportedLocales.includes(state.playtestLocale)
        ? state.playtestLocale
        : project.manifest.defaultLanguage,
    localizationSection: state?.localizationSection ?? "overview"
  };
}

export const useEditorStore = create<EditorState>((set) => ({
  hasUnsavedChanges: false,
  activeTab: "world",
  localizationSection: "overview",
  playheadMs: 0,
  setProjectContext: (project, projectDir) =>
    set({
      project,
      projectDir,
      savedProjectRevision: createProjectRevision(project),
      hasUnsavedChanges: false,
      activeTab: "world",
      ...resolveProjectSelectionState(project),
      playheadMs: 0
    }),
  updateProject: (project) =>
    set((state) => ({
      project,
      hasUnsavedChanges:
        state.savedProjectRevision !== undefined &&
        createProjectRevision(project) !== state.savedProjectRevision,
      ...resolveProjectSelectionState(project, state)
    })),
  markProjectSaved: (project) =>
    set((state) => ({
      project,
      savedProjectRevision: createProjectRevision(project),
      hasUnsavedChanges: false,
      ...resolveProjectSelectionState(project, state)
    })),
  clearProjectContext: () =>
    set({
      project: undefined,
      projectDir: undefined,
      savedProjectRevision: undefined,
      hasUnsavedChanges: false,
      activeTab: "world",
      selectedLocationId: undefined,
      selectedSceneId: undefined,
      selectedDialogueId: undefined,
      selectedHotspotId: undefined,
      selectedDialogueNodeId: undefined,
      selectedInventoryItemId: undefined,
      selectedAssetId: undefined,
      selectedTextId: undefined,
      localizationLocale: undefined,
      playtestLocale: undefined,
      localizationSection: "overview",
      playheadMs: 0
    }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedLocationId: (selectedLocationId) => set({ selectedLocationId }),
  setSelectedSceneId: (selectedSceneId) => set({ selectedSceneId }),
  setSelectedDialogueId: (selectedDialogueId) => set({ selectedDialogueId }),
  setSelectedHotspotId: (selectedHotspotId) => set({ selectedHotspotId }),
  setSelectedDialogueNodeId: (selectedDialogueNodeId) => set({ selectedDialogueNodeId }),
  setSelectedInventoryItemId: (selectedInventoryItemId) => set({ selectedInventoryItemId }),
  setSelectedAssetId: (selectedAssetId) => set({ selectedAssetId }),
  setSelectedTextId: (selectedTextId) => set({ selectedTextId }),
  setLocalizationLocale: (localizationLocale) => set({ localizationLocale }),
  setPlaytestLocale: (playtestLocale) => set({ playtestLocale }),
  setLocalizationSection: (localizationSection) => set({ localizationSection }),
  setPlayheadMs: (playheadMs) => set({ playheadMs })
}));

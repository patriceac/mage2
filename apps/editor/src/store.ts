import { create } from "zustand";
import { normalizeSupportedLocales, type ProjectBundle } from "@mage2/schema";
import { createProjectRevision } from "./project-helpers";

export type EditorTab = "assets" | "world" | "scenes" | "dialogue" | "inventory" | "localization" | "playtest";
export type LocalizationSection = "overview" | "strings" | "subtitles" | "media";
export interface ProjectUpdateOptions {
  skipHistory?: boolean;
}

export interface MarkProjectSavedOptions {
  clearHistory?: boolean;
}

const PROJECT_HISTORY_LIMIT = 100;

interface EditorState {
  projectDir?: string;
  project?: ProjectBundle;
  savedProjectRevision?: string;
  hasUnsavedChanges: boolean;
  undoStack: ProjectBundle[];
  redoStack: ProjectBundle[];
  canUndo: boolean;
  canRedo: boolean;
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
  updateProject: (project: ProjectBundle, options?: ProjectUpdateOptions) => void;
  captureUndoCheckpoint: () => void;
  undoProject: () => void;
  redoProject: () => void;
  markProjectSaved: (project: ProjectBundle, options?: MarkProjectSavedOptions) => void;
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

function trimProjectHistory(stack: ProjectBundle[]): ProjectBundle[] {
  return stack.length <= PROJECT_HISTORY_LIMIT ? stack : stack.slice(stack.length - PROJECT_HISTORY_LIMIT);
}

function resolveHistoryState(undoStack: ProjectBundle[], redoStack: ProjectBundle[]) {
  return {
    undoStack,
    redoStack,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0
  };
}

function resolveProjectRevision(project?: ProjectBundle): string | undefined {
  return project ? createProjectRevision(project) : undefined;
}

export const useEditorStore = create<EditorState>((set) => ({
  hasUnsavedChanges: false,
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,
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
      ...resolveHistoryState([], []),
      playheadMs: 0
    }),
  updateProject: (project, options) =>
    set((state) => {
      const nextRevision = createProjectRevision(project);
      const currentProject = state.project;
      const currentRevision = resolveProjectRevision(currentProject);
      const hasChanged = currentRevision !== nextRevision;
      const shouldRecordHistory = hasChanged && !options?.skipHistory && currentProject !== undefined;
      const nextUndoStack = shouldRecordHistory ? trimProjectHistory([...state.undoStack, currentProject]) : state.undoStack;
      const nextRedoStack = shouldRecordHistory ? [] : state.redoStack;

      return {
        project,
        hasUnsavedChanges: state.savedProjectRevision !== undefined && nextRevision !== state.savedProjectRevision,
        ...resolveProjectSelectionState(project, state),
        ...resolveHistoryState(nextUndoStack, nextRedoStack)
      };
    }),
  captureUndoCheckpoint: () =>
    set((state) => {
      if (!state.project) {
        return {};
      }

      const currentRevision = createProjectRevision(state.project);
      const latestUndoRevision = resolveProjectRevision(state.undoStack[state.undoStack.length - 1]);
      if (currentRevision === latestUndoRevision) {
        return state.redoStack.length > 0 ? resolveHistoryState(state.undoStack, []) : {};
      }

      return resolveHistoryState(trimProjectHistory([...state.undoStack, state.project]), []);
    }),
  undoProject: () =>
    set((state) => {
      if (!state.project || state.undoStack.length === 0) {
        return {};
      }

      const previousProject = state.undoStack[state.undoStack.length - 1]!;
      const nextUndoStack = state.undoStack.slice(0, -1);
      const nextRedoStack = trimProjectHistory([...state.redoStack, state.project]);

      return {
        project: previousProject,
        hasUnsavedChanges:
          state.savedProjectRevision !== undefined &&
          createProjectRevision(previousProject) !== state.savedProjectRevision,
        ...resolveProjectSelectionState(previousProject, state),
        ...resolveHistoryState(nextUndoStack, nextRedoStack)
      };
    }),
  redoProject: () =>
    set((state) => {
      if (!state.project || state.redoStack.length === 0) {
        return {};
      }

      const nextProject = state.redoStack[state.redoStack.length - 1]!;
      const nextRedoStack = state.redoStack.slice(0, -1);
      const nextUndoStack = trimProjectHistory([...state.undoStack, state.project]);

      return {
        project: nextProject,
        hasUnsavedChanges:
          state.savedProjectRevision !== undefined &&
          createProjectRevision(nextProject) !== state.savedProjectRevision,
        ...resolveProjectSelectionState(nextProject, state),
        ...resolveHistoryState(nextUndoStack, nextRedoStack)
      };
    }),
  markProjectSaved: (project, options) =>
    set((state) => ({
      project,
      savedProjectRevision: createProjectRevision(project),
      hasUnsavedChanges: false,
      ...resolveProjectSelectionState(project, state),
      ...resolveHistoryState(options?.clearHistory ? [] : state.undoStack, options?.clearHistory ? [] : state.redoStack)
    })),
  clearProjectContext: () =>
    set({
      project: undefined,
      projectDir: undefined,
      savedProjectRevision: undefined,
      hasUnsavedChanges: false,
      ...resolveHistoryState([], []),
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

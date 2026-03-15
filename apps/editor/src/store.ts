import { create } from "zustand";
import type { ProjectBundle } from "@mage2/schema";
import { createProjectRevision } from "./project-helpers";

export type EditorTab = "assets" | "world" | "scenes" | "dialogue" | "inventory" | "playtest";

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
  setPlayheadMs: (playheadMs: number) => void;
}

function resolveProjectSelectionState(project: ProjectBundle, state?: Partial<EditorState>) {
  return {
    selectedLocationId: state?.selectedLocationId ?? project.locations.items[0]?.id,
    selectedSceneId: state?.selectedSceneId ?? project.scenes.items[0]?.id,
    selectedDialogueId: state?.selectedDialogueId ?? project.dialogues.items[0]?.id,
    selectedHotspotId: state?.selectedHotspotId,
    selectedDialogueNodeId: state?.selectedDialogueNodeId,
    selectedInventoryItemId: state?.selectedInventoryItemId
  };
}

export const useEditorStore = create<EditorState>((set) => ({
  hasUnsavedChanges: false,
  activeTab: "world",
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
      playheadMs: 0
    }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedLocationId: (selectedLocationId) => set({ selectedLocationId }),
  setSelectedSceneId: (selectedSceneId) => set({ selectedSceneId }),
  setSelectedDialogueId: (selectedDialogueId) => set({ selectedDialogueId }),
  setSelectedHotspotId: (selectedHotspotId) => set({ selectedHotspotId }),
  setSelectedDialogueNodeId: (selectedDialogueNodeId) => set({ selectedDialogueNodeId }),
  setSelectedInventoryItemId: (selectedInventoryItemId) => set({ selectedInventoryItemId }),
  setPlayheadMs: (playheadMs) => set({ playheadMs })
}));

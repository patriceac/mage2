import { create } from "zustand";
import type { ProjectBundle } from "@mage2/schema";

export type EditorTab = "assets" | "world" | "scenes" | "dialogue" | "inventory" | "playtest";

interface EditorState {
  projectDir?: string;
  project?: ProjectBundle;
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
  setActiveTab: (activeTab: EditorTab) => void;
  setSelectedLocationId: (selectedLocationId?: string) => void;
  setSelectedSceneId: (selectedSceneId?: string) => void;
  setSelectedDialogueId: (selectedDialogueId?: string) => void;
  setSelectedHotspotId: (selectedHotspotId?: string) => void;
  setSelectedDialogueNodeId: (selectedDialogueNodeId?: string) => void;
  setSelectedInventoryItemId: (selectedInventoryItemId?: string) => void;
  setPlayheadMs: (playheadMs: number) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeTab: "assets",
  playheadMs: 0,
  setProjectContext: (project, projectDir) =>
    set({
      project,
      projectDir,
      selectedLocationId: project.locations.items[0]?.id,
      selectedSceneId: project.scenes.items[0]?.id,
      selectedDialogueId: project.dialogues.items[0]?.id,
      selectedHotspotId: undefined,
      selectedDialogueNodeId: undefined,
      selectedInventoryItemId: undefined,
      playheadMs: 0
    }),
  updateProject: (project) =>
    set((state) => ({
      project,
      selectedLocationId: state.selectedLocationId ?? project.locations.items[0]?.id,
      selectedSceneId: state.selectedSceneId ?? project.scenes.items[0]?.id,
      selectedDialogueId: state.selectedDialogueId ?? project.dialogues.items[0]?.id,
      selectedHotspotId: state.selectedHotspotId,
      selectedDialogueNodeId: state.selectedDialogueNodeId,
      selectedInventoryItemId: state.selectedInventoryItemId
    })),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedLocationId: (selectedLocationId) => set({ selectedLocationId }),
  setSelectedSceneId: (selectedSceneId) => set({ selectedSceneId }),
  setSelectedDialogueId: (selectedDialogueId) => set({ selectedDialogueId }),
  setSelectedHotspotId: (selectedHotspotId) => set({ selectedHotspotId }),
  setSelectedDialogueNodeId: (selectedDialogueNodeId) => set({ selectedDialogueNodeId }),
  setSelectedInventoryItemId: (selectedInventoryItemId) => set({ selectedInventoryItemId }),
  setPlayheadMs: (playheadMs) => set({ playheadMs })
}));

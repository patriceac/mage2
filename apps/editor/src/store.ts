import { create } from "zustand";
import {
  buildHotspotPickupFlag,
  buildHotspotPlacementFlag,
  normalizeSupportedLocales,
  resolveHotspotInventoryAction,
  type ProjectBundle
} from "@mage2/schema";
import { createProjectRevision } from "./project-helpers";

export type EditorTab = "assets" | "world" | "scenes" | "dialogue" | "inventory" | "localization" | "playtest";
export type LocalizationSection = "overview" | "strings" | "media";
export type DialogueSection = "dialogues" | "responses";
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
  selectedResponseGroupId?: string;
  selectedResponseEntryId?: string;
  selectedInventoryItemId?: string;
  selectedAssetId?: string;
  selectedTextId?: string;
  localizationLocale?: string;
  playtestLocale?: string;
  localizationSection: LocalizationSection;
  dialogueSection: DialogueSection;
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
  setSelectedResponseGroupId: (selectedResponseGroupId?: string) => void;
  setSelectedResponseEntryId: (selectedResponseEntryId?: string) => void;
  setSelectedInventoryItemId: (selectedInventoryItemId?: string) => void;
  setSelectedAssetId: (selectedAssetId?: string) => void;
  setSelectedTextId: (selectedTextId?: string) => void;
  setLocalizationLocale: (localizationLocale?: string) => void;
  setPlaytestLocale: (playtestLocale?: string) => void;
  setLocalizationSection: (localizationSection: LocalizationSection) => void;
  setDialogueSection: (dialogueSection: DialogueSection) => void;
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
    selectedResponseGroupId: state?.selectedResponseGroupId ?? project.dialogues.responseGroups[0]?.id,
    selectedResponseEntryId: state?.selectedResponseEntryId,
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
    localizationSection: state?.localizationSection ?? "overview",
    dialogueSection: state?.dialogueSection ?? "dialogues"
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

function normalizeProjectInventoryPlacement(project: ProjectBundle): ProjectBundle {
  let projectChanged = false;
  const scenes = project.scenes.items.map((scene) => {
    let sceneChanged = false;
    const hotspots = scene.hotspots.map((hotspot) => {
      const action = resolveHotspotInventoryAction(hotspot);
      if (action.type !== "placeItem" || !action.itemId || !hotspot.inventoryItemId) {
        return hotspot;
      }

      sceneChanged = true;
      const nextHotspot = {
        ...hotspot,
        placedInventoryItemId: hotspot.placedInventoryItemId ?? action.itemId
      };
      delete nextHotspot.inventoryItemId;
      return nextHotspot;
    });

    if (!sceneChanged) {
      return scene;
    }

    projectChanged = true;
    return {
      ...scene,
      hotspots
    };
  });

  return projectChanged
    ? {
        ...project,
        scenes: {
          ...project.scenes,
          items: scenes
        }
      }
    : project;
}

function normalizeProjectHistoryStack(stack: ProjectBundle[]): ProjectBundle[] {
  let changed = false;
  const normalizedStack = stack.map((project) => {
    const normalizedProject = normalizeProjectInventoryPlacement(project);
    if (normalizedProject !== project) {
      changed = true;
    }
    return normalizedProject;
  });

  return changed ? normalizedStack : stack;
}

function normalizeUndoSnapshotForPlacementTransition(project: ProjectBundle, nextProject: ProjectBundle): ProjectBundle {
  const nextPlacementItemIds = new Map<string, string>();
  for (const scene of nextProject.scenes.items) {
    for (const hotspot of scene.hotspots) {
      const action = resolveHotspotInventoryAction(hotspot);
      if (action.type === "placeItem" && action.itemId) {
        nextPlacementItemIds.set(buildSceneHotspotKey(scene.id, hotspot.id), action.itemId);
      }
    }
  }

  if (nextPlacementItemIds.size === 0) {
    return project;
  }

  let projectChanged = false;
  const scenes = project.scenes.items.map((scene) => {
    let sceneChanged = false;
    const hotspots = scene.hotspots.map((hotspot) => {
      const placementItemId = nextPlacementItemIds.get(buildSceneHotspotKey(scene.id, hotspot.id));
      if (!placementItemId || hotspot.inventoryItemId !== placementItemId) {
        return hotspot;
      }

      const action = resolveHotspotInventoryAction(hotspot);
      if (action.type === "placeItem") {
        return hotspot;
      }

      sceneChanged = true;
      return clearLegacyPlacementTargetInventoryOwnership(hotspot, placementItemId);
    });

    if (!sceneChanged) {
      return scene;
    }

    projectChanged = true;
    return {
      ...scene,
      hotspots
    };
  });

  return projectChanged
    ? {
        ...project,
        scenes: {
          ...project.scenes,
          items: scenes
        }
      }
    : project;
}

function clearLegacyPlacementTargetInventoryOwnership(
  hotspot: ProjectBundle["scenes"]["items"][number]["hotspots"][number],
  itemId: string
): ProjectBundle["scenes"]["items"][number]["hotspots"][number] {
  const inventoryActionFlags = new Set([buildHotspotPickupFlag(hotspot.id), buildHotspotPlacementFlag(hotspot.id)]);
  const nextHotspot = {
    ...hotspot,
    requiredItemIds: hotspot.requiredItemIds.filter((requiredItemId) => requiredItemId !== itemId),
    conditions: hotspot.conditions.filter(
      (condition) => condition.type !== "flagEquals" || !inventoryActionFlags.has(condition.flag)
    ),
    effects: hotspot.effects.filter((effect) => {
      if ((effect.type === "addItem" || effect.type === "removeItem") && effect.itemId === itemId) {
        return false;
      }

      return effect.type !== "setFlag" || !inventoryActionFlags.has(effect.flag);
    })
  };
  delete nextHotspot.inventoryItemId;
  delete nextHotspot.placedInventoryItemId;
  delete nextHotspot.placedInventoryGeometry;
  return nextHotspot;
}

function buildSceneHotspotKey(sceneId: string, hotspotId: string): string {
  return `${sceneId}:${hotspotId}`;
}

export const useEditorStore = create<EditorState>((set) => ({
  hasUnsavedChanges: false,
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,
  activeTab: "world",
  localizationSection: "overview",
  dialogueSection: "dialogues",
  playheadMs: 0,
  setProjectContext: (project, projectDir) => {
    const normalizedProject = normalizeProjectInventoryPlacement(project);
    set({
      project: normalizedProject,
      projectDir,
      savedProjectRevision: createProjectRevision(normalizedProject),
      hasUnsavedChanges: false,
      activeTab: "world",
      ...resolveProjectSelectionState(normalizedProject),
      ...resolveHistoryState([], []),
      playheadMs: 0
    });
  },
  updateProject: (project, options) =>
    set((state) => {
      const nextProject = normalizeProjectInventoryPlacement(project);
      const nextRevision = createProjectRevision(nextProject);
      const currentProject = state.project ? normalizeProjectInventoryPlacement(state.project) : undefined;
      const currentRevision = resolveProjectRevision(currentProject);
      const hasChanged = currentRevision !== nextRevision;
      const shouldRecordHistory = hasChanged && !options?.skipHistory && currentProject !== undefined;
      const currentHistoryProject =
        shouldRecordHistory && currentProject
          ? normalizeUndoSnapshotForPlacementTransition(currentProject, nextProject)
          : currentProject;
      const nextUndoStack =
        shouldRecordHistory && currentHistoryProject
          ? trimProjectHistory([...state.undoStack, currentHistoryProject])
          : state.undoStack;
      const nextRedoStack = shouldRecordHistory ? [] : state.redoStack;

      return {
        project: nextProject,
        hasUnsavedChanges: state.savedProjectRevision !== undefined && nextRevision !== state.savedProjectRevision,
        ...resolveProjectSelectionState(nextProject, state),
        ...resolveHistoryState(normalizeProjectHistoryStack(nextUndoStack), normalizeProjectHistoryStack(nextRedoStack))
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

      const previousProject = normalizeProjectInventoryPlacement(state.undoStack[state.undoStack.length - 1]!);
      const nextUndoStack = normalizeProjectHistoryStack(state.undoStack.slice(0, -1));
      const currentProject = normalizeProjectInventoryPlacement(state.project);
      const nextRedoStack = trimProjectHistory([...normalizeProjectHistoryStack(state.redoStack), currentProject]);

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

      const nextProject = normalizeProjectInventoryPlacement(state.redoStack[state.redoStack.length - 1]!);
      const nextRedoStack = normalizeProjectHistoryStack(state.redoStack.slice(0, -1));
      const currentProject = normalizeProjectInventoryPlacement(state.project);
      const nextUndoStack = trimProjectHistory([...normalizeProjectHistoryStack(state.undoStack), currentProject]);

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
    set((state) => {
      const normalizedProject = normalizeProjectInventoryPlacement(project);
      return {
        project: normalizedProject,
        savedProjectRevision: createProjectRevision(normalizedProject),
        hasUnsavedChanges: false,
        ...resolveProjectSelectionState(normalizedProject, state),
        ...resolveHistoryState(
          options?.clearHistory ? [] : normalizeProjectHistoryStack(state.undoStack),
          options?.clearHistory ? [] : normalizeProjectHistoryStack(state.redoStack)
        )
      };
    }),
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
      selectedResponseGroupId: undefined,
      selectedResponseEntryId: undefined,
      selectedInventoryItemId: undefined,
      selectedAssetId: undefined,
      selectedTextId: undefined,
      localizationLocale: undefined,
      playtestLocale: undefined,
      localizationSection: "overview",
      dialogueSection: "dialogues",
      playheadMs: 0
    }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedLocationId: (selectedLocationId) => set({ selectedLocationId }),
  setSelectedSceneId: (selectedSceneId) => set({ selectedSceneId }),
  setSelectedDialogueId: (selectedDialogueId) => set({ selectedDialogueId }),
  setSelectedHotspotId: (selectedHotspotId) => set({ selectedHotspotId }),
  setSelectedDialogueNodeId: (selectedDialogueNodeId) => set({ selectedDialogueNodeId }),
  setSelectedResponseGroupId: (selectedResponseGroupId) => set({ selectedResponseGroupId }),
  setSelectedResponseEntryId: (selectedResponseEntryId) => set({ selectedResponseEntryId }),
  setSelectedInventoryItemId: (selectedInventoryItemId) => set({ selectedInventoryItemId }),
  setSelectedAssetId: (selectedAssetId) => set({ selectedAssetId }),
  setSelectedTextId: (selectedTextId) => set({ selectedTextId }),
  setLocalizationLocale: (localizationLocale) => set({ localizationLocale }),
  setPlaytestLocale: (playtestLocale) => set({ playtestLocale }),
  setLocalizationSection: (localizationSection) => set({ localizationSection }),
  setDialogueSection: (dialogueSection) => set({ dialogueSection }),
  setPlayheadMs: (playheadMs) => set({ playheadMs })
}));

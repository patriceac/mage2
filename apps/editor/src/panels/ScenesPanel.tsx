import {
  useEffect,
  useRef,
  useState
} from "react";
import { type MediaSurfaceDropEvent } from "../MediaSurface";
import {
  getLocaleStringValues,
  resolveHotspotInventoryAction,
  resolvePlacedInventoryHotspotInstance,
  type Hotspot,
  type ProjectBundle,
  validateProject
} from "@mage2/schema";
import { resolveSceneTimelineDurationMs } from "@mage2/player";
import {
  BACKGROUND_IMPORT_EXTENSIONS,
  FOREGROUND_MEDIA_IMPORT_EXTENSIONS,
  IMAGE_IMPORT_EXTENSIONS,
  SCENE_AUDIO_IMPORT_EXTENSIONS,
  isBackgroundImportPath,
  isImageImportPath,
  isVideoImportPath,
  isSceneAudioImportPath
} from "../asset-file-types";
import { useDialogs } from "../dialogs";
import { getLocalizedAssetVariant } from "../localized-project";
import {
  addHotspot,
  addHotspotAtBestAvailablePosition,
  addScene,
  addAssetRoots,
  cloneProject,
  collectSceneReferenceSummary,
  isBackgroundAsset,
  isForegroundMediaAsset,
  isSceneAudioAsset,
  removeHotspotFromProject,
  removeSceneFromProject
} from "../project-helpers";
import { resolveHotspotVisuals } from "../hotspot-visuals";
import {
  applyHotspotKeyboardTransform,
  applyHotspotRotationDegrees,
  geometryMatches,
  type HotspotGeometry,
  type HotspotKeyboardTransform
} from "../hotspot-geometry";
import { type FloatingWindowPosition } from "../floating-window";
import { useEditorStore } from "../store";
import { SceneCanvas, type SceneOperationFeedback, type SceneOperationFeedbackTone } from "./scenes/SceneCanvas";
import { SceneActionRail } from "./scenes/SceneActionRail";
import {
  InventoryPlacementPickerWindow,
  resolveInventoryPickerToggleResult
} from "./scenes/InventoryPlacementPickerWindow";
import { HotspotInspectorWindow } from "./scenes/HotspotInspectorWindow";
import { SceneListRail } from "./scenes/SceneListRail";
import { SceneMediaSection } from "./scenes/SceneMediaSection";
import { SceneWiringSection } from "./scenes/SceneWiringSection";
import { applyInventoryLinkToHotspot } from "./scenes/hotspot-domain";
import {
  INVENTORY_ITEM_DRAG_TYPE,
  filterInventoryPlacementOptions,
  resolveDraggedInventoryItemId,
  resolveDraggedInventoryPreviewSize,
  resolveDroppedInventoryHotspotBounds,
  resolveLinkedInventoryOptions
} from "./scenes/inventory-placement-domain";
import {
  SCENE_AUDIO_DROP_REJECTION_MESSAGE,
  VIDEO_BACKGROUND_BLOCKED_BY_SCENE_AUDIO_MESSAGE,
  applySceneBackgroundAsset,
  canAssignSceneBackgroundAsset,
  resolveDeleteSceneBlockedMessage,
  resolveDeleteSceneStatusMessage,
  resolveSceneAudioDropAcceptance,
  type SceneAudioDropAcceptance
} from "./scenes/scene-domain";
import { useSceneMediaPlayback } from "./scenes/useSceneMediaPlayback";

export {
  resolveLocationSwitcherOptions,
  resolveSceneActionMenuItems,
  resolveSceneSwitcherMenuNavigation,
  resolveSceneSwitcherOptions
} from "./scenes/SceneListRail";
export {
  applySceneBackgroundAsset,
  canAssignSceneBackgroundAsset,
  loadCornerFirstHotspotHandlesPreference,
  resolveCornerFirstHotspotHandlesPreferenceValue,
  resolveSceneAudioDropAcceptance,
  saveCornerFirstHotspotHandlesPreference
} from "./scenes/scene-domain";
export type { SceneAudioDropAcceptance, SceneAudioDropCandidate } from "./scenes/scene-domain";
export { formatCanvasZoomLabel } from "./scenes/SceneCanvas";
export {
  resolveInventoryPickerKeyboardAction,
  resolveInventoryPickerToggleResult
} from "./scenes/InventoryPlacementPickerWindow";
export {
  filterInventoryPlacementOptions,
  resolveDroppedInventoryHotspotBounds,
  resolveInventoryDragPreviewOffset,
  resolveInventoryPreviewContentSize,
  resolveLinkedInventoryOptions
} from "./scenes/inventory-placement-domain";
export { applyInventoryLinkToHotspot } from "./scenes/hotspot-domain";
export {
  applyHotspotFeedbackValue,
  applyHotspotInventoryAction,
  resolveHotspotFeedbackValue,
  resolveHotspotInventoryActionSummary,
  updateOptionalHotspotEvent
} from "./scenes/hotspot-domain";

interface ScenesPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  hotspotInspectorOpenRequest?: number;
  setStatusMessage: (message: string) => void;
  setBusyLabel: (label?: string) => void;
}

export function ScenesPanel({
  project,
  mutateProject,
  hotspotInspectorOpenRequest,
  setStatusMessage,
  setBusyLabel
}: ScenesPanelProps) {
  const dialogs = useDialogs();
  const scenesPanelRef = useRef<HTMLDivElement>(null);
  const inventoryPickerAnchorRef = useRef<HTMLButtonElement>(null);
  const hotspotKeyboardTransformBatchRef = useRef<{ hotspotId?: string; signature?: string }>({});
  const activeTab = useEditorStore((state) => state.activeTab);
  const selectedSceneId = useEditorStore((state) => state.selectedSceneId);
  const playheadMs = useEditorStore((state) => state.playheadMs);
  const setSelectedSceneId = useEditorStore((state) => state.setSelectedSceneId);
  const selectedHotspotId = useEditorStore((state) => state.selectedHotspotId);
  const setSelectedHotspotId = useEditorStore((state) => state.setSelectedHotspotId);
  const setPlayheadMs = useEditorStore((state) => state.setPlayheadMs);
  const updateProject = useEditorStore((state) => state.updateProject);
  const captureUndoCheckpoint = useEditorStore((state) => state.captureUndoCheckpoint);
  const activeLocale = project.manifest.defaultLanguage;
  const availableBackgroundAssets = project.assets.assets.filter(isBackgroundAsset);
  const availableSceneAudioAssets = project.assets.assets.filter(isSceneAudioAsset);
  const availableForegroundMediaAssets = project.assets.assets.filter(isForegroundMediaAsset);

  const currentScene = project.scenes.items.find((entry) => entry.id === selectedSceneId) ?? project.scenes.items[0];
  const currentSceneId = currentScene?.id;
  const currentAsset = project.assets.assets.find((entry) => entry.id === currentScene?.backgroundAssetId);
  const currentAssetVariant = getLocalizedAssetVariant(currentAsset, activeLocale);
  const currentSceneAudioAsset = project.assets.assets.find((entry) => entry.id === currentScene?.sceneAudioAssetId);
  const currentSceneAudioVariant = getLocalizedAssetVariant(currentSceneAudioAsset, activeLocale);
  const { sceneAudioRef, sceneAudioUrl } = useSceneMediaPlayback({
    backgroundAssetKind: currentAsset?.kind,
    playheadMs,
    scene: currentScene,
    sceneAudioAsset: currentSceneAudioAsset,
    sceneAudioVariant: currentSceneAudioVariant,
    setPlayheadMs
  });
  const sceneSupportsAudio = currentAsset?.kind === "image";
  const hasSceneAudioAssigned = Boolean(currentScene?.sceneAudioAssetId);
  const backgroundImportAcceptsVideo = !hasSceneAudioAssigned;
  const sceneTimelineDurationMs = resolveSceneTimelineDurationMs(
    currentAssetVariant?.durationMs,
    sceneSupportsAudio ? currentScene?.sceneAudioDelayMs ?? 0 : 0,
    sceneSupportsAudio ? currentSceneAudioVariant?.durationMs : undefined
  );
  const selectedHotspot = currentScene?.hotspots.find((entry) => entry.id === selectedHotspotId);
  const localeStrings = getLocaleStringValues(project, activeLocale);
  const [isBackgroundDropActive, setIsBackgroundDropActive] = useState(false);
  const [isSceneAudioDropActive, setIsSceneAudioDropActive] = useState(false);
  const [isInventoryPickerOpen, setIsInventoryPickerOpen] = useState(false);
  const [isInventoryPickerDragging, setIsInventoryPickerDragging] = useState(false);
  const [isInventoryPlacementDropActive, setIsInventoryPlacementDropActive] = useState(false);
  const [isHotspotInspectorOpen, setIsHotspotInspectorOpen] = useState(Boolean(selectedHotspot));
  const [isHotspotInspectorActive, setIsHotspotInspectorActive] = useState(false);
  const [inventoryPickerPosition, setInventoryPickerPosition] = useState<FloatingWindowPosition>();
  const [inventoryPickerSearch, setInventoryPickerSearch] = useState("");
  const [activeInventoryPickerItemId, setActiveInventoryPickerItemId] = useState<string>();
  const [hotspotInspectorPosition, setHotspotInspectorPosition] = useState<FloatingWindowPosition>();
  const [sceneOperationFeedback, setSceneOperationFeedback] = useState<SceneOperationFeedback>();
  const backgroundDropDepthRef = useRef(0);
  const inventoryPlacementDropDepthRef = useRef(0);
  const inventoryDragPreviewSizeRef = useRef<{ itemId: string; widthPx: number; heightPx: number } | undefined>(undefined);
  const sceneAudioDropDepthRef = useRef(0);
  const lastAppliedHotspotInspectorOpenRequestRef = useRef(hotspotInspectorOpenRequest ?? 0);
  const linkedInventoryOptions = resolveLinkedInventoryOptions(
    project.inventory.items,
    project.assets.assets,
    localeStrings,
    selectedHotspot
      ? resolveHotspotInventoryAction(selectedHotspot).itemId ?? selectedHotspot.inventoryItemId
      : undefined
  );
  const eligibleLinkedInventoryOptions = linkedInventoryOptions.filter((option) => option.eligible);
  const visibleInventoryPickerOptions = filterInventoryPlacementOptions(eligibleLinkedInventoryOptions, inventoryPickerSearch);
  const activeInventoryPickerItem =
    visibleInventoryPickerOptions.find((option) => option.itemId === activeInventoryPickerItemId) ??
    visibleInventoryPickerOptions[0];
  const placedInventoryInstances = currentScene.hotspots
    .map((hotspot) => resolvePlacedInventoryHotspotInstance(hotspot, currentScene.hotspots))
    .filter((instance): instance is NonNullable<typeof instance> => Boolean(instance));
  const authoredSceneSurfaceHotspots = currentScene.hotspots.map((hotspot) =>
    resolveHotspotInventoryAction(hotspot).type === "placeItem" && hotspot.inventoryItemId
      ? { ...hotspot, inventoryItemId: undefined }
      : hotspot
  );
  const sceneSurfaceHotspots = [...authoredSceneSurfaceHotspots, ...placedInventoryInstances.map((instance) => instance.hotspot)];
  const hotspotVisuals = resolveHotspotVisuals({
    hotspots: sceneSurfaceHotspots,
    inventoryItems: project.inventory.items,
    assets: project.assets.assets,
    locale: activeLocale,
    strings: localeStrings
  });
  const floatingWindowVisibility = resolveScenesFloatingWindowVisibility(
    isInventoryPickerOpen,
    Boolean(selectedHotspot),
    isHotspotInspectorOpen
  );

  function reportSceneOperation(message: string, tone: SceneOperationFeedbackTone) {
    setSceneOperationFeedback({ message, tone });
    setStatusMessage(message);
  }

  useEffect(() => {
    setSceneOperationFeedback(undefined);
  }, [currentSceneId]);

  useEffect(() => {
    if (selectedHotspot) {
      setIsInventoryPickerOpen(false);
      return;
    }

    setIsHotspotInspectorActive(false);
  }, [selectedHotspot]);

  useEffect(() => {
    if (
      !shouldApplyHotspotInspectorOpenRequest(
        hotspotInspectorOpenRequest,
        lastAppliedHotspotInspectorOpenRequestRef.current,
        Boolean(selectedHotspot)
      )
    ) {
      return;
    }

    lastAppliedHotspotInspectorOpenRequestRef.current = hotspotInspectorOpenRequest ?? 0;
    setIsInventoryPickerOpen(false);
    setIsHotspotInspectorOpen(true);
  }, [hotspotInspectorOpenRequest, selectedHotspot]);

  useEffect(() => {
    if (visibleInventoryPickerOptions.some((option) => option.itemId === activeInventoryPickerItemId)) {
      return;
    }

    setActiveInventoryPickerItemId(visibleInventoryPickerOptions[0]?.itemId);
  }, [activeInventoryPickerItemId, visibleInventoryPickerOptions]);

  function updateHotspotGeometry(hotspotId: string, geometry: HotspotGeometry) {
    const currentProject = useEditorStore.getState().project ?? project;
    const nextProject = cloneProject(currentProject);
    const placedInventoryInstance = placedInventoryInstances.find((instance) => instance.id === hotspotId);
    if (placedInventoryInstance) {
      const dropTarget = nextProject.scenes.items
        .find((entry) => entry.id === currentSceneId)
        ?.hotspots.find((entry) => entry.id === placedInventoryInstance.dropTargetHotspotId);

      if (!dropTarget) {
        return;
      }

      dropTarget.placedInventoryGeometry = {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        polygon: geometry.polygon
      };
      updateProject(nextProject, { skipHistory: true });
      return;
    }

    const target = nextProject.scenes.items
      .find((entry) => entry.id === currentSceneId)
      ?.hotspots.find((entry) => entry.id === hotspotId);

    if (!target) {
      return;
    }

    target.x = geometry.x;
    target.y = geometry.y;
    target.width = geometry.width;
    target.height = geometry.height;
    target.polygon = geometry.polygon;
    updateProject(nextProject, { skipHistory: true });
  }

  function captureHotspotDragCheckpoint() {
    captureUndoCheckpoint();
  }

  async function importBackgroundFromFilePath(filePath: string) {
    if (!currentScene) {
      return;
    }

    if (currentScene.sceneAudioAssetId && isVideoImportPath(filePath)) {
      reportSceneOperation(VIDEO_BACKGROUND_BLOCKED_BY_SCENE_AUDIO_MESSAGE, "error");
      return;
    }

    try {
      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error("No project directory is currently open.");
      }

      setBusyLabel("Importing background");
      const { importedAssets, duplicateFilePaths, duplicateAssets } = await window.editorApi.importAssets(
        projectDir,
        activeLocale,
        project.assets.assets,
        [filePath],
        "background"
      );
      if (importedAssets.length === 0) {
        const duplicateAsset = duplicateAssets[0]
          ? project.assets.assets.find((entry) => entry.id === duplicateAssets[0]!.assetId)
          : undefined;
        if (duplicateAsset) {
          if (!canAssignSceneBackgroundAsset(currentScene, duplicateAsset.kind)) {
            reportSceneOperation(VIDEO_BACKGROUND_BLOCKED_BY_SCENE_AUDIO_MESSAGE, "error");
            return;
          }

          mutateProject((draft) => {
            const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
            if (scene) {
              applySceneBackgroundAsset(scene, duplicateAsset.id, duplicateAsset.kind);
            }
          });
          useEditorStore.getState().setSelectedAssetId(duplicateAsset.id);
          reportSceneOperation(
            `Assigned existing ${duplicateAsset.name} as the background for ${currentScene.name}. Save the project to keep this change.`,
            "success"
          );
          return;
        }

        if (duplicateFilePaths.length > 0) {
          reportSceneOperation(
            "That file already exists as a background asset. Choose it from the background picker.",
            "warning"
          );
        } else {
          reportSceneOperation("No new background asset was created.", "warning");
        }
        return;
      }

      const importedAsset = importedAssets[0]!;
      if (!canAssignSceneBackgroundAsset(currentScene, importedAsset.kind)) {
        reportSceneOperation(VIDEO_BACKGROUND_BLOCKED_BY_SCENE_AUDIO_MESSAGE, "error");
        return;
      }

      mutateProject((draft) => {
        addAssetRoots(draft, [importedAsset]);
        draft.assets.assets.push(importedAsset);
        const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
        if (scene) {
          applySceneBackgroundAsset(scene, importedAsset.id, importedAsset.kind);
        }
      });
      useEditorStore.getState().setSelectedAssetId(importedAsset.id);
      reportSceneOperation(
        `Imported ${importedAsset.name} and assigned it as the background for ${currentScene.name}. Save the project to keep this change.`,
        "success"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportSceneOperation(`Background import failed: ${message}`, "error");
    } finally {
      setBusyLabel(undefined);
    }
  }

  async function handleImportBackground() {
    if (!currentScene) {
      return;
    }

    const filePaths = await dialogs.pickFiles({
      title: currentAsset ? `Replace Background for ${currentScene.name}` : `Upload Background for ${currentScene.name}`,
      description: backgroundImportAcceptsVideo
        ? "Choose an image or video file to create a background asset and assign it to this scene."
        : "Choose an image file to create a background asset and assign it to this scene.",
      initialPath: useEditorStore.getState().projectDir,
      confirmLabel: currentAsset ? "Use as Background" : "Upload Background",
      allowedExtensions: [...(backgroundImportAcceptsVideo ? BACKGROUND_IMPORT_EXTENSIONS : IMAGE_IMPORT_EXTENSIONS)]
    });
    const filePath = filePaths[0];
    if (!filePath) {
      return;
    }

    await importBackgroundFromFilePath(filePath);
  }

  async function importSceneAudioFromFilePath(filePath: string) {
    if (!currentScene) {
      return;
    }

    if (!sceneSupportsAudio) {
      reportSceneOperation("Scene audio is only available when the scene uses an image background.", "error");
      return;
    }

    try {
      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error("No project directory is currently open.");
      }

      setBusyLabel("Importing scene audio");
      const { importedAssets, duplicateFilePaths, duplicateAssets } = await window.editorApi.importAssets(
        projectDir,
        activeLocale,
        project.assets.assets,
        [filePath],
        "sceneAudio"
      );
      if (importedAssets.length === 0) {
        const duplicateAsset = duplicateAssets[0]
          ? project.assets.assets.find((entry) => entry.id === duplicateAssets[0]!.assetId)
          : undefined;
        if (duplicateAsset) {
          mutateProject((draft) => {
            const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
            if (scene) {
              scene.sceneAudioAssetId = duplicateAsset.id;
              scene.sceneAudioLoop = true;
            }
          });
          useEditorStore.getState().setSelectedAssetId(duplicateAsset.id);
          reportSceneOperation(
            `Assigned existing ${duplicateAsset.name} as the scene audio for ${currentScene.name}. Save the project to keep this change.`,
            "success"
          );
          return;
        }

        if (duplicateFilePaths.length > 0) {
          reportSceneOperation(
            "That file already exists as a scene audio asset. Choose it from the scene audio picker.",
            "warning"
          );
        } else {
          reportSceneOperation("No new scene audio asset was created.", "warning");
        }
        return;
      }

      const importedAsset = importedAssets[0]!;
      mutateProject((draft) => {
        addAssetRoots(draft, [importedAsset]);
        draft.assets.assets.push(importedAsset);
        const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
        if (scene) {
          scene.sceneAudioAssetId = importedAsset.id;
          scene.sceneAudioLoop = true;
        }
      });
      useEditorStore.getState().setSelectedAssetId(importedAsset.id);
      reportSceneOperation(
        `Imported ${importedAsset.name} and assigned it as the scene audio for ${currentScene.name}. Save the project to keep this change.`,
        "success"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportSceneOperation(`Scene audio import failed: ${message}`, "error");
    } finally {
      setBusyLabel(undefined);
    }
  }

  async function handleImportSceneAudio() {
    if (!currentScene) {
      return;
    }

    if (!sceneSupportsAudio) {
      reportSceneOperation("Scene audio is only available when the scene uses an image background.", "error");
      return;
    }

    const filePaths = await dialogs.pickFiles({
      title: currentSceneAudioAsset ? `Replace Scene Audio for ${currentScene.name}` : `Upload Scene Audio for ${currentScene.name}`,
      description: "Choose an audio file to create a scene audio asset and assign it to this scene.",
      initialPath: useEditorStore.getState().projectDir,
      confirmLabel: currentSceneAudioAsset ? "Use as Scene Audio" : "Upload Scene Audio",
      allowedExtensions: [...SCENE_AUDIO_IMPORT_EXTENSIONS]
    });
    const filePath = filePaths[0];
    if (!filePath) {
      return;
    }

    await importSceneAudioFromFilePath(filePath);
  }

  async function importInteractionMediaFromFilePath(hotspotId: string, hotspotName: string, filePath: string) {
    try {
      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error("No project directory is currently open.");
      }

      setBusyLabel("Importing interaction media");
      const { importedAssets, duplicateFilePaths, duplicateAssets } = await window.editorApi.importAssets(
        projectDir,
        activeLocale,
        project.assets.assets,
        [filePath],
        "foreground"
      );
      const assignedAsset =
        importedAssets[0] ??
        (duplicateAssets[0]
          ? project.assets.assets.find((asset) => asset.id === duplicateAssets[0]!.assetId)
          : undefined);

      if (!assignedAsset) {
        setStatusMessage(
          duplicateFilePaths.length > 0
            ? "That file already exists as foreground media. Choose it from the interaction media picker."
            : "No new interaction media asset was created."
        );
        return;
      }

      mutateProject((draft) => {
        if (importedAssets[0]) {
          addAssetRoots(draft, [assignedAsset]);
          draft.assets.assets.push(assignedAsset);
        }
        const targetScene = draft.scenes.items.find((scene) => scene.hotspots.some((hotspot) => hotspot.id === hotspotId));
        const targetHotspot = targetScene?.hotspots.find((hotspot) => hotspot.id === hotspotId);
        if (targetHotspot) {
          targetHotspot.mediaAssetId = assignedAsset.id;
        }
      });
      useEditorStore.getState().setSelectedAssetId(assignedAsset.id);
      setStatusMessage(
        `${importedAssets[0] ? "Imported" : "Assigned existing"} ${assignedAsset.name} as interaction media for ${hotspotName}. Save the project to keep this change.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Interaction media import failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  async function handleImportInteractionMedia(hotspot: Hotspot) {
    const filePaths = await dialogs.pickFiles({
      title: `Import Interaction Media for ${hotspot.name}`,
      description: "Choose an audio or video file to play once when this hotspot is activated.",
      initialPath: useEditorStore.getState().projectDir,
      confirmLabel: "Use as Interaction Media",
      allowedExtensions: [...FOREGROUND_MEDIA_IMPORT_EXTENSIONS]
    });
    const filePath = filePaths[0];
    if (filePath) {
      await importInteractionMediaFromFilePath(hotspot.id, hotspot.name, filePath);
    }
  }

  function clearSceneAudio() {
    mutateProject((draft) => {
      const scene = draft.scenes.items.find((entry) => entry.id === currentSceneId);
      if (!scene) {
        return;
      }

      scene.sceneAudioAssetId = undefined;
      scene.sceneAudioLoop = true;
      scene.sceneAudioDelayMs = 0;
    });
  }

  function isFileDrag(event: React.DragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function resolveSceneAudioDataTransferAcceptance(dataTransfer: DataTransfer): SceneAudioDropAcceptance {
    const fileCandidates = Array.from(dataTransfer.files).map((file) => {
      const droppedPath = window.editorApi.getPathForDroppedFile(file);
      return {
        filePath: droppedPath.trim().length > 0 ? droppedPath : file.name,
        mimeType: file.type
      };
    });

    if (fileCandidates.length > 0) {
      return resolveSceneAudioDropAcceptance(fileCandidates);
    }

    return resolveSceneAudioDropAcceptance(
      Array.from(dataTransfer.items)
        .filter((item) => item.kind === "file")
        .map((item) => ({ mimeType: item.type }))
    );
  }

  function refuseSceneAudioDrop(dataTransfer: DataTransfer) {
    sceneAudioDropDepthRef.current = 0;
    setIsSceneAudioDropActive(false);
    dataTransfer.dropEffect = "none";
  }

  function isInventoryItemDrag(event: React.DragEvent<HTMLElement>) {
    return isInventoryPickerDragging || Array.from(event.dataTransfer.types).includes(INVENTORY_ITEM_DRAG_TYPE);
  }

  function handleBackgroundDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    backgroundDropDepthRef.current += 1;
    setIsBackgroundDropActive(true);
  }

  function handleBackgroundDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isBackgroundDropActive) {
      setIsBackgroundDropActive(true);
    }
  }

  function handleBackgroundDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    backgroundDropDepthRef.current = Math.max(backgroundDropDepthRef.current - 1, 0);
    if (backgroundDropDepthRef.current === 0) {
      setIsBackgroundDropActive(false);
    }
  }

  async function handleBackgroundDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    backgroundDropDepthRef.current = 0;
    setIsBackgroundDropActive(false);

    const droppedFilePaths = Array.from(event.dataTransfer.files)
      .map((file) => window.editorApi.getPathForDroppedFile(file))
      .filter((filePath) => filePath.trim().length > 0);
    const filePath = droppedFilePaths.find(backgroundImportAcceptsVideo ? isBackgroundImportPath : isImageImportPath);

    if (!filePath) {
      const message =
        !backgroundImportAcceptsVideo && droppedFilePaths.some(isVideoImportPath)
          ? VIDEO_BACKGROUND_BLOCKED_BY_SCENE_AUDIO_MESSAGE
          : backgroundImportAcceptsVideo
            ? "Drop an image or video file onto the scene preview to replace the background."
            : "Drop an image file onto the scene preview to replace the background.";
      reportSceneOperation(message, "error");
      return;
    }

    await importBackgroundFromFilePath(filePath);
  }

  function handleInventoryPlacementDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (!isInventoryItemDrag(event)) {
      return;
    }

    event.preventDefault();
    inventoryPlacementDropDepthRef.current += 1;
    setIsInventoryPlacementDropActive(true);
  }

  function handleInventoryPlacementDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!isInventoryItemDrag(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isInventoryPlacementDropActive) {
      setIsInventoryPlacementDropActive(true);
    }
  }

  function handleInventoryPlacementDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!isInventoryItemDrag(event)) {
      return;
    }

    event.preventDefault();
    inventoryPlacementDropDepthRef.current = Math.max(inventoryPlacementDropDepthRef.current - 1, 0);
    if (inventoryPlacementDropDepthRef.current === 0) {
      setIsInventoryPlacementDropActive(false);
    }
  }

  function handleInventoryPlacementDragEnd() {
    inventoryPlacementDropDepthRef.current = 0;
    inventoryDragPreviewSizeRef.current = undefined;
    setIsInventoryPickerDragging(false);
    setIsInventoryPlacementDropActive(false);
  }

  function handleInventoryPlacementDrop(event: MediaSurfaceDropEvent) {
    const itemId = resolveDraggedInventoryItemId(event.dataTransfer, linkedInventoryOptions);
    if (!itemId) {
      return;
    }

    event.originalEvent.preventDefault();
    inventoryPlacementDropDepthRef.current = 0;
    setIsInventoryPickerDragging(false);
    setIsInventoryPlacementDropActive(false);

    const dragPreviewSize =
      resolveDraggedInventoryPreviewSize(event.dataTransfer) ??
      (inventoryDragPreviewSizeRef.current?.itemId === itemId ? inventoryDragPreviewSizeRef.current : undefined);
    inventoryDragPreviewSizeRef.current = undefined;

    placeInventoryHotspot(itemId, {
      normalizedX: event.normalizedX,
      normalizedY: event.normalizedY,
      surfaceWidth: event.surfaceWidth,
      surfaceHeight: event.surfaceHeight,
      previewWidthPx: dragPreviewSize?.widthPx,
      previewHeightPx: dragPreviewSize?.heightPx
    }, undefined, "preserve");
  }

  function handleSceneAudioDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event) || !sceneSupportsAudio) {
      return;
    }

    event.preventDefault();
    if (resolveSceneAudioDataTransferAcceptance(event.dataTransfer) === "reject") {
      refuseSceneAudioDrop(event.dataTransfer);
      return;
    }

    sceneAudioDropDepthRef.current += 1;
    setIsSceneAudioDropActive(true);
  }

  function handleSceneAudioDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event) || !sceneSupportsAudio) {
      return;
    }

    event.preventDefault();
    if (resolveSceneAudioDataTransferAcceptance(event.dataTransfer) === "reject") {
      refuseSceneAudioDrop(event.dataTransfer);
      return;
    }

    event.dataTransfer.dropEffect = "copy";
    if (!isSceneAudioDropActive) {
      setIsSceneAudioDropActive(true);
    }
  }

  function handleSceneAudioDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event) || !sceneSupportsAudio) {
      return;
    }

    event.preventDefault();
    sceneAudioDropDepthRef.current = Math.max(sceneAudioDropDepthRef.current - 1, 0);
    if (sceneAudioDropDepthRef.current === 0) {
      setIsSceneAudioDropActive(false);
    }
  }

  async function handleSceneAudioDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    sceneAudioDropDepthRef.current = 0;
    setIsSceneAudioDropActive(false);

    if (!sceneSupportsAudio) {
      reportSceneOperation("Scene audio is only available when the scene uses an image background.", "error");
      return;
    }

    if (resolveSceneAudioDataTransferAcceptance(event.dataTransfer) === "reject") {
      event.dataTransfer.dropEffect = "none";
      reportSceneOperation(SCENE_AUDIO_DROP_REJECTION_MESSAGE, "error");
      return;
    }

    const droppedFilePaths = Array.from(event.dataTransfer.files)
      .map((file) => window.editorApi.getPathForDroppedFile(file))
      .filter((filePath) => filePath.trim().length > 0);
    const filePath = droppedFilePaths.find(isSceneAudioImportPath);

    if (!filePath) {
      reportSceneOperation(SCENE_AUDIO_DROP_REJECTION_MESSAGE, "error");
      return;
    }

    await importSceneAudioFromFilePath(filePath);
  }

  function deleteHotspot(hotspotId: string | undefined) {
    if (!currentSceneId || !hotspotId) {
      reportSceneOperation("Select a hotspot or placed inventory item before deleting it.", "error");
      return;
    }

    const hotspotName = currentScene.hotspots.find((entry) => entry.id === hotspotId)?.name ?? "selected scene object";
    let deleted = false;
    mutateProject((draft) => {
      const scene = draft.scenes.items.find((entry) => entry.id === currentSceneId);
      if (!scene) {
        return;
      }

      const deletion = removeHotspotFromProject(draft, currentSceneId, hotspotId);
      if (!deletion.deleted) {
        return;
      }
      deleted = true;

      const nextHotspots = scene.hotspots;
      if (selectedHotspotId === hotspotId) {
        selectHotspot(nextHotspots[0]?.id, "preserve");
      }
    });

    reportSceneOperation(
      deleted
        ? `Deleted ${hotspotName} from ${currentScene.name}. Save the project to keep this change.`
        : `Could not delete ${hotspotName} because it is no longer in this scene.`,
      deleted ? "success" : "error"
    );
  }

  function selectHotspot(
    nextSelectedHotspotId: string | undefined,
    inspectorSelectionMode: HotspotInspectorSelectionMode = "open"
  ) {
    setSelectedHotspotId(nextSelectedHotspotId);
    setIsHotspotInspectorOpen((currentIsHotspotInspectorOpen) =>
      resolveNextHotspotInspectorOpenState(
        currentIsHotspotInspectorOpen,
        selectedHotspotId,
        nextSelectedHotspotId,
        inspectorSelectionMode
      )
    );
  }

  function createHotspotAtBestAvailablePosition() {
    if (!currentSceneId) {
      return;
    }

    setIsInventoryPickerOpen(false);
    mutateProject((draft) => {
      const hotspot = addHotspotAtBestAvailablePosition(draft, currentSceneId);
      selectHotspot(hotspot?.id);
    });
  }

  function resolveCurrentSceneSurfaceSize() {
    const mediaSurface = scenesPanelRef.current?.querySelector<HTMLElement>(".media-surface");
    if (!mediaSurface) {
      return undefined;
    }

    const bounds = mediaSurface.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return undefined;
    }

    return {
      width: bounds.width,
      height: bounds.height
    };
  }

  function updateSelectedHotspotRotationDegrees(rotationDegrees: number) {
    if (!selectedHotspot || !Number.isFinite(rotationDegrees)) {
      return;
    }

    const surfaceSize = resolveCurrentSceneSurfaceSize();
    if (!surfaceSize) {
      return;
    }

    mutateSelectedHotspot((hotspot) => {
      const nextGeometry = applyHotspotRotationDegrees(
        {
          inventoryItemId: hotspot.inventoryItemId,
          x: hotspot.x,
          y: hotspot.y,
          width: hotspot.width,
          height: hotspot.height,
          polygon: hotspot.polygon
        },
        rotationDegrees,
        surfaceSize
      );

      hotspot.x = nextGeometry.x;
      hotspot.y = nextGeometry.y;
      hotspot.width = nextGeometry.width;
      hotspot.height = nextGeometry.height;
      hotspot.polygon = nextGeometry.polygon;
    });
  }

  function clearHotspotKeyboardTransformBatch() {
    hotspotKeyboardTransformBatchRef.current = {};
  }

  function placeInventoryHotspot(
    itemId: string,
    position?: {
      normalizedX: number;
      normalizedY: number;
      surfaceWidth?: number;
      surfaceHeight?: number;
      previewWidthPx?: number;
      previewHeightPx?: number;
    },
    autoPlacement?: {
      surfaceWidth: number;
      surfaceHeight: number;
      previewWidthPx: number;
      previewHeightPx: number;
    },
    inspectorSelectionMode: HotspotInspectorSelectionMode = "open"
  ) {
    if (!currentSceneId) {
      reportSceneOperation("Select a scene before placing an inventory item.", "error");
      return;
    }

    const option = linkedInventoryOptions.find((entry) => entry.itemId === itemId);
    if (!option?.eligible) {
      reportSceneOperation("Add artwork to an item to make it available here.", "error");
      return;
    }

    let createdHotspotId: string | undefined;
    mutateProject((draft) => {
      const hotspot = position
        ? addHotspot(draft, currentSceneId, position.normalizedX, position.normalizedY)
        : addHotspotAtBestAvailablePosition(draft, currentSceneId);
      const item = draft.inventory.items.find((entry) => entry.id === itemId);
      if (!hotspot || !item) {
        return;
      }

      applyInventoryLinkToHotspot(hotspot, item, localeStrings);
      const droppedBounds =
        position?.surfaceWidth && position.surfaceHeight && position.previewWidthPx && position.previewHeightPx
          ? resolveDroppedInventoryHotspotBounds({
              normalizedX: position.normalizedX,
              normalizedY: position.normalizedY,
              surfaceWidth: position.surfaceWidth,
              surfaceHeight: position.surfaceHeight,
              previewWidthPx: position.previewWidthPx,
              previewHeightPx: position.previewHeightPx
            })
          : undefined;
      const autoPlacedBounds =
        !position && autoPlacement
          ? resolveDroppedInventoryHotspotBounds({
              normalizedX: hotspot.x + hotspot.width / 2,
              normalizedY: hotspot.y + hotspot.height / 2,
              surfaceWidth: autoPlacement.surfaceWidth,
              surfaceHeight: autoPlacement.surfaceHeight,
              previewWidthPx: autoPlacement.previewWidthPx,
              previewHeightPx: autoPlacement.previewHeightPx
            })
          : undefined;
      const nextBounds = droppedBounds ?? autoPlacedBounds;
      if (nextBounds) {
        hotspot.x = nextBounds.x;
        hotspot.y = nextBounds.y;
        hotspot.width = nextBounds.width;
        hotspot.height = nextBounds.height;
        hotspot.polygon = undefined;
      }
      createdHotspotId = hotspot.id;
    });

    if (!createdHotspotId) {
      reportSceneOperation("Could not place that inventory item in this scene.", "error");
      return;
    }

    setIsInventoryPickerOpen(false);
    selectHotspot(createdHotspotId, inspectorSelectionMode);
    reportSceneOperation(
      `Placed ${option.label} in ${currentScene.name}. Save the project to keep this change.`,
      "success"
    );
  }

  function mutateSelectedHotspot(mutator: (hotspot: Hotspot, draft: ProjectBundle) => void) {
    if (!selectedHotspot) {
      return;
    }

    mutateProject((draft) => {
      const target = draft.scenes.items
        .find((entry) => entry.id === currentScene.id)
        ?.hotspots.find((entry) => entry.id === selectedHotspot.id);
      if (!target) {
        return;
      }

      mutator(target, draft);
    });
  }

  function dismissFloatingWindows() {
    setIsInventoryPickerOpen(false);
    setIsHotspotInspectorOpen(false);
    setIsHotspotInspectorActive(false);
  }

  function handleInventoryPickerToggle() {
    const toggleResult = resolveInventoryPickerToggleResult(isInventoryPickerOpen);
    setIsInventoryPickerOpen(toggleResult.nextIsInventoryPickerOpen);
    if (toggleResult.shouldClearSelectedHotspot) {
      setIsHotspotInspectorOpen(false);
      setIsHotspotInspectorActive(false);
      setSelectedHotspotId(undefined);
    }
  }

  useEffect(() => {
    if (
      !floatingWindowVisibility.isInventoryPickerVisible &&
      !floatingWindowVisibility.isHotspotInspectorVisible &&
      !selectedHotspotId
    ) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const hasDialogOverlay = Boolean(document.querySelector(".dialog-overlay"));
      const targetElement =
        event.target instanceof HTMLElement
          ? event.target
          : document.activeElement instanceof HTMLElement
            ? document.activeElement
            : undefined;

      if (
        shouldDismissScenesFloatingWindowsOnEscape(
          event,
          floatingWindowVisibility.isInventoryPickerVisible || floatingWindowVisibility.isHotspotInspectorVisible,
          hasDialogOverlay
        )
      ) {
        event.preventDefault();
        dismissFloatingWindows();
        return;
      }

      if (
        shouldDismissScenesHotspotSelectionOnEscape(
          event,
          Boolean(selectedHotspotId),
          hasDialogOverlay,
          isScenesFloatingWindowTarget(targetElement),
          isTextEntryTarget(targetElement)
        )
      ) {
        event.preventDefault();
        setSelectedHotspotId(undefined);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    dismissFloatingWindows,
    floatingWindowVisibility.isHotspotInspectorVisible,
    floatingWindowVisibility.isInventoryPickerVisible,
    selectedHotspotId,
    setSelectedHotspotId
  ]);

  useEffect(() => {
    if (!currentSceneId || !selectedHotspotId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.key !== "Delete") {
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      if (document.querySelector(".dialog-overlay") || shouldIgnoreDeleteHotspotShortcut(event.target)) {
        return;
      }

      event.preventDefault();
      deleteHotspot(selectedHotspotId);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentSceneId, deleteHotspot, selectedHotspotId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolveHotspotTransformKeyboardAction(event.key, {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey
      });
      if (!action.handled) {
        return;
      }

      const targetElement =
        event.target instanceof HTMLElement
          ? event.target
          : document.activeElement instanceof HTMLElement
            ? document.activeElement
            : undefined;
      const shouldHandleTransform = shouldHandleHotspotTransformShortcut({
        defaultPrevented: event.defaultPrevented,
        hasDialogOverlay: Boolean(document.querySelector(".dialog-overlay")),
        hasSelectedHotspot: Boolean(selectedHotspot),
        isScenePreviewFocused: isScenePreviewKeyboardTarget(targetElement),
        isScenesTabActive: activeTab === "scenes",
        isTargetInsideFloatingWindow: isScenesFloatingWindowTarget(targetElement),
        isTargetTextEntry: isTextEntryTarget(targetElement)
      });
      if (!shouldHandleTransform) {
        return;
      }

      event.preventDefault();

      const surfaceSize = resolveCurrentSceneSurfaceSize();
      if (!surfaceSize) {
        return;
      }

      const editorState = useEditorStore.getState();
      const currentProject = editorState.project ?? project;
      const activeSceneId = editorState.selectedSceneId ?? currentSceneId;
      const activeHotspotId = editorState.selectedHotspotId ?? selectedHotspotId;
      const currentHotspot = currentProject.scenes.items
        .find((entry) => entry.id === activeSceneId)
        ?.hotspots.find((entry) => entry.id === activeHotspotId);
      if (!activeSceneId || !activeHotspotId || !currentHotspot) {
        return;
      }

      const currentGeometry: HotspotGeometry = {
        inventoryItemId: currentHotspot.inventoryItemId,
        x: currentHotspot.x,
        y: currentHotspot.y,
        width: currentHotspot.width,
        height: currentHotspot.height,
        polygon: currentHotspot.polygon
      };
      const nextGeometry = applyHotspotKeyboardTransform(currentGeometry, action.transform, surfaceSize);
      if (geometryMatches(currentGeometry, nextGeometry)) {
        return;
      }

      const batchSignature = `${activeHotspotId}:${resolveHotspotTransformBatchSignature(action.transform)}`;
      if (
        hotspotKeyboardTransformBatchRef.current.hotspotId !== activeHotspotId ||
        hotspotKeyboardTransformBatchRef.current.signature !== batchSignature
      ) {
        captureUndoCheckpoint();
        hotspotKeyboardTransformBatchRef.current = {
          hotspotId: activeHotspotId,
          signature: batchSignature
        };
      }

      const nextProject = cloneProject(currentProject);
      const nextHotspot = nextProject.scenes.items
        .find((entry) => entry.id === activeSceneId)
        ?.hotspots.find((entry) => entry.id === activeHotspotId);
      if (!nextHotspot) {
        return;
      }

      nextHotspot.x = nextGeometry.x;
      nextHotspot.y = nextGeometry.y;
      nextHotspot.width = nextGeometry.width;
      nextHotspot.height = nextGeometry.height;
      nextHotspot.polygon = nextGeometry.polygon;
      updateProject(nextProject, { skipHistory: true });
    };

    const handleKeyUp = () => {
      clearHotspotKeyboardTransformBatch();
    };

    const handleWindowBlur = () => {
      clearHotspotKeyboardTransformBatch();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const targetElement =
        event.target instanceof HTMLElement
          ? event.target
          : document.activeElement instanceof HTMLElement
            ? document.activeElement
            : undefined;
      if (!isScenePreviewKeyboardTarget(targetElement)) {
        clearHotspotKeyboardTransformBatch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("focusin", handleFocusIn);
      clearHotspotKeyboardTransformBatch();
    };
  }, [
    activeTab,
    captureUndoCheckpoint,
    currentSceneId,
    project,
    selectedHotspot?.inventoryItemId,
    selectedHotspotId,
    updateProject
  ]);

  if (!currentScene) {
    return <div className="panel"><p>Create a scene to begin.</p></div>;
  }

  async function handleDeleteScene(sceneId = currentScene.id) {
    const targetScene = project.scenes.items.find((scene) => scene.id === sceneId);
    if (!targetScene) {
      reportSceneOperation("Could not delete scene because it is no longer present in the project.", "error");
      return;
    }

    const dialogResult = await dialogs.deleteScene({
      project,
      sceneId: targetScene.id,
      referenceSummary: collectSceneReferenceSummary(project, targetScene.id)
    });
    if (dialogResult.action === "cancel") {
      return;
    }

    const nextProject = cloneProject(project);
    const deletion = removeSceneFromProject(
      nextProject,
      targetScene.id,
      dialogResult.action === "rewire"
        ? { mode: "rewire", replacementSceneId: dialogResult.replacementSceneId }
        : { mode: "cleanup" }
    );

    if (!deletion.deleted) {
      reportSceneOperation(resolveDeleteSceneBlockedMessage(targetScene.name, deletion.blockedReason), "error");
      return;
    }

    const deletedCurrentScene = targetScene.id === currentSceneId;
    const nextSelectedSceneId = deletedCurrentScene
      ? dialogResult.action === "rewire"
        ? dialogResult.replacementSceneId
        : nextProject.scenes.items[0]?.id
      : currentSceneId;
    const replacementSceneName =
      dialogResult.action === "rewire"
        ? nextProject.scenes.items.find((scene) => scene.id === dialogResult.replacementSceneId)?.name
        : undefined;
    const validationReport = validateProject(nextProject);

    setSelectedHotspotId(undefined);
    setSelectedSceneId(nextSelectedSceneId);
    updateProject(nextProject);
    reportSceneOperation(
      resolveDeleteSceneStatusMessage(
        targetScene.name,
        deletion,
        replacementSceneName,
        validationReport.valid,
        validationReport.issues.length
      ),
      validationReport.valid ? "success" : "warning"
    );
  }

  function handleCreateScene() {
    const nextProject = cloneProject(project);
    const scene = addScene(nextProject, currentScene.locationId);

    setSelectedHotspotId(undefined);
    setSelectedSceneId(scene.id);
    updateProject(nextProject);
    setStatusMessage(`Created ${scene.name}.`);
  }

  return (
    <div ref={scenesPanelRef} className="panel-grid panel-grid--single scenes-panel-shell">
      <section className="panel scenes-panel">
        <div className="scenes-panel__stage-layout">
          <SceneListRail
            activeLocale={activeLocale}
            currentScene={currentScene}
            currentSceneId={currentScene.id}
            project={project}
            mutateProject={mutateProject}
            onClearHotspotSelection={() => setSelectedHotspotId(undefined)}
            onCreateScene={handleCreateScene}
            onDeleteScene={handleDeleteScene}
            onSelectScene={(sceneId) => {
              setSelectedSceneId(sceneId);
              setSelectedHotspotId(undefined);
            }}
          />

          <div className="scenes-panel__stage-stack">
            <SceneCanvas
              activeLocale={activeLocale}
              asset={currentAsset}
              assetHeight={currentAssetVariant?.height}
              assetWidth={currentAssetVariant?.width}
              backgroundImportAcceptsVideo={backgroundImportAcceptsVideo}
              hotspotVisuals={hotspotVisuals}
              hotspots={sceneSurfaceHotspots}
              isBackgroundDropActive={isBackgroundDropActive}
              isHotspotInspectorActive={isHotspotInspectorActive}
              isInventoryPlacementDropActive={isInventoryPlacementDropActive}
              localeStrings={localeStrings}
              onBackgroundDragEnter={handleBackgroundDragEnter}
              onBackgroundDragLeave={handleBackgroundDragLeave}
              onBackgroundDragOver={handleBackgroundDragOver}
              onBackgroundDrop={handleBackgroundDrop}
              onDismissOperationFeedback={() => setSceneOperationFeedback(undefined)}
              onHotspotChange={updateHotspotGeometry}
              onHotspotClick={(hotspotId, interaction) => {
                setIsInventoryPickerOpen(false);
                selectHotspot(hotspotId, interaction === "drag" ? "preserve" : "toggle");
              }}
              onHotspotDragStart={captureHotspotDragCheckpoint}
              onInventoryPlacementDragEnter={handleInventoryPlacementDragEnter}
              onInventoryPlacementDragLeave={handleInventoryPlacementDragLeave}
              onInventoryPlacementDragOver={handleInventoryPlacementDragOver}
              onInventoryPlacementDrop={handleInventoryPlacementDrop}
              onSurfaceClick={({ normalizedX, normalizedY, createRequested }) => {
                if (!createRequested) {
                  selectHotspot(undefined);
                  return;
                }

                setIsInventoryPickerOpen(false);
                mutateProject((draft) => {
                  const hotspot = addHotspot(draft, currentScene.id, normalizedX, normalizedY);
                  selectHotspot(hotspot?.id);
                });
              }}
              operationFeedback={sceneOperationFeedback}
              playheadMs={playheadMs}
              scene={currentScene}
              selectedHotspotId={selectedHotspotId}
              setPlayheadMs={setPlayheadMs}
            />

            <div className="scenes-panel__details-row">
              <SceneMediaSection
                activeLocale={activeLocale}
                availableBackgroundAssets={availableBackgroundAssets}
                availableSceneAudioAssets={availableSceneAudioAssets}
                backgroundImportAcceptsVideo={backgroundImportAcceptsVideo}
                currentAsset={currentAsset}
                currentSceneAudioAsset={currentSceneAudioAsset}
                isSceneAudioDropActive={isSceneAudioDropActive}
                mutateProject={mutateProject}
                onClearSceneAudio={clearSceneAudio}
                onImportBackground={handleImportBackground}
                onImportSceneAudio={handleImportSceneAudio}
                onReportOperation={reportSceneOperation}
                onSceneAudioDragEnter={handleSceneAudioDragEnter}
                onSceneAudioDragLeave={handleSceneAudioDragLeave}
                onSceneAudioDragOver={handleSceneAudioDragOver}
                onSceneAudioDrop={handleSceneAudioDrop}
                playheadMs={playheadMs}
                scene={currentScene}
                sceneAudioRef={sceneAudioRef}
                sceneAudioUrl={sceneAudioUrl}
                sceneSupportsAudio={sceneSupportsAudio}
                sceneTimelineDurationMs={sceneTimelineDurationMs}
                setPlayheadMs={setPlayheadMs}
              />

              <SceneWiringSection scene={currentScene} mutateProject={mutateProject} />

            </div>
          </div>

          <SceneActionRail
            hasBackground={Boolean(currentAsset)}
            hasSelectedHotspot={Boolean(selectedHotspotId)}
            inventoryPickerAnchorRef={inventoryPickerAnchorRef}
            isInventoryPickerVisible={floatingWindowVisibility.isInventoryPickerVisible}
            onCreateHotspot={createHotspotAtBestAvailablePosition}
            onDeleteSelectedHotspot={() => deleteHotspot(selectedHotspotId)}
            onToggleInventoryPicker={handleInventoryPickerToggle}
          />
        </div>
      </section>

      {floatingWindowVisibility.isInventoryPickerVisible ? (
        <InventoryPlacementPickerWindow
          activeItem={activeInventoryPickerItem}
          activeLocale={activeLocale}
          anchorRef={inventoryPickerAnchorRef}
          options={visibleInventoryPickerOptions}
          position={inventoryPickerPosition}
          search={inventoryPickerSearch}
          showEmptyInventoryState={eligibleLinkedInventoryOptions.length === 0}
          onActiveItemIdChange={setActiveInventoryPickerItemId}
          onDragStart={(itemId, previewSize) => {
            inventoryDragPreviewSizeRef.current = {
              itemId,
              widthPx: previewSize.width,
              heightPx: previewSize.height
            };
            setIsInventoryPickerDragging(true);
          }}
          onDragEnd={handleInventoryPlacementDragEnd}
          onPlaceItem={(itemId, previewSize) => {
            const surfaceSize = previewSize ? resolveCurrentSceneSurfaceSize() : undefined;
            placeInventoryHotspot(
              itemId,
              undefined,
              surfaceSize && previewSize
                ? {
                    surfaceWidth: surfaceSize.width,
                    surfaceHeight: surfaceSize.height,
                    previewWidthPx: previewSize.width,
                    previewHeightPx: previewSize.height
                  }
                : undefined,
              "open"
            );
          }}
          onPositionChange={setInventoryPickerPosition}
          onSearchChange={setInventoryPickerSearch}
          onDismiss={() => setIsInventoryPickerOpen(false)}
        />
      ) : null}

      {floatingWindowVisibility.isHotspotInspectorVisible && selectedHotspot ? (
        <HotspotInspectorWindow
          anchorRef={scenesPanelRef}
          activeLocale={activeLocale}
          dialogueOptions={project.dialogues.items}
          foregroundMediaAssets={availableForegroundMediaAssets}
          responseGroups={project.dialogues.responseGroups}
          assets={project.assets.assets}
          localeStrings={localeStrings}
          inventoryItemOptions={linkedInventoryOptions}
          sceneTimelineDurationMs={sceneTimelineDurationMs}
          scenes={project.scenes.items}
          position={hotspotInspectorPosition}
          rotationSurfaceSize={resolveCurrentSceneSurfaceSize()}
          selectedHotspot={selectedHotspot}
          mutateSelectedHotspot={mutateSelectedHotspot}
          onRotationDegreesChange={updateSelectedHotspotRotationDegrees}
          onPositionChange={setHotspotInspectorPosition}
          onInteractionActiveChange={setIsHotspotInspectorActive}
          onImportInteractionMedia={(hotspot) => void handleImportInteractionMedia(hotspot)}
          onDismiss={() => setIsHotspotInspectorOpen(false)}
        />
      ) : null}
    </div>
  );
}

type HotspotInspectorSelectionMode = "open" | "preserve" | "toggle";

export function resolveScenesFloatingWindowVisibility(
  isInventoryPickerOpen: boolean,
  hasSelectedHotspot: boolean,
  isHotspotInspectorOpen: boolean
) {
  return {
    isInventoryPickerVisible: isInventoryPickerOpen && !hasSelectedHotspot,
    isHotspotInspectorVisible: hasSelectedHotspot && isHotspotInspectorOpen
  };
}

export function resolveNextHotspotInspectorOpenState(
  currentIsHotspotInspectorOpen: boolean,
  currentSelectedHotspotId: string | undefined,
  nextSelectedHotspotId: string | undefined,
  inspectorSelectionMode: HotspotInspectorSelectionMode
) {
  if (!nextSelectedHotspotId) {
    return currentIsHotspotInspectorOpen;
  }

  if (inspectorSelectionMode === "toggle") {
    return currentSelectedHotspotId === nextSelectedHotspotId ? !currentIsHotspotInspectorOpen : currentIsHotspotInspectorOpen;
  }

  return inspectorSelectionMode === "open" ? true : currentIsHotspotInspectorOpen;
}

export function shouldApplyHotspotInspectorOpenRequest(
  hotspotInspectorOpenRequest: number | undefined,
  lastAppliedHotspotInspectorOpenRequest: number | undefined,
  hasSelectedHotspot: boolean
) {
  const request = hotspotInspectorOpenRequest ?? 0;
  const lastAppliedRequest = lastAppliedHotspotInspectorOpenRequest ?? 0;
  return hasSelectedHotspot && request !== lastAppliedRequest;
}

export function shouldDismissScenesFloatingWindowsOnEscape(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "defaultPrevented" | "key" | "metaKey" | "repeat" | "shiftKey">,
  hasOpenFloatingWindow: boolean,
  hasDialogOverlay: boolean
) {
  if (!hasOpenFloatingWindow || hasDialogOverlay || event.defaultPrevented || event.repeat || event.key !== "Escape") {
    return false;
  }

  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }

  return true;
}

export function shouldDismissScenesHotspotSelectionOnEscape(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "defaultPrevented" | "key" | "metaKey" | "repeat" | "shiftKey">,
  hasSelectedHotspot: boolean,
  hasDialogOverlay: boolean,
  isTargetInsideFloatingWindow: boolean,
  isTargetTextEntry: boolean
) {
  if (!hasSelectedHotspot || hasDialogOverlay || event.defaultPrevented || event.repeat || event.key !== "Escape") {
    return false;
  }

  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }

  if (isTargetInsideFloatingWindow || isTargetTextEntry) {
    return false;
  }

  return true;
}

type HotspotTransformKeyboardAction =
  | {
      handled: false;
      transform?: undefined;
    }
  | {
      handled: true;
      transform: HotspotKeyboardTransform;
    };

export function resolveHotspotTransformKeyboardAction(
  key: string,
  modifiers: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">
): HotspotTransformKeyboardAction {
  const fineAdjustment = modifiers.ctrlKey || modifiers.metaKey;
  const translationStepPx = fineAdjustment ? 1 : 10;

  if (modifiers.altKey) {
    if (modifiers.shiftKey) {
      return {
        handled: false
      };
    }

    switch (key) {
      case "ArrowLeft":
        return {
          handled: true,
          transform: {
            kind: "rotate" as const,
            deltaDegrees: fineAdjustment ? -1 : -15
          }
        };
      case "ArrowRight":
        return {
          handled: true,
          transform: {
            kind: "rotate" as const,
            deltaDegrees: fineAdjustment ? 1 : 15
          }
        };
      default:
        return {
          handled: false
        };
    }
  }

  if (modifiers.shiftKey) {
    switch (key) {
      case "ArrowLeft":
        return {
          handled: true,
          transform: {
            kind: "resize" as const,
            axis: "x" as const,
            deltaPx: -translationStepPx
          }
        };
      case "ArrowRight":
        return {
          handled: true,
          transform: {
            kind: "resize" as const,
            axis: "x" as const,
            deltaPx: translationStepPx
          }
        };
      case "ArrowUp":
        return {
          handled: true,
          transform: {
            kind: "resize" as const,
            axis: "y" as const,
            deltaPx: translationStepPx
          }
        };
      case "ArrowDown":
        return {
          handled: true,
          transform: {
            kind: "resize" as const,
            axis: "y" as const,
            deltaPx: -translationStepPx
          }
        };
      default:
        return {
          handled: false
        };
    }
  }

  switch (key) {
    case "ArrowLeft":
      return {
        handled: true,
        transform: {
          kind: "move" as const,
          deltaXPx: -translationStepPx,
          deltaYPx: 0
        }
      };
    case "ArrowRight":
      return {
        handled: true,
        transform: {
          kind: "move" as const,
          deltaXPx: translationStepPx,
          deltaYPx: 0
        }
      };
    case "ArrowUp":
      return {
        handled: true,
        transform: {
          kind: "move" as const,
          deltaXPx: 0,
          deltaYPx: -translationStepPx
        }
      };
    case "ArrowDown":
      return {
        handled: true,
        transform: {
          kind: "move" as const,
          deltaXPx: 0,
          deltaYPx: translationStepPx
        }
      };
    default:
      return {
        handled: false
      };
  }
}

export function shouldHandleHotspotTransformShortcut({
  defaultPrevented,
  hasDialogOverlay,
  hasSelectedHotspot,
  isScenePreviewFocused,
  isScenesTabActive,
  isTargetInsideFloatingWindow,
  isTargetTextEntry
}: {
  defaultPrevented: boolean;
  hasDialogOverlay: boolean;
  hasSelectedHotspot: boolean;
  isScenePreviewFocused: boolean;
  isScenesTabActive: boolean;
  isTargetInsideFloatingWindow: boolean;
  isTargetTextEntry: boolean;
}) {
  if (defaultPrevented || hasDialogOverlay || !hasSelectedHotspot || !isScenePreviewFocused || !isScenesTabActive) {
    return false;
  }

  if (isTargetInsideFloatingWindow || isTargetTextEntry) {
    return false;
  }

  return true;
}

function resolveHotspotTransformBatchSignature(
  transform:
    | { kind: "move"; deltaXPx: number; deltaYPx: number }
    | { kind: "resize"; axis: "x" | "y"; deltaPx: number }
    | { kind: "rotate"; deltaDegrees: number }
) {
  switch (transform.kind) {
    case "move":
      return `move:${transform.deltaXPx}:${transform.deltaYPx}`;
    case "resize":
      return `resize:${transform.axis}:${transform.deltaPx}`;
    case "rotate":
      return `rotate:${transform.deltaDegrees}`;
  }
}

function isScenePreviewKeyboardTarget(target: HTMLElement | undefined) {
  return Boolean(target?.closest(".media-surface"));
}

function isScenesFloatingWindowTarget(target: HTMLElement | undefined) {
  return Boolean(target?.closest(".scenes-floating-inspector"));
}

function isTextEntryTarget(target: HTMLElement | undefined) {
  if (!target) {
    return false;
  }

  return target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable]"));
}

function shouldIgnoreDeleteHotspotShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}

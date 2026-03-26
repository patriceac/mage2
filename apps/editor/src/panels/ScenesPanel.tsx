import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MediaSurface, type MediaSurfaceDropEvent } from "../MediaSurface";
import { getLocaleStringValues, type Asset, type Hotspot, type InventoryItem, type ProjectBundle, validateProject } from "@mage2/schema";
import { resolveSceneTimelineDurationMs } from "@mage2/player";
import {
  BACKGROUND_IMPORT_EXTENSIONS,
  SCENE_AUDIO_IMPORT_EXTENSIONS,
  SUBTITLE_IMPORT_EXTENSIONS,
  isBackgroundImportPath,
  isSceneAudioImportPath
} from "../asset-file-types";
import { useDialogs } from "../dialogs";
import { getLocalizedAssetVariant, setEditorLocalizedText } from "../localized-project";
import {
  addHotspot,
  addHotspotAtBestAvailablePosition,
  addAssetRoots,
  cloneProject,
  collectSceneReferenceSummary,
  createId,
  createSubtitleCue,
  isBackgroundAsset,
  isInventoryImageAsset,
  isSceneAudioAsset,
  removeHotspotFromProject,
  removeSceneFromProject,
  type RemoveSceneFromProjectResult
} from "../project-helpers";
import { resolveHotspotVisuals } from "../hotspot-visuals";
import {
  MIN_HOTSPOT_SIZE,
  applyHotspotBounds,
  formatHotspotCoordinate,
  type HotspotGeometry
} from "../hotspot-geometry";
import {
  clampFloatingWindowPosition,
  resolveNextFloatingWindowPosition,
  type FloatingWindowPosition
} from "../floating-window";
import {
  collectOwnedGeneratedProjectTextIdsForSubtitleCue,
  collectOwnedGeneratedProjectTextIdsForSubtitleTrack,
  pruneOwnedGeneratedProjectTextEntries
} from "../project-text";
import { AssetPreview } from "../previews";
import { useEditorStore } from "../store";

interface ScenesPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  setSavedProject: (project: ProjectBundle) => void;
  setStatusMessage: (message: string) => void;
  setBusyLabel: (label?: string) => void;
}

const INVENTORY_ITEM_DRAG_TYPE = "application/x-mage2-inventory-item";
const INVENTORY_ITEM_DRAG_SIZE_TYPE = "application/x-mage2-inventory-preview-size";

export function ScenesPanel({
  project,
  mutateProject,
  setSavedProject,
  setStatusMessage,
  setBusyLabel
}: ScenesPanelProps) {
  const dialogs = useDialogs();
  const scenesPanelRef = useRef<HTMLDivElement>(null);
  const inventoryPickerAnchorRef = useRef<HTMLButtonElement>(null);
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

  const currentScene = project.scenes.items.find((entry) => entry.id === selectedSceneId) ?? project.scenes.items[0];
  const currentSceneId = currentScene?.id;
  const currentAsset = project.assets.assets.find((entry) => entry.id === currentScene?.backgroundAssetId);
  const currentAssetVariant = getLocalizedAssetVariant(currentAsset, activeLocale);
  const currentSceneAudioAsset = project.assets.assets.find((entry) => entry.id === currentScene?.sceneAudioAssetId);
  const currentSceneAudioVariant = getLocalizedAssetVariant(currentSceneAudioAsset, activeLocale);
  const sceneSupportsAudio = currentAsset?.kind === "image";
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
  const backgroundDropDepthRef = useRef(0);
  const inventoryPlacementDropDepthRef = useRef(0);
  const inventoryDragPreviewSizeRef = useRef<{ itemId: string; widthPx: number; heightPx: number } | undefined>(undefined);
  const sceneAudioDropDepthRef = useRef(0);
  const linkedInventoryOptions = resolveLinkedInventoryOptions(
    project.inventory.items,
    project.assets.assets,
    localeStrings,
    selectedHotspot?.inventoryItemId
  );
  const eligibleLinkedInventoryOptions = linkedInventoryOptions.filter((option) => option.eligible);
  const visibleInventoryPickerOptions = filterInventoryPlacementOptions(eligibleLinkedInventoryOptions, inventoryPickerSearch);
  const activeInventoryPickerItem =
    visibleInventoryPickerOptions.find((option) => option.itemId === activeInventoryPickerItemId) ??
    visibleInventoryPickerOptions[0];
  const hotspotVisuals = resolveHotspotVisuals({
    hotspots: currentScene.hotspots,
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

  useEffect(() => {
    if (selectedHotspot) {
      setIsInventoryPickerOpen(false);
      return;
    }

    setIsHotspotInspectorOpen(false);
    setIsHotspotInspectorActive(false);
  }, [selectedHotspot]);

  useEffect(() => {
    if (visibleInventoryPickerOptions.some((option) => option.itemId === activeInventoryPickerItemId)) {
      return;
    }

    setActiveInventoryPickerItemId(visibleInventoryPickerOptions[0]?.itemId);
  }, [activeInventoryPickerItemId, visibleInventoryPickerOptions]);

  useEffect(() => {
    setPlayheadMs(0);
  }, [currentScene?.backgroundAssetId, currentScene?.sceneAudioAssetId, currentScene?.sceneAudioDelayMs, currentSceneId, setPlayheadMs]);

  function updateHotspotGeometry(hotspotId: string, geometry: HotspotGeometry) {
    const currentProject = useEditorStore.getState().project ?? project;
    const nextProject = cloneProject(currentProject);
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

  function deleteSubtitleTrack(trackId: string) {
    mutateProject((draft) => {
      const scene = draft.scenes.items.find((entry) => entry.id === currentSceneId);
      if (!scene) {
        return;
      }

      const track = scene.subtitleTracks.find((entry) => entry.id === trackId);
      const removedTextIds = track ? collectOwnedGeneratedProjectTextIdsForSubtitleTrack(track) : [];
      scene.subtitleTracks = scene.subtitleTracks.filter((entry) => entry.id !== trackId);
      pruneOwnedGeneratedProjectTextEntries(draft, removedTextIds);
    });
  }

  function addSubtitleTrack() {
    mutateProject((draft) => {
      const scene = draft.scenes.items.find((entry) => entry.id === currentSceneId);
      if (!scene) {
        return;
      }

      scene.subtitleTracks.push({
        id: createId("subtitle"),
        cues: [createSubtitleCue(draft, 0, 3000, "A subtitle cue")]
      });
    });
  }

  function addSubtitleCue(trackId: string) {
    mutateProject((draft) => {
      const track = draft.scenes.items
        .find((entry) => entry.id === currentSceneId)
        ?.subtitleTracks.find((entry) => entry.id === trackId);
      if (!track) {
        return;
      }

      const lastCue = track.cues.at(-1);
      const startMs = lastCue?.endMs ?? 0;
      track.cues.push(createSubtitleCue(draft, startMs, startMs + 3000, ""));
    });
  }

  function deleteSubtitleCue(trackId: string, cueId: string) {
    mutateProject((draft) => {
      const track = draft.scenes.items
        .find((entry) => entry.id === currentSceneId)
        ?.subtitleTracks.find((entry) => entry.id === trackId);
      if (!track) {
        return;
      }

      const cue = track.cues.find((entry) => entry.id === cueId);
      const removedTextIds = cue ? collectOwnedGeneratedProjectTextIdsForSubtitleCue(cue) : [];
      track.cues = track.cues.filter((cue) => cue.id !== cueId);
      pruneOwnedGeneratedProjectTextEntries(draft, removedTextIds);
    });
  }

  async function handleImportSubtitles() {
    const filePaths = await dialogs.pickFiles({
      title: "Import Subtitles",
      description: "Select one or more SRT or VTT files to create subtitle tracks for this scene.",
      initialPath: useEditorStore.getState().projectDir,
      confirmLabel: "Import Subtitle Files",
      allowedExtensions: [...SUBTITLE_IMPORT_EXTENSIONS]
    });
    if (filePaths.length === 0 || !currentSceneId) {
      return;
    }

    try {
      const result = await window.editorApi.parseSubtitleFiles(filePaths);
      if (result.parsedFiles.length > 0) {
        mutateProject((draft) => {
          const scene = draft.scenes.items.find((entry) => entry.id === currentSceneId);
          if (!scene) {
            return;
          }

          scene.subtitleTracks.push(
            ...result.parsedFiles.map((file) => ({
              id: createId("subtitle"),
              cues: file.cues.map((cue) => createSubtitleCue(draft, cue.startMs, cue.endMs, cue.text))
            }))
          );
        });
      }

      setStatusMessage(resolveSubtitleImportStatusMessage(result.parsedFiles.length, result.failedFiles.length));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Subtitle import failed: ${message}`);
    }
  }

  async function importBackgroundFromFilePath(filePath: string) {
    if (!currentScene) {
      return;
    }

    try {
      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error("No project directory is currently open.");
      }

      setBusyLabel("Importing background");
      const { importedAssets, duplicateFilePaths } = await window.editorApi.importAssets(
        projectDir,
        activeLocale,
        project.assets.assets,
        [filePath],
        "background"
      );
      if (importedAssets.length === 0) {
        if (duplicateFilePaths.length > 0) {
          setStatusMessage("That file already exists as a background asset. Choose it from the background picker.");
        } else {
          setStatusMessage("No new background asset was created.");
        }
        return;
      }

      const importedAsset = importedAssets[0]!;
      const nextProject = cloneProject(project);
      addAssetRoots(nextProject, [importedAsset]);
      nextProject.assets.assets.push(importedAsset);
      const scene = nextProject.scenes.items.find((entry) => entry.id === currentScene.id);
      if (scene) {
        scene.backgroundAssetId = importedAsset.id;
      }

      const result = await window.editorApi.saveProject(projectDir, nextProject);
      setSavedProject(result.project);
      useEditorStore.getState().setSelectedAssetId(importedAsset.id);
      setStatusMessage(
        result.validationReport.valid
          ? `Assigned ${importedAsset.name} as the background for ${currentScene.name}.`
          : `Assigned ${importedAsset.name} as the background for ${currentScene.name}, saved with ${result.validationReport.issues.length} validation issue(s).`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Background import failed: ${message}`);
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
      description: "Choose an image or video file to create a background asset and assign it to this scene.",
      initialPath: useEditorStore.getState().projectDir,
      confirmLabel: currentAsset ? "Use as Background" : "Upload Background",
      allowedExtensions: [...BACKGROUND_IMPORT_EXTENSIONS]
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
      setStatusMessage("Scene audio is only available when the scene uses an image background.");
      return;
    }

    try {
      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error("No project directory is currently open.");
      }

      setBusyLabel("Importing scene audio");
      const { importedAssets, duplicateFilePaths } = await window.editorApi.importAssets(
        projectDir,
        activeLocale,
        project.assets.assets,
        [filePath],
        "sceneAudio"
      );
      if (importedAssets.length === 0) {
        if (duplicateFilePaths.length > 0) {
          setStatusMessage("That file already exists as a scene audio asset. Choose it from the scene audio picker.");
        } else {
          setStatusMessage("No new scene audio asset was created.");
        }
        return;
      }

      const importedAsset = importedAssets[0]!;
      const nextProject = cloneProject(project);
      addAssetRoots(nextProject, [importedAsset]);
      nextProject.assets.assets.push(importedAsset);
      const scene = nextProject.scenes.items.find((entry) => entry.id === currentScene.id);
      if (scene) {
        scene.sceneAudioAssetId = importedAsset.id;
        scene.sceneAudioLoop = true;
      }

      const result = await window.editorApi.saveProject(projectDir, nextProject);
      setSavedProject(result.project);
      useEditorStore.getState().setSelectedAssetId(importedAsset.id);
      setStatusMessage(
        result.validationReport.valid
          ? `Assigned ${importedAsset.name} as the scene audio for ${currentScene.name}.`
          : `Assigned ${importedAsset.name} as the scene audio for ${currentScene.name}, saved with ${result.validationReport.issues.length} validation issue(s).`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Scene audio import failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  async function handleImportSceneAudio() {
    if (!currentScene) {
      return;
    }

    if (!sceneSupportsAudio) {
      setStatusMessage("Scene audio is only available when the scene uses an image background.");
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
    const filePath = droppedFilePaths.find(isBackgroundImportPath);

    if (!filePath) {
      setStatusMessage("Drop an image or video file onto the scene preview to replace the background.");
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
    sceneAudioDropDepthRef.current += 1;
    setIsSceneAudioDropActive(true);
  }

  function handleSceneAudioDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event) || !sceneSupportsAudio) {
      return;
    }

    event.preventDefault();
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
      setStatusMessage("Scene audio is only available when the scene uses an image background.");
      return;
    }

    const droppedFilePaths = Array.from(event.dataTransfer.files)
      .map((file) => window.editorApi.getPathForDroppedFile(file))
      .filter((filePath) => filePath.trim().length > 0);
    const filePath = droppedFilePaths.find(isSceneAudioImportPath);

    if (!filePath) {
      setStatusMessage("Drop an audio file onto the scene audio panel to assign scene audio.");
      return;
    }

    await importSceneAudioFromFilePath(filePath);
  }

  function deleteHotspot(hotspotId: string | undefined) {
    if (!currentSceneId || !hotspotId) {
      return;
    }

    mutateProject((draft) => {
      const scene = draft.scenes.items.find((entry) => entry.id === currentSceneId);
      if (!scene) {
        return;
      }

      const deletion = removeHotspotFromProject(draft, currentSceneId, hotspotId);
      if (!deletion.deleted) {
        return;
      }

      const nextHotspots = scene.hotspots;
      if (selectedHotspotId === hotspotId) {
        selectHotspot(nextHotspots[0]?.id, "preserve");
      }
    });
  }

  function selectHotspot(
    nextSelectedHotspotId: string | undefined,
    inspectorSelectionMode: HotspotInspectorSelectionMode = "open"
  ) {
    setSelectedHotspotId(nextSelectedHotspotId);
    setIsHotspotInspectorOpen((currentIsHotspotInspectorOpen) =>
      resolveNextHotspotInspectorOpenState(
        currentIsHotspotInspectorOpen,
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
      setStatusMessage("Select a scene before placing an inventory item.");
      return;
    }

    const option = linkedInventoryOptions.find((entry) => entry.itemId === itemId);
    if (!option?.eligible) {
      setStatusMessage("Add artwork to an item to make it available here.");
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
      setStatusMessage("Could not place that inventory item in this scene.");
      return;
    }

    setIsInventoryPickerOpen(false);
    selectHotspot(createdHotspotId, inspectorSelectionMode);
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
    setSelectedHotspotId(undefined);
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
    if (!floatingWindowVisibility.isInventoryPickerVisible && !floatingWindowVisibility.isHotspotInspectorVisible) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !shouldDismissScenesFloatingWindowsOnEscape(
          event,
          floatingWindowVisibility.isInventoryPickerVisible || floatingWindowVisibility.isHotspotInspectorVisible,
          Boolean(document.querySelector(".dialog-overlay"))
        )
      ) {
        return;
      }

      event.preventDefault();
      dismissFloatingWindows();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    dismissFloatingWindows,
    floatingWindowVisibility.isHotspotInspectorVisible,
    floatingWindowVisibility.isInventoryPickerVisible
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

  if (!currentScene) {
    return <div className="panel"><p>Create a scene to begin.</p></div>;
  }

  async function handleDeleteScene() {
    const dialogResult = await dialogs.deleteScene({
      project,
      sceneId: currentScene.id,
      referenceSummary: collectSceneReferenceSummary(project, currentScene.id)
    });
    if (dialogResult.action === "cancel") {
      return;
    }

    const nextProject = cloneProject(project);
    const deletion = removeSceneFromProject(
      nextProject,
      currentScene.id,
      dialogResult.action === "rewire"
        ? { mode: "rewire", replacementSceneId: dialogResult.replacementSceneId }
        : { mode: "cleanup" }
    );

    if (!deletion.deleted) {
      setStatusMessage(resolveDeleteSceneBlockedMessage(currentScene.name, deletion.blockedReason));
      return;
    }

    const nextSelectedSceneId =
      dialogResult.action === "rewire" ? dialogResult.replacementSceneId : nextProject.scenes.items[0]?.id;
    const replacementSceneName =
      dialogResult.action === "rewire"
        ? nextProject.scenes.items.find((scene) => scene.id === dialogResult.replacementSceneId)?.name
        : undefined;
    const validationReport = validateProject(nextProject);

    setSelectedHotspotId(undefined);
    setSelectedSceneId(nextSelectedSceneId);
    updateProject(nextProject);
    setStatusMessage(
      resolveDeleteSceneStatusMessage(
        currentScene.name,
        deletion,
        replacementSceneName,
        validationReport.valid,
        validationReport.issues.length
      )
    );
  }

  return (
    <div ref={scenesPanelRef} className="panel-grid panel-grid--single scenes-panel-shell">
      <section className="panel scenes-panel">
        <div className="panel__toolbar scenes-panel__toolbar">
          <div className="stack-inline scenes-panel__selectors">
            <label title="Choose which world location owns the currently selected scene.">
              <span className="field-label--inset">Location</span>
              <select
                value={currentScene.locationId}
                onChange={(event) =>
                  mutateProject((draft) => {
                    const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                    if (!scene) {
                      return;
                    }

                    const previousLocation = draft.locations.items.find((entry) => entry.id === scene.locationId);
                    const nextLocation = draft.locations.items.find((entry) => entry.id === event.target.value);
                    if (previousLocation) {
                      previousLocation.sceneIds = previousLocation.sceneIds.filter((sceneId) => sceneId !== scene.id);
                    }
                    if (nextLocation && !nextLocation.sceneIds.includes(scene.id)) {
                      nextLocation.sceneIds.push(scene.id);
                    }
                    scene.locationId = event.target.value;
                  })
                }
                onFocus={() => setSelectedHotspotId(undefined)}
              >
                {project.locations.items.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label title="Switch between scenes to edit their media, hotspots, subtitles, and wiring.">
              <span className="field-label--inset">Scene</span>
              <select
                value={currentScene.id}
                onChange={(event) => {
                  setSelectedSceneId(event.target.value);
                  setSelectedHotspotId(undefined);
                }}
              >
                {project.scenes.items.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="stack-inline scenes-panel__actions">
            <button
              type="button"
              className="button-danger"
              title="Delete this scene and choose whether to clean or rewire references to it."
              onClick={() => void handleDeleteScene()}
            >
              Delete Scene
            </button>
          </div>
        </div>

        <label title="Readable editor name for the current scene.">
          <span className="field-label--inset">Scene Name</span>
          <input
            value={currentScene.name}
            onChange={(event) =>
              mutateProject((draft) => {
                const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                if (scene) {
                  scene.name = event.target.value;
                }
              })
            }
          />
        </label>

        <label title="Background media shown for this scene in the editor and runtime.">
          <span className="field-label--inset">Background Asset</span>
          <div className="asset-assignment-row">
            <select
              value={currentScene.backgroundAssetId ?? ""}
              onChange={(event) =>
                mutateProject((draft) => {
                  const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                  if (scene) {
                    scene.backgroundAssetId = event.target.value || undefined;
                  }
                })
              }
            >
              <option value="">No background assigned</option>
              {currentScene.backgroundAssetId &&
              !availableBackgroundAssets.some((asset) => asset.id === currentScene.backgroundAssetId) ? (
                <option value={currentScene.backgroundAssetId}>
                  {currentScene.backgroundAssetId === "asset_placeholder"
                    ? "Starter placeholder"
                    : "Invalid background selection"}
                </option>
              ) : null}
              {availableBackgroundAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void handleImportBackground()}
              title="Create a new background asset from an image or video file and assign it to this scene."
            >
              {currentAsset ? "Replace Background" : "Upload Background"}
            </button>
          </div>
        </label>

        <div
          className={[
            "scenes-panel__background-dropzone",
            isBackgroundDropActive ? "scenes-panel__background-dropzone--active" : "",
            isInventoryPlacementDropActive ? "scenes-panel__background-dropzone--inventory-active" : ""
          ]
            .filter(Boolean)
            .join(" ")}
          onDragEnter={handleBackgroundDragEnter}
          onDragOver={handleBackgroundDragOver}
          onDragLeave={handleBackgroundDragLeave}
          onDrop={(event) => void handleBackgroundDrop(event)}
        >
          <div className="scenes-panel__background-dropzone-frame">
            <MediaSurface
              asset={currentAsset}
              className={isHotspotInspectorActive ? "media-surface--hotspot-locked" : undefined}
              locale={activeLocale}
              loopVideo={currentScene.backgroundVideoLoop}
              hotspots={currentScene.hotspots}
              hotspotVisuals={hotspotVisuals}
              onSurfaceDragEnter={handleInventoryPlacementDragEnter}
              onSurfaceDragOver={handleInventoryPlacementDragOver}
              onSurfaceDragLeave={handleInventoryPlacementDragLeave}
              onSurfaceDrop={handleInventoryPlacementDrop}
              strings={localeStrings}
              showSurfaceTooltips={false}
              showHotspotTooltips={false}
              playheadMs={currentAsset?.kind === "video" ? playheadMs : undefined}
              onPlayheadMsChange={currentAsset?.kind === "video" ? setPlayheadMs : undefined}
              selectedHotspotId={selectedHotspotId}
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
              onHotspotClick={(hotspotId, interaction) => {
                setIsInventoryPickerOpen(false);
                selectHotspot(hotspotId, interaction === "drag" ? "preserve" : "open");
              }}
              onHotspotDragStart={captureHotspotDragCheckpoint}
              onHotspotChange={updateHotspotGeometry}
            />
            {isBackgroundDropActive ? (
              <div className="scenes-panel__background-dropzone-overlay" aria-hidden="true">
                <strong>{currentAsset ? "Drop to replace background" : "Drop to assign background"}</strong>
                <span>Use an image or video file.</span>
              </div>
            ) : isInventoryPlacementDropActive ? (
              <div className="scenes-panel__background-dropzone-overlay scenes-panel__background-dropzone-overlay--inventory" aria-hidden="true">
                <strong>Drop to place item</strong>
                <span>Release to create a linked inventory hotspot at this position.</span>
              </div>
            ) : null}
          </div>
          <p className="muted scenes-panel__background-dropzone-hint">
            {currentAsset
              ? "Drag an image or video onto the preview to replace this scene's background."
              : "Drag an image or video onto the preview to assign a background to this scene."}
          </p>
        </div>

        <div className="stack-inline scenes-panel__hotspot-actions">
          <button
            type="button"
            title="Create a new hotspot in the emptiest available area of this scene. Shortcut: Ctrl+click empty space in the preview."
            onClick={createHotspotAtBestAvailablePosition}
          >
            Create Hotspot
          </button>
          <button
            type="button"
            className="button-danger"
            disabled={!selectedHotspotId}
            title="Delete the currently selected hotspot from this scene. Shortcut: Delete."
            onClick={() => deleteHotspot(selectedHotspotId)}
          >
            Delete Hotspot
          </button>
          <button
            ref={inventoryPickerAnchorRef}
            type="button"
            className="button-secondary"
            title="Search inventory items and place them into this scene."
            aria-expanded={floatingWindowVisibility.isInventoryPickerVisible}
            onClick={handleInventoryPickerToggle}
          >
            Add Inventory Item
          </button>
        </div>

        <label title="Optional ambient or music track that plays for this scene when it uses an image background.">
          <span className="field-label--inset">Scene Audio</span>
          <div className="asset-assignment-row">
            <select
              value={currentScene.sceneAudioAssetId ?? ""}
              onChange={(event) =>
                mutateProject((draft) => {
                  const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                  if (!scene) {
                    return;
                  }

                  scene.sceneAudioAssetId = event.target.value || undefined;
                })
              }
            >
              <option value="">No scene audio assigned</option>
              {currentScene.sceneAudioAssetId &&
              !availableSceneAudioAssets.some((asset) => asset.id === currentScene.sceneAudioAssetId) ? (
                <option value={currentScene.sceneAudioAssetId}>Invalid scene audio selection</option>
              ) : null}
              {availableSceneAudioAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button-secondary"
              disabled={!sceneSupportsAudio}
              onClick={() => void handleImportSceneAudio()}
              title={
                sceneSupportsAudio
                  ? "Create a new scene audio asset from an audio file and assign it to this scene."
                  : "Scene audio imports are disabled while this scene uses a video background."
              }
            >
              {currentSceneAudioAsset ? "Replace Scene Audio" : "Upload Scene Audio"}
            </button>
          </div>
        </label>

        <div
          className={
            isSceneAudioDropActive
              ? "asset-dropzone asset-dropzone--active scenes-panel__scene-audio-dropzone"
              : "asset-dropzone scenes-panel__scene-audio-dropzone"
          }
          onDragEnter={handleSceneAudioDragEnter}
          onDragOver={handleSceneAudioDragOver}
          onDragLeave={handleSceneAudioDragLeave}
          onDrop={(event) => void handleSceneAudioDrop(event)}
        >
          <strong>{currentSceneAudioAsset ? "Drop to replace scene audio" : "Drop scene audio here"}</strong>
          <span>
            {sceneSupportsAudio
              ? "Use an audio file to attach optional ambience or music to this image scene."
              : "Scene audio can stay assigned for reference, but imports and playback are disabled while the background is video."}
          </span>
          <div className="scenes-panel__scene-audio-preview">
            <AssetPreview
              asset={currentSceneAudioAsset}
              locale={activeLocale}
              allowSourceFallback
              emptyTitle="No scene audio"
              emptyBody="Assign or drop an audio file here to attach optional scene audio."
            />
          </div>
          <div className="scenes-panel__scene-audio-controls">
            <div className="list-card__actions">
              <button
                type="button"
                className="button-danger"
                disabled={!currentScene.sceneAudioAssetId}
                onClick={clearSceneAudio}
                title={
                  currentScene.sceneAudioAssetId
                    ? "Remove the current scene audio assignment from this scene."
                    : "No scene audio is currently assigned."
                }
              >
                Clear Scene Audio
              </button>
            </div>
            <label title="Delay before scene audio starts, and before it restarts again when looping.">
              <span className="field-label--inset">Start Delay (ms)</span>
              <input
                type="number"
                min={0}
                step={100}
                value={currentScene.sceneAudioDelayMs}
                disabled={!currentScene.sceneAudioAssetId || !sceneSupportsAudio}
                onChange={(event) =>
                  mutateProject((draft) => {
                    const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                    if (scene) {
                      scene.sceneAudioDelayMs = Math.max(0, Number(event.target.value) || 0);
                    }
                  })
                }
              />
            </label>
          </div>
        </div>

        {currentScene.sceneAudioAssetId ? (
          <label
            className="scene-video-loop-toggle"
            title="When enabled, scene audio waits for the configured delay, then restarts again after it ends."
          >
            <input
              type="checkbox"
              checked={currentScene.sceneAudioLoop}
              disabled={!sceneSupportsAudio}
              onChange={(event) =>
                mutateProject((draft) => {
                  const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                  if (scene) {
                    scene.sceneAudioLoop = event.target.checked;
                  }
                })
              }
            />
            <span>Loop scene audio with delay between restarts</span>
          </label>
        ) : null}

        {!sceneSupportsAudio ? (
          <p className="muted">
            Scene audio only plays when the background is an image. Clear the scene audio or switch back to an image background to resolve validation errors.
          </p>
        ) : null}

        {currentAsset?.kind === "video" ? (
          <label
            className="scene-video-loop-toggle"
            title="When enabled, this scene's background video restarts automatically after it reaches the end."
          >
            <input
              type="checkbox"
              checked={currentScene.backgroundVideoLoop}
              onChange={(event) =>
                mutateProject((draft) => {
                  const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                  if (scene) {
                    scene.backgroundVideoLoop = event.target.checked;
                  }
                })
              }
            />
            <span>Loop background video indefinitely</span>
          </label>
        ) : null}

        <label>
          Playhead {Math.round(playheadMs)}ms
          <input
            type="range"
            min={0}
            max={sceneTimelineDurationMs}
            value={Math.min(playheadMs, sceneTimelineDurationMs)}
            title="Scrub through the current scene asset to line up hotspot timing and subtitle cues."
            onChange={(event) => setPlayheadMs(Number(event.target.value))}
          />
        </label>

        <div className="split-columns">
          <section>
            <h4>Scene Wiring</h4>
            <JsonField
              label="On Enter Effects JSON"
              value={JSON.stringify(currentScene.onEnterEffects, null, 2)}
              tooltip="JSON effect list that runs automatically when the player enters this scene."
              labelClassName="field-label--inset"
              onCommit={(nextValue) =>
                mutateProject((draft) => {
                  const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                  if (scene) {
                    scene.onEnterEffects = parseJson(nextValue, scene.onEnterEffects);
                  }
                })
              }
            />
            <JsonField
              label="On Exit Effects JSON"
              value={JSON.stringify(currentScene.onExitEffects, null, 2)}
              tooltip="JSON effect list that runs automatically when the player leaves this scene."
              labelClassName="field-label--inset"
              onCommit={(nextValue) =>
                mutateProject((draft) => {
                  const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                  if (scene) {
                    scene.onExitEffects = parseJson(nextValue, scene.onExitEffects);
                  }
                })
              }
            />
            <label title="Enable dialogue trees that can be referenced or triggered from this scene.">
              Scene Dialogues
              <div className="checkbox-list">
                {project.dialogues.items.map((dialogue) => (
                  <label
                    key={dialogue.id}
                    title={`Attach or detach the ${dialogue.name} dialogue tree from this scene.`}
                  >
                    <input
                      type="checkbox"
                      checked={currentScene.dialogueTreeIds.includes(dialogue.id)}
                      onChange={(event) =>
                        mutateProject((draft) => {
                          const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                          if (!scene) {
                            return;
                          }

                          scene.dialogueTreeIds = event.target.checked
                            ? [...new Set([...scene.dialogueTreeIds, dialogue.id])]
                            : scene.dialogueTreeIds.filter((dialogueId) => dialogueId !== dialogue.id);
                        })
                      }
                    />
                    {dialogue.name}
                  </label>
                ))}
              </div>
            </label>
          </section>
        </div>

        <section>
          <div className="panel__toolbar">
            <h4>Subtitle Tracks</h4>
            <div className="stack-inline">
              <button
                type="button"
                title="Import SRT or VTT files and create subtitle tracks for this scene."
                onClick={() => void handleImportSubtitles()}
              >
                Import Subtitles
              </button>
              <button
                type="button"
                title="Create a subtitle track for this scene and seed it with one editable cue."
                onClick={addSubtitleTrack}
              >
                Add Track
              </button>
            </div>
          </div>

          {currentScene.subtitleTracks
            .map((track, trackIndex) => (
              <div key={track.id} className="list-card subtitle-track">
                <div className="panel__toolbar">
                  <div>
                    <h5>{`Track ${trackIndex + 1}`}</h5>
                    <p className="subtitle-track__meta">
                      {track.cues.length} cue{track.cues.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="stack-inline">
                    <button
                      type="button"
                      title="Append a new subtitle cue after the current last cue."
                      onClick={() => addSubtitleCue(track.id)}
                    >
                      Add Cue
                    </button>
                    <button
                      type="button"
                      className="button-danger"
                      title="Delete this subtitle track from the current scene."
                      onClick={() => deleteSubtitleTrack(track.id)}
                    >
                      Delete Track
                    </button>
                  </div>
                </div>
                {track.cues.length > 0 ? (
                  <div className="subtitle-track__cues">
                    <div className="subtitle-track__columns" aria-hidden="true">
                      <span>Start</span>
                      <span>End</span>
                      <span>Text</span>
                      <span />
                    </div>
                    {track.cues.map((cue) => (
                      <div key={cue.id} className="cue-row cue-row--subtitle">
                        <input
                          type="number"
                          value={cue.startMs}
                          title="Subtitle cue start time in milliseconds."
                          onChange={(event) =>
                            mutateProject((draft) => {
                              const target = draft.scenes.items
                                .find((entry) => entry.id === currentScene.id)
                                ?.subtitleTracks.find((entry) => entry.id === track.id)
                                ?.cues.find((entry) => entry.id === cue.id);
                              if (target) {
                                target.startMs = Number(event.target.value);
                              }
                            })
                          }
                        />
                        <input
                          type="number"
                          value={cue.endMs}
                          title="Subtitle cue end time in milliseconds."
                          onChange={(event) =>
                            mutateProject((draft) => {
                              const target = draft.scenes.items
                                .find((entry) => entry.id === currentScene.id)
                                ?.subtitleTracks.find((entry) => entry.id === track.id)
                                ?.cues.find((entry) => entry.id === cue.id);
                              if (target) {
                                target.endMs = Number(event.target.value);
                              }
                            })
                          }
                        />
                        <textarea
                          rows={2}
                          value={localeStrings[cue.textId] ?? ""}
                          title="Subtitle text shown to the player during this cue."
                          onChange={(event) =>
                            mutateProject((draft) => {
                              const target = draft.scenes.items
                                .find((entry) => entry.id === currentScene.id)
                                ?.subtitleTracks.find((entry) => entry.id === track.id)
                                ?.cues.find((entry) => entry.id === cue.id);
                              if (target) {
                                setEditorLocalizedText(draft, activeLocale, target.textId, event.target.value);
                              }
                            })
                          }
                        />
                        <button
                          type="button"
                          className="button-danger cue-row__delete-button"
                          aria-label="Remove cue"
                          title="Delete this subtitle cue from the track."
                          onClick={() => deleteSubtitleCue(track.id, cue.id)}
                        >
                          ❌
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No cues yet. Add one to start timing this track.</p>
                )}
              </div>
            ))}
        </section>
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
          localeStrings={localeStrings}
          inventoryItemOptions={linkedInventoryOptions}
          scenes={project.scenes.items}
          position={hotspotInspectorPosition}
          selectedHotspot={selectedHotspot}
          mutateSelectedHotspot={mutateSelectedHotspot}
          onPositionChange={setHotspotInspectorPosition}
          onInteractionActiveChange={setIsHotspotInspectorActive}
          onDismiss={() => setIsHotspotInspectorOpen(false)}
        />
      ) : null}
    </div>
  );
}

type HotspotInspectorSelectionMode = "open" | "preserve";

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
  nextSelectedHotspotId: string | undefined,
  inspectorSelectionMode: HotspotInspectorSelectionMode
) {
  if (!nextSelectedHotspotId) {
    return false;
  }

  return inspectorSelectionMode === "open" ? true : currentIsHotspotInspectorOpen;
}

export function resolveInventoryPickerToggleResult(isInventoryPickerOpen: boolean) {
  return {
    nextIsInventoryPickerOpen: !isInventoryPickerOpen,
    shouldClearSelectedHotspot: !isInventoryPickerOpen
  };
}

const INVENTORY_PICKER_PAGE_SIZE = 6;

export function resolveInventoryPickerKeyboardAction(
  key: string,
  itemIds: string[],
  activeItemId?: string,
  pageSize = INVENTORY_PICKER_PAGE_SIZE
) {
  if (itemIds.length === 0) {
    return {
      handled: false,
      shouldPlaceActiveItem: false
    };
  }

  const lastIndex = itemIds.length - 1;
  const activeIndex = Math.max(0, itemIds.indexOf(activeItemId ?? itemIds[0]!));

  switch (key) {
    case "ArrowDown":
      return {
        handled: true,
        nextActiveItemId: itemIds[Math.min(activeIndex + 1, lastIndex)],
        shouldPlaceActiveItem: false
      };
    case "ArrowUp":
      return {
        handled: true,
        nextActiveItemId: itemIds[Math.max(activeIndex - 1, 0)],
        shouldPlaceActiveItem: false
      };
    case "Home":
      return {
        handled: true,
        nextActiveItemId: itemIds[0],
        shouldPlaceActiveItem: false
      };
    case "End":
      return {
        handled: true,
        nextActiveItemId: itemIds[lastIndex],
        shouldPlaceActiveItem: false
      };
    case "PageDown":
      return {
        handled: true,
        nextActiveItemId: itemIds[Math.min(activeIndex + pageSize, lastIndex)],
        shouldPlaceActiveItem: false
      };
    case "PageUp":
      return {
        handled: true,
        nextActiveItemId: itemIds[Math.max(activeIndex - pageSize, 0)],
        shouldPlaceActiveItem: false
      };
    case "Enter":
      return {
        handled: true,
        nextActiveItemId: itemIds[activeIndex],
        shouldPlaceActiveItem: true
      };
    default:
      return {
        handled: false,
        shouldPlaceActiveItem: false
      };
  }
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

interface HotspotInspectorWindowProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  activeLocale: string;
  inventoryItemOptions: LinkedInventoryOption[];
  localeStrings: Record<string, string>;
  position?: FloatingWindowPosition;
  scenes: ProjectBundle["scenes"]["items"];
  selectedHotspot: Hotspot;
  mutateSelectedHotspot: (mutator: (hotspot: Hotspot, draft: ProjectBundle) => void) => void;
  onPositionChange: React.Dispatch<React.SetStateAction<FloatingWindowPosition | undefined>>;
  onInteractionActiveChange: (active: boolean) => void;
  onDismiss: () => void;
}

interface LinkedInventoryOption {
  asset?: Asset;
  description?: string;
  internalName: string;
  itemId: string;
  label: string;
  eligible: boolean;
  searchText: string;
}

interface InventoryPlacementPickerWindowProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  activeItem?: LinkedInventoryOption;
  activeLocale: string;
  options: LinkedInventoryOption[];
  position?: FloatingWindowPosition;
  search: string;
  showEmptyInventoryState: boolean;
  onActiveItemIdChange: (itemId?: string) => void;
  onDragStart: (itemId: string, previewSize: { width: number; height: number }) => void;
  onDragEnd: () => void;
  onPlaceItem: (itemId: string, previewSize?: { width: number; height: number }) => void;
  onPositionChange: React.Dispatch<React.SetStateAction<FloatingWindowPosition | undefined>>;
  onSearchChange: (value: string) => void;
  onDismiss: () => void;
}

const INVENTORY_PICKER_FALLBACK_SIZE = {
  width: 520,
  height: 620
};

const HOTSPOT_INSPECTOR_FALLBACK_SIZE = {
  width: 420,
  height: 640
};

const useFloatingWindowLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function InventoryPlacementPickerWindow({
  anchorRef,
  activeItem,
  activeLocale,
  options,
  position,
  search,
  showEmptyInventoryState,
  onActiveItemIdChange,
  onDragStart,
  onDragEnd,
  onPlaceItem,
  onPositionChange,
  onSearchChange,
  onDismiss
}: InventoryPlacementPickerWindowProps) {
  const pickerRef = useRef<HTMLElement>(null);
  const itemListRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dragCleanupRef = useRef<(() => void) | undefined>(undefined);
  const dragImageCleanupRef = useRef<(() => void) | undefined>(undefined);

  useFloatingWindowLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncPosition = () => {
      const viewport = getViewportSize();
      const size = getFloatingWindowSize(pickerRef.current, INVENTORY_PICKER_FALLBACK_SIZE);
      const anchorRect = anchorRef.current?.getBoundingClientRect();

      onPositionChange((currentPosition) => {
        return resolveNextFloatingWindowPosition(
          currentPosition,
          size,
          viewport,
          undefined,
          anchorRect
            ? {
                top: anchorRect.bottom,
                right: anchorRect.right
              }
            : undefined
        );
      });
    };

    syncPosition();

    const handleResize = () => {
      syncPosition();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [anchorRef, onPositionChange, options.length, showEmptyInventoryState]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragImageCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      pickerRef.current?.focus();

      if (!showEmptyInventoryState) {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [showEmptyInventoryState]);

  useEffect(() => {
    if (!activeItem?.itemId) {
      return;
    }

    itemListRef.current
      ?.querySelector<HTMLElement>(`[data-inventory-item-id="${activeItem.itemId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeItem?.itemId]);

  function startDrag(event: React.MouseEvent<HTMLElement>) {
    if (event.button !== 0 || typeof window === "undefined") {
      return;
    }

    const pickerElement = pickerRef.current;
    if (!pickerElement || !shouldStartFloatingWindowDrag(event.target)) {
      return;
    }

    event.preventDefault();
    dragCleanupRef.current?.();

    const bounds = pickerElement.getBoundingClientRect();
    const dragOffsetX = event.clientX - bounds.left;
    const dragOffsetY = event.clientY - bounds.top;
    const body = document.body;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    body.style.cursor = "grabbing";
    body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const size = getFloatingWindowSize(pickerRef.current, INVENTORY_PICKER_FALLBACK_SIZE);
      const viewport = getViewportSize();
      onPositionChange(
        clampFloatingWindowPosition(
          {
            x: moveEvent.clientX - dragOffsetX,
            y: moveEvent.clientY - dragOffsetY
          },
          size,
          viewport
        )
      );
    };

    const finishDrag = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", finishDrag);
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
      dragCleanupRef.current = undefined;
    };

    dragCleanupRef.current = finishDrag;

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", finishDrag);
  }

  function handleItemDragStart(event: React.DragEvent<HTMLDivElement>, itemId: string) {
    const previewSize = resolveInventoryDragPreviewSize(event.currentTarget);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(INVENTORY_ITEM_DRAG_TYPE, itemId);
    event.dataTransfer.setData(INVENTORY_ITEM_DRAG_SIZE_TYPE, JSON.stringify(previewSize));
    event.dataTransfer.setData("text/plain", itemId);
    dragImageCleanupRef.current?.();
    dragImageCleanupRef.current = setTransparentInventoryDragImage(event.dataTransfer, event.currentTarget);
    onActiveItemIdChange(itemId);
    onDragStart(itemId, previewSize);
  }

  function handleItemDragEnd() {
    dragImageCleanupRef.current?.();
    dragImageCleanupRef.current = undefined;
    onDragEnd();
  }

  function handlePlaceButtonClick(event: React.MouseEvent<HTMLButtonElement>, itemId: string) {
    const previewSize = resolveInventoryPlacementActionPreviewSize(event.currentTarget);
    onPlaceItem(itemId, previewSize);
  }

  function handlePlaceActiveItem() {
    if (!activeItem?.itemId) {
      return;
    }

    const placeButton = itemListRef.current?.querySelector<HTMLButtonElement>(
      `[data-inventory-item-id="${activeItem.itemId}"] [data-inventory-picker-place-button="true"]`
    );
    const previewSize = placeButton ? resolveInventoryPlacementActionPreviewSize(placeButton) : undefined;
    onPlaceItem(activeItem.itemId, previewSize);
  }

  function handlePickerKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.target instanceof HTMLElement && event.target.closest(".scenes-floating-inspector__header")) {
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const action = resolveInventoryPickerKeyboardAction(
      event.key,
      options.map((option) => option.itemId),
      activeItem?.itemId
    );
    if (!action.handled) {
      return;
    }

    event.preventDefault();

    if (action.nextActiveItemId) {
      onActiveItemIdChange(action.nextActiveItemId);
    }

    if (action.shouldPlaceActiveItem) {
      handlePlaceActiveItem();
    }
  }

  const pickerTitleId = "inventory-placement-picker-title";

  return (
    <div className="scenes-floating-inspector-layer">
      <aside
        ref={pickerRef}
        role="dialog"
        aria-labelledby={pickerTitleId}
        tabIndex={-1}
        onMouseDown={startDrag}
        onKeyDownCapture={handlePickerKeyDown}
        className={
          position
            ? "panel scenes-floating-inspector scenes-floating-inspector--inventory-picker scenes-floating-inspector--ready"
            : "panel scenes-floating-inspector scenes-floating-inspector--inventory-picker"
        }
        style={position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
      >
        <header className="scenes-floating-inspector__header">
          <div className="scenes-floating-inspector__title-group">
            <p className="eyebrow">Scene Placement</p>
            <h3 id={pickerTitleId}>Add inventory item</h3>
          </div>
          <button
            type="button"
            className="button-secondary scenes-floating-inspector__close"
            title="Hide the inventory placement picker."
            onClick={onDismiss}
          >
            Close
          </button>
        </header>

        <div className="scenes-floating-inspector__body scenes-floating-inspector__body--inventory-picker">
          {showEmptyInventoryState ? (
            <div className="list-card scenes-inventory-picker__empty-state">
              <strong>No items are ready to place</strong>
              <p className="muted">Add artwork to an item to make it available here.</p>
            </div>
          ) : (
            <>
              <label className="localization-filter localization-filter--search scenes-inventory-picker__search">
                <span className="field-label--inset">Search</span>
                <input
                  ref={searchInputRef}
                  value={search}
                  placeholder="Search inventory items"
                  onChange={(event) => onSearchChange(event.target.value)}
                />
              </label>

              <div className="list-card list-card--compact scenes-inventory-picker__preview">
                <strong>{activeItem?.label ?? "No matching items"}</strong>
                <p className="muted scenes-inventory-picker__description">
                  {activeItem?.description?.trim() || (options.length === 0 ? "No matching items" : "No description available.")}
                </p>
                <p className="muted scenes-inventory-picker__drag-hint">Drag an item onto the scene to place it</p>
              </div>

              {options.length === 0 ? (
                <div className="list-card list-card--compact scenes-inventory-picker__empty-state">
                  <strong>No matching items</strong>
                </div>
              ) : (
                <div ref={itemListRef} className="list-stack scenes-inventory-picker__list">
                  {options.map((option) => (
                    <article
                      key={option.itemId}
                      data-inventory-item-id={option.itemId}
                      className={
                        activeItem?.itemId === option.itemId
                          ? "list-card list-card--compact list-card--selected scenes-inventory-picker__item"
                          : "list-card list-card--compact scenes-inventory-picker__item"
                      }
                      title={option.internalName !== option.label ? option.internalName : undefined}
                      onMouseEnter={() => onActiveItemIdChange(option.itemId)}
                      onFocusCapture={() => onActiveItemIdChange(option.itemId)}
                    >
                      <div
                        draggable
                        data-floating-window-drag-ignore="true"
                        className="scenes-inventory-picker__item-drag-handle"
                        title={`Drag ${option.label} onto the scene to place it.`}
                        onMouseDown={(event) => event.stopPropagation()}
                        onDragStart={(event) => handleItemDragStart(event, option.itemId)}
                        onDragEnd={handleItemDragEnd}
                      >
                        <div className="scenes-inventory-picker__item-thumb">
                          <AssetPreview
                            asset={option.asset}
                            locale={activeLocale}
                            interactive={false}
                            allowSourceFallback
                            preferPosterForImages
                            fit="contain"
                            emptyTitle="No item image"
                            emptyBody="Assign item artwork in Inventory."
                          />
                        </div>
                      </div>
                      <div className="scenes-inventory-picker__item-copy">
                        <strong>{option.label}</strong>
                      </div>
                      <button
                        type="button"
                        data-inventory-picker-place-button="true"
                        className="button-secondary"
                        onFocus={() => onActiveItemIdChange(option.itemId)}
                        onClick={(event) => handlePlaceButtonClick(event, option.itemId)}
                      >
                        Place
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function HotspotInspectorWindow({
  anchorRef,
  activeLocale,
  inventoryItemOptions,
  localeStrings,
  position,
  scenes,
  selectedHotspot,
  mutateSelectedHotspot,
  onPositionChange,
  onInteractionActiveChange,
  onDismiss
}: HotspotInspectorWindowProps) {
  const inspectorRef = useRef<HTMLElement>(null);
  const dragCleanupRef = useRef<(() => void) | undefined>(undefined);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusedWithin, setIsFocusedWithin] = useState(false);

  useFloatingWindowLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncPosition = () => {
      const viewport = getViewportSize();
      const size = getFloatingWindowSize(inspectorRef.current, HOTSPOT_INSPECTOR_FALLBACK_SIZE);
      const anchorRect = anchorRef.current?.getBoundingClientRect();
      const selectedHotspotRect = resolveSelectedHotspotRect();

      onPositionChange((currentPosition) => {
        return resolveNextFloatingWindowPosition(
          currentPosition,
          size,
          viewport,
          selectedHotspotRect,
          anchorRect
            ? {
                top: anchorRect.top,
                right: anchorRect.right
              }
            : undefined
        );
      });
    };

    syncPosition();

    const handleResize = () => {
      syncPosition();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [anchorRef, onPositionChange, selectedHotspot.id]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    onInteractionActiveChange(isHovered || isFocusedWithin);
  }, [isFocusedWithin, isHovered, onInteractionActiveChange]);

  useEffect(() => {
    return () => {
      onInteractionActiveChange(false);
    };
  }, [onInteractionActiveChange]);

  function startDrag(event: React.MouseEvent<HTMLElement>) {
    if (event.button !== 0 || typeof window === "undefined") {
      return;
    }

    const inspectorElement = inspectorRef.current;
    if (!inspectorElement || !shouldStartFloatingWindowDrag(event.target)) {
      return;
    }

    event.preventDefault();
    dragCleanupRef.current?.();

    const bounds = inspectorElement.getBoundingClientRect();
    const dragOffsetX = event.clientX - bounds.left;
    const dragOffsetY = event.clientY - bounds.top;
    const body = document.body;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    body.style.cursor = "grabbing";
    body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const size = getFloatingWindowSize(inspectorRef.current, HOTSPOT_INSPECTOR_FALLBACK_SIZE);
      const viewport = getViewportSize();
      onPositionChange(
        clampFloatingWindowPosition(
          {
            x: moveEvent.clientX - dragOffsetX,
            y: moveEvent.clientY - dragOffsetY
          },
          size,
          viewport
        )
      );
    };

    const finishDrag = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", finishDrag);
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
      dragCleanupRef.current = undefined;
    };

    dragCleanupRef.current = finishDrag;

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", finishDrag);
  }

  const inspectorTitleId = `hotspot-inspector-title-${selectedHotspot.id}`;

  return (
    <div className="scenes-floating-inspector-layer">
      <aside
        ref={inspectorRef}
        role="dialog"
        aria-labelledby={inspectorTitleId}
        onMouseDown={startDrag}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setIsFocusedWithin(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsFocusedWithin(false);
          }
        }}
        className={
          position
            ? "panel scenes-floating-inspector scenes-floating-inspector--ready"
            : "panel scenes-floating-inspector"
        }
        style={position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined}
      >
        <header className="scenes-floating-inspector__header">
          <div className="scenes-floating-inspector__title-group">
            <p className="eyebrow">Hotspot Inspector</p>
            <h3 id={inspectorTitleId}>{selectedHotspot.name || selectedHotspot.id}</h3>
          </div>
          <button
            type="button"
            className="button-secondary scenes-floating-inspector__close"
            title="Hide the floating hotspot inspector."
            onClick={onDismiss}
          >
            Close
          </button>
        </header>

        <div className="scenes-floating-inspector__body">
          <p className="muted">
            These hotspot shapes are clickable interaction regions over the scene. Drag the shape or its orange
            handles in the preview for quick edits, then move this inspector wherever you want inside the editor
            window.
          </p>
          <article className="list-card list-card--selected">
            <label title="Visible hotspot title shown in the editor and runtime.">
              <span className="field-label--inset">Name</span>
              <input
                value={selectedHotspot.name}
                title="Visible hotspot title shown in the editor and runtime."
                onChange={(event) =>
                  mutateSelectedHotspot((hotspot) => {
                    hotspot.name = event.target.value;
                  })
                }
              />
            </label>
            <label title="Optional secondary text shown inside this hotspot under the main label.">
              <span className="field-label--inset">Comment</span>
              <input
                value={selectedHotspot.commentTextId ? localeStrings[selectedHotspot.commentTextId] ?? "" : ""}
                onChange={(event) =>
                  mutateSelectedHotspot((hotspot, draft) => {
                    hotspot.commentTextId ??= `text.${hotspot.id}.comment`;
                    setEditorLocalizedText(draft, activeLocale, hotspot.commentTextId, event.target.value);
                  })
                }
              />
            </label>
            <label title="Links this hotspot to an inventory item and uses that item's art in the scene.">
              <span className="field-label--inset">Inventory Item</span>
              <select
                value={selectedHotspot.inventoryItemId ?? ""}
                onChange={(event) =>
                  mutateSelectedHotspot((hotspot) => {
                    hotspot.inventoryItemId = event.target.value || undefined;
                    if (event.target.value) {
                      hotspot.polygon = undefined;
                    }
                  })
                }
              >
                <option value="">None</option>
                {inventoryItemOptions.map((option) => (
                  <option key={option.itemId} value={option.itemId}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">Links this hotspot to an inventory item and uses that item's art in the scene.</p>
            <div className="four-grid">
              {(
                [
                  ["x", "X", "Horizontal position of the hotspot bounds as a normalized value from 0 to 1."],
                  ["y", "Y", "Vertical position of the hotspot bounds as a normalized value from 0 to 1."],
                  ["width", "W", "Hotspot bounds width as a normalized percentage of the scene surface."],
                  ["height", "H", "Hotspot bounds height as a normalized percentage of the scene surface."]
                ] as const
              ).map(([field, label, tooltip]) => (
                <label key={field} title={tooltip}>
                  <span className="field-label--inset">{label}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formatHotspotCoordinate(selectedHotspot[field])}
                    title={tooltip}
                    onChange={(event) =>
                      mutateSelectedHotspot((hotspot) => {
                        const nextGeometry = applyHotspotBounds(
                          {
                            inventoryItemId: hotspot.inventoryItemId,
                            x: hotspot.x,
                            y: hotspot.y,
                            width: hotspot.width,
                            height: hotspot.height,
                            polygon: hotspot.polygon
                          },
                          {
                            x: field === "x" ? Number(event.target.value) : hotspot.x,
                            y: field === "y" ? Number(event.target.value) : hotspot.y,
                            width: field === "width" ? Number(event.target.value) : hotspot.width,
                            height: field === "height" ? Number(event.target.value) : hotspot.height
                          }
                        );

                        hotspot.x = nextGeometry.x;
                        hotspot.y = nextGeometry.y;
                        hotspot.width = nextGeometry.width;
                        hotspot.height = nextGeometry.height;
                        hotspot.polygon = nextGeometry.polygon;
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="stack-inline">
              <label title="Time in milliseconds when this hotspot becomes clickable.">
                <span className="field-label--inset">Start (ms)</span>
                <input
                  type="number"
                  value={selectedHotspot.startMs}
                  title="Time in milliseconds when this hotspot becomes clickable."
                  onChange={(event) =>
                    mutateSelectedHotspot((hotspot) => {
                      hotspot.startMs = Number(event.target.value);
                    })
                  }
                />
              </label>
              <label title="Time in milliseconds when this hotspot stops being clickable.">
                <span className="field-label--inset">End (ms)</span>
                <input
                  type="number"
                  value={selectedHotspot.endMs}
                  title="Time in milliseconds when this hotspot stops being clickable."
                  onChange={(event) =>
                    mutateSelectedHotspot((hotspot) => {
                      hotspot.endMs = Number(event.target.value);
                    })
                  }
                />
              </label>
            </div>
            <label title="Scene that should open when this hotspot is activated.">
              <span className="field-label--inset">Target Scene</span>
              <select
                value={selectedHotspot.targetSceneId ?? ""}
                onChange={(event) =>
                  mutateSelectedHotspot((hotspot) => {
                    hotspot.targetSceneId = event.target.value || undefined;
                  })
                }
              >
                <option value="">None</option>
                {scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.name}
                  </option>
                ))}
              </select>
            </label>
            <label title="Comma-separated inventory item IDs required before this hotspot can be used.">
              <span className="field-label--inset">Required Item IDs</span>
              <input
                value={selectedHotspot.requiredItemIds.join(", ")}
                onChange={(event) =>
                  mutateSelectedHotspot((hotspot) => {
                    hotspot.requiredItemIds = event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean);
                  })
                }
              />
            </label>
            <JsonField
              label="Conditions JSON"
              value={JSON.stringify(selectedHotspot.conditions, null, 2)}
              tooltip="Advanced JSON condition list that must pass before this hotspot is enabled."
              labelClassName="field-label--inset"
              onCommit={(nextValue) =>
                mutateSelectedHotspot((hotspot) => {
                  hotspot.conditions = parseJson(nextValue, hotspot.conditions);
                })
              }
            />
            <JsonField
              label="Effects JSON"
              value={JSON.stringify(selectedHotspot.effects, null, 2)}
              tooltip="Advanced JSON effect list that runs after this hotspot is activated."
              labelClassName="field-label--inset"
              onCommit={(nextValue) =>
                mutateSelectedHotspot((hotspot) => {
                  hotspot.effects = parseJson(nextValue, hotspot.effects);
                })
              }
            />
          </article>
        </div>
      </aside>
    </div>
  );
}

function getFloatingWindowSize(
  element: HTMLElement | null,
  fallbackSize: {
    width: number;
    height: number;
  }
) {
  if (!element) {
    return fallbackSize;
  }

  const bounds = element.getBoundingClientRect();
  return {
    width: bounds.width || fallbackSize.width,
    height: bounds.height || fallbackSize.height
  };
}

function getViewportSize() {
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: document.documentElement.clientHeight || window.innerHeight
  };
}

function resolveSelectedHotspotRect() {
  const selectedHotspotBody = document.querySelector(".media-surface .hotspot--selected .hotspot__body");
  const selectedHotspotHandles = document.querySelector(".media-surface .hotspot--selected .hotspot__handles");
  const fallbackHotspot = document.querySelector(".media-surface .hotspot--selected");

  const bodyRect =
    selectedHotspotBody instanceof HTMLElement ? selectedHotspotBody.getBoundingClientRect() : undefined;
  const handlesRect =
    selectedHotspotHandles instanceof HTMLElement ? selectedHotspotHandles.getBoundingClientRect() : undefined;

  const bounds = bodyRect
    ? handlesRect
      ? {
          left: Math.min(bodyRect.left, handlesRect.left),
          top: Math.min(bodyRect.top, handlesRect.top),
          right: Math.max(bodyRect.right, handlesRect.right),
          bottom: Math.max(bodyRect.bottom, handlesRect.bottom)
        }
      : bodyRect
    : fallbackHotspot instanceof HTMLElement
      ? fallbackHotspot.getBoundingClientRect()
      : undefined;

  if (!bounds) {
    return undefined;
  }

  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top
  };
}

export function resolveLinkedInventoryOptions(
  items: InventoryItem[],
  assets: Asset[],
  strings: Record<string, string>,
  currentItemId?: string
): LinkedInventoryOption[] {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset] as const));
  const options: LinkedInventoryOption[] = [];

  for (const item of items) {
    const asset = item.imageAssetId ? assetsById.get(item.imageAssetId) : undefined;
    if (!asset || !isInventoryImageAsset(asset)) {
      continue;
    }

    options.push({
      asset,
      description: normalizeInventoryPickerText(item.descriptionTextId ? strings[item.descriptionTextId] : undefined),
      internalName: item.name,
      itemId: item.id,
      label: strings[item.textId] ?? item.name ?? item.id,
      eligible: true,
      searchText: `${strings[item.textId] ?? item.name ?? item.id}\n${item.name}`.toLowerCase()
    });
  }

  if (!currentItemId || options.some((option) => option.itemId === currentItemId)) {
    return options;
  }

  const currentItem = items.find((item) => item.id === currentItemId);
  if (!currentItem) {
    return [
      {
        internalName: currentItemId,
        itemId: currentItemId,
        label: `Missing inventory item (${currentItemId})`,
        eligible: false,
        searchText: currentItemId.toLowerCase()
      },
      ...options
    ];
  }

  return [
    {
      asset: currentItem.imageAssetId ? assetsById.get(currentItem.imageAssetId) : undefined,
      description: normalizeInventoryPickerText(currentItem.descriptionTextId ? strings[currentItem.descriptionTextId] : undefined),
      internalName: currentItem.name,
      itemId: currentItem.id,
      label: `${strings[currentItem.textId] ?? currentItem.name ?? currentItem.id} (missing valid art)`,
      eligible: false,
      searchText: `${strings[currentItem.textId] ?? currentItem.name ?? currentItem.id}\n${currentItem.name}`.toLowerCase()
    },
    ...options
  ];
}

export function filterInventoryPlacementOptions(options: LinkedInventoryOption[], search: string): LinkedInventoryOption[] {
  const normalizedSearch = search.trim().toLowerCase();
  if (normalizedSearch.length === 0) {
    return options;
  }

  return options.filter((option) => option.searchText.includes(normalizedSearch));
}

function applyInventoryLinkToHotspot(hotspot: Hotspot, item: InventoryItem, strings: Record<string, string>) {
  hotspot.inventoryItemId = item.id;
  hotspot.polygon = undefined;
  hotspot.name = strings[item.textId] ?? item.name ?? hotspot.name;
}

function normalizeInventoryPickerText(value: string | undefined) {
  const normalizedValue = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function resolveDraggedInventoryItemId(dataTransfer: DataTransfer, options: LinkedInventoryOption[]) {
  const customItemId = dataTransfer.getData(INVENTORY_ITEM_DRAG_TYPE).trim();
  if (customItemId.length > 0) {
    return customItemId;
  }

  const plainTextItemId = dataTransfer.getData("text/plain").trim();
  return options.some((option) => option.itemId === plainTextItemId) ? plainTextItemId : undefined;
}

function resolveDraggedInventoryPreviewSize(dataTransfer: DataTransfer) {
  const serializedSize = dataTransfer.getData(INVENTORY_ITEM_DRAG_SIZE_TYPE).trim();
  if (serializedSize.length === 0) {
    return undefined;
  }

  try {
    const parsedSize = JSON.parse(serializedSize) as {
      width?: unknown;
      height?: unknown;
    };
    if (typeof parsedSize.width !== "number" || typeof parsedSize.height !== "number") {
      return undefined;
    }

    return parsedSize.width > 0 && parsedSize.height > 0
      ? {
          widthPx: parsedSize.width,
          heightPx: parsedSize.height
        }
      : undefined;
  } catch {
    return undefined;
  }
}

function resolveInventoryDragPreviewSize(dragHandle: HTMLElement) {
  const sourceImage = dragHandle.querySelector<HTMLElement>("img.asset-preview__media");
  if (!sourceImage) {
    const previewBounds = dragHandle.getBoundingClientRect();
    return {
      width: Math.max(previewBounds.width, 1),
      height: Math.max(previewBounds.height, 1)
    };
  }

  const previewBounds = sourceImage.getBoundingClientRect();
  const previewStyles = window.getComputedStyle(sourceImage);
  return resolveInventoryPreviewContentSize({
    previewWidthPx: previewBounds.width,
    previewHeightPx: previewBounds.height,
    paddingTopPx: parseCssPixelValue(previewStyles.paddingTop),
    paddingRightPx: parseCssPixelValue(previewStyles.paddingRight),
    paddingBottomPx: parseCssPixelValue(previewStyles.paddingBottom),
    paddingLeftPx: parseCssPixelValue(previewStyles.paddingLeft),
    borderTopPx: parseCssPixelValue(previewStyles.borderTopWidth),
    borderRightPx: parseCssPixelValue(previewStyles.borderRightWidth),
    borderBottomPx: parseCssPixelValue(previewStyles.borderBottomWidth),
    borderLeftPx: parseCssPixelValue(previewStyles.borderLeftWidth)
  });
}

function resolveInventoryPlacementActionPreviewSize(button: HTMLButtonElement) {
  const dragHandle = button
    .closest<HTMLElement>(".scenes-inventory-picker__item")
    ?.querySelector<HTMLElement>(".scenes-inventory-picker__item-drag-handle");
  return dragHandle ? resolveInventoryDragPreviewSize(dragHandle) : undefined;
}

export function resolveInventoryPreviewContentSize({
  previewWidthPx,
  previewHeightPx,
  paddingTopPx,
  paddingRightPx,
  paddingBottomPx,
  paddingLeftPx,
  borderTopPx,
  borderRightPx,
  borderBottomPx,
  borderLeftPx
}: {
  previewWidthPx: number;
  previewHeightPx: number;
  paddingTopPx: number;
  paddingRightPx: number;
  paddingBottomPx: number;
  paddingLeftPx: number;
  borderTopPx: number;
  borderRightPx: number;
  borderBottomPx: number;
  borderLeftPx: number;
}) {
  return {
    width: Math.max(previewWidthPx - paddingLeftPx - paddingRightPx - borderLeftPx - borderRightPx, 1),
    height: Math.max(previewHeightPx - paddingTopPx - paddingBottomPx - borderTopPx - borderBottomPx, 1)
  };
}

function parseCssPixelValue(value: string) {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function resolveDroppedInventoryHotspotBounds({
  normalizedX,
  normalizedY,
  surfaceWidth,
  surfaceHeight,
  previewWidthPx,
  previewHeightPx
}: {
  normalizedX: number;
  normalizedY: number;
  surfaceWidth: number;
  surfaceHeight: number;
  previewWidthPx: number;
  previewHeightPx: number;
}) {
  if (surfaceWidth <= 0 || surfaceHeight <= 0 || previewWidthPx <= 0 || previewHeightPx <= 0) {
    return undefined;
  }

  const width = Math.min(Math.max(previewWidthPx / surfaceWidth, MIN_HOTSPOT_SIZE), 1);
  const height = Math.min(Math.max(previewHeightPx / surfaceHeight, MIN_HOTSPOT_SIZE), 1);
  const x = Math.min(Math.max(normalizedX - width / 2, 0), 1 - width);
  const y = Math.min(Math.max(normalizedY - height / 2, 0), 1 - height);

  return {
    x,
    y,
    width,
    height
  };
}

function setTransparentInventoryDragImage(dataTransfer: DataTransfer, dragHandle: HTMLElement) {
  if (typeof document === "undefined") {
    return undefined;
  }

  const sourceImage = dragHandle.querySelector<HTMLImageElement>("img.asset-preview__media");
  if (sourceImage && (sourceImage.currentSrc || sourceImage.src)) {
    const bounds = sourceImage.getBoundingClientRect();
    const width = Math.max(Math.round(bounds.width), 1);
    const height = Math.max(Math.round(bounds.height), 1);
    const sourceImageStyles = window.getComputedStyle(sourceImage);
    const sourceBorderRadius = sourceImageStyles.borderRadius;
    const dragImageFrame = document.createElement("div");
    dragImageFrame.dataset.inventoryDragImageFrame = "true";
    Object.assign(dragImageFrame.style, {
      position: "fixed",
      left: "-10000px",
      top: "-10000px",
      width: `${width}px`,
      height: `${height}px`,
      display: "block",
      overflow: "hidden",
      margin: "0",
      padding: "0",
      border: "0",
      borderRadius: sourceBorderRadius,
      background: "transparent",
      boxShadow: "none",
      pointerEvents: "none"
    });

    const dragImage = document.createElement("img");
    dragImage.src = sourceImage.currentSrc || sourceImage.src;
    dragImage.alt = "";
    dragImage.draggable = false;
    dragImage.dataset.inventoryDragImage = "true";
    Object.assign(dragImage.style, {
      display: sourceImageStyles.display,
      width: `${width}px`,
      height: `${height}px`,
      margin: "0",
      minWidth: `${width}px`,
      minHeight: `${height}px`,
      maxWidth: `${width}px`,
      maxHeight: `${height}px`,
      paddingTop: sourceImageStyles.paddingTop,
      paddingRight: sourceImageStyles.paddingRight,
      paddingBottom: sourceImageStyles.paddingBottom,
      paddingLeft: sourceImageStyles.paddingLeft,
      border: "0",
      borderRadius: sourceBorderRadius,
      background: "transparent",
      boxShadow: "none",
      boxSizing: sourceImageStyles.boxSizing,
      objectFit: sourceImageStyles.objectFit,
      objectPosition: sourceImageStyles.objectPosition,
      imageRendering: sourceImageStyles.imageRendering,
      pointerEvents: "none"
    });
    dragImageFrame.appendChild(dragImage);
    document.body.appendChild(dragImageFrame);
    dataTransfer.setDragImage(dragImageFrame, width / 2, height / 2);
    return () => {
      dragImageFrame.remove();
    };
  }

  const fallbackPreview = dragHandle.querySelector<HTMLElement>(".asset-preview__media, .asset-preview") ?? dragHandle;
  const fallbackBounds = fallbackPreview.getBoundingClientRect();
  dataTransfer.setDragImage(
    fallbackPreview,
    Math.max(fallbackBounds.width / 2, 0),
    Math.max(fallbackBounds.height / 2, 0)
  );
  return undefined;
}

function shouldStartFloatingWindowDrag(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return !target.closest(
    "input, textarea, select, button, option, label, [contenteditable='true'], [role='button'], [role='textbox'], [data-floating-window-drag-ignore='true']"
  );
}

function shouldIgnoreDeleteHotspotShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}

function resolveSubtitleImportStatusMessage(importedTrackCount: number, failedFileCount: number): string {
  if (importedTrackCount === 0) {
    return failedFileCount > 0
      ? `No subtitle tracks were imported. ${failedFileCount} file${failedFileCount === 1 ? "" : "s"} failed.`
      : "No subtitle tracks were imported.";
  }

  const segments = [
    `Imported ${importedTrackCount} subtitle track${importedTrackCount === 1 ? "" : "s"}.`
  ];
  if (failedFileCount > 0) {
    segments.push(`${failedFileCount} file${failedFileCount === 1 ? "" : "s"} failed.`);
  }

  return segments.join(" ");
}

function JsonField({
  label,
  value,
  tooltip,
  labelClassName,
  onCommit
}: {
  label: string;
  value: string;
  tooltip?: string;
  labelClassName?: string;
  onCommit: (nextValue: string) => void;
}) {
  return (
    <label title={tooltip}>
      {labelClassName ? <span className={labelClassName}>{label}</span> : label}
      <textarea defaultValue={value} onBlur={(event) => onCommit(event.target.value)} title={tooltip} />
    </label>
  );
}

function parseJson<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function resolveDeleteSceneBlockedMessage(
  sceneName: string,
  blockedReason: RemoveSceneFromProjectResult["blockedReason"]
): string {
  if (blockedReason === "replacement-scene-not-found") {
    return `Could not delete ${sceneName} because the selected replacement scene is no longer available.`;
  }

  return `Could not delete ${sceneName} because it is no longer present in the project.`;
}

function resolveDeleteSceneStatusMessage(
  sceneName: string,
  deletion: RemoveSceneFromProjectResult,
  replacementSceneName: string | undefined,
  valid: boolean,
  issueCount: number
): string {
  const segments = [`Deleted ${sceneName}.`];

  if (deletion.strategy.mode === "rewire" && replacementSceneName) {
    segments.push(`Rewired scene references to ${replacementSceneName}.`);
  } else {
    segments.push("Cleaned references to the deleted scene.");
  }

  if (deletion.removedSubtitleTrackIds.length > 0) {
    segments.push(
      `Removed ${deletion.removedSubtitleTrackIds.length} subtitle track${
        deletion.removedSubtitleTrackIds.length === 1 ? "" : "s"
      }.`
    );
  }

  if (deletion.strategy.mode === "cleanup" && deletion.referenceSummary.isStartScene) {
    segments.push("Choose a new start scene to clear the validation error.");
  }

  if (!valid) {
    segments.push(`Project now has ${issueCount} validation issue(s).`);
  }

  return segments.join(" ");
}

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  buildHotspotPickupFlag,
  buildHotspotPlacementFlag,
  resolveAssetVariant,
  resolveHotspotInventoryAction,
  resolvePlacedInventoryHotspotInstance,
  type Condition,
  type Effect,
  type Hotspot,
  type ProjectBundle,
  type ValidationIssue,
  validateProject
} from "@mage2/schema";
import { AssetsPanel } from "./panels/AssetsPanel";
import { DialoguePanel } from "./panels/DialoguePanel";
import { InventoryPanel } from "./panels/InventoryPanel";
import { LocalizationPanel } from "./panels/LocalizationPanel";
import { ScenesPanel } from "./panels/ScenesPanel";
import { WorldPanel } from "./panels/WorldPanel";
import { PlaytestPanel } from "./PlaytestPanel";
import { useDialogs } from "./dialogs";
import {
  getIssueHint,
  resolveIssueEntityLabel,
  resolveIssueNavigation,
  resolveSceneNavigationTarget,
  resolveVisibleIssuesForTab
} from "./issue-navigation";
import type { EditorNavigationTarget } from "./navigation-target";
import { cloneProject } from "./project-helpers";
import {
  type RecentProjectSummary,
  mergeRecentProjects,
  removeRecentProjectEntry,
  resolveProjectName,
  upsertRecentProjects
} from "./recent-project-list";
import { isRedoShortcut, isSaveShortcut, isUndoShortcut } from "./keyboard-shortcuts";
import { type EditorTab, useEditorStore } from "./store";
import { formatEditorWindowTitle } from "./window-title";
import {
  parseEditorAutomationCommand,
  type EditorAutomationCommand,
  type EditorAutomationHotspotAction
} from "./automation-commands";

const TABS: Array<{ id: EditorTab; label: string }> = [
  { id: "world", label: "World" },
  { id: "scenes", label: "Scenes" },
  { id: "dialogue", label: "Dialogue" },
  { id: "inventory", label: "Inventory" },
  { id: "localization", label: "Localization" },
  { id: "assets", label: "Assets" },
  { id: "playtest", label: "Playtest" }
];

const TAB_TOOLTIPS: Record<EditorTab, string> = {
  assets: "Review background, scene-audio, and inventory assets after creating them from their owning editor tabs.",
  world: "Arrange locations on the world map and manage the scenes inside each location.",
  scenes: "Edit scene media, upload background and scene-audio assets, hotspots, and scene-level wiring.",
  dialogue: "Write dialogue lines and player replies, then start them from scene hotspots.",
  inventory: "Create inventory items, assign item art, and edit the player-facing text tied to each item.",
  localization: "Manage locale coverage and edit localized strings and media variants in one place.",
  playtest: "Run the current project in the editor to test hotspots, dialogue, and state."
};

interface InitialLaunchOptions {
  projectDir?: string;
  tab?: EditorTab;
}

export function App() {
  const {
    project,
    projectDir,
    hasUnsavedChanges,
    canUndo,
    canRedo,
    activeTab,
    selectedSceneId,
    setProjectContext,
    updateProject,
    undoProject,
    redoProject,
    markProjectSaved,
    clearProjectContext,
    setActiveTab,
    setSelectedLocationId,
    setSelectedSceneId,
    setSelectedDialogueId,
    setSelectedHotspotId,
    setSelectedDialogueNodeId,
    setSelectedInventoryItemId,
    setSelectedAssetId,
    setSelectedTextId,
    setLocalizationLocale,
    setPlaytestLocale,
    setLocalizationSection
  } = useEditorStore();
  const [busyLabel, setBusyLabel] = useState<string>();
  const [statusMessage, setStatusMessage] = useState("Create or open a project folder to begin.");
  const [newProjectName, setNewProjectName] = useState("");
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [hotspotInspectorOpenRequest, setHotspotInspectorOpenRequest] = useState(0);
  const [recentProjects, setRecentProjects] = useState<RecentProjectSummary[]>(() => getInitialRecentProjects());
  const [initialLaunchOptions] = useState(() => getInitialLaunchOptions());
  const fileMenuId = useId();
  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const fileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeMenuItemRef = useRef<HTMLButtonElement | null>(null);
  const exportMenuItemRef = useRef<HTMLButtonElement | null>(null);
  const lastAuthoringTabRef = useRef<EditorTab>("scenes");
  const hasEditorApi = typeof window.editorApi !== "undefined";
  const hasHandledInitialLaunchRef = useRef(false);
  const dialogs = useDialogs();

  async function withBusy<T>(label: string, action: () => Promise<T>): Promise<T | undefined> {
    try {
      setBusyLabel(label);
      return await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`${label} failed: ${message}`);
      return undefined;
    } finally {
      setBusyLabel(undefined);
    }
  }

  function mutateProject(mutator: (draft: ProjectBundle) => void) {
    const currentProject = useEditorStore.getState().project;
    if (!currentProject) {
      return;
    }

    const nextProject = cloneProject(currentProject);
    mutator(nextProject);
    updateProject(nextProject);
  }

  function replaceSavedProject(project: ProjectBundle) {
    markProjectSaved(project, { clearHistory: true });
  }

  async function rememberRecentProjectEntry(targetProjectDir: string, projectName?: string) {
    try {
      const nextRecentProjects = await window.editorApi.rememberRecentProject(targetProjectDir, projectName);
      setRecentProjects(nextRecentProjects);
    } catch {
      setRecentProjects((currentProjects) => upsertRecentProjects(currentProjects, targetProjectDir, projectName));
    }
  }

  async function forgetRecentProjectEntry(targetProjectDir: string) {
    try {
      const nextRecentProjects = await window.editorApi.forgetRecentProject(targetProjectDir);
      setRecentProjects(nextRecentProjects);
    } catch {
      setRecentProjects((currentProjects) => removeRecentProjectEntry(currentProjects, targetProjectDir));
    }
  }

  async function openProjectDirectory(
    targetProjectDir: string,
    source: "picker" | "recent" | "launch" = "picker",
    nextActiveTab?: EditorTab
  ) {
    const loadedProject = await withBusy(
      source === "recent" ? "Opening recent project" : source === "launch" ? "Opening launch project" : "Loading project",
      () => window.editorApi.loadProject(targetProjectDir)
    );
    if (!loadedProject) {
      if (source === "recent" || source === "launch") {
        await forgetRecentProjectEntry(targetProjectDir);
        setStatusMessage(
          source === "launch"
            ? "Could not open the project requested on launch. It has been removed from the recent list."
            : "Could not open that recent project. It has been removed from the recent list."
        );
      }
      return;
    }

    setProjectContext(loadedProject, targetProjectDir);
    if (nextActiveTab) {
      setActiveTab(nextActiveTab);
    }
    await rememberRecentProjectEntry(targetProjectDir, loadedProject.manifest.projectName);
    setStatusMessage(
      source === "recent"
        ? `Reopened ${loadedProject.manifest.projectName}`
        : source === "launch"
          ? `Opened ${loadedProject.manifest.projectName}${nextActiveTab ? ` on ${resolveTabLabel(nextActiveTab)}` : ""}.`
        : `Loaded ${loadedProject.manifest.projectName}`
    );
  }

  useEffect(() => {
    document.title = formatEditorWindowTitle(project?.manifest.projectName, hasUnsavedChanges);
  }, [hasUnsavedChanges, project?.manifest.projectName]);

  useEffect(() => {
    if (activeTab !== "playtest") {
      lastAuthoringTabRef.current = activeTab;
    }
  }, [activeTab]);

  const handleExitPlaytest = useCallback(() => {
    const nextTab = lastAuthoringTabRef.current === "playtest" ? "scenes" : lastAuthoringTabRef.current;
    setActiveTab(nextTab);
    setStatusMessage(`Returned to ${resolveTabLabel(nextTab)}.`);
  }, [setActiveTab]);

  useEffect(() => {
    if (!hasEditorApi) {
      return;
    }

    let cancelled = false;

    async function initializeRecentProjects() {
      let persistedRecentProjects: RecentProjectSummary[] = [];

      try {
        persistedRecentProjects = await window.editorApi.getRecentProjects();
      } catch {
        persistedRecentProjects = [];
      }

      if (cancelled) {
        return;
      }

      setRecentProjects((currentProjects) => mergeRecentProjects(currentProjects, persistedRecentProjects));
    }

    void initializeRecentProjects();

    return () => {
      cancelled = true;
    };
  }, [hasEditorApi]);

  useEffect(() => {
    if (!hasEditorApi || hasHandledInitialLaunchRef.current) {
      return;
    }

    hasHandledInitialLaunchRef.current = true;
    if (!initialLaunchOptions.projectDir) {
      return;
    }

    void openProjectDirectory(initialLaunchOptions.projectDir, "launch", resolveLaunchTab(initialLaunchOptions.tab));
  }, [hasEditorApi, initialLaunchOptions]);

  useEffect(() => {
    if (!window.editorAutomation) {
      return;
    }

    return window.editorAutomation.onCommand((rawCommand) => handleAutomationCommand(rawCommand));
  });

  useEffect(() => {
    if (!hasEditorApi) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || document.querySelector(".dialog-overlay")) {
        return;
      }

      if (!project || busyLabel) {
        return;
      }

      if (isUndoShortcut(event)) {
        event.preventDefault();
        if (canUndo) {
          undoProject();
        }
        return;
      }

      if (isRedoShortcut(event)) {
        event.preventDefault();
        if (canRedo) {
          redoProject();
        }
        return;
      }

      if (!isSaveShortcut(event)) {
        return;
      }

      event.preventDefault();
      if (!projectDir || !hasUnsavedChanges) {
        return;
      }

      void saveCurrentProject();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [busyLabel, canRedo, canUndo, hasEditorApi, hasUnsavedChanges, project, projectDir, redoProject, undoProject]);

  useEffect(() => {
    if (!project || !projectDir) {
      setIsFileMenuOpen(false);
    }
  }, [project, projectDir]);

  useEffect(() => {
    if (!isFileMenuOpen) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      closeMenuItemRef.current?.focus();
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !fileMenuRef.current?.contains(event.target)) {
        setIsFileMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setIsFileMenuOpen(false);
      fileMenuButtonRef.current?.focus();
    };

    const handleBlur = () => {
      setIsFileMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("blur", handleBlur);
    };
  }, [isFileMenuOpen]);

  async function handleCreateProject() {
    if (!hasEditorApi) {
      return;
    }
    const chosenDirectory = await dialogs.chooseDirectory({
      title: "Create Project",
      description: "Browse to the folder that should hold your new project files.",
      initialPath: projectDir ?? recentProjects[0]?.projectDir,
      confirmLabel: "Create Project Here",
      allowCreateDirectory: true
    });
    if (!chosenDirectory) {
      return;
    }

    const projectName = resolveProjectName(newProjectName, chosenDirectory);

    const createdProject = await withBusy("Creating project", () =>
      window.editorApi.createProject(chosenDirectory, projectName)
    );
    if (!createdProject) {
      return;
    }

    setProjectContext(createdProject, chosenDirectory);
    await rememberRecentProjectEntry(chosenDirectory, createdProject.manifest.projectName);
    setStatusMessage(`Created project in ${chosenDirectory}`);
  }

  async function handleOpenProject() {
    if (!hasEditorApi) {
      return;
    }
    const chosenDirectory = await dialogs.chooseDirectory({
      title: "Open Project",
      description: "Browse to an existing MAGE2 project folder and open it in the editor.",
      initialPath: projectDir ?? recentProjects[0]?.projectDir,
      confirmLabel: "Open This Project",
      directoryRequirement: "project"
    });
    if (!chosenDirectory) {
      return;
    }

    await openProjectDirectory(chosenDirectory);
  }

  async function saveCurrentProject(): Promise<ProjectBundle | undefined> {
    if (!hasEditorApi || !project || !projectDir) {
      return undefined;
    }

    const result = await withBusy("Saving project", () =>
      window.editorApi.saveProject(projectDir, project)
    );
    if (!result) {
      return undefined;
    }

    markProjectSaved(result.project);
    setStatusMessage(
      result.validationReport.valid
        ? "Project saved successfully."
        : `Project saved with ${result.validationReport.issues.length} validation issue(s).`
    );
    return result.project;
  }

  async function handleSaveProject() {
    if (!hasUnsavedChanges || busyLabel) {
      return;
    }

    await saveCurrentProject();
  }

  async function handleCloseProject() {
    if (!project || !projectDir) {
      return;
    }

    if (hasUnsavedChanges) {
      const closeAction = await dialogs.confirmCloseProject(project.manifest.projectName);
      if (closeAction === "cancel") {
        setStatusMessage(`Kept ${project.manifest.projectName} open.`);
        return;
      }

      if (closeAction === "save") {
        const savedProject = await saveCurrentProject();
        if (!savedProject) {
          return;
        }
      }
    }

    const closingProjectName = project.manifest.projectName;
    setIsFileMenuOpen(false);
    clearProjectContext();
    setStatusMessage(`Closed ${closingProjectName}.`);
  }

  async function handleExportProject() {
    if (!hasEditorApi || !project || !projectDir) {
      return;
    }

    const savedProject = await saveCurrentProject();
    if (!savedProject) {
      return;
    }

    const result = await withBusy("Exporting runtime build", () =>
      window.editorApi.exportProject(projectDir, savedProject)
    );
    if (!result) {
      return;
    }

    setStatusMessage(
      `Exported runtime build to ${result.outputDirectory} (${result.validationReport.issues.length} validation issue(s)).`
    );
  }

  async function handleFileMenuAction(action: () => Promise<void>) {
    setIsFileMenuOpen(false);
    await action();
  }

  function focusFileMenuItem(index: number) {
    const items = [closeMenuItemRef.current, exportMenuItemRef.current];
    items[(index + items.length) % items.length]?.focus();
  }

  function handleFileMenuTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsFileMenuOpen(true);
      return;
    }

    if (event.key === "Escape" && isFileMenuOpen) {
      event.preventDefault();
      setIsFileMenuOpen(false);
    }
  }

  function handleFileMenuItemKeyDown(index: number, event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusFileMenuItem(index + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusFileMenuItem(index - 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusFileMenuItem(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusFileMenuItem(1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsFileMenuOpen(false);
      fileMenuButtonRef.current?.focus();
    }
  }

  function handleNavigateToIssueTarget(target: EditorNavigationTarget | undefined) {
    if (!target) {
      return;
    }

    setActiveTab(target.tab);
    setSelectedLocationId(target.locationId);
    setSelectedSceneId(target.sceneId);
    setSelectedHotspotId(target.hotspotId);
    setSelectedDialogueId(target.dialogueId);
    setSelectedDialogueNodeId(target.dialogueNodeId);
    setSelectedInventoryItemId(target.inventoryItemId);
    setSelectedAssetId(target.assetId);
    setSelectedTextId(target.textId);
    if (target.tab === "localization") {
      setLocalizationLocale(target.locale);
      if (target.localizationSection) {
        setLocalizationSection(target.localizationSection);
      }
    } else if (target.tab === "playtest") {
      setPlaytestLocale(target.locale);
    }
    setStatusMessage(`Navigated to ${target.label}`);
  }

  function handleTabSelect(tabId: EditorTab) {
    setActiveTab(tabId);
  }

  async function handleAutomationCommand(rawCommand: unknown): Promise<unknown> {
    const command = parseEditorAutomationCommand(rawCommand);

    switch (command.command) {
      case "ping":
        return { ok: true, app: "MAGE2 Editor" };
      case "getState":
        return resolveEditorAutomationState(statusMessage);
      case "listHotspots":
        return resolveEditorAutomationHotspots(requireCurrentProject(command), command.sceneId);
      case "listInventoryItems":
        return resolveEditorAutomationInventoryItems(requireCurrentProject(command));
      case "openProject":
        await openProjectDirectory(command.projectDir, "launch", command.tab);
        await waitForAutomationUpdate();
        return resolveEditorAutomationState(statusMessage);
      case "selectTab":
        setActiveTab(command.tab);
        await waitForAutomationUpdate();
        return resolveEditorAutomationState(statusMessage);
      case "selectScene":
        requireCurrentProject(command);
        setSelectedSceneId(command.sceneId);
        setStatusMessage(`Automation selected scene ${command.sceneId}.`);
        await waitForAutomationUpdate();
        return resolveEditorAutomationState(statusMessage);
      case "selectHotspot":
        requireCurrentProject(command);
        setSelectedHotspotId(command.hotspotId);
        setStatusMessage(command.hotspotId ? `Automation selected hotspot ${command.hotspotId}.` : "Automation cleared hotspot selection.");
        await waitForAutomationUpdate();
        return resolveEditorAutomationState(statusMessage);
      case "setHotspotInventoryAction":
        applyAutomationHotspotInventoryCommand(command);
        await waitForAutomationUpdate();
        return resolveEditorAutomationState(statusMessage);
      case "editor.undo":
        requireCurrentProject(command);
        undoProject();
        await waitForAutomationUpdate();
        return resolveEditorAutomationHotspots(requireCurrentProject(command));
      case "editor.redo":
        requireCurrentProject(command);
        redoProject();
        await waitForAutomationUpdate();
        return resolveEditorAutomationHotspots(requireCurrentProject(command));
      case "editor.openHotspotInspector": {
        const result = openAutomationHotspotInspector(command);
        await waitForAutomationUpdate();
        return {
          ...resolveEditorAutomationState(statusMessage),
          hotspotInspector: result
        };
      }
      case "editor.selectHotspotActionItem":
        applyAutomationHotspotActionItemCommand(command);
        await waitForAutomationUpdate();
        return resolveEditorAutomationHotspots(requireCurrentProject(command));
      case "editor.setPlacedObjectGeometry":
        applyAutomationPlacedObjectGeometryCommand(command);
        await waitForAutomationUpdate();
        return resolveEditorAutomationHotspots(requireCurrentProject(command));
      case "editor.assertPlacedObjectExists":
        return assertAutomationPlacedObjectExists(requireCurrentProject(command), command.dropTargetHotspotId, command.itemId);
      case "enterPlaytest":
        setActiveTab("playtest");
        await waitForAutomationUpdate();
        return resolveEditorAutomationState(statusMessage);
      case "playtest.getState":
        return requirePlaytestAutomation(command).getState();
      case "playtest.reset": {
        const playtest = requirePlaytestAutomation(command);
        playtest.reset();
        await waitForAutomationUpdate();
        return requirePlaytestAutomation(command).getState();
      }
      case "playtest.clickHotspot": {
        const playtest = requirePlaytestAutomation(command);
        playtest.clickHotspot(command.hotspotId);
        await waitForAutomationUpdate();
        return requirePlaytestAutomation(command).getState();
      }
      case "playtest.selectInventoryItem": {
        const playtest = requirePlaytestAutomation(command);
        playtest.selectInventoryItem(command.itemId);
        await waitForAutomationUpdate();
        return requirePlaytestAutomation(command).getState();
      }
      case "playtest.assertPlacedItemVisible": {
        const playtest = requirePlaytestAutomation(command);
        return playtest.assertPlacedItemVisible(command.hotspotId, command.itemId);
      }
    }
  }

  function requireCurrentProject(command: EditorAutomationCommand): ProjectBundle {
    const currentProject = useEditorStore.getState().project;
    if (!currentProject) {
      throw new Error(`Cannot run '${command.command}' without an open project.`);
    }

    return currentProject;
  }

  function requirePlaytestAutomation(command: EditorAutomationCommand) {
    const playtestAutomation = window.__mage2PlaytestAutomation;
    if (!playtestAutomation) {
      throw new Error(`Cannot run '${command.command}' because Playtest is not active yet.`);
    }

    return playtestAutomation;
  }

  function openAutomationHotspotInspector(command: Extract<EditorAutomationCommand, { command: "editor.openHotspotInspector" }>) {
    const currentProject = requireCurrentProject(command);
    const targetHotspotId = command.hotspotId ?? useEditorStore.getState().selectedHotspotId;
    if (!targetHotspotId) {
      throw new Error(`Command '${command.command}' requires hotspotId or a selected hotspot.`);
    }

    const target = resolveAutomationHotspotTarget(currentProject, targetHotspotId);
    setSelectedLocationId(target.scene.locationId);
    setSelectedSceneId(target.scene.id);
    setSelectedHotspotId(target.hotspot.id);
    setActiveTab("scenes");
    setHotspotInspectorOpenRequest((request) => request + 1);
    setStatusMessage(`Automation opened hotspot inspector for ${target.hotspot.id}.`);

    return {
      opened: true,
      hotspotId: target.hotspot.id,
      sceneId: target.scene.id
    };
  }

  function applyAutomationHotspotInventoryCommand(command: Extract<EditorAutomationCommand, { command: "setHotspotInventoryAction" }>) {
    const currentProject = requireCurrentProject(command);
    const targetScene = currentProject.scenes.items.find((scene) =>
      scene.hotspots.some((hotspot) => hotspot.id === command.hotspotId)
    );
    const targetHotspot = targetScene?.hotspots.find((hotspot) => hotspot.id === command.hotspotId);
    if (!targetScene || !targetHotspot) {
      throw new Error(`Hotspot '${command.hotspotId}' was not found.`);
    }

    if (command.action !== "none" && !command.itemId) {
      throw new Error(`Command '${command.command}' requires itemId when action is '${command.action}'.`);
    }

    mutateProject((draft) => {
      const draftHotspot = draft.scenes.items
        .find((scene) => scene.id === targetScene.id)
        ?.hotspots.find((hotspot) => hotspot.id === command.hotspotId);
      if (!draftHotspot) {
        return;
      }

      applyAutomationHotspotInventoryAction(draftHotspot, command.action, command.itemId ?? "");
    });

    setSelectedSceneId(targetScene.id);
    setSelectedHotspotId(command.hotspotId);
    setActiveTab("scenes");
    setStatusMessage(`Automation set ${command.action} on hotspot ${command.hotspotId}.`);
  }

  function applyAutomationHotspotActionItemCommand(
    command: Extract<EditorAutomationCommand, { command: "editor.selectHotspotActionItem" }>
  ) {
    const currentProject = requireCurrentProject(command);
    const targetScene = currentProject.scenes.items.find((scene) =>
      scene.hotspots.some((hotspot) => hotspot.id === command.hotspotId)
    );
    const targetHotspot = targetScene?.hotspots.find((hotspot) => hotspot.id === command.hotspotId);
    if (!targetScene || !targetHotspot) {
      throw new Error(`Hotspot '${command.hotspotId}' was not found.`);
    }

    mutateProject((draft) => {
      const draftHotspot = draft.scenes.items
        .find((scene) => scene.id === targetScene.id)
        ?.hotspots.find((hotspot) => hotspot.id === command.hotspotId);
      if (!draftHotspot) {
        return;
      }

      applyAutomationHotspotInventoryAction(draftHotspot, "placeItem", command.itemId);
    });

    setSelectedSceneId(targetScene.id);
    setSelectedHotspotId(command.hotspotId);
    setActiveTab("scenes");
    setStatusMessage(`Automation selected action item ${command.itemId} on hotspot ${command.hotspotId}.`);
  }

  function applyAutomationPlacedObjectGeometryCommand(
    command: Extract<EditorAutomationCommand, { command: "editor.setPlacedObjectGeometry" }>
  ) {
    const currentProject = requireCurrentProject(command);
    const target = resolveAutomationPlacedObjectTarget(currentProject, command);

    mutateProject((draft) => {
      const draftScene = draft.scenes.items.find((scene) => scene.id === target.scene.id);
      const draftHotspot = draftScene?.hotspots.find((hotspot) => hotspot.id === target.instance.dropTargetHotspotId);
      if (!draftHotspot) {
        return;
      }

      draftHotspot.placedInventoryGeometry = {
        x: command.geometry.x,
        y: command.geometry.y,
        width: command.geometry.width,
        height: command.geometry.height,
        polygon: command.geometry.polygon
      };
    });

    setSelectedSceneId(target.scene.id);
    setSelectedHotspotId(target.instance.dropTargetHotspotId);
    setActiveTab("scenes");
    setStatusMessage(`Automation updated placed object ${target.instance.id}.`);
  }

  function assertAutomationPlacedObjectExists(project: ProjectBundle, dropTargetHotspotId: string, itemId: string) {
    const target = resolveAutomationPlacedObjectTarget(project, { dropTargetHotspotId, itemId });
    return {
      placedObject: {
        id: target.instance.id,
        itemId: target.instance.itemId,
        dropTargetHotspotId: target.instance.dropTargetHotspotId,
        sourceHotspotId: target.instance.sourceHotspotId,
        geometry: {
          x: target.instance.hotspot.x,
          y: target.instance.hotspot.y,
          width: target.instance.hotspot.width,
          height: target.instance.hotspot.height,
          polygon: target.instance.hotspot.polygon
        }
      },
      dropTargetHotspot: serializeAutomationHotspot(target.scene, target.dropTargetHotspot, "authored")
    };
  }

  if (!hasEditorApi) {
    return (
      <main className="landing">
        <div className="landing__card">
          <p className="eyebrow">MAGE2</p>
          <h1>Editor bridge unavailable</h1>
          <p>
            The React UI loaded, but the Electron preload bridge did not. Launch the app through the desktop
            shortcut or run <code>D:\Disk\Dev\MAGE2\launch-editor.cmd</code> instead of opening the HTML directly.
          </p>
        </div>
      </main>
    );
  }

  if (!project || !projectDir) {
    return (
      <div className="app-shell app-shell--landing">
        <header className="titlebar-shell titlebar-shell--landing">
          <div className="titlebar-shell__inner titlebar-shell__inner--landing">
            <div className="titlebar-shell__identity" title="MAGE2 Editor">
              <h1 className="titlebar-shell__title">MAGE2 Editor</h1>
            </div>
          </div>
        </header>

        <main className="landing">
          <div className="landing__card">
            <p className="eyebrow">MAGE2</p>
            <h1>Full-motion adventure editor</h1>
            <p>
              Build locations, timed hotspots, dialogue graphs, inventory conditions, and static runtime
              exports from one project folder.
            </p>
            <label>
              <span className="field-label--inset">Project Name</span>
              <input
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="My Project"
                title="Name used for the project manifest and editor header. Leave it blank to use the chosen folder name."
              />
            </label>
            <p className="muted">If left blank, the selected folder name will be used.</p>
            <div className="landing__actions">
              <button
                type="button"
                onClick={handleCreateProject}
                title="Create a new project structure inside a folder you choose."
              >
                New Project
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={handleOpenProject}
                title="Open an existing project folder from disk."
              >
                Open Project
              </button>
            </div>
            {recentProjects.length > 0 ? (
              <section className="recent-projects">
                <div className="recent-projects__header">
                  <h2>Recent Projects</h2>
                  <p className="muted">The last five projects are remembered here, even after rebuilding the app.</p>
                </div>
                <div className="recent-projects__list">
                  {recentProjects.map((recentProject) => (
                    <button
                      key={recentProject.projectDir}
                      type="button"
                      className="recent-project"
                      onClick={() => void openProjectDirectory(recentProject.projectDir, "recent")}
                      title={recentProject.projectDir}
                    >
                      <span className="recent-project__name">{recentProject.projectName}</span>
                      <span className="recent-project__path">{recentProject.projectDir}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

  const validationReport = validateProject(project);
  const visibleValidationIssues = resolveVisibleIssuesForTab(project, validationReport.issues, activeTab);
  const hasProjectIssues = validationReport.issues.length > 0;
  const shouldShowIssuesSidebar = showValidationDetails || visibleValidationIssues.length > 0;
  const isSaveDisabled = !hasUnsavedChanges || Boolean(busyLabel);
  const isUndoDisabled = !canUndo || Boolean(busyLabel);
  const isRedoDisabled = !canRedo || Boolean(busyLabel);
  const isSceneEditorSurface = activeTab === "scenes";
  const activeTabLabel = resolveTabLabel(activeTab);
  const activeScene = project.scenes.items.find((scene) => scene.id === selectedSceneId) ?? project.scenes.items[0];
  const activeSceneAsset = project.assets.assets.find((asset) => asset.id === activeScene?.backgroundAssetId);
  const activeSceneAssetVariant = activeSceneAsset ? resolveAssetVariant(activeSceneAsset, project.manifest.defaultLanguage) : undefined;
  const sceneResolutionLabel =
    activeSceneAssetVariant?.width && activeSceneAssetVariant.height
      ? `${activeSceneAssetVariant.width}x${activeSceneAssetVariant.height}`
      : "No media";
  const sceneAspectLabel =
    activeSceneAssetVariant?.width && activeSceneAssetVariant.height
      ? formatAspectRatio(activeSceneAssetVariant.width, activeSceneAssetVariant.height)
      : "--";
  const sceneSaveStatusLabel = busyLabel ? `${busyLabel}...` : hasUnsavedChanges ? "Unsaved changes" : "Saved";
  const issuesPanelTitle = resolveIssuesPanelTitle(activeTab);
  const issuesPanelSummary = resolveIssuesPanelSummary(
    activeTab,
    visibleValidationIssues.length,
    validationReport.issues.length
  );
  const shellClassName = isSceneEditorSurface
    ? "app-shell app-shell--project app-shell--editor-workbench app-shell--scene-editor"
    : "app-shell app-shell--project app-shell--editor-workbench";

  return (
    <div className={shellClassName}>
      <header className="titlebar-shell">
        <div className="titlebar-shell__inner">
          <div className="titlebar-shell__identity titlebar-shell__identity--scene" title={projectDir}>
            <h1 className="titlebar-shell__title">MAGE2 Editor</h1>
          </div>

          <nav className="scene-screen-tabs" aria-label="Editor screens">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={
                  tab.id === activeTab
                    ? "scene-screen-tabs__tab scene-screen-tabs__tab--active app-region-no-drag"
                    : "scene-screen-tabs__tab app-region-no-drag"
                }
                onClick={() => handleTabSelect(tab.id)}
                title={TAB_TOOLTIPS[tab.id]}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="titlebar-shell__actions app-region-no-drag">
            <div className="titlebar-shell__history-actions" role="toolbar" aria-label="Edit history">
              <button
                type="button"
                className="titlebar-shell__history-button"
                onClick={undoProject}
                disabled={isUndoDisabled}
                aria-label="Undo"
                title={canUndo ? "Undo the last project edit. Shortcut: Ctrl+Z or Cmd+Z." : "No edits to undo."}
              >
                <UndoIcon />
              </button>
              <button
                type="button"
                className="titlebar-shell__history-button"
                onClick={redoProject}
                disabled={isRedoDisabled}
                aria-label="Redo"
                title={canRedo ? "Redo the last undone project edit. Shortcut: Ctrl+Y or Cmd+Shift+Z." : "No edits to redo."}
              >
                <RedoIcon />
              </button>
            </div>

            <button
              type="button"
              className={
                hasUnsavedChanges
                  ? "titlebar-shell__save-button titlebar-shell__save-button--active"
                  : "titlebar-shell__save-button"
              }
              onClick={handleSaveProject}
              disabled={isSaveDisabled}
              title={
                hasUnsavedChanges
                  ? "Write the current project manifest and assets metadata back to disk. Shortcut: Ctrl+S or Cmd+S."
                  : "No unsaved changes to save. Shortcut: Ctrl+S or Cmd+S."
              }
            >
              <SaveIcon />
              <span>Save</span>
            </button>

            <div className="titlebar-menu" ref={fileMenuRef}>
              <button
                ref={fileMenuButtonRef}
                type="button"
                className={isFileMenuOpen ? "titlebar-menu__trigger titlebar-menu__trigger--open" : "titlebar-menu__trigger"}
                aria-haspopup="menu"
                aria-expanded={isFileMenuOpen}
                aria-controls={fileMenuId}
                onClick={() => setIsFileMenuOpen((value) => !value)}
                onKeyDown={handleFileMenuTriggerKeyDown}
                title="Open the file actions menu."
              >
                <span>File</span>
                <ChevronDownIcon />
              </button>

              {isFileMenuOpen ? (
                <div id={fileMenuId} className="titlebar-menu__panel" role="menu" aria-label="File">
                  <button
                    ref={closeMenuItemRef}
                    type="button"
                    className="titlebar-menu__item"
                    role="menuitem"
                    onClick={() => void handleFileMenuAction(handleCloseProject)}
                    onKeyDown={(event) => handleFileMenuItemKeyDown(0, event)}
                    title="Close the current project and return to the welcome screen."
                  >
                    Close Project
                  </button>
                  <button
                    ref={exportMenuItemRef}
                    type="button"
                    className="titlebar-menu__item"
                    role="menuitem"
                    onClick={() => void handleFileMenuAction(handleExportProject)}
                    onKeyDown={(event) => handleFileMenuItemKeyDown(1, event)}
                    title="Save the project and build a static runtime export for play or distribution."
                  >
                    Export Runtime
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="editor-scroll-region">
        <div className={shouldShowIssuesSidebar ? "editor-layout editor-layout--with-issues" : "editor-layout"}>
          <div className="editor-primary">
            <main className="workspace">
              {activeTab === "assets" ? <AssetsPanel project={project} setSavedProject={replaceSavedProject} setStatusMessage={setStatusMessage} setBusyLabel={setBusyLabel} /> : null}
              {activeTab === "world" ? <WorldPanel project={project} mutateProject={mutateProject} /> : null}
              {activeTab === "scenes" ? (
                <ScenesPanel
                  project={project}
                  mutateProject={mutateProject}
                  hotspotInspectorOpenRequest={hotspotInspectorOpenRequest}
                  setStatusMessage={setStatusMessage}
                  setBusyLabel={setBusyLabel}
                />
              ) : null}
              {activeTab === "dialogue" ? (
                <DialoguePanel
                  project={project}
                  mutateProject={mutateProject}
                  onOpenScenesHotspot={(sceneId, hotspotId) => {
                    if (sceneId) {
                      const scene = project.scenes.items.find((entry) => entry.id === sceneId);
                      if (scene) {
                        setSelectedLocationId(scene.locationId);
                      }
                      setSelectedSceneId(sceneId);
                    }
                    setSelectedHotspotId(hotspotId);
                    setActiveTab("scenes");
                    setStatusMessage(
                      hotspotId
                        ? "Opened the hotspot that starts this dialogue."
                        : "Choose a hotspot, then set its Start Dialogue field."
                    );
                  }}
                />
              ) : null}
              {activeTab === "inventory" ? (
                <InventoryPanel
                  project={project}
                  mutateProject={mutateProject}
                  setStatusMessage={setStatusMessage}
                  setBusyLabel={setBusyLabel}
                />
              ) : null}
              {activeTab === "localization" ? (
                <LocalizationPanel
                  project={project}
                  mutateProject={mutateProject}
                  setSavedProject={replaceSavedProject}
                  setStatusMessage={setStatusMessage}
                  setBusyLabel={setBusyLabel}
                />
              ) : null}
              {activeTab === "playtest" ? <PlaytestPanel project={project} onExit={handleExitPlaytest} /> : null}
            </main>
          </div>

          {shouldShowIssuesSidebar ? (
            <aside className="validation-panel issues-sidebar">
              <button
                type="button"
                className={
                  showValidationDetails
                    ? "validation-panel__pin-toggle validation-panel__pin-toggle--active"
                    : "validation-panel__pin-toggle"
                }
                aria-label={showValidationDetails ? "Unpin issues sidebar" : "Pin issues sidebar open"}
                aria-pressed={showValidationDetails}
                onClick={() => setShowValidationDetails((value) => !value)}
                title={
                  showValidationDetails
                    ? "Unpin the issues sidebar. If validation passes, it will collapse again."
                    : "Pin the issues sidebar open."
                }
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 3h8l-1 5 3 3v2h-5v7l-1 1-1-1v-7H6v-2l3-3-1-5Z" fill="currentColor" />
                </svg>
              </button>
              <div className="panel__toolbar validation-panel__header">
                <div>
                  <h3>{issuesPanelTitle}</h3>
                  <p className="muted">
                    {visibleValidationIssues.length > 0
                      ? issuesPanelSummary
                      : hasProjectIssues
                        ? "No issues for this screen. Open World to review the full project list."
                        : "No validation issues detected."}
                  </p>
                </div>
              </div>

              {visibleValidationIssues.length > 0 ? (
                <div className="validation-list">
                  {visibleValidationIssues.map((issue, index) => {
                    const target = resolveIssueNavigation(project, issue);
                    const entityLabel = issue.entityId ? resolveIssueEntityLabel(project, issue, target) : undefined;
                    return (
                      <article
                        key={`${issue.code}-${issue.entityId ?? "global"}-${index}`}
                        className={issue.level === "error" ? "validation-item validation-item--error" : "validation-item validation-item--warning"}
                      >
                        <div className="validation-item__header">
                          <span className={issue.level === "error" ? "validation-tag validation-tag--error" : "validation-tag validation-tag--warning"}>
                            {issue.level}
                          </span>
                          <strong>{issue.code}</strong>
                          {entityLabel ? (
                            <IssueTextLink
                              label={entityLabel}
                              target={target}
                              onNavigate={handleNavigateToIssueTarget}
                              className="validation-item__entity"
                            />
                          ) : null}
                        </div>
                        <p>{renderIssueMessage(project, issue, handleNavigateToIssueTarget)}</p>
                        <p className="muted">{getIssueHint(issue)}</p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="muted">No issues right now.</p>
              )}
            </aside>
          ) : null}
        </div>
      </div>

      <footer className="status-bar status-bar--chrome status-bar--workbench">
        <div className="status-bar__scene-group">
          <span className="status-bar__project-dot" aria-hidden="true" />
          <span>Project: {project.manifest.projectName}</span>
          <span className="status-bar__divider" aria-hidden="true" />
          <span>{sceneSaveStatusLabel}</span>
        </div>
        <div className="status-bar__scene-group status-bar__scene-group--right">
          {isSceneEditorSurface ? (
            <>
              <span>Scene: {activeScene?.name ?? "No scene"}</span>
              <span className="status-bar__divider" aria-hidden="true" />
              <span>{sceneResolutionLabel}</span>
              <span className="status-bar__divider" aria-hidden="true" />
              <span>{sceneAspectLabel}</span>
            </>
          ) : (
            <>
              <span>Screen: {activeTabLabel}</span>
              <span className="status-bar__divider" aria-hidden="true" />
              <span>{busyLabel ? `${busyLabel}...` : statusMessage}</span>
            </>
          )}
        </div>
        <button
          type="button"
          className={hasProjectIssues ? "status-pill status-pill--warn" : "status-pill status-pill--ok"}
          onClick={() => setShowValidationDetails((value) => !value)}
          title={
            hasProjectIssues
              ? "Open or close the validation issues sidebar. World shows the full issue list."
              : "Validation passed. Click to pin the issues sidebar open anyway."
          }
        >
          {hasProjectIssues ? formatIssueCount(validationReport.issues.length) : "Valid"}
        </button>
      </footer>
    </div>
  );
}

function resolveEditorAutomationState(statusMessage: string) {
  const state = useEditorStore.getState();
  const validationReport = state.project ? validateProject(state.project) : undefined;
  return {
    activeTab: state.activeTab,
    projectDir: state.projectDir,
    projectName: state.project?.manifest.projectName,
    hasUnsavedChanges: state.hasUnsavedChanges,
    selectedLocationId: state.selectedLocationId,
    selectedSceneId: state.selectedSceneId,
    selectedHotspotId: state.selectedHotspotId,
    selectedInventoryItemId: state.selectedInventoryItemId,
    statusMessage,
    validation: validationReport
      ? {
          valid: validationReport.valid,
          issueCount: validationReport.issues.length
        }
      : undefined,
    playtest: window.__mage2PlaytestAutomation?.getState()
  };
}

function resolveEditorAutomationInventoryItems(project: ProjectBundle) {
  const defaultStrings = project.strings.byLocale[project.manifest.defaultLanguage] ?? {};
  const assetsById = new Map(project.assets.assets.map((asset) => [asset.id, asset] as const));

  return {
    items: project.inventory.items.map((item) => {
      const asset = item.imageAssetId ? assetsById.get(item.imageAssetId) : undefined;
      return {
        id: item.id,
        name: item.name,
        label: defaultStrings[item.textId] ?? item.name ?? item.id,
        textId: item.textId,
        descriptionTextId: item.descriptionTextId,
        imageAssetId: item.imageAssetId,
        imageAssetName: asset?.name
      };
    })
  };
}

function resolveEditorAutomationHotspots(project: ProjectBundle, sceneId?: string) {
  if (sceneId && !project.scenes.items.some((scene) => scene.id === sceneId)) {
    throw new Error(`Scene '${sceneId}' was not found.`);
  }

  const scenes = sceneId ? project.scenes.items.filter((scene) => scene.id === sceneId) : project.scenes.items;
  const authoredHotspots = scenes.flatMap((scene) =>
    scene.hotspots.map((hotspot) => serializeAutomationHotspot(scene, hotspot, "authored"))
  );
  const placedObjects = scenes.flatMap((scene) =>
    scene.hotspots
      .map((hotspot) => resolvePlacedInventoryHotspotInstance(hotspot, scene.hotspots))
      .filter((instance): instance is NonNullable<typeof instance> => Boolean(instance))
      .map((instance) => ({
        ...serializeAutomationHotspot(scene, instance.hotspot, "placedInventory"),
        itemId: instance.itemId,
        dropTargetHotspotId: instance.dropTargetHotspotId,
        sourceHotspotId: instance.sourceHotspotId
      }))
  );
  const surfaceHotspots = [
    ...scenes.flatMap((scene) =>
      scene.hotspots.map((hotspot) => {
        const action = resolveHotspotInventoryAction(hotspot);
        const surfaceHotspot =
          action.type === "placeItem" && hotspot.inventoryItemId ? { ...hotspot, inventoryItemId: undefined } : hotspot;
        return serializeAutomationHotspot(scene, surfaceHotspot, "authored");
      })
    ),
    ...placedObjects
  ];

  return {
    hotspots: authoredHotspots,
    surfaceHotspots,
    placedObjects
  };
}

function serializeAutomationHotspot(
  scene: ProjectBundle["scenes"]["items"][number],
  hotspot: Hotspot,
  kind: "authored" | "placedInventory"
) {
  const action = resolveHotspotInventoryAction(hotspot);
  return {
    id: hotspot.id,
    kind,
    name: hotspot.name,
    sceneId: scene.id,
    sceneName: scene.name,
    inventoryItemId: hotspot.inventoryItemId,
    placedInventoryItemId: hotspot.placedInventoryItemId,
    requiredItemIds: hotspot.requiredItemIds,
    action: {
      type: action.type,
      itemId: action.itemId,
      completionFlag: action.completionFlag
    },
    timing: {
      startMs: hotspot.startMs,
      endMs: hotspot.endMs,
      mode: hotspot.timingMode
    },
    geometry: {
      x: hotspot.x,
      y: hotspot.y,
      width: hotspot.width,
      height: hotspot.height,
      polygon: hotspot.polygon
    }
  };
}

function resolveAutomationHotspotTarget(project: ProjectBundle, hotspotId: string) {
  for (const scene of project.scenes.items) {
    const hotspot = scene.hotspots.find((entry) => entry.id === hotspotId);
    if (hotspot) {
      return { scene, hotspot };
    }
  }

  throw new Error(`Hotspot '${hotspotId}' was not found.`);
}

function resolveAutomationPlacedObjectTarget(
  project: ProjectBundle,
  selector: {
    placedObjectId?: string;
    dropTargetHotspotId?: string;
    itemId?: string;
  }
) {
  for (const scene of project.scenes.items) {
    for (const dropTargetHotspot of scene.hotspots) {
      const instance = resolvePlacedInventoryHotspotInstance(dropTargetHotspot, scene.hotspots);
      if (!instance) {
        continue;
      }

      const matchesPlacedObjectId = selector.placedObjectId ? instance.id === selector.placedObjectId : true;
      const matchesDropTarget = selector.dropTargetHotspotId
        ? instance.dropTargetHotspotId === selector.dropTargetHotspotId
        : true;
      const matchesItem = selector.itemId ? instance.itemId === selector.itemId : true;
      if (matchesPlacedObjectId && matchesDropTarget && matchesItem) {
        return {
          scene,
          dropTargetHotspot,
          instance
        };
      }
    }
  }

  const selectorDescription = [
    selector.placedObjectId ? `placedObjectId='${selector.placedObjectId}'` : undefined,
    selector.dropTargetHotspotId ? `dropTargetHotspotId='${selector.dropTargetHotspotId}'` : undefined,
    selector.itemId ? `itemId='${selector.itemId}'` : undefined
  ]
    .filter(Boolean)
    .join(", ");
  throw new Error(`Placed inventory object was not found${selectorDescription ? ` (${selectorDescription})` : ""}.`);
}

function waitForAutomationUpdate(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function applyAutomationHotspotInventoryAction(
  hotspot: Hotspot,
  actionType: EditorAutomationHotspotAction,
  itemId: string
) {
  const previousAction = resolveHotspotInventoryAction(hotspot);
  removeAutomationHotspotInventoryActionConvention(hotspot, previousAction);

  if (actionType === "none" || !itemId) {
    delete hotspot.inventoryItemId;
    delete hotspot.placedInventoryItemId;
    delete hotspot.placedInventoryGeometry;
    return;
  }

  if (actionType === "pickupItem") {
    hotspot.inventoryItemId = itemId;
    delete hotspot.placedInventoryItemId;
    delete hotspot.placedInventoryGeometry;
    const completionFlag = buildHotspotPickupFlag(hotspot.id);
    hotspot.conditions = [...hotspot.conditions, { type: "flagEquals", flag: completionFlag, value: false }];
    hotspot.effects = [...hotspot.effects, { type: "addItem", itemId }, { type: "setFlag", flag: completionFlag, value: true }];
    return;
  }

  if (previousAction.type !== "placeItem" || previousAction.itemId !== itemId) {
    delete hotspot.placedInventoryGeometry;
  }

  delete hotspot.inventoryItemId;
  hotspot.placedInventoryItemId = itemId;
  const completionFlag = buildHotspotPlacementFlag(hotspot.id);
  hotspot.requiredItemIds = Array.from(new Set([...hotspot.requiredItemIds, itemId]));
  hotspot.conditions = [...hotspot.conditions, { type: "flagEquals", flag: completionFlag, value: false }];
  hotspot.effects = [...hotspot.effects, { type: "removeItem", itemId }, { type: "setFlag", flag: completionFlag, value: true }];
}

function removeAutomationHotspotInventoryActionConvention(
  hotspot: Hotspot,
  action: ReturnType<typeof resolveHotspotInventoryAction>
) {
  const actionType = action.type;
  if (actionType === "none") {
    return;
  }

  const actionItemId = action.itemId;
  const actionFlag = action.completionFlag;

  hotspot.effects = hotspot.effects.filter((effect) =>
    !isAutomationHotspotInventoryActionEffect(effect, actionType, actionItemId, actionFlag)
  );
  hotspot.conditions = hotspot.conditions.filter((condition) => !isAutomationHotspotInventoryActionCondition(condition, actionFlag));

  if (actionType === "placeItem" && actionItemId) {
    hotspot.requiredItemIds = hotspot.requiredItemIds.filter((currentItemId) => currentItemId !== actionItemId);
  }
}

function isAutomationHotspotInventoryActionEffect(
  effect: Effect,
  actionType: Exclude<EditorAutomationHotspotAction, "none">,
  itemId?: string,
  completionFlag?: string
): boolean {
  if (effect.type === "setFlag") {
    return Boolean(completionFlag && effect.flag === completionFlag);
  }

  if (actionType === "pickupItem") {
    return effect.type === "addItem" && effect.itemId === itemId;
  }

  return effect.type === "removeItem" && effect.itemId === itemId;
}

function isAutomationHotspotInventoryActionCondition(condition: Condition, completionFlag?: string): boolean {
  return Boolean(completionFlag && condition.type === "flagEquals" && condition.flag === completionFlag);
}

function getInitialRecentProjects(): RecentProjectSummary[] {
  const hasEditorApi = typeof window !== "undefined" && typeof window.editorApi !== "undefined";

  if (hasEditorApi) {
    try {
      return window.editorApi.getRecentProjectsSync();
    } catch {
      return [];
    }
  }

  return [];
}

function getInitialLaunchOptions(): InitialLaunchOptions {
  const hasEditorApi = typeof window !== "undefined" && typeof window.editorApi !== "undefined";

  if (hasEditorApi) {
    try {
      return window.editorApi.getLaunchOptionsSync();
    } catch {
      return {};
    }
  }

  return {};
}

function resolveLaunchTab(tab: InitialLaunchOptions["tab"]): EditorTab | undefined {
  return TABS.find((candidate) => candidate.id === tab)?.id;
}

function resolveTabLabel(tab: EditorTab): string {
  return TABS.find((candidate) => candidate.id === tab)?.label ?? tab;
}

function resolveIssuesPanelTitle(tab: EditorTab): string {
  switch (tab) {
    case "world":
      return "All Issues";
    case "assets":
      return "Asset Issues";
    case "scenes":
      return "Scene Issues";
    case "dialogue":
      return "Dialogue Issues";
    case "inventory":
      return "Inventory Issues";
    case "localization":
      return "Localization Issues";
    case "playtest":
      return "Playtest Issues";
  }
}

function resolveIssuesPanelSummary(tab: EditorTab, visibleIssueCount: number, projectIssueCount: number): string {
  if (tab === "world") {
    return `Showing ${formatIssueCount(projectIssueCount)} across the project.`;
  }

  if (visibleIssueCount === projectIssueCount) {
    return `Showing ${formatIssueCount(visibleIssueCount)} for this screen.`;
  }

  return `Showing ${formatIssueCount(visibleIssueCount)} for this screen. World has ${formatIssueCount(projectIssueCount)} total.`;
}

function formatIssueCount(count: number): string {
  return `${count} ${count === 1 ? "issue" : "issues"}`;
}

function formatAspectRatio(width: number, height: number): string {
  const divisor = greatestCommonDivisor(Math.round(width), Math.round(height));
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.max(Math.abs(left), 1);
  let b = Math.max(Math.abs(right), 1);

  while (b > 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

interface IssueTextLinkProps {
  label: string;
  target?: EditorNavigationTarget;
  onNavigate: (target: EditorNavigationTarget | undefined) => void;
  className?: string;
}

function IssueTextLink({ label, target, onNavigate, className }: IssueTextLinkProps) {
  if (!target) {
    return className ? <span className={className}>{label}</span> : <>{label}</>;
  }

  const classes = className ? `issue-link ${className}` : "issue-link";

  return (
    <button
      type="button"
      className={classes}
      onClick={() => onNavigate(target)}
      title={`Open ${target.label} in the editor.`}
    >
      {label}
    </button>
  );
}

function renderIssueMessage(
  project: ProjectBundle,
  issue: ValidationIssue,
  onNavigate: (target: EditorNavigationTarget | undefined) => void
) {
  if (issue.code === "SCENE_UNREACHABLE") {
    const unreachableSceneTarget = resolveSceneNavigationTarget(project, issue.entityId);
    const startSceneTarget = resolveSceneNavigationTarget(project, project.manifest.startSceneId);
    const unreachableSceneLabel = unreachableSceneTarget?.label ?? issue.entityId ?? "Unknown scene";
    const startSceneLabel = startSceneTarget?.label ?? project.manifest.startSceneId;

    return (
      <>
        Scene '
        <IssueTextLink label={unreachableSceneLabel} target={unreachableSceneTarget} onNavigate={onNavigate} />
        ' is unreachable from '
        <IssueTextLink label={startSceneLabel} target={startSceneTarget} onNavigate={onNavigate} />
        '.
      </>
    );
  }

  return issue.message;
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 4h11l3 3v13H5V4Zm2 2v12h10V8.2L15.2 6H7Zm2 0h5v4H9V6Zm0 7h6v4H9v-4Z"
        fill="currentColor"
      />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8.8 6.2 4.9 10l3.9 3.8v-2.6h5.3c2 0 3.4 1.3 3.4 3.2 0 1.9-1.4 3.2-3.4 3.2H9.4v2h4.7c3.2 0 5.6-2.2 5.6-5.2s-2.4-5.2-5.6-5.2H8.8v-3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="m15.2 6.2 3.9 3.8-3.9 3.8v-2.6H9.9c-2 0-3.4 1.3-3.4 3.2 0 1.9 1.4 3.2 3.4 3.2h4.7v2H9.9c-3.2 0-5.6-2.2-5.6-5.2s2.4-5.2 5.6-5.2h5.3v-3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5H7Z" fill="currentColor" />
    </svg>
  );
}

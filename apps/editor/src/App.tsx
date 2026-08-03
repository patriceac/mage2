import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
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
import { FirstProjectChecklist } from "./FirstProjectChecklist";
import { useDialogs } from "./dialogs";
import { resolveFirstProjectChecklist } from "./first-project-checklist";
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
  world: "Arrange locations, review derived cross-location scene transitions, and manage the scenes inside each location.",
  scenes: "Edit scene media, upload background and scene-audio assets, hotspots, and scene-level wiring.",
  dialogue: "Write conversations and reusable text, audio, or video player responses, then assign them from scene hotspots.",
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
    setSelectedResponseGroupId,
    setSelectedResponseEntryId,
    setSelectedInventoryItemId,
    setSelectedAssetId,
    setSelectedTextId,
    setLocalizationLocale,
    setPlaytestLocale,
    setLocalizationSection,
    setDialogueSection
  } = useEditorStore();
  const [busyLabel, setBusyLabel] = useState<string>();
  const [statusMessage, setStatusMessage] = useState("Create or open a project folder to begin.");
  const [newProjectName, setNewProjectName] = useState("");
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [hotspotInspectorOpenRequest, setHotspotInspectorOpenRequest] = useState(0);
  const [dismissedFirstProjectGuideId, setDismissedFirstProjectGuideId] = useState<string>();
  const [recentProjects, setRecentProjects] = useState<RecentProjectSummary[]>(() => getInitialRecentProjects());
  const [initialLaunchOptions] = useState(() => getInitialLaunchOptions());
  const fileMenuId = useId();
  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const fileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeMenuItemRef = useRef<HTMLButtonElement | null>(null);
  const exportMenuItemRef = useRef<HTMLButtonElement | null>(null);
  const lastAuthoringTabRef = useRef<EditorTab>("scenes");
  const nativeCloseHandlerRef = useRef<() => Promise<boolean>>(async () => true);
  const busyOperationRef = useRef<string | undefined>(undefined);
  const hasEditorApi = typeof window.editorApi !== "undefined";
  const hasHandledInitialLaunchRef = useRef(false);
  const dialogs = useDialogs();

  async function withBusy<T>(
    label: string,
    action: () => Promise<T>,
    onError?: (message: string) => void | Promise<void>
  ): Promise<T | undefined> {
    try {
      busyOperationRef.current = label;
      setBusyLabel(label);
      return await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`${label} failed: ${message}`);
      await onError?.(message);
      return undefined;
    } finally {
      if (busyOperationRef.current === label) {
        busyOperationRef.current = undefined;
      }
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

  async function refreshRecentProjects() {
    const nextRecentProjects = await withBusy("Refreshing recent projects", () => window.editorApi.getRecentProjects());
    if (!nextRecentProjects) {
      return;
    }

    setRecentProjects(nextRecentProjects);
    setStatusMessage("Recent projects refreshed.");
  }

  async function revealRecentProjectEntry(event: ReactMouseEvent<HTMLButtonElement>, targetProjectDir: string) {
    event.preventDefault();
    event.stopPropagation();

    try {
      await window.editorApi.revealPath(targetProjectDir);
      setStatusMessage("Revealed project folder.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Could not reveal that folder: ${message}`);
    }
  }

  async function removeRecentProject(event: ReactMouseEvent<HTMLButtonElement>, targetProjectDir: string) {
    event.preventDefault();
    event.stopPropagation();
    await forgetRecentProjectEntry(targetProjectDir);
    setStatusMessage("Removed project from recents.");
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
    if (!hasEditorApi) {
      return;
    }

    return window.editorApi.onCloseRequested(() => nativeCloseHandlerRef.current());
  }, [hasEditorApi]);

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

    const createdProject = await withBusy(
      "Creating project",
      () => window.editorApi.createProject(chosenDirectory, projectName),
      async (message) => {
        const folderIsNotEmpty = /not empty|already contains files|must be empty/i.test(message);
        await dialogs.alert({
          title: folderIsNotEmpty ? "Folder Is Not Empty" : "Project Was Not Created",
          body: (
            <>
              <p>
                {folderIsNotEmpty
                  ? "MAGE2 cannot create a project here because the folder already contains files. Existing files were not changed."
                  : "MAGE2 could not create the project. Nothing was intentionally overwritten."}
              </p>
              <p>{`Details: ${message}`}</p>
            </>
          ),
          confirmLabel: folderIsNotEmpty ? "Choose Another Folder" : "Close",
          tone: folderIsNotEmpty ? "danger" : "default"
        });
      }
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

  async function confirmProjectCanClose(): Promise<boolean> {
    const currentState = useEditorStore.getState();
    const currentProject = currentState.project;
    const currentProjectDir = currentState.projectDir;

    const activeBusyLabel = busyOperationRef.current ?? busyLabel;
    if (activeBusyLabel) {
      setStatusMessage(`Wait for ${activeBusyLabel.toLowerCase()} to finish before closing MAGE2.`);
      return false;
    }

    if (!currentProject || !currentProjectDir || !currentState.hasUnsavedChanges) {
      return true;
    }

    const closeAction = await dialogs.confirmCloseProject(currentProject.manifest.projectName);
    if (closeAction === "cancel") {
      setStatusMessage(`Kept ${currentProject.manifest.projectName} open.`);
      return false;
    }

    if (closeAction === "discard") {
      return true;
    }

    const savedProject = await saveCurrentProject();
    if (savedProject) {
      return true;
    }

    await dialogs.alert({
      title: "Save Failed",
      body: (
        <>
          <p>{`MAGE2 could not save “${currentProject.manifest.projectName}”.`}</p>
          <p>The project remains open, and your unsaved changes are still in the editor.</p>
        </>
      ),
      confirmLabel: "Keep Editing",
      tone: "danger"
    });
    return false;
  }

  nativeCloseHandlerRef.current = confirmProjectCanClose;

  async function handleCloseProject() {
    if (!project || !projectDir) {
      return;
    }

    if (!(await confirmProjectCanClose())) {
      return;
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

    const preflightReport = validateProject(project);
    if (!preflightReport.valid) {
      setShowValidationDetails(true);
      setStatusMessage("Export blocked. Review the project issues and try again.");
      await dialogs.alert({
        title: "Project Is Not Ready to Export",
        body: (
          <p>{`Fix ${preflightReport.issues.length} blocking ${preflightReport.issues.length === 1 ? "issue" : "issues"} before creating a runtime build. No export files were changed.`}</p>
        ),
        confirmLabel: "Review Issues",
        tone: "danger"
      });
      return;
    }

    const savedProject = await saveCurrentProject();
    if (!savedProject) {
      return;
    }

    const result = await withBusy(
      "Exporting runtime build",
      () => window.editorApi.exportProject(projectDir, savedProject),
      async (message) => {
        const unsafeDestination =
          /unsafe|refused|output folder|outside|absolute|traversal|not a recognized MAGE2|contains other files/i.test(
            message
          );
        await dialogs.alert({
          title: unsafeDestination ? "Export Folder Is Unsafe" : "Export Failed",
          body: (
            <>
              <p>
                {unsafeDestination
                  ? "MAGE2 exports only to this project’s reserved build folder. It must be empty or an unchanged build previously created by MAGE2."
                  : "MAGE2 could not create the new runtime build. Any previous build was kept unchanged."}
              </p>
              <p>{`Details: ${message}`}</p>
            </>
          ),
          confirmLabel: "Close",
          tone: "danger"
        });
      }
    );
    if (!result) {
      return;
    }

    setStatusMessage(`Runtime build exported to ${result.outputDirectory}.`);
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
    setSelectedResponseGroupId(target.responseGroupId);
    setSelectedResponseEntryId(target.responseEntryId);
    setSelectedInventoryItemId(target.inventoryItemId);
    setSelectedAssetId(target.assetId);
    setSelectedTextId(target.textId);
    if (target.tab === "dialogue" && target.dialogueSection) {
      setDialogueSection(target.dialogueSection);
    } else if (target.tab === "localization") {
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
              <span className="titlebar-shell__mark" aria-hidden="true">
                M2
              </span>
              <h1 className="titlebar-shell__title">MAGE2 Editor</h1>
            </div>
          </div>
        </header>

        <main className="landing" onDragOver={handleLandingDragOver} onDrop={(event) => void handleLandingDrop(event)}>
          <section className="landing__workspace" aria-labelledby="landing-projects-title">
            <aside className="landing__start-panel" aria-labelledby="landing-projects-title">
              <header className="landing__intro">
                <p className="landing__product">MAGE2 Editor</p>
                <h1 id="landing-projects-title">Projects</h1>
                <p>Create a full-motion adventure project, or reopen an existing one.</p>
              </header>

              <div className="landing__divider" aria-hidden="true" />

              <div className="landing__start-form">
                <label className="landing__field">
                  <span className="field-label--inset">Project name</span>
                  <input
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                    placeholder="Untitled project"
                    title="Name used for the project manifest and editor header. Leave it blank to use the chosen folder name."
                  />
                </label>
                <p className="landing__field-help">If left blank, the selected folder name will be used.</p>
                <div className="landing__actions">
                  <button
                    type="button"
                    className="landing__primary-action"
                    onClick={handleCreateProject}
                    title="Create a new project structure inside a folder you choose."
                  >
                    <FolderPlusIcon />
                    Create project
                  </button>
                  <button
                    type="button"
                    className="button-secondary landing__secondary-action"
                    onClick={handleOpenProject}
                    title="Open an existing project folder from disk."
                  >
                    <OpenFolderIcon />
                    Open folder
                  </button>
                </div>
              </div>

              <p className="landing__tip">
                <InfoIcon />
                <span>Tip: You can also open a folder by dragging it onto this window.</span>
              </p>
            </aside>

            <section className="recent-projects" aria-labelledby="recent-projects-title">
              <header className="recent-projects__header">
                <div>
                  <h2 id="recent-projects-title">Recent projects</h2>
                  <p className="muted">Your last five projects stay here on this device.</p>
                </div>
                <button
                  type="button"
                  className="recent-projects__refresh"
                  onClick={() => void refreshRecentProjects()}
                  title="Refresh recent projects from this device."
                >
                  <RefreshIcon />
                  Refresh
                </button>
              </header>

              <div className="recent-projects__table" role="table" aria-label="Recent projects">
                <div className="recent-projects__columns" role="row">
                  <span role="columnheader">Project name</span>
                  <span role="columnheader">Last opened</span>
                  <span role="columnheader">Location</span>
                  <span className="sr-only" role="columnheader">
                    Actions
                  </span>
                </div>
                {recentProjects.length > 0 ? (
                  <div className="recent-projects__list" role="rowgroup">
                    {recentProjects.map((recentProject) => {
                      const openedAtLabel = formatRecentProjectOpenedAt(recentProject.lastOpenedAt);

                      return (
                        <div key={recentProject.projectDir} className="recent-project" role="row">
                          <button
                            type="button"
                            className="recent-project__open"
                            onClick={() => void openProjectDirectory(recentProject.projectDir, "recent")}
                            title={`Open ${recentProject.projectName}`}
                          >
                            <span className="recent-project__name-cell">
                              <span className="recent-project__folder-tile" aria-hidden="true">
                                <FolderIcon />
                              </span>
                              <span className="recent-project__name">{recentProject.projectName}</span>
                            </span>
                            <span className="recent-project__opened">{openedAtLabel}</span>
                            <span className="recent-project__path" title={recentProject.projectDir}>
                              {recentProject.projectDir}
                            </span>
                          </button>
                          <span className="recent-project__row-actions">
                            <button
                              type="button"
                              className="recent-project__icon-button"
                              onClick={(event) => void revealRecentProjectEntry(event, recentProject.projectDir)}
                              title="Reveal in folder"
                              aria-label={`Reveal ${recentProject.projectName} in folder`}
                            >
                              <RevealFolderIcon />
                            </button>
                            <button
                              type="button"
                              className="recent-project__icon-button"
                              onClick={(event) => void removeRecentProject(event, recentProject.projectDir)}
                              title="Remove from recents"
                              aria-label={`Remove ${recentProject.projectName} from recent projects`}
                            >
                              <TrashIcon />
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="recent-projects__empty">
                    <h3>No recent projects</h3>
                    <p>Create a project or open an existing folder to add it here.</p>
                  </div>
                )}
              </div>

              <p className="recent-projects__missing">
                <InfoIcon />
                <span>
                  Missing a project?{" "}
                  <button type="button" onClick={handleOpenProject}>
                    Open folder...
                  </button>{" "}
                  to add it back.
                </span>
              </p>
            </section>
          </section>
        </main>
      </div>
    );
  }

  function handleLandingDragOver(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  async function handleLandingDrop(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files.item(0);
    if (!droppedFile) {
      return;
    }

    const droppedPath = window.editorApi.getPathForDroppedFile(droppedFile);
    if (!droppedPath) {
      return;
    }

    await openProjectDirectory(droppedPath);
  }

  const validationReport = validateProject(project);
  const visibleValidationIssues = resolveVisibleIssuesForTab(project, validationReport.issues, activeTab);
  const hasProjectIssues = validationReport.issues.length > 0;
  const firstProjectChecklist = resolveFirstProjectChecklist(
    project,
    validationReport.valid,
    validationReport.issues.length
  );
  const shouldShowFirstProjectChecklist =
    firstProjectChecklist.shouldShow && dismissedFirstProjectGuideId !== project.manifest.projectId;
  const shouldShowIssuesSidebar =
    showValidationDetails || visibleValidationIssues.length > 0 || shouldShowFirstProjectChecklist;
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
  const openProject = project;

  function openFirstProjectScene(openHotspotInspector: boolean) {
    const scene = firstProjectChecklist.sceneId
      ? openProject.scenes.items.find((entry) => entry.id === firstProjectChecklist.sceneId)
      : openProject.scenes.items[0];
    if (!scene) {
      setStatusMessage("Create an opening scene before continuing project setup.");
      setActiveTab("world");
      return;
    }

    setSelectedLocationId(scene.locationId);
    setSelectedSceneId(scene.id);
    setSelectedHotspotId(openHotspotInspector ? firstProjectChecklist.hotspotId : undefined);
    setActiveTab("scenes");
    if (openHotspotInspector) {
      if (firstProjectChecklist.hotspotId) {
        setHotspotInspectorOpenRequest((request) => request + 1);
        setStatusMessage("Opened the starter hotspot. Choose what should happen when the player activates it.");
      } else {
        setStatusMessage("Create a hotspot, then give it a transition, dialogue, pickup, or placement behavior.");
      }
    } else {
      setStatusMessage("Opened the starter scene. Replace its background in Scene media.");
    }
  }

  function reviewFirstProjectValidation() {
    setActiveTab("world");
    setShowValidationDetails(true);
    setStatusMessage("Review the project issues and follow each issue link to finish setup.");
  }

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
                  setStatusMessage={setStatusMessage}
                  setBusyLabel={setBusyLabel}
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
                        ? "Opened the hotspot that uses this player feedback."
                        : "Choose a hotspot, then set its Player feedback field."
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
                        ? "Opened the hotspot that uses this item."
                        : "Opened the scene that uses this item."
                    );
                  }}
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

              {shouldShowFirstProjectChecklist ? (
                <FirstProjectChecklist
                  state={firstProjectChecklist}
                  onOpenSceneMedia={() => openFirstProjectScene(false)}
                  onOpenInteraction={() => openFirstProjectScene(true)}
                  onReviewValidation={reviewFirstProjectValidation}
                  onOpenPlaytest={() => {
                    setActiveTab("playtest");
                    setStatusMessage("Opened Playtest. Exercise the first scene and its interaction before exporting.");
                  }}
                  onDismiss={() => setDismissedFirstProjectGuideId(project.manifest.projectId)}
                />
              ) : null}

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

function formatRecentProjectOpenedAt(input: string): string {
  const openedAt = new Date(input);
  if (Number.isNaN(openedAt.getTime())) {
    return "Unknown";
  }

  const now = new Date();
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(openedAt);

  if (isSameCalendarDate(openedAt, now)) {
    return `Today, ${timeLabel}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDate(openedAt, yesterday)) {
    return `Yesterday, ${timeLabel}`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: openedAt.getFullYear() === now.getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(openedAt);
}

function isSameCalendarDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
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

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3.5 7.5h6.1l1.7 2h9.2v8.8H3.5V7.5Zm0 3.2h17M3.5 7.5V5.7h5.4l1.8 1.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function FolderPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3.5 7.5h6.1l1.7 2h9.2v8.8H3.5V7.5Zm0 3.2h17M16.2 14.6h4.1m-2.05-2.05v4.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function OpenFolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3.5 8.2h5.8l1.6 1.8h9.6v7.8h-17V8.2Zm0 2.9h17M8.6 15.2h4.6m-1.9-1.9 1.9 1.9-1.9 1.9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function RevealFolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3.5 7.5h6.1l1.7 2h9.2v8.8H3.5V7.5Zm0 3.2h17m-8.1 4.4h5.1m0 0-1.8-1.8m1.8 1.8-1.8 1.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M8 8.2V6.6h8v1.6m-10.2 0h12.4m-10.9 0 .7 10.2h8l.7-10.2M10.4 11.4v4.5m3.2-4.5v4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M18.2 7.9A6.8 6.8 0 1 0 19 14m-.8-6.1V4.8h-3.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 10.8v5.1m0-8.1h.01"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
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

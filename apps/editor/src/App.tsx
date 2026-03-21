import { useEffect, useState } from "react";
import { type ProjectBundle, type ValidationIssue, validateProject } from "@mage2/schema";
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
  resolveSceneNavigationTarget
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
import { type EditorTab, useEditorStore } from "./store";

const TABS: Array<{ id: EditorTab; label: string }> = [
  { id: "world", label: "World" },
  { id: "scenes", label: "Scenes" },
  { id: "assets", label: "Assets" },
  { id: "dialogue", label: "Dialogue" },
  { id: "inventory", label: "Inventory" },
  { id: "localization", label: "Localization" },
  { id: "playtest", label: "Playtest" }
];

const TAB_TOOLTIPS: Record<EditorTab, string> = {
  assets: "Review background, scene-audio, and inventory assets after creating them from their owning editor tabs.",
  world: "Arrange locations on the world map and manage the scenes inside each location.",
  scenes: "Edit scene media, upload background and scene-audio assets, hotspots, subtitles, and scene-level wiring.",
  dialogue: "Author dialogue trees, node flow, branching choices, and dialogue effects.",
  inventory: "Create inventory items, assign item art, and edit the player-facing text tied to each item.",
  localization: "Manage locale coverage and edit localized strings, subtitles, and media variants in one place.",
  playtest: "Run the current project in the editor to test hotspots, dialogue, subtitles, and state."
};

export function App() {
  const {
    project,
    projectDir,
    hasUnsavedChanges,
    activeTab,
    setProjectContext,
    updateProject,
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
  const [recentProjects, setRecentProjects] = useState<RecentProjectSummary[]>(() => getInitialRecentProjects());
  const hasEditorApi = typeof window.editorApi !== "undefined";
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
    if (!project) {
      return;
    }

    const nextProject = cloneProject(project);
    mutator(nextProject);
    updateProject(nextProject);
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

  async function openProjectDirectory(targetProjectDir: string, source: "picker" | "recent" = "picker") {
    const loadedProject = await withBusy(
      source === "recent" ? "Opening recent project" : "Loading project",
      () => window.editorApi.loadProject(targetProjectDir)
    );
    if (!loadedProject) {
      if (source === "recent") {
        await forgetRecentProjectEntry(targetProjectDir);
        setStatusMessage("Could not open that recent project. It has been removed from the recent list.");
      }
      return;
    }

    setProjectContext(loadedProject, targetProjectDir);
    await rememberRecentProjectEntry(targetProjectDir, loadedProject.manifest.projectName);
    setStatusMessage(
      source === "recent"
        ? `Reopened ${loadedProject.manifest.projectName}`
        : `Loaded ${loadedProject.manifest.projectName}`
    );
  }

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
      <main className="landing">
        <div className="landing__card">
          <p className="eyebrow">MAGE2</p>
          <h1>Full-motion adventure editor</h1>
          <p>
            Build locations, timed hotspots, dialogue graphs, inventory conditions, subtitles, and static runtime
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
    );
  }

  const validationReport = validateProject(project);
  const shouldShowIssuesSidebar = showValidationDetails || validationReport.issues.length > 0;
  const isSaveDisabled = !hasUnsavedChanges || Boolean(busyLabel);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Project</p>
          <h1>{project.manifest.projectName}</h1>
          <p className="header-meta">{projectDir}</p>
        </div>

        <div className="app-header__actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => void handleCloseProject()}
            title="Close the current project and return to the welcome screen."
          >
            Close Project
          </button>
          <button
            type="button"
            onClick={handleSaveProject}
            disabled={isSaveDisabled}
            title={
              hasUnsavedChanges
                ? "Write the current project manifest and assets metadata back to disk."
                : "No unsaved changes to save."
            }
          >
            Save
          </button>
          <button
            type="button"
            className="button-accent"
            onClick={handleExportProject}
            title="Save the project and build a static runtime export for play or distribution."
          >
            Export Runtime
          </button>
        </div>
      </header>

      <div className="status-bar">
        <span>{busyLabel ? `${busyLabel}...` : statusMessage}</span>
        <button
          type="button"
          className={validationReport.valid ? "status-pill status-pill--ok" : "status-pill status-pill--warn"}
          onClick={() => setShowValidationDetails((value) => !value)}
          title={
            validationReport.valid
              ? "Validation passed. Click to pin the issues sidebar open anyway."
              : "Open or close the validation issues sidebar."
          }
        >
          {validationReport.valid ? "Valid" : `${validationReport.issues.length} issue(s)`}
        </button>
      </div>

      <div className={shouldShowIssuesSidebar ? "editor-layout editor-layout--with-issues" : "editor-layout"}>
        <div className="editor-primary">
          <nav className="tab-strip">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === activeTab ? "tab-strip__tab tab-strip__tab--active" : "tab-strip__tab"}
                onClick={() => setActiveTab(tab.id)}
                title={TAB_TOOLTIPS[tab.id]}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <main className="workspace">
            {activeTab === "assets" ? <AssetsPanel project={project} setSavedProject={markProjectSaved} setStatusMessage={setStatusMessage} setBusyLabel={setBusyLabel} /> : null}
            {activeTab === "world" ? <WorldPanel project={project} mutateProject={mutateProject} /> : null}
            {activeTab === "scenes" ? (
              <ScenesPanel
                project={project}
                mutateProject={mutateProject}
                setSavedProject={markProjectSaved}
                setStatusMessage={setStatusMessage}
                setBusyLabel={setBusyLabel}
              />
            ) : null}
            {activeTab === "dialogue" ? <DialoguePanel project={project} mutateProject={mutateProject} /> : null}
            {activeTab === "inventory" ? (
              <InventoryPanel
                project={project}
                mutateProject={mutateProject}
                setSavedProject={markProjectSaved}
                setStatusMessage={setStatusMessage}
                setBusyLabel={setBusyLabel}
              />
            ) : null}
            {activeTab === "localization" ? (
              <LocalizationPanel
                project={project}
                mutateProject={mutateProject}
                setSavedProject={markProjectSaved}
                setStatusMessage={setStatusMessage}
                setBusyLabel={setBusyLabel}
              />
            ) : null}
            {activeTab === "playtest" ? <PlaytestPanel project={project} /> : null}
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
                <h3>Issues</h3>
                <p className="muted">
                  {validationReport.issues.length > 0
                    ? "Use the linked names to jump to the affected editor surface when available."
                    : "No validation issues detected."}
                </p>
              </div>
            </div>

            {validationReport.issues.length > 0 ? (
              <div className="validation-list">
                {validationReport.issues.map((issue, index) => {
                  const target = resolveIssueNavigation(project, issue);
                  const entityLabel = issue.entityId ? resolveIssueEntityLabel(project, issue, target) : undefined;
                  return (
                    <article key={`${issue.code}-${issue.entityId ?? "global"}-${index}`} className="validation-item">
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
  );
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

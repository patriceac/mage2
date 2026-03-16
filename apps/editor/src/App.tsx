import { useEffect, useState } from "react";
import { type ProjectBundle, type ValidationIssue, validateProject } from "@mage2/schema";
import { AssetsPanel } from "./panels/AssetsPanel";
import { DialoguePanel } from "./panels/DialoguePanel";
import { InventoryPanel } from "./panels/InventoryPanel";
import { ScenesPanel } from "./panels/ScenesPanel";
import { WorldPanel } from "./panels/WorldPanel";
import { PlaytestPanel } from "./PlaytestPanel";
import { useDialogs } from "./dialogs";
import { cloneProject } from "./project-helpers";
import { type EditorTab, useEditorStore } from "./store";

const TABS: Array<{ id: EditorTab; label: string }> = [
  { id: "world", label: "World" },
  { id: "scenes", label: "Scenes" },
  { id: "assets", label: "Assets" },
  { id: "dialogue", label: "Dialogue" },
  { id: "inventory", label: "Inventory" },
  { id: "playtest", label: "Playtest" }
];

const TAB_TOOLTIPS: Record<EditorTab, string> = {
  assets: "Manage imported media files and generate proxy assets for faster editing.",
  world: "Arrange locations on the world map and manage the scenes inside each location.",
  scenes: "Edit scene media, hotspots, subtitles, and scene-level wiring.",
  dialogue: "Author dialogue trees, node flow, branching choices, and dialogue effects.",
  inventory: "Create inventory items and edit the string table used across the project.",
  playtest: "Run the current project in the editor to test hotspots, dialogue, subtitles, and state."
};

interface RecentProjectSummary {
  projectDir: string;
  projectName: string;
  lastOpenedAt: string;
}

const LEGACY_RECENT_PROJECT_PATH_KEY = "mage2:recent-project-path";
const LEGACY_RECENT_PROJECT_NAME_KEY = "mage2:recent-project-name";

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
    setSelectedInventoryItemId
  } = useEditorStore();
  const [busyLabel, setBusyLabel] = useState<string>();
  const [statusMessage, setStatusMessage] = useState("Create or open a project folder to begin.");
  const [newProjectName, setNewProjectName] = useState("");
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProjectSummary[]>([]);
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
      localStorage.removeItem(LEGACY_RECENT_PROJECT_PATH_KEY);
      localStorage.removeItem(LEGACY_RECENT_PROJECT_NAME_KEY);
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
        const legacyRecentProject = getLegacyRecentProject();
        if (legacyRecentProject) {
          persistedRecentProjects = upsertRecentProjects([], legacyRecentProject.projectDir, legacyRecentProject.projectName);
        }
      }

      if (cancelled) {
        return;
      }

      if (persistedRecentProjects.length === 0) {
        const legacyRecentProject = getLegacyRecentProject();
        if (legacyRecentProject) {
          try {
            persistedRecentProjects = await window.editorApi.rememberRecentProject(
              legacyRecentProject.projectDir,
              legacyRecentProject.projectName
            );
            localStorage.removeItem(LEGACY_RECENT_PROJECT_PATH_KEY);
            localStorage.removeItem(LEGACY_RECENT_PROJECT_NAME_KEY);
          } catch {
            persistedRecentProjects = upsertRecentProjects(
              [],
              legacyRecentProject.projectDir,
              legacyRecentProject.projectName
            );
          }
        }
      }

      if (cancelled) {
        return;
      }

      setRecentProjects(persistedRecentProjects);
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

  function handleNavigateToIssue(issue: ValidationIssue) {
    if (!project) {
      return;
    }

    const target = resolveIssueNavigation(project, issue);
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
            Project Name
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
            {activeTab === "scenes" ? <ScenesPanel project={project} mutateProject={mutateProject} /> : null}
            {activeTab === "dialogue" ? <DialoguePanel project={project} mutateProject={mutateProject} /> : null}
            {activeTab === "inventory" ? <InventoryPanel project={project} mutateProject={mutateProject} /> : null}
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
                    ? "Click an issue to jump to the affected editor surface."
                    : "No validation issues detected."}
                </p>
              </div>
            </div>

            {validationReport.issues.length > 0 ? (
              <div className="validation-list">
                {validationReport.issues.map((issue, index) => {
                  const target = resolveIssueNavigation(project, issue);
                  return (
                    <article key={`${issue.code}-${issue.entityId ?? "global"}-${index}`} className="validation-item">
                      <div className="validation-item__header">
                        <span className={issue.level === "error" ? "validation-tag validation-tag--error" : "validation-tag validation-tag--warning"}>
                          {issue.level}
                        </span>
                        <strong>{issue.code}</strong>
                        {issue.entityId ? <code>{issue.entityId}</code> : null}
                      </div>
                      <p>{issue.message}</p>
                      <p className="muted">{getIssueHint(issue)}</p>
                      {target ? (
                        <button
                          type="button"
                          className="issue-action"
                          onClick={() => handleNavigateToIssue(issue)}
                          title={`Open the ${target.label} editor surface related to this validation issue.`}
                        >
                          Go To {target.label}
                        </button>
                      ) : null}
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

function resolveProjectName(input: string, directoryPath: string): string {
  const trimmed = input.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }

  const parts = directoryPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "New FMV Project";
}

function getLegacyRecentProject(): { projectDir: string; projectName?: string } | undefined {
  const projectDir = localStorage.getItem(LEGACY_RECENT_PROJECT_PATH_KEY)?.trim();
  if (!projectDir) {
    return undefined;
  }

  const projectName = localStorage.getItem(LEGACY_RECENT_PROJECT_NAME_KEY)?.trim() || undefined;
  return {
    projectDir,
    projectName
  };
}

function createRecentProjectSummary(projectDir: string, projectName?: string): RecentProjectSummary {
  return {
    projectDir,
    projectName: resolveProjectName(projectName ?? "", projectDir),
    lastOpenedAt: new Date().toISOString()
  };
}

function isSameProjectDirectory(leftProjectDir: string, rightProjectDir: string): boolean {
  return (
    leftProjectDir.trim().replaceAll("/", "\\").toLowerCase() ===
    rightProjectDir.trim().replaceAll("/", "\\").toLowerCase()
  );
}

function upsertRecentProjects(
  recentProjects: RecentProjectSummary[],
  projectDir: string,
  projectName?: string
): RecentProjectSummary[] {
  return [
    createRecentProjectSummary(projectDir, projectName),
    ...recentProjects.filter((recentProject) => !isSameProjectDirectory(recentProject.projectDir, projectDir))
  ].slice(0, 5);
}

function removeRecentProjectEntry(
  recentProjects: RecentProjectSummary[],
  projectDir: string
): RecentProjectSummary[] {
  return recentProjects.filter((recentProject) => !isSameProjectDirectory(recentProject.projectDir, projectDir));
}

interface IssueNavigationTarget {
  label: string;
  tab: EditorTab;
  locationId?: string;
  sceneId?: string;
  hotspotId?: string;
  dialogueId?: string;
  dialogueNodeId?: string;
  inventoryItemId?: string;
}

function resolveIssueNavigation(
  project: ProjectBundle,
  issue: ValidationIssue
): IssueNavigationTarget | undefined {
  const { entityId } = issue;

  if (entityId) {
    const location = project.locations.items.find((entry) => entry.id === entityId);
    if (location) {
      return {
        label: location.name,
        tab: "world",
        locationId: location.id,
        sceneId: location.sceneIds[0]
      };
    }

    const scene = project.scenes.items.find((entry) => entry.id === entityId);
    if (scene) {
      return {
        label: scene.name,
        tab: "scenes",
        locationId: scene.locationId,
        sceneId: scene.id
      };
    }

    for (const candidateScene of project.scenes.items) {
      const hotspot = candidateScene.hotspots.find((entry) => entry.id === entityId);
      if (hotspot) {
        return {
          label: hotspot.name,
          tab: "scenes",
          locationId: candidateScene.locationId,
          sceneId: candidateScene.id,
          hotspotId: hotspot.id
        };
      }

      if (candidateScene.subtitleTrackIds.includes(entityId)) {
        return {
          label: `${candidateScene.name} subtitles`,
          tab: "scenes",
          locationId: candidateScene.locationId,
          sceneId: candidateScene.id
        };
      }
    }

    for (const track of project.subtitles.items) {
      if (track.cues.some((cue) => cue.id === entityId)) {
        const owningScene = project.scenes.items.find((scene) => scene.subtitleTrackIds.includes(track.id));
        if (owningScene) {
          return {
            label: `${owningScene.name} subtitles`,
            tab: "scenes",
            locationId: owningScene.locationId,
            sceneId: owningScene.id
          };
        }
      }
    }

    const inventoryItem = project.inventory.items.find((entry) => entry.id === entityId);
    if (inventoryItem) {
      return {
        label: inventoryItem.name,
        tab: "inventory",
        inventoryItemId: inventoryItem.id
      };
    }

    const dialogue = project.dialogues.items.find((entry) => entry.id === entityId);
    if (dialogue) {
      return {
        label: dialogue.name,
        tab: "dialogue",
        dialogueId: dialogue.id
      };
    }

    for (const candidateDialogue of project.dialogues.items) {
      const node = candidateDialogue.nodes.find((entry) => entry.id === entityId);
      if (node) {
        return {
          label: `${candidateDialogue.name} / ${node.id}`,
          tab: "dialogue",
          dialogueId: candidateDialogue.id,
          dialogueNodeId: node.id
        };
      }

      const owningNode = candidateDialogue.nodes.find((nodeEntry) =>
        nodeEntry.choices.some((choice) => choice.id === entityId)
      );
      if (owningNode) {
        return {
          label: `${candidateDialogue.name} / ${owningNode.id}`,
          tab: "dialogue",
          dialogueId: candidateDialogue.id,
          dialogueNodeId: owningNode.id
        };
      }
    }
  }

  switch (issue.code) {
    case "MISSING_START_LOCATION":
      return {
        label: "start location",
        tab: "world",
        locationId: project.manifest.startLocationId,
        sceneId: project.manifest.startSceneId
      };
    case "MISSING_START_SCENE":
      return {
        label: "start scene",
        tab: "scenes",
        sceneId: project.manifest.startSceneId
      };
    case "SCENE_BACKGROUND_MISSING":
      return {
        label: "scene media",
        tab: "scenes",
        sceneId: project.manifest.startSceneId
      };
    case "HOTSPOT_DIALOGUE_MISSING":
    case "EFFECT_DIALOGUE_MISSING":
    case "DIALOGUE_START_NODE_MISSING":
    case "DIALOGUE_NEXT_NODE_MISSING":
    case "DIALOGUE_CHOICE_TARGET_MISSING":
      return {
        label: "dialogue",
        tab: "dialogue"
      };
    case "HOTSPOT_ITEM_MISSING":
    case "CONDITION_ITEM_MISSING":
    case "EFFECT_ITEM_MISSING":
      return {
        label: "inventory",
        tab: "inventory"
      };
    default:
      return undefined;
  }
}

function getIssueHint(issue: ValidationIssue): string {
  switch (issue.code) {
    case "SCENE_BACKGROUND_MISSING":
      return "Import media in Assets, then assign a background asset in the Scenes tab.";
    case "HOTSPOT_TARGET_SCENE_MISSING":
    case "EFFECT_SCENE_MISSING":
      return "Create the target scene first, then update the scene link or effect.";
    case "HOTSPOT_ITEM_MISSING":
    case "CONDITION_ITEM_MISSING":
    case "EFFECT_ITEM_MISSING":
      return "Create the inventory item in the Inventory tab or remove the item reference.";
    case "HOTSPOT_DIALOGUE_MISSING":
    case "EFFECT_DIALOGUE_MISSING":
      return "Create the dialogue tree in the Dialogue tab or clear the broken reference.";
    case "SUBTITLE_OVERLAP":
      return "Adjust subtitle cue timing so each cue starts after the previous one ends.";
    case "SCENE_UNREACHABLE":
      return "Add a path from the start scene or another reachable scene if this content should be playable.";
    default:
      return "Open the related editor tab and correct the broken reference or timing.";
  }
}

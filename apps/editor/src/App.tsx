import { useEffect, useState } from "react";
import { type ProjectBundle, type ValidationIssue, validateProject } from "@mage2/schema";
import { AssetsPanel } from "./panels/AssetsPanel";
import { DialoguePanel } from "./panels/DialoguePanel";
import { InventoryPanel } from "./panels/InventoryPanel";
import { ScenesPanel } from "./panels/ScenesPanel";
import { WorldPanel } from "./panels/WorldPanel";
import { PlaytestPanel } from "./PlaytestPanel";
import { cloneProject } from "./project-helpers";
import { type EditorTab, useEditorStore } from "./store";

const TABS: Array<{ id: EditorTab; label: string }> = [
  { id: "assets", label: "Assets" },
  { id: "world", label: "World" },
  { id: "scenes", label: "Scenes" },
  { id: "dialogue", label: "Dialogue" },
  { id: "inventory", label: "Inventory" },
  { id: "playtest", label: "Playtest" }
];

const TAB_TOOLTIPS: Record<EditorTab, string> = {
  assets: "Manage imported media files and generate proxy assets for faster editing.",
  world: "Arrange locations on the world map and manage the scenes inside each location.",
  scenes: "Edit scene media, hotspots, clip segments, subtitles, and scene-level wiring.",
  dialogue: "Author dialogue trees, node flow, branching choices, and dialogue effects.",
  inventory: "Create inventory items and edit the string table used across the project.",
  playtest: "Run the current project in the editor to test hotspots, dialogue, subtitles, and state."
};

const RECENT_PROJECT_PATH_KEY = "mage2:recent-project-path";
const RECENT_PROJECT_NAME_KEY = "mage2:recent-project-name";

export function App() {
  const {
    project,
    projectDir,
    activeTab,
    setProjectContext,
    updateProject,
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
  const [newProjectName, setNewProjectName] = useState("The Beast Within Prototype");
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [recentProjectDir, setRecentProjectDir] = useState<string>();
  const [hasAttemptedAutoOpen, setHasAttemptedAutoOpen] = useState(false);
  const hasEditorApi = typeof window.editorApi !== "undefined";

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

  function rememberRecentProject(targetProjectDir: string, projectName?: string) {
    localStorage.setItem(RECENT_PROJECT_PATH_KEY, targetProjectDir);
    if (projectName) {
      localStorage.setItem(RECENT_PROJECT_NAME_KEY, projectName);
    }
    setRecentProjectDir(targetProjectDir);
  }

  function clearRecentProject() {
    localStorage.removeItem(RECENT_PROJECT_PATH_KEY);
    localStorage.removeItem(RECENT_PROJECT_NAME_KEY);
    setRecentProjectDir(undefined);
  }

  async function openProjectDirectory(targetProjectDir: string, source: "picker" | "recent" = "picker") {
    const loadedProject = await withBusy(
      source === "recent" ? "Opening recent project" : "Loading project",
      () => window.editorApi.loadProject(targetProjectDir)
    );
    if (!loadedProject) {
      if (source === "recent") {
        clearRecentProject();
        setStatusMessage("Could not reopen the last project. Choose a project manually.");
      }
      return;
    }

    setProjectContext(loadedProject, targetProjectDir);
    rememberRecentProject(targetProjectDir, loadedProject.manifest.projectName);
    setStatusMessage(
      source === "recent"
        ? `Reopened ${loadedProject.manifest.projectName}`
        : `Loaded ${loadedProject.manifest.projectName}`
    );
  }

  useEffect(() => {
    if (!hasEditorApi || project || hasAttemptedAutoOpen) {
      return;
    }

    const storedRecentProjectDir = localStorage.getItem(RECENT_PROJECT_PATH_KEY) ?? undefined;
    setRecentProjectDir(storedRecentProjectDir);
    setHasAttemptedAutoOpen(true);

    if (!storedRecentProjectDir) {
      return;
    }
    const recentProjectPath = storedRecentProjectDir;

    let cancelled = false;

    async function autoOpenRecentProject() {
      setBusyLabel("Opening recent project");
      try {
        const loadedProject = await window.editorApi.loadProject(recentProjectPath);
        if (cancelled) {
          return;
        }

        setProjectContext(loadedProject, recentProjectPath);
        rememberRecentProject(recentProjectPath, loadedProject.manifest.projectName);
        setStatusMessage(`Reopened ${loadedProject.manifest.projectName}`);
      } catch {
        if (cancelled) {
          return;
        }
        clearRecentProject();
        setStatusMessage("Could not reopen the last project. Choose a project manually.");
      } finally {
        if (!cancelled) {
          setBusyLabel(undefined);
        }
      }
    }

    void autoOpenRecentProject();

    return () => {
      cancelled = true;
    };
  }, [hasAttemptedAutoOpen, hasEditorApi, project, setProjectContext]);

  async function handleCreateProject() {
    if (!hasEditorApi) {
      return;
    }
    const chosenDirectory = await window.editorApi.chooseProjectDirectory();
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
    rememberRecentProject(chosenDirectory, createdProject.manifest.projectName);
    setStatusMessage(`Created project in ${chosenDirectory}`);
  }

  async function handleOpenProject() {
    if (!hasEditorApi) {
      return;
    }
    const chosenDirectory = await window.editorApi.chooseProjectDirectory();
    if (!chosenDirectory) {
      return;
    }

    await openProjectDirectory(chosenDirectory);
  }

  async function handleSaveProject() {
    if (!hasEditorApi || !project || !projectDir) {
      return;
    }

    const result = await withBusy("Saving project", () =>
      window.editorApi.saveProject(projectDir, project)
    );
    if (!result) {
      return;
    }

    updateProject(result.project);
    setStatusMessage(
      result.validationReport.valid
        ? "Project saved successfully."
        : `Project saved with ${result.validationReport.issues.length} validation issue(s).`
    );
  }

  async function handleExportProject() {
    if (!hasEditorApi || !project || !projectDir) {
      return;
    }

    await handleSaveProject();
    const result = await withBusy("Exporting runtime build", () =>
      window.editorApi.exportProject(projectDir, project)
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
              placeholder="The Beast Within Prototype"
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
              Create Project
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={handleOpenProject}
              title="Open an existing project folder from disk."
            >
              Open Project
            </button>
            {recentProjectDir ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => void openProjectDirectory(recentProjectDir!, "recent")}
                title="Reopen the last project directory saved in this editor."
              >
                Open Recent
              </button>
            ) : null}
          </div>
          {recentProjectDir ? <p className="muted">Recent project: {recentProjectDir}</p> : null}
        </div>
      </main>
    );
  }

  const validationReport = validateProject(project);
  const shouldShowIssuesSidebar = showValidationDetails || validationReport.issues.length > 0;

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
            onClick={handleCreateProject}
            title="Create a brand new project in another folder without closing this editor."
          >
            New
          </button>
          <button
            type="button"
            onClick={handleOpenProject}
            title="Load a different project folder into the editor."
          >
            Open
          </button>
          <button
            type="button"
            onClick={handleSaveProject}
            title="Write the current project manifest and assets metadata back to disk."
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
            {activeTab === "assets" ? <AssetsPanel project={project} replaceProject={updateProject} setStatusMessage={setStatusMessage} setBusyLabel={setBusyLabel} /> : null}
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

      const segment = candidateScene.clipSegments.find((entry) => entry.id === entityId);
      if (segment) {
        return {
          label: `${candidateScene.name} / ${segment.name}`,
          tab: "scenes",
          locationId: candidateScene.locationId,
          sceneId: candidateScene.id
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
    case "SEGMENT_ASSET_MISSING":
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
    case "SEGMENT_ASSET_MISSING":
      return "Pick an existing media asset for the clip segment or remove the segment.";
    case "HOTSPOT_TARGET_SCENE_MISSING":
    case "EFFECT_SCENE_MISSING":
    case "SEGMENT_TARGET_SCENE_MISSING":
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

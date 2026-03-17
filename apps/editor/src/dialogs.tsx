import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import type { ProjectBundle } from "@mage2/schema";
import { countSceneReferences, type SceneReferenceSummary } from "./project-helpers";
import { ScenePreviewCard } from "./previews";

interface FileBrowserLocation {
  label: string;
  path: string;
  kind: "favorite" | "drive" | "root";
}

interface FileBrowserEntry {
  name: string;
  path: string;
  kind: "directory" | "file";
  extension?: string;
}

interface FileBrowserDirectoryListing {
  path: string;
  parentPath?: string;
  entries: FileBrowserEntry[];
}

interface ProjectDirectoryInspection {
  isProjectDirectory: boolean;
  projectName?: string;
  reason?: string;
}

interface ConfirmDialogOptions {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

interface DirectoryDialogOptions {
  title: string;
  description?: string;
  initialPath?: string;
  confirmLabel?: string;
  allowCreateDirectory?: boolean;
  directoryRequirement?: "project";
}

interface FileDialogOptions {
  title: string;
  description?: string;
  initialPath?: string;
  confirmLabel?: string;
  allowedExtensions?: string[];
}

export interface DeleteSceneDialogOptions {
  project: ProjectBundle;
  sceneId: string;
  referenceSummary: SceneReferenceSummary;
}

export type DeleteSceneDialogResult =
  | {
      action: "cancel";
    }
  | {
      action: "cleanup";
    }
  | {
      action: "rewire";
      replacementSceneId: string;
    };

interface DialogContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  confirmCloseProject: (projectName: string) => Promise<"save" | "discard" | "cancel">;
  chooseDirectory: (options: DirectoryDialogOptions) => Promise<string | undefined>;
  pickFiles: (options: FileDialogOptions) => Promise<string[]>;
  deleteScene: (options: DeleteSceneDialogOptions) => Promise<DeleteSceneDialogResult>;
}

type DialogRequest =
  | {
      kind: "confirm";
      options: ConfirmDialogOptions;
      resolve: (value: boolean) => void;
    }
  | {
      kind: "close-project";
      projectName: string;
      resolve: (value: "save" | "discard" | "cancel") => void;
    }
  | {
      kind: "directory";
      options: DirectoryDialogOptions;
      resolve: (value: string | undefined) => void;
    }
  | {
      kind: "files";
      options: FileDialogOptions;
      resolve: (value: string[]) => void;
    }
  | {
      kind: "delete-scene";
      options: DeleteSceneDialogOptions;
      resolve: (value: DeleteSceneDialogResult) => void;
    };

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogQueue, setDialogQueue] = useState<DialogRequest[]>([]);
  const activeDialog = dialogQueue[0];

  const dialogApi = useMemo<DialogContextValue>(
    () => ({
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          setDialogQueue((currentQueue) => [...currentQueue, { kind: "confirm", options, resolve }]);
        }),
      confirmCloseProject: (projectName) =>
        new Promise<"save" | "discard" | "cancel">((resolve) => {
          setDialogQueue((currentQueue) => [...currentQueue, { kind: "close-project", projectName, resolve }]);
        }),
      chooseDirectory: (options) =>
        new Promise<string | undefined>((resolve) => {
          setDialogQueue((currentQueue) => [...currentQueue, { kind: "directory", options, resolve }]);
        }),
      pickFiles: (options) =>
        new Promise<string[]>((resolve) => {
          setDialogQueue((currentQueue) => [...currentQueue, { kind: "files", options, resolve }]);
        }),
      deleteScene: (options) =>
        new Promise<DeleteSceneDialogResult>((resolve) => {
          setDialogQueue((currentQueue) => [...currentQueue, { kind: "delete-scene", options, resolve }]);
        })
    }),
    []
  );

  const dismissActiveDialog = () => {
    setDialogQueue((currentQueue) => currentQueue.slice(1));
  };

  return (
    <DialogContext.Provider value={dialogApi}>
      {children}
      {activeDialog?.kind === "confirm" ? (
        <ConfirmDialog
          options={activeDialog.options}
          onConfirm={() => {
            activeDialog.resolve(true);
            dismissActiveDialog();
          }}
          onCancel={() => {
            activeDialog.resolve(false);
            dismissActiveDialog();
          }}
        />
      ) : null}
      {activeDialog?.kind === "close-project" ? (
        <CloseProjectDialog
          projectName={activeDialog.projectName}
          onResolve={(value) => {
            activeDialog.resolve(value);
            dismissActiveDialog();
          }}
        />
      ) : null}
      {activeDialog?.kind === "directory" ? (
        <FileBrowserDialog
          mode="directory"
          options={activeDialog.options}
          onResolve={(value) => {
            activeDialog.resolve(typeof value === "string" ? value : undefined);
            dismissActiveDialog();
          }}
        />
      ) : null}
      {activeDialog?.kind === "files" ? (
        <FileBrowserDialog
          mode="files"
          options={activeDialog.options}
          onResolve={(value) => {
            activeDialog.resolve(Array.isArray(value) ? value : []);
            dismissActiveDialog();
          }}
        />
      ) : null}
      {activeDialog?.kind === "delete-scene" ? (
        <DeleteSceneDialog
          options={activeDialog.options}
          onResolve={(value) => {
            activeDialog.resolve(value);
            dismissActiveDialog();
          }}
        />
      ) : null}
    </DialogContext.Provider>
  );
}

export function useDialogs(): DialogContextValue {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialogs must be used inside a DialogProvider.");
  }

  return context;
}

function ConfirmDialog({
  options,
  onConfirm,
  onCancel
}: {
  options: ConfirmDialogOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <DialogFrame
      title={options.title}
      wide={false}
      tone={options.tone}
      onCancel={onCancel}
      footer={
        <div className="dialog-actions">
          <button type="button" className="button-secondary" onClick={onCancel} autoFocus>
            {options.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            className={options.tone === "danger" ? "button-danger" : "button-accent"}
            onClick={onConfirm}
          >
            {options.confirmLabel ?? "Confirm"}
          </button>
        </div>
      }
    >
      <div className="dialog-stack">{options.body}</div>
    </DialogFrame>
  );
}

function CloseProjectDialog({
  projectName,
  onResolve
}: {
  projectName: string;
  onResolve: (value: "save" | "discard" | "cancel") => void;
}) {
  return (
    <DialogFrame
      title="Close Project"
      onCancel={() => onResolve("cancel")}
      footer={
        <div className="dialog-actions dialog-actions--spread">
          <button type="button" className="button-secondary" onClick={() => onResolve("cancel")} autoFocus>
            Keep Editing
          </button>
          <div className="dialog-button-row">
            <button type="button" className="button-secondary" onClick={() => onResolve("discard")}>
              Close Without Saving
            </button>
            <button type="button" className="button-accent" onClick={() => onResolve("save")}>
              Save and Close
            </button>
          </div>
        </div>
      }
    >
      <div className="dialog-stack">
        <p>{`Save changes to ${projectName}?`}</p>
        <div className="dialog-callout">
          <strong>Unsaved work detected</strong>
          <p>If you close this project now, any unsaved changes will be lost.</p>
        </div>
      </div>
    </DialogFrame>
  );
}

function DeleteSceneDialog({
  options,
  onResolve
}: {
  options: DeleteSceneDialogOptions;
  onResolve: (value: DeleteSceneDialogResult) => void;
}) {
  const deletedScene = options.project.scenes.items.find((scene) => scene.id === options.sceneId);
  const replacementCandidates = options.project.scenes.items.filter((scene) => scene.id !== options.sceneId);
  const [mode, setMode] = useState<"cleanup" | "rewire">("cleanup");
  const [replacementSceneId, setReplacementSceneId] = useState("");
  const replacementScene = replacementCandidates.find((scene) => scene.id === replacementSceneId);
  const deletedLocationName = deletedScene
    ? options.project.locations.items.find((location) => location.id === deletedScene.locationId)?.name
    : undefined;
  const replacementLocationName = replacementScene
    ? options.project.locations.items.find((location) => location.id === replacementScene.locationId)?.name
    : undefined;
  const deletedAsset = deletedScene
    ? options.project.assets.assets.find((asset) => asset.id === deletedScene.backgroundAssetId)
    : undefined;
  const replacementAsset = replacementScene
    ? options.project.assets.assets.find((asset) => asset.id === replacementScene.backgroundAssetId)
    : undefined;
  const canRewire = replacementCandidates.length > 0;
  const confirmDisabled = !deletedScene || (mode === "rewire" && !replacementScene);
  const referenceRows = resolveSceneReferenceRows(options.referenceSummary);
  const outcomeRows = resolveDeleteSceneOutcomeRows(
    options.referenceSummary,
    mode,
    replacementScene?.name,
    replacementLocationName
  );
  const confirmLabel = mode === "rewire" ? "Delete and Rewire" : "Delete and Clean";
  const summaryMessage =
    mode === "rewire"
      ? replacementScene
        ? `References will be rewired to ${replacementScene.name}.`
        : "Choose a replacement scene to finish rewiring."
      : options.referenceSummary.isStartScene
      ? "Cleanup will leave the project with an invalid start scene until you choose a new one."
      : "Cleanup will remove references to the deleted scene and keep the rest of the project intact.";

  return (
    <DialogFrame
      title={deletedScene ? `Delete ${deletedScene.name}?` : "Delete Scene"}
      description="Choose whether to clean references to this scene or redirect them to another scene before deleting it."
      wide
      tone="danger"
      onCancel={() => onResolve({ action: "cancel" })}
      footer={
        <div className="dialog-actions dialog-actions--spread">
          <div className="dialog-selection-summary">{summaryMessage}</div>
          <div className="dialog-button-row">
            <button
              type="button"
              className="button-secondary"
              onClick={() => onResolve({ action: "cancel" })}
              autoFocus
            >
              Keep Scene
            </button>
            <button
              type="button"
              className="button-danger"
              disabled={confirmDisabled}
              onClick={() =>
                onResolve(
                  mode === "rewire" && replacementScene
                    ? { action: "rewire", replacementSceneId: replacementScene.id }
                    : { action: "cleanup" }
                )
              }
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      }
    >
      <div className="dialog-stack scene-delete-dialog">
        <p>
          {deletedScene
            ? `Delete "${deletedScene.name}" from this project? This removes the scene and its hotspots from the world.`
            : "This scene is no longer available to delete."}
        </p>

        <div className="dialog-callout dialog-callout--danger">
          <strong>Permanent scene deletion</strong>
          <p>
            Subtitle tracks attached to this scene will be removed with it. Dialogue trees remain in the project, but
            any references to this scene inside them will be cleaned or rewired.
          </p>
        </div>

        <div className="scene-delete-dialog__preview-grid">
          <ScenePreviewCard
            label="Deleting"
            scene={deletedScene}
            locationName={deletedLocationName}
            asset={deletedAsset}
            emptyTitle="Scene not found"
            emptyBody="The selected scene could not be loaded."
          />
          <ScenePreviewCard
            label="Replacement"
            scene={mode === "rewire" ? replacementScene : undefined}
            locationName={replacementLocationName}
            asset={replacementAsset}
            emptyTitle="No replacement scene"
            emptyBody={
              mode === "rewire"
                ? "Pick a replacement scene to preview the rewire target here."
                : "Switch to Rewire references if you want to preview a replacement scene."
            }
          />
        </div>

        <section className="scene-delete-dialog__section">
          <div className="scene-delete-dialog__choice-grid">
            <button
              type="button"
              className={mode === "cleanup" ? "scene-delete-choice scene-delete-choice--active" : "scene-delete-choice"}
              onClick={() => setMode("cleanup")}
            >
              <strong>Clean References</strong>
              <span>Remove references to the deleted scene, even if that leaves the project invalid.</span>
            </button>
            <button
              type="button"
              className={mode === "rewire" ? "scene-delete-choice scene-delete-choice--active" : "scene-delete-choice"}
              disabled={!canRewire}
              onClick={() => setMode("rewire")}
            >
              <strong>Rewire References</strong>
              <span>
                {canRewire
                  ? "Redirect scene references to another scene that you choose."
                  : "Create another scene first if you want to rewire references instead of cleaning them."}
              </span>
            </button>
          </div>
        </section>

        {mode === "rewire" ? (
          <label>
            Replacement Scene
            <select value={replacementSceneId} onChange={(event) => setReplacementSceneId(event.target.value)}>
              <option value="">Select a replacement scene</option>
              {replacementCandidates.map((scene) => {
                const locationName =
                  options.project.locations.items.find((location) => location.id === scene.locationId)?.name ??
                  "Unknown location";
                return (
                  <option key={scene.id} value={scene.id}>
                    {`${scene.name} (${locationName})`}
                  </option>
                );
              })}
            </select>
          </label>
        ) : null}

        <div className="dialog-callout">
          <strong>References found</strong>
          {referenceRows.length > 0 ? (
            <ul className="dialog-detail-list">
              {referenceRows.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          ) : (
            <p>No cross-scene references will need cleanup or rewiring.</p>
          )}
        </div>

        <div className="dialog-callout">
          <strong>What happens next</strong>
          <ul className="dialog-detail-list">
            {outcomeRows.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        </div>
      </div>
    </DialogFrame>
  );
}

function FileBrowserDialog({
  mode,
  options,
  onResolve
}: {
  mode: "directory" | "files";
  options: DirectoryDialogOptions | FileDialogOptions;
  onResolve: (value: string | string[] | undefined) => void;
}) {
  const [locations, setLocations] = useState<FileBrowserLocation[]>([]);
  const [requestedPath, setRequestedPath] = useState(options.initialPath ?? "");
  const [pathInput, setPathInput] = useState(options.initialPath ?? "");
  const [listing, setListing] = useState<FileBrowserDirectoryListing>();
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInspectingDirectory, setIsInspectingDirectory] = useState(false);
  const [directoryInspection, setDirectoryInspection] = useState<ProjectDirectoryInspection>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isCreatingDirectory, setIsCreatingDirectory] = useState(false);
  const [newDirectoryName, setNewDirectoryName] = useState("");
  const requiresProjectDirectory =
    mode === "directory" && "directoryRequirement" in options && options.directoryRequirement === "project";

  const allowedExtensionSet =
    mode === "files" && "allowedExtensions" in options && options.allowedExtensions
      ? new Set(options.allowedExtensions.map((extension) => extension.toLowerCase()))
      : undefined;

  useEffect(() => {
    let cancelled = false;

    async function loadLocations() {
      try {
        const nextLocations = await window.editorApi.getFileBrowserLocations();
        if (cancelled) {
          return;
        }

        setLocations(nextLocations);

        if (!(options.initialPath ?? "") && nextLocations[0]) {
          setRequestedPath(nextLocations[0].path);
          setPathInput(nextLocations[0].path);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setErrorMessage(`Could not load browse locations: ${message}`);
      }
    }

    void loadLocations();

    return () => {
      cancelled = true;
    };
  }, [options.initialPath]);

  useEffect(() => {
    if (!requestedPath) {
      return;
    }

    let cancelled = false;

    async function loadDirectory() {
      try {
        setIsLoading(true);
        setErrorMessage(undefined);
        setDirectoryInspection(undefined);
        const nextListing = await window.editorApi.listDirectory(requestedPath);
        if (cancelled) {
          return;
        }

        setListing(nextListing);
        setPathInput(nextListing.path);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setErrorMessage(message);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDirectory();

    return () => {
      cancelled = true;
    };
  }, [requestedPath]);

  useEffect(() => {
    if (!requiresProjectDirectory || !listing?.path) {
      setIsInspectingDirectory(false);
      setDirectoryInspection(undefined);
      return;
    }

    const directoryPath = listing.path;
    let cancelled = false;

    async function inspectDirectory() {
      try {
        setIsInspectingDirectory(true);
        const inspection = await window.editorApi.inspectProjectDirectory(directoryPath);
        if (cancelled) {
          return;
        }

        setDirectoryInspection(inspection);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setDirectoryInspection({
          isProjectDirectory: false,
          reason: `Could not inspect this folder: ${message}`
        });
      } finally {
        if (!cancelled) {
          setIsInspectingDirectory(false);
        }
      }
    }

    void inspectDirectory();

    return () => {
      cancelled = true;
    };
  }, [listing?.path, requiresProjectDirectory]);

  const visibleEntries = listing?.entries.filter((entry) => {
    if (entry.kind === "directory") {
      return true;
    }

    if (mode === "directory") {
      return false;
    }

    return !allowedExtensionSet || allowedExtensionSet.has((entry.extension ?? "").toLowerCase());
  });

  const hiddenFileCount =
    mode === "files" && allowedExtensionSet && listing
      ? listing.entries.filter(
          (entry) => entry.kind === "file" && !allowedExtensionSet.has((entry.extension ?? "").toLowerCase())
        ).length
      : 0;

  const breadcrumbItems = buildBreadcrumbs(listing?.path ?? pathInput);
  const canConfirm =
    mode === "directory"
      ? Boolean(
          listing?.path &&
            !isLoading &&
            (!requiresProjectDirectory || (!isInspectingDirectory && directoryInspection?.isProjectDirectory))
        )
      : selectedPaths.length > 0 && !isLoading;

  const confirmLabel =
    options.confirmLabel ?? (mode === "directory" ? "Use This Folder" : "Import Selected Files");

  const selectedFileNames =
    mode === "files"
      ? selectedPaths.map((selectedPath) => selectedPath.replace(/^.*[\\/]/, ""))
      : [];

  const directoryValidationMessage = resolveDirectoryValidationMessage(
    requiresProjectDirectory,
    isLoading,
    isInspectingDirectory,
    directoryInspection
  );
  const directoryValidationTone =
    requiresProjectDirectory && directoryInspection && !directoryInspection.isProjectDirectory
      ? "warning"
      : "default";

  function navigateToPath(nextPath: string) {
    const trimmedPath = nextPath.trim();
    if (!trimmedPath) {
      return;
    }

    setRequestedPath(trimmedPath);
  }

  function handlePathSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateToPath(pathInput);
  }

  async function handleCreateDirectory() {
    if (!listing?.path) {
      return;
    }

    try {
      setErrorMessage(undefined);
      const nextDirectoryPath = await window.editorApi.createDirectory(listing.path, newDirectoryName);
      setNewDirectoryName("");
      setIsCreatingDirectory(false);
      navigateToPath(nextDirectoryPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
    }
  }

  function toggleFileSelection(filePath: string) {
    setSelectedPaths((currentSelection) =>
      currentSelection.includes(filePath)
        ? currentSelection.filter((selectedPath) => selectedPath !== filePath)
        : [...currentSelection, filePath]
    );
  }

  return (
    <DialogFrame
      title={options.title}
      description={options.description}
      wide
      bodyClassName="dialog-shell__body--file-browser"
      onCancel={() => onResolve(mode === "directory" ? undefined : [])}
      footer={
        <div className="dialog-actions dialog-actions--spread">
          <div className="dialog-selection-summary">
            {mode === "directory" ? (
              <span>{directoryValidationMessage}</span>
            ) : selectedPaths.length > 0 ? (
              <span>
                {selectedPaths.length} file{selectedPaths.length === 1 ? "" : "s"} selected
              </span>
            ) : (
              <span>Select one or more files to continue.</span>
            )}
          </div>
          <div className="dialog-button-row">
            <button
              type="button"
              className="button-secondary"
              onClick={() => onResolve(mode === "directory" ? undefined : [])}
              autoFocus
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-accent"
              disabled={!canConfirm}
              onClick={() => onResolve(mode === "directory" ? listing?.path : selectedPaths)}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      }
    >
      <div className="file-browser">
        <aside className="file-browser__sidebar">
          <div className="file-browser__sidebar-section">
            <p className="dialog-eyebrow">Locations</p>
            <div className="file-browser__locations">
              {locations.map((location) => {
                const isActive = isSamePath(listing?.path ?? requestedPath, location.path);
                return (
                  <button
                    key={location.path}
                    type="button"
                    className={isActive ? "file-browser__location file-browser__location--active" : "file-browser__location"}
                    onClick={() => navigateToPath(location.path)}
                    title={location.path}
                  >
                    <strong>{location.label}</strong>
                    <span>{location.kind}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {mode === "files" && selectedFileNames.length > 0 ? (
            <div className="file-browser__sidebar-section">
              <p className="dialog-eyebrow">Selection</p>
              <div className="file-browser__selection-list">
                {selectedFileNames.map((fileName, index) => (
                  <span key={`${fileName}-${index}`} className="file-browser__selection-pill">
                    {fileName}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <section className="file-browser__main">
          <div className="file-browser__toolbar">
            {breadcrumbItems.length > 0 ? (
              <div className="file-browser__breadcrumbs" aria-label="Current path">
                {breadcrumbItems.map((breadcrumb, index) => (
                  <button
                    key={breadcrumb.path}
                    type="button"
                    className="file-browser__breadcrumb"
                    onClick={() => navigateToPath(breadcrumb.path)}
                    title={breadcrumb.path}
                  >
                    {index === breadcrumbItems.length - 1 ? <strong>{breadcrumb.label}</strong> : breadcrumb.label}
                  </button>
                ))}
              </div>
            ) : null}

            <form className="file-browser__path-form" onSubmit={handlePathSubmit}>
              <input
                value={pathInput}
                onChange={(event) => setPathInput(event.target.value)}
                placeholder="Enter a path"
                title="Type a path directly and press Go."
              />
              <div className="dialog-button-row">
                <button
                  type="button"
                  className="button-secondary file-browser__toolbar-button"
                  disabled={!listing?.parentPath}
                  onClick={() => listing?.parentPath && navigateToPath(listing.parentPath)}
                  aria-label="Go to parent folder"
                  title="Go to parent folder"
                >
                  ⬆️
                </button>
                <button
                  type="submit"
                  className="button-secondary file-browser__toolbar-button"
                  aria-label="Go to path"
                  title="Go to path"
                >
                  ➡️
                </button>
                <button
                  type="button"
                  className="button-secondary file-browser__toolbar-button"
                  disabled={!listing?.path}
                  onClick={() => listing?.path && navigateToPath(listing.path)}
                  aria-label="Refresh current folder"
                  title="Refresh current folder"
                >
                  🔄
                </button>
              </div>
            </form>

            {"allowCreateDirectory" in options && options.allowCreateDirectory ? (
              <div className="file-browser__folder-tools">
                {isCreatingDirectory ? (
                  <>
                    <input
                      value={newDirectoryName}
                      onChange={(event) => setNewDirectoryName(event.target.value)}
                      placeholder="New folder name"
                      title="Create a new folder inside the current directory."
                    />
                    <div className="dialog-button-row">
                      <button type="button" className="button-secondary" onClick={() => setIsCreatingDirectory(false)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button-accent"
                        disabled={newDirectoryName.trim().length === 0 || !listing?.path}
                        onClick={() => void handleCreateDirectory()}
                      >
                        Create Folder
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={!listing?.path}
                    onClick={() => setIsCreatingDirectory(true)}
                  >
                    New Folder
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <div className="file-browser__status-row">
            <span>
              {requiresProjectDirectory
                ? "Choose a folder that contains a valid MAGE2 project."
                : mode === "directory"
                ? "Choose the current folder when you reach the project location you want."
                : "Click files to select them. Open folders to keep browsing."}
            </span>
            {hiddenFileCount > 0 ? (
              <span>{hiddenFileCount} unsupported file{hiddenFileCount === 1 ? "" : "s"} hidden</span>
            ) : null}
          </div>

          {requiresProjectDirectory && !isLoading ? (
            <div
              className={
                directoryValidationTone === "warning"
                  ? "file-browser__validation file-browser__validation--warning"
                  : "file-browser__validation"
              }
            >
              {directoryValidationMessage}
            </div>
          ) : null}

          <div className="file-browser__entries">
            {isLoading ? <p className="muted">Loading folder contents...</p> : null}
            {!isLoading && errorMessage ? <p className="dialog-error">{errorMessage}</p> : null}
            {!isLoading && !errorMessage && visibleEntries?.length === 0 ? (
              <p className="muted">
                {mode === "directory"
                  ? "No folders are available here."
                  : "No supported files were found in this folder."}
              </p>
            ) : null}
            {!isLoading && !errorMessage
              ? visibleEntries?.map((entry) => {
                  const isSelected = entry.kind === "file" && selectedPaths.includes(entry.path);
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      className={isSelected ? "file-browser__entry file-browser__entry--selected" : "file-browser__entry"}
                      onClick={() => {
                        if (entry.kind === "directory") {
                          navigateToPath(entry.path);
                          return;
                        }

                        toggleFileSelection(entry.path);
                      }}
                      title={entry.path}
                    >
                      <div className="file-browser__entry-copy">
                        <strong>{entry.name}</strong>
                        <span>{entry.kind === "directory" ? "Folder" : entry.extension ?? "File"}</span>
                      </div>
                      <span className="file-browser__entry-action">
                        {entry.kind === "directory" ? "Open" : isSelected ? "Selected" : "Select"}
                      </span>
                    </button>
                  );
                })
              : null}
          </div>
        </section>
      </div>
    </DialogFrame>
  );
}

function DialogFrame({
  title,
  description,
  wide = false,
  tone = "default",
  onCancel,
  children,
  footer,
  bodyClassName
}: {
  title: string;
  description?: string;
  wide?: boolean;
  tone?: "default" | "danger";
  onCancel: () => void;
  children: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  return (
    <div className="dialog-overlay">
      <div
        className={
          wide
            ? `dialog-shell dialog-shell--wide dialog-shell--${tone}`
            : `dialog-shell dialog-shell--${tone}`
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="dialog-shell__header">
          <div className="dialog-title-group">
            <p className="dialog-eyebrow">MAGE2</p>
            <h2 id={titleId}>{title}</h2>
            {description ? (
              <p id={descriptionId} className="muted">
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="dialog-close" onClick={onCancel} aria-label="Close dialog">
            Close
          </button>
        </div>

        <div className={bodyClassName ? `dialog-shell__body ${bodyClassName}` : "dialog-shell__body"}>{children}</div>
        {footer ? <div className="dialog-shell__footer">{footer}</div> : null}
      </div>
    </div>
  );
}

function resolveSceneReferenceRows(summary: SceneReferenceSummary): string[] {
  const rows: string[] = [];

  if (summary.isStartScene) {
    rows.push("1 start scene reference");
  }
  if (summary.locationReferenceCount > 0) {
    rows.push(`${summary.locationReferenceCount} location scene list reference${summary.locationReferenceCount === 1 ? "" : "s"}`);
  }
  if (summary.exitSceneReferenceCount > 0) {
    rows.push(`${summary.exitSceneReferenceCount} exit scene reference${summary.exitSceneReferenceCount === 1 ? "" : "s"}`);
  }
  if (summary.hotspotTargetReferenceCount > 0) {
    rows.push(
      `${summary.hotspotTargetReferenceCount} hotspot target reference${
        summary.hotspotTargetReferenceCount === 1 ? "" : "s"
      }`
    );
  }
  if (summary.sceneVisitedConditionCount > 0) {
    rows.push(
      `${summary.sceneVisitedConditionCount} scene-visited condition${
        summary.sceneVisitedConditionCount === 1 ? "" : "s"
      }`
    );
  }
  if (summary.goToSceneEffectCount > 0) {
    rows.push(`${summary.goToSceneEffectCount} go-to-scene effect${summary.goToSceneEffectCount === 1 ? "" : "s"}`);
  }

  return rows;
}

function resolveDeleteSceneOutcomeRows(
  summary: SceneReferenceSummary,
  mode: "cleanup" | "rewire",
  replacementSceneName?: string,
  replacementLocationName?: string
): string[] {
  const rows = ["The selected scene and its hotspots will be deleted."];

  if (summary.removedSubtitleTrackIds.length > 0) {
    rows.push(
      `Deleted ${summary.removedSubtitleTrackIds.length} subtitle track${
        summary.removedSubtitleTrackIds.length === 1 ? "" : "s"
      } on this scene.`
    );
  }

  if (countSceneReferences(summary) === 0) {
    rows.push("No other scene references need to be updated.");
    return rows;
  }

  if (mode === "cleanup") {
    rows.push("References to the deleted scene will be removed from the rest of the project.");

    if (summary.isStartScene) {
      rows.push("The project start scene will remain invalid until you choose a new one.");
    }

    return rows;
  }

  if (replacementSceneName) {
    rows.push(`References to the deleted scene will point to ${replacementSceneName}.`);
  } else {
    rows.push("References will be rewired after you choose a replacement scene.");
  }

  if (summary.isStartScene && replacementLocationName) {
    rows.push(`The start location will move to ${replacementLocationName}.`);
  }

  return rows;
}

function resolveDirectoryValidationMessage(
  requiresProjectDirectory: boolean,
  isLoading: boolean,
  isInspectingDirectory: boolean,
  directoryInspection: ProjectDirectoryInspection | undefined
): string {
  if (!requiresProjectDirectory) {
    return "Browse to a folder to continue.";
  }

  if (isLoading) {
    return "Loading folder contents...";
  }

  if (isInspectingDirectory) {
    return "Checking this folder for a valid MAGE2 project...";
  }

  if (directoryInspection?.isProjectDirectory) {
    return directoryInspection.projectName
      ? `Detected project: ${directoryInspection.projectName}`
      : "Valid MAGE2 project detected.";
  }

  return directoryInspection?.reason ?? "This folder does not contain a valid MAGE2 project.";
}

function buildBreadcrumbs(inputPath: string): Array<{ label: string; path: string }> {
  const trimmedPath = inputPath.trim();
  if (!trimmedPath) {
    return [];
  }

  if (/^[a-zA-Z]:/.test(trimmedPath)) {
    const normalizedRoot = `${trimmedPath.slice(0, 2).toUpperCase()}\\`;
    const remainder = trimmedPath
      .slice(normalizedRoot.length)
      .split(/[\\/]+/)
      .filter(Boolean);
    const breadcrumbs = [{ label: normalizedRoot.slice(0, 2), path: normalizedRoot }];
    let currentPath = normalizedRoot;

    for (const segment of remainder) {
      currentPath = `${trimTrailingSeparator(currentPath)}\\${segment}`;
      breadcrumbs.push({ label: segment, path: currentPath });
    }

    return breadcrumbs;
  }

  if (trimmedPath.startsWith("\\\\")) {
    const segments = trimmedPath.split("\\").filter(Boolean);
    let currentPath = "";
    return segments.map((segment, index) => {
      currentPath =
        index === 0
          ? `\\\\${segment}`
          : index === 1
            ? `${currentPath}\\${segment}`
            : `${currentPath}\\${segment}`;
      return {
        label: index === 0 ? `\\\\${segment}` : segment,
        path: currentPath
      };
    });
  }

  const segments = trimmedPath.split("/").filter(Boolean);
  const breadcrumbs = [{ label: "/", path: "/" }];
  let currentPath = "/";

  for (const segment of segments) {
    currentPath = currentPath === "/" ? `/${segment}` : `${currentPath}/${segment}`;
    breadcrumbs.push({ label: segment, path: currentPath });
  }

  return breadcrumbs;
}

function trimTrailingSeparator(inputPath: string): string {
  if (/^[a-zA-Z]:\\$/.test(inputPath)) {
    return inputPath.slice(0, 2);
  }

  return inputPath.replace(/[\\/]+$/, "");
}

function isSamePath(leftPath: string | undefined, rightPath: string | undefined): boolean {
  if (!leftPath || !rightPath) {
    return false;
  }

  return leftPath.trim().replaceAll("/", "\\").toLowerCase() === rightPath.trim().replaceAll("/", "\\").toLowerCase();
}

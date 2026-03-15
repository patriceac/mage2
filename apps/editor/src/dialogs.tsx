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

interface DialogContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  confirmCloseProject: (projectName: string) => Promise<"save" | "discard" | "cancel">;
  chooseDirectory: (options: DirectoryDialogOptions) => Promise<string | undefined>;
  pickFiles: (options: FileDialogOptions) => Promise<string[]>;
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
                  className="button-secondary"
                  disabled={!listing?.parentPath}
                  onClick={() => listing?.parentPath && navigateToPath(listing.parentPath)}
                >
                  Up
                </button>
                <button type="submit" className="button-secondary">
                  Go
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={!listing?.path}
                  onClick={() => listing?.path && navigateToPath(listing.path)}
                >
                  Refresh
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
  footer
}: {
  title: string;
  description?: string;
  wide?: boolean;
  tone?: "default" | "danger";
  onCancel: () => void;
  children: ReactNode;
  footer?: ReactNode;
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

        <div className="dialog-shell__body">{children}</div>
        {footer ? <div className="dialog-shell__footer">{footer}</div> : null}
      </div>
    </div>
  );
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

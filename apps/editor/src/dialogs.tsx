import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import type { ProjectBundle } from "@mage2/schema";
import { DropdownSelect } from "./DropdownSelect";
import { resolveFileUrl } from "./file-url-cache";
import { translateRuntimeMessage, useEditorI18n, type EditorTranslator } from "./i18n";
import {
  countInventoryItemReferences,
  countSceneReferences,
  type InventoryItemReferenceSummary,
  type SceneReferenceSummary
} from "./project-helpers";
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
  modifiedAtMs?: number;
  sizeBytes?: number;
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

type FileBrowserIconName =
  | "check"
  | "chevron-right"
  | "close"
  | "desktop"
  | "document"
  | "download"
  | "drive"
  | "file"
  | "folder"
  | "folder-filled"
  | "folder-plus"
  | "go"
  | "grid"
  | "home"
  | "image"
  | "info"
  | "list"
  | "refresh"
  | "sort"
  | "up"
  | "warning";

const FILE_BROWSER_IMAGE_EXTENSIONS = new Set([".apng", ".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);

interface ConfirmDialogOptions {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

interface AlertDialogOptions {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: "default" | "danger";
}

interface PromptTextDialogOptions {
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
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

export interface DeleteInventoryItemDialogOptions {
  project: ProjectBundle;
  itemId: string;
  referenceSummary: InventoryItemReferenceSummary;
}

export type DeleteInventoryItemDialogResult =
  | {
      action: "cancel";
    }
  | {
      action: "cleanup";
    }
  | {
      action: "rewire";
      replacementItemId: string;
    };

export type RuntimeExportFormat = "windows" | "web";
export type RuntimeExportMode = "preview" | "release";

interface DialogContextValue {
  alert: (options: AlertDialogOptions) => Promise<void>;
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  promptText: (options: PromptTextDialogOptions) => Promise<string | undefined>;
  confirmCloseProject: (projectName: string) => Promise<"save" | "discard" | "cancel">;
  chooseRuntimeExport: (projectName: string, mode: RuntimeExportMode) => Promise<RuntimeExportFormat | undefined>;
  chooseDirectory: (options: DirectoryDialogOptions) => Promise<string | undefined>;
  pickFiles: (options: FileDialogOptions) => Promise<string[]>;
  deleteScene: (options: DeleteSceneDialogOptions) => Promise<DeleteSceneDialogResult>;
  deleteInventoryItem: (options: DeleteInventoryItemDialogOptions) => Promise<DeleteInventoryItemDialogResult>;
}

type DialogRequest =
  | {
      kind: "alert";
      options: AlertDialogOptions;
      resolve: () => void;
    }
  | {
      kind: "confirm";
      options: ConfirmDialogOptions;
      resolve: (value: boolean) => void;
    }
  | {
      kind: "prompt-text";
      options: PromptTextDialogOptions;
      resolve: (value: string | undefined) => void;
    }
  | {
      kind: "close-project";
      projectName: string;
      resolve: (value: "save" | "discard" | "cancel") => void;
    }
  | {
      kind: "runtime-export";
      projectName: string;
      mode: RuntimeExportMode;
      resolve: (value: RuntimeExportFormat | undefined) => void;
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
    }
  | {
      kind: "delete-inventory-item";
      options: DeleteInventoryItemDialogOptions;
      resolve: (value: DeleteInventoryItemDialogResult) => void;
    };

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogQueue, setDialogQueue] = useState<DialogRequest[]>([]);
  const activeDialog = dialogQueue[0];
  const dialogReturnFocusRef = useRef<HTMLElement | undefined>(undefined);

  const enqueueDialog = useCallback((request: DialogRequest) => {
    const returnFocusElement = resolveDialogReturnFocusElement();
    setDialogQueue((currentQueue) => {
      if (currentQueue.length === 0) {
        dialogReturnFocusRef.current = returnFocusElement;
      }
      return [...currentQueue, request];
    });
  }, []);

  const dialogApi = useMemo<DialogContextValue>(
    () => ({
      alert: (options) =>
        new Promise<void>((resolve) => {
          enqueueDialog({ kind: "alert", options, resolve });
        }),
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          enqueueDialog({ kind: "confirm", options, resolve });
        }),
      promptText: (options) =>
        new Promise<string | undefined>((resolve) => {
          enqueueDialog({ kind: "prompt-text", options, resolve });
        }),
      confirmCloseProject: (projectName) =>
        new Promise<"save" | "discard" | "cancel">((resolve) => {
          enqueueDialog({ kind: "close-project", projectName, resolve });
        }),
      chooseRuntimeExport: (projectName, mode) =>
        new Promise<RuntimeExportFormat | undefined>((resolve) => {
          enqueueDialog({ kind: "runtime-export", projectName, mode, resolve });
        }),
      chooseDirectory: (options) =>
        new Promise<string | undefined>((resolve) => {
          enqueueDialog({ kind: "directory", options, resolve });
        }),
      pickFiles: (options) =>
        new Promise<string[]>((resolve) => {
          enqueueDialog({ kind: "files", options, resolve });
        }),
      deleteScene: (options) =>
        new Promise<DeleteSceneDialogResult>((resolve) => {
          enqueueDialog({ kind: "delete-scene", options, resolve });
        }),
      deleteInventoryItem: (options) =>
        new Promise<DeleteInventoryItemDialogResult>((resolve) => {
          enqueueDialog({ kind: "delete-inventory-item", options, resolve });
        })
    }),
    [enqueueDialog]
  );

  useEffect(() => {
    if (activeDialog || !dialogReturnFocusRef.current) {
      return;
    }

    const returnFocusElement = dialogReturnFocusRef.current;
    dialogReturnFocusRef.current = undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      if (returnFocusElement.isConnected && !returnFocusElement.closest("[inert]")) {
        returnFocusElement.focus({ preventScroll: true });
      }
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [activeDialog]);

  const dismissActiveDialog = () => {
    setDialogQueue((currentQueue) => currentQueue.slice(1));
  };

  return (
    <DialogContext.Provider value={dialogApi}>
      <div
        className="dialog-background"
        data-dialog-background
        inert={activeDialog ? true : undefined}
        aria-hidden={activeDialog ? true : undefined}
      >
        {children}
      </div>
      {activeDialog?.kind === "alert" ? (
        <AlertDialog
          options={activeDialog.options}
          onResolve={() => {
            activeDialog.resolve();
            dismissActiveDialog();
          }}
        />
      ) : null}
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
      {activeDialog?.kind === "prompt-text" ? (
        <PromptTextDialog
          options={activeDialog.options}
          onResolve={(value) => {
            activeDialog.resolve(value);
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
      {activeDialog?.kind === "runtime-export" ? (
        <RuntimeExportDialog
          projectName={activeDialog.projectName}
          mode={activeDialog.mode}
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
      {activeDialog?.kind === "delete-inventory-item" ? (
        <DeleteInventoryItemDialog
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
    // i18n-ignore-next-line -- developer invariant, never presented as editor chrome
    throw new Error("useDialogs must be used inside a DialogProvider.");
  }

  return context;
}

export function shouldToggleFileSelectionOnClick(clickDetail: number): boolean {
  return clickDetail <= 1;
}

export function resolveDialogFocusLoopIndex(
  currentIndex: number,
  focusableCount: number,
  backward: boolean
): number {
  if (focusableCount <= 0) {
    return -1;
  }
  if (currentIndex < 0) {
    return backward ? focusableCount - 1 : 0;
  }

  const direction = backward ? -1 : 1;
  return (currentIndex + direction + focusableCount) % focusableCount;
}

function FileBrowserIcon({ name }: { name: FileBrowserIconName }) {
  switch (name) {
    case "check":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m5 13 4 4L19 7" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "close":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      );
    case "desktop":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8" />
          <path d="M12 16v4" />
        </svg>
      );
    case "document":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        </svg>
      );
    case "download":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3v11" />
          <path d="m7 9 5 5 5-5" />
          <path d="M5 19h14" />
        </svg>
      );
    case "drive":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 14h16l-2-8H6z" />
          <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
          <path d="M7 17h.01" />
          <path d="M11 17h6" />
        </svg>
      );
    case "file":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
      );
    case "folder":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      );
    case "folder-filled":
      return (
        <svg className="file-browser__filled-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2.25 2.25H18.5A2.5 2.5 0 0 1 21 9.75v6.75A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
        </svg>
      );
    case "folder-plus":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M12 11v5" />
          <path d="M9.5 13.5h5" />
        </svg>
      );
    case "go":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      );
    case "grid":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <rect x="14" y="14" width="6" height="6" rx="1" />
        </svg>
      );
    case "home":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m4 11 8-7 8 7" />
          <path d="M6 10v10h12V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      );
    case "image":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="m8 15 3-3 3 3 2-2 3 3" />
          <path d="M8 9h.01" />
        </svg>
      );
    case "info":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6" />
          <path d="M12 7h.01" />
        </svg>
      );
    case "list":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 6h12" />
          <path d="M8 12h12" />
          <path d="M8 18h12" />
          <path d="M4 6h.01" />
          <path d="M4 12h.01" />
          <path d="M4 18h.01" />
        </svg>
      );
    case "refresh":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M20 12a8 8 0 0 1-13 6" />
          <path d="M4 12a8 8 0 0 1 13-6" />
          <path d="M17 3v4h-4" />
          <path d="M7 21v-4h4" />
        </svg>
      );
    case "sort":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m8 9 4-4 4 4" />
          <path d="m16 15-4 4-4-4" />
        </svg>
      );
    case "up":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 19V5" />
          <path d="m6 11 6-6 6 6" />
        </svg>
      );
    case "warning":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3 2.5 20h19z" />
          <path d="M12 9v5" />
          <path d="M12 17h.01" />
        </svg>
      );
    default:
      return null;
  }
}

function resolveLocationIconName(location: FileBrowserLocation): FileBrowserIconName {
  const label = location.label.toLowerCase();

  if (label.includes("home")) {
    return "home";
  }

  if (label.includes("desktop")) {
    return "desktop";
  }

  if (label.includes("documents")) {
    return "document";
  }

  if (label.includes("downloads")) {
    return "download";
  }

  return location.kind === "drive" ? "drive" : "folder";
}

function resolveEntryIconName(entry: FileBrowserEntry): FileBrowserIconName {
  if (entry.kind === "directory") {
    return "folder-filled";
  }

  return isFileBrowserImageEntry(entry) ? "image" : "file";
}

function isFileBrowserImageEntry(entry: FileBrowserEntry): boolean {
  return entry.kind === "file" && Boolean(entry.extension && FILE_BROWSER_IMAGE_EXTENSIONS.has(entry.extension.toLowerCase()));
}

function resolveFileBrowserType(entry: FileBrowserEntry, t: EditorTranslator): string {
  if (entry.kind === "directory") {
    return t("File folder");
  }

  if (!entry.extension) {
    return t("File");
  }

  return t("{extension} file", { extension: entry.extension.replace(/^\./, "").toUpperCase() });
}

export function formatFileBrowserModified(modifiedAtMs: number | undefined, locale = "en"): string {
  if (!modifiedAtMs) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })
    .format(new Date(modifiedAtMs));
}

export function formatFileBrowserSize(entry: FileBrowserEntry, locale = "en"): string {
  if (entry.kind === "directory" || entry.sizeBytes === undefined) {
    return "—";
  }

  if (entry.sizeBytes < 1024) {
    return new Intl.NumberFormat(locale, { style: "unit", unit: "byte", unitDisplay: "short" }).format(entry.sizeBytes);
  }

  const units = ["kilobyte", "megabyte", "gigabyte"] as const;
  let size = entry.sizeBytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: units[unitIndex],
    unitDisplay: "short",
    maximumFractionDigits: size >= 10 ? 0 : 1
  }).format(size);
}

function formatBreadcrumbLabel(label: string): string {
  return label === "_MAGE2_TESTBED" ? "MAGE2_TESTBED" : label;
}

function FileBrowserEntryMedia({ entry }: { entry: FileBrowserEntry }) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewFailed, setPreviewFailed] = useState(false);
  const canPreview = isFileBrowserImageEntry(entry);

  useEffect(() => {
    let cancelled = false;

    if (!canPreview) {
      setPreviewUrl(undefined);
      setPreviewFailed(false);
      return () => {
        cancelled = true;
      };
    }

    setPreviewUrl(undefined);
    setPreviewFailed(false);

    resolveFileUrl(entry.path)
      .then((nextUrl) => {
        if (!cancelled) {
          setPreviewUrl(nextUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canPreview, entry.path]);

  if (canPreview && previewUrl && !previewFailed) {
    return (
      <span className="file-browser__entry-thumbnail" aria-hidden="true">
        <img src={previewUrl} alt="" decoding="async" loading="lazy" onError={() => setPreviewFailed(true)} />
      </span>
    );
  }

  return (
    <span className="file-browser__entry-icon" aria-hidden="true">
      <FileBrowserIcon name={resolveEntryIconName(entry)} />
    </span>
  );
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
  const { t } = useEditorI18n();
  return (
    <DialogFrame
      title={t(options.title)}
      wide={false}
      tone={options.tone}
      onCancel={onCancel}
      footer={
        <div className="dialog-actions">
          <button type="button" className="button-secondary" onClick={onCancel} autoFocus>
            {options.cancelLabel ? t(options.cancelLabel) : t("Cancel")}
          </button>
          <button
            type="button"
            className={options.tone === "danger" ? "button-danger" : "button-accent"}
            onClick={onConfirm}
          >
            {options.confirmLabel ? t(options.confirmLabel) : t("Confirm")}
          </button>
        </div>
      }
    >
      <div className="dialog-stack">{options.body}</div>
    </DialogFrame>
  );
}

function AlertDialog({
  options,
  onResolve
}: {
  options: AlertDialogOptions;
  onResolve: () => void;
}) {
  const { t } = useEditorI18n();
  return (
    <DialogFrame
      title={t(options.title)}
      wide={false}
      tone={options.tone}
      onCancel={onResolve}
      footer={
        <div className="dialog-actions">
          <button type="button" className="button-accent" onClick={onResolve} autoFocus>
            {options.confirmLabel ? t(options.confirmLabel) : t("Close")}
          </button>
        </div>
      }
    >
      <div className="dialog-stack">{options.body}</div>
    </DialogFrame>
  );
}

function PromptTextDialog({
  options,
  onResolve
}: {
  options: PromptTextDialogOptions;
  onResolve: (value: string | undefined) => void;
}) {
  const { t } = useEditorI18n();
  const [value, setValue] = useState(options.initialValue ?? "");
  const trimmedValue = value.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedValue) {
      return;
    }

    onResolve(value);
  }

  return (
    <DialogFrame
      title={t(options.title)}
      description={options.description ? t(options.description) : undefined}
      wide={false}
      onCancel={() => onResolve(undefined)}
      footer={
        <div className="dialog-actions">
          <button type="button" className="button-secondary" onClick={() => onResolve(undefined)}>
            {options.cancelLabel ? t(options.cancelLabel) : t("Cancel")}
          </button>
          <button type="submit" form="prompt-text-dialog-form" className="button-accent" disabled={!trimmedValue}>
            {options.confirmLabel ? t(options.confirmLabel) : t("Continue")}
          </button>
        </div>
      }
    >
      <form id="prompt-text-dialog-form" className="dialog-stack" onSubmit={handleSubmit}>
        <label>
          <span className="field-label--inset">{t(options.label)}</span>
          <input
            value={value}
            placeholder={options.placeholder ? t(options.placeholder) : undefined}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
      </form>
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
  const { t } = useEditorI18n();
  return (
    <DialogFrame
      title={t("Save Changes?")}
      onCancel={() => onResolve("cancel")}
      footer={
        <div className="dialog-actions dialog-actions--spread">
          <button type="button" className="button-secondary" onClick={() => onResolve("cancel")}>
            {t("Cancel")}
          </button>
          <div className="dialog-button-row">
            <button type="button" className="button-danger" onClick={() => onResolve("discard")}>
              {t("Discard Changes")}
            </button>
            <button type="button" className="button-accent" onClick={() => onResolve("save")} autoFocus>
              {t("Save and Close")}
            </button>
          </div>
        </div>
      }
    >
      <div className="dialog-stack">
        <p>{t("Save changes to “{projectName}” before closing MAGE2?", { projectName })}</p>
        <div className="dialog-callout">
          <strong>{t("Unsaved work detected")}</strong>
          <p>{t("Discarding these changes cannot be undone.")}</p>
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
  const { locale, t } = useEditorI18n();
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
  const referenceRows = resolveSceneReferenceRows(options.referenceSummary, locale, t);
  const outcomeRows = resolveDeleteSceneOutcomeRows(
    options.referenceSummary,
    mode,
    replacementScene?.name,
    replacementLocationName,
    t
  );
  const confirmLabel = mode === "rewire" ? t("Delete and Rewire") : t("Delete and Clean");
  const summaryMessage =
    mode === "rewire"
      ? replacementScene
        ? t("References will be rewired to {name}.", { name: replacementScene.name })
        : t("Choose a replacement scene to finish rewiring.")
      : options.referenceSummary.isStartScene
      ? t("Cleanup will leave the project with an invalid start scene until you choose a new one.")
      : t("Cleanup will remove references to the deleted scene and keep the rest of the project intact.");

  return (
    <DialogFrame
      title={deletedScene ? t("Delete {name}?", { name: deletedScene.name }) : t("Delete Scene")}
      description={t("Choose whether to clean references to this scene or redirect them to another scene before deleting it.")}
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
              {t("Keep Scene")}
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
            ? t('Delete "{name}" from this project? This removes the scene and its hotspots from the world.', {
                name: deletedScene.name
              })
            : t("This scene is no longer available to delete.")}
        </p>

        <div className="dialog-callout dialog-callout--danger">
          <strong>{t("Permanent scene deletion")}</strong>
          <p>
            {t("Dialogue trees remain in the project, but any references to this scene inside them will be cleaned or rewired.")}
          </p>
        </div>

        <div className="scene-delete-dialog__preview-grid">
          <ScenePreviewCard
            label={t("Deleting")}
            scene={deletedScene}
            locationName={deletedLocationName}
            asset={deletedAsset}
            emptyTitle={t("Scene not found")}
            emptyBody={t("The selected scene could not be loaded.")}
          />
          <ScenePreviewCard
            label={t("Replacement")}
            scene={mode === "rewire" ? replacementScene : undefined}
            locationName={replacementLocationName}
            asset={replacementAsset}
            emptyTitle={t("No replacement scene")}
            emptyBody={
              mode === "rewire"
                ? t("Pick a replacement scene to preview the rewire target here.")
                : t("Switch to Rewire references if you want to preview a replacement scene.")
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
              <strong>{t("Clean References")}</strong>
              <span>{t("Remove references to the deleted scene, even if that leaves the project invalid.")}</span>
            </button>
            <button
              type="button"
              className={mode === "rewire" ? "scene-delete-choice scene-delete-choice--active" : "scene-delete-choice"}
              disabled={!canRewire}
              onClick={() => setMode("rewire")}
            >
              <strong>{t("Rewire References")}</strong>
              <span>
                {canRewire
                  ? t("Redirect scene references to another scene that you choose.")
                  : t("Create another scene first if you want to rewire references instead of cleaning them.")}
              </span>
            </button>
          </div>
        </section>

        {mode === "rewire" ? (
          <label>
            <span className="field-label--inset">{t("Replacement Scene")}</span>
            <DropdownSelect value={replacementSceneId} onChange={(event) => setReplacementSceneId(event.target.value)}>
              <option value="">{t("Select a replacement scene")}</option>
              {replacementCandidates.map((scene) => {
                const locationName =
                  options.project.locations.items.find((location) => location.id === scene.locationId)?.name ??
                  t("Unknown location");
                return (
                  <option key={scene.id} value={scene.id}>
                    {t("{sceneName} ({locationName})", { sceneName: scene.name, locationName })}
                  </option>
                );
              })}
            </DropdownSelect>
          </label>
        ) : null}

        <div className="dialog-callout">
          <strong>{t("References found")}</strong>
          {referenceRows.length > 0 ? (
            <ul className="dialog-detail-list">
              {referenceRows.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          ) : (
            <p>{t("No cross-scene references will need cleanup or rewiring.")}</p>
          )}
        </div>

        <div className="dialog-callout">
          <strong>{t("What happens next")}</strong>
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

function DeleteInventoryItemDialog({
  options,
  onResolve
}: {
  options: DeleteInventoryItemDialogOptions;
  onResolve: (value: DeleteInventoryItemDialogResult) => void;
}) {
  const { locale, t } = useEditorI18n();
  const deletedItem = options.project.inventory.items.find((item) => item.id === options.itemId);
  const replacementCandidates = options.project.inventory.items.filter((item) => item.id !== options.itemId);
  const referenceCount = countInventoryItemReferences(options.referenceSummary);
  const hasReferences = referenceCount > 0;
  const [mode, setMode] = useState<"cleanup" | "rewire">("cleanup");
  const [replacementItemId, setReplacementItemId] = useState("");
  const replacementItem = replacementCandidates.find((item) => item.id === replacementItemId);
  const canRewire = hasReferences && replacementCandidates.length > 0;
  const confirmDisabled = !deletedItem || (mode === "rewire" && !replacementItem);
  const referenceRows = resolveInventoryItemReferenceRows(options.referenceSummary, locale, t);
  const formattedReferenceCount = new Intl.NumberFormat(locale).format(referenceCount);
  const summaryMessage =
    mode === "rewire"
      ? replacementItem
        ? t("All {count} references will point to {name}.", {
            count: formattedReferenceCount,
            name: replacementItem.name
          })
        : t("Choose a replacement item to finish rewiring.")
      : hasReferences
        ? t("All {count} references will be removed with the item.", { count: formattedReferenceCount })
        : t("No project references need cleanup.");
  const confirmLabel = mode === "rewire" ? t("Replace and Delete") : hasReferences ? t("Delete and Clean") : t("Delete Item");

  return (
    <DialogFrame
      title={deletedItem ? t("Delete {name}?", { name: deletedItem.name }) : t("Delete Inventory Item")}
      description={
        hasReferences
          ? t("Choose whether to remove this item's references or redirect them to another item before deletion.")
          : t("This item is not referenced by any scene or dialogue content.")
      }
      wide
      tone="danger"
      onCancel={() => onResolve({ action: "cancel" })}
      footer={
        <div className="dialog-actions dialog-actions--spread">
          <div className="dialog-selection-summary">{summaryMessage}</div>
          <div className="dialog-button-row">
            <button type="button" className="button-secondary" onClick={() => onResolve({ action: "cancel" })} autoFocus>
              {t("Keep Item")}
            </button>
            <button
              type="button"
              className="button-danger"
              disabled={confirmDisabled}
              onClick={() =>
                onResolve(
                  mode === "rewire" && replacementItem
                    ? { action: "rewire", replacementItemId: replacementItem.id }
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
      <div className="dialog-stack inventory-delete-dialog">
        <div className="dialog-callout dialog-callout--danger">
          <strong>{t("Permanent item deletion")}</strong>
          <p>{t("The item's image asset stays in Assets, but generated name and description text may be removed.")}</p>
        </div>

        {hasReferences ? (
          <section className="scene-delete-dialog__section">
            <div className="scene-delete-dialog__choice-grid">
              <button
                type="button"
                className={mode === "cleanup" ? "scene-delete-choice scene-delete-choice--active" : "scene-delete-choice"}
                onClick={() => setMode("cleanup")}
              >
                <strong>{t("Clean References")}</strong>
                <span>{t("Remove item requirements, conditions, effects, pickup links, and placement links.")}</span>
              </button>
              <button
                type="button"
                className={mode === "rewire" ? "scene-delete-choice scene-delete-choice--active" : "scene-delete-choice"}
                disabled={!canRewire}
                onClick={() => setMode("rewire")}
              >
                <strong>{t("Rewire References")}</strong>
                <span>
                  {canRewire
                    ? t("Redirect every item reference to another inventory item.")
                    : t("Create another item first if references should be rewired instead of removed.")}
                </span>
              </button>
            </div>
          </section>
        ) : null}

        {mode === "rewire" && hasReferences ? (
          <label>
            <span className="field-label--inset">{t("Replacement Item")}</span>
            <DropdownSelect value={replacementItemId} onChange={(event) => setReplacementItemId(event.target.value)}>
              <option value="">{t("Select a replacement item")}</option>
              {replacementCandidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </DropdownSelect>
          </label>
        ) : null}

        <div className="dialog-callout">
          <strong>{hasReferences ? t("References found") : t("No references found")}</strong>
          {referenceRows.length > 0 ? (
            <ul className="dialog-detail-list">
              {referenceRows.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          ) : (
            <p>{t("This item can be deleted without changing scene or dialogue wiring.")}</p>
          )}
        </div>

        <div className="dialog-callout">
          <strong>{t("What happens next")}</strong>
          <ul className="dialog-detail-list">
            <li>{t("The inventory item is removed from the project.")}</li>
            <li>
              {mode === "rewire" && replacementItem
                ? t("Every reference is redirected to {name}.", { name: replacementItem.name })
                : hasReferences
                  ? t("Every authored reference to this item is removed.")
                  : t("No authored references need to change.")}
            </li>
            <li>{t("The image asset remains available in Assets for reuse or separate deletion.")}</li>
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
  const { locale, t } = useEditorI18n();
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
  const [isAuthorizingDirectory, setIsAuthorizingDirectory] = useState(false);
  const [newDirectoryName, setNewDirectoryName] = useState("");
  const [entryViewMode, setEntryViewMode] = useState<"list" | "grid">("list");
  const requiresProjectDirectory =
    mode === "directory" && "directoryRequirement" in options && options.directoryRequirement === "project";
  const canCreateDirectory = mode === "files" || ("allowCreateDirectory" in options && options.allowCreateDirectory);

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

        const message = translateRuntimeMessage(error, t);
        setErrorMessage(t("Could not load browse locations: {message}", { message }));
      }
    }

    void loadLocations();

    return () => {
      cancelled = true;
    };
  }, [options.initialPath, t]);

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

        const message = translateRuntimeMessage(error, t);
        setErrorMessage(t("Could not open this folder: {message}", { message }));
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
  }, [requestedPath, t]);

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

        const message = translateRuntimeMessage(error, t);
        setDirectoryInspection({
          isProjectDirectory: false,
          reason: t("Could not inspect this folder: {message}", { message })
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
  }, [listing?.path, requiresProjectDirectory, t]);

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
    options.confirmLabel ? t(options.confirmLabel) : mode === "directory" ? t("Use This Folder") : t("Import Selected Files");

  const directoryValidationMessage = resolveDirectoryValidationMessage(
    requiresProjectDirectory,
    isLoading,
    isInspectingDirectory,
    directoryInspection,
    t
  );
  const directoryValidationTone =
    requiresProjectDirectory && directoryInspection && !directoryInspection.isProjectDirectory
      ? "warning"
      : "default";
  const footerMessage =
    mode === "directory"
      ? directoryValidationMessage
      : selectedPaths.length > 0
        ? t("Selected files: {count}", { count: new Intl.NumberFormat(locale).format(selectedPaths.length) })
        : t("Select one or more files to continue.");
  const instructionText = requiresProjectDirectory
    ? t("Choose a folder that contains a valid MAGE2 project.")
    : mode === "directory"
      ? t("Choose the current folder when you reach the project location you want.")
      : t("Click a folder to open it, or double-click a file to choose it.");

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
      const message = translateRuntimeMessage(error, t);
      setErrorMessage(t("Could not create the folder: {message}", { message }));
    }
  }

  async function handleAuthorizeDirectory() {
    try {
      setIsAuthorizingDirectory(true);
      setErrorMessage(undefined);
      const authorizedPath = await window.editorApi.authorizeDirectory();
      if (!authorizedPath) {
        return;
      }
      setLocations((currentLocations) =>
        currentLocations.some((location) => location.path === authorizedPath)
          ? currentLocations
          : [
              ...currentLocations,
              {
                label: t("Granted folder"),
                path: authorizedPath,
                kind: "favorite"
              }
            ]
      );
      navigateToPath(authorizedPath);
    } catch (error) {
      const message = translateRuntimeMessage(error, t);
      setErrorMessage(t("Could not grant access to the folder: {message}", { message }));
    } finally {
      setIsAuthorizingDirectory(false);
    }
  }

  function toggleFileSelection(filePath: string) {
    setSelectedPaths((currentSelection) =>
      currentSelection.includes(filePath)
        ? currentSelection.filter((selectedPath) => selectedPath !== filePath)
        : [...currentSelection, filePath]
    );
  }

  function resolveFileSelection(filePath: string) {
    onResolve([filePath]);
  }

  return (
    <DialogFrame
      title={t(options.title)}
      description={options.description ? t(options.description) : undefined}
      wide
      shellClassName="dialog-shell--file-browser"
      bodyClassName="dialog-shell__body--file-browser"
      onCancel={() => onResolve(mode === "directory" ? undefined : [])}
      footer={
        <div className="dialog-actions dialog-actions--spread">
          <div className="dialog-selection-summary">
            <FileBrowserIcon name="info" />
            <span>{footerMessage}</span>
          </div>
          <div className="dialog-button-row">
            <button
              type="button"
              className="button-secondary"
              onClick={() => onResolve(mode === "directory" ? undefined : [])}
              autoFocus
            >
              {t("Cancel")}
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
            <p className="dialog-eyebrow">{t("Locations")}</p>
            <div className="file-browser__locations">
              {locations.map((location) => {
                const isActive = isActiveFileBrowserLocation(listing?.path ?? requestedPath, location);
                return (
                  <button
                    key={location.path}
                    type="button"
                    className={isActive ? "file-browser__location file-browser__location--active" : "file-browser__location"}
                    onClick={() => navigateToPath(location.path)}
                    title={location.path}
                  >
                    <span className="file-browser__location-icon" aria-hidden="true">
                      <FileBrowserIcon name={resolveLocationIconName(location)} />
                    </span>
                    <strong>{t(location.label)}</strong>
                  </button>
                );
              })}
              <button
                type="button"
                className="file-browser__location"
                onClick={() => void handleAuthorizeDirectory()}
                disabled={isAuthorizingDirectory}
                title={t("Grant access to a folder outside the listed locations")}
              >
                <span className="file-browser__location-icon" aria-hidden="true">
                  <FileBrowserIcon name="folder" />
                </span>
                <strong>{isAuthorizingDirectory ? t("Opening...") : t("Choose another folder...")}</strong>
              </button>
            </div>
          </div>
        </aside>

        <section className="file-browser__main">
          <div className="file-browser__toolbar">
            {breadcrumbItems.length > 0 ? (
              <div className="file-browser__breadcrumbs" aria-label={t("Current path")} dir="ltr">
                {breadcrumbItems.map((breadcrumb, index) => (
                  <button
                    key={breadcrumb.path}
                    type="button"
                    className={
                      index === breadcrumbItems.length - 1
                        ? "file-browser__breadcrumb file-browser__breadcrumb--active"
                        : "file-browser__breadcrumb"
                    }
                    onClick={() => navigateToPath(breadcrumb.path)}
                    title={breadcrumb.path}
                  >
                    <span>{formatBreadcrumbLabel(breadcrumb.label)}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <form className="file-browser__path-form" onSubmit={handlePathSubmit}>
              <label className="file-browser__path-field">
                <span className="sr-only">{t("Current path")}</span>
                <input
                  value={pathInput}
                  onChange={(event) => setPathInput(event.target.value)}
                  placeholder={t("Enter a path")}
                  title={t("Type a path directly and press Go.")}
                  dir="ltr"
                />
              </label>
              <div className="dialog-button-row">
                <button
                  type="button"
                  className="button-secondary file-browser__toolbar-button"
                  disabled={!listing?.parentPath}
                  onClick={() => listing?.parentPath && navigateToPath(listing.parentPath)}
                  aria-label={t("Go to parent folder")}
                  title={t("Go to parent folder")}
                >
                  <FileBrowserIcon name="up" />
                </button>
                <button
                  type="submit"
                  className="button-secondary file-browser__toolbar-button"
                  aria-label={t("Go to path")}
                  title={t("Go to path")}
                >
                  <FileBrowserIcon name="go" />
                </button>
                <button
                  type="button"
                  className="button-secondary file-browser__toolbar-button"
                  disabled={!listing?.path}
                  onClick={() => listing?.path && navigateToPath(listing.path)}
                  aria-label={t("Refresh current folder")}
                  title={t("Refresh current folder")}
                >
                  <FileBrowserIcon name="refresh" />
                </button>
                {canCreateDirectory ? (
                  <button
                    type="button"
                    className="button-secondary file-browser__toolbar-button"
                    disabled={!listing?.path}
                    onClick={() => setIsCreatingDirectory((currentValue) => !currentValue)}
                    aria-label={isCreatingDirectory ? t("Hide new folder form") : t("New folder")}
                    title={isCreatingDirectory ? t("Hide new folder form") : t("New folder")}
                  >
                    <FileBrowserIcon name="folder-plus" />
                  </button>
                ) : null}
                <span className="file-browser__view-toggle" aria-label={t("File view mode")}>
                  <button
                    type="button"
                    className={
                      entryViewMode === "list"
                        ? "button-secondary file-browser__toolbar-button file-browser__toolbar-button--active"
                        : "button-secondary file-browser__toolbar-button"
                    }
                    onClick={() => setEntryViewMode("list")}
                    aria-label={t("List view")}
                    title={t("List view")}
                  >
                    <FileBrowserIcon name="list" />
                  </button>
                  <button
                    type="button"
                    className={
                      entryViewMode === "grid"
                        ? "button-secondary file-browser__toolbar-button file-browser__toolbar-button--active"
                        : "button-secondary file-browser__toolbar-button"
                    }
                    onClick={() => setEntryViewMode("grid")}
                    aria-label={t("Grid view")}
                    title={t("Grid view")}
                  >
                    <FileBrowserIcon name="grid" />
                  </button>
                </span>
              </div>
            </form>

            {canCreateDirectory && isCreatingDirectory ? (
              <div className="file-browser__folder-tools">
                <input
                  value={newDirectoryName}
                  onChange={(event) => setNewDirectoryName(event.target.value)}
                  placeholder={t("New folder name")}
                  title={t("Create a new folder inside the current directory.")}
                />
                <div className="dialog-button-row">
                  <button type="button" className="button-secondary" onClick={() => setIsCreatingDirectory(false)}>
                    {t("Cancel")}
                  </button>
                  <button
                    type="button"
                    className="button-accent"
                    disabled={newDirectoryName.trim().length === 0 || !listing?.path}
                    onClick={() => void handleCreateDirectory()}
                  >
                    <FileBrowserIcon name="folder-plus" />
                    <span>{t("Create Folder")}</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="file-browser__status-row">
            <span>{instructionText}</span>
            {hiddenFileCount > 0 ? (
              <span className="file-browser__hidden-count">
                {t("Unsupported files hidden: {count}", {
                  count: new Intl.NumberFormat(locale).format(hiddenFileCount)
                })}
              </span>
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

          <div
            className={
              entryViewMode === "grid" ? "file-browser__entries file-browser__entries--grid" : "file-browser__entries"
            }
          >
            {entryViewMode === "list" ? (
              <div className="file-browser__entry-header" aria-hidden="true">
                <span className="file-browser__entry-name-heading">
                  {t("Name")}
                  <FileBrowserIcon name="sort" />
                </span>
                <span>{t("Type")}</span>
                <span>{t("Modified")}</span>
                <span>{t("Size")}</span>
              </div>
            ) : null}
            {isLoading ? <p className="muted">{t("Loading folder contents...")}</p> : null}
            {!isLoading && errorMessage ? <p className="dialog-error">{errorMessage}</p> : null}
            {!isLoading && !errorMessage && visibleEntries?.length === 0 ? (
              <p className="muted">
                {mode === "directory"
                  ? t("No folders are available here.")
                  : t("No supported files were found in this folder.")}
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
                      onClick={(event) => {
                        if (entry.kind === "directory") {
                          navigateToPath(entry.path);
                          return;
                        }

                        if (!shouldToggleFileSelectionOnClick(event.detail)) {
                          return;
                        }

                        toggleFileSelection(entry.path);
                      }}
                      onDoubleClick={() => {
                        if (entry.kind === "file") {
                          resolveFileSelection(entry.path);
                        }
                      }}
                      title={entry.path}
                    >
                      <span className="file-browser__entry-name-cell">
                        <FileBrowserEntryMedia entry={entry} />
                        <strong>{entry.name}</strong>
                      </span>
                      <span>{resolveFileBrowserType(entry, t)}</span>
                      <span>{formatFileBrowserModified(entry.modifiedAtMs, locale)}</span>
                      <span>{formatFileBrowserSize(entry, locale)}</span>
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

const DIALOG_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function resolveDialogReturnFocusElement(): HTMLElement | undefined {
  if (typeof document === "undefined" || !(document.activeElement instanceof HTMLElement)) {
    return undefined;
  }

  const activeElement = document.activeElement;
  const containingMenu = activeElement.closest<HTMLElement>("[role='menu'][id]");
  if (containingMenu?.id) {
    const controllingElement = Array.from(document.querySelectorAll<HTMLElement>("[aria-controls]")).find(
      (element) => element.getAttribute("aria-controls") === containingMenu.id
    );
    if (controllingElement) {
      return controllingElement;
    }
  }

  return activeElement;
}

function getDialogFocusableElements(shell: HTMLElement): HTMLElement[] {
  return Array.from(shell.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.closest("[inert]") || element.getAttribute("aria-hidden") === "true") {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

function resolveInitialDialogFocusElement(shell: HTMLElement): HTMLElement | undefined {
  const focusableElements = getDialogFocusableElements(shell);
  return (
    focusableElements.find(
      (element) => element.hasAttribute("autofocus") || element.dataset.dialogInitialFocus === "true"
    ) ??
    focusableElements.find((element) => element.matches("input, select, textarea")) ??
    focusableElements.find((element) => !element.classList.contains("dialog-close")) ??
    focusableElements[0]
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
  bodyClassName,
  shellClassName
}: {
  title: string;
  description?: string;
  wide?: boolean;
  tone?: "default" | "danger";
  onCancel: () => void;
  children: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
  shellClassName?: string;
}) {
  const { t } = useEditorI18n();
  const titleId = useId();
  const descriptionId = useId();
  const isFileBrowserShell = shellClassName?.includes("dialog-shell--file-browser") ?? false;
  const shellRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      const shell = shellRef.current;
      if (!shell) {
        return;
      }

      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && shell.contains(activeElement)) {
        return;
      }

      const initialFocusElement = resolveInitialDialogFocusElement(shell);
      (initialFocusElement ?? shell).focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancelRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const shell = shellRef.current;
      if (!shell) {
        return;
      }
      const focusableElements = getDialogFocusableElements(shell);
      if (focusableElements.length === 0) {
        event.preventDefault();
        shell.focus({ preventScroll: true });
        return;
      }

      event.preventDefault();
      const currentIndex = focusableElements.findIndex((element) => element === document.activeElement);
      const nextIndex = resolveDialogFocusLoopIndex(currentIndex, focusableElements.length, event.shiftKey);
      focusableElements[nextIndex]?.focus({ preventScroll: true });
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return (
    <div className="dialog-overlay">
      <div
        ref={shellRef}
        className={
          wide
            ? `dialog-shell dialog-shell--wide dialog-shell--${tone}${shellClassName ? ` ${shellClassName}` : ""}`
            : `dialog-shell dialog-shell--${tone}${shellClassName ? ` ${shellClassName}` : ""}`
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="dialog-shell__header">
          <div className="dialog-title-group">
            <p className="dialog-eyebrow">{t("MAGE2")}</p>
            <h2 id={titleId}>{title}</h2>
            {description ? (
              <p id={descriptionId} className="muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className={isFileBrowserShell ? "dialog-close dialog-close--icon-only" : "dialog-close"}
            onClick={onCancel}
            aria-label={t("Close dialog")}
          >
            {isFileBrowserShell ? <FileBrowserIcon name="close" /> : null}
            <span className={isFileBrowserShell ? "sr-only" : undefined}>{t("Close")}</span>
          </button>
        </div>

        <div className={bodyClassName ? `dialog-shell__body ${bodyClassName}` : "dialog-shell__body"}>{children}</div>
        {footer ? <div className="dialog-shell__footer">{footer}</div> : null}
      </div>
    </div>
  );
}

function resolveSceneReferenceRows(summary: SceneReferenceSummary, locale: string, t: EditorTranslator): string[] {
  const rows: string[] = [];
  const formatCount = (count: number) => new Intl.NumberFormat(locale).format(count);

  if (summary.isStartScene) {
    rows.push(t("Start scene references: {count}", { count: formatCount(1) }));
  }
  if (summary.locationReferenceCount > 0) {
    rows.push(
      t("Location scene list references: {count}", { count: formatCount(summary.locationReferenceCount) })
    );
  }
  if (summary.hotspotTargetReferenceCount > 0) {
    rows.push(
      t("Hotspot target references: {count}", { count: formatCount(summary.hotspotTargetReferenceCount) })
    );
  }
  if (summary.sceneVisitedConditionCount > 0) {
    rows.push(
      t("Scene-visited conditions: {count}", { count: formatCount(summary.sceneVisitedConditionCount) })
    );
  }
  if (summary.goToSceneEffectCount > 0) {
    rows.push(
      t("Go-to-scene effects: {count}", { count: formatCount(summary.goToSceneEffectCount) })
    );
  }

  return rows;
}

function resolveInventoryItemReferenceRows(
  summary: InventoryItemReferenceSummary,
  locale: string,
  t: EditorTranslator
): string[] {
  const rows: string[] = [];
  const formatCount = (count: number) => new Intl.NumberFormat(locale).format(count);

  if (summary.hotspotItemReferenceCount > 0) {
    rows.push(
      t("Hotspot item links: {count}", { count: formatCount(summary.hotspotItemReferenceCount) })
    );
  }
  if (summary.placementReferenceCount > 0) {
    rows.push(
      t("Placement links: {count}", { count: formatCount(summary.placementReferenceCount) })
    );
  }
  if (summary.requiredItemReferenceCount > 0) {
    rows.push(
      t("Required-item references: {count}", { count: formatCount(summary.requiredItemReferenceCount) })
    );
  }
  if (summary.inventoryConditionCount > 0) {
    rows.push(
      t("Inventory conditions: {count}", { count: formatCount(summary.inventoryConditionCount) })
    );
  }
  if (summary.inventoryEffectCount > 0) {
    rows.push(
      t("Inventory effects: {count}", { count: formatCount(summary.inventoryEffectCount) })
    );
  }

  return rows;
}

function resolveDeleteSceneOutcomeRows(
  summary: SceneReferenceSummary,
  mode: "cleanup" | "rewire",
  replacementSceneName: string | undefined,
  replacementLocationName: string | undefined,
  t: EditorTranslator
): string[] {
  const rows = [t("The selected scene and its hotspots will be deleted.")];

  if (countSceneReferences(summary) === 0) {
    rows.push(t("No other scene references need to be updated."));
    return rows;
  }

  if (mode === "cleanup") {
    rows.push(t("References to the deleted scene will be removed from the rest of the project."));

    if (summary.isStartScene) {
      rows.push(t("The project start scene will remain invalid until you choose a new one."));
    }

    return rows;
  }

  if (replacementSceneName) {
    rows.push(t("References to the deleted scene will point to {name}.", { name: replacementSceneName }));
  } else {
    rows.push(t("References will be rewired after you choose a replacement scene."));
  }

  if (summary.isStartScene && replacementLocationName) {
    rows.push(t("The start location will move to {name}.", { name: replacementLocationName }));
  }

  return rows;
}

function resolveDirectoryValidationMessage(
  requiresProjectDirectory: boolean,
  isLoading: boolean,
  isInspectingDirectory: boolean,
  directoryInspection: ProjectDirectoryInspection | undefined,
  t: EditorTranslator
): string {
  if (!requiresProjectDirectory) {
    return t("Browse to a folder to continue.");
  }

  if (isLoading) {
    return t("Loading folder contents...");
  }

  if (isInspectingDirectory) {
    return t("Checking this folder for a valid MAGE2 project...");
  }

  if (directoryInspection?.isProjectDirectory) {
    return directoryInspection.projectName
      ? t("Detected project: {projectName}", { projectName: directoryInspection.projectName })
      : t("Valid MAGE2 project detected.");
  }

  return directoryInspection?.reason
    ? translateRuntimeMessage(directoryInspection.reason, t)
    : t("This folder does not contain a valid MAGE2 project.");
}

function RuntimeExportDialog({
  projectName,
  mode,
  onResolve
}: {
  projectName: string;
  mode: RuntimeExportMode;
  onResolve: (value: RuntimeExportFormat | undefined) => void;
}) {
  const { t } = useEditorI18n();
  return (
    <DialogFrame
      title={mode === "preview" ? t("Export Preview") : t("Build Release")}
      description={t("Choose what MAGE2 should create for “{projectName}”.", { projectName })}
      wide={false}
      onCancel={() => onResolve(undefined)}
      footer={
        <div className="dialog-actions">
          <button type="button" className="button-secondary" onClick={() => onResolve(undefined)}>
            {t("Cancel")}
          </button>
        </div>
      }
    >
      <div className="runtime-export-options">
        <button
          type="button"
          className="runtime-export-option runtime-export-option--recommended"
          onClick={() => onResolve("windows")}
          autoFocus
        >
          <span className="runtime-export-option__badge" aria-hidden="true">.EXE</span>
          <span className="runtime-export-option__copy">
            <span className="runtime-export-option__heading">
              <strong>{t("Standalone Windows executable")}</strong>
              <span>{t("Recommended")}</span>
            </span>
            <span>{t("Create one portable file that runs without a browser, server, Node.js, or installation.")}</span>
            <small>{t("You will choose its file name and destination next.")}</small>
          </span>
        </button>
        <button
          type="button"
          className="runtime-export-option"
          onClick={() => onResolve("web")}
        >
          <span className="runtime-export-option__badge" aria-hidden="true">WEB</span>
          <span className="runtime-export-option__copy">
            <span className="runtime-export-option__heading">
              <strong>{t("Web build folder")}</strong>
            </span>
            <span>{t("Create a static site for Netlify, Cloudflare Pages, Vercel, or another web host.")}</span>
            <small>{t("MAGE2 will create a managed folder inside the location you choose.")}</small>
          </span>
        </button>
      </div>
    </DialogFrame>
  );
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

function isActiveFileBrowserLocation(currentPath: string | undefined, location: FileBrowserLocation): boolean {
  if (isSamePath(currentPath, location.path)) {
    return true;
  }

  if (!currentPath || location.kind !== "drive") {
    return false;
  }

  const normalizedCurrentPath = ensureTrailingSeparator(currentPath.trim().replaceAll("/", "\\").toLowerCase());
  const normalizedLocationPath = ensureTrailingSeparator(location.path.trim().replaceAll("/", "\\").toLowerCase());
  return normalizedCurrentPath.startsWith(normalizedLocationPath);
}

function ensureTrailingSeparator(inputPath: string): string {
  return /[\\/]$/.test(inputPath) ? inputPath : `${inputPath}\\`;
}

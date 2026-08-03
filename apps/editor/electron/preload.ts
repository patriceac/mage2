import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import type { Asset, AssetCategory, ProjectBundle } from "@mage2/schema";
import type { EditorLaunchOptions } from "./launch-options";
import type { ProjectDirectoryInspection } from "./project-io";
import type { RecentProject } from "./recent-projects";

const initialLaunchOptions = ipcRenderer.sendSync("mage2:get-launch-options-sync") as EditorLaunchOptions;

const editorApi = {
  getLaunchOptionsSync: (): EditorLaunchOptions => initialLaunchOptions,
  onCloseRequested: (handler: () => boolean | Promise<boolean>): (() => void) => {
    const listener = () => {
      void Promise.resolve()
        .then(handler)
        .then((shouldClose) => {
          ipcRenderer.send("mage2:close-response", shouldClose === true);
        })
        .catch(() => {
          ipcRenderer.send("mage2:close-response", false);
        });
    };

    ipcRenderer.on("mage2:request-close", listener);
    ipcRenderer.send("mage2:close-guard-ready");
    return () => {
      ipcRenderer.removeListener("mage2:request-close", listener);
    };
  },
  getRecentProjectsSync: (): RecentProject[] => ipcRenderer.sendSync("mage2:get-recent-projects-sync"),
  getRecentProjects: (): Promise<RecentProject[]> => ipcRenderer.invoke("mage2:get-recent-projects"),
  rememberRecentProject: (projectDir: string, projectName?: string): Promise<RecentProject[]> =>
    ipcRenderer.invoke("mage2:remember-recent-project", projectDir, projectName),
  forgetRecentProject: (projectDir: string): Promise<RecentProject[]> =>
    ipcRenderer.invoke("mage2:forget-recent-project", projectDir),
  revealPath: (targetPath: string): Promise<void> => ipcRenderer.invoke("mage2:reveal-path", targetPath),
  getFileBrowserLocations: () => ipcRenderer.invoke("mage2:get-file-browser-locations"),
  authorizeDirectory: (): Promise<string | undefined> => ipcRenderer.invoke("mage2:authorize-directory"),
  listDirectory: (targetPath: string) => ipcRenderer.invoke("mage2:list-directory", targetPath),
  createDirectory: (parentDirectory: string, directoryName: string) =>
    ipcRenderer.invoke("mage2:create-directory", parentDirectory, directoryName),
  inspectProjectDirectory: (projectDir: string): Promise<ProjectDirectoryInspection> =>
    ipcRenderer.invoke("mage2:inspect-project-directory", projectDir),
  createProject: (projectDir: string, projectName: string): Promise<ProjectBundle> =>
    ipcRenderer.invoke("mage2:create-project", projectDir, projectName),
  loadProject: (projectDir: string): Promise<ProjectBundle> =>
    ipcRenderer.invoke("mage2:load-project", projectDir),
  saveProject: (projectDir: string, project: ProjectBundle) =>
    ipcRenderer.invoke("mage2:save-project", projectDir, project),
  importAssets: (
    projectDir: string,
    locale: string,
    existingAssets: Asset[],
    filePaths: string[],
    category?: AssetCategory
  ): Promise<{
    importedAssets: Asset[];
    duplicateFilePaths: string[];
    duplicateAssets: Array<{ filePath: string; assetId: string }>;
  }> =>
    ipcRenderer.invoke("mage2:import-assets", projectDir, locale, existingAssets, filePaths, category),
  importAssetVariant: (projectDir: string, asset: Asset, locale: string, filePath: string): Promise<Asset> =>
    ipcRenderer.invoke("mage2:import-asset-variant", projectDir, asset, locale, filePath),
  generateProxy: (projectDir: string, asset: Asset, locale: string): Promise<Asset> =>
    ipcRenderer.invoke("mage2:generate-proxy", projectDir, asset, locale),
  deleteManagedAssetFiles: (
    projectDir: string,
    asset: Asset,
    remainingAssets: Asset[]
  ): Promise<{ deletedProxyPaths: string[]; deletedSourcePaths: string[] }> =>
    ipcRenderer.invoke("mage2:delete-managed-asset-files", projectDir, asset, remainingAssets),
  deleteManagedAssetVariantFiles: (
    projectDir: string,
    asset: Asset,
    locale: string,
    remainingAssets: Asset[]
  ): Promise<{ deletedProxyPaths: string[]; deletedSourcePaths: string[] }> =>
    ipcRenderer.invoke("mage2:delete-managed-asset-variant-files", projectDir, asset, locale, remainingAssets),
  exportProject: (projectDir: string, project: ProjectBundle) =>
    ipcRenderer.invoke("mage2:export-project", projectDir, project),
  pathToFileUrl: (inputPath: string): Promise<string> =>
    ipcRenderer.invoke("mage2:path-to-file-url", inputPath),
  getPathForDroppedFile: (file: File): string => {
    const filePath = webUtils.getPathForFile(file);
    if (!filePath) {
      return "";
    }
    return (ipcRenderer.sendSync("mage2:grant-dropped-path-sync", filePath) as string | undefined) ?? "";
  }
};

const editorAutomation = {
  onCommand: (handler: (command: unknown) => unknown | Promise<unknown>): (() => void) => {
    const listener = (_event: IpcRendererEvent, request: { id: string; command: unknown }) => {
      void Promise.resolve()
        .then(() => handler(request.command))
        .then((value) => {
          ipcRenderer.send("mage2:automation-command-result", {
            id: request.id,
            ok: true,
            value
          });
        })
        .catch((error) => {
          ipcRenderer.send("mage2:automation-command-result", {
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          });
        });
    };

    ipcRenderer.on("mage2:automation-command", listener);
    return () => {
      ipcRenderer.removeListener("mage2:automation-command", listener);
    };
  }
};

contextBridge.exposeInMainWorld("editorApi", editorApi);
contextBridge.exposeInMainWorld("editorAutomation", editorAutomation);

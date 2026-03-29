import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Asset, AssetCategory, ProjectBundle } from "@mage2/schema";
import type { EditorLaunchOptions } from "./launch-options";
import type { ProjectDirectoryInspection } from "./project-io";
import type { RecentProject } from "./recent-projects";

const initialLaunchOptions = ipcRenderer.sendSync("mage2:get-launch-options-sync") as EditorLaunchOptions;

const editorApi = {
  getLaunchOptionsSync: (): EditorLaunchOptions => initialLaunchOptions,
  getRecentProjectsSync: (): RecentProject[] => ipcRenderer.sendSync("mage2:get-recent-projects-sync"),
  getRecentProjects: (): Promise<RecentProject[]> => ipcRenderer.invoke("mage2:get-recent-projects"),
  rememberRecentProject: (projectDir: string, projectName?: string): Promise<RecentProject[]> =>
    ipcRenderer.invoke("mage2:remember-recent-project", projectDir, projectName),
  forgetRecentProject: (projectDir: string): Promise<RecentProject[]> =>
    ipcRenderer.invoke("mage2:forget-recent-project", projectDir),
  getFileBrowserLocations: () => ipcRenderer.invoke("mage2:get-file-browser-locations"),
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
  ): Promise<{ importedAssets: Asset[]; duplicateFilePaths: string[] }> =>
    ipcRenderer.invoke("mage2:import-assets", projectDir, locale, existingAssets, filePaths, category),
  importAssetVariant: (projectDir: string, asset: Asset, locale: string, filePath: string): Promise<Asset> =>
    ipcRenderer.invoke("mage2:import-asset-variant", projectDir, asset, locale, filePath),
  parseSubtitleFiles: (
    filePaths: string[]
  ): Promise<{
    parsedFiles: Array<{ filePath: string; fileName: string; cues: Array<{ startMs: number; endMs: number; text: string }> }>;
    failedFiles: Array<{ filePath: string; reason: string }>;
  }> => ipcRenderer.invoke("mage2:parse-subtitles", filePaths),
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
  getPathForDroppedFile: (file: File): string => webUtils.getPathForFile(file)
};

contextBridge.exposeInMainWorld("editorApi", editorApi);

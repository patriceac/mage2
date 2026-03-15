import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { Asset, ProjectBundle } from "@mage2/schema";
import type { RecentProject } from "./recent-projects";

const editorApi = {
  getRecentProjects: (): Promise<RecentProject[]> => ipcRenderer.invoke("mage2:get-recent-projects"),
  rememberRecentProject: (projectDir: string, projectName?: string): Promise<RecentProject[]> =>
    ipcRenderer.invoke("mage2:remember-recent-project", projectDir, projectName),
  forgetRecentProject: (projectDir: string): Promise<RecentProject[]> =>
    ipcRenderer.invoke("mage2:forget-recent-project", projectDir),
  getFileBrowserLocations: () => ipcRenderer.invoke("mage2:get-file-browser-locations"),
  listDirectory: (targetPath: string) => ipcRenderer.invoke("mage2:list-directory", targetPath),
  createDirectory: (parentDirectory: string, directoryName: string) =>
    ipcRenderer.invoke("mage2:create-directory", parentDirectory, directoryName),
  createProject: (projectDir: string, projectName: string): Promise<ProjectBundle> =>
    ipcRenderer.invoke("mage2:create-project", projectDir, projectName),
  loadProject: (projectDir: string): Promise<ProjectBundle> =>
    ipcRenderer.invoke("mage2:load-project", projectDir),
  saveProject: (projectDir: string, project: ProjectBundle) =>
    ipcRenderer.invoke("mage2:save-project", projectDir, project),
  importAssets: (filePaths: string[]): Promise<Asset[]> =>
    ipcRenderer.invoke("mage2:import-assets", filePaths),
  generateProxy: (projectDir: string, asset: Asset): Promise<Asset> =>
    ipcRenderer.invoke("mage2:generate-proxy", projectDir, asset),
  exportProject: (projectDir: string, project: ProjectBundle) =>
    ipcRenderer.invoke("mage2:export-project", projectDir, project),
  pathToFileUrl: (inputPath: string): Promise<string> =>
    ipcRenderer.invoke("mage2:path-to-file-url", inputPath),
  getPathForDroppedFile: (file: File): string => webUtils.getPathForFile(file)
};

contextBridge.exposeInMainWorld("editorApi", editorApi);

import type { Asset, ProjectBundle } from "@mage2/schema";

interface RecentProjectSummary {
  projectDir: string;
  projectName: string;
  lastOpenedAt: string;
}

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

declare global {
  interface Window {
    editorApi: {
      getRecentProjects(): Promise<RecentProjectSummary[]>;
      rememberRecentProject(projectDir: string, projectName?: string): Promise<RecentProjectSummary[]>;
      forgetRecentProject(projectDir: string): Promise<RecentProjectSummary[]>;
      getFileBrowserLocations(): Promise<FileBrowserLocation[]>;
      listDirectory(targetPath: string): Promise<FileBrowserDirectoryListing>;
      createDirectory(parentDirectory: string, directoryName: string): Promise<string>;
      createProject(projectDir: string, projectName: string): Promise<ProjectBundle>;
      loadProject(projectDir: string): Promise<ProjectBundle>;
      saveProject(projectDir: string, project: ProjectBundle): Promise<{
        project: ProjectBundle;
        validationReport: { valid: boolean; issues: Array<{ level: string; code: string; message: string; entityId?: string }> };
      }>;
      importAssets(filePaths: string[]): Promise<Asset[]>;
      generateProxy(projectDir: string, asset: Asset): Promise<Asset>;
      exportProject(projectDir: string, project: ProjectBundle): Promise<{
        outputDirectory: string;
        buildManifest: unknown;
        validationReport: { valid: boolean; issues: Array<{ level: string; code: string; message: string; entityId?: string }> };
      }>;
      pathToFileUrl(inputPath: string): Promise<string>;
      getPathForDroppedFile(file: File): string;
    };
  }
}

export {};

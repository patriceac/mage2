import type { Asset, AssetCategory, ProjectBundle } from "@mage2/schema";

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

interface ProjectDirectoryInspection {
  isProjectDirectory: boolean;
  projectName?: string;
  reason?: string;
}

interface EditorLaunchOptions {
  projectDir?: string;
  tab?: "world" | "scenes" | "assets" | "dialogue" | "inventory" | "localization" | "playtest";
}

declare global {
  interface Window {
    editorApi: {
      getLaunchOptionsSync(): EditorLaunchOptions;
      getRecentProjectsSync(): RecentProjectSummary[];
      getRecentProjects(): Promise<RecentProjectSummary[]>;
      rememberRecentProject(projectDir: string, projectName?: string): Promise<RecentProjectSummary[]>;
      forgetRecentProject(projectDir: string): Promise<RecentProjectSummary[]>;
      getFileBrowserLocations(): Promise<FileBrowserLocation[]>;
      listDirectory(targetPath: string): Promise<FileBrowserDirectoryListing>;
      createDirectory(parentDirectory: string, directoryName: string): Promise<string>;
      inspectProjectDirectory(projectDir: string): Promise<ProjectDirectoryInspection>;
      createProject(projectDir: string, projectName: string): Promise<ProjectBundle>;
      loadProject(projectDir: string): Promise<ProjectBundle>;
      saveProject(projectDir: string, project: ProjectBundle): Promise<{
        project: ProjectBundle;
        validationReport: { valid: boolean; issues: Array<{ level: string; code: string; message: string; entityId?: string }> };
      }>;
      importAssets(
        projectDir: string,
        locale: string,
        existingAssets: Asset[],
        filePaths: string[],
        category?: AssetCategory
      ): Promise<{
        importedAssets: Asset[];
        duplicateFilePaths: string[];
      }>;
      importAssetVariant(projectDir: string, asset: Asset, locale: string, filePath: string): Promise<Asset>;
      parseSubtitleFiles(filePaths: string[]): Promise<{
        parsedFiles: Array<{
          filePath: string;
          fileName: string;
          cues: Array<{ startMs: number; endMs: number; text: string }>;
        }>;
        failedFiles: Array<{ filePath: string; reason: string }>;
      }>;
      generateProxy(projectDir: string, asset: Asset, locale: string): Promise<Asset>;
      deleteManagedAssetFiles(
        projectDir: string,
        asset: Asset,
        remainingAssets: Asset[]
      ): Promise<{ deletedProxyPaths: string[]; deletedSourcePaths: string[] }>;
      deleteManagedAssetVariantFiles(
        projectDir: string,
        asset: Asset,
        locale: string,
        remainingAssets: Asset[]
      ): Promise<{ deletedProxyPaths: string[]; deletedSourcePaths: string[] }>;
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

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

interface EditorLaunchOptions {
  projectDir?: string;
  tab?: "world" | "scenes" | "assets" | "dialogue" | "inventory" | "localization" | "playtest";
}

type RuntimeExportFormat = "windows" | "web";
type RuntimeExportMode = "preview" | "release";

type RuntimeExportProgressPhase =
  | "preparing"
  | "building-web"
  | "assembling-player"
  | "compressing"
  | "publishing"
  | "complete";

interface RuntimeExportProgress {
  format: RuntimeExportFormat;
  phase: RuntimeExportProgressPhase;
  progress: number;
  elapsedSeconds: number;
  estimatedSecondsRemaining?: number;
  payloadBytes?: number;
}

interface RuntimeExportRequest {
  format: RuntimeExportFormat;
  mode?: RuntimeExportMode;
  destinationPath?: string;
}

type RuntimeExportResult =
  | { canceled: true }
  | {
      canceled?: false;
      format?: RuntimeExportFormat;
      outputPath?: string;
      outputDirectory: string;
      buildManifest: unknown;
      validationReport: {
        valid: boolean;
        mode?: RuntimeExportMode;
        issues: Array<{ level: string; code: string; message: string; entityId?: string }>;
        readiness?: {
          ready: boolean;
          status: "not-ready" | "ready-with-warnings" | "ready";
          blockers: Array<{ level: string; code: string; message: string; entityId?: string }>;
          warnings: Array<{ level: string; code: string; message: string; entityId?: string }>;
        };
      };
    };

declare global {
  interface Window {
    editorApi: {
      getLaunchOptionsSync(): EditorLaunchOptions;
      getPreferredSystemLanguagesSync(): string[];
      onCloseRequested(handler: () => boolean | Promise<boolean>): () => void;
      getRecentProjectsSync(): RecentProjectSummary[];
      getRecentProjects(): Promise<RecentProjectSummary[]>;
      rememberRecentProject(projectDir: string, projectName?: string): Promise<RecentProjectSummary[]>;
      forgetRecentProject(projectDir: string): Promise<RecentProjectSummary[]>;
      revealPath(targetPath: string): Promise<void>;
      getFileBrowserLocations(): Promise<FileBrowserLocation[]>;
      authorizeDirectory(): Promise<string | undefined>;
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
        duplicateAssets: Array<{ filePath: string; assetId: string }>;
      }>;
      importAssetVariant(projectDir: string, asset: Asset, locale: string, filePath: string): Promise<Asset>;
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
      exportProject(
        projectDir: string,
        project: ProjectBundle,
        request?: RuntimeExportRequest
      ): Promise<RuntimeExportResult>;
      onRuntimeExportProgress(handler: (progress: RuntimeExportProgress) => void): () => void;
      pathToFileUrl(inputPath: string): Promise<string>;
      getPathForDroppedFile(file: File): string;
    };
    editorAutomation?: {
      onCommand(handler: (command: unknown) => unknown | Promise<unknown>): () => void;
    };
  }
}

export {};

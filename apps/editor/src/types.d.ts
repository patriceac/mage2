import type { Asset, ProjectBundle } from "@mage2/schema";

declare global {
  interface Window {
    editorApi: {
      chooseProjectDirectory(): Promise<string | undefined>;
      createProject(projectDir: string, projectName: string): Promise<ProjectBundle>;
      loadProject(projectDir: string): Promise<ProjectBundle>;
      saveProject(projectDir: string, project: ProjectBundle): Promise<{
        project: ProjectBundle;
        validationReport: { valid: boolean; issues: Array<{ level: string; code: string; message: string; entityId?: string }> };
      }>;
      pickAssets(): Promise<string[]>;
      importAssets(filePaths: string[]): Promise<Asset[]>;
      generateProxy(projectDir: string, asset: Asset): Promise<Asset>;
      exportProject(projectDir: string, project: ProjectBundle): Promise<{
        outputDirectory: string;
        buildManifest: unknown;
        validationReport: { valid: boolean; issues: Array<{ level: string; code: string; message: string; entityId?: string }> };
      }>;
      pathToFileUrl(inputPath: string): Promise<string>;
    };
  }
}

export {};

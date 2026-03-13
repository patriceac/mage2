import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { pathToFileURL } from "node:url";
import { createImportedAsset, generateProxy } from "@mage2/media";
import { parseProjectBundle, validateProject, type Asset, type ProjectBundle } from "@mage2/schema";
import { exportProjectBundle } from "./exporter";
import { createProjectInDirectory, loadProjectFromDirectory, saveProjectToDirectory } from "./project-io";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1280,
    minHeight: 840,
    backgroundColor: "#0b1117",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpcHandlers(): void {
  ipcMain.handle("mage2:choose-project-directory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle("mage2:create-project", async (_event, projectDir: string, projectName: string) => {
    return createProjectInDirectory(projectDir, projectName);
  });

  ipcMain.handle("mage2:load-project", async (_event, projectDir: string) => {
    return loadProjectFromDirectory(projectDir);
  });

  ipcMain.handle("mage2:save-project", async (_event, projectDir: string, project: ProjectBundle) => {
    const normalized = parseProjectBundle(project);
    await saveProjectToDirectory(projectDir, normalized);
    return {
      project: normalized,
      validationReport: validateProject(normalized)
    };
  });

  ipcMain.handle("mage2:pick-assets", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Media",
          extensions: ["mp4", "mov", "webm", "png", "jpg", "jpeg", "webp", "wav", "mp3", "ogg", "srt", "vtt", "svg"]
        }
      ]
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("mage2:import-assets", async (_event, filePaths: string[]) => {
    const importedAssets = await Promise.all(filePaths.map((filePath) => createImportedAsset(filePath)));
    return importedAssets;
  });

  ipcMain.handle("mage2:generate-proxy", async (_event, projectDir: string, asset: Asset) => {
    return generateProxy(asset, projectDir);
  });

  ipcMain.handle("mage2:export-project", async (_event, projectDir: string, project: ProjectBundle) => {
    const normalized = parseProjectBundle(project);
    return exportProjectBundle(projectDir, normalized);
  });

  ipcMain.handle("mage2:path-to-file-url", async (_event, inputPath: string) => {
    return pathToFileURL(inputPath).toString();
  });
}

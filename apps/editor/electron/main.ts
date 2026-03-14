import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, screen } from "electron";
import { pathToFileURL } from "node:url";
import { createImportedAsset, generateProxy } from "@mage2/media";
import { parseProjectBundle, validateProject, type Asset, type ProjectBundle } from "@mage2/schema";
import { exportProjectBundle } from "./exporter";
import { createProjectInDirectory, loadProjectFromDirectory, saveProjectToDirectory } from "./project-io";
import { createWindowState, loadWindowState, resolveWindowState, saveWindowState } from "./window-state";

let mainWindow: BrowserWindow | null = null;
const WINDOW_STATE_SAVE_DELAY_MS = 150;

function createWindow(): void {
  const restoredWindowState = resolveWindowState(
    loadWindowState(app.getPath("userData")),
    screen.getAllDisplays().map((display) => display.workArea)
  );

  mainWindow = new BrowserWindow({
    width: restoredWindowState.width,
    height: restoredWindowState.height,
    ...(restoredWindowState.x !== undefined && restoredWindowState.y !== undefined
      ? {
          x: restoredWindowState.x,
          y: restoredWindowState.y
        }
      : {}),
    minWidth: 1280,
    minHeight: 840,
    backgroundColor: "#0b1117",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.removeMenu();
  registerWindowStatePersistence(mainWindow);

  if (restoredWindowState.isMaximized) {
    mainWindow.maximize();
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
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

function registerWindowStatePersistence(window: BrowserWindow): void {
  let saveTimer: NodeJS.Timeout | undefined;
  const userDataPath = app.getPath("userData");

  const persist = () => {
    if (window.isDestroyed()) {
      return;
    }

    saveWindowState(userDataPath, createWindowState(window.getNormalBounds(), window.isMaximized()));
  };

  const schedulePersist = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      persist();
    }, WINDOW_STATE_SAVE_DELAY_MS);
  };

  const persistNow = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    persist();
  };

  window.on("move", schedulePersist);
  window.on("resize", schedulePersist);
  window.on("maximize", persistNow);
  window.on("unmaximize", persistNow);
  window.on("close", persistNow);
}

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

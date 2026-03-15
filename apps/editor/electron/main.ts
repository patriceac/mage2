import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, type MessageBoxOptions } from "electron";
import { pathToFileURL } from "node:url";
import { createImportedAsset, generateProxy } from "@mage2/media";
import { parseProjectBundle, validateProject, type Asset, type ProjectBundle } from "@mage2/schema";
import { MEDIA_DIALOG_FILTER_EXTENSIONS } from "../src/asset-file-types";
import { exportProjectBundle } from "./exporter";
import { createProjectInDirectory, loadProjectFromDirectory, saveProjectToDirectory } from "./project-io";
import { forgetRecentProject, loadRecentProjects, rememberRecentProject, saveRecentProjects } from "./recent-projects";
import { createWindowState, loadWindowState, resolveWindowState, saveWindowState } from "./window-state";

let mainWindow: BrowserWindow | null = null;
const WINDOW_STATE_SAVE_DELAY_MS = 150;
const APP_NAME = "MAGE2 Editor";
const LEGACY_USER_DATA_DIRNAME = "Electron";

app.setName(APP_NAME);

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

  if (restoredWindowState.x !== undefined && restoredWindowState.y !== undefined) {
    mainWindow.setBounds({
      x: restoredWindowState.x,
      y: restoredWindowState.y,
      width: restoredWindowState.width,
      height: restoredWindowState.height
    });
  } else {
    mainWindow.setSize(restoredWindowState.width, restoredWindowState.height);
  }

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
  migrateLegacyUserData();
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

function migrateLegacyUserData(): void {
  const userDataPath = app.getPath("userData");
  const legacyUserDataPath = path.join(app.getPath("appData"), LEGACY_USER_DATA_DIRNAME);

  if (path.resolve(userDataPath) === path.resolve(legacyUserDataPath)) {
    return;
  }

  for (const fileName of ["window-state.json", "recent-projects.json"]) {
    const sourcePath = path.join(legacyUserDataPath, fileName);
    const targetPath = path.join(userDataPath, fileName);

    if (!existsSync(sourcePath) || existsSync(targetPath)) {
      continue;
    }

    mkdirSync(path.dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle("mage2:confirm-close-project", async (_event, projectName: string) => {
    const dialogOptions: MessageBoxOptions = {
      type: "question",
      buttons: ["Save", "Don't Save", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: "Close Project",
      message: `Save changes to ${projectName}?`,
      detail: "If you close this project now, your unsaved changes will be lost."
    };
    const result = mainWindow
      ? await dialog.showMessageBox(mainWindow, dialogOptions)
      : await dialog.showMessageBox(dialogOptions);

    switch (result.response) {
      case 0:
        return "save";
      case 1:
        return "discard";
      default:
        return "cancel";
    }
  });

  ipcMain.handle("mage2:get-recent-projects", async () => {
    return loadRecentProjects(app.getPath("userData"));
  });

  ipcMain.handle("mage2:remember-recent-project", async (_event, projectDir: string, projectName?: string) => {
    const userDataPath = app.getPath("userData");
    const recentProjects = rememberRecentProject(loadRecentProjects(userDataPath), projectDir, projectName);
    saveRecentProjects(userDataPath, recentProjects);
    return recentProjects;
  });

  ipcMain.handle("mage2:forget-recent-project", async (_event, projectDir: string) => {
    const userDataPath = app.getPath("userData");
    const recentProjects = forgetRecentProject(loadRecentProjects(userDataPath), projectDir);
    saveRecentProjects(userDataPath, recentProjects);
    return recentProjects;
  });

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
          extensions: [...MEDIA_DIALOG_FILTER_EXTENSIONS]
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

import path from "node:path";
import { app, BrowserWindow, ipcMain, Menu, screen } from "electron";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import {
  deleteManagedAssetFiles,
  deleteManagedAssetVariantFiles,
  generateProxy,
  importAssetsToProject,
  importAssetVariantToProject,
  parseSubtitleFiles
} from "@mage2/media";
import { parseProjectBundle, validateProject, type Asset, type AssetCategory, type ProjectBundle } from "@mage2/schema";
import appMetadata from "../app-metadata.json";
import { exportProjectBundle } from "./exporter";
import { createSubdirectory, getFileBrowserLocations, listDirectoryContents } from "./file-browser";
import {
  createProjectInDirectory,
  inspectProjectDirectory,
  loadProjectFromDirectory,
  saveProjectToDirectory
} from "./project-io";
import { forgetRecentProject, loadRecentProjects, rememberRecentProject, saveRecentProjects } from "./recent-projects";
import { createWindowState, loadWindowState, resolveWindowState, saveWindowState } from "./window-state";

let mainWindow: BrowserWindow | null = null;
const WINDOW_STATE_SAVE_DELAY_MS = 150;
const APP_NAME = appMetadata.productName;
const APP_ID = appMetadata.appId;
const WINDOW_ICON_FILENAME = "icon.png";

app.setName(APP_NAME);

if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

function createWindow(): void {
  const restoredWindowState = resolveWindowState(
    loadWindowState(app.getPath("userData")),
    screen.getAllDisplays().map((display) => display.workArea)
  );
  const windowIconPath = resolveWindowIconPath();

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
    ...(windowIconPath ? { icon: windowIconPath } : {}),
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

function resolveWindowIconPath(): string | undefined {
  const candidatePath = app.isPackaged
    ? path.join(process.resourcesPath, WINDOW_ICON_FILENAME)
    : path.resolve(__dirname, "..", "..", "..", "build", WINDOW_ICON_FILENAME);

  return existsSync(candidatePath) ? candidatePath : undefined;
}

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
  ipcMain.on("mage2:get-recent-projects-sync", (event) => {
    event.returnValue = loadRecentProjects(app.getPath("userData"));
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

  ipcMain.handle("mage2:get-file-browser-locations", async () => {
    return getFileBrowserLocations();
  });

  ipcMain.handle("mage2:list-directory", async (_event, targetPath: string) => {
    return listDirectoryContents(targetPath);
  });

  ipcMain.handle("mage2:create-directory", async (_event, parentDirectory: string, directoryName: string) => {
    return createSubdirectory(parentDirectory, directoryName);
  });

  ipcMain.handle("mage2:inspect-project-directory", async (_event, projectDir: string) => {
    return inspectProjectDirectory(projectDir);
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

  ipcMain.handle(
    "mage2:import-assets",
    async (
      _event,
      projectDir: string,
      locale: string,
      existingAssets: Asset[],
      filePaths: string[],
      category?: AssetCategory
    ) => {
      return importAssetsToProject(filePaths, projectDir, locale, existingAssets, { category });
    }
  );

  ipcMain.handle(
    "mage2:import-asset-variant",
    async (_event, projectDir: string, asset: Asset, locale: string, filePath: string) => {
      return importAssetVariantToProject(filePath, projectDir, asset, locale);
    }
  );

  ipcMain.handle("mage2:parse-subtitles", async (_event, filePaths: string[]) => {
    return parseSubtitleFiles(filePaths);
  });

  ipcMain.handle("mage2:generate-proxy", async (_event, projectDir: string, asset: Asset, locale: string) => {
    return generateProxy(asset, locale, projectDir);
  });

  ipcMain.handle(
    "mage2:delete-managed-asset-files",
    async (_event, projectDir: string, asset: Asset, remainingAssets: Asset[]) => {
      return deleteManagedAssetFiles(asset, projectDir, remainingAssets);
    }
  );

  ipcMain.handle(
    "mage2:delete-managed-asset-variant-files",
    async (_event, projectDir: string, asset: Asset, locale: string, remainingAssets: Asset[]) => {
      return deleteManagedAssetVariantFiles(asset, locale, projectDir, remainingAssets);
    }
  );

  ipcMain.handle("mage2:export-project", async (_event, projectDir: string, project: ProjectBundle) => {
    const normalized = parseProjectBundle(project);
    return exportProjectBundle(projectDir, normalized);
  });

  ipcMain.handle("mage2:path-to-file-url", async (_event, inputPath: string) => {
    return pathToFileURL(inputPath).toString();
  });
}

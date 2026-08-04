import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  screen,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from "electron";
import { existsSync } from "node:fs";
import {
  deleteManagedAssetFiles,
  deleteManagedAssetVariantFiles,
  generateProxy,
  importAssetsToProject,
  importAssetVariantToProject
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
import { parseEditorLaunchOptions, resolveEditorLaunchArguments } from "./launch-options";
import { forgetRecentProject, loadRecentProjects, rememberRecentProject, saveRecentProjects } from "./recent-projects";
import { resolveEditorWindowChromeOptions } from "./window-chrome";
import { createWindowState, loadWindowState, resolveWindowState, saveWindowState } from "./window-state";
import { startEditorAutomationServer } from "./automation-server";
import { FilesystemCapabilities } from "./filesystem-capabilities";
import { assertTrustedIpcSender, resolveTrustedRendererUrl } from "./ipc-security";
import {
  installSecureProtocolHandlers,
  PACKAGED_RENDERER_URL,
  registerSecureSchemes
} from "./secure-protocols";
import { installWindowSecurity } from "./window-security";

let mainWindow: BrowserWindow | null = null;
let stopAutomationServer: (() => void) | undefined;
let closeGuardReady = false;
let closeRequestPending = false;
let allowWindowClose = false;
const WINDOW_STATE_SAVE_DELAY_MS = 150;
const APP_NAME = appMetadata.productName;
const APP_ID = appMetadata.appId;
const WINDOW_ICON_FILENAME = "icon.png";
const filesystemCapabilities = new FilesystemCapabilities();
const trustedRendererUrl = resolveTrustedRendererUrl(
  process.env.VITE_DEV_SERVER_URL,
  PACKAGED_RENDERER_URL
);
let pendingLaunchOptions = parseEditorLaunchOptions(
  resolveEditorLaunchArguments(process.argv, Boolean(process.defaultApp)),
  process.cwd()
);

registerSecureSchemes();
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
    ...resolveEditorWindowChromeOptions(process.platform),
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      devTools: !app.isPackaged,
      spellcheck: false
    }
  });
  closeGuardReady = false;
  closeRequestPending = false;
  allowWindowClose = false;
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

  registerWindowCloseGuard(mainWindow);
  registerWindowStatePersistence(mainWindow);
  installWindowSecurity(mainWindow, trustedRendererUrl);

  if (restoredWindowState.isMaximized) {
    mainWindow.maximize();
  }

  void mainWindow.loadURL(trustedRendererUrl);

  mainWindow.on("closed", () => {
    mainWindow = null;
    closeGuardReady = false;
    closeRequestPending = false;
    allowWindowClose = false;
  });
}

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  installSecureProtocolHandlers(path.join(__dirname, "..", "dist"), filesystemCapabilities);
  await initializeFilesystemCapabilities();
  registerIpcHandlers();
  createWindow();
  stopAutomationServer = startEditorAutomationServer({
    getWindow: () => mainWindow,
    validateSender: (event) => assertTrustedIpcSender(event, mainWindow, trustedRendererUrl)
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((error) => {
  console.error("MAGE2 Editor failed to initialize securely.", error);
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  stopAutomationServer?.();
  stopAutomationServer = undefined;
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

function registerWindowCloseGuard(window: BrowserWindow): void {
  window.webContents.on("did-start-loading", () => {
    closeGuardReady = false;
    closeRequestPending = false;
  });

  window.on("close", (event) => {
    if (allowWindowClose || !closeGuardReady || window.webContents.isDestroyed()) {
      return;
    }

    event.preventDefault();
    if (closeRequestPending) {
      return;
    }

    closeRequestPending = true;
    window.webContents.send("mage2:request-close");
  });
}

function registerIpcHandlers(): void {
  onTrustedIpc("mage2:close-guard-ready", () => {
    closeGuardReady = true;
  });

  onTrustedIpc("mage2:close-response", (_event, shouldClose: boolean) => {
    closeRequestPending = false;
    if (shouldClose !== true) {
      return;
    }

    allowWindowClose = true;
    mainWindow?.close();
  });

  onTrustedIpc("mage2:get-launch-options-sync", (event) => {
    event.returnValue = pendingLaunchOptions;
    pendingLaunchOptions = {};
  });

  onTrustedIpc("mage2:get-preferred-system-languages-sync", (event) => {
    event.returnValue = app.getPreferredSystemLanguages();
  });

  onTrustedIpc("mage2:get-recent-projects-sync", (event) => {
    event.returnValue = loadRecentProjects(app.getPath("userData"));
  });

  onTrustedIpc("mage2:grant-dropped-path-sync", (event, targetPath: string) => {
    event.returnValue = filesystemCapabilities.grantDroppedPath(targetPath);
  });

  handleTrustedIpc("mage2:get-recent-projects", async () => {
    return loadRecentProjects(app.getPath("userData"));
  });

  handleTrustedIpc("mage2:remember-recent-project", async (_event, projectDir: string, projectName?: string) => {
    const grantedProjectDir = await filesystemCapabilities.assertProjectRoot(projectDir);
    const userDataPath = app.getPath("userData");
    const recentProjects = rememberRecentProject(loadRecentProjects(userDataPath), grantedProjectDir, projectName);
    saveRecentProjects(userDataPath, recentProjects);
    return recentProjects;
  });

  handleTrustedIpc("mage2:forget-recent-project", async (_event, projectDir: string) => {
    const userDataPath = app.getPath("userData");
    const recentProjects = forgetRecentProject(loadRecentProjects(userDataPath), projectDir);
    saveRecentProjects(userDataPath, recentProjects);
    return recentProjects;
  });

  handleTrustedIpc("mage2:reveal-path", async (_event, targetPath: string) => {
    const grantedPath = await filesystemCapabilities.assertGrantedProjectPath(targetPath, false);
    shell.showItemInFolder(grantedPath);
  });

  handleTrustedIpc("mage2:get-file-browser-locations", async () => {
    const locations = await getFileBrowserLocations();
    await Promise.all(locations.map((location) => filesystemCapabilities.grantBrowseRoot(location.path)));
    return locations;
  });

  handleTrustedIpc("mage2:authorize-directory", async () => {
    if (!mainWindow) {
      throw new Error("The editor window is unavailable.");
    }
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: "Grant MAGE2 access to a folder",
      buttonLabel: "Grant Folder Access",
      properties: ["openDirectory", "createDirectory", "promptToCreate"]
    });
    const selectedPath = selection.canceled ? undefined : selection.filePaths[0];
    return selectedPath ? filesystemCapabilities.grantBrowseRoot(selectedPath) : undefined;
  });

  handleTrustedIpc("mage2:list-directory", async (_event, targetPath: string) => {
    return listDirectoryContents(await filesystemCapabilities.assertBrowsePath(targetPath));
  });

  handleTrustedIpc("mage2:create-directory", async (_event, parentDirectory: string, directoryName: string) => {
    const grantedParent = await filesystemCapabilities.assertBrowsePath(parentDirectory);
    return createSubdirectory(grantedParent, directoryName);
  });

  handleTrustedIpc("mage2:inspect-project-directory", async (_event, projectDir: string) => {
    return inspectProjectDirectory(await filesystemCapabilities.assertBrowsePath(projectDir));
  });

  handleTrustedIpc("mage2:create-project", async (_event, projectDir: string, projectName: string) => {
    const selectedProjectDir = await filesystemCapabilities.assertBrowsePath(projectDir);
    const project = await createProjectInDirectory(selectedProjectDir, projectName);
    await filesystemCapabilities.grantProjectRoot(selectedProjectDir);
    await filesystemCapabilities.assertProjectBundlePaths(selectedProjectDir, project);
    return project;
  });

  handleTrustedIpc("mage2:load-project", async (_event, projectDir: string) => {
    const selectedProjectDir = await filesystemCapabilities.assertProjectSelection(projectDir);
    const project = await loadProjectFromDirectory(selectedProjectDir);
    await filesystemCapabilities.grantProjectRoot(selectedProjectDir);
    await filesystemCapabilities.assertProjectBundlePaths(selectedProjectDir, project);
    return project;
  });

  handleTrustedIpc("mage2:save-project", async (_event, projectDir: string, project: ProjectBundle) => {
    const grantedProjectDir = await filesystemCapabilities.assertProjectRoot(projectDir);
    const normalized = parseProjectBundle(project);
    await filesystemCapabilities.assertProjectBundlePaths(grantedProjectDir, normalized);
    await saveProjectToDirectory(grantedProjectDir, normalized);
    return {
      project: normalized,
      validationReport: validateProject(normalized)
    };
  });

  handleTrustedIpc(
    "mage2:import-assets",
    async (
      _event,
      projectDir: string,
      locale: string,
      existingAssets: Asset[],
      filePaths: string[],
      category?: AssetCategory
    ) => {
      const grantedProjectDir = await filesystemCapabilities.assertProjectRoot(projectDir);
      await filesystemCapabilities.assertProjectAssetPaths(grantedProjectDir, existingAssets);
      const grantedFiles = await Promise.all(
        filePaths.map((filePath) => filesystemCapabilities.assertImportFile(filePath))
      );
      return importAssetsToProject(grantedFiles, grantedProjectDir, locale, existingAssets, { category });
    }
  );

  handleTrustedIpc(
    "mage2:import-asset-variant",
    async (_event, projectDir: string, asset: Asset, locale: string, filePath: string) => {
      const grantedProjectDir = await filesystemCapabilities.assertProjectRoot(projectDir);
      await filesystemCapabilities.assertProjectAssetPaths(grantedProjectDir, [asset]);
      const grantedFile = await filesystemCapabilities.assertImportFile(filePath);
      return importAssetVariantToProject(grantedFile, grantedProjectDir, asset, locale);
    }
  );

  handleTrustedIpc("mage2:generate-proxy", async (_event, projectDir: string, asset: Asset, locale: string) => {
    const grantedProjectDir = await filesystemCapabilities.assertProjectRoot(projectDir);
    await filesystemCapabilities.assertProjectAssetPaths(grantedProjectDir, [asset]);
    return generateProxy(asset, locale, grantedProjectDir);
  });

  handleTrustedIpc(
    "mage2:delete-managed-asset-files",
    async (_event, projectDir: string, asset: Asset, remainingAssets: Asset[]) => {
      const grantedProjectDir = await filesystemCapabilities.assertProjectRoot(projectDir);
      await filesystemCapabilities.assertProjectAssetPaths(grantedProjectDir, [asset, ...remainingAssets]);
      return deleteManagedAssetFiles(asset, grantedProjectDir, remainingAssets);
    }
  );

  handleTrustedIpc(
    "mage2:delete-managed-asset-variant-files",
    async (_event, projectDir: string, asset: Asset, locale: string, remainingAssets: Asset[]) => {
      const grantedProjectDir = await filesystemCapabilities.assertProjectRoot(projectDir);
      await filesystemCapabilities.assertProjectAssetPaths(grantedProjectDir, [asset, ...remainingAssets]);
      return deleteManagedAssetVariantFiles(asset, locale, grantedProjectDir, remainingAssets);
    }
  );

  handleTrustedIpc("mage2:export-project", async (_event, projectDir: string, project: ProjectBundle) => {
    const grantedProjectDir = await filesystemCapabilities.assertProjectRoot(projectDir);
    const normalized = parseProjectBundle(project);
    await filesystemCapabilities.assertProjectBundlePaths(grantedProjectDir, normalized);
    return exportProjectBundle(grantedProjectDir, normalized);
  });

  handleTrustedIpc("mage2:path-to-file-url", async (_event, inputPath: string) => {
    return filesystemCapabilities.createMediaUrl(inputPath);
  });
}

async function initializeFilesystemCapabilities(): Promise<void> {
  const locations = await getFileBrowserLocations();
  await Promise.all(locations.map((location) => filesystemCapabilities.grantBrowseRoot(location.path)));

  if (/^(1|true|yes)$/i.test(process.env.MAGE2_EDITOR_AUTOMATION ?? "")) {
    const automationRoot = process.env.MAGE2_EDITOR_AUTOMATION_ROOT?.trim();
    if (automationRoot) {
      await filesystemCapabilities.grantBrowseRoot(automationRoot);
    }
  }

  const recentProjects = loadRecentProjects(app.getPath("userData"));
  await Promise.all(
    recentProjects.map((recentProject) => filesystemCapabilities.tryGrantProjectRoot(recentProject.projectDir))
  );
  if (pendingLaunchOptions.projectDir) {
    await filesystemCapabilities.tryGrantProjectRoot(pendingLaunchOptions.projectDir);
  }
}

function onTrustedIpc<Args extends unknown[]>(
  channel: string,
  listener: (event: IpcMainEvent, ...args: Args) => void
): void {
  ipcMain.on(channel, (event, ...args) => {
    try {
      assertTrustedIpcSender(event, mainWindow, trustedRendererUrl);
      listener(event, ...(args as Args));
    } catch (error) {
      console.warn(`Denied IPC channel ${channel}:`, error instanceof Error ? error.message : error);
      event.returnValue = undefined;
    }
  });
}

function handleTrustedIpc<Args extends unknown[], Result>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: Args) => Result | Promise<Result>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedIpcSender(event, mainWindow, trustedRendererUrl);
    return listener(event, ...(args as Args));
  });
}

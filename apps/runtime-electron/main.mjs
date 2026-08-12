import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { readPlayerBuildIdentity, resolvePlayerPort, startPlayerServer } from "./server.mjs";
import { readPlayerBuildIdentitySync, resolveRuntimeApplicationIdentity } from "./identity.mjs";
import { createRuntimeStartupDataUrl, createRuntimeStartupMetrics } from "./startup.mjs";

let playerServer;
const runtimeShellDirectory = path.dirname(fileURLToPath(import.meta.url));
const playerWindows = new Set();
const playerStartupMetrics = new WeakMap();
const RUNTIME_QUIT_CHANNEL = "mage2-runtime:quit";
const RUNTIME_STARTUP_METRICS_CHANNEL = "mage2-runtime:get-startup-metrics";
const RUNTIME_INITIAL_SURFACE_READY_CHANNEL = "mage2-runtime:initial-surface-ready";
const playerDirectory = resolvePlayerDirectory();
const initialBuildIdentity = readPlayerBuildIdentitySync(playerDirectory);
const applicationIdentity = resolveRuntimeApplicationIdentity(initialBuildIdentity);
const runtimeProcessStartedAt = Date.now() - Math.round(process.uptime() * 1_000);

app.setName(applicationIdentity.appName);
app.setPath(
  "userData",
  path.join(app.getPath("appData"), "MAGE2 Players", applicationIdentity.userDataDirectoryName)
);
if (process.platform === "win32") {
  app.setAppUserModelId(applicationIdentity.appUserModelId);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  ipcMain.on(RUNTIME_QUIT_CHANNEL, (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (!senderWindow || !playerWindows.has(senderWindow)) {
      return;
    }

    app.quit();
  });
  ipcMain.handle(RUNTIME_STARTUP_METRICS_CHANNEL, (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (!senderWindow || !playerWindows.has(senderWindow)) {
      throw new Error("Windows player startup metrics are unavailable to this page.");
    }
    const metrics = playerStartupMetrics.get(senderWindow);
    return metrics ? { ...metrics } : null;
  });
  ipcMain.on(RUNTIME_INITIAL_SURFACE_READY_CHANNEL, (event) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (!senderWindow || !playerWindows.has(senderWindow)) {
      return;
    }
    const metrics = playerStartupMetrics.get(senderWindow);
    if (!metrics || metrics.initialSurfaceReadyAt !== null) {
      return;
    }
    metrics.initialSurfaceReadyAt = Date.now();
    metrics.initialSurfaceReadyMonotonicNs = process.hrtime.bigint().toString();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const playerWindow = await createPlayerWindow();
    const buildIdentity = await readPlayerBuildIdentity(playerDirectory);
    playerServer = await startPlayerServer(playerDirectory, resolvePlayerPort(buildIdentity.projectId));
    await loadPlayerWindow(playerWindow, playerServer.url);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createPlayerWindow(playerServer.url);
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    playerServer?.close();
    playerServer = undefined;
  });
}

async function createPlayerWindow(playerUrl) {
  const iconPath = resolveIconPath();
  const startupMetrics = createRuntimeStartupMetrics({
    projectName: initialBuildIdentity.projectName,
    processStartedAt: runtimeProcessStartedAt
  });
  const window = new BrowserWindow({
    show: false,
    fullscreen: true,
    width: 1280,
    height: 800,
    minWidth: 320,
    minHeight: 480,
    backgroundColor: "#050608",
    autoHideMenuBar: true,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(runtimeShellDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  startupMetrics.windowCreatedAt = Date.now();

  playerWindows.add(window);
  playerStartupMetrics.set(window, startupMetrics);
  window.once("closed", () => playerWindows.delete(window));
  await window.loadURL(createRuntimeStartupDataUrl({ projectName: initialBuildIdentity.projectName }));
  startupMetrics.startupDocumentLoadedAt = Date.now();
  if (!window.isDestroyed()) {
    window.show();
    startupMetrics.windowShownAt = Date.now();
    startupMetrics.windowShownMonotonicNs = process.hrtime.bigint().toString();
  }
  if (playerUrl && !window.isDestroyed()) {
    await loadPlayerWindow(window, playerUrl);
  }
  return window;
}

async function loadPlayerWindow(window, playerUrl) {
  const startupMetrics = playerStartupMetrics.get(window);
  if (startupMetrics) {
    startupMetrics.playerNavigationStartedAt = Date.now();
  }
  await window.loadURL(playerUrl);
  if (startupMetrics) {
    startupMetrics.playerLoadedAt = Date.now();
    startupMetrics.playerLoadedMonotonicNs = process.hrtime.bigint().toString();
  }
}

function resolvePlayerDirectory() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "player");
  }

  const developmentBuild = process.env.MAGE2_RUNTIME_BUILD;
  if (!developmentBuild) {
    throw new Error("Set MAGE2_RUNTIME_BUILD when running the player shell outside a packaged app.");
  }

  return path.resolve(developmentBuild);
}

function resolveIconPath() {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, "creator-icon.png"),
        path.join(process.resourcesPath, "icon.png")
      ]
    : [path.resolve(process.cwd(), "build", "icon.png")];

  return candidates.find((candidate) => existsSync(candidate));
}

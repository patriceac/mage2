import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { readPlayerBuildIdentity, resolvePlayerPort, startPlayerServer } from "./server.mjs";

let playerServer;
const runtimeShellDirectory = path.dirname(fileURLToPath(import.meta.url));
const playerWindows = new Set();
const RUNTIME_QUIT_CHANNEL = "mage2-runtime:quit";

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

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const playerDirectory = resolvePlayerDirectory();
    const buildIdentity = await readPlayerBuildIdentity(playerDirectory);
    playerServer = await startPlayerServer(playerDirectory, resolvePlayerPort(buildIdentity.projectId));
    await createPlayerWindow(playerServer.url);

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

  playerWindows.add(window);
  window.once("closed", () => playerWindows.delete(window));
  window.once("ready-to-show", () => window.show());
  await window.loadURL(playerUrl);
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

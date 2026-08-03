import path from "node:path";
import { app, BrowserWindow, Menu } from "electron";
import { readPlayerBuildIdentity, resolvePlayerPort, startPlayerServer } from "./server.mjs";

let playerServer;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "&File",
          submenu: [{ label: "&Quit", role: "quit" }]
        }
      ])
    );
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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

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
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.resolve(process.cwd(), "build", "icon.png");

  return candidate;
}

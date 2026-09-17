import { beforeEach, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  loadURL: vi.fn(async () => {}),
  handleProtocol: vi.fn(),
  showError: vi.fn(),
  quit: vi.fn(),
  startServer: vi.fn(),
  shown: vi.fn()
}));
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    setName: vi.fn(), setPath: vi.fn(), setAppUserModelId: vi.fn(),
    getPath: () => ".", requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(), on: vi.fn(), quit: context.quit
  },
  BrowserWindow: class {
    webContents = { session: { protocol: { handle: context.handleProtocol } } };
    once() {}
    isDestroyed() { return false; }
    loadURL = context.loadURL;
    show = context.shown;
  },
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  Menu: { setApplicationMenu: vi.fn() },
  net: { fetch: vi.fn() },
  dialog: { showErrorBox: context.showError }
}));
vi.mock("../apps/runtime-electron/identity.mjs", () => ({
  readPlayerBuildIdentitySync: () => ({ projectId: "test-game", projectName: "Test Game" }),
  resolveRuntimeApplicationIdentity: () => ({ appName: "Test Game", userDataDirectoryName: "test-game", appUserModelId: "com.mage2.test" })
}));
vi.mock("../apps/runtime-electron/server.mjs", async (importOriginal) => ({
  ...await importOriginal(),
  readPlayerBuildIdentity: async () => ({ projectId: "test-game", projectName: "Test Game" }),
  resolvePlayerPort: () => 52722,
  startPlayerServer: context.startServer
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("MAGE2_RUNTIME_BUILD", ".");
});

it("leaves the startup surface for the stable save origin after a port fallback", async () => {
  context.startServer.mockResolvedValue({ url: "http://127.0.0.1:43001/", close() {} });
  await import("../apps/runtime-electron/main.mjs");
  await vi.waitFor(() => expect(context.loadURL).toHaveBeenCalledTimes(2));
  expect(context.loadURL.mock.calls[0][0]).toMatch(/^data:text\/html/);
  expect(context.loadURL).toHaveBeenLastCalledWith("http://127.0.0.1:52722/");
  expect(context.handleProtocol).toHaveBeenCalledWith("http", expect.any(Function));
  expect(context.shown).toHaveBeenCalledOnce();
  expect(context.showError).not.toHaveBeenCalled();
});

it("reports startup failure and quits instead of stranding the loading screen", async () => {
  context.startServer.mockRejectedValue(new Error("No loopback address available"));
  await import("../apps/runtime-electron/main.mjs");
  await vi.waitFor(() => expect(context.quit).toHaveBeenCalledOnce());
  expect(context.showError).toHaveBeenCalledWith("Unable to start the game", "No loopback address available");
  expect(context.loadURL).toHaveBeenCalledOnce();
});

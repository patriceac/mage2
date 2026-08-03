import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from "electron";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type MainIpcEvent = IpcMainEvent | IpcMainInvokeEvent;

export function resolveTrustedRendererUrl(devServerUrl: string | undefined, packagedUrl: string): string {
  if (!devServerUrl) {
    return normalizeExactUrl(packagedUrl, "packaged renderer URL");
  }

  const parsedUrl = new URL(devServerUrl);
  if (
    parsedUrl.protocol !== "http:" ||
    !LOOPBACK_HOSTS.has(parsedUrl.hostname.toLocaleLowerCase("en-US")) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash ||
    (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "")
  ) {
    throw new Error("VITE_DEV_SERVER_URL must be an uncredentialed loopback HTTP origin.");
  }
  parsedUrl.pathname = "/";
  return parsedUrl.toString();
}

export function isTrustedRendererUrl(candidateUrl: string, trustedRendererUrl: string): boolean {
  try {
    return new URL(candidateUrl).toString() === new URL(trustedRendererUrl).toString();
  } catch {
    return false;
  }
}

export function assertTrustedIpcSender(
  event: MainIpcEvent,
  window: BrowserWindow | null,
  trustedRendererUrl: string
): void {
  if (!window || window.isDestroyed()) {
    throw new Error("Privileged IPC was denied because the editor window is unavailable.");
  }

  const trustedContents = window.webContents;
  if (event.sender !== trustedContents) {
    throw new Error("Privileged IPC was denied for an unknown renderer.");
  }

  if (!event.senderFrame || event.senderFrame !== trustedContents.mainFrame) {
    throw new Error("Privileged IPC was denied for a non-main frame.");
  }

  if (!isTrustedRendererUrl(event.senderFrame.url, trustedRendererUrl)) {
    throw new Error("Privileged IPC was denied for an untrusted renderer URL.");
  }
}

function normalizeExactUrl(inputUrl: string, label: string): string {
  try {
    return new URL(inputUrl).toString();
  } catch (error) {
    throw new Error(`The ${label} is invalid.`, { cause: error });
  }
}

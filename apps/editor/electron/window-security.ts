import type { BrowserWindow, Session } from "electron";
import { isTrustedRendererUrl } from "./ipc-security";

const hardenedSessions = new WeakSet<Session>();

export function installWindowSecurity(window: BrowserWindow, trustedRendererUrl: string): void {
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));

  contents.on("will-navigate", (event) => {
    if (!isTrustedRendererUrl(event.url, trustedRendererUrl)) {
      event.preventDefault();
    }
  });

  contents.on("will-frame-navigate", (event) => {
    if (!event.isMainFrame || !isTrustedRendererUrl(event.url, trustedRendererUrl)) {
      event.preventDefault();
    }
  });

  contents.on("will-redirect", (event, url) => {
    if (!isTrustedRendererUrl(url, trustedRendererUrl)) {
      event.preventDefault();
    }
  });

  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  hardenSession(contents.session);
}

function hardenSession(session: Session): void {
  if (hardenedSessions.has(session)) {
    return;
  }
  hardenedSessions.add(session);

  session.setPermissionCheckHandler(() => false);
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.setDevicePermissionHandler(() => false);
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  session.on("will-download", (_event, item) => item.cancel());
}

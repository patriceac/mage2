import { describe, expect, it } from "vitest";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import {
  assertTrustedIpcSender,
  isTrustedRendererUrl,
  resolveTrustedRendererUrl
} from "./ipc-security";

describe("Electron IPC trust boundary", () => {
  it("accepts only the exact loopback development origin", () => {
    expect(resolveTrustedRendererUrl("http://127.0.0.1:5173", "mage2-app://bundle/index.html")).toBe(
      "http://127.0.0.1:5173/"
    );
    expect(() =>
      resolveTrustedRendererUrl("http://127.0.0.1.attacker.example:5173", "mage2-app://bundle/index.html")
    ).toThrow(/loopback/i);
    expect(() =>
      resolveTrustedRendererUrl("http://user@127.0.0.1:5173", "mage2-app://bundle/index.html")
    ).toThrow(/loopback/i);
  });

  it("uses exact URL equality instead of prefix matching", () => {
    expect(isTrustedRendererUrl("mage2-app://bundle/index.html", "mage2-app://bundle/index.html")).toBe(true);
    expect(isTrustedRendererUrl("mage2-app://bundle/index.html.attacker", "mage2-app://bundle/index.html")).toBe(false);
    expect(isTrustedRendererUrl("https://attacker.example/", "mage2-app://bundle/index.html")).toBe(false);
  });

  it("requires the trusted webContents main frame and URL", () => {
    const mainFrame = { url: "mage2-app://bundle/index.html" };
    const webContents = { mainFrame };
    const window = {
      isDestroyed: () => false,
      webContents
    } as unknown as BrowserWindow;
    const trustedEvent = {
      sender: webContents,
      senderFrame: mainFrame
    } as unknown as IpcMainInvokeEvent;

    expect(() => assertTrustedIpcSender(trustedEvent, window, mainFrame.url)).not.toThrow();
    expect(() =>
      assertTrustedIpcSender(
        { ...trustedEvent, senderFrame: { url: mainFrame.url } } as unknown as IpcMainInvokeEvent,
        window,
        mainFrame.url
      )
    ).toThrow(/non-main frame/i);
    expect(() =>
      assertTrustedIpcSender(
        { ...trustedEvent, senderFrame: { url: "https://attacker.example" } } as unknown as IpcMainInvokeEvent,
        window,
        mainFrame.url
      )
    ).toThrow();
    expect(() =>
      assertTrustedIpcSender(
        { ...trustedEvent, sender: { mainFrame } } as unknown as IpcMainInvokeEvent,
        window,
        mainFrame.url
      )
    ).toThrow(/unknown renderer/i);
  });
});

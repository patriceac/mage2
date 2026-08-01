import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const dialogsSource = readFileSync(new URL("./dialogs.tsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../electron/main.ts", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../electron/preload.ts", import.meta.url), "utf8");

describe("native close protection", () => {
  it("prevents native close until the renderer resolves the save decision", () => {
    expect(mainSource).toContain('window.webContents.send("mage2:request-close")');
    expect(mainSource).toContain("event.preventDefault()");
    expect(mainSource).toContain("closeRequestPending");
    expect(mainSource).toContain("allowWindowClose = true");
  });

  it("exposes a bounded close-request bridge instead of raw IPC", () => {
    expect(preloadSource).toContain("onCloseRequested");
    expect(preloadSource).toContain('ipcRenderer.on("mage2:request-close", listener)');
    expect(preloadSource).toContain('ipcRenderer.send("mage2:close-response", false)');
  });

  it("keeps failed saves open and requires an explicit discard", () => {
    expect(appSource).toContain("confirmProjectCanClose");
    expect(appSource).toContain("The project remains open, and your unsaved changes are still in the editor.");
    expect(dialogsSource).toContain("Discard Changes");
    expect(dialogsSource).toContain("Save and Close");
    expect(dialogsSource).toContain('onClick={() => onResolve("save")} autoFocus');
  });
});

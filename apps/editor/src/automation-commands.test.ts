import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseEditorAutomationCommand } from "./automation-commands";

describe("parseEditorAutomationCommand", () => {
  it("accepts the self-contained release verification commands", () => {
    expect(parseEditorAutomationCommand({ command: "security.getState" })).toEqual({
      command: "security.getState"
    });
    expect(
      parseEditorAutomationCommand({
        command: "createProject",
        projectDir: "C:\\evidence\\project",
        projectName: "Release Evidence"
      })
    ).toEqual({
      command: "createProject",
      projectDir: "C:\\evidence\\project",
      projectName: "Release Evidence"
    });
    expect(parseEditorAutomationCommand({ command: "saveProject" })).toEqual({ command: "saveProject" });
    expect(parseEditorAutomationCommand({ command: "editor.openFileMenu" })).toEqual({ command: "editor.openFileMenu" });
    expect(parseEditorAutomationCommand({ command: "editor.closeFileMenu" })).toEqual({ command: "editor.closeFileMenu" });
    expect(parseEditorAutomationCommand({ command: "exportProject" })).toEqual({ command: "exportProject" });
    expect(
      parseEditorAutomationCommand({
        command: "exportProject",
        format: "windows",
        mode: "preview",
        destinationPath: "C:\\evidence\\Safe Game Player"
      })
    ).toEqual({
      command: "exportProject",
      format: "windows",
      mode: "preview",
      destinationPath: "C:\\evidence\\Safe Game Player"
    });
    expect(parseEditorAutomationCommand({ command: "closeApplication" })).toEqual({ command: "closeApplication" });
  });

  it("rejects an empty release project path", () => {
    expect(() =>
      parseEditorAutomationCommand({
        command: "createProject",
        projectDir: " ",
        projectName: "Release Evidence"
      })
    ).toThrow(/projectDir/u);
  });

  it("requires a supported format and destination for artifact export automation", () => {
    expect(() =>
      parseEditorAutomationCommand({
        command: "exportProject",
        format: "archive",
        destinationPath: "C:\\evidence\\game.zip"
      })
    ).toThrow(/windows.*web/u);
    expect(() => parseEditorAutomationCommand({ command: "exportProject", format: "web" })).toThrow(
      /destinationPath/u
    );
    expect(() =>
      parseEditorAutomationCommand({ command: "exportProject", format: "web", mode: "draft", destinationPath: "C:\\evidence\\web" })
    ).toThrow(/preview.*release/u);
    expect(() => parseEditorAutomationCommand({ command: "exportProject", mode: "preview" })).toThrow(
      /format.*destinationPath/u
    );
  });

  it("accepts interface locale control commands", () => {
    expect(parseEditorAutomationCommand({ command: "setInterfaceLocale", locale: "ar" })).toEqual({
      command: "setInterfaceLocale",
      locale: "ar"
    });
    expect(parseEditorAutomationCommand({ command: "resetInterfaceLocale" })).toEqual({ command: "resetInterfaceLocale" });
  });

  it("rejects unsupported interface locales", () => {
    expect(() => parseEditorAutomationCommand({ command: "setInterfaceLocale", locale: "de" })).toThrow(/locale/u);
  });

  it("exposes interface locale state without mutating the project", () => {
    const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    expect(appSource).toContain("uiLocale,");
    expect(appSource).toContain("uiLocalePreference,");
    expect(appSource).toContain("uiDirection,");
    expect(appSource).toContain('case "setInterfaceLocale"');
    expect(appSource).toContain('case "resetInterfaceLocale"');
    expect(appSource).not.toMatch(/case "setInterfaceLocale"[\s\S]*?updateProject\(/u);
  });

  it("accepts an editor command to open the hotspot inspector for a specific hotspot", () => {
    expect(
      parseEditorAutomationCommand({
        command: "editor.openHotspotInspector",
        hotspotId: "hotspot_intro"
      })
    ).toEqual({
      command: "editor.openHotspotInspector",
      hotspotId: "hotspot_intro"
    });
  });

  it("accepts an editor command to open the hotspot inspector for the current selection", () => {
    expect(
      parseEditorAutomationCommand({
        command: "editor.openHotspotInspector"
      })
    ).toEqual({
      command: "editor.openHotspotInspector",
      hotspotId: undefined
    });
  });
});

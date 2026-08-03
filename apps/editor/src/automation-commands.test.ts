import { describe, expect, it } from "vitest";
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
    expect(parseEditorAutomationCommand({ command: "exportProject" })).toEqual({ command: "exportProject" });
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

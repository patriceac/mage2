import { describe, expect, it } from "vitest";
import { parseEditorAutomationCommand } from "./automation-commands";

describe("parseEditorAutomationCommand", () => {
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

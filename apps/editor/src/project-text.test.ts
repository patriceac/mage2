import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { addDialogueTree, addInventoryItem } from "./project-helpers";
import { collectProjectTextEntries } from "./project-text";

describe("collectProjectTextEntries", () => {
  it("marks referenced text that already exists in the stored values", () => {
    const project = createDefaultProjectBundle("Referenced text");
    const entries = collectProjectTextEntries(project);
    const locationDescription = entries.find((entry) => entry.textId === "text.location.intro");

    expect(locationDescription).toMatchObject({
      textId: "text.location.intro",
      status: "referenced",
      value: "Starting location"
    });
    expect(locationDescription?.usages).toHaveLength(1);
    expect(locationDescription?.usages[0]?.kind).toBe("locationDescription");
  });

  it("marks referenced text ids as missing when no stored value exists", () => {
    const project = createDefaultProjectBundle("Missing text");
    delete project.strings.values["text.hotspot.inspect"];

    const entries = collectProjectTextEntries(project);
    const hotspotLabel = entries.find((entry) => entry.textId === "text.hotspot.inspect");

    expect(hotspotLabel).toMatchObject({
      textId: "text.hotspot.inspect",
      status: "missing",
      value: ""
    });
    expect(hotspotLabel?.usages).toHaveLength(1);
    expect(hotspotLabel?.usages[0]?.kind).toBe("hotspotLabel");
  });

  it("keeps orphaned stored values visible even when nothing references them", () => {
    const project = createDefaultProjectBundle("Orphaned text");
    project.strings.values["text.orphaned"] = "Unused copy";

    const entries = collectProjectTextEntries(project);
    const orphaned = entries.find((entry) => entry.textId === "text.orphaned");

    expect(orphaned).toMatchObject({
      textId: "text.orphaned",
      status: "orphaned",
      value: "Unused copy",
      usages: []
    });
  });

  it("groups multiple project surfaces under the same text id", () => {
    const project = createDefaultProjectBundle("Shared text");
    const item = addInventoryItem(project);
    const sharedTextId = project.scenes.items[0].hotspots[0].labelTextId;

    delete project.strings.values[item.textId];
    item.textId = sharedTextId;

    const entries = collectProjectTextEntries(project);
    const sharedEntry = entries.find((entry) => entry.textId === sharedTextId);

    expect(sharedEntry?.status).toBe("referenced");
    expect(sharedEntry?.usages.map((usage) => usage.kind).sort()).toEqual(["hotspotLabel", "inventoryName"]);
  });

  it("sorts missing entries before referenced and orphaned ones", () => {
    const project = createDefaultProjectBundle("Sorted text");
    const dialogue = addDialogueTree(project);
    delete project.strings.values[dialogue.nodes[0].textId];
    project.strings.values["text.orphaned"] = "Unused copy";

    const entries = collectProjectTextEntries(project);

    expect(entries[0]?.status).toBe("missing");
    expect(entries.at(-1)?.status).toBe("orphaned");
  });
});

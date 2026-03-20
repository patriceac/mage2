import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { addDialogueTree, addInventoryItem, createSubtitleCue } from "./project-helpers";
import {
  collectProjectTextEntries,
  deleteOrphanedProjectTextEntries,
  filterProjectTextEntries,
  resolveProjectTextSelection
} from "./project-text";

function getDefaultStrings(project: ReturnType<typeof createDefaultProjectBundle>) {
  return project.strings.byLocale[project.manifest.defaultLanguage];
}

describe("collectProjectTextEntries", () => {
  it("marks referenced text that already exists in the stored values", () => {
    const project = createDefaultProjectBundle("Referenced text");
    const entries = collectProjectTextEntries(project, project.manifest.defaultLanguage);
    const hotspotComment = entries.find((entry) => entry.textId === "text.hotspot.inspect.comment");

    expect(hotspotComment).toMatchObject({
      textId: "text.hotspot.inspect.comment",
      status: "referenced",
      value: "Add real hotspots in Scenes"
    });
    expect(hotspotComment?.usages).toHaveLength(1);
    expect(hotspotComment?.usages[0]?.kind).toBe("hotspotComment");
  });

  it("marks referenced text ids as missing when no stored value exists", () => {
    const project = createDefaultProjectBundle("Missing text");
    const item = addInventoryItem(project);
    delete getDefaultStrings(project)[item.textId];

    const entries = collectProjectTextEntries(project, project.manifest.defaultLanguage);
    const inventoryName = entries.find((entry) => entry.textId === item.textId);

    expect(inventoryName).toMatchObject({
      textId: item.textId,
      status: "missing",
      value: ""
    });
    expect(inventoryName?.usages).toHaveLength(1);
    expect(inventoryName?.usages[0]?.kind).toBe("inventoryName");
  });

  it("keeps orphaned stored values visible even when nothing references them", () => {
    const project = createDefaultProjectBundle("Orphaned text");
    getDefaultStrings(project)["text.orphaned"] = "Unused copy";

    const entries = collectProjectTextEntries(project, project.manifest.defaultLanguage);
    const orphaned = entries.find((entry) => entry.textId === "text.orphaned");

    expect(orphaned).toMatchObject({
      textId: "text.orphaned",
      status: "orphaned",
      value: "Unused copy",
      usages: []
    });
  });

  it("hides exact generated legacy scene and hotspot strings while leaving manual orphans visible", () => {
    const project = createDefaultProjectBundle("Excluded text");
    project.locations.items[0]!.descriptionTextId = "text.manual.location.description";
    getDefaultStrings(project)["text.manual.location.description"] = "Legacy location description";
    getDefaultStrings(project)[`text.${project.scenes.items[0]!.id}.overlay`] = "Generated scene overlay";
    getDefaultStrings(project)[`text.${project.scenes.items[0]!.hotspots[0]!.id}.label`] = "Generated hotspot label";
    getDefaultStrings(project)["text.manual.scene.overlay"] = "Manual scene overlay";

    const entries = collectProjectTextEntries(project, project.manifest.defaultLanguage);
    const entryIds = entries.map((entry) => entry.textId);

    expect(entryIds).not.toContain("text.manual.location.description");
    expect(entryIds).not.toContain(`text.${project.scenes.items[0]!.id}.overlay`);
    expect(entryIds).not.toContain(`text.${project.scenes.items[0]!.hotspots[0]!.id}.label`);
    expect(entryIds).toContain("text.manual.scene.overlay");
    expect(entryIds).toContain("text.hotspot.inspect.comment");
  });

  it("includes subtitle cue strings in localization coverage", () => {
    const project = createDefaultProjectBundle("Subtitle text");
    const cue = createSubtitleCue(project, 0, 1200, "Opening subtitle");
    project.scenes.items[0].subtitleTracks = [{ id: "subtitle_intro", cues: [cue] }];

    const entries = collectProjectTextEntries(project, project.manifest.defaultLanguage);
    const subtitleEntry = entries.find((entry) => entry.textId === cue.textId);

    expect(subtitleEntry).toMatchObject({
      textId: cue.textId,
      status: "referenced",
      value: "Opening subtitle"
    });
    expect(subtitleEntry?.usages[0]).toMatchObject({
      kind: "subtitleCue",
      ownerId: cue.id
    });
  });

  it("groups multiple project surfaces under the same text id", () => {
    const project = createDefaultProjectBundle("Shared text");
    const item = addInventoryItem(project);
    const sharedTextId = project.scenes.items[0].hotspots[0].commentTextId!;

    delete getDefaultStrings(project)[item.textId];
    item.textId = sharedTextId;

    const entries = collectProjectTextEntries(project, project.manifest.defaultLanguage);
    const sharedEntry = entries.find((entry) => entry.textId === sharedTextId);

    expect(sharedEntry?.status).toBe("referenced");
    expect(sharedEntry?.usages.map((usage) => usage.kind).sort()).toEqual(["hotspotComment", "inventoryName"]);
  });

  it("sorts missing entries before referenced and orphaned ones", () => {
    const project = createDefaultProjectBundle("Sorted text");
    const dialogue = addDialogueTree(project);
    delete getDefaultStrings(project)[dialogue.nodes[0].textId];
    getDefaultStrings(project)["text.orphaned"] = "Unused copy";

    const entries = collectProjectTextEntries(project, project.manifest.defaultLanguage);

    expect(entries[0]?.status).toBe("missing");
    expect(entries.at(-1)?.status).toBe("orphaned");
  });
});

describe("filterProjectTextEntries", () => {
  it("matches text ids, stored values, usage kinds, and owner labels", () => {
    const project = createDefaultProjectBundle("Search text");
    const item = addInventoryItem(project);
    item.name = "Lantern";
    getDefaultStrings(project)[item.textId] = "Lantern";
    getDefaultStrings(project)[item.descriptionTextId!] = "A trusty lantern";
    getDefaultStrings(project)["text.orphaned"] = "Unused copy";
    const entries = collectProjectTextEntries(project, project.manifest.defaultLanguage);

    expect(
      filterProjectTextEntries(entries, {
        search: "unused",
        status: "all",
        area: "all",
        sort: "status"
      }).map((entry) => entry.textId)
    ).toEqual(["text.orphaned"]);

    expect(
      filterProjectTextEntries(entries, {
        search: "Hotspot Comment",
        status: "all",
        area: "all",
        sort: "status"
      }).map((entry) => entry.textId)
    ).toContain("text.hotspot.inspect.comment");
    
    expect(
      filterProjectTextEntries(entries, {
        search: "Inventory Description",
        status: "all",
        area: "all",
        sort: "status"
      }).map((entry) => entry.textId)
    ).toContain(item.descriptionTextId);

    expect(
      filterProjectTextEntries(entries, {
        search: "Placeholder",
        status: "all",
        area: "all",
        sort: "status"
      }).map((entry) => entry.textId)
    ).toEqual(["text.hotspot.inspect.comment"]);
  });

  it("filters by status and usage area", () => {
    const project = createDefaultProjectBundle("Filter text");
    const dialogue = addDialogueTree(project);
    const item = addInventoryItem(project);
    const cue = createSubtitleCue(project, 0, 1200, "Localized subtitle");
    project.scenes.items[0].subtitleTracks = [{ id: "subtitle_intro", cues: [cue] }];
    getDefaultStrings(project)["text.orphaned"] = "Unused copy";
    delete getDefaultStrings(project)[dialogue.nodes[0].textId];

    const entries = collectProjectTextEntries(project, project.manifest.defaultLanguage);

    expect(
      filterProjectTextEntries(entries, {
        search: "",
        status: "missing",
        area: "all",
        sort: "status"
      }).map((entry) => entry.textId)
    ).toEqual([dialogue.nodes[0].textId]);

    expect(
      filterProjectTextEntries(entries, {
        search: "",
        status: "all",
        area: "inventory",
        sort: "status"
      }).map((entry) => entry.textId)
    ).toEqual([item.descriptionTextId!, item.textId].sort());

    expect(
      filterProjectTextEntries(entries, {
        search: "",
        status: "all",
        area: "subtitles",
        sort: "status"
      }).map((entry) => entry.textId)
    ).toEqual([cue.textId]);
  });

  it("sorts by most uses before falling back to status and id", () => {
    const project = createDefaultProjectBundle("Most uses");
    const item = addInventoryItem(project);
    const sharedTextId = project.scenes.items[0].hotspots[0].commentTextId!;

    delete getDefaultStrings(project)[item.textId];
    item.textId = sharedTextId;

    const sortedEntries = filterProjectTextEntries(collectProjectTextEntries(project, project.manifest.defaultLanguage), {
      search: "",
      status: "all",
      area: "all",
      sort: "mostUses"
    });

    expect(sortedEntries[0]?.textId).toBe(sharedTextId);
    expect(sortedEntries[0]?.usages).toHaveLength(2);
  });
});

describe("project text selection and cleanup", () => {
  it("keeps the selected text when it remains visible and falls back to the first visible entry otherwise", () => {
    const project = createDefaultProjectBundle("Selection");
    getDefaultStrings(project)["text.orphaned"] = "Unused copy";
    const visibleEntries = filterProjectTextEntries(collectProjectTextEntries(project, project.manifest.defaultLanguage), {
      search: "unused",
      status: "all",
      area: "all",
      sort: "status"
    });

    expect(resolveProjectTextSelection(visibleEntries, "text.orphaned")).toBe("text.orphaned");
    expect(resolveProjectTextSelection(visibleEntries, "text.hotspot.inspect.comment")).toBe("text.orphaned");
  });

  it("deletes only orphaned stored values from the requested text ids", () => {
    const project = createDefaultProjectBundle("Delete orphaned");
    getDefaultStrings(project)["text.orphaned"] = "Unused copy";

    const deletedTextIds = deleteOrphanedProjectTextEntries(project, project.manifest.defaultLanguage, [
      "text.orphaned",
      "text.hotspot.inspect.comment",
      "text.missing"
    ]);

    expect(deletedTextIds).toEqual(["text.orphaned"]);
    expect(getDefaultStrings(project)["text.orphaned"]).toBeUndefined();
    expect(getDefaultStrings(project)["text.hotspot.inspect.comment"]).toBe("Add real hotspots in Scenes");
  });
});

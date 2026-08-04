import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, createInitialSaveState, createSaveEnvelope } from "@mage2/schema";
import {
  PLAYTEST_SAVE_FORMAT,
  createPlaytestSaveEnvelope,
  getPlaytestSaveSlotStorageKey,
  inspectPlaytestSaveSlot,
  readPlaytestSaveSlot,
  resolvePlaytestSaveCompatibilityIssue,
  resolvePlaytestSaveStatusLabel
} from "./playtest-save-slots";

describe("playtest save slots", () => {
  it("reports empty slots and keeps the legacy key visible as slot one", () => {
    const project = createDefaultProjectBundle("Empty saves");

    expect(inspectPlaytestSaveSlot(null, project, 1)).toMatchObject({ status: "empty" });
    expect(getPlaytestSaveSlotStorageKey(1)).toBe("mage2-editor-playtest-save");
    expect(getPlaytestSaveSlotStorageKey(2)).toBe("mage2-editor-playtest-save-2");
  });

  it("accepts a valid envelope for the open project with its timestamp", () => {
    const project = createDefaultProjectBundle("Compatible saves");
    const envelope = createPlaytestSaveEnvelope(
      project,
      createInitialSaveState(project),
      new Date("2026-08-03T12:34:56.000Z")
    );

    const inspection = inspectPlaytestSaveSlot(JSON.stringify(envelope), project, 2);

    expect(inspection).toMatchObject({
      slotId: 2,
      status: "ready",
      savedAt: "2026-08-03T12:34:56.000Z"
    });
    expect(inspection.envelope?.state.currentSceneId).toBe(project.manifest.startSceneId);
  });

  it("keeps versioned saves written before slots loadable", () => {
    const project = createDefaultProjectBundle("Versioned editor save");
    const state = { ...createInitialSaveState(project), playheadMs: 321 };
    const envelope = createSaveEnvelope(project, state, "2026-08-03T12:34:56.000Z");

    expect(inspectPlaytestSaveSlot(JSON.stringify(envelope), project, 1)).toMatchObject({
      slotId: 1,
      status: "ready",
      savedAt: "2026-08-03T12:34:56.000Z",
      envelope: { state }
    });
  });

  it("marks another project's save and unsupported versions as incompatible", () => {
    const project = createDefaultProjectBundle("Open project");
    const otherProject = createDefaultProjectBundle("Other project");
    otherProject.manifest.projectId = "other-project";
    const envelope = createPlaytestSaveEnvelope(otherProject, createInitialSaveState(otherProject));

    expect(inspectPlaytestSaveSlot(JSON.stringify(envelope), project, 1)).toMatchObject({
      status: "incompatible",
      message: "Saved for a different project (other-project)."
    });

    expect(
      inspectPlaytestSaveSlot(JSON.stringify({ ...envelope, projectId: project.manifest.projectId, formatVersion: 99 }), project, 1)
    ).toMatchObject({ status: "incompatible" });
  });

  it("rejects saves whose referenced content was removed", () => {
    const project = createDefaultProjectBundle("Changed project");
    const state = createInitialSaveState(project);
    state.inventory = ["item_removed"];
    const envelope = createPlaytestSaveEnvelope(project, state);

    const inspection = inspectPlaytestSaveSlot(JSON.stringify(envelope), project, 3);

    expect(inspection).toMatchObject({
      status: "incompatible",
      message: "Saved inventory item 'item_removed' no longer exists."
    });
  });

  it("classifies invalid JSON and malformed envelopes as corrupt without throwing", () => {
    const project = createDefaultProjectBundle("Corrupt saves");

    expect(inspectPlaytestSaveSlot("{not json", project, 1).status).toBe("corrupt");
    expect(
      inspectPlaytestSaveSlot(
        JSON.stringify({
          format: PLAYTEST_SAVE_FORMAT,
          formatVersion: 1,
          projectId: project.manifest.projectId,
          projectSchemaVersion: project.manifest.schemaVersion,
          projectEngineVersion: project.manifest.engineVersion,
          savedAt: "not-a-date",
          state: {}
        }),
        project,
        1
      ).status
    ).toBe("corrupt");
  });

  it("keeps valid legacy state visible but blocks unsafe loading", () => {
    const project = createDefaultProjectBundle("Legacy save");
    const legacyState = createInitialSaveState(project);

    expect(inspectPlaytestSaveSlot(JSON.stringify(legacyState), project, 1)).toMatchObject({
      status: "incompatible",
      message: expect.stringContaining("Legacy save data")
    });
  });

  it("reports storage access failures as unavailable", () => {
    const project = createDefaultProjectBundle("Unavailable saves");
    const inspection = readPlaytestSaveSlot(
      {
        getItem() {
          throw new Error("blocked");
        },
        setItem() {},
        removeItem() {}
      },
      project,
      1
    );

    expect(inspection).toMatchObject({ status: "unavailable", message: expect.stringContaining("blocked") });
    expect(resolvePlaytestSaveStatusLabel(inspection.status)).toBe("Unavailable");
  });

  it("detects incomplete dialogue pointers before controller creation", () => {
    const project = createDefaultProjectBundle("Dialogue compatibility");
    const state = createInitialSaveState(project);
    state.activeDialogueTreeId = "dialogue_missing";

    expect(resolvePlaytestSaveCompatibilityIssue(project, state)).toBe("The active dialogue pointer is incomplete.");
  });

  it("localizes save-slot labels and messages while preserving authored identifiers", () => {
    const project = createDefaultProjectBundle("Localized saves");
    const otherProject = createDefaultProjectBundle("Other saves");
    otherProject.manifest.projectId = "authored-project-id";
    const envelope = createPlaytestSaveEnvelope(otherProject, createInitialSaveState(otherProject));
    const translations: Record<string, string> = {
      Ready: "جاهز",
      "Saved for a different project ({projectId}).": "الحفظ لمشروع مختلف ({projectId})."
    };
    const t = (source: string, params?: Record<string, string | number>) =>
      (translations[source] ?? source).replace(/\{(\w+)\}/g, (placeholder, name: string) =>
        Object.prototype.hasOwnProperty.call(params ?? {}, name) ? String(params?.[name]) : placeholder
      );

    expect(resolvePlaytestSaveStatusLabel("ready", t)).toBe("جاهز");
    expect(inspectPlaytestSaveSlot(JSON.stringify(envelope), project, 1, t)).toMatchObject({
      status: "incompatible",
      message: "الحفظ لمشروع مختلف (authored-project-id)."
    });
  });
});

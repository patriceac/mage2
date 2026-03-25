import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { useEditorStore } from "./store";

beforeEach(() => {
  useEditorStore.getState().clearProjectContext();
});

describe("useEditorStore locale state", () => {
  it("keeps localizationLocale and playtestLocale independent", () => {
    useEditorStore.setState({
      localizationLocale: "fr",
      playtestLocale: "en"
    });

    useEditorStore.getState().setPlaytestLocale("de");

    expect(useEditorStore.getState().localizationLocale).toBe("fr");
    expect(useEditorStore.getState().playtestLocale).toBe("de");

    useEditorStore.getState().setLocalizationLocale("it");

    expect(useEditorStore.getState().localizationLocale).toBe("it");
    expect(useEditorStore.getState().playtestLocale).toBe("de");
  });

  it("falls back invalid stored locales to the project default", () => {
    const project = createDefaultProjectBundle("Locale fallback");
    project.manifest.supportedLocales = ["fr"];

    useEditorStore.setState({
      localizationLocale: "ja",
      playtestLocale: "pt-BR",
      localizationSection: "media"
    });

    useEditorStore.getState().setProjectContext(project, "D:\\project");

    expect(useEditorStore.getState().localizationLocale).toBe("en");
    expect(useEditorStore.getState().playtestLocale).toBe("en");
    expect(useEditorStore.getState().localizationSection).toBe("overview");
  });
});

describe("useEditorStore project history", () => {
  it("tracks undo and redo for in-memory edits", () => {
    const project = createDefaultProjectBundle("History");
    useEditorStore.getState().setProjectContext(project, "D:\\project");

    const renamedProject = structuredClone(project);
    renamedProject.manifest.projectName = "History Updated";
    useEditorStore.getState().updateProject(renamedProject);

    expect(useEditorStore.getState().project?.manifest.projectName).toBe("History Updated");
    expect(useEditorStore.getState().canUndo).toBe(true);
    expect(useEditorStore.getState().canRedo).toBe(false);
    expect(useEditorStore.getState().hasUnsavedChanges).toBe(true);

    useEditorStore.getState().undoProject();

    expect(useEditorStore.getState().project?.manifest.projectName).toBe("History");
    expect(useEditorStore.getState().canUndo).toBe(false);
    expect(useEditorStore.getState().canRedo).toBe(true);
    expect(useEditorStore.getState().hasUnsavedChanges).toBe(false);

    useEditorStore.getState().redoProject();

    expect(useEditorStore.getState().project?.manifest.projectName).toBe("History Updated");
    expect(useEditorStore.getState().canUndo).toBe(true);
    expect(useEditorStore.getState().canRedo).toBe(false);
    expect(useEditorStore.getState().hasUnsavedChanges).toBe(true);
  });

  it("preserves undo history across save while moving the dirty baseline", () => {
    const project = createDefaultProjectBundle("Save history");
    useEditorStore.getState().setProjectContext(project, "D:\\project");

    const renamedProject = structuredClone(project);
    renamedProject.manifest.projectName = "Saved Name";
    useEditorStore.getState().updateProject(renamedProject);
    useEditorStore.getState().markProjectSaved(renamedProject);

    expect(useEditorStore.getState().canUndo).toBe(true);
    expect(useEditorStore.getState().hasUnsavedChanges).toBe(false);

    useEditorStore.getState().undoProject();

    expect(useEditorStore.getState().project?.manifest.projectName).toBe("Save history");
    expect(useEditorStore.getState().hasUnsavedChanges).toBe(true);

    useEditorStore.getState().redoProject();

    expect(useEditorStore.getState().project?.manifest.projectName).toBe("Saved Name");
    expect(useEditorStore.getState().hasUnsavedChanges).toBe(false);
  });

  it("clears history when replacing the project with a disk-backed saved result", () => {
    const project = createDefaultProjectBundle("Replacement");
    useEditorStore.getState().setProjectContext(project, "D:\\project");

    const editedProject = structuredClone(project);
    editedProject.manifest.projectName = "Replacement Edited";
    useEditorStore.getState().updateProject(editedProject);

    expect(useEditorStore.getState().canUndo).toBe(true);

    const savedProject = structuredClone(editedProject);
    savedProject.manifest.projectName = "Replacement Saved";
    useEditorStore.getState().markProjectSaved(savedProject, { clearHistory: true });

    expect(useEditorStore.getState().project?.manifest.projectName).toBe("Replacement Saved");
    expect(useEditorStore.getState().canUndo).toBe(false);
    expect(useEditorStore.getState().canRedo).toBe(false);
    expect(useEditorStore.getState().hasUnsavedChanges).toBe(false);
  });

  it("does not create history entries for no-op project updates", () => {
    const project = createDefaultProjectBundle("No-op");
    useEditorStore.getState().setProjectContext(project, "D:\\project");

    useEditorStore.getState().updateProject(structuredClone(project));

    expect(useEditorStore.getState().canUndo).toBe(false);
    expect(useEditorStore.getState().canRedo).toBe(false);
  });

  it("coalesces skip-history updates behind a single manual checkpoint", () => {
    const project = createDefaultProjectBundle("Hotspot drag");
    const hotspot = project.scenes.items[0]?.hotspots[0];
    expect(hotspot).toBeDefined();

    useEditorStore.getState().setProjectContext(project, "D:\\project");
    useEditorStore.getState().captureUndoCheckpoint();

    const firstDragFrame = structuredClone(project);
    firstDragFrame.scenes.items[0]!.hotspots[0]!.x = 0.2;
    useEditorStore.getState().updateProject(firstDragFrame, { skipHistory: true });

    const secondDragFrame = structuredClone(firstDragFrame);
    secondDragFrame.scenes.items[0]!.hotspots[0]!.x = 0.35;
    useEditorStore.getState().updateProject(secondDragFrame, { skipHistory: true });

    expect(useEditorStore.getState().undoStack).toHaveLength(1);
    expect(useEditorStore.getState().project?.scenes.items[0]?.hotspots[0]?.x).toBe(0.35);

    useEditorStore.getState().undoProject();

    expect(useEditorStore.getState().project?.scenes.items[0]?.hotspots[0]?.x).toBe(hotspot?.x);

    useEditorStore.getState().redoProject();

    expect(useEditorStore.getState().project?.scenes.items[0]?.hotspots[0]?.x).toBe(0.35);
  });
});

import { createDefaultProjectBundle, getStringTranslationState } from "@mage2/schema";
import { describe, expect, it } from "vitest";
import {
  addProjectLocale,
  removeProjectLocale,
  setEditorLocalizedText,
  setEditorStringTranslationState,
  setProjectDefaultLocale
} from "./localized-project";

function getStarterTextId(project: ReturnType<typeof createDefaultProjectBundle>): string {
  return project.scenes.items[0]!.hotspots[0]!.commentTextId!;
}

describe("localized project workflow states", () => {
  it("adds source copies as inherited instead of completed translations", () => {
    const project = createDefaultProjectBundle("Inherited locale");
    const textId = getStarterTextId(project);

    addProjectLocale(project, "fr");

    expect(project.strings.byLocale.fr[textId]).toBe(project.strings.byLocale.en[textId]);
    expect(getStringTranslationState(project, "fr", textId)).toBe("inherited");
  });

  it("marks target edits draft until they are explicitly translated or reviewed", () => {
    const project = createDefaultProjectBundle("Translation states");
    const textId = getStarterTextId(project);
    addProjectLocale(project, "fr");

    setEditorLocalizedText(project, "fr", textId, "Ajoutez de vrais points interactifs");
    expect(getStringTranslationState(project, "fr", textId)).toBe("draft");

    setEditorStringTranslationState(project, "fr", textId, "translated");
    expect(getStringTranslationState(project, "fr", textId)).toBe("translated");

    setEditorStringTranslationState(project, "fr", textId, "reviewed");
    expect(getStringTranslationState(project, "fr", textId)).toBe("reviewed");
  });

  it("refreshes inherited copies when the source changes without overwriting translations", () => {
    const project = createDefaultProjectBundle("Source propagation");
    const textId = getStarterTextId(project);
    addProjectLocale(project, "fr");
    addProjectLocale(project, "de");
    setEditorLocalizedText(project, "fr", textId, "Ajoutez de vrais points interactifs");
    setEditorStringTranslationState(project, "fr", textId, "translated");

    setEditorLocalizedText(project, "en", textId, "Add interactive hotspots in Scenes");

    expect(project.strings.byLocale.de[textId]).toBe("Add interactive hotspots in Scenes");
    expect(getStringTranslationState(project, "de", textId)).toBe("inherited");
    expect(project.strings.byLocale.fr[textId]).toBe("Ajoutez de vrais points interactifs");
    expect(getStringTranslationState(project, "fr", textId)).toBe("translated");
  });

  it("recalculates non-source states when the project default locale changes", () => {
    const project = createDefaultProjectBundle("Default locale change");
    const textId = getStarterTextId(project);
    addProjectLocale(project, "fr");
    setEditorLocalizedText(project, "fr", textId, "Ajoutez de vrais points interactifs");
    setEditorStringTranslationState(project, "fr", textId, "reviewed");

    setProjectDefaultLocale(project, "fr");

    expect(project.manifest.defaultLanguage).toBe("fr");
    expect(project.strings.translationStateByLocale.fr).toEqual({});
    expect(getStringTranslationState(project, "en", textId)).toBe("draft");
  });

  it("removes translation values and states together", () => {
    const project = createDefaultProjectBundle("Remove locale");
    addProjectLocale(project, "fr");

    removeProjectLocale(project, "fr");

    expect(project.strings.byLocale.fr).toBeUndefined();
    expect(project.strings.translationStateByLocale.fr).toBeUndefined();
    expect(project.manifest.supportedLocales).toEqual(["en"]);
  });
});

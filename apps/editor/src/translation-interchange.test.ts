import {
  createDefaultProjectBundle,
  getStringTranslationState,
  parseTranslationInterchange,
  type ProjectBundle
} from "@mage2/schema";
import { describe, expect, it } from "vitest";
import {
  analyzeTranslationInterchangeImport,
  applyTranslationInterchangeImport,
  createTranslationInterchange,
  createTranslationInterchangeFileName
} from "./translation-interchange";

function createLocalizedProject(): ProjectBundle {
  const project = createDefaultProjectBundle("Handoff: Project");
  const source = project.strings.byLocale.en!;
  project.manifest.supportedLocales = ["en", "fr"];
  project.strings.byLocale.fr = { ...source };
  project.strings.translationStateByLocale.fr = Object.fromEntries(
    Object.keys(source).map((textId) => [textId, "inherited"])
  );

  const [draftId, translatedId, reviewedId] = Object.keys(source);
  project.strings.byLocale.fr[draftId!] = "Brouillon";
  project.strings.translationStateByLocale.fr[draftId!] = "draft";
  project.strings.byLocale.fr[translatedId!] = "Traduit";
  project.strings.translationStateByLocale.fr[translatedId!] = "translated";
  project.strings.byLocale.fr[reviewedId!] = "Révisé";
  project.strings.translationStateByLocale.fr[reviewedId!] = "reviewed";
  return project;
}

describe("translation interchange", () => {
  it("exports a deterministic, lossless JSON document with IDs and workflow states", () => {
    const project = createLocalizedProject();
    const interchange = createTranslationInterchange(project, "fr", "2026-08-12T00:00:00.000Z");
    const reparsed = parseTranslationInterchange(JSON.parse(JSON.stringify(interchange)));
    const sourceIds = Object.keys(project.strings.byLocale.en!).sort();

    expect(reparsed.entries.map((entry) => entry.id)).toEqual(sourceIds);
    expect(reparsed.entries.map((entry) => entry.baseline?.state)).toEqual(
      sourceIds.map((textId) => project.strings.translationStateByLocale.fr![textId])
    );
    expect(reparsed.entries.every((entry) => JSON.stringify(entry.baseline) === JSON.stringify(entry.translation))).toBe(true);
    expect(createTranslationInterchangeFileName(project.manifest.projectName, "fr")).toBe(
      "Handoff- Project.fr.mage2-translation.json"
    );
  });

  it("applies externally edited values and exact states without changing IDs", () => {
    const project = createLocalizedProject();
    const beforeIds = Object.keys(project.strings.byLocale.fr!).sort();
    const interchange = createTranslationInterchange(project, "fr", "2026-08-12T00:00:00.000Z");
    const [draftEntry, translatedEntry, reviewedEntry, inheritedEntry] = interchange.entries;
    draftEntry!.translation = { value: "Nouveau brouillon", state: "draft" };
    translatedEntry!.translation = { value: "Nouvelle traduction", state: "translated" };
    reviewedEntry!.translation = { value: "Traduction révisée", state: "reviewed" };
    inheritedEntry!.translation = null;

    const dryRun = analyzeTranslationInterchangeImport(project, interchange, "fr");
    expect(dryRun.blockingIssues).toEqual([]);
    expect(dryRun.changeCount).toBe(4);
    expect(project.strings.byLocale.fr![draftEntry!.id]).not.toBe("Nouveau brouillon");

    const applied = applyTranslationInterchangeImport(project, interchange, "fr");
    expect(applied.appliedCount).toBe(4);
    expect(project.strings.byLocale.fr![draftEntry!.id]).toBe("Nouveau brouillon");
    expect(getStringTranslationState(project, "fr", draftEntry!.id)).toBe("draft");
    expect(getStringTranslationState(project, "fr", translatedEntry!.id)).toBe("translated");
    expect(getStringTranslationState(project, "fr", reviewedEntry!.id)).toBe("reviewed");
    expect(project.strings.byLocale.fr).not.toHaveProperty(inheritedEntry!.id);
    expect(Object.keys(project.strings.byLocale.fr!).sort()).toEqual(beforeIds.filter((id) => id !== inheritedEntry!.id));
  });

  it("reports source, local, unknown, missing, and invalid-state conflicts before mutation", () => {
    const project = createLocalizedProject();
    const interchange = createTranslationInterchange(project, "fr", "2026-08-12T00:00:00.000Z");
    const [safe, sourceChanged, localChanged, invalidInherited, missingFromFile] = interchange.entries;
    safe!.translation = { value: "Modification sûre", state: "translated" };
    sourceChanged!.translation = { value: "Source obsolète", state: "translated" };
    localChanged!.translation = { value: "Modification externe", state: "translated" };
    invalidInherited!.translation = { value: "Ne correspond pas", state: "inherited" };
    project.strings.byLocale.en![sourceChanged!.id] = "Changed source";
    project.strings.byLocale.fr![localChanged!.id] = "Local edit";
    project.strings.translationStateByLocale.fr![localChanged!.id] = "draft";
    interchange.entries = interchange.entries.filter((entry) => entry.id !== missingFromFile!.id);
    interchange.entries.push({
      id: "text.unknown",
      source: "Unknown",
      baseline: null,
      translation: { value: "Inconnu", state: "translated" }
    });
    const before = structuredClone(project.strings);

    const plan = analyzeTranslationInterchangeImport(project, interchange, "fr");
    expect(plan.blockingIssues).toEqual([]);
    expect(plan.changeCount).toBe(1);
    expect(plan.entries.filter((entry) => entry.outcome === "conflict").map((entry) => entry.conflictReason)).toEqual(
      expect.arrayContaining(["source-changed", "local-changed", "inherited-value-mismatch", "unexpected-id", "missing-from-file"])
    );
    expect(project.strings).toEqual(before);

    const applied = applyTranslationInterchangeImport(project, interchange, "fr");
    expect(applied.appliedCount).toBe(1);
    expect(project.strings.byLocale.fr![safe!.id]).toBe("Modification sûre");
    expect(project.strings.byLocale.fr![localChanged!.id]).toBe("Local edit");
    expect(project.strings.byLocale.fr).not.toHaveProperty("text.unknown");
  });

  it("blocks a file for another project or active locale without mutation", () => {
    const project = createLocalizedProject();
    const interchange = createTranslationInterchange(project, "fr", "2026-08-12T00:00:00.000Z");
    interchange.project.id = "another_project";
    const before = structuredClone(project.strings);
    const plan = analyzeTranslationInterchangeImport(project, interchange, "es");

    expect(plan.blockingIssues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["project-id-mismatch", "target-locale-mismatch"])
    );
    expect(() => applyTranslationInterchangeImport(project, interchange, "es")).toThrow(/translation-interchange-incompatible/u);
    expect(project.strings).toEqual(before);
  });

  it("rejects duplicate IDs and malformed completion state", () => {
    const project = createLocalizedProject();
    const interchange = createTranslationInterchange(project, "fr", "2026-08-12T00:00:00.000Z");
    interchange.entries.push(structuredClone(interchange.entries[0]!));
    expect(() => parseTranslationInterchange(interchange)).toThrow(/Duplicate text ID/u);

    const valid = createTranslationInterchange(project, "fr", "2026-08-12T00:00:00.000Z");
    valid.entries[0]!.translation = { value: "   ", state: "reviewed" };
    const plan = analyzeTranslationInterchangeImport(project, valid, "fr");
    expect(plan.entries[0]).toMatchObject({ outcome: "conflict", conflictReason: "complete-state-empty" });
  });
});

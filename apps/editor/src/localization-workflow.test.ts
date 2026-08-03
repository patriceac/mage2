import { describe, expect, it } from "vitest";
import type { ProjectTextEntry } from "./project-text";
import { calculateStringCoverage, getLocalizedStringStatus } from "./localization-workflow";

function entry(
  textId: string,
  value: string,
  translationState?: ProjectTextEntry["translationState"],
  status: ProjectTextEntry["status"] = "referenced",
  isSourceLocale = false
): ProjectTextEntry {
  return {
    textId,
    value,
    status,
    isSourceLocale,
    translationState,
    usages: []
  };
}

describe("localization workflow coverage", () => {
  it("excludes inherited copies and drafts from completion", () => {
    const entries = [
      entry("text.inherited", "Source copy", "inherited"),
      entry("text.draft", "Brouillon", "draft"),
      entry("text.translated", "Traduit", "translated"),
      entry("text.reviewed", "Relu", "reviewed"),
      entry("text.missing", "", undefined, "missing"),
      entry("text.empty", "", "draft"),
      entry("text.orphan", "Unused", "reviewed", "orphaned")
    ];

    expect(calculateStringCoverage(entries)).toEqual({
      total: 6,
      complete: 2,
      needsWork: 4,
      missing: 1,
      empty: 1,
      inherited: 1,
      draft: 1,
      translated: 1,
      reviewed: 1,
      source: 0,
      orphaned: 1
    });
  });

  it("treats a non-empty default-locale value as source rather than translated", () => {
    const sourceEntry = entry("text.source", "Source text", undefined, "referenced", true);

    expect(getLocalizedStringStatus(sourceEntry)).toBe("source");
    expect(calculateStringCoverage([sourceEntry])).toMatchObject({
      total: 1,
      complete: 1,
      source: 1,
      translated: 0,
      reviewed: 0
    });
  });
});

import type { ProjectTextEntry } from "./project-text";

export type LocalizedStringStatus =
  | "missing"
  | "empty"
  | "inherited"
  | "draft"
  | "translated"
  | "reviewed"
  | "source"
  | "orphaned";

export interface StringCoverageSummary {
  total: number;
  complete: number;
  needsWork: number;
  missing: number;
  empty: number;
  inherited: number;
  draft: number;
  translated: number;
  reviewed: number;
  source: number;
  orphaned: number;
}

export function getLocalizedStringStatus(entry: ProjectTextEntry): LocalizedStringStatus {
  if (entry.status === "missing") {
    return "missing";
  }

  if (entry.status === "orphaned") {
    return "orphaned";
  }

  if (entry.value.trim().length === 0) {
    return "empty";
  }

  if (entry.isSourceLocale) {
    return "source";
  }

  return entry.translationState ?? "draft";
}

export function isTranslationCompleteStatus(status: LocalizedStringStatus): boolean {
  return status === "translated" || status === "reviewed";
}

export function calculateStringCoverage(entries: readonly ProjectTextEntry[]): StringCoverageSummary {
  const summary: StringCoverageSummary = {
    total: 0,
    complete: 0,
    needsWork: 0,
    missing: 0,
    empty: 0,
    inherited: 0,
    draft: 0,
    translated: 0,
    reviewed: 0,
    source: 0,
    orphaned: 0
  };

  for (const entry of entries) {
    const status = getLocalizedStringStatus(entry);
    summary[status] += 1;

    if (status === "orphaned") {
      continue;
    }

    summary.total += 1;
    if (status === "source" || isTranslationCompleteStatus(status)) {
      summary.complete += 1;
    } else {
      summary.needsWork += 1;
    }
  }

  return summary;
}

import {
  ensureLocaleStringTranslationStates,
  ensureLocaleStringValues,
  getLocaleStringValues,
  getStringTranslationState,
  normalizeSupportedLocales,
  TRANSLATION_INTERCHANGE_FORMAT,
  TRANSLATION_INTERCHANGE_VERSION,
  type ProjectBundle,
  type StringTranslationState,
  type TranslationInterchange,
  type TranslationInterchangeEntry,
  type TranslationInterchangeValue
} from "@mage2/schema";

export type TranslationImportBlockingIssueCode =
  | "project-id-mismatch"
  | "source-locale-mismatch"
  | "target-locale-mismatch"
  | "target-locale-unsupported"
  | "target-is-source";

export type TranslationImportConflictReason =
  | "unexpected-id"
  | "missing-from-file"
  | "source-changed"
  | "local-changed"
  | "inherited-source-missing"
  | "inherited-value-mismatch"
  | "complete-state-empty";

export interface TranslationImportBlockingIssue {
  code: TranslationImportBlockingIssueCode;
  expected?: string;
  actual?: string;
}

export type TranslationImportEntryOutcome = "change" | "unchanged" | "conflict";

export interface TranslationImportPlanEntry {
  id: string;
  outcome: TranslationImportEntryOutcome;
  conflictReason?: TranslationImportConflictReason;
  source: string | null;
  baseline: TranslationInterchangeValue | null;
  current: TranslationInterchangeValue | null;
  incoming: TranslationInterchangeValue | null;
}

export interface TranslationImportPlan {
  interchange: TranslationInterchange;
  blockingIssues: TranslationImportBlockingIssue[];
  entries: TranslationImportPlanEntry[];
  changeCount: number;
  unchangedCount: number;
  conflictCount: number;
}

export interface TranslationImportApplyResult extends TranslationImportPlan {
  appliedCount: number;
}

export function createTranslationInterchange(
  project: ProjectBundle,
  targetLocale: string,
  exportedAt = new Date().toISOString()
): TranslationInterchange {
  assertTargetLocale(project, targetLocale);
  const sourceLocale = project.manifest.defaultLanguage;
  const sourceValues = getLocaleStringValues(project, sourceLocale);
  const targetValues = getLocaleStringValues(project, targetLocale);
  const textIds = new Set([...Object.keys(sourceValues), ...Object.keys(targetValues)]);

  return {
    format: TRANSLATION_INTERCHANGE_FORMAT,
    version: TRANSLATION_INTERCHANGE_VERSION,
    exportedAt,
    project: {
      id: project.manifest.projectId,
      name: project.manifest.projectName,
      schemaVersion: project.manifest.schemaVersion
    },
    sourceLocale,
    targetLocale,
    entries: [...textIds]
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((textId): TranslationInterchangeEntry => {
        const baseline = snapshotTranslation(project, targetLocale, textId);
        return {
          id: textId,
          source: hasOwn(sourceValues, textId) ? sourceValues[textId] ?? "" : null,
          baseline,
          translation: cloneTranslationValue(baseline)
        };
      })
  };
}

export function createTranslationInterchangeFileName(projectName: string, targetLocale: string): string {
  const safeProjectName = sanitizeFileNameSegment(projectName) || "mage2-project";
  const safeLocale = sanitizeFileNameSegment(targetLocale) || "locale";
  return `${safeProjectName}.${safeLocale}.mage2-translation.json`;
}

export function analyzeTranslationInterchangeImport(
  project: ProjectBundle,
  interchange: TranslationInterchange,
  expectedTargetLocale?: string
): TranslationImportPlan {
  const blockingIssues = collectBlockingIssues(project, interchange, expectedTargetLocale);
  const currentSourceValues = getLocaleStringValues(project, project.manifest.defaultLanguage);
  const currentTargetValues = getLocaleStringValues(project, interchange.targetLocale);
  const currentTextIds = new Set([...Object.keys(currentSourceValues), ...Object.keys(currentTargetValues)]);
  const fileEntriesById = new Map(interchange.entries.map((entry) => [entry.id, entry]));
  const entries: TranslationImportPlanEntry[] = [];

  for (const fileEntry of interchange.entries) {
    if (!currentTextIds.has(fileEntry.id)) {
      entries.push(planConflict(fileEntry, null, "unexpected-id"));
      continue;
    }

    const currentSource = hasOwn(currentSourceValues, fileEntry.id)
      ? currentSourceValues[fileEntry.id] ?? ""
      : null;
    const current = snapshotTranslation(project, interchange.targetLocale, fileEntry.id);
    const proposedConflict = validateIncomingTranslation(fileEntry.translation, currentSource);

    if (currentSource !== fileEntry.source) {
      entries.push(planConflict(fileEntry, current, "source-changed", currentSource));
      continue;
    }
    if (proposedConflict) {
      entries.push(planConflict(fileEntry, current, proposedConflict, currentSource));
      continue;
    }
    if (!translationValuesEqual(current, fileEntry.baseline)) {
      if (translationValuesEqual(current, fileEntry.translation)) {
        entries.push(planEntry(fileEntry, current, "unchanged", currentSource));
      } else {
        entries.push(planConflict(fileEntry, current, "local-changed", currentSource));
      }
      continue;
    }

    entries.push(planEntry(
      fileEntry,
      current,
      translationValuesEqual(current, fileEntry.translation) ? "unchanged" : "change",
      currentSource
    ));
  }

  for (const textId of [...currentTextIds].sort((left, right) => left.localeCompare(right, "en"))) {
    if (fileEntriesById.has(textId)) {
      continue;
    }
    const currentSource = hasOwn(currentSourceValues, textId) ? currentSourceValues[textId] ?? "" : null;
    entries.push({
      id: textId,
      outcome: "conflict",
      conflictReason: "missing-from-file",
      source: currentSource,
      baseline: null,
      current: snapshotTranslation(project, interchange.targetLocale, textId),
      incoming: null
    });
  }

  entries.sort((left, right) => {
    const outcomeOrder = { conflict: 0, change: 1, unchanged: 2 } as const;
    return outcomeOrder[left.outcome] - outcomeOrder[right.outcome]
      || left.id.localeCompare(right.id, "en");
  });

  return {
    interchange,
    blockingIssues,
    entries,
    changeCount: entries.filter((entry) => entry.outcome === "change").length,
    unchangedCount: entries.filter((entry) => entry.outcome === "unchanged").length,
    conflictCount: entries.filter((entry) => entry.outcome === "conflict").length
  };
}

export function applyTranslationInterchangeImport(
  project: ProjectBundle,
  interchange: TranslationInterchange,
  expectedTargetLocale?: string
): TranslationImportApplyResult {
  const plan = analyzeTranslationInterchangeImport(project, interchange, expectedTargetLocale);
  if (plan.blockingIssues.length > 0) {
    throw new Error("translation-interchange-incompatible");
  }

  const values = ensureLocaleStringValues(project, interchange.targetLocale);
  const states = ensureLocaleStringTranslationStates(project, interchange.targetLocale);
  let appliedCount = 0;
  for (const entry of plan.entries) {
    if (entry.outcome !== "change") {
      continue;
    }
    if (entry.incoming === null) {
      delete values[entry.id];
      delete states[entry.id];
    } else {
      values[entry.id] = entry.incoming.value;
      states[entry.id] = entry.incoming.state;
    }
    appliedCount += 1;
  }

  return { ...plan, appliedCount };
}

function collectBlockingIssues(
  project: ProjectBundle,
  interchange: TranslationInterchange,
  expectedTargetLocale?: string
): TranslationImportBlockingIssue[] {
  const issues: TranslationImportBlockingIssue[] = [];
  if (interchange.project.id !== project.manifest.projectId) {
    issues.push({
      code: "project-id-mismatch",
      expected: project.manifest.projectId,
      actual: interchange.project.id
    });
  }
  if (interchange.sourceLocale !== project.manifest.defaultLanguage) {
    issues.push({
      code: "source-locale-mismatch",
      expected: project.manifest.defaultLanguage,
      actual: interchange.sourceLocale
    });
  }
  if (expectedTargetLocale && interchange.targetLocale !== expectedTargetLocale) {
    issues.push({
      code: "target-locale-mismatch",
      expected: expectedTargetLocale,
      actual: interchange.targetLocale
    });
  }
  const supportedLocales = normalizeSupportedLocales(
    project.manifest.defaultLanguage,
    project.manifest.supportedLocales
  );
  if (!supportedLocales.includes(interchange.targetLocale)) {
    issues.push({
      code: "target-locale-unsupported",
      expected: supportedLocales.join(", "),
      actual: interchange.targetLocale
    });
  }
  if (interchange.targetLocale === project.manifest.defaultLanguage) {
    issues.push({
      code: "target-is-source",
      expected: supportedLocales.filter((locale) => locale !== project.manifest.defaultLanguage).join(", "),
      actual: interchange.targetLocale
    });
  }
  return issues;
}

function planEntry(
  fileEntry: TranslationInterchangeEntry,
  current: TranslationInterchangeValue | null,
  outcome: TranslationImportEntryOutcome,
  source = fileEntry.source
): TranslationImportPlanEntry {
  return {
    id: fileEntry.id,
    outcome,
    source,
    baseline: cloneTranslationValue(fileEntry.baseline),
    current: cloneTranslationValue(current),
    incoming: cloneTranslationValue(fileEntry.translation)
  };
}

function planConflict(
  fileEntry: TranslationInterchangeEntry,
  current: TranslationInterchangeValue | null,
  conflictReason: TranslationImportConflictReason,
  source = fileEntry.source
): TranslationImportPlanEntry {
  return {
    ...planEntry(fileEntry, current, "conflict", source),
    conflictReason
  };
}

function validateIncomingTranslation(
  incoming: TranslationInterchangeValue | null,
  currentSource: string | null
): TranslationImportConflictReason | undefined {
  if (!incoming) {
    return undefined;
  }
  if (incoming.state === "inherited") {
    if (currentSource === null) {
      return "inherited-source-missing";
    }
    if (incoming.value !== currentSource) {
      return "inherited-value-mismatch";
    }
  }
  if ((incoming.state === "translated" || incoming.state === "reviewed") && incoming.value.trim() === "") {
    return "complete-state-empty";
  }
  return undefined;
}

function assertTargetLocale(project: ProjectBundle, targetLocale: string): void {
  const supportedLocales = normalizeSupportedLocales(
    project.manifest.defaultLanguage,
    project.manifest.supportedLocales
  );
  if (targetLocale === project.manifest.defaultLanguage || !supportedLocales.includes(targetLocale)) {
    throw new Error("translation-interchange-target-locale");
  }
}

function snapshotTranslation(
  project: ProjectBundle,
  targetLocale: string,
  textId: string
): TranslationInterchangeValue | null {
  const values = getLocaleStringValues(project, targetLocale);
  if (!hasOwn(values, textId)) {
    return null;
  }
  return {
    value: values[textId] ?? "",
    state: getStringTranslationState(project, targetLocale, textId) ?? "draft"
  };
}

function cloneTranslationValue(value: TranslationInterchangeValue | null): TranslationInterchangeValue | null {
  return value ? { value: value.value, state: value.state as StringTranslationState } : null;
}

function translationValuesEqual(
  left: TranslationInterchangeValue | null,
  right: TranslationInterchangeValue | null
): boolean {
  return left === null || right === null
    ? left === right
    : left.value === right.value && left.state === right.state;
}

function sanitizeFileNameSegment(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/[. ]+$/gu, "")
    .trim()
    .slice(0, 96);
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

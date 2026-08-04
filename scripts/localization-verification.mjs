import assert from "node:assert/strict";

export const BUILT_IN_LOCALE_CASES = Object.freeze([
  { locale: "en", browserLocale: "en-US", direction: "ltr" },
  { locale: "fr", browserLocale: "fr-FR", direction: "ltr" },
  { locale: "es", browserLocale: "es-ES", direction: "ltr" },
  { locale: "zh-Hans", browserLocale: "zh-CN", direction: "ltr" },
  { locale: "ja", browserLocale: "ja-JP", direction: "ltr" },
  { locale: "ko", browserLocale: "ko-KR", direction: "ltr" },
  { locale: "ar", browserLocale: "ar-SA", direction: "rtl" }
]);

export const FALLBACK_LOCALE_CASES = Object.freeze([
  { label: "unsupported", browserLocale: "de-DE", expectedLocale: "en" },
  { label: "zh-Hant", browserLocale: "zh-TW", expectedLocale: "en" }
]);

export function directionForLocale(locale) {
  return locale === "ar" ? "rtl" : "ltr";
}

export function assertEditorLocaleState(state, expected, baseline, context) {
  assert.equal(state?.uiLocale, expected.locale, `${context}: editor uiLocale differs.`);
  assert.equal(state?.uiLocalePreference, expected.preference, `${context}: editor locale preference differs.`);
  assert.equal(state?.uiDirection, expected.direction, `${context}: editor uiDirection differs.`);
  assert.equal(
    state?.hasUnsavedChanges,
    baseline.hasUnsavedChanges,
    `${context}: changing interface locale changed the project dirty state.`
  );
  assert.equal(state?.projectDir, baseline.projectDir, `${context}: changing interface locale changed the project path.`);
  assert.equal(state?.projectName, baseline.projectName, `${context}: changing interface locale changed the project name.`);
}

export function assertRuntimeLocaleState(state, expected, context) {
  assert.equal(state.documentLanguage, expected.locale, `${context}: document language differs.`);
  assert.equal(state.documentDirection, expected.direction, `${context}: document direction differs.`);
  assert.equal(state.interfacePreference, expected.preference, `${context}: interface preference differs.`);
  if (expected.gameLocale !== undefined) {
    assert.equal(state.gameLocale, expected.gameLocale, `${context}: game locale changed with the interface locale.`);
  }
}


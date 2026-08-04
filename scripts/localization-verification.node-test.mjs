import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_LOCALE_CASES,
  FALLBACK_LOCALE_CASES,
  assertEditorLocaleState,
  assertRuntimeLocaleState,
  directionForLocale
} from "./localization-verification.mjs";

test("localization verification matrix covers every built-in locale and fallback", () => {
  assert.deepEqual(BUILT_IN_LOCALE_CASES.map(({ locale }) => locale), ["en", "fr", "es", "zh-Hans", "ja", "ko", "ar"]);
  assert.deepEqual(FALLBACK_LOCALE_CASES, [
    { label: "unsupported", browserLocale: "de-DE", expectedLocale: "en" },
    { label: "zh-Hant", browserLocale: "zh-TW", expectedLocale: "en" }
  ]);
  assert.equal(directionForLocale("ar"), "rtl");
  assert.equal(directionForLocale("zh-Hans"), "ltr");
});

test("editor assertions protect locale state and project state independently", () => {
  const baseline = { hasUnsavedChanges: false, projectDir: "C:\\project", projectName: "Example" };
  assert.doesNotThrow(() => assertEditorLocaleState({
    ...baseline,
    uiLocale: "ar",
    uiLocalePreference: "ar",
    uiDirection: "rtl"
  }, { locale: "ar", preference: "ar", direction: "rtl" }, baseline, "Arabic"));
  assert.throws(() => assertEditorLocaleState({
    ...baseline,
    hasUnsavedChanges: true,
    uiLocale: "ar",
    uiLocalePreference: "ar",
    uiDirection: "rtl"
  }, { locale: "ar", preference: "ar", direction: "rtl" }, baseline, "Arabic"), /dirty state/u);
});

test("runtime assertions keep interface and game locale separate", () => {
  assert.doesNotThrow(() => assertRuntimeLocaleState({
    documentLanguage: "ar",
    documentDirection: "rtl",
    interfacePreference: "ar",
    gameLocale: "fr"
  }, { locale: "ar", preference: "ar", direction: "rtl", gameLocale: "fr" }, "runtime"));
});


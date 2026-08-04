import { BUILT_IN_LOCALES, resolveBuiltInLocale, type BuiltInLocale } from "@mage2/schema";

export const EDITOR_INTERFACE_LOCALE_STORAGE_KEY = "mage2-editor-interface-locale";
export type EditorLocalePreference = "automatic" | BuiltInLocale;

export interface EditorLocaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function isBuiltInLocale(value: unknown): value is BuiltInLocale {
  return typeof value === "string" && (BUILT_IN_LOCALES as readonly string[]).includes(value);
}

export function hasExplicitEditorLocaleOverride(preference: EditorLocalePreference): boolean {
  return preference !== "automatic";
}

export function readEditorLocalePreference(storage: EditorLocaleStorage | null | undefined): EditorLocalePreference {
  if (!storage) {
    return "automatic";
  }

  try {
    const storedPreference = storage.getItem(EDITOR_INTERFACE_LOCALE_STORAGE_KEY);
    return isBuiltInLocale(storedPreference) ? storedPreference : "automatic";
  } catch {
    return "automatic";
  }
}

export function persistEditorLocalePreference(
  storage: EditorLocaleStorage | null | undefined,
  preference: EditorLocalePreference
): void {
  if (!storage) {
    return;
  }

  try {
    if (preference === "automatic") {
      storage.removeItem(EDITOR_INTERFACE_LOCALE_STORAGE_KEY);
    } else {
      storage.setItem(EDITOR_INTERFACE_LOCALE_STORAGE_KEY, preference);
    }
  } catch {
    // Storage can be unavailable or denied; the in-memory preference still applies.
  }
}

export function resolveEditorLocalePreference(
  preference: EditorLocalePreference,
  preferredSystemLocales: readonly string[]
): BuiltInLocale {
  return preference === "automatic" ? resolveBuiltInLocale(preferredSystemLocales) : preference;
}

export function resolveEditorLocaleSelection(
  preference: EditorLocalePreference,
  preferredSystemLocales: readonly string[]
): { automaticLocale: BuiltInLocale; locale: BuiltInLocale } {
  const automaticLocale = resolveBuiltInLocale(preferredSystemLocales);
  return {
    automaticLocale,
    locale: preference === "automatic" ? automaticLocale : preference
  };
}

export function getPreferredSystemLocales(): readonly string[] {
  try {
    const electronLocales = typeof window === "undefined"
      ? undefined
      : window.editorApi?.getPreferredSystemLanguagesSync?.();
    if (Array.isArray(electronLocales)) {
      return electronLocales;
    }
  } catch {
    // Browser development and tests use navigator as the fallback.
  }

  if (typeof navigator === "undefined") {
    return [];
  }

  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

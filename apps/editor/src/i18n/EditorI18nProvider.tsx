import {
  BUILT_IN_LOCALE_DIRECTIONS,
  type BuiltInLocale,
  type TextDirection
} from "@mage2/schema";
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { EDITOR_CATALOG } from "./catalog";
import {
  getPreferredSystemLocales,
  hasExplicitEditorLocaleOverride,
  persistEditorLocalePreference,
  readEditorLocalePreference,
  resolveEditorLocaleSelection,
  type EditorLocalePreference
} from "./preference";
import { createEditorTranslator, type EditorMessageParams } from "./translate";

export interface EditorI18nContextValue {
  locale: BuiltInLocale;
  automaticLocale: BuiltInLocale;
  direction: TextDirection;
  preference: EditorLocalePreference;
  hasExplicitOverride: boolean;
  setPreference(preference: EditorLocalePreference): void;
  t(source: string, params?: EditorMessageParams): string;
}

const DEFAULT_EDITOR_I18N_CONTEXT: EditorI18nContextValue = {
  locale: "en",
  automaticLocale: "en",
  direction: "ltr",
  preference: "automatic",
  hasExplicitOverride: false,
  setPreference: () => undefined,
  t: createEditorTranslator(EDITOR_CATALOG, "en")
};

const EditorI18nContext = createContext<EditorI18nContextValue>(DEFAULT_EDITOR_I18N_CONTEXT);

function getBrowserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function applyDocumentLocale(locale: BuiltInLocale, direction: TextDirection): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.lang = locale;
  document.documentElement.dir = direction;
}

export function EditorI18nProvider({ children }: { children: ReactNode }) {
  const [preferredSystemLocales] = useState<readonly string[]>(getPreferredSystemLocales);
  const [preference, setPreferenceState] = useState<EditorLocalePreference>(() =>
    readEditorLocalePreference(getBrowserStorage())
  );
  const { automaticLocale, locale } = resolveEditorLocaleSelection(preference, preferredSystemLocales);
  const direction = BUILT_IN_LOCALE_DIRECTIONS[locale];

  useLayoutEffect(() => {
    applyDocumentLocale(locale, direction);
  }, [direction, locale]);

  const setPreference = useCallback((nextPreference: EditorLocalePreference) => {
    persistEditorLocalePreference(getBrowserStorage(), nextPreference);
    setPreferenceState(nextPreference);
  }, []);

  const t = useMemo(
    () => createEditorTranslator(EDITOR_CATALOG, locale, { diagnoseMissing: import.meta.env.DEV }),
    [locale]
  );
  const value = useMemo<EditorI18nContextValue>(
    () => ({
      locale,
      automaticLocale,
      direction,
      preference,
      hasExplicitOverride: hasExplicitEditorLocaleOverride(preference),
      setPreference,
      t
    }),
    [automaticLocale, direction, locale, preference, setPreference, t]
  );

  return <EditorI18nContext.Provider value={value}>{children}</EditorI18nContext.Provider>;
}

export function useEditorI18n(): EditorI18nContextValue {
  return useContext(EditorI18nContext);
}

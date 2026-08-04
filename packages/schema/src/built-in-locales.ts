export const BUILT_IN_LOCALES = ["en", "fr", "es", "zh-Hans", "ja", "ko", "ar"] as const;

export type BuiltInLocale = (typeof BUILT_IN_LOCALES)[number];
export type TextDirection = "ltr" | "rtl";

export interface BuiltInLocaleMetadata {
  autonym: string;
  direction: TextDirection;
}

export const BUILT_IN_LOCALE_METADATA: Readonly<Record<BuiltInLocale, BuiltInLocaleMetadata>> = {
  en: { autonym: "English", direction: "ltr" },
  fr: { autonym: "Français", direction: "ltr" },
  es: { autonym: "Español", direction: "ltr" },
  "zh-Hans": { autonym: "简体中文", direction: "ltr" },
  ja: { autonym: "日本語", direction: "ltr" },
  ko: { autonym: "한국어", direction: "ltr" },
  ar: { autonym: "العربية", direction: "rtl" }
};

export const BUILT_IN_LOCALE_AUTONYMS: Readonly<Record<BuiltInLocale, string>> = Object.fromEntries(
  BUILT_IN_LOCALES.map((locale) => [locale, BUILT_IN_LOCALE_METADATA[locale].autonym])
) as Record<BuiltInLocale, string>;

export const BUILT_IN_LOCALE_DIRECTIONS: Readonly<Record<BuiltInLocale, TextDirection>> = Object.fromEntries(
  BUILT_IN_LOCALES.map((locale) => [locale, BUILT_IN_LOCALE_METADATA[locale].direction])
) as Record<BuiltInLocale, TextDirection>;

function matchBuiltInLocale(locale: string): BuiltInLocale | undefined {
  let canonicalLocale: string;
  try {
    [canonicalLocale] = Intl.getCanonicalLocales(locale);
  } catch {
    return undefined;
  }

  const normalized = canonicalLocale.toLowerCase();
  const [language] = normalized.split("-");

  if (language === "zh") {
    if (
      normalized === "zh" ||
      normalized.startsWith("zh-hans-") ||
      normalized === "zh-hans" ||
      normalized === "zh-cn" ||
      normalized.startsWith("zh-cn-") ||
      normalized === "zh-sg" ||
      normalized.startsWith("zh-sg-")
    ) {
      return "zh-Hans";
    }

    return undefined;
  }

  if (language === "en" || language === "fr" || language === "es" || language === "ja" || language === "ko" || language === "ar") {
    return language;
  }

  return undefined;
}

export function resolveBuiltInLocale(preferredLocales: readonly string[] | null | undefined): BuiltInLocale {
  for (const preferredLocale of preferredLocales ?? []) {
    if (typeof preferredLocale !== "string" || preferredLocale.trim() === "") {
      continue;
    }

    const locale = matchBuiltInLocale(preferredLocale);
    if (locale) {
      return locale;
    }
  }

  return "en";
}

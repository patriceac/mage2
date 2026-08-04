import { describe, expect, it } from "vitest";
import {
  BUILT_IN_LOCALE_AUTONYMS,
  BUILT_IN_LOCALE_DIRECTIONS,
  BUILT_IN_LOCALES,
  resolveBuiltInLocale
} from "./built-in-locales";

describe("built-in editor locales", () => {
  it("keeps the canonical locale order, autonyms, and directions", () => {
    expect(BUILT_IN_LOCALES).toEqual(["en", "fr", "es", "zh-Hans", "ja", "ko", "ar"]);
    expect(BUILT_IN_LOCALE_AUTONYMS).toEqual({
      en: "English",
      fr: "Français",
      es: "Español",
      "zh-Hans": "简体中文",
      ja: "日本語",
      ko: "한국어",
      ar: "العربية"
    });
    expect(BUILT_IN_LOCALE_DIRECTIONS.ar).toBe("rtl");
    expect(BUILT_IN_LOCALES.filter((locale) => BUILT_IN_LOCALE_DIRECTIONS[locale] === "rtl")).toEqual(["ar"]);
  });

  it.each([
    ["en-GB", "en"],
    ["fr-CA", "fr"],
    ["es-MX", "es"],
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["ar-EG", "ar"],
    ["zh", "zh-Hans"],
    ["zh-Hans", "zh-Hans"],
    ["zh-CN", "zh-Hans"],
    ["zh-SG", "zh-Hans"]
  ])("resolves %s to %s", (preferred, expected) => {
    expect(resolveBuiltInLocale([preferred])).toBe(expected);
  });

  it.each(["zh-Hant", "zh-TW", "zh-HK", "zh-MO"])("falls %s through to English", (preferred) => {
    expect(resolveBuiltInLocale([preferred])).toBe("en");
  });

  it("tries later supported preferences before the English fallback", () => {
    expect(resolveBuiltInLocale(["de-DE", "zh-TW", "fr-FR"])).toBe("fr");
  });

  it.each([undefined, null, [], [""], ["not_a_locale"], ["de-DE"]])(
    "falls malformed, unsupported, and empty preferences back to English",
    (preferred) => {
      expect(resolveBuiltInLocale(preferred)).toBe("en");
    }
  );
});

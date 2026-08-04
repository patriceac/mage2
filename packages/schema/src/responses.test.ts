import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "./project";
import { STARTER_RESPONSE_LOCALES } from "./responses";

describe("starter response localization", () => {
  it("provides twenty genuine responses in every built-in locale", () => {
    const project = createDefaultProjectBundle("Starter response localization");
    const sourceEntries = Object.entries(project.strings.byLocale.en).filter(([textId]) =>
      textId.startsWith("text.response.starter.")
    );

    expect(sourceEntries).toHaveLength(20);
    expect(STARTER_RESPONSE_LOCALES).toEqual(["en", "fr", "es", "zh-Hans", "ja", "ko", "ar"]);

    for (const locale of STARTER_RESPONSE_LOCALES) {
      const strings = project.strings.byLocale[locale] ?? {};
      const localizedEntries = sourceEntries.map(([textId, source]) => [textId, strings[textId], source] as const);

      expect(localizedEntries.every(([, value]) => typeof value === "string" && value.trim().length > 0)).toBe(true);
      if (locale !== "en") {
        expect(localizedEntries.every(([, value, source]) => value !== source)).toBe(true);
      }
    }
  });
});

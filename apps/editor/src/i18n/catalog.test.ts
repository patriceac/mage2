import { describe, expect, it } from "vitest";
import { createEditorCatalog, EDITOR_CATALOG, EDITOR_FEATURE_CATALOGS } from "./catalog";
import { assertCompleteEditorMessages, defineEditorMessages, type EditorMessages } from "./messages";
import { createEditorTranslator } from "./translate";

const COMPLETE_MESSAGE = {
  fr: "Ouvrir",
  es: "Abrir",
  "zh-Hans": "打开",
  ja: "開く",
  ko: "열기",
  ar: "فتح"
} as const;

describe("editor feature catalogs", () => {
  it("pre-imports every disjoint feature catalog", () => {
    expect(EDITOR_FEATURE_CATALOGS.map(({ feature }) => feature)).toEqual([
      "app",
      "dialogs",
      "errors",
      "shared",
      "world",
      "scenes",
      "dialogue",
      "logic",
      "inventory",
      "localization",
      "assets",
      "player",
      "readiness",
      "playtest"
    ]);
  });

  it("builds complete locale entries from English source keys", () => {
    const messages = defineEditorMessages("test", { Open: COMPLETE_MESSAGE });
    expect(createEditorCatalog([{ feature: "test", messages }])).toEqual({
      Open: { en: "Open", ...COMPLETE_MESSAGE }
    });
  });

  it("allows identical reuse and rejects conflicting translations across feature boundaries", () => {
    const messages = defineEditorMessages("test", { Open: COMPLETE_MESSAGE });
    expect(
      createEditorCatalog([
        { feature: "app", messages },
        { feature: "dialogs", messages }
      ])
    ).toEqual({ Open: { en: "Open", ...COMPLETE_MESSAGE } });

    const conflictingMessages = defineEditorMessages("conflict", {
      Open: { ...COMPLETE_MESSAGE, fr: "Ouverture" }
    });
    expect(() =>
      createEditorCatalog([
        { feature: "app", messages },
        { feature: "dialogs", messages: conflictingMessages }
      ])
    ).toThrow(/collision.*app.*dialogs/i);
  });

  it("rejects missing, empty, and copied-source translations", () => {
    expect(() =>
      assertCompleteEditorMessages("test", { Open: { ...COMPLETE_MESSAGE, ar: "" } } as EditorMessages)
    ).toThrow(/Missing ar translation/);
    expect(() =>
      assertCompleteEditorMessages("test", { Open: { ...COMPLETE_MESSAGE, fr: "Open" } } as EditorMessages)
    ).toThrow(/must differ.*fr/i);
  });

  it("permits explicitly reviewed invariant source-equal terms", () => {
    expect(() =>
      assertCompleteEditorMessages(
        "test",
        {
          MAGE2: {
            fr: "MAGE2",
            es: "MAGE2",
            "zh-Hans": "MAGE2",
            ja: "MAGE2",
            ko: "MAGE2",
            ar: "MAGE2"
          }
        },
        { allowSourceEqual: ["MAGE2"] }
      )
    ).not.toThrow();
  });

  it("uses the reviewed French localization terminology", () => {
    const t = createEditorTranslator(EDITOR_CATALOG, "fr");
    expect(t("Strings")).toBe("Chaînes");
    expect(t("Draft strings")).toBe("Chaînes en brouillon");
    expect(t("Mark Translated")).toBe("Marquer comme traduit");
  });
});

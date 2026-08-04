import { BUILT_IN_LOCALES, type BuiltInLocale } from "@mage2/schema";

export type EditorTranslationLocale = Exclude<BuiltInLocale, "en">;
export type EditorMessageTranslations = Readonly<Record<EditorTranslationLocale, string>>;
export type EditorMessages = Readonly<Record<string, EditorMessageTranslations>>;

export interface EditorMessageDefinitionOptions {
  allowSourceEqual?: readonly string[];
}

const TRANSLATION_LOCALES = BUILT_IN_LOCALES.filter(
  (locale): locale is EditorTranslationLocale => locale !== "en"
);

export function assertCompleteEditorMessages(
  feature: string,
  messages: EditorMessages,
  options: EditorMessageDefinitionOptions = {}
): void {
  const sourceEqualAllowlist = new Set(options.allowSourceEqual ?? []);
  for (const [source, translations] of Object.entries(messages)) {
    if (source.trim() === "") {
      throw new Error(`Editor message source keys cannot be empty (${feature}).`);
    }

    for (const locale of TRANSLATION_LOCALES) {
      const translation = translations[locale];
      if (typeof translation !== "string" || translation.trim() === "") {
        throw new Error(`Missing ${locale} translation for "${source}" in ${feature}.`);
      }
      if (translation.trim() === source.trim() && !sourceEqualAllowlist.has(source)) {
        throw new Error(`Translation for "${source}" in ${feature} must differ from the English source (${locale}).`);
      }
    }
  }
}

export function defineEditorMessages<const Messages extends EditorMessages>(
  feature: string,
  messages: Messages,
  options: EditorMessageDefinitionOptions = {}
): Messages {
  assertCompleteEditorMessages(feature, messages, options);
  return messages;
}

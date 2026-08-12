import { z } from "zod";
import { StringTranslationStateSchema } from "./types";

export const TRANSLATION_INTERCHANGE_FORMAT = "mage2-translation-interchange" as const;
export const TRANSLATION_INTERCHANGE_VERSION = 1 as const;

const MAX_ENTRY_COUNT = 100_000;
const MAX_TEXT_LENGTH = 1_000_000;
const LocaleSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u, "Locale must be a BCP 47-style language tag.");

export const TranslationInterchangeValueSchema = z.object({
  value: z.string().max(MAX_TEXT_LENGTH),
  state: StringTranslationStateSchema
}).strict();

export const TranslationInterchangeEntrySchema = z.object({
  id: z.string().min(1).max(512),
  source: z.string().max(MAX_TEXT_LENGTH).nullable(),
  baseline: TranslationInterchangeValueSchema.nullable(),
  translation: TranslationInterchangeValueSchema.nullable()
}).strict();

export const TranslationInterchangeSchema = z.object({
  format: z.literal(TRANSLATION_INTERCHANGE_FORMAT),
  version: z.literal(TRANSLATION_INTERCHANGE_VERSION),
  exportedAt: z.string().min(1).max(64),
  project: z.object({
    id: z.string().min(1).max(256),
    name: z.string().min(1).max(512),
    schemaVersion: z.number().int().positive()
  }).strict(),
  sourceLocale: LocaleSchema,
  targetLocale: LocaleSchema,
  entries: z.array(TranslationInterchangeEntrySchema).max(MAX_ENTRY_COUNT)
}).strict().superRefine((interchange, context) => {
  if (interchange.sourceLocale === interchange.targetLocale) {
    context.addIssue({
      code: "custom",
      path: ["targetLocale"],
      message: "Target locale must differ from the source locale."
    });
  }

  if (Number.isNaN(Date.parse(interchange.exportedAt))) {
    context.addIssue({
      code: "custom",
      path: ["exportedAt"],
      message: "Exported timestamp must be a valid date."
    });
  }

  const seenIds = new Set<string>();
  for (let index = 0; index < interchange.entries.length; index += 1) {
    const textId = interchange.entries[index]!.id;
    if (seenIds.has(textId)) {
      context.addIssue({
        code: "custom",
        path: ["entries", index, "id"],
        message: `Duplicate text ID: ${textId}`
      });
    }
    seenIds.add(textId);
  }
});

export type TranslationInterchangeValue = z.infer<typeof TranslationInterchangeValueSchema>;
export type TranslationInterchangeEntry = z.infer<typeof TranslationInterchangeEntrySchema>;
export type TranslationInterchange = z.infer<typeof TranslationInterchangeSchema>;

export function parseTranslationInterchange(input: unknown): TranslationInterchange {
  return TranslationInterchangeSchema.parse(input);
}

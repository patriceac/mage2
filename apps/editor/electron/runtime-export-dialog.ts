import { BUILT_IN_LOCALES, type BuiltInLocale } from "@mage2/schema";
import { EDITOR_CATALOG } from "../src/i18n/catalog";
import { createEditorTranslator } from "../src/i18n/translate";
import type { RuntimeExportFormat } from "./runtime-artifact-exporter";

export interface RuntimeExportDialogCopy {
  title: string;
  buttonLabel: string;
}

export function parseRuntimeExportInterfaceLocale(input: unknown): BuiltInLocale {
  if (input === undefined) {
    return "en";
  }
  if (typeof input !== "string" || !BUILT_IN_LOCALES.some((locale) => locale === input)) {
    throw new Error("Runtime export interface locale must be a supported editor locale.");
  }
  return input as BuiltInLocale;
}

export function resolveRuntimeExportDialogCopy(
  format: RuntimeExportFormat,
  artifactName: string,
  interfaceLocale: BuiltInLocale
): RuntimeExportDialogCopy {
  const t = createEditorTranslator(EDITOR_CATALOG, interfaceLocale);
  return {
    title: t("Choose where to create {artifactName}", { artifactName }),
    buttonLabel: t(format === "windows" ? "Create Windows Folder" : "Choose Export Location")
  };
}

import type { BuiltInLocale } from "@mage2/schema";
import type { EditorCatalog } from "./catalog";

export type EditorMessageParams = Readonly<Record<string, string | number>>;
export type EditorTranslator = (source: string, params?: EditorMessageParams) => string;

export interface EditorTranslatorOptions {
  diagnoseMissing?: boolean;
  onMissing?: (source: string, locale: BuiltInLocale) => void;
}

interface CompiledEditorMessageTemplate {
  source: string;
  names: string[];
  pattern: RegExp;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileEditorMessageTemplate(source: string): CompiledEditorMessageTemplate | undefined {
  const names: string[] = [];
  let cursor = 0;
  let pattern = "^";
  for (const match of source.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) {
    pattern += escapeRegularExpression(source.slice(cursor, match.index));
    pattern += "(.+?)";
    names.push(match[1]);
    cursor = (match.index ?? 0) + match[0].length;
  }
  if (names.length === 0) {
    return undefined;
  }
  pattern += `${escapeRegularExpression(source.slice(cursor))}$`;
  return { source, names, pattern: new RegExp(pattern, "u") };
}

export function interpolateEditorMessage(message: string, params: EditorMessageParams = {}): string {
  return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder
  );
}

export function createEditorTranslator(
  catalog: EditorCatalog,
  locale: BuiltInLocale,
  options: EditorTranslatorOptions = {}
): EditorTranslator {
  const templates = Object.keys(catalog)
    .map(compileEditorMessageTemplate)
    .filter((template): template is CompiledEditorMessageTemplate => Boolean(template));

  return (source, params) => {
    let message = catalog[source]?.[locale];
    let resolvedParams = params;

    if (message === undefined && params === undefined) {
      for (const template of templates) {
        const match = template.pattern.exec(source);
        if (!match) {
          continue;
        }
        message = catalog[template.source]?.[locale];
        resolvedParams = Object.fromEntries(template.names.map((name, index) => [name, match[index + 1]]));
        break;
      }
    }

    if (message === undefined && options.diagnoseMissing) {
      (options.onMissing ?? ((missingSource, missingLocale) => {
        console.warn(`[MAGE2 i18n] Missing ${missingLocale} translation for: ${missingSource}`);
      }))(source, locale);
    }

    return interpolateEditorMessage(message ?? source, resolvedParams);
  };
}

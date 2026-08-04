import type { EditorTranslator } from "./translate";

interface NestedRuntimeMessageTemplate {
  source: string;
  nestedParameter: string;
  pattern: RegExp;
  parameterNames: readonly string[];
}

const ELECTRON_ERROR_PREFIXES = [
  /^Error invoking remote method '[^']+':\s*/u,
  /^Error invoking remote method "[^"]+":\s*/u,
  /^Error:\s*/u
] as const;

const NESTED_RUNTIME_MESSAGE_SOURCES = [
  "A pending project save could not be recovered: {message}",
  "Project files were found, but they could not be loaded: {message}",
  "Export failed while preparing the new build. The existing export was not changed. {message}",
  "Export cannot use project folder \"{projectDir}\": {message}",
  "Export stopped because the {label} changed or became unsafe: {message}",
  "Export cannot safely resolve {label} \"{path}\": {message}",
  "Export cannot inspect output folder \"{outputDirectory}\": {message}"
] as const;

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileNestedTemplate(source: string): NestedRuntimeMessageTemplate {
  const parameterNames: string[] = [];
  let cursor = 0;
  let pattern = "^";

  for (const match of source.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) {
    pattern += escapeRegularExpression(source.slice(cursor, match.index));
    pattern += "(.+?)";
    parameterNames.push(match[1]);
    cursor = (match.index ?? 0) + match[0].length;
  }

  pattern += `${escapeRegularExpression(source.slice(cursor))}$`;
  return {
    source,
    nestedParameter: "message",
    pattern: new RegExp(pattern, "u"),
    parameterNames
  };
}

const NESTED_RUNTIME_MESSAGE_TEMPLATES = NESTED_RUNTIME_MESSAGE_SOURCES.map(compileNestedTemplate);

function rawRuntimeMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}

function unwrapElectronError(message: string): string {
  let result = message.trim();
  let changed = true;

  while (changed) {
    changed = false;
    for (const prefix of ELECTRON_ERROR_PREFIXES) {
      const next = result.replace(prefix, "");
      if (next !== result) {
        result = next.trim();
        changed = true;
      }
    }
  }

  return result;
}

/**
 * Translates stable runtime/backend messages while leaving unknown text and
 * captured paths, IDs, filenames, and authored content untouched.
 */
export function translateRuntimeMessage(value: unknown, t: EditorTranslator): string {
  const message = unwrapElectronError(rawRuntimeMessage(value));

  const starterHotspotMatch = /^Starter hotspot '(.+)' still has no player-facing behavior\.$/u.exec(message);
  if (starterHotspotMatch) {
    return t("Starter hotspot '{hotspot}' still has no player-facing behavior.", {
      hotspot: starterHotspotMatch[1]
    });
  }

  for (const template of NESTED_RUNTIME_MESSAGE_TEMPLATES) {
    const match = template.pattern.exec(message);
    if (!match) {
      continue;
    }

    const params = Object.fromEntries(
      template.parameterNames.map((name, index) => [
        name,
        name === template.nestedParameter ? translateRuntimeMessage(match[index + 1], t) : match[index + 1]
      ])
    );
    return t(template.source, params);
  }

  return t(message);
}

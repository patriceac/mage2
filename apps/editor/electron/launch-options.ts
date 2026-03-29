import path from "node:path";

const VALID_EDITOR_LAUNCH_TABS = new Set([
  "world",
  "scenes",
  "assets",
  "dialogue",
  "inventory",
  "localization",
  "playtest"
]);

export interface EditorLaunchOptions {
  projectDir?: string;
  tab?: string;
}

export function resolveEditorLaunchArguments(argv: readonly string[], defaultApp: boolean): readonly string[] {
  return defaultApp ? argv.slice(2) : argv.slice(1);
}

export function parseEditorLaunchOptions(argv: readonly string[], cwd = process.cwd()): EditorLaunchOptions {
  let projectDir: string | undefined;
  let tab: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const projectValue = readLaunchOptionValue(argv, index, "--project");
    if (projectValue) {
      projectDir = path.resolve(cwd, projectValue.value);
      index = projectValue.nextIndex;
      continue;
    }

    const tabValue = readLaunchOptionValue(argv, index, "--tab");
    if (tabValue) {
      if (VALID_EDITOR_LAUNCH_TABS.has(tabValue.value)) {
        tab = tabValue.value;
      }
      index = tabValue.nextIndex;
      continue;
    }

    if (!argument.startsWith("--") && !projectDir) {
      projectDir = path.resolve(cwd, argument);
    }
  }

  return {
    ...(projectDir ? { projectDir } : {}),
    ...(tab ? { tab } : {})
  };
}

function readLaunchOptionValue(
  argv: readonly string[],
  index: number,
  optionName: string
): { value: string; nextIndex: number } | undefined {
  const argument = argv[index];
  if (!argument) {
    return undefined;
  }

  const prefixedOption = `${optionName}=`;
  if (argument.startsWith(prefixedOption)) {
    const inlineValue = argument.slice(prefixedOption.length).trim();
    return inlineValue ? { value: inlineValue, nextIndex: index } : undefined;
  }

  if (argument !== optionName) {
    return undefined;
  }

  const nextArgument = argv[index + 1]?.trim();
  if (!nextArgument || nextArgument.startsWith("--")) {
    return undefined;
  }

  return {
    value: nextArgument,
    nextIndex: index + 1
  };
}

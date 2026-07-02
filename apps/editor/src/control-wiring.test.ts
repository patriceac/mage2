import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface ButtonBlock {
  source: string;
  line: number;
}

interface ButtonExpectation {
  label: string;
  file: string;
  matcher: (block: string) => boolean;
}

const SOURCE_ROOT = path.join(process.cwd(), "apps", "editor", "src");

const enabledControlsThatMustHaveBehavior: ButtonExpectation[] = [
  {
    label: "World location settings",
    file: "panels/WorldPanel.tsx",
    matcher: (block) => block.includes('aria-label="Location settings"')
  },
  {
    label: "Inventory filter",
    file: "panels/InventoryPanel.tsx",
    matcher: (block) => block.includes("Filter items")
  },
  {
    label: "Localization text-id copy",
    file: "panels/LocalizationPanel.tsx",
    matcher: (block) => block.includes("localization-icon-button") && block.includes("Selected text id")
  },
  {
    label: "Assets usage rail pin",
    file: "panels/AssetsPanel.tsx",
    matcher: (block) => block.includes("Pin panel")
  },
  {
    label: "Assets usage rail close",
    file: "panels/AssetsPanel.tsx",
    matcher: (block) => block.includes("Close panel")
  }
];

const disabledPlaceholderControls: ButtonExpectation[] = [
  {
    label: "Assets import translations",
    file: "panels/AssetsPanel.tsx",
    matcher: (block) => block.includes("Import Translations...")
  },
  {
    label: "Assets export manifest",
    file: "panels/AssetsPanel.tsx",
    matcher: (block) => block.includes("Export Asset Manifest...")
  },
  {
    label: "Inventory delete placeholder",
    file: "panels/InventoryPanel.tsx",
    matcher: (block) => block.includes("Delete is not available while scene references may exist.")
  }
];

function readSource(relativePath: string): string {
  return readFileSync(path.join(SOURCE_ROOT, relativePath), "utf8");
}

function findButtonBlocks(source: string): ButtonBlock[] {
  return Array.from(source.matchAll(/<button\b[\s\S]*?<\/button>/g)).map((match) => ({
    source: match[0],
    line: source.slice(0, match.index).split(/\r?\n/).length
  }));
}

function findButtonBlock(expectation: ButtonExpectation): ButtonBlock | undefined {
  return findButtonBlocks(readSource(expectation.file)).find((block) => expectation.matcher(block.source));
}

function hasDisabledState(block: string): boolean {
  return /\bdisabled(?:=|\s|>|\})/.test(block);
}

function hasUserAction(block: string): boolean {
  return /\bonClick\s*=|\bonPointerDown\s*=|\bonMouseDown\s*=|\btype="submit"|\bform=/.test(block);
}

function hasWiringIssueMarker(block: string): boolean {
  return block.includes("control-wiring-issue");
}

function hasWiringWarningMarker(block: string): boolean {
  return block.includes("control-wiring-warning");
}

function extractOnClickExpression(block: string): string | undefined {
  const match = /\bonClick=\{([^}]+)\}/.exec(block);
  return match?.[1].replace(/\s+/g, " ").trim();
}

describe("editor control wiring guardrails", () => {
  it.each(enabledControlsThatMustHaveBehavior)("$label is not an enabled no-op", (expectation) => {
    const block = findButtonBlock(expectation);

    if (!block) {
      return;
    }

    expect(
      hasUserAction(block.source) || hasDisabledState(block.source) || hasWiringIssueMarker(block.source),
      `${expectation.file}:${block.line} renders ${expectation.label} as an enabled button without a user action or wiring marker`
    ).toBe(true);
  });

  it.each(disabledPlaceholderControls)("$label remains explicitly disabled until implemented", (expectation) => {
    const block = findButtonBlock(expectation);

    expect(block, `${expectation.file} should still render ${expectation.label}`).toBeDefined();
    expect(hasDisabledState(block!.source), `${expectation.file}:${block!.line} should be disabled while it is a placeholder`).toBe(true);
  });

  it("keeps Assets Open File treated as an orange duplicate warning, not a red wiring issue", () => {
    const source = readSource("panels/AssetsPanel.tsx");
    const blocks = findButtonBlocks(source);
    const openFileBlock = blocks.find((block) => block.source.includes("<span>Open File</span>"));
    const revealBlock = blocks.find((block) => block.source.includes("<span>Reveal in Folder</span>"));

    expect(openFileBlock, "Assets Open File should still render").toBeDefined();
    expect(revealBlock, "Assets Reveal in Folder should still render").toBeDefined();
    expect(hasUserAction(openFileBlock!.source), `Open File at panels/AssetsPanel.tsx:${openFileBlock!.line} should stay wired`).toBe(true);
    expect(extractOnClickExpression(openFileBlock!.source)).toBe(extractOnClickExpression(revealBlock!.source));
    expect(
      hasWiringWarningMarker(openFileBlock!.source),
      `Open File at panels/AssetsPanel.tsx:${openFileBlock!.line} duplicates Reveal in Folder and should be visually marked orange`
    ).toBe(true);
    expect(
      hasWiringIssueMarker(openFileBlock!.source),
      `Open File at panels/AssetsPanel.tsx:${openFileBlock!.line} is wired and should not be visually marked red`
    ).toBe(false);
  });
});

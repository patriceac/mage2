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

  it("keeps the Localization text-id copy button wired", () => {
    const expectation = enabledControlsThatMustHaveBehavior.find((entry) => entry.label === "Localization text-id copy");
    expect(expectation).toBeDefined();

    const block = findButtonBlock(expectation!);

    expect(block, "Localization text-id copy button should render").toBeDefined();
    expect(hasUserAction(block!.source), `Localization copy button at ${expectation!.file}:${block!.line} should stay wired`).toBe(true);
    expect(hasWiringIssueMarker(block!.source), `Localization copy button at ${expectation!.file}:${block!.line} should not be marked red`).toBe(
      false
    );
    expect(block!.source).toContain("onCopyTextId(entry.textId)");
    expect(block!.source).toContain("localization-icon-button--${copyFeedback}");
    expect(block!.source).toContain('copyFeedback === "copied"');
    expect(block!.source).toContain('copyFeedback === "failed"');
    expect(block!.source).not.toContain("not wired");
  });

  it.each(disabledPlaceholderControls)("$label remains explicitly disabled until implemented", (expectation) => {
    const block = findButtonBlock(expectation);

    expect(block, `${expectation.file} should still render ${expectation.label}`).toBeDefined();
    expect(hasDisabledState(block!.source), `${expectation.file}:${block!.line} should be disabled while it is a placeholder`).toBe(true);
  });

  it("keeps the Assets inspector free of the duplicate Open File action", () => {
    const source = readSource("panels/AssetsPanel.tsx");
    const blocks = findButtonBlocks(source);
    const openFileBlock = blocks.find((block) => block.source.includes("<span>Open File</span>"));
    const revealBlock = blocks.find((block) => block.source.includes("<span>Reveal in Folder</span>"));

    expect(openFileBlock, "Assets Open File should not render as a duplicate of Reveal in Folder").toBeUndefined();
    expect(revealBlock, "Assets Reveal in Folder should still render").toBeDefined();
    expect(hasUserAction(revealBlock!.source), `Reveal in Folder at panels/AssetsPanel.tsx:${revealBlock!.line} should stay wired`).toBe(true);
    expect(hasWiringIssueMarker(revealBlock!.source), `Reveal in Folder at panels/AssetsPanel.tsx:${revealBlock!.line} should not be marked red`).toBe(false);
  });

  it("keeps the Inventory browser free of the unused filter placeholder", () => {
    const source = readSource("panels/InventoryPanel.tsx");

    expect(source).not.toContain("Filter items");
    expect(source).not.toContain('kind="filter"');
  });
});

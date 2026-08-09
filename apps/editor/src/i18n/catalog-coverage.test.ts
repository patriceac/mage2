import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { EDITOR_CATALOG } from "./catalog";

describe("editor catalog coverage", () => {
  it("contains every literal message passed to the editor translator", () => {
    const sourceRoot = path.resolve(import.meta.dirname, "..");
    const usedMessages = new Set<string>();

    for (const filePath of listSourceFiles(sourceRoot)) {
      const source = fs.readFileSync(filePath, "utf8");
      const sourceFile = ts.createSourceFile(
        filePath,
        source,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node)
          && ts.isIdentifier(node.expression)
          && node.expression.text === "t"
          && node.arguments[0]
          && ts.isStringLiteralLike(node.arguments[0])
        ) {
          usedMessages.add(node.arguments[0].text);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    const missing = [...usedMessages].filter((message) => !EDITOR_CATALOG[message]).sort();
    expect(missing).toEqual([]);
  });
});

function listSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "i18n" ? [] : listSourceFiles(target);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\.[^.]+$/.test(entry.name)
      ? [target]
      : [];
  });
}

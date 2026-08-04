import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(workspaceRoot, "apps", "editor", "src");
const strict = process.argv.includes("--strict");
const translatableAttributes = new Set(["alt", "aria-label", "aria-description", "placeholder", "title"]);
const translatableProperties = new Set([
  "body",
  "cancelLabel",
  "confirmLabel",
  "description",
  "emptyBody",
  "emptyTitle",
  "help",
  "hint",
  "label",
  "message",
  "placeholder",
  "summary",
  "title",
  "tooltip"
]);
const messageCalls = new Set(["setBusyLabel", "setErrorMessage", "setStatusMessage", "withBusy"]);

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "i18n" ? [] : listSourceFiles(target);
    }
    if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.(?:test|spec)\.[^.]+$/.test(entry.name)) {
      return [];
    }
    return [target];
  });
}

function hasLetters(value) {
  return /\p{L}/u.test(value) && !/^[A-Za-z0-9_.:/\\-]+$/.test(value.trim());
}

function propertyName(node) {
  return node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : undefined;
}

function callName(node) {
  if (!ts.isCallExpression(node)) return undefined;
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return undefined;
}

function isTranslated(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isCallExpression(current) && callName(current) === "t" && current.arguments.includes(node)) return true;
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isSourceFile(current)) break;
  }
  return false;
}

function sourceLiteral(node) {
  return ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;
}

const violations = [];
for (const filePath of listSourceFiles(sourceRoot)) {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const ignoredLines = new Set(
    source.split(/\r?\n/).flatMap((line, index) => line.includes("i18n-ignore-next-line") ? [index + 2] : [])
  );

  const report = (node, reason, value) => {
    if (!value || !hasLetters(value) || isTranslated(node)) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    if (ignoredLines.has(line + 1)) return;
    violations.push({
      file: path.relative(workspaceRoot, filePath).replaceAll("\\", "/"),
      line: line + 1,
      reason,
      text: value.replace(/\s+/g, " ").trim().slice(0, 160)
    });
  };

  const reportLiterals = (node, reason) => {
    const visitLiteral = (child) => {
      const value = sourceLiteral(child);
      if (value !== undefined) report(child, reason, value);
      if (!ts.isCallExpression(child) || callName(child) !== "t") ts.forEachChild(child, visitLiteral);
    };
    visitLiteral(node);
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) report(node, "JSX text", node.getText(sourceFile));

    if (ts.isJsxAttribute(node) && translatableAttributes.has(node.name.text)) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) report(node.initializer, `${node.name.text} attribute`, node.initializer.text);
      if (node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        reportLiterals(node.initializer.expression, `${node.name.text} expression`);
      }
    }

    if (ts.isPropertyAssignment(node) && translatableProperties.has(propertyName(node.name))) {
      reportLiterals(node.initializer, `${propertyName(node.name)} property`);
    }

    if (ts.isCallExpression(node)) {
      const name = callName(node);
      if (name && messageCalls.has(name) && node.arguments[0]) reportLiterals(node.arguments[0], `${name} call`);
      if (name === "useState" && node.arguments[0]) reportLiterals(node.arguments[0], "visible state initializer");
    }

    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Error" && node.arguments?.[0]) {
      reportLiterals(node.arguments[0], "error message");
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

const unique = [...new Map(violations.map((entry) => [`${entry.file}:${entry.line}:${entry.reason}:${entry.text}`, entry])).values()];
if (unique.length > 0) {
  for (const entry of unique) {
    console.log(`${entry.file}:${entry.line} [${entry.reason}] ${entry.text}`);
  }
  console.log(`Editor localization audit found ${unique.length} possible hard-coded user-facing strings.`);
  if (strict) process.exitCode = 1;
} else {
  console.log("Editor localization audit passed.");
}

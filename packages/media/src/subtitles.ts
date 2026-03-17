import { readFile } from "node:fs/promises";
import path from "node:path";

export interface ParsedSubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface ParsedSubtitleFile {
  filePath: string;
  fileName: string;
  cues: ParsedSubtitleCue[];
}

export interface ParseSubtitleFilesResult {
  parsedFiles: ParsedSubtitleFile[];
  failedFiles: Array<{
    filePath: string;
    reason: string;
  }>;
}

const TIMING_PATTERN =
  /^\s*((?:\d{1,2}:)?\d{2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}(?:[.,]\d{1,3})?)(?:\s+.*)?$/;

export async function parseSubtitleFiles(filePaths: string[]): Promise<ParseSubtitleFilesResult> {
  const parsedFiles: ParsedSubtitleFile[] = [];
  const failedFiles: ParseSubtitleFilesResult["failedFiles"] = [];

  for (const filePath of filePaths) {
    try {
      const source = await readFile(filePath, "utf8");
      const cues = parseSubtitleText(source);
      if (cues.length === 0) {
        failedFiles.push({
          filePath,
          reason: "No valid subtitle cues were found in this file."
        });
        continue;
      }

      parsedFiles.push({
        filePath,
        fileName: path.basename(filePath),
        cues
      });
    } catch (error) {
      failedFiles.push({
        filePath,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    parsedFiles,
    failedFiles
  };
}

export function parseSubtitleText(source: string): ParsedSubtitleCue[] {
  const normalizedSource = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = normalizedSource
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const cues: ParsedSubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length === 0) {
      continue;
    }

    const blockHeader = lines[0]?.trim() ?? "";
    if (
      /^WEBVTT(?:\s|$)/i.test(blockHeader) ||
      /^NOTE(?:\s|$)/i.test(blockHeader) ||
      /^STYLE(?:\s|$)/i.test(blockHeader) ||
      /^REGION(?:\s|$)/i.test(blockHeader)
    ) {
      continue;
    }

    const timingIndex = lines.findIndex((line) => TIMING_PATTERN.test(line.trim()));
    if (timingIndex < 0) {
      continue;
    }

    const timingMatch = lines[timingIndex]?.trim().match(TIMING_PATTERN);
    if (!timingMatch) {
      continue;
    }

    const startMs = parseSubtitleTimestamp(timingMatch[1]);
    const endMs = parseSubtitleTimestamp(timingMatch[2]);
    if (startMs === undefined || endMs === undefined) {
      continue;
    }

    const text = lines
      .slice(timingIndex + 1)
      .join("\n")
      .trimEnd();
    if (text.length === 0) {
      continue;
    }

    cues.push({
      startMs,
      endMs,
      text
    });
  }

  return cues;
}

function parseSubtitleTimestamp(input: string): number | undefined {
  const normalized = input.trim().replace(",", ".");
  const parts = normalized.split(":");
  if (parts.length < 2 || parts.length > 3) {
    return undefined;
  }

  const secondsPart = parts.at(-1);
  if (!secondsPart) {
    return undefined;
  }

  const [wholeSecondsText, fractionalSecondsText = "0"] = secondsPart.split(".");
  const wholeSeconds = Number(wholeSecondsText);
  const fractionalSeconds = Number(fractionalSecondsText.padEnd(3, "0").slice(0, 3));
  const minutes = Number(parts[parts.length - 2]);
  const hours = parts.length === 3 ? Number(parts[0]) : 0;

  if ([hours, minutes, wholeSeconds, fractionalSeconds].some((value) => Number.isNaN(value))) {
    return undefined;
  }

  return (((hours * 60) + minutes) * 60 + wholeSeconds) * 1000 + fractionalSeconds;
}

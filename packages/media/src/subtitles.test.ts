import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSubtitleFiles, parseSubtitleText } from "./subtitles";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directoryPath) => rm(directoryPath, { recursive: true, force: true })));
});

describe("parseSubtitleText", () => {
  it("parses SRT cues and preserves internal line breaks", () => {
    const cues = parseSubtitleText(`1
00:00:00,000 --> 00:00:01,500
Hello there
General Kenobi

2
00:00:02,000 --> 00:00:03,000
Second cue
`);

    expect(cues).toEqual([
      {
        startMs: 0,
        endMs: 1500,
        text: "Hello there\nGeneral Kenobi"
      },
      {
        startMs: 2000,
        endMs: 3000,
        text: "Second cue"
      }
    ]);
  });

  it("parses VTT cues while ignoring headers, notes, styles, regions, cue settings, and malformed blocks", () => {
    const cues = parseSubtitleText(`WEBVTT

NOTE this block should be ignored
Some more notes

STYLE
::cue { color: yellow; }

REGION
id:top

intro
00:00:00.000 --> 00:00:01.000 line:90% position:10%
First line

malformed cue
not a timestamp
Should be skipped

00:00:01.200 --> 00:00:02.500 align:start
Second line
Still second
`);

    expect(cues).toEqual([
      {
        startMs: 0,
        endMs: 1000,
        text: "First line"
      },
      {
        startMs: 1200,
        endMs: 2500,
        text: "Second line\nStill second"
      }
    ]);
  });
});

describe("parseSubtitleFiles", () => {
  it("reports per-file failures only when a file produces no valid cues", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "mage2-subtitles-"));
    tempDirectories.push(tempDir);

    const validFile = path.join(tempDir, "valid.vtt");
    const invalidFile = path.join(tempDir, "invalid.srt");

    await writeFile(
      validFile,
      `WEBVTT

00:00:00.000 --> 00:00:01.000
Hello
`,
      "utf8"
    );
    await writeFile(
      invalidFile,
      `1
not a timing line
No cues here
`,
      "utf8"
    );

    const result = await parseSubtitleFiles([validFile, invalidFile]);

    expect(result.parsedFiles).toEqual([
      {
        filePath: validFile,
        fileName: "valid.vtt",
        cues: [
          {
            startMs: 0,
            endMs: 1000,
            text: "Hello"
          }
        ]
      }
    ]);
    expect(result.failedFiles).toEqual([
      {
        filePath: invalidFile,
        reason: "No valid subtitle cues were found in this file."
      }
    ]);
  });
});

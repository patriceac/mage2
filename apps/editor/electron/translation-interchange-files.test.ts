import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readTranslationInterchangeFile,
  writeTranslationInterchangeFile
} from "./translation-interchange-files";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mage2-translation-interchange-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("translation interchange files", () => {
  it("writes a new file without overwriting an existing handoff", async () => {
    const directory = await createTemporaryDirectory();
    const first = await writeTranslationInterchangeFile(
      directory,
      "project.fr.mage2-translation.json",
      "{\"first\":true}\n"
    );
    const second = await writeTranslationInterchangeFile(
      directory,
      "project.fr.mage2-translation.json",
      "{\"second\":true}\n"
    );

    expect(first.fileName).toBe("project.fr.mage2-translation.json");
    expect(second.fileName).toBe("project.fr (2).mage2-translation.json");
    expect(await readFile(first.path, "utf8")).toBe("{\"first\":true}\n");
    expect(await readFile(second.path, "utf8")).toBe("{\"second\":true}\n");
  });

  it("reads UTF-8 with an optional BOM and rejects unsafe filenames or invalid encoding", async () => {
    const directory = await createTemporaryDirectory();
    const validPath = path.join(directory, "valid.mage2-translation.json");
    await writeFile(validPath, `\uFEFF${JSON.stringify({ value: "Chaîne" })}`, "utf8");
    expect(await readTranslationInterchangeFile(validPath)).toBe(JSON.stringify({ value: "Chaîne" }));

    await expect(
      writeTranslationInterchangeFile(directory, "..\\outside.mage2-translation.json", "{}")
    ).rejects.toThrow(/filename/u);

    const invalidPath = path.join(directory, "invalid.mage2-translation.json");
    await writeFile(invalidPath, Buffer.from([0xc3, 0x28]));
    await expect(readTranslationInterchangeFile(invalidPath)).rejects.toThrow(/UTF-8/u);
  });
});

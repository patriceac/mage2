import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateReleaseChecksums } from "./release-checksums.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("release checksums", () => {
  it("covers the installer, block map, and canonical unpacked executable only", async () => {
    const distDirectory = await mkdtemp(path.join(os.tmpdir(), "mage2-release-checksums-"));
    temporaryDirectories.push(distDirectory);
    const unpackedDirectory = path.join(distDirectory, "win-unpacked");
    await mkdir(unpackedDirectory);

    const artifacts = new Map([
      ["MAGE2-Editor-1.2.3-x64.exe", "installer"],
      ["MAGE2-Editor-1.2.3-x64.exe.blockmap", "blockmap"],
      ["win-unpacked/MAGE2 Editor.exe", "canonical-executable"]
    ]);
    for (const [relativePath, contents] of artifacts) {
      await writeFile(path.join(distDirectory, ...relativePath.split("/")), contents);
    }
    await writeFile(path.join(distDirectory, "builder-debug.yml"), "not a release artifact");

    const report = await generateReleaseChecksums({
      distDirectory,
      executableName: "MAGE2 Editor"
    });
    const checksumText = await readFile(report.outputPath, "utf8");

    for (const [relativePath, contents] of artifacts) {
      const expectedDigest = createHash("sha256").update(contents).digest("hex");
      expect(checksumText).toContain(`${expectedDigest} *${relativePath}`);
    }
    expect(checksumText).not.toContain("builder-debug.yml");
    expect(checksumText.trim().split("\n")).toHaveLength(3);
  });
});

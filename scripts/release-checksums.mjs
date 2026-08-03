import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import editorAppMetadata from "../apps/editor/app-metadata.json" with { type: "json" };

export const RELEASE_CHECKSUM_FILENAME = "SHA256SUMS.txt";

export async function generateReleaseChecksums({
  distDirectory,
  executableName = editorAppMetadata.executableName
}) {
  const targets = await collectReleaseChecksumTargets(distDirectory, executableName);
  if (targets.length === 0) {
    throw new Error(`No Windows release artifacts were found in ${distDirectory}.`);
  }

  const lines = [];
  for (const filePath of targets) {
    const digest = await sha256File(filePath);
    const relativePath = path.relative(distDirectory, filePath).replaceAll(path.sep, "/");
    lines.push(`${digest} *${relativePath}`);
  }

  const outputPath = path.join(distDirectory, RELEASE_CHECKSUM_FILENAME);
  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  return { outputPath, targets };
}

export async function collectReleaseChecksumTargets(distDirectory, executableName) {
  const entries = await readdir(distDirectory, { withFileTypes: true });
  const targets = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name !== RELEASE_CHECKSUM_FILENAME &&
        (entry.name.toLocaleLowerCase("en-US").endsWith(".exe") ||
          entry.name.toLocaleLowerCase("en-US").endsWith(".blockmap"))
    )
    .map((entry) => path.join(distDirectory, entry.name));

  const canonicalExePath = path.join(distDirectory, "win-unpacked", `${executableName}.exe`);
  try {
    const unpackedEntries = await readdir(path.dirname(canonicalExePath), { withFileTypes: true });
    if (unpackedEntries.some((entry) => entry.isFile() && entry.name === path.basename(canonicalExePath))) {
      targets.push(canonicalExePath);
    }
  } catch {
    // A directory-only or installer-only build can still produce valid release checksums.
  }

  return targets.sort((left, right) => left.localeCompare(right));
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("data", (chunk) => hash.update(chunk));
    input.once("error", reject);
    input.once("end", () => resolve(hash.digest("hex")));
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath && invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  const distDirectory = path.resolve(
    process.argv[2] ?? path.join("output", "packaging", "editor-win", "dist")
  );
  const report = await generateReleaseChecksums({ distDirectory });
  console.log(`Wrote ${report.outputPath} for ${report.targets.length} artifact(s).`);
}

import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const TRANSLATION_INTERCHANGE_FILE_EXTENSION = ".mage2-translation.json";
export const MAX_TRANSLATION_INTERCHANGE_FILE_BYTES = 8 * 1024 * 1024;

export interface WrittenTranslationInterchangeFile {
  path: string;
  fileName: string;
}

export async function writeTranslationInterchangeFile(
  directoryPath: string,
  requestedFileName: string,
  content: string
): Promise<WrittenTranslationInterchangeFile> {
  const fileName = validateTranslationInterchangeFileName(requestedFileName);
  const contentBytes = Buffer.byteLength(content, "utf8");
  if (contentBytes > MAX_TRANSLATION_INTERCHANGE_FILE_BYTES) {
    throw new Error("Translation interchange file exceeds the 8 MiB size limit.");
  }

  const directory = path.resolve(directoryPath);
  const directoryStats = await lstat(directory);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error("Translation interchange destination must be a regular directory.");
  }

  const baseName = fileName.slice(0, -TRANSLATION_INTERCHANGE_FILE_EXTENSION.length);
  for (let attempt = 1; attempt <= 1_000; attempt += 1) {
    const candidateFileName = attempt === 1
      ? fileName
      : `${baseName} (${attempt})${TRANSLATION_INTERCHANGE_FILE_EXTENSION}`;
    const candidatePath = path.join(directory, candidateFileName);
    try {
      await writeFile(candidatePath, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
      return { path: candidatePath, fileName: candidateFileName };
    } catch (error) {
      if (isFilesystemError(error, "EEXIST")) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Could not choose an unused translation interchange filename.");
}

export async function readTranslationInterchangeFile(filePath: string): Promise<string> {
  const resolvedPath = path.resolve(filePath);
  const entry = await lstat(resolvedPath);
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new Error("Translation interchange import must be a regular file.");
  }
  if (entry.size > MAX_TRANSLATION_INTERCHANGE_FILE_BYTES) {
    throw new Error("Translation interchange file exceeds the 8 MiB size limit.");
  }

  const content = await readFile(resolvedPath);
  if (content.byteLength > MAX_TRANSLATION_INTERCHANGE_FILE_BYTES) {
    throw new Error("Translation interchange file exceeds the 8 MiB size limit.");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content).replace(/^\uFEFF/u, "");
  } catch (error) {
    throw new Error("Translation interchange file must use valid UTF-8 text.", { cause: error });
  }
}

function validateTranslationInterchangeFileName(fileName: string): string {
  if (
    typeof fileName !== "string"
    || fileName.length === 0
    || fileName.length > 180
    || path.basename(fileName) !== fileName
    || !fileName.toLocaleLowerCase("en-US").endsWith(TRANSLATION_INTERCHANGE_FILE_EXTENSION)
  ) {
    throw new Error(`Translation interchange filename must end in ${TRANSLATION_INTERCHANGE_FILE_EXTENSION}.`);
  }
  return fileName;
}

function isFilesystemError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

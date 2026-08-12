import { createHash, randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { app } from "electron";
import {
  analyzeProjectAssetReachability,
  assessProjectReadiness,
  normalizeSupportedLocales,
  parseBuildManifest,
  toExportProjectData,
  type BuildManifest,
  type ExportMediaReport,
  type ProjectReadinessReport,
  type ProjectBundle,
  type RuntimeExportReport,
  type ValidationReport
} from "@mage2/schema";
import {
  filesystemObjectIdentityChangedFields,
  filesystemObjectIdentityFromStats
} from "./filesystem-identity";

const EXPORT_MARKER_FILE = ".mage2-export.json";
const EXPORT_MARKER_FORMAT = "mage2-runtime-export";
const EXPORT_MARKER_VERSION = 2;
const EXPORT_REPORT_FILE = "export-report.json";
const RESERVED_OUTPUT_DIRECTORY = "build";
const RESERVED_RUNTIME_NAMES = new Set([
  EXPORT_MARKER_FILE,
  "build-manifest.json",
  "content",
  EXPORT_REPORT_FILE,
  "media",
  "validation-report.json"
]);

interface ExportFileRecord {
  path: string;
  sha256: string;
  size: number;
}

interface ExportOwnershipMarker {
  format: typeof EXPORT_MARKER_FORMAT;
  version: typeof EXPORT_MARKER_VERSION;
  projectId: string;
  exportId: string;
  files: ExportFileRecord[];
}

interface DirectoryIdentity {
  path: string;
  canonicalPath: string;
  dev: string;
  ino: string;
  birthtime: string;
}

type DestinationSnapshot =
  | { kind: "missing" }
  | { kind: "empty"; identity: DirectoryIdentity }
  | { kind: "owned"; identity: DirectoryIdentity; fingerprint: string };

export interface ExportResult {
  outputDirectory: string;
  buildManifest: BuildManifest;
  exportReport: RuntimeExportReport;
  validationReport: ExportValidationReport;
}

export type ProjectExportMode = "preview" | "release";

export interface ExportValidationReport extends ValidationReport {
  mode: ProjectExportMode;
  readiness: ProjectReadinessReport;
}

export type ExportProjectBundleProgressStage = "preparing" | "building" | "publishing" | "complete";

export interface ExportProjectBundleProgress {
  stage: ExportProjectBundleProgressStage;
  progress: number;
}

export interface ExportProjectBundleOptions {
  /**
   * An exact export directory selected by the trusted main process. Its parent
   * must already exist. When omitted, the legacy project-local `build` folder
   * remains the destination.
  */
  outputDirectory?: string;
  /** Preview builds require project health only; release builds also enforce readiness blockers. */
  mode?: ProjectExportMode;
  /** Receives best-effort phase updates. Listener errors never interrupt a safe export. */
  onProgress?: (progress: ExportProjectBundleProgress) => void;
}

export async function exportProjectBundle(
  projectDir: string,
  project: ProjectBundle,
  options: ExportProjectBundleOptions = {}
): Promise<ExportResult> {
  const mode = options.mode ?? "release";
  const readiness = assessProjectReadiness(project);
  const gateReport = mode === "preview"
    ? readiness.health
    : { valid: readiness.ready, issues: readiness.issues };
  const validationReport: ExportValidationReport = {
    ...gateReport,
    mode,
    readiness
  };
  assertProjectCanBeExported(validationReport, mode);
  emitExportProjectBundleProgress(options.onProgress, { stage: "preparing", progress: 0 });

  const { projectIdentity, outputParentIdentity, outputDirectory } = await resolveSafeOutputDirectory(
    projectDir,
    project.manifest.buildSettings.outputDir,
    options.outputDirectory
  );
  const initialDestination = await inspectDestination(outputDirectory, project.manifest.projectId);

  // Development builds can be expensive, so reject an unsafe destination before
  // compiling the runtime. Neither operation mutates the selected output folder.
  const runtimeDist = await resolveRuntimeWebDist();
  await assertDirectoryIdentity(projectIdentity, "project folder");

  const stagingIdentity = await createSiblingStagingDirectory(outputParentIdentity, projectIdentity);
  let stagingPromoted = false;
  emitExportProjectBundleProgress(options.onProgress, { stage: "building", progress: 0.05 });

  try {
    let buildResult: Awaited<ReturnType<typeof buildExportInDirectory>>;
    try {
      buildResult = await buildExportInDirectory(
        stagingIdentity,
        projectIdentity,
        runtimeDist,
        project,
        validationReport,
        (progress) => {
          emitExportProjectBundleProgress(options.onProgress, {
            stage: "building",
            progress: 0.05 + progress * 0.85
          });
        }
      );
    } catch (error) {
      throw new Error(
        `Export failed while preparing the new build. The existing export was not changed. ${errorMessage(error)}`,
        { cause: error }
      );
    }

    // Re-check after the potentially long runtime build. This catches path swaps
    // and concurrent exports before either can replace an existing destination.
    await assertDirectoryIdentity(projectIdentity, "project folder");
    await assertDirectoryIdentity(outputParentIdentity, "export destination parent folder");
    await assertDirectoryIdentity(stagingIdentity, "export staging folder");
    const currentDestination = await inspectDestination(outputDirectory, project.manifest.projectId);
    if (!sameDestinationSnapshot(initialDestination, currentDestination)) {
      throw new Error(
        `Export stopped because the output folder changed while the build was being prepared: "${outputDirectory}". ` +
          "No existing files were replaced."
      );
    }

    emitExportProjectBundleProgress(options.onProgress, { stage: "publishing", progress: 0.96 });
    await promoteStagedExport(
      stagingIdentity,
      outputDirectory,
      currentDestination,
      outputParentIdentity,
      projectIdentity
    );
    stagingPromoted = true;
    emitExportProjectBundleProgress(options.onProgress, { stage: "complete", progress: 1 });

    return {
      outputDirectory,
      buildManifest: buildResult.buildManifest,
      exportReport: buildResult.exportReport,
      validationReport
    };
  } finally {
    if (!stagingPromoted) {
      await removeCreatedDirectoryBestEffort(stagingIdentity, outputParentIdentity, projectIdentity);
    }
  }
}

function emitExportProjectBundleProgress(
  handler: ExportProjectBundleOptions["onProgress"],
  progress: ExportProjectBundleProgress
): void {
  if (!handler) {
    return;
  }
  try {
    handler(progress);
  } catch (error) {
    console.warn("MAGE2 web export progress listener failed:", error);
  }
}

function assertProjectCanBeExported(
  validationReport: ExportValidationReport,
  mode: ProjectExportMode
): void {
  const errors = validationReport.issues.filter((issue) => issue.level === "error");
  if (errors.length === 0) {
    return;
  }

  const preview = errors
    .slice(0, 3)
    .map((issue) => `[${issue.code}] ${issue.message}`)
    .join(" ");
  const remaining = errors.length > 3 ? ` ${errors.length - 3} more error(s) were found.` : "";
  const exportLabel = mode === "preview" ? "Preview export" : "Release build";
  const issueLabel = mode === "preview" ? "project health error" : "project health or readiness blocker";
  throw new Error(
    `${exportLabel} blocked by ${errors.length} ${issueLabel}(s). Fix the blockers before exporting. ${preview}${remaining}`
  );
}

async function resolveSafeOutputDirectory(
  projectDir: string,
  configuredOutputDirectory: string,
  selectedOutputDirectory?: string
): Promise<{
  projectIdentity: DirectoryIdentity;
  outputParentIdentity: DirectoryIdentity;
  outputDirectory: string;
}> {
  const absoluteProjectDirectory = path.resolve(projectDir);
  let projectIdentity: DirectoryIdentity;

  try {
    projectIdentity = await captureDirectoryIdentity(absoluteProjectDirectory);
  } catch (error) {
    throw new Error(
      `Export cannot use project folder "${absoluteProjectDirectory}": ${errorMessage(error)}`,
      { cause: error }
    );
  }

  if (selectedOutputDirectory !== undefined) {
    const outputDirectory = path.resolve(selectedOutputDirectory);
    const outputParentIdentity = await captureDirectoryIdentity(path.dirname(outputDirectory));
    if (path.basename(outputDirectory) === "." || path.basename(outputDirectory) === "..") {
      throw new Error(`Export output folder must name a child of the selected destination: "${outputDirectory}".`);
    }
    await assertProspectiveChildPath(outputParentIdentity, outputDirectory, "export output folder");
    return { projectIdentity, outputParentIdentity, outputDirectory };
  }

  const relativeSegments = parseCanonicalRelativeOutputPath(configuredOutputDirectory);
  if (relativeSegments.length !== 1 || relativeSegments[0].toLocaleLowerCase("en-US") !== RESERVED_OUTPUT_DIRECTORY) {
    throw new Error(
      `Export output folder must be the reserved "${RESERVED_OUTPUT_DIRECTORY}" folder. ` +
        `Custom project paths are refused so an export can never replace arbitrary project content: "${configuredOutputDirectory}".`
    );
  }
  const outputDirectory = path.join(projectIdentity.canonicalPath, RESERVED_OUTPUT_DIRECTORY);
  await assertProspectiveChildPath(projectIdentity, outputDirectory, "export output folder");
  return { projectIdentity, outputParentIdentity: projectIdentity, outputDirectory };
}

function parseCanonicalRelativeOutputPath(configuredOutputDirectory: string): string[] {
  if (configuredOutputDirectory.length === 0 || configuredOutputDirectory.trim().length === 0) {
    throw new Error("Export output folder must be a non-empty relative path inside the project folder.");
  }

  if (
    path.isAbsolute(configuredOutputDirectory) ||
    path.posix.isAbsolute(configuredOutputDirectory.replace(/\\/g, "/")) ||
    path.win32.isAbsolute(configuredOutputDirectory) ||
    /^[a-zA-Z]:/.test(configuredOutputDirectory)
  ) {
    throw new Error(
      `Export output folder must be relative to the project folder; absolute, drive-rooted, and UNC paths are not allowed: "${configuredOutputDirectory}".`
    );
  }

  const segments = configuredOutputDirectory.split(/[\\/]/);
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error(
      `Export output folder must be a canonical descendant path without '.', '..', repeated separators, or a trailing separator: "${configuredOutputDirectory}".`
    );
  }

  if (segments.some((segment) => segment.endsWith(".") || segment.endsWith(" "))) {
    throw new Error(
      `Export output folder contains a non-canonical path segment ending in a dot or space: "${configuredOutputDirectory}".`
    );
  }

  return segments;
}

async function captureDirectoryIdentity(directoryPath: string): Promise<DirectoryIdentity> {
  const resolvedPath = path.resolve(directoryPath);
  const directoryStats = await lstat(resolvedPath, { bigint: true });
  if (directoryStats.isSymbolicLink() || !directoryStats.isDirectory()) {
    throw new Error(`path is not a normal directory: "${resolvedPath}"`);
  }
  const objectIdentity = filesystemObjectIdentityFromStats(directoryStats, "export directory");

  return {
    path: resolvedPath,
    canonicalPath: await realpath(resolvedPath),
    ...objectIdentity
  };
}

async function assertDirectoryIdentity(identity: DirectoryIdentity, label: string): Promise<void> {
  let currentIdentity: DirectoryIdentity;
  try {
    currentIdentity = await captureDirectoryIdentity(identity.path);
  } catch (error) {
    throw new Error(`Export stopped because the ${label} changed or became unsafe: ${errorMessage(error)}`, {
      cause: error
    });
  }

  if (!sameDirectoryIdentity(identity, currentIdentity)) {
    const changedFields = [
      normalizeIdentityPath(identity.canonicalPath) !== normalizeIdentityPath(currentIdentity.canonicalPath) && "path",
      ...filesystemObjectIdentityChangedFields(identity, currentIdentity)
    ].filter((field): field is string => Boolean(field));
    throw new Error(
      `Export stopped because the ${label} identity changed during the operation (${changedFields.join(", ")}).`
    );
  }
}

function sameDirectoryIdentity(left: DirectoryIdentity, right: DirectoryIdentity): boolean {
  return (
    normalizeIdentityPath(left.canonicalPath) === normalizeIdentityPath(right.canonicalPath) &&
    filesystemObjectIdentityChangedFields(left, right).length === 0
  );
}

function normalizeIdentityPath(inputPath: string): string {
  const normalized = path.normalize(inputPath);
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

async function assertProspectiveChildPath(
  parentIdentity: DirectoryIdentity,
  candidatePath: string,
  label: string
): Promise<void> {
  await assertDirectoryIdentity(parentIdentity, "parent folder");
  let canonicalCandidate: string;
  try {
    canonicalCandidate = await resolveProspectiveCanonicalPath(candidatePath);
  } catch (error) {
    throw new Error(`Export cannot safely resolve ${label} "${candidatePath}": ${errorMessage(error)}`, {
      cause: error
    });
  }

  if (!isStrictDescendant(parentIdentity.canonicalPath, canonicalCandidate)) {
    throw new Error(`${label} escapes its verified parent through a symbolic link or junction: "${candidatePath}".`);
  }
}

async function resolveProspectiveCanonicalPath(inputPath: string): Promise<string> {
  let currentPath = inputPath;
  const missingSegments: string[] = [];

  while (true) {
    try {
      const currentStats = await stat(currentPath);
      if (missingSegments.length > 0 && !currentStats.isDirectory()) {
        throw new Error(`path ancestor "${currentPath}" is not a directory`);
      }

      const canonicalAncestor = await realpath(currentPath);
      return path.resolve(canonicalAncestor, ...missingSegments);
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        throw error;
      }

      missingSegments.unshift(path.basename(currentPath));
      currentPath = parentPath;
    }
  }
}

function isStrictDescendant(parentDirectory: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentDirectory, candidatePath);
  return (
    relativePath.length > 0 &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

async function inspectDestination(outputDirectory: string, projectId: string): Promise<DestinationSnapshot> {
  let identity: DirectoryIdentity;
  try {
    identity = await captureDirectoryIdentity(outputDirectory);
  } catch (error) {
    if (isMissingPathError(error)) {
      return { kind: "missing" };
    }
    throw new Error(`Export cannot inspect output folder "${outputDirectory}": ${errorMessage(error)}`, {
      cause: error
    });
  }

  const entries = await readdir(outputDirectory);
  if (entries.length === 0) {
    return { kind: "empty", identity };
  }

  try {
    const markerPath = path.join(outputDirectory, EXPORT_MARKER_FILE);
    const markerText = await readVerifiedRegularFile(markerPath, 5 * 1024 * 1024);
    const marker = parseOwnershipMarker(JSON.parse(markerText));
    if (marker.projectId !== projectId) {
      throw new Error("the ownership marker belongs to a different project");
    }

    const actualFiles = await collectExportFileInventory(identity, new Set([EXPORT_MARKER_FILE]));
    assertExactFileInventory(marker.files, actualFiles);

    const manifestRecord = actualFiles.find((record) => record.path === "build-manifest.json");
    if (!manifestRecord) {
      throw new Error("the build manifest is missing");
    }
    const manifest = parseBuildManifest(
      JSON.parse(await readVerifiedRegularFile(path.join(outputDirectory, manifestRecord.path), 5 * 1024 * 1024))
    );
    if (manifest.projectId !== projectId) {
      throw new Error("the build manifest belongs to a different project");
    }
    if (manifest.contentPath !== "content/project-content.json") {
      throw new Error("the build manifest has an unexpected content path");
    }
    if (manifest.validationReportPath !== "validation-report.json") {
      throw new Error("the build manifest has an unexpected validation report path");
    }

    const fingerprint = createHash("sha256")
      .update(markerText)
      .digest("hex");
    return { kind: "owned", identity, fingerprint };
  } catch (error) {
    throw new Error(
      `Export refused: output folder "${outputDirectory}" is not empty and is not a verified prior MAGE2 export for project "${projectId}". ` +
        `Unknown, changed, linked, or spoofed content is never replaced. Clear the reserved build folder manually if appropriate. ${errorMessage(error)}`,
      { cause: error }
    );
  }
}

function parseOwnershipMarker(input: unknown): ExportOwnershipMarker {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("the MAGE2 export ownership marker is invalid");
  }

  const marker = input as Record<string, unknown>;
  const keys = Object.keys(marker).sort();
  if (
    keys.length !== 5 ||
    keys[0] !== "exportId" ||
    keys[1] !== "files" ||
    keys[2] !== "format" ||
    keys[3] !== "projectId" ||
    keys[4] !== "version" ||
    marker.format !== EXPORT_MARKER_FORMAT ||
    marker.version !== EXPORT_MARKER_VERSION ||
    typeof marker.projectId !== "string" ||
    marker.projectId.length === 0 ||
    typeof marker.exportId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(marker.exportId) ||
    !Array.isArray(marker.files)
  ) {
    throw new Error("the MAGE2 export ownership marker is invalid");
  }

  const files = marker.files.map(parseExportFileRecord);
  assertInventoryPathsAreCanonical(files);
  return { ...marker, files } as ExportOwnershipMarker;
}

function parseExportFileRecord(input: unknown): ExportFileRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("the MAGE2 export file inventory is invalid");
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "path" ||
    keys[1] !== "sha256" ||
    keys[2] !== "size" ||
    typeof record.path !== "string" ||
    typeof record.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.sha256) ||
    typeof record.size !== "number" ||
    !Number.isSafeInteger(record.size) ||
    record.size < 0
  ) {
    throw new Error("the MAGE2 export file inventory is invalid");
  }
  return record as unknown as ExportFileRecord;
}

async function readVerifiedRegularFile(filePath: string, maximumBytes: number): Promise<string> {
  const fileStats = await lstat(filePath);
  if (fileStats.isSymbolicLink() || !fileStats.isFile()) {
    throw new Error(`required export file is not a regular file: "${filePath}"`);
  }
  if (fileStats.size > maximumBytes) {
    throw new Error(`required export file is unexpectedly large: "${filePath}"`);
  }
  return readFile(filePath, "utf8");
}

async function collectExportFileInventory(
  rootIdentity: DirectoryIdentity,
  excludedRootFiles: ReadonlySet<string> = new Set()
): Promise<ExportFileRecord[]> {
  await assertDirectoryIdentity(rootIdentity, "export folder");
  const records: ExportFileRecord[] = [];
  const directories = new Set<string>();

  async function walk(directoryIdentity: DirectoryIdentity, relativeDirectory: string): Promise<void> {
    await assertDirectoryIdentity(rootIdentity, "export folder");
    await assertDirectoryIdentity(directoryIdentity, "export subfolder");
    const entries = (await readdir(directoryIdentity.path)).sort((left, right) => left.localeCompare(right));
    if (entries.length === 0 && relativeDirectory.length > 0) {
      throw new Error(`unexpected empty export directory: "${relativeDirectory}"`);
    }

    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry}` : entry;
      assertCanonicalInventoryPath(relativePath);
      const absolutePath = path.join(directoryIdentity.path, entry);
      const entryStats = await lstat(absolutePath);
      if (entryStats.isSymbolicLink()) {
        throw new Error(`linked export content is not allowed: "${relativePath}"`);
      }
      if (entryStats.isDirectory()) {
        directories.add(relativePath);
        await walk(await captureDirectoryIdentity(absolutePath), relativePath);
        continue;
      }
      if (!entryStats.isFile()) {
        throw new Error(`non-regular export content is not allowed: "${relativePath}"`);
      }
      if (relativeDirectory.length === 0 && excludedRootFiles.has(entry)) {
        continue;
      }
      records.push({ path: relativePath, ...(await hashRegularFile(absolutePath)) });
    }
  }

  await walk(rootIdentity, "");
  const expectedDirectories = new Set<string>();
  for (const record of records) {
    const segments = record.path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      expectedDirectories.add(segments.slice(0, index).join("/"));
    }
  }
  if (![...directories].every((directory) => expectedDirectories.has(directory))) {
    throw new Error("the export contains an unknown or empty directory");
  }

  records.sort((left, right) => left.path.localeCompare(right.path));
  assertInventoryPathsAreCanonical(records);
  return records;
}

async function hashRegularFile(filePath: string): Promise<Omit<ExportFileRecord, "path">> {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`export content is not a supported regular file: "${filePath}"`);
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < Number(before.size)) {
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, Number(before.size) - position), position);
      if (bytesRead === 0) {
        break;
      }
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      position !== Number(before.size)
    ) {
      throw new Error(`export file changed while it was being verified: "${filePath}"`);
    }
    return { sha256: hash.digest("hex"), size: position };
  } finally {
    await handle.close();
  }
}

function assertExactFileInventory(expected: ExportFileRecord[], actual: ExportFileRecord[]): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error("the export file inventory contains unknown, missing, or changed content");
  }
}

function assertInventoryPathsAreCanonical(records: ExportFileRecord[]): void {
  const caseFolded = new Set<string>();
  let previous = "";
  for (const record of records) {
    assertCanonicalInventoryPath(record.path);
    if (previous && previous.localeCompare(record.path) >= 0) {
      throw new Error("the export file inventory must be strictly sorted and unique");
    }
    previous = record.path;
    const folded = record.path.toLocaleLowerCase("en-US");
    if (caseFolded.has(folded)) {
      throw new Error("the export file inventory contains a Windows path collision");
    }
    caseFolded.add(folded);
  }
}

function assertCanonicalInventoryPath(relativePath: string): void {
  if (relativePath.includes("\\") || path.posix.isAbsolute(relativePath)) {
    throw new Error(`non-canonical export path: "${relativePath}"`);
  }
  const segments = relativePath.split("/");
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment.endsWith(".") ||
        segment.endsWith(" ") ||
        /[<>:"|?*\u0000-\u001f]/.test(segment)
    )
  ) {
    throw new Error(`non-canonical export path: "${relativePath}"`);
  }
}

function sameDestinationSnapshot(left: DestinationSnapshot, right: DestinationSnapshot): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "missing") {
    return true;
  }
  if (right.kind === "missing" || !sameDirectoryIdentity(left.identity, right.identity)) {
    return false;
  }
  return left.kind !== "owned" || (right.kind === "owned" && left.fingerprint === right.fingerprint);
}

async function createSiblingStagingDirectory(
  outputParentIdentity: DirectoryIdentity,
  projectIdentity: DirectoryIdentity
): Promise<DirectoryIdentity> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const stagingDirectory = path.join(outputParentIdentity.path, `.mage2-export-${randomUUID()}.staging`);
    try {
      await assertDirectoryIdentity(projectIdentity, "project folder");
      await assertDirectoryIdentity(outputParentIdentity, "export destination parent folder");
      await assertProspectiveChildPath(outputParentIdentity, stagingDirectory, "export staging folder");
      await mkdir(stagingDirectory);
      const stagingIdentity = await captureDirectoryIdentity(stagingDirectory);
      if (!isStrictDescendant(outputParentIdentity.canonicalPath, stagingIdentity.canonicalPath)) {
        throw new Error("the created staging folder escaped the export destination parent folder");
      }
      return stagingIdentity;
    } catch (error) {
      if (!isExistingPathError(error)) {
        throw new Error(`Export could not create a staging folder beside the output: ${errorMessage(error)}`, {
          cause: error
        });
      }
    }
  }

  throw new Error("Export could not allocate a unique staging folder beside the output.");
}

async function buildExportInDirectory(
  outputIdentity: DirectoryIdentity,
  projectIdentity: DirectoryIdentity,
  runtimeDist: string,
  project: ProjectBundle,
  validationReport: ExportValidationReport,
  onProgress?: (progress: number) => void
): Promise<{ buildManifest: BuildManifest; exportReport: RuntimeExportReport }> {
  await copyRuntimeDistribution(runtimeDist, outputIdentity, projectIdentity);
  onProgress?.(0.18);

  const mediaIdentity = await createVerifiedChildDirectory(outputIdentity, "media", projectIdentity);
  const supportedLocales = normalizeSupportedLocales(
    project.manifest.defaultLanguage,
    project.manifest.supportedLocales
  );
  const reachability = analyzeProjectAssetReachability(project);
  const referencedAssetIds = new Set(reachability.referencedAssetIds);
  const generatedMediaPaths = new Set<string>();
  const totalVariantCountBeforePruning = project.assets.assets.reduce(
    (count, asset) => count + supportedLocales.filter((candidate) => asset.variants[candidate]).length,
    0
  );
  const totalVariantCountAfterPruning = project.assets.assets.reduce(
    (count, asset) =>
      referencedAssetIds.has(asset.id)
        ? count + supportedLocales.filter((candidate) => asset.variants[candidate]).length
        : count,
    0
  );
  let copiedVariantCount = 0;
  let exportedMediaBytes = 0;
  let omittedMediaBytes = 0;
  let omittedUnmeasuredVariantCount = 0;
  const omittedAssets: ExportMediaReport["omittedAssets"] = [];

  const exportedAssets: Array<readonly [string, ProjectBundle["assets"]["assets"][number]]> = [];
  for (const asset of project.assets.assets) {
    const variantLocales = supportedLocales.filter((candidate) => asset.variants[candidate]);
    if (!referencedAssetIds.has(asset.id)) {
      let assetBytes = 0;
      let assetUnmeasuredVariantCount = 0;
      for (const locale of variantLocales) {
        const variant = asset.variants[locale]!;
        const sourcePath =
          asset.kind === "video" || asset.kind === "audio"
            ? variant.proxyPath ?? variant.sourcePath
            : variant.sourcePath;
        const measuredBytes = await measureRegularFileBytes(sourcePath);
        if (measuredBytes === undefined) {
          assetUnmeasuredVariantCount += 1;
        } else {
          assetBytes += measuredBytes;
        }
      }
      omittedMediaBytes += assetBytes;
      omittedUnmeasuredVariantCount += assetUnmeasuredVariantCount;
      omittedAssets.push({
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        variantCount: variantLocales.length,
        bytes: assetBytes,
        unmeasuredVariantCount: assetUnmeasuredVariantCount
      });
      continue;
    }

    assertSafeGeneratedToken("asset ID", asset.id);
    const exportedVariants: Record<string, (typeof asset.variants)[string]> = {};
    for (const locale of variantLocales) {
      assertSafeGeneratedToken("locale", locale);
      const variant = asset.variants[locale]!;
      const sourcePath =
        asset.kind === "video" || asset.kind === "audio"
          ? variant.proxyPath ?? variant.sourcePath
          : variant.sourcePath;
      const extension = safeAssetExtension(sourcePath, asset.kind);
      const fileName = `${asset.id}.${locale}${extension}`;
      const relativePath = `media/${fileName}`;
      assertCanonicalInventoryPath(relativePath);
      const foldedPath = relativePath.toLocaleLowerCase("en-US");
      if (generatedMediaPaths.has(foldedPath)) {
        throw new Error(`Export asset paths collide on Windows: "${relativePath}".`);
      }
      generatedMediaPaths.add(foldedPath);

      const copiedPath = path.join(mediaIdentity.path, fileName);
      exportedMediaBytes += await copyRegularFileIntoVerifiedDirectory(
        sourcePath,
        copiedPath,
        mediaIdentity,
        outputIdentity,
        projectIdentity
      );
      exportedVariants[locale] = {
        ...variant,
        sourcePath: relativePath,
        proxyPath: undefined,
        posterPath: undefined
      };
      copiedVariantCount += 1;
      onProgress?.(0.18 + 0.52 * (copiedVariantCount / Math.max(1, totalVariantCountAfterPruning)));
    }

    exportedAssets.push([asset.id, { ...asset, variants: exportedVariants }]);
  }
  if (totalVariantCountAfterPruning === 0) {
    onProgress?.(0.7);
  }

  const mediaReport: ExportMediaReport = {
    before: {
      assetCount: reachability.totalAssetCount,
      variantCount: totalVariantCountBeforePruning,
      bytes: exportedMediaBytes + omittedMediaBytes,
      unmeasuredVariantCount: omittedUnmeasuredVariantCount
    },
    after: {
      assetCount: reachability.referencedAssetCount,
      variantCount: totalVariantCountAfterPruning,
      bytes: exportedMediaBytes,
      unmeasuredVariantCount: 0
    },
    omitted: {
      assetCount: reachability.unusedAssetCount,
      variantCount: totalVariantCountBeforePruning - totalVariantCountAfterPruning,
      bytes: omittedMediaBytes,
      unmeasuredVariantCount: omittedUnmeasuredVariantCount
    },
    omittedAssets
  };

  const assetMap = Object.fromEntries(
    exportedAssets.map(([assetId, asset]) => [
      assetId,
      Object.fromEntries(Object.entries(asset.variants).map(([locale, variant]) => [locale, variant.sourcePath]))
    ])
  );
  const exportContent = {
    ...toExportProjectData(project),
    assets: exportedAssets.map(([, asset]) => asset)
  };

  const contentIdentity = await createVerifiedChildDirectory(outputIdentity, "content", projectIdentity);
  await writeNewFileInVerifiedDirectory(
    contentIdentity,
    "project-content.json",
    JSON.stringify(exportContent, null, 2),
    outputIdentity,
    projectIdentity
  );
  await writeNewFileInVerifiedDirectory(
    outputIdentity,
    "validation-report.json",
    JSON.stringify(validationReport, null, 2),
    outputIdentity,
    projectIdentity
  );

  const generatedAt = new Date().toISOString();
  const exportReport: RuntimeExportReport = {
    format: "mage2-export-report",
    version: 1,
    generatedAt,
    mode: validationReport.mode,
    media: mediaReport
  };
  await writeNewFileInVerifiedDirectory(
    outputIdentity,
    EXPORT_REPORT_FILE,
    JSON.stringify(exportReport, null, 2),
    outputIdentity,
    projectIdentity
  );

  const buildManifest: BuildManifest = {
    projectId: project.manifest.projectId,
    projectName: project.manifest.projectName,
    engineVersion: project.manifest.engineVersion,
    gameVersion: project.manifest.gameVersion,
    saveCompatibilityVersion: project.manifest.saveCompatibilityVersion,
    generatedAt,
    startLocationId: project.manifest.startLocationId,
    startSceneId: project.manifest.startSceneId,
    contentPath: "content/project-content.json",
    validationReportPath: "validation-report.json",
    exportReportPath: EXPORT_REPORT_FILE,
    assetMap
  };

  await writeNewFileInVerifiedDirectory(
    outputIdentity,
    "build-manifest.json",
    JSON.stringify(buildManifest, null, 2),
    outputIdentity,
    projectIdentity
  );
  onProgress?.(0.78);

  const files = await collectExportFileInventory(outputIdentity);
  onProgress?.(0.94);
  const marker: ExportOwnershipMarker = {
    format: EXPORT_MARKER_FORMAT,
    version: EXPORT_MARKER_VERSION,
    projectId: project.manifest.projectId,
    exportId: randomUUID(),
    files
  };
  await writeNewFileInVerifiedDirectory(
    outputIdentity,
    EXPORT_MARKER_FILE,
    JSON.stringify(marker, null, 2),
    outputIdentity,
    projectIdentity
  );

  onProgress?.(1);

  return { buildManifest, exportReport };
}

async function copyRuntimeDistribution(
  runtimeDist: string,
  outputIdentity: DirectoryIdentity,
  projectIdentity: DirectoryIdentity
): Promise<void> {
  const sourceIdentity = await captureDirectoryIdentity(runtimeDist);
  const seenPaths = new Set<string>();

  async function copyChildren(sourceDirectory: string, targetIdentity: DirectoryIdentity, prefix: string): Promise<void> {
    const entries = (await readdir(sourceDirectory)).sort((left, right) => left.localeCompare(right));
    for (const entry of entries) {
      if (!prefix && RESERVED_RUNTIME_NAMES.has(entry.toLocaleLowerCase("en-US"))) {
        throw new Error(`Bundled runtime uses reserved export path "${entry}".`);
      }
      const relativePath = prefix ? `${prefix}/${entry}` : entry;
      assertCanonicalInventoryPath(relativePath);
      const foldedPath = relativePath.toLocaleLowerCase("en-US");
      if (seenPaths.has(foldedPath)) {
        throw new Error(`Bundled runtime contains a Windows path collision: "${relativePath}".`);
      }
      seenPaths.add(foldedPath);

      const sourcePath = path.join(sourceDirectory, entry);
      const sourceStats = await lstat(sourcePath);
      if (sourceStats.isSymbolicLink()) {
        throw new Error(`Bundled runtime contains a linked path: "${relativePath}".`);
      }
      if (sourceStats.isDirectory()) {
        const childIdentity = await createVerifiedChildDirectory(targetIdentity, entry, projectIdentity, outputIdentity);
        await copyChildren(sourcePath, childIdentity, relativePath);
        continue;
      }
      if (!sourceStats.isFile()) {
        throw new Error(`Bundled runtime contains unsupported content: "${relativePath}".`);
      }
      await copyRegularFileIntoVerifiedDirectory(
        sourcePath,
        path.join(targetIdentity.path, entry),
        targetIdentity,
        outputIdentity,
        projectIdentity
      );
    }
  }

  await assertDirectoryIdentity(sourceIdentity, "bundled runtime folder");
  await copyChildren(sourceIdentity.path, outputIdentity, "");
}

async function createVerifiedChildDirectory(
  parentIdentity: DirectoryIdentity,
  name: string,
  projectIdentity: DirectoryIdentity,
  outputIdentity: DirectoryIdentity = parentIdentity
): Promise<DirectoryIdentity> {
  assertCanonicalInventoryPath(name);
  const childPath = path.join(parentIdentity.path, name);
  await assertDirectoryIdentity(projectIdentity, "project folder");
  await assertDirectoryIdentity(outputIdentity, "export staging folder");
  await assertDirectoryIdentity(parentIdentity, "export parent folder");
  await assertProspectiveChildPath(parentIdentity, childPath, "generated export folder");
  await mkdir(childPath);
  const childIdentity = await captureDirectoryIdentity(childPath);
  if (!isStrictDescendant(outputIdentity.canonicalPath, childIdentity.canonicalPath)) {
    throw new Error(`Generated export folder escaped staging: "${childPath}".`);
  }
  return childIdentity;
}

async function copyRegularFileIntoVerifiedDirectory(
  sourcePath: string,
  destinationPath: string,
  parentIdentity: DirectoryIdentity,
  outputIdentity: DirectoryIdentity,
  projectIdentity: DirectoryIdentity
): Promise<number> {
  const sourceStats = await lstat(sourcePath);
  if (sourceStats.isSymbolicLink() || !sourceStats.isFile()) {
    throw new Error(`Export source is not a normal file: "${sourcePath}".`);
  }
  await assertDirectoryIdentity(projectIdentity, "project folder");
  await assertDirectoryIdentity(outputIdentity, "export staging folder");
  await assertDirectoryIdentity(parentIdentity, "export destination folder");
  await assertProspectiveChildPath(parentIdentity, destinationPath, "generated export file");
  await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
  await assertDirectoryIdentity(outputIdentity, "export staging folder");
  return sourceStats.size;
}

async function measureRegularFileBytes(sourcePath: string): Promise<number | undefined> {
  try {
    const sourceStats = await lstat(sourcePath);
    return sourceStats.isFile() && !sourceStats.isSymbolicLink() ? sourceStats.size : undefined;
  } catch {
    return undefined;
  }
}

async function writeNewFileInVerifiedDirectory(
  parentIdentity: DirectoryIdentity,
  name: string,
  contents: string,
  outputIdentity: DirectoryIdentity,
  projectIdentity: DirectoryIdentity
): Promise<void> {
  assertCanonicalInventoryPath(name);
  const destinationPath = path.join(parentIdentity.path, name);
  await assertDirectoryIdentity(projectIdentity, "project folder");
  await assertDirectoryIdentity(outputIdentity, "export staging folder");
  await assertDirectoryIdentity(parentIdentity, "export destination folder");
  await assertProspectiveChildPath(parentIdentity, destinationPath, "generated export file");
  await writeFile(destinationPath, contents, { encoding: "utf8", flag: "wx" });
  await assertDirectoryIdentity(outputIdentity, "export staging folder");
}

function assertSafeGeneratedToken(label: string, value: string): void {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,126}[A-Za-z0-9])?$/.test(value)) {
    throw new Error(`Export ${label} cannot be used in a safe generated filename: "${value}".`);
  }
}

function safeAssetExtension(sourcePath: string, kind: ProjectBundle["assets"]["assets"][number]["kind"]): string {
  const extension = path.extname(sourcePath) || (kind === "video" ? ".mp4" : kind === "audio" ? ".mp3" : ".png");
  if (!/^\.[A-Za-z0-9]{1,10}$/.test(extension)) {
    throw new Error(`Export asset extension cannot be used in a safe generated filename: "${extension}".`);
  }
  return extension.toLocaleLowerCase("en-US");
}

async function promoteStagedExport(
  stagingIdentity: DirectoryIdentity,
  outputDirectory: string,
  destination: DestinationSnapshot,
  outputParentIdentity: DirectoryIdentity,
  projectIdentity: DirectoryIdentity
): Promise<void> {
  const backupDirectory = path.join(
    outputParentIdentity.path,
    `.mage2-export-${randomUUID()}.backup`
  );
  let backupIdentity: DirectoryIdentity | undefined;

  if (destination.kind !== "missing") {
    try {
      await assertDirectoryIdentity(projectIdentity, "project folder");
      await assertDirectoryIdentity(outputParentIdentity, "export destination parent folder");
      await assertDirectoryIdentity(destination.identity, "existing export folder");
      await assertProspectiveChildPath(outputParentIdentity, backupDirectory, "export backup folder");
      await rename(outputDirectory, backupDirectory);
      backupIdentity = await captureDirectoryIdentity(backupDirectory);
      if (!sameDirectoryObject(destination.identity, backupIdentity)) {
        throw new Error("the moved export folder did not retain the verified filesystem identity");
      }
    } catch (error) {
      throw new Error(
        `Export could not prepare output folder "${outputDirectory}" for replacement. The existing export was not changed. ${errorMessage(error)}`,
        { cause: error }
      );
    }
  }

  try {
    await assertDirectoryIdentity(projectIdentity, "project folder");
    await assertDirectoryIdentity(outputParentIdentity, "export destination parent folder");
    await assertDirectoryIdentity(stagingIdentity, "export staging folder");
    await rename(stagingIdentity.path, outputDirectory);
  } catch (promotionError) {
    if (!backupIdentity) {
      throw new Error(
        `Export could not publish the staged build to "${outputDirectory}". ${errorMessage(promotionError)}`,
        { cause: promotionError }
      );
    }

    try {
      await assertDirectoryIdentity(projectIdentity, "project folder");
      await assertDirectoryIdentity(outputParentIdentity, "export destination parent folder");
      await assertDirectoryIdentity(backupIdentity, "previous export backup");
      await rename(backupDirectory, outputDirectory);
    } catch (rollbackError) {
      throw new Error(
        `Export could not publish the new build or restore the previous build to "${outputDirectory}". ` +
          `The previous build is preserved at "${backupDirectory}". ` +
          `Publish error: ${errorMessage(promotionError)} Rollback error: ${errorMessage(rollbackError)}`,
        { cause: rollbackError }
      );
    }

    throw new Error(
      `Export could not publish the new build to "${outputDirectory}". The previous export was restored. ${errorMessage(promotionError)}`,
      { cause: promotionError }
    );
  }

  const promotedIdentity = await captureDirectoryIdentity(outputDirectory);
  if (!sameDirectoryObject(stagingIdentity, promotedIdentity)) {
    throw new Error(
      `Export publication identity changed unexpectedly. The previous build remains preserved at "${backupDirectory}".`
    );
  }

  if (backupIdentity) {
    await removeCreatedDirectoryBestEffort(backupIdentity, outputParentIdentity, projectIdentity);
  }
}

function sameDirectoryObject(left: DirectoryIdentity, right: DirectoryIdentity): boolean {
  return filesystemObjectIdentityChangedFields(left, right).length === 0;
}

async function removeCreatedDirectoryBestEffort(
  directoryIdentity: DirectoryIdentity,
  outputParentIdentity: DirectoryIdentity,
  projectIdentity: DirectoryIdentity
): Promise<void> {
  try {
    await removeVerifiedDirectoryTree(
      directoryIdentity,
      directoryIdentity,
      outputParentIdentity,
      projectIdentity
    );
  } catch (error) {
    console.warn(
      `MAGE2 export left an identity-protected temporary folder "${directoryIdentity.path}": ${errorMessage(error)}`
    );
  }
}

async function removeVerifiedDirectoryTree(
  directoryIdentity: DirectoryIdentity,
  rootIdentity: DirectoryIdentity,
  outputParentIdentity: DirectoryIdentity,
  projectIdentity: DirectoryIdentity
): Promise<void> {
  await assertDirectoryIdentity(projectIdentity, "project folder");
  await assertDirectoryIdentity(outputParentIdentity, "export destination parent folder");
  await assertDirectoryIdentity(rootIdentity, "temporary export folder");
  await assertDirectoryIdentity(directoryIdentity, "temporary export subfolder");
  const entries = await readdir(directoryIdentity.path);

  for (const entry of entries) {
    const entryPath = path.join(directoryIdentity.path, entry);
    await assertDirectoryIdentity(projectIdentity, "project folder");
    await assertDirectoryIdentity(outputParentIdentity, "export destination parent folder");
    await assertDirectoryIdentity(rootIdentity, "temporary export folder");
    await assertDirectoryIdentity(directoryIdentity, "temporary export subfolder");
    const entryStats = await lstat(entryPath);
    if (entryStats.isDirectory() && !entryStats.isSymbolicLink()) {
      await removeVerifiedDirectoryTree(
        await captureDirectoryIdentity(entryPath),
        rootIdentity,
        outputParentIdentity,
        projectIdentity
      );
      continue;
    }
    if (!entryStats.isFile() && !entryStats.isSymbolicLink()) {
      throw new Error(`temporary export contains an unsupported filesystem entry: "${entryPath}"`);
    }
    await assertDirectoryIdentity(projectIdentity, "project folder");
    await assertDirectoryIdentity(outputParentIdentity, "export destination parent folder");
    await assertDirectoryIdentity(rootIdentity, "temporary export folder");
    await assertDirectoryIdentity(directoryIdentity, "temporary export subfolder");
    await unlink(entryPath);
  }

  await assertDirectoryIdentity(projectIdentity, "project folder");
  await assertDirectoryIdentity(outputParentIdentity, "export destination parent folder");
  await assertDirectoryIdentity(rootIdentity, "temporary export folder");
  await assertDirectoryIdentity(directoryIdentity, "temporary export subfolder");
  if ((await readdir(directoryIdentity.path)).length !== 0) {
    throw new Error("temporary export folder changed during cleanup");
  }
  await rmdir(directoryIdentity.path);
}

async function buildRuntimeWeb(): Promise<void> {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  await run(command, ["run", "build", "--workspace", "@mage2/runtime-web"], getRepoRoot());
}

async function resolveRuntimeWebDist(): Promise<string> {
  if (app.isPackaged) {
    const bundledRuntimeDist = path.join(process.resourcesPath, "runtime-web");
    if (existsSync(path.join(bundledRuntimeDist, "index.html"))) {
      return bundledRuntimeDist;
    }

    throw new Error("Bundled runtime-web assets are missing from the packaged editor.");
  }

  await buildRuntimeWeb();
  return path.join(getRepoRoot(), "apps", "runtime-web", "dist");
}

function getRepoRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "..", ".."),
    path.resolve(process.cwd(), "..", "..", "..")
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "apps", "runtime-web", "package.json"))) {
      return candidate;
    }
  }

  throw new Error("Could not locate the repository root from the current working directory.");
}

function toPosix(input: string): string {
  return input.replace(/\\/g, "/");
}

function isMissingPathError(error: unknown): boolean {
  return isNodeErrorWithCode(error, "ENOENT");
}

function isExistingPathError(error: unknown): boolean {
  return isNodeErrorWithCode(error, "EEXIST");
}

function isNodeErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with code ${code}.`));
      }
    });
  });
}

import { createHash, randomUUID } from "node:crypto";
import * as nodeFs from "node:fs";
import { constants } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { BuiltInLocale, ProjectBundle } from "@mage2/schema";
import {
  exportProjectBundle,
  type ExportResult,
  type ProjectExportMode
} from "./exporter";
import {
  filesystemObjectIdentityChangedFields,
  filesystemObjectIdentityFromStats
} from "./filesystem-identity";
import { retryTransientWindowsFilesystemOperation } from "./filesystem-retry";

export type RuntimeExportFormat = "windows" | "web";
export type RuntimeExportMode = ProjectExportMode;

export type RuntimeExportProgressPhase =
  | "preparing"
  | "building-web"
  | "assembling-player"
  | "publishing"
  | "complete";

export interface RuntimeExportProgress {
  format: RuntimeExportFormat;
  phase: RuntimeExportProgressPhase;
  /** Overall completion from 0 to 1. Completion is never reported before publishing succeeds. */
  progress: number;
  elapsedSeconds: number;
  /** Approximate wall-clock time remaining. Omitted while an estimate is unavailable or has elapsed. */
  estimatedSecondsRemaining?: number;
  /** Bytes being packaged, when the export has reached a measurable payload. */
  payloadBytes?: number;
}

export type RuntimeExportProgressHandler = (progress: RuntimeExportProgress) => void;

export type WindowsRuntimeProgress = Omit<RuntimeExportProgress, "format" | "elapsedSeconds">;
export type WindowsRuntimeProgressHandler = (progress: WindowsRuntimeProgress) => void;

export interface RuntimeExportRequest {
  format: RuntimeExportFormat;
  mode?: RuntimeExportMode;
  /** Editor interface locale used only for product-owned native dialog copy. */
  interfaceLocale?: BuiltInLocale;
  /** Trusted automation-only override. Normal exports obtain this path from Electron's native dialog. */
  destinationPath?: string;
}

export interface RuntimeArtifactExportResult extends ExportResult {
  format: RuntimeExportFormat;
  outputPath: string;
}

export interface WindowsRuntimePackagingResources {
  runtimeTemplateDirectory: string;
}

export interface CreateWindowsRuntimeFolderOptions {
  buildDirectory: string;
  destinationDirectory: string;
  mode: RuntimeExportMode;
  project: ProjectBundle;
  resources: WindowsRuntimePackagingResources;
  onProgress?: WindowsRuntimeProgressHandler;
}

interface DirectoryIdentity {
  path: string;
  canonicalPath: string;
  dev: string;
  ino: string;
  birthtime: string;
}

interface WindowsRuntimeFileRecord {
  path: string;
  sha256: string;
  size: number;
}

interface WindowsRuntimeOwnershipMarker {
  format: typeof WINDOWS_RUNTIME_MARKER_FORMAT;
  version: typeof WINDOWS_RUNTIME_MARKER_VERSION;
  projectId: string;
  exportId: string;
  executableName: string;
  files: WindowsRuntimeFileRecord[];
}

type WindowsRuntimeDestinationSnapshot =
  | { kind: "missing" }
  | { kind: "empty"; identity: DirectoryIdentity }
  | { kind: "owned"; identity: DirectoryIdentity; fingerprint: string };

const WINDOWS_RUNTIME_TEMPLATE_EXECUTABLE = "MAGE2 Player.exe";
const WINDOWS_RUNTIME_DIRECTORY = "runtime";
const BUNDLED_RUNTIME_APP_ARCHIVE = "app.mage2asar";
const WINDOWS_RUNTIME_MARKER_FILE = ".mage2-windows-player.json";
const WINDOWS_RUNTIME_MARKER_FORMAT = "mage2-windows-player";
const WINDOWS_RUNTIME_MARKER_VERSION = 1;
const rawFilesystem: typeof nodeFs = process.versions.electron
  ? (createRequire(process.execPath)("original-fs") as typeof nodeFs)
  : nodeFs;
const {
  copyFile,
  cp,
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile
} = rawFilesystem.promises;

export async function exportRuntimeArtifact(options: {
  projectDir: string;
  project: ProjectBundle;
  request: RuntimeExportRequest;
  windowsResources?: WindowsRuntimePackagingResources;
  onProgress?: RuntimeExportProgressHandler;
}): Promise<RuntimeArtifactExportResult> {
  const mode = options.request.mode ?? "release";
  const reportProgress = createRuntimeExportProgressReporter(options.request.format, options.onProgress);
  reportProgress({ phase: "preparing", progress: 0.02 });

  const destinationPath = path.resolve(options.request.destinationPath ?? "");
  if (!options.request.destinationPath?.trim()) {
    throw new Error("Choose where MAGE2 should create the runtime export.");
  }

  if (options.request.format === "web") {
    const bundleStartedAt = Date.now();
    const result = await exportProjectBundle(options.projectDir, options.project, {
      outputDirectory: destinationPath,
      mode,
      onProgress: (bundleProgress) => {
        const progress = 0.03 + bundleProgress.progress * 0.94;
        const bundleElapsedSeconds = Math.max(0.25, (Date.now() - bundleStartedAt) / 1000);
        const estimatedSecondsRemaining =
          bundleProgress.progress > 0 && bundleProgress.progress < 1
            ? Math.min(
                60 * 60,
                Math.max(1, Math.ceil((bundleElapsedSeconds * (1 - bundleProgress.progress)) / bundleProgress.progress))
              )
            : bundleProgress.progress >= 1
              ? 0
              : undefined;
        reportProgress({
          phase:
            bundleProgress.stage === "publishing" || bundleProgress.stage === "complete"
              ? "publishing"
              : "building-web",
          progress,
          estimatedSecondsRemaining
        });
      }
    });
    reportProgress({ phase: "complete", progress: 1, estimatedSecondsRemaining: 0 });
    return { ...result, format: "web", outputPath: result.outputDirectory };
  }

  if (process.platform !== "win32") {
    throw new Error("Windows player folders can only be created by the Windows editor.");
  }
  if (!options.windowsResources) {
    throw new Error("The packaged Windows runtime resources are unavailable.");
  }

  // Keep the project-local web build as the canonical, inspectable source of
  // the ready-to-play Windows folder. The selected destination is not touched
  // until both the web build and the complete player folder are verified.
  const result = await exportProjectBundle(options.projectDir, options.project, {
    mode,
    onProgress: (bundleProgress) => {
      reportProgress({
        phase: "building-web",
        progress: 0.03 + bundleProgress.progress * 0.2
      });
    }
  });
  const outputPath = await createWindowsRuntimeFolder({
    buildDirectory: result.outputDirectory,
    destinationDirectory: destinationPath,
    mode,
    project: options.project,
    resources: options.windowsResources,
    onProgress: reportProgress
  });
  return { ...result, format: "windows", outputPath };
}

export async function createWindowsRuntimeFolder(
  options: CreateWindowsRuntimeFolderOptions
): Promise<string> {
  const destinationDirectory = path.resolve(options.destinationDirectory);
  const destinationParent = await captureDirectoryIdentity(
    path.dirname(destinationDirectory),
    "export destination folder"
  );
  await assertDirectChild(destinationParent, destinationDirectory, "Windows player folder");
  const initialDestination = await inspectWindowsRuntimeDestination(
    destinationDirectory,
    options.project.manifest.projectId
  );
  const runtimeTemplateDirectory = await assertRuntimeTemplate(
    options.resources.runtimeTemplateDirectory
  );
  const stagingDirectory = path.join(
    destinationParent.path,
    `.mage2-windows-player-${randomUUID()}.staging`
  );
  await assertDirectChild(destinationParent, stagingDirectory, "Windows player staging folder");
  let stagingPromoted = false;

  try {
    emitWindowsRuntimeProgress(options.onProgress, {
      phase: "assembling-player",
      progress: 0.24
    });
    await cp(runtimeTemplateDirectory, stagingDirectory, {
      recursive: true,
      force: false,
      errorOnExist: true
    });
    await chmod(stagingDirectory, 0o755);
    const stagingIdentity = await captureDirectoryIdentity(
      stagingDirectory,
      "Windows player staging folder"
    );
    if (!isStrictDescendant(destinationParent.canonicalPath, stagingIdentity.canonicalPath)) {
      throw new Error("The Windows player staging folder escaped the selected destination.");
    }

    await rename(
      path.join(stagingDirectory, WINDOWS_RUNTIME_DIRECTORY, "resources", BUNDLED_RUNTIME_APP_ARCHIVE),
      path.join(stagingDirectory, WINDOWS_RUNTIME_DIRECTORY, "resources", "app.asar")
    );
    const executableName = suggestedWindowsRuntimeExecutableName(
      options.project.manifest.projectName,
      options.mode
    );
    await rename(
      path.join(stagingDirectory, WINDOWS_RUNTIME_TEMPLATE_EXECUTABLE),
      path.join(stagingDirectory, executableName)
    );
    await cp(
      path.resolve(options.buildDirectory),
      path.join(stagingDirectory, WINDOWS_RUNTIME_DIRECTORY, "resources", "player"),
      {
        recursive: true,
        force: false,
        errorOnExist: true
      }
    );
    await copyCreatorIconIfConfigured(options.buildDirectory, stagingDirectory);
    await writeWindowsRuntimeOwnershipMarker(
      stagingIdentity,
      options.project.manifest.projectId,
      executableName
    );

    emitWindowsRuntimeProgress(options.onProgress, {
      phase: "publishing",
      progress: 0.95
    });
    await publishWindowsRuntimeDirectory(
      stagingIdentity,
      destinationDirectory,
      destinationParent,
      initialDestination,
      options.project.manifest.projectId
    );
    stagingPromoted = true;
    await rm(stagingDirectory, { recursive: true, force: true }).catch((error) => {
      console.warn(`MAGE2 left a published Windows player staging folder at "${stagingDirectory}":`, error);
    });
    emitWindowsRuntimeProgress(options.onProgress, {
      phase: "complete",
      progress: 1,
      estimatedSecondsRemaining: 0
    });
    return destinationDirectory;
  } finally {
    if (!stagingPromoted) {
      await rm(stagingDirectory, { recursive: true, force: true }).catch((error) => {
        console.warn(`MAGE2 left a temporary Windows player folder at "${stagingDirectory}":`, error);
      });
    }
  }
}

function createRuntimeExportProgressReporter(
  format: RuntimeExportFormat,
  handler: RuntimeExportProgressHandler | undefined
): WindowsRuntimeProgressHandler {
  const startedAt = Date.now();
  let lastPhase: RuntimeExportProgressPhase | undefined;
  let lastProgress = 0;
  let lastReportedAt = 0;

  return (update) => {
    if (!handler) {
      return;
    }

    const now = Date.now();
    const progress = Math.max(lastProgress, Math.min(1, Math.max(0, update.progress)));
    const phaseChanged = update.phase !== lastPhase;
    const shouldThrottle =
      !phaseChanged &&
      progress < 1 &&
      progress - lastProgress < 0.01 &&
      now - lastReportedAt < 100;
    if (shouldThrottle) {
      return;
    }

    lastPhase = update.phase;
    lastProgress = progress;
    lastReportedAt = now;
    try {
      handler({
        ...update,
        format,
        progress,
        elapsedSeconds: Math.max(0, (now - startedAt) / 1000)
      });
    } catch (error) {
      console.warn("MAGE2 runtime export progress listener failed:", error);
    }
  };
}

function emitWindowsRuntimeProgress(
  handler: WindowsRuntimeProgressHandler | undefined,
  progress: WindowsRuntimeProgress
): void {
  if (!handler) {
    return;
  }
  try {
    handler(progress);
  } catch (error) {
    console.warn("MAGE2 Windows export progress listener failed:", error);
  }
}

export function sanitizeRuntimeArtifactName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  return sanitized || "MAGE2 Game";
}

export function suggestedRuntimeArtifactName(
  projectName: string,
  format: RuntimeExportFormat,
  mode: RuntimeExportMode = "release"
): string {
  const baseName = sanitizeRuntimeArtifactName(projectName);
  if (mode === "preview") {
    return format === "windows" ? `${baseName} Preview` : `${baseName} Preview Web`;
  }
  return format === "windows" ? `${baseName} Player` : `${baseName} Web`;
}

export function suggestedWindowsRuntimeExecutableName(
  projectName: string,
  mode: RuntimeExportMode = "release"
): string {
  return `${suggestedRuntimeArtifactName(projectName, "windows", mode)}.exe`;
}

async function assertRuntimeTemplate(inputPath: string): Promise<string> {
  const identity = await captureDirectoryIdentity(inputPath, "bundled Windows runtime template");
  const executablePath = path.join(identity.path, WINDOWS_RUNTIME_TEMPLATE_EXECUTABLE);
  const executableStats = await lstat(executablePath);
  if (executableStats.isSymbolicLink() || !executableStats.isFile()) {
    throw new Error(`Bundled Windows runtime template is missing ${WINDOWS_RUNTIME_TEMPLATE_EXECUTABLE}.`);
  }
  const runtimeExecutableStats = await lstat(
    path.join(identity.path, WINDOWS_RUNTIME_DIRECTORY, WINDOWS_RUNTIME_TEMPLATE_EXECUTABLE)
  );
  if (runtimeExecutableStats.isSymbolicLink() || !runtimeExecutableStats.isFile()) {
    throw new Error(
      `Bundled Windows runtime template is missing ${WINDOWS_RUNTIME_DIRECTORY}/${WINDOWS_RUNTIME_TEMPLATE_EXECUTABLE}.`
    );
  }
  const appArchiveStats = await lstat(
    path.join(identity.path, WINDOWS_RUNTIME_DIRECTORY, "resources", BUNDLED_RUNTIME_APP_ARCHIVE)
  );
  if (appArchiveStats.isSymbolicLink() || !appArchiveStats.isFile()) {
    throw new Error(
      `Bundled Windows runtime template is missing ${WINDOWS_RUNTIME_DIRECTORY}/resources/${BUNDLED_RUNTIME_APP_ARCHIVE}.`
    );
  }
  return identity.path;
}

async function copyCreatorIconIfConfigured(buildDirectory: string, payloadDirectory: string): Promise<void> {
  const buildRoot = path.resolve(buildDirectory);
  const buildManifest = JSON.parse(await readFile(path.join(buildRoot, "build-manifest.json"), "utf8")) as {
    contentPath?: unknown;
    assetMap?: unknown;
  };
  if (typeof buildManifest.contentPath !== "string") {
    throw new Error("Runtime build manifest has no content path.");
  }
  const projectContent = JSON.parse(
    await readFile(path.resolve(buildRoot, ...buildManifest.contentPath.split("/")), "utf8")
  ) as {
    manifest?: {
      defaultLanguage?: unknown;
      playerPresentation?: { appIconAssetId?: unknown };
    };
  };
  const appIconAssetId = projectContent.manifest?.playerPresentation?.appIconAssetId;
  if (typeof appIconAssetId !== "string" || !appIconAssetId) {
    return;
  }

  const assetMap = buildManifest.assetMap;
  if (!assetMap || typeof assetMap !== "object" || Array.isArray(assetMap)) {
    throw new Error(`Configured player icon '${appIconAssetId}' is missing from the runtime asset map.`);
  }
  const variants = (assetMap as Record<string, unknown>)[appIconAssetId];
  if (!variants || typeof variants !== "object" || Array.isArray(variants)) {
    throw new Error(`Configured player icon '${appIconAssetId}' is missing from the runtime asset map.`);
  }
  const defaultLanguage = projectContent.manifest?.defaultLanguage;
  const variantMap = variants as Record<string, unknown>;
  const relativePath =
    (typeof defaultLanguage === "string" ? variantMap[defaultLanguage] : undefined) ?? Object.values(variantMap)[0];
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new Error(`Configured player icon '${appIconAssetId}' has no exported media variant.`);
  }
  const sourcePath = path.resolve(buildRoot, ...relativePath.split("/"));
  if (!isStrictDescendant(buildRoot, sourcePath) || path.extname(sourcePath).toLocaleLowerCase("en-US") !== ".png") {
    throw new Error(`Configured player icon '${appIconAssetId}' must resolve to an exported PNG file.`);
  }
  const sourceStats = await lstat(sourcePath);
  if (sourceStats.isSymbolicLink() || !sourceStats.isFile()) {
    throw new Error(`Configured player icon '${appIconAssetId}' is not a normal file.`);
  }
  await copyFile(
    sourcePath,
    path.join(payloadDirectory, WINDOWS_RUNTIME_DIRECTORY, "resources", "creator-icon.png"),
    constants.COPYFILE_EXCL
  );
}

async function writeWindowsRuntimeOwnershipMarker(
  stagingIdentity: DirectoryIdentity,
  projectId: string,
  executableName: string
): Promise<void> {
  const files = await collectWindowsRuntimeFileInventory(
    stagingIdentity,
    new Set([WINDOWS_RUNTIME_MARKER_FILE])
  );
  if (!files.some((record) => record.path === executableName)) {
    throw new Error(`The Windows player executable is missing from the staged folder: "${executableName}".`);
  }
  const marker: WindowsRuntimeOwnershipMarker = {
    format: WINDOWS_RUNTIME_MARKER_FORMAT,
    version: WINDOWS_RUNTIME_MARKER_VERSION,
    projectId,
    exportId: randomUUID(),
    executableName,
    files
  };
  await writeFile(
    path.join(stagingIdentity.path, WINDOWS_RUNTIME_MARKER_FILE),
    `${JSON.stringify(marker, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" }
  );
}

async function inspectWindowsRuntimeDestination(
  destinationDirectory: string,
  projectId: string
): Promise<WindowsRuntimeDestinationSnapshot> {
  let stats;
  try {
    stats = await lstat(destinationDirectory);
  } catch (error) {
    if (isMissingPathError(error)) {
      return { kind: "missing" };
    }
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`Windows player destination is not a normal folder: "${destinationDirectory}".`);
  }

  const identity = await captureDirectoryIdentity(destinationDirectory, "Windows player destination");
  if ((await readdir(destinationDirectory)).length === 0) {
    return { kind: "empty", identity };
  }

  try {
    const markerPath = path.join(destinationDirectory, WINDOWS_RUNTIME_MARKER_FILE);
    const markerStats = await lstat(markerPath);
    if (markerStats.isSymbolicLink() || !markerStats.isFile() || markerStats.size > 5 * 1024 * 1024) {
      throw new Error("the ownership marker is not a supported regular file");
    }
    const markerText = await readFile(markerPath, "utf8");
    const marker = parseWindowsRuntimeOwnershipMarker(JSON.parse(markerText));
    if (marker.projectId !== projectId) {
      throw new Error("the ownership marker belongs to another project");
    }
    const actualFiles = await collectWindowsRuntimeFileInventory(
      identity,
      new Set([WINDOWS_RUNTIME_MARKER_FILE])
    );
    if (JSON.stringify(marker.files) !== JSON.stringify(actualFiles)) {
      throw new Error("the player folder contains unknown, missing, or changed files");
    }
    if (!actualFiles.some((record) => record.path === marker.executableName)) {
      throw new Error("the recorded player executable is missing");
    }
    return {
      kind: "owned",
      identity,
      fingerprint: createHash("sha256").update(markerText).digest("hex")
    };
  } catch (error) {
    throw new Error(
      `Windows player export refused: "${destinationDirectory}" is not an empty folder or a verified previous MAGE2 player for project "${projectId}". ` +
        `Unknown, changed, linked, or added files are never replaced. ${errorMessage(error)}`,
      { cause: error }
    );
  }
}

function parseWindowsRuntimeOwnershipMarker(input: unknown): WindowsRuntimeOwnershipMarker {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("the Windows player ownership marker is invalid");
  }
  const marker = input as Record<string, unknown>;
  const keys = Object.keys(marker).sort();
  if (
    keys.length !== 6 ||
    keys[0] !== "executableName" ||
    keys[1] !== "exportId" ||
    keys[2] !== "files" ||
    keys[3] !== "format" ||
    keys[4] !== "projectId" ||
    keys[5] !== "version" ||
    marker.format !== WINDOWS_RUNTIME_MARKER_FORMAT ||
    marker.version !== WINDOWS_RUNTIME_MARKER_VERSION ||
    typeof marker.projectId !== "string" ||
    marker.projectId.length === 0 ||
    typeof marker.exportId !== "string" ||
    !/^[0-9a-f-]{36}$/iu.test(marker.exportId) ||
    typeof marker.executableName !== "string" ||
    !isCanonicalWindowsRuntimeRelativePath(marker.executableName) ||
    marker.executableName.includes("/") ||
    !marker.executableName.toLocaleLowerCase("en-US").endsWith(".exe") ||
    !Array.isArray(marker.files)
  ) {
    throw new Error("the Windows player ownership marker is invalid");
  }
  const files = marker.files.map(parseWindowsRuntimeFileRecord);
  assertWindowsRuntimeInventoryPaths(files);
  return { ...marker, files } as WindowsRuntimeOwnershipMarker;
}

function parseWindowsRuntimeFileRecord(input: unknown): WindowsRuntimeFileRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("the Windows player file inventory is invalid");
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "path" ||
    keys[1] !== "sha256" ||
    keys[2] !== "size" ||
    typeof record.path !== "string" ||
    !isCanonicalWindowsRuntimeRelativePath(record.path) ||
    typeof record.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(record.sha256) ||
    typeof record.size !== "number" ||
    !Number.isSafeInteger(record.size) ||
    record.size < 0
  ) {
    throw new Error("the Windows player file inventory is invalid");
  }
  return record as unknown as WindowsRuntimeFileRecord;
}

async function collectWindowsRuntimeFileInventory(
  rootIdentity: DirectoryIdentity,
  excludedRootFiles: ReadonlySet<string>
): Promise<WindowsRuntimeFileRecord[]> {
  await assertDirectoryIdentity(rootIdentity, "Windows player folder");
  const records: WindowsRuntimeFileRecord[] = [];
  const directories = new Set<string>();

  async function walk(directoryIdentity: DirectoryIdentity, relativeDirectory: string): Promise<void> {
    await assertDirectoryIdentity(rootIdentity, "Windows player folder");
    await assertDirectoryIdentity(directoryIdentity, "Windows player subfolder");
    const entries = (await readdir(directoryIdentity.path)).sort((left, right) => left.localeCompare(right));
    if (entries.length === 0 && relativeDirectory) {
      throw new Error(`unexpected empty Windows player directory: "${relativeDirectory}"`);
    }

    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry}` : entry;
      if (!isCanonicalWindowsRuntimeRelativePath(relativePath)) {
        throw new Error(`non-canonical Windows player path: "${relativePath}"`);
      }
      const absolutePath = path.join(directoryIdentity.path, entry);
      const entryStats = await lstat(absolutePath);
      if (entryStats.isSymbolicLink()) {
        throw new Error(`linked Windows player content is not allowed: "${relativePath}"`);
      }
      if (entryStats.isDirectory()) {
        directories.add(relativePath);
        await walk(
          await captureDirectoryIdentity(absolutePath, "Windows player subfolder"),
          relativePath
        );
        continue;
      }
      if (!entryStats.isFile()) {
        throw new Error(`unsupported Windows player content: "${relativePath}"`);
      }
      if (!relativeDirectory && excludedRootFiles.has(entry)) {
        continue;
      }
      records.push({ path: relativePath, ...(await hashWindowsRuntimeFile(absolutePath)) });
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
    throw new Error("the Windows player contains an unknown or empty directory");
  }
  records.sort((left, right) => left.path.localeCompare(right.path));
  assertWindowsRuntimeInventoryPaths(records);
  return records;
}

async function hashWindowsRuntimeFile(
  filePath: string
): Promise<Omit<WindowsRuntimeFileRecord, "path">> {
  const handle = await rawFilesystem.promises.open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`Windows player content is not a supported regular file: "${filePath}"`);
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < Number(before.size)) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.length, Number(before.size) - position),
        position
      );
      if (bytesRead === 0) break;
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
      throw new Error(`Windows player file changed while it was verified: "${filePath}"`);
    }
    return { sha256: hash.digest("hex"), size: position };
  } finally {
    await handle.close();
  }
}

function assertWindowsRuntimeInventoryPaths(records: WindowsRuntimeFileRecord[]): void {
  const caseFolded = new Set<string>();
  let previous = "";
  for (const record of records) {
    if (!isCanonicalWindowsRuntimeRelativePath(record.path)) {
      throw new Error(`non-canonical Windows player path: "${record.path}"`);
    }
    if (previous && previous.localeCompare(record.path) >= 0) {
      throw new Error("the Windows player inventory must be strictly sorted and unique");
    }
    previous = record.path;
    const folded = record.path.toLocaleLowerCase("en-US");
    if (caseFolded.has(folded)) {
      throw new Error("the Windows player inventory contains a Windows path collision");
    }
    caseFolded.add(folded);
  }
}

function isCanonicalWindowsRuntimeRelativePath(relativePath: string): boolean {
  if (!relativePath || relativePath.includes("\\") || path.posix.isAbsolute(relativePath)) {
    return false;
  }
  return relativePath.split("/").every(
    (segment) =>
      segment.length > 0 &&
      segment !== "." &&
      segment !== ".." &&
      !segment.endsWith(".") &&
      !segment.endsWith(" ") &&
      !/[<>:"|?*\u0000-\u001f]/u.test(segment)
  );
}

async function publishWindowsRuntimeDirectory(
  stagingIdentity: DirectoryIdentity,
  destinationDirectory: string,
  destinationParent: DirectoryIdentity,
  initialDestination: WindowsRuntimeDestinationSnapshot,
  projectId: string
): Promise<void> {
  await assertDirectoryIdentity(destinationParent, "export destination folder");
  await assertDirectoryIdentity(stagingIdentity, "Windows player staging folder");
  const currentDestination = await inspectWindowsRuntimeDestination(destinationDirectory, projectId);
  if (!sameWindowsRuntimeDestinationSnapshot(initialDestination, currentDestination)) {
    throw new Error(`Export stopped because the Windows player destination changed: "${destinationDirectory}".`);
  }

  if (initialDestination.kind === "missing") {
    await copyNewWindowsRuntimeDirectory(
      stagingIdentity,
      destinationDirectory,
      destinationParent,
      projectId
    );
    return;
  }

  const backupDirectory = path.join(
    destinationParent.path,
    `.mage2-windows-player-${randomUUID()}.backup`
  );
  await assertDirectChild(destinationParent, backupDirectory, "Windows player backup folder");
  let backupCreated = false;
  try {
    await retryTransientWindowsFilesystemOperation(
      () => rename(destinationDirectory, backupDirectory),
      {
        onRetry: async () => {
          await assertDirectoryIdentity(destinationParent, "export destination folder");
          const retryDestination = await inspectWindowsRuntimeDestination(
            destinationDirectory,
            projectId
          );
          if (!sameWindowsRuntimeDestinationSnapshot(initialDestination, retryDestination)) {
            throw new Error("The previous Windows player folder changed before it could be preserved.");
          }
        }
      }
    );
    backupCreated = true;
    const movedDestination = await inspectWindowsRuntimeDestination(backupDirectory, projectId);
    if (!sameWindowsRuntimeDestinationAfterMove(initialDestination, movedDestination)) {
      throw new Error("The previous Windows player folder changed while it was being preserved.");
    }
    await retryTransientWindowsFilesystemOperation(
      () => rename(stagingIdentity.path, destinationDirectory),
      {
        onRetry: async () => {
          await assertDirectoryIdentity(destinationParent, "export destination folder");
          await assertDirectoryIdentity(stagingIdentity, "Windows player staging folder");
          if ((await inspectWindowsRuntimeDestination(destinationDirectory, projectId)).kind !== "missing") {
            throw new Error("The Windows player destination changed before publication could be retried.");
          }
        }
      }
    );
  } catch (error) {
    if (backupCreated) {
      await retryTransientWindowsFilesystemOperation(
        () => rename(backupDirectory, destinationDirectory),
        {
          onRetry: async () => {
            await assertDirectoryIdentity(destinationParent, "export destination folder");
            const backupDestination = await inspectWindowsRuntimeDestination(
              backupDirectory,
              projectId
            );
            if (!sameWindowsRuntimeDestinationAfterMove(initialDestination, backupDestination)) {
              throw new Error("The preserved Windows player folder changed before rollback.");
            }
          }
        }
      ).catch((rollbackError) => {
        throw new Error(
          `MAGE2 could not publish the new Windows player or restore the previous one. ` +
            `The previous folder remains at "${backupDirectory}". ${errorMessage(rollbackError)}`,
          { cause: rollbackError }
        );
      });
    }
    throw error;
  }

  if (backupCreated) {
    await rm(backupDirectory, { recursive: true, force: true }).catch((error) => {
      console.warn(`MAGE2 preserved the previous Windows player at "${backupDirectory}":`, error);
    });
  }
}

async function copyNewWindowsRuntimeDirectory(
  stagingIdentity: DirectoryIdentity,
  destinationDirectory: string,
  destinationParent: DirectoryIdentity,
  projectId: string
): Promise<void> {
  await assertDirectoryIdentity(destinationParent, "export destination folder");
  await assertDirectoryIdentity(stagingIdentity, "Windows player staging folder");
  if ((await inspectWindowsRuntimeDestination(destinationDirectory, projectId)).kind !== "missing") {
    throw new Error("The Windows player destination changed before publication began.");
  }

  await mkdir(destinationDirectory);
  const destinationIdentity = await captureDirectoryIdentity(
    destinationDirectory,
    "Windows player destination"
  );
  if (!isStrictDescendant(destinationParent.canonicalPath, destinationIdentity.canonicalPath)) {
    throw new Error("The Windows player destination escaped the selected export folder.");
  }

  try {
    const markerText = await readFile(
      path.join(stagingIdentity.path, WINDOWS_RUNTIME_MARKER_FILE),
      "utf8"
    );
    const marker = parseWindowsRuntimeOwnershipMarker(JSON.parse(markerText));
    if (marker.projectId !== projectId) {
      throw new Error("The staged Windows player ownership marker belongs to another project.");
    }

    const directoryIdentities = new Map<string, DirectoryIdentity>([["", destinationIdentity]]);
    const relativeDirectories = new Set<string>();
    for (const record of marker.files) {
      const segments = record.path.split("/");
      for (let index = 1; index < segments.length; index += 1) {
        relativeDirectories.add(segments.slice(0, index).join("/"));
      }
    }
    const orderedDirectories = [...relativeDirectories].sort((left, right) => {
      const depthDifference = left.split("/").length - right.split("/").length;
      return depthDifference || left.localeCompare(right);
    });
    for (const relativeDirectory of orderedDirectories) {
      const parentRelative = relativeDirectory.includes("/")
        ? relativeDirectory.slice(0, relativeDirectory.lastIndexOf("/"))
        : "";
      const parentIdentity = directoryIdentities.get(parentRelative);
      if (!parentIdentity) {
        throw new Error(`Windows player publication lost parent directory "${parentRelative}".`);
      }
      await assertDirectoryIdentity(destinationIdentity, "Windows player destination");
      await assertDirectoryIdentity(parentIdentity, "Windows player destination subfolder");
      const childName = relativeDirectory.slice(parentRelative ? parentRelative.length + 1 : 0);
      const childPath = path.join(parentIdentity.path, childName);
      await mkdir(childPath);
      const childIdentity = await captureDirectoryIdentity(
        childPath,
        "Windows player destination subfolder"
      );
      if (!isStrictDescendant(destinationIdentity.canonicalPath, childIdentity.canonicalPath)) {
        throw new Error(`Windows player publication directory escaped: "${relativeDirectory}".`);
      }
      directoryIdentities.set(relativeDirectory, childIdentity);
    }

    for (const record of marker.files) {
      await assertDirectoryIdentity(stagingIdentity, "Windows player staging folder");
      await assertDirectoryIdentity(destinationIdentity, "Windows player destination");
      const segments = record.path.split("/");
      const fileName = segments.pop()!;
      const parentRelative = segments.join("/");
      const parentIdentity = directoryIdentities.get(parentRelative);
      if (!parentIdentity) {
        throw new Error(`Windows player publication lost destination directory "${parentRelative}".`);
      }
      await assertDirectoryIdentity(parentIdentity, "Windows player destination subfolder");
      const sourcePath = path.join(stagingIdentity.path, ...record.path.split("/"));
      const sourceStats = await lstat(sourcePath);
      if (sourceStats.isSymbolicLink() || !sourceStats.isFile()) {
        throw new Error(`Staged Windows player content is not a normal file: "${record.path}".`);
      }
      const destinationPath = path.join(parentIdentity.path, fileName);
      await copyWindowsRuntimeFileVerified(sourcePath, destinationPath, record);
    }

    await assertDirectoryIdentity(destinationIdentity, "Windows player destination");
    await copyFile(
      path.join(stagingIdentity.path, WINDOWS_RUNTIME_MARKER_FILE),
      path.join(destinationIdentity.path, WINDOWS_RUNTIME_MARKER_FILE),
      constants.COPYFILE_EXCL
    );
    await chmod(destinationIdentity.path, 0o755);
    const publishedDestination = await inspectWindowsRuntimeDestination(
      destinationDirectory,
      projectId
    );
    if (publishedDestination.kind !== "owned") {
      throw new Error("The published Windows player folder could not be verified.");
    }
  } catch (error) {
    await removeCreatedWindowsRuntimeDirectoryBestEffort(
      destinationIdentity,
      destinationParent
    );
    throw error;
  }
}

async function copyWindowsRuntimeFileVerified(
  sourcePath: string,
  destinationPath: string,
  expected: WindowsRuntimeFileRecord
): Promise<void> {
  // Electron's patched fs layer can try to parse a destination ending in
  // `.asar` while copyFile is still creating it. Copy under an opaque name,
  // verify the completed bytes, then use the same-directory rename pattern
  // already used when assembling the valid staged archive.
  const requiresOpaqueCopy = path.extname(destinationPath).toLocaleLowerCase("en-US") === ".asar";
  const copyDestination = requiresOpaqueCopy
    ? `${destinationPath}.mage2-copy-${randomUUID()}`
    : destinationPath;
  await rawFilesystem.promises.copyFile(sourcePath, copyDestination, constants.COPYFILE_EXCL);
  await assertWindowsRuntimeFileMatches(copyDestination, expected);
  if (requiresOpaqueCopy) {
    await rawFilesystem.promises.rename(copyDestination, destinationPath);
    await assertWindowsRuntimeFileMatches(destinationPath, expected);
  }
}

async function assertWindowsRuntimeFileMatches(
  filePath: string,
  expected: WindowsRuntimeFileRecord
): Promise<void> {
  const actual = await hashWindowsRuntimeFile(filePath);
  if (actual.sha256 !== expected.sha256 || actual.size !== expected.size) {
    throw new Error(`Published Windows player content did not match staging: "${expected.path}".`);
  }
}

async function removeCreatedWindowsRuntimeDirectoryBestEffort(
  directoryIdentity: DirectoryIdentity,
  destinationParent: DirectoryIdentity
): Promise<void> {
  try {
    await removeVerifiedWindowsRuntimeDirectoryTree(
      directoryIdentity,
      directoryIdentity,
      destinationParent
    );
  } catch (error) {
    console.warn(
      `MAGE2 left an identity-protected partial Windows player folder at "${directoryIdentity.path}":`,
      error
    );
  }
}

async function removeVerifiedWindowsRuntimeDirectoryTree(
  directoryIdentity: DirectoryIdentity,
  rootIdentity: DirectoryIdentity,
  destinationParent: DirectoryIdentity
): Promise<void> {
  await assertDirectoryIdentity(destinationParent, "export destination folder");
  await assertDirectoryIdentity(rootIdentity, "partial Windows player folder");
  await assertDirectoryIdentity(directoryIdentity, "partial Windows player subfolder");
  for (const entry of await readdir(directoryIdentity.path)) {
    const entryPath = path.join(directoryIdentity.path, entry);
    const entryStats = await lstat(entryPath);
    if (entryStats.isDirectory() && !entryStats.isSymbolicLink()) {
      await removeVerifiedWindowsRuntimeDirectoryTree(
        await captureDirectoryIdentity(entryPath, "partial Windows player subfolder"),
        rootIdentity,
        destinationParent
      );
      continue;
    }
    if (!entryStats.isFile() && !entryStats.isSymbolicLink()) {
      throw new Error(`Partial Windows player contains an unsupported entry: "${entryPath}".`);
    }
    await assertDirectoryIdentity(destinationParent, "export destination folder");
    await assertDirectoryIdentity(rootIdentity, "partial Windows player folder");
    await assertDirectoryIdentity(directoryIdentity, "partial Windows player subfolder");
    await unlink(entryPath);
  }
  await assertDirectoryIdentity(destinationParent, "export destination folder");
  await assertDirectoryIdentity(rootIdentity, "partial Windows player folder");
  await assertDirectoryIdentity(directoryIdentity, "partial Windows player subfolder");
  if ((await readdir(directoryIdentity.path)).length !== 0) {
    throw new Error("Partial Windows player folder changed during cleanup.");
  }
  await rmdir(directoryIdentity.path);
}

function sameWindowsRuntimeDestinationSnapshot(
  left: WindowsRuntimeDestinationSnapshot,
  right: WindowsRuntimeDestinationSnapshot
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "missing") return true;
  if (right.kind === "missing" || !sameDirectoryObject(left.identity, right.identity, true)) return false;
  return left.kind !== "owned" || (right.kind === "owned" && left.fingerprint === right.fingerprint);
}

function sameWindowsRuntimeDestinationAfterMove(
  left: Exclude<WindowsRuntimeDestinationSnapshot, { kind: "missing" }>,
  right: WindowsRuntimeDestinationSnapshot
): boolean {
  if (left.kind !== right.kind) return false;
  if (!sameDirectoryObject(left.identity, right.identity, false)) return false;
  return left.kind !== "owned" || (right.kind === "owned" && left.fingerprint === right.fingerprint);
}

function sameDirectoryObject(left: DirectoryIdentity, right: DirectoryIdentity, comparePath: boolean): boolean {
  return (
    (!comparePath || normalizeIdentityPath(left.canonicalPath) === normalizeIdentityPath(right.canonicalPath)) &&
    filesystemObjectIdentityChangedFields(left, right).length === 0
  );
}

async function captureDirectoryIdentity(inputPath: string, label: string): Promise<DirectoryIdentity> {
  const resolvedPath = path.resolve(inputPath);
  const stats = await lstat(resolvedPath, { bigint: true });
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} is not a normal directory: "${resolvedPath}".`);
  }
  const objectIdentity = filesystemObjectIdentityFromStats(stats, label);
  return {
    path: resolvedPath,
    canonicalPath: await realpath(resolvedPath),
    ...objectIdentity
  };
}

async function assertDirectoryIdentity(identity: DirectoryIdentity, label: string): Promise<void> {
  const current = await captureDirectoryIdentity(identity.path, label);
  const changedFields = [
    normalizeIdentityPath(current.canonicalPath) !== normalizeIdentityPath(identity.canonicalPath) && "path",
    ...filesystemObjectIdentityChangedFields(current, identity)
  ].filter((field): field is string => Boolean(field));
  if (changedFields.length > 0) {
    throw new Error(
      `Export stopped because the ${label} changed during packaging (${changedFields.join(", ")}).`
    );
  }
}

async function assertDirectChild(parent: DirectoryIdentity, candidatePath: string, label: string): Promise<void> {
  await assertDirectoryIdentity(parent, "export destination folder");
  const resolvedCandidate = path.resolve(candidatePath);
  if (normalizeIdentityPath(path.dirname(resolvedCandidate)) !== normalizeIdentityPath(parent.path)) {
    throw new Error(`${label} must be a direct child of the selected destination folder.`);
  }
  const canonicalCandidate = path.resolve(parent.canonicalPath, path.basename(resolvedCandidate));
  if (!isStrictDescendant(parent.canonicalPath, canonicalCandidate)) {
    throw new Error(`${label} escapes the selected destination folder.`);
  }
}

function normalizeIdentityPath(inputPath: string): string {
  const normalized = path.normalize(inputPath);
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
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

function isMissingPathError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  copyFile,
  cp,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProjectBundle } from "@mage2/schema";
import { exportProjectBundle, type ExportResult } from "./exporter";

export type RuntimeExportFormat = "windows" | "web";

export type RuntimeExportProgressPhase =
  | "preparing"
  | "building-web"
  | "assembling-player"
  | "compressing"
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

export type PortableWindowsRuntimeProgress = Omit<RuntimeExportProgress, "format" | "elapsedSeconds">;
export type PortableWindowsRuntimeProgressHandler = (progress: PortableWindowsRuntimeProgress) => void;

export interface RuntimeExportRequest {
  format: RuntimeExportFormat;
  /** Trusted automation-only override. Normal exports obtain this path from Electron's native dialog. */
  destinationPath?: string;
}

export interface RuntimeArtifactExportResult extends ExportResult {
  format: RuntimeExportFormat;
  outputPath: string;
}

export interface WindowsRuntimePackagingResources {
  runtimeTemplateDirectory: string;
  nsisDirectory: string;
  iconPath?: string;
}

export interface PortableCompilationOptions {
  nsisDirectory: string;
  outputFile: string;
  payloadDirectory: string;
  scriptPath: string;
  script: string;
}

export interface CreatePortableWindowsRuntimeOptions {
  buildDirectory: string;
  destinationFile: string;
  project: ProjectBundle;
  resources: WindowsRuntimePackagingResources;
  compilePortableExecutable?: (options: PortableCompilationOptions) => Promise<void>;
  onProgress?: PortableWindowsRuntimeProgressHandler;
}

interface DirectoryIdentity {
  path: string;
  canonicalPath: string;
  dev: string;
  ino: string;
  birthtimeNs: string;
}

type FileSnapshot =
  | { kind: "missing" }
  | {
      kind: "file";
      dev: string;
      ino: string;
      birthtimeNs: string;
      mtimeNs: string;
      size: string;
    };

const PORTABLE_INNER_EXECUTABLE = "MAGE2 Player.exe";
const BUNDLED_RUNTIME_APP_ARCHIVE = "app.mage2asar";
const MAX_PORTABLE_EXECUTABLE_BYTES = 1_900_000_000;
const PORTABLE_COMPRESSION_BYTES_PER_SECOND = 2.6 * 1024 * 1024;
const PORTABLE_COMPRESSION_BASE_SECONDS = 8;
const PORTABLE_COMPRESSION_PROGRESS_START = 0.38;
const PORTABLE_COMPRESSION_PROGRESS_END = 0.94;

export async function exportRuntimeArtifact(options: {
  projectDir: string;
  project: ProjectBundle;
  request: RuntimeExportRequest;
  windowsResources?: WindowsRuntimePackagingResources;
  onProgress?: RuntimeExportProgressHandler;
}): Promise<RuntimeArtifactExportResult> {
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
    throw new Error("Standalone Windows exports can only be created by the Windows editor.");
  }
  if (!options.windowsResources) {
    throw new Error("The packaged Windows runtime resources are unavailable.");
  }

  // Keep the project-local web build as the canonical, inspectable source of
  // the portable executable. The selected destination is not touched until
  // that build and the portable payload have both completed successfully.
  const result = await exportProjectBundle(options.projectDir, options.project, {
    onProgress: (bundleProgress) => {
      reportProgress({
        phase: "building-web",
        progress: 0.03 + bundleProgress.progress * 0.2
      });
    }
  });
  const outputPath = await createPortableWindowsRuntime({
    buildDirectory: result.outputDirectory,
    destinationFile: destinationPath,
    project: options.project,
    resources: options.windowsResources,
    onProgress: reportProgress
  });
  return { ...result, format: "windows", outputPath };
}

export async function createPortableWindowsRuntime(
  options: CreatePortableWindowsRuntimeOptions
): Promise<string> {
  const destinationFile = path.resolve(options.destinationFile);
  if (path.extname(destinationFile).toLocaleLowerCase("en-US") !== ".exe") {
    throw new Error(`Windows runtime destination must end in .exe: "${destinationFile}".`);
  }

  const destinationParent = await captureDirectoryIdentity(path.dirname(destinationFile), "export destination folder");
  await assertDirectChild(destinationParent, destinationFile, "Windows runtime destination");
  const initialDestination = await inspectDestinationFile(destinationFile);

  const runtimeTemplateDirectory = await assertRuntimeTemplate(options.resources.runtimeTemplateDirectory);
  const nsisDirectory = await assertNsisDirectory(options.resources.nsisDirectory);
  const workDirectory = await mkdtemp(path.join(os.tmpdir(), "mage2-portable-runtime-"));
  const payloadDirectory = path.join(workDirectory, "payload");
  const compiledExecutable = path.join(workDirectory, "portable.exe");
  const scriptPath = path.join(workDirectory, "portable.nsi");

  try {
    emitPortableProgress(options.onProgress, {
      phase: "assembling-player",
      progress: 0.24
    });
    await cp(runtimeTemplateDirectory, payloadDirectory, {
      recursive: true,
      force: false,
      errorOnExist: true
    });
    await rename(
      path.join(payloadDirectory, "resources", BUNDLED_RUNTIME_APP_ARCHIVE),
      path.join(payloadDirectory, "resources", "app.asar")
    );
    const playerDirectory = path.join(payloadDirectory, "resources", "player");
    await cp(path.resolve(options.buildDirectory), playerDirectory, {
      recursive: true,
      force: false,
      errorOnExist: true
    });
    await copyCreatorIconIfConfigured(options.buildDirectory, payloadDirectory);

    const payloadBytes = await measureRegularDirectoryBytes(payloadDirectory);
    const estimatedCompressionSeconds = estimatePortableCompressionSeconds(payloadBytes);

    const script = createPortableNsisScript({
      iconPath: options.resources.iconPath,
      outputFile: compiledExecutable,
      payloadDirectory,
      productName: `${options.project.manifest.projectName} Player`,
      version: options.project.manifest.gameVersion
    });
    await writeFile(scriptPath, script, { encoding: "utf8", flag: "wx" });

    const compile = options.compilePortableExecutable ?? compilePortableWithNsis;
    const compressionStartedAt = Date.now();
    const reportCompression = () => {
      const elapsedSeconds = Math.max(0, (Date.now() - compressionStartedAt) / 1000);
      const remainingSeconds = Math.ceil(estimatedCompressionSeconds - elapsedSeconds);
      emitPortableProgress(options.onProgress, {
        phase: "compressing",
        progress: resolvePortableCompressionProgress(elapsedSeconds, estimatedCompressionSeconds),
        estimatedSecondsRemaining: remainingSeconds > 0 ? remainingSeconds : undefined,
        payloadBytes
      });
    };
    reportCompression();
    const compressionTimer = setInterval(reportCompression, 1_000);
    try {
      await compile({
        nsisDirectory,
        outputFile: compiledExecutable,
        payloadDirectory,
        scriptPath,
        script
      });
    } finally {
      clearInterval(compressionTimer);
    }

    const compiledStats = await lstat(compiledExecutable, { bigint: true });
    if (compiledStats.isSymbolicLink() || !compiledStats.isFile()) {
      throw new Error("Windows runtime packaging did not create a normal executable file.");
    }
    if (compiledStats.size <= 0n) {
      throw new Error("Windows runtime packaging created an empty executable file.");
    }
    if (compiledStats.size > BigInt(MAX_PORTABLE_EXECUTABLE_BYTES)) {
      throw new Error(
        "The standalone Windows executable is too large for the portable container. Export a web build or reduce the packaged media size."
      );
    }

    emitPortableProgress(options.onProgress, {
      phase: "publishing",
      progress: 0.97,
      estimatedSecondsRemaining: 2,
      payloadBytes
    });
    await publishPortableExecutable(
      compiledExecutable,
      destinationFile,
      destinationParent,
      initialDestination
    );
    emitPortableProgress(options.onProgress, {
      phase: "complete",
      progress: 1,
      estimatedSecondsRemaining: 0,
      payloadBytes
    });
    return destinationFile;
  } finally {
    await rm(workDirectory, { recursive: true, force: true }).catch((error) => {
      console.warn(`MAGE2 could not remove temporary Windows export files at "${workDirectory}":`, error);
    });
  }
}

export function estimatePortableCompressionSeconds(payloadBytes: number): number {
  const normalizedBytes = Number.isFinite(payloadBytes) ? Math.max(0, payloadBytes) : 0;
  return Math.min(
    15 * 60,
    Math.max(
      PORTABLE_COMPRESSION_BASE_SECONDS,
      Math.ceil(PORTABLE_COMPRESSION_BASE_SECONDS + normalizedBytes / PORTABLE_COMPRESSION_BYTES_PER_SECOND)
    )
  );
}

export function resolvePortableCompressionProgress(
  elapsedSeconds: number,
  estimatedCompressionSeconds: number
): number {
  const normalizedElapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const normalizedEstimate = Number.isFinite(estimatedCompressionSeconds)
    ? Math.max(1, estimatedCompressionSeconds)
    : PORTABLE_COMPRESSION_BASE_SECONDS;
  const ratio = normalizedElapsed / normalizedEstimate;
  const easedAtEstimate = 1 - Math.exp(-2.5);
  const eased = (1 - Math.exp(-2.5 * ratio)) / easedAtEstimate;
  const capped = Math.min(0.985, Math.max(0, eased));
  return PORTABLE_COMPRESSION_PROGRESS_START +
    (PORTABLE_COMPRESSION_PROGRESS_END - PORTABLE_COMPRESSION_PROGRESS_START) * capped;
}

function createRuntimeExportProgressReporter(
  format: RuntimeExportFormat,
  handler: RuntimeExportProgressHandler | undefined
): PortableWindowsRuntimeProgressHandler {
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

function emitPortableProgress(
  handler: PortableWindowsRuntimeProgressHandler | undefined,
  progress: PortableWindowsRuntimeProgress
): void {
  if (!handler) {
    return;
  }
  try {
    handler(progress);
  } catch (error) {
    console.warn("MAGE2 portable export progress listener failed:", error);
  }
}

async function measureRegularDirectoryBytes(rootDirectory: string): Promise<number> {
  let totalBytes = 0;

  async function walk(directory: string): Promise<void> {
    const directoryStats = await lstat(directory);
    if (directoryStats.isSymbolicLink() || !directoryStats.isDirectory()) {
      throw new Error(`Windows runtime payload contains an unsafe directory: "${directory}".`);
    }

    for (const entry of await readdir(directory)) {
      const entryPath = path.join(directory, entry);
      const stats = await lstat(entryPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`Windows runtime payload contains a linked path: "${entryPath}".`);
      }
      if (stats.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (!stats.isFile()) {
        throw new Error(`Windows runtime payload contains unsupported content: "${entryPath}".`);
      }
      totalBytes += stats.size;
      if (!Number.isSafeInteger(totalBytes)) {
        throw new Error("Windows runtime payload is too large to estimate safely.");
      }
    }
  }

  await walk(path.resolve(rootDirectory));
  return totalBytes;
}

export function createPortableNsisScript(options: {
  iconPath?: string;
  outputFile: string;
  payloadDirectory: string;
  productName: string;
  version: string;
}): string {
  const productName = escapeNsisString(options.productName);
  const payloadGlob = escapeNsisString(path.join(options.payloadDirectory, "*"));
  const outputFile = escapeNsisString(options.outputFile);
  const iconDirective = options.iconPath
    ? `Icon "${escapeNsisString(path.resolve(options.iconPath))}"\n`
    : "";

  return [
    "Unicode true",
    '!include "FileFunc.nsh"',
    "RequestExecutionLevel user",
    "SilentInstall silent",
    "AutoCloseWindow true",
    "CRCCheck on",
    "SetDatablockOptimize on",
    "SetCompressor /SOLID lzma",
    `Name "${productName}"`,
    `OutFile "${outputFile}"`,
    iconDirective.trimEnd(),
    `VIProductVersion "${resolveNsisProductVersion(options.version)}"`,
    `VIAddVersionKey /LANG=1033 "ProductName" "${productName}"`,
    `VIAddVersionKey /LANG=1033 "FileDescription" "Portable ${productName}"`,
    `VIAddVersionKey /LANG=1033 "FileVersion" "${escapeNsisString(options.version)}"`,
    "Section",
    "  InitPluginsDir",
    '  SetOutPath "$PLUGINSDIR\\app"',
    `  File /r "${payloadGlob}"`,
    '  ${GetParameters} $R0',
    `  ExecWait '"$PLUGINSDIR\\app\\${PORTABLE_INNER_EXECUTABLE}" $R0' $0`,
    "  SetErrorLevel $0",
    "SectionEnd",
    ""
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

export function sanitizeRuntimeArtifactName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  return sanitized || "MAGE2 Game";
}

export function suggestedRuntimeArtifactName(projectName: string, format: RuntimeExportFormat): string {
  const baseName = sanitizeRuntimeArtifactName(projectName);
  return format === "windows" ? `${baseName} Player.exe` : `${baseName} Web`;
}

async function assertRuntimeTemplate(inputPath: string): Promise<string> {
  const identity = await captureDirectoryIdentity(inputPath, "bundled Windows runtime template");
  const executablePath = path.join(identity.path, PORTABLE_INNER_EXECUTABLE);
  const executableStats = await lstat(executablePath);
  if (executableStats.isSymbolicLink() || !executableStats.isFile()) {
    throw new Error(`Bundled Windows runtime template is missing ${PORTABLE_INNER_EXECUTABLE}.`);
  }
  const appArchiveStats = await lstat(
    path.join(identity.path, "resources", BUNDLED_RUNTIME_APP_ARCHIVE)
  );
  if (appArchiveStats.isSymbolicLink() || !appArchiveStats.isFile()) {
    throw new Error(
      `Bundled Windows runtime template is missing resources/${BUNDLED_RUNTIME_APP_ARCHIVE}.`
    );
  }
  return identity.path;
}

async function assertNsisDirectory(inputPath: string): Promise<string> {
  const identity = await captureDirectoryIdentity(inputPath, "bundled Windows packaging tools");
  for (const requiredPath of ["makensis.exe", "Include", "Stubs"]) {
    const requiredStats = await lstat(path.join(identity.path, requiredPath));
    if (requiredStats.isSymbolicLink()) {
      throw new Error(`Bundled Windows packaging tool path is linked: ${requiredPath}.`);
    }
    if (requiredPath.endsWith(".exe") ? !requiredStats.isFile() : !requiredStats.isDirectory()) {
      throw new Error(`Bundled Windows packaging tools are missing ${requiredPath}.`);
    }
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
  await copyFile(sourcePath, path.join(payloadDirectory, "resources", "creator-icon.png"), constants.COPYFILE_EXCL);
}

async function compilePortableWithNsis(options: PortableCompilationOptions): Promise<void> {
  const makensisPath = path.join(options.nsisDirectory, "makensis.exe");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(makensisPath, ["/V2", options.scriptPath], {
      cwd: options.nsisDirectory,
      env: { ...process.env, NSISDIR: options.nsisDirectory },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = appendBoundedOutput(stdout, String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBoundedOutput(stderr, String(chunk));
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Windows runtime packaging failed with exit code ${code ?? "unknown"}. ${stderr.trim() || stdout.trim()}`
        )
      );
    });
  });
}

async function publishPortableExecutable(
  compiledExecutable: string,
  destinationFile: string,
  destinationParent: DirectoryIdentity,
  initialDestination: FileSnapshot
): Promise<void> {
  await assertDirectoryIdentity(destinationParent, "export destination folder");
  const currentDestination = await inspectDestinationFile(destinationFile);
  if (!sameFileSnapshot(initialDestination, currentDestination)) {
    throw new Error(`Export stopped because the selected destination changed: "${destinationFile}".`);
  }

  const stagingFile = path.join(destinationParent.path, `.mage2-portable-${randomUUID()}.tmp`);
  const backupFile = path.join(destinationParent.path, `.mage2-portable-${randomUUID()}.backup`);
  await assertDirectChild(destinationParent, stagingFile, "portable export staging file");
  await copyFile(compiledExecutable, stagingFile, constants.COPYFILE_EXCL);
  let backupCreated = false;

  try {
    await assertDirectoryIdentity(destinationParent, "export destination folder");
    if (!sameFileSnapshot(initialDestination, await inspectDestinationFile(destinationFile))) {
      throw new Error(`Export stopped because the selected destination changed: "${destinationFile}".`);
    }

    if (initialDestination.kind === "file") {
      await assertDirectChild(destinationParent, backupFile, "portable export backup file");
      await rename(destinationFile, backupFile);
      backupCreated = true;
      const movedSnapshot = await inspectDestinationFile(backupFile);
      if (!sameFileSnapshot(initialDestination, movedSnapshot)) {
        throw new Error("The previous executable changed while it was being preserved.");
      }
    }

    await rename(stagingFile, destinationFile);
  } catch (error) {
    if (backupCreated) {
      await rename(backupFile, destinationFile).catch((rollbackError) => {
        throw new Error(
          `MAGE2 could not publish the new executable or restore the previous one. The previous file remains at "${backupFile}". ${errorMessage(rollbackError)}`,
          { cause: rollbackError }
        );
      });
    }
    throw error;
  } finally {
    await unlink(stagingFile).catch((error) => {
      if (!isMissingPathError(error)) {
        console.warn(`MAGE2 left a temporary export file at "${stagingFile}":`, error);
      }
    });
  }

  if (backupCreated) {
    await unlink(backupFile).catch((error) => {
      console.warn(`MAGE2 preserved the previous executable at "${backupFile}":`, error);
    });
  }
}

async function captureDirectoryIdentity(inputPath: string, label: string): Promise<DirectoryIdentity> {
  const resolvedPath = path.resolve(inputPath);
  const stats = await lstat(resolvedPath, { bigint: true });
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} is not a normal directory: "${resolvedPath}".`);
  }
  return {
    path: resolvedPath,
    canonicalPath: await realpath(resolvedPath),
    dev: stats.dev.toString(),
    ino: stats.ino.toString(),
    birthtimeNs: stats.birthtimeNs.toString()
  };
}

async function assertDirectoryIdentity(identity: DirectoryIdentity, label: string): Promise<void> {
  const current = await captureDirectoryIdentity(identity.path, label);
  if (
    normalizeIdentityPath(current.canonicalPath) !== normalizeIdentityPath(identity.canonicalPath) ||
    current.dev !== identity.dev ||
    current.ino !== identity.ino ||
    current.birthtimeNs !== identity.birthtimeNs
  ) {
    throw new Error(`Export stopped because the ${label} changed during packaging.`);
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

async function inspectDestinationFile(inputPath: string): Promise<FileSnapshot> {
  try {
    const stats = await lstat(inputPath, { bigint: true });
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(`Export destination is not a normal file: "${inputPath}".`);
    }
    return {
      kind: "file",
      dev: stats.dev.toString(),
      ino: stats.ino.toString(),
      birthtimeNs: stats.birthtimeNs.toString(),
      mtimeNs: stats.mtimeNs.toString(),
      size: stats.size.toString()
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return { kind: "missing" };
    }
    throw error;
  }
}

function sameFileSnapshot(left: FileSnapshot, right: FileSnapshot): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  return (
    left.kind === "missing" ||
    (right.kind === "file" &&
      left.dev === right.dev &&
      left.ino === right.ino &&
      left.birthtimeNs === right.birthtimeNs &&
      left.mtimeNs === right.mtimeNs &&
      left.size === right.size)
  );
}

function resolveNsisProductVersion(value: string): string {
  const numericParts = value
    .split(/[.+-]/)
    .slice(0, 4)
    .map((part) => {
      const parsed = Number.parseInt(part, 10);
      return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, 65_535) : 0;
    });
  while (numericParts.length < 4) {
    numericParts.push(0);
  }
  return numericParts.join(".");
}

function escapeNsisString(value: string): string {
  return value
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\$/g, "$$$$")
    .replace(/"/g, '$\\"');
}

function appendBoundedOutput(current: string, next: string): string {
  const combined = current + next;
  return combined.length <= 32_000 ? combined : combined.slice(combined.length - 32_000);
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

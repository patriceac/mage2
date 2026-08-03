import { constants, existsSync } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { computeFileSha256, generateProxy } from "@mage2/media";
import {
  createDefaultProjectBundle,
  STARTER_RESPONSE_LIBRARY_VERSION,
  resolveAssetVariant,
  parseProjectBundle,
  type Asset,
  type AssetVariant,
  type ProjectBundle
} from "@mage2/schema";

const FILES = {
  manifest: "project.json",
  assets: "assets.json",
  locations: "locations.json",
  scenes: "scenes.json",
  dialogues: "dialogues.json",
  inventory: "inventory.json",
  strings: "strings.json"
} as const;

const STARTER_SCENE_ASSET_NAME = "starter-scene.png";
const PROJECT_SAVE_TRANSACTION_DIRECTORY = ".project-save-transaction";
const PROJECT_SAVE_JOURNAL_FILE = "journal.json";

type ProjectFileKey = keyof typeof FILES;
type ProjectFileName = (typeof FILES)[ProjectFileKey];

interface ProjectSaveJournal {
  version: 1;
  files: Array<{
    fileName: ProjectFileName;
    existed: boolean;
  }>;
}

interface AtomicReplaceContext {
  operation: "commit" | "rollback";
  projectDir: string;
  fileName: ProjectFileName;
  index: number;
}

interface CreatePublishContext {
  kind: "directory" | "file";
  projectDir: string;
  relativePath: string;
}

interface ContainedMutationContext {
  kind: "mkdir" | "write" | "rename" | "unlink" | "rmdir";
  projectDir: string;
  path: string;
  destinationPath?: string;
}

interface ProjectIoTestHooks {
  beforeAtomicReplace?: (context: AtomicReplaceContext) => void | Promise<void>;
  beforeCreateFinalCheck?: (projectDir: string) => void | Promise<void>;
  beforeCreatePublish?: (context: CreatePublishContext) => void | Promise<void>;
  beforeContainedMutation?: (context: ContainedMutationContext) => void | Promise<void>;
}

/** Test-only fault-injection seams for transaction and creation race coverage. */
export const __projectIoTestHooks: ProjectIoTestHooks = {};

const projectDirectoryOperations = new Map<string, Promise<void>>();

interface ProjectDirectoryIdentity {
  requestedRoot: string;
  key: string;
  physicalRoot?: string;
}

interface ProjectPhysicalBoundary {
  requestedRoot: string;
  physicalRoot: string;
  key: string;
}

interface CreatedEntry {
  path: string;
  kind: "directory" | "file";
  device: number;
  inode: number;
  birthtimeMs: number;
}

export interface ProjectDirectoryInspection {
  isProjectDirectory: boolean;
  projectName?: string;
  reason?: string;
}

export async function loadProjectFromDirectory(projectDir: string): Promise<ProjectBundle> {
  return withProjectDirectoryOperation(projectDir, async (identity) => {
    const boundary = await requireProjectPhysicalBoundary(projectDir, identity.key);
    await recoverPendingProjectSave(boundary);
    const filePaths = resolveProjectFilePaths(boundary.requestedRoot);
    await access(filePaths.manifest);

    const project = await readProjectBundle(filePaths);
    const migratedProject = (await needsStarterResponseMigration(filePaths.dialogues))
      ? await saveProjectTransaction(boundary, project)
      : project;
    await assertProjectAssetPathsContained(boundary, migratedProject);
    return ensureProjectAssetPreviews(boundary, migratedProject);
  });
}

export async function inspectProjectDirectory(projectDir: string): Promise<ProjectDirectoryInspection> {
  return withProjectDirectoryOperation(projectDir, async (identity) => {
    let boundary: ProjectPhysicalBoundary;
    try {
      boundary = await requireProjectPhysicalBoundary(projectDir, identity.key);
      await recoverPendingProjectSave(boundary);
    } catch (error) {
      return {
        isProjectDirectory: false,
        reason: `A pending project save could not be recovered: ${formatError(error)}`
      };
    }

    const filePaths = resolveProjectFilePaths(boundary.requestedRoot);
    const requiredFileEntries = Object.values(filePaths);

    try {
      await Promise.all(requiredFileEntries.map((filePath) => access(filePath)));
    } catch {
      return {
        isProjectDirectory: false,
        reason: "This folder is missing one or more required MAGE2 project files."
      };
    }

    try {
      const project = await readProjectBundle(filePaths);
      return {
        isProjectDirectory: true,
        projectName: project.manifest.projectName
      };
    } catch (error) {
      return {
        isProjectDirectory: false,
        reason: `Project files were found, but they could not be loaded: ${formatError(error)}`
      };
    }
  });
}

export async function createProjectInDirectory(
  projectDir: string,
  projectName: string
): Promise<ProjectBundle> {
  return withProjectDirectoryOperation(projectDir, (identity) =>
    createProjectExclusively(projectDir, projectName, identity.key)
  );
}

export async function saveProjectToDirectory(
  projectDir: string,
  project: ProjectBundle
): Promise<ProjectBundle> {
  return withProjectDirectoryOperation(projectDir, async (identity) => {
    const boundary = await requireProjectPhysicalBoundary(projectDir, identity.key);
    await recoverPendingProjectSave(boundary);
    return saveProjectTransaction(boundary, project);
  });
}

async function readProjectBundle(
  filePaths: Record<ProjectFileKey, string>
): Promise<ProjectBundle> {
  const rawBundle = {
    manifest: await readJson(filePaths.manifest),
    assets: await readJson(filePaths.assets),
    locations: await readJson(filePaths.locations),
    scenes: await readJson(filePaths.scenes),
    dialogues: await readJson(filePaths.dialogues),
    inventory: await readJson(filePaths.inventory),
    strings: await readJson(filePaths.strings)
  };

  return parseProjectBundle(rawBundle);
}

async function needsStarterResponseMigration(dialoguesPath: string): Promise<boolean> {
  const rawDialogues = await readJson(dialoguesPath);
  if (!rawDialogues || typeof rawDialogues !== "object" || Array.isArray(rawDialogues)) {
    return true;
  }

  const version = (rawDialogues as Record<string, unknown>).starterResponsesVersion;
  return typeof version !== "number" || version < STARTER_RESPONSE_LIBRARY_VERSION;
}

async function saveProjectTransaction(
  boundary: ProjectPhysicalBoundary,
  project: ProjectBundle
): Promise<ProjectBundle> {
  const projectDir = boundary.requestedRoot;
  const normalized = parseProjectBundle(project);
  await assertProjectAssetPathsContained(boundary, normalized);
  const filePaths = resolveProjectFilePaths(projectDir);
  const transactionPaths = resolveProjectTransactionPaths(projectDir);
  const values: Record<ProjectFileKey, unknown> = {
    manifest: normalized.manifest,
    assets: normalized.assets,
    locations: normalized.locations,
    scenes: normalized.scenes,
    dialogues: normalized.dialogues,
    inventory: normalized.inventory,
    strings: normalized.strings
  };

  await ensureContainedDirectory(boundary, path.join(projectDir, ".mage2"));
  await removeTransactionArtifacts(boundary, transactionPaths.root);
  await createContainedDirectory(boundary, transactionPaths.root);
  await createContainedDirectory(boundary, transactionPaths.staged);
  await createContainedDirectory(boundary, transactionPaths.backup);

  let journalPublished = false;

  try {
    for (const [key, fileName] of projectFileEntries()) {
      await writeContainedJson(
        boundary,
        path.join(transactionPaths.staged, fileName),
        values[key]
      );
    }

    const journal: ProjectSaveJournal = {
      version: 1,
      files: []
    };

    for (const [, fileName] of projectFileEntries()) {
      const targetPath = path.join(projectDir, fileName);
      const backupPath = path.join(transactionPaths.backup, fileName);
      const priorContents = await readContainedFileIfPresent(boundary, targetPath);

      if (priorContents === undefined) {
        journal.files.push({ fileName, existed: false });
        continue;
      }

      await writeContainedFile(boundary, backupPath, priorContents);
      journal.files.push({ fileName, existed: true });
    }

    await writeContainedJson(boundary, transactionPaths.journalTemporary, journal);
    await renameContainedPath(
      boundary,
      transactionPaths.journalTemporary,
      transactionPaths.journal
    );
    journalPublished = true;

    for (const [index, [, fileName]] of projectFileEntries().entries()) {
      await atomicReplaceProjectFile(
        boundary,
        path.join(transactionPaths.staged, fileName),
        path.join(projectDir, fileName),
        {
          operation: "commit",
          projectDir,
          fileName,
          index
        }
      );
    }

    await unlinkContainedFile(boundary, transactionPaths.journal);
    journalPublished = false;
  } catch (saveError) {
    if (journalPublished) {
      try {
        await recoverPendingProjectSave(boundary);
      } catch (rollbackError) {
        throw new AggregateError(
          [saveError, rollbackError],
          "Project save failed and its automatic rollback could not complete. Recovery will be retried before the next project operation."
        );
      }
    } else {
      await removeTransactionArtifactsBestEffort(boundary, transactionPaths.root);
    }

    throw saveError;
  }

  await removeTransactionArtifactsBestEffort(boundary, transactionPaths.root);
  return normalized;
}

async function recoverPendingProjectSave(boundary: ProjectPhysicalBoundary): Promise<void> {
  const projectDir = boundary.requestedRoot;
  const transactionPaths = resolveProjectTransactionPaths(projectDir);
  await assertOptionalContainedDirectory(boundary, path.join(projectDir, ".mage2"));

  if (!(await containedPathExists(boundary, transactionPaths.journal))) {
    await removeTransactionArtifacts(boundary, transactionPaths.root);
    return;
  }

  const journal = parseProjectSaveJournal(
    await readContainedJson(boundary, transactionPaths.journal)
  );
  await assertContainedDirectory(boundary, transactionPaths.root);
  // A previous recovery attempt may have stopped after writing one or more .restore files.
  // The published journal and immutable backup snapshot remain the commit boundary, so only
  // the physically-contained scratch restore subtree is safe to discard and rebuild.
  await removeTransactionArtifacts(boundary, transactionPaths.restore);
  await createContainedDirectory(boundary, transactionPaths.restore);
  const backupContents = new Map<ProjectFileName, Buffer>();

  for (const entry of journal.files) {
    if (entry.existed) {
      backupContents.set(
        entry.fileName,
        await readContainedFile(
          boundary,
          path.join(transactionPaths.backup, entry.fileName)
        )
      );
    }
  }

  for (const [index, entry] of journal.files.entries()) {
    const targetPath = path.join(projectDir, entry.fileName);

    if (!entry.existed) {
      await removeContainedFileIfPresent(boundary, targetPath);
      continue;
    }

    const restorePath = path.join(transactionPaths.restore, `${entry.fileName}.restore`);
    const priorContents = backupContents.get(entry.fileName);
    if (!priorContents) {
      throw new Error(`The pending project save snapshot is missing ${entry.fileName}.`);
    }
    await writeContainedFile(boundary, restorePath, priorContents);
    await atomicReplaceProjectFile(boundary, restorePath, targetPath, {
      operation: "rollback",
      projectDir,
      fileName: entry.fileName,
      index
    });
  }

  await unlinkContainedFile(boundary, transactionPaths.journal);
  await removeTransactionArtifactsBestEffort(boundary, transactionPaths.root);
}

async function atomicReplaceProjectFile(
  boundary: ProjectPhysicalBoundary,
  sourcePath: string,
  targetPath: string,
  context: AtomicReplaceContext
): Promise<void> {
  await __projectIoTestHooks.beforeAtomicReplace?.(context);
  await renameContainedPath(boundary, sourcePath, targetPath);
}

function parseProjectSaveJournal(value: unknown): ProjectSaveJournal {
  if (!value || typeof value !== "object") {
    throw new Error("The pending project save journal is invalid.");
  }

  const candidate = value as Partial<ProjectSaveJournal>;
  if (candidate.version !== 1 || !Array.isArray(candidate.files)) {
    throw new Error("The pending project save journal is invalid.");
  }

  const expectedFileNames = new Set<ProjectFileName>(Object.values(FILES));
  const seenFileNames = new Set<ProjectFileName>();

  for (const entry of candidate.files) {
    if (
      !entry ||
      typeof entry !== "object" ||
      !expectedFileNames.has(entry.fileName) ||
      typeof entry.existed !== "boolean" ||
      seenFileNames.has(entry.fileName)
    ) {
      throw new Error("The pending project save journal is invalid.");
    }

    seenFileNames.add(entry.fileName);
  }

  if (seenFileNames.size !== expectedFileNames.size) {
    throw new Error("The pending project save journal is incomplete.");
  }

  return candidate as ProjectSaveJournal;
}

async function createProjectExclusively(
  projectDir: string,
  projectName: string,
  expectedKey: string
): Promise<ProjectBundle> {
  const requestedRoot = path.resolve(projectDir);
  let createdProjectRoot: CreatedEntry | undefined;

  try {
    await lstat(requestedRoot);
  } catch (error) {
    if (!isFileSystemError(error, "ENOENT")) {
      throw error;
    }
    try {
      await mkdir(requestedRoot);
      createdProjectRoot = await captureCreatedEntry(requestedRoot, "directory");
    } catch (mkdirError) {
      if (!isFileSystemError(mkdirError, "EEXIST")) {
        throw mkdirError;
      }
    }
  }

  const boundary = await requireProjectPhysicalBoundary(requestedRoot, expectedKey);
  const initialEntries = await readdir(boundary.requestedRoot);
  if (initialEntries.length > 0) {
    await removeOwnedEntryBestEffort(boundary, createdProjectRoot);
    throw projectCreationTargetNotEmptyError(boundary.requestedRoot);
  }

  const reservationPath = path.join(
    boundary.requestedRoot,
    `.mage2-create-reservation-${randomUUID()}`
  );
  await mkdir(reservationPath);
  const reservation = await captureCreatedEntry(reservationPath, "directory");
  const publishedEntries: CreatedEntry[] = [];
  const stagingRoot = await mkdtemp(path.join(os.tmpdir(), "mage2-create-stage-"));

  try {
    await __projectIoTestHooks.beforeCreateFinalCheck?.(boundary.requestedRoot);
    await assertCreationWorkspaceUncontaminated(boundary, reservation, publishedEntries);

    const project = createDefaultProjectBundle(projectName);
    project.manifest.projectId = slugify(projectName);
    await seedStarterSceneAsset(stagingRoot, project);
    rebaseProjectPaths(project, stagingRoot, boundary.requestedRoot);
    const normalized = parseProjectBundle(project);
    await writeProjectBundleToStaging(stagingRoot, normalized);
    await publishStagedProjectExclusively(
      boundary,
      stagingRoot,
      reservation,
      publishedEntries
    );
    await assertCreationWorkspaceUncontaminated(boundary, reservation, publishedEntries);
    await removeOwnedEntry(boundary, reservation);
    return normalized;
  } catch (error) {
    await rollbackCreatedEntries(boundary, publishedEntries);
    await removeOwnedEntryBestEffort(boundary, reservation);
    await removeOwnedEntryBestEffort(boundary, createdProjectRoot);
    if (
      isFileSystemError(error, "EEXIST") ||
      isFileSystemError(error, "ENOTEMPTY") ||
      (error instanceof Error && error.message.includes("concurrent entry"))
    ) {
      throw projectCreationTargetNotEmptyError(boundary.requestedRoot);
    }
    throw error;
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

function projectCreationTargetNotEmptyError(projectDir: string): Error {
  return new Error(
    `Cannot create a MAGE2 project in "${projectDir}": the target directory must be empty.`
  );
}

async function captureCreatedEntry(
  entryPath: string,
  kind: CreatedEntry["kind"]
): Promise<CreatedEntry> {
  const entry = await lstat(entryPath);
  return {
    path: entryPath,
    kind,
    device: entry.dev,
    inode: entry.ino,
    birthtimeMs: entry.birthtimeMs
  };
}

function isSameCreatedEntry(entry: CreatedEntry, current: Awaited<ReturnType<typeof lstat>>): boolean {
  return (
    entry.device === current.dev &&
    entry.inode === current.ino &&
    entry.birthtimeMs === current.birthtimeMs &&
    (entry.kind === "directory" ? current.isDirectory() : !current.isDirectory()) &&
    !current.isSymbolicLink()
  );
}

async function removeOwnedEntry(
  boundary: ProjectPhysicalBoundary,
  entry: CreatedEntry
): Promise<void> {
  await assertProjectRootIdentity(boundary);
  let current;
  try {
    current = await lstat(entry.path);
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) {
      return;
    }
    throw error;
  }
  if (!isSameCreatedEntry(entry, current)) {
    return;
  }

  if (entry.kind === "directory") {
    await rmdir(entry.path);
  } else {
    await unlink(entry.path);
  }
}

async function removeOwnedEntryBestEffort(
  boundary: ProjectPhysicalBoundary,
  entry: CreatedEntry | undefined
): Promise<void> {
  if (!entry) {
    return;
  }
  try {
    await removeOwnedEntry(boundary, entry);
  } catch (error) {
    if (!isFileSystemError(error, "ENOTEMPTY") && !isFileSystemError(error, "EEXIST")) {
      // Fail closed: an entry whose identity or contents changed is left untouched.
    }
  }
}

async function rollbackCreatedEntries(
  boundary: ProjectPhysicalBoundary,
  entries: CreatedEntry[]
): Promise<void> {
  for (const entry of [...entries].reverse()) {
    await removeOwnedEntryBestEffort(boundary, entry);
  }
}

async function assertCreationWorkspaceUncontaminated(
  boundary: ProjectPhysicalBoundary,
  reservation: CreatedEntry,
  publishedEntries: CreatedEntry[]
): Promise<void> {
  await assertProjectRootIdentity(boundary);
  const ownedPaths = new Set(
    [reservation, ...publishedEntries].map((entry) => normalizePhysicalPathKey(entry.path))
  );
  const directories = [
    { path: boundary.requestedRoot, includeReservation: true },
    ...publishedEntries
      .filter((entry) => entry.kind === "directory")
      .map((entry) => ({ path: entry.path, includeReservation: false }))
  ];

  for (const directory of directories) {
    for (const childName of await readdir(directory.path)) {
      const childPath = path.join(directory.path, childName);
      if (!ownedPaths.has(normalizePhysicalPathKey(childPath))) {
        throw new Error(`A concurrent entry arrived while the project was being created.`);
      }
    }
  }
}

async function collectStagedProjectEntries(
  stagingRoot: string
): Promise<{ directories: string[]; files: string[] }> {
  const directories: string[] = [];
  const files: string[] = [];

  async function visit(currentPath: string): Promise<void> {
    for (const childName of await readdir(currentPath)) {
      const childPath = path.join(currentPath, childName);
      const childEntry = await lstat(childPath);
      if (childEntry.isSymbolicLink()) {
        throw new Error("The staged starter project unexpectedly contains a filesystem alias.");
      }
      if (childEntry.isDirectory()) {
        directories.push(childPath);
        await visit(childPath);
      } else if (childEntry.isFile()) {
        files.push(childPath);
      } else {
        throw new Error("The staged starter project contains an unsupported filesystem entry.");
      }
    }
  }

  await visit(stagingRoot);
  return { directories, files };
}

async function publishStagedProjectExclusively(
  boundary: ProjectPhysicalBoundary,
  stagingRoot: string,
  reservation: CreatedEntry,
  publishedEntries: CreatedEntry[]
): Promise<void> {
  const staged = await collectStagedProjectEntries(stagingRoot);

  for (const sourceDirectory of staged.directories) {
    const relativePath = path.relative(stagingRoot, sourceDirectory);
    await __projectIoTestHooks.beforeCreatePublish?.({
      kind: "directory",
      projectDir: boundary.requestedRoot,
      relativePath
    });
    await assertCreationWorkspaceUncontaminated(boundary, reservation, publishedEntries);
    const destinationDirectory = path.join(boundary.requestedRoot, relativePath);
    await mkdir(destinationDirectory);
    publishedEntries.push(await captureCreatedEntry(destinationDirectory, "directory"));
  }

  for (const sourceFile of staged.files) {
    const relativePath = path.relative(stagingRoot, sourceFile);
    await __projectIoTestHooks.beforeCreatePublish?.({
      kind: "file",
      projectDir: boundary.requestedRoot,
      relativePath
    });
    await assertCreationWorkspaceUncontaminated(boundary, reservation, publishedEntries);
    const destinationFile = path.join(boundary.requestedRoot, relativePath);
    await copyFile(sourceFile, destinationFile, constants.COPYFILE_EXCL);
    publishedEntries.push(await captureCreatedEntry(destinationFile, "file"));
  }
}

function rebaseProjectPaths(
  project: ProjectBundle,
  stagingRoot: string,
  projectDir: string
): void {
  const rebase = (candidatePath: string | undefined): string | undefined => {
    if (!candidatePath) {
      return undefined;
    }
    const relativePath = path.relative(stagingRoot, candidatePath);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error("A staged starter-project asset escaped its staging directory.");
    }
    return path.join(projectDir, relativePath);
  };

  project.manifest.assetRoots = project.manifest.assetRoots.map(
    (assetRoot) => rebase(assetRoot)!
  );
  for (const asset of project.assets.assets) {
    for (const variant of Object.values(asset.variants)) {
      variant.sourcePath = rebase(variant.sourcePath)!;
      variant.proxyPath = rebase(variant.proxyPath);
      variant.posterPath = rebase(variant.posterPath);
    }
  }
}

async function writeProjectBundleToStaging(
  stagingRoot: string,
  project: ProjectBundle
): Promise<void> {
  const values: Record<ProjectFileKey, unknown> = {
    manifest: project.manifest,
    assets: project.assets,
    locations: project.locations,
    scenes: project.scenes,
    dialogues: project.dialogues,
    inventory: project.inventory,
    strings: project.strings
  };
  for (const [key, fileName] of projectFileEntries()) {
    await writeJson(path.join(stagingRoot, fileName), values[key]);
  }
}

async function withProjectDirectoryOperation<T>(
  projectDir: string,
  operation: (identity: ProjectDirectoryIdentity) => Promise<T>
): Promise<T> {
  const initialIdentity = await resolveProjectDirectoryIdentity(projectDir);
  const directoryKey = initialIdentity.key;
  const previousOperation = projectDirectoryOperations.get(directoryKey) ?? Promise.resolve();
  let releaseCurrentOperation!: () => void;
  const currentOperation = new Promise<void>((resolve) => {
    releaseCurrentOperation = resolve;
  });
  const operationTail = previousOperation.catch(() => undefined).then(() => currentOperation);

  projectDirectoryOperations.set(directoryKey, operationTail);
  await previousOperation.catch(() => undefined);

  try {
    const currentIdentity = await resolveProjectDirectoryIdentity(projectDir);
    if (currentIdentity.key !== directoryKey) {
      throw new Error(
        `The project directory identity changed while waiting for another operation. Refusing to continue.`
      );
    }
    return await operation(currentIdentity);
  } finally {
    releaseCurrentOperation();
    if (projectDirectoryOperations.get(directoryKey) === operationTail) {
      projectDirectoryOperations.delete(directoryKey);
    }
  }
}

async function resolveProjectDirectoryIdentity(
  projectDir: string
): Promise<ProjectDirectoryIdentity> {
  const requestedRoot = path.resolve(projectDir);
  let rootEntry;

  try {
    rootEntry = await lstat(requestedRoot);
  } catch (error) {
    if (!isFileSystemError(error, "ENOENT")) {
      throw error;
    }

    const unresolvedSegments: string[] = [path.basename(requestedRoot)];
    let existingAncestor = path.dirname(requestedRoot);

    while (true) {
      try {
        const ancestorEntry = await lstat(existingAncestor);
        if (!ancestorEntry.isDirectory() && !ancestorEntry.isSymbolicLink()) {
          throw new Error(
            `Cannot establish the project directory identity because "${existingAncestor}" is not a directory.`
          );
        }
        break;
      } catch (ancestorError) {
        if (!isFileSystemError(ancestorError, "ENOENT")) {
          throw ancestorError;
        }

        const parent = path.dirname(existingAncestor);
        if (parent === existingAncestor) {
          throw new Error("Cannot establish a physical identity for the project directory.");
        }
        unresolvedSegments.unshift(path.basename(existingAncestor));
        existingAncestor = parent;
      }
    }

    const physicalAncestor = await realpath(existingAncestor);
    const anticipatedPhysicalRoot = path.join(physicalAncestor, ...unresolvedSegments);
    return {
      requestedRoot,
      key: normalizePhysicalPathKey(anticipatedPhysicalRoot)
    };
  }

  if (!rootEntry.isDirectory() && !rootEntry.isSymbolicLink()) {
    throw new Error(
      `Cannot use "${requestedRoot}" as a project directory because it is not a directory.`
    );
  }

  const physicalRoot = await realpath(requestedRoot);
  if (!(await stat(physicalRoot)).isDirectory()) {
    throw new Error(
      `Cannot use "${requestedRoot}" as a project directory because it does not resolve to a directory.`
    );
  }

  return {
    requestedRoot,
    physicalRoot,
    key: normalizePhysicalPathKey(physicalRoot)
  };
}

function normalizePhysicalPathKey(candidatePath: string): string {
  const normalized = path.normalize(candidatePath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function projectFileEntries(): Array<[ProjectFileKey, ProjectFileName]> {
  return Object.entries(FILES) as Array<[ProjectFileKey, ProjectFileName]>;
}

function resolveProjectTransactionPaths(projectDir: string) {
  const root = path.join(projectDir, ".mage2", PROJECT_SAVE_TRANSACTION_DIRECTORY);
  return {
    root,
    staged: path.join(root, "staged"),
    backup: path.join(root, "backup"),
    restore: path.join(root, "restore"),
    journal: path.join(root, PROJECT_SAVE_JOURNAL_FILE),
    journalTemporary: path.join(root, `${PROJECT_SAVE_JOURNAL_FILE}.temporary`)
  };
}

async function requireProjectPhysicalBoundary(
  projectDir: string,
  expectedKey: string
): Promise<ProjectPhysicalBoundary> {
  const identity = await resolveProjectDirectoryIdentity(projectDir);
  if (!identity.physicalRoot || identity.key !== expectedKey) {
    throw new Error(
      "Cannot establish a stable physical identity for the project directory. Refusing to continue."
    );
  }

  return {
    requestedRoot: identity.requestedRoot,
    physicalRoot: identity.physicalRoot,
    key: identity.key
  };
}

async function assertProjectRootIdentity(boundary: ProjectPhysicalBoundary): Promise<void> {
  const currentIdentity = await resolveProjectDirectoryIdentity(boundary.requestedRoot);
  if (
    !currentIdentity.physicalRoot ||
    currentIdentity.key !== boundary.key ||
    normalizePhysicalPathKey(currentIdentity.physicalRoot) !==
      normalizePhysicalPathKey(boundary.physicalRoot)
  ) {
    throw new Error(
      "The project directory physical identity changed during a filesystem operation. Refusing to continue."
    );
  }
}

async function inspectContainedPath(
  boundary: ProjectPhysicalBoundary,
  candidatePath: string,
  allowMissing: boolean
) {
  await assertProjectRootIdentity(boundary);
  const absoluteCandidate = path.resolve(candidatePath);
  const relativeCandidate = path.relative(boundary.requestedRoot, absoluteCandidate);
  if (
    relativeCandidate === ".." ||
    relativeCandidate.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeCandidate)
  ) {
    throw new Error("A project transaction path escaped the physical project directory.");
  }

  if (!relativeCandidate) {
    // The selected root itself may be a caller-supplied alias; its canonical identity is the
    // operation lock key. Aliases are forbidden only below this already-verified boundary.
    return stat(boundary.requestedRoot);
  }

  const segments = relativeCandidate.split(path.sep).filter(Boolean);
  let currentPath = boundary.requestedRoot;

  for (let index = 0; index < segments.length; index += 1) {
    currentPath = path.join(currentPath, segments[index]!);
    let currentEntry;
    try {
      currentEntry = await lstat(currentPath);
    } catch (error) {
      if (allowMissing && isFileSystemError(error, "ENOENT")) {
        return undefined;
      }
      throw error;
    }

    if (currentEntry.isSymbolicLink()) {
      throw new Error(
        `Refusing to use a symbolic link or Windows reparse point in project transaction storage: ${currentPath}`
      );
    }

    if (index < segments.length - 1 && !currentEntry.isDirectory()) {
      throw new Error(`A project transaction ancestor is not a directory: ${currentPath}`);
    }

    const actualPhysicalPath = await realpath(currentPath);
    const expectedPhysicalPath = path.join(
      boundary.physicalRoot,
      ...segments.slice(0, index + 1)
    );
    if (
      normalizePhysicalPathKey(actualPhysicalPath) !==
      normalizePhysicalPathKey(expectedPhysicalPath)
    ) {
      throw new Error(
        `Refusing to follow a filesystem alias outside the physical project ancestry: ${currentPath}`
      );
    }

    if (index === segments.length - 1) {
      return currentEntry;
    }
  }

  return undefined;
}

async function assertContainedDirectory(
  boundary: ProjectPhysicalBoundary,
  directoryPath: string
): Promise<void> {
  const directoryEntry = await inspectContainedPath(boundary, directoryPath, false);
  if (!directoryEntry?.isDirectory()) {
    throw new Error(`A project transaction directory is invalid: ${directoryPath}`);
  }
}

async function assertOptionalContainedDirectory(
  boundary: ProjectPhysicalBoundary,
  directoryPath: string
): Promise<void> {
  const directoryEntry = await inspectContainedPath(boundary, directoryPath, true);
  if (directoryEntry && !directoryEntry.isDirectory()) {
    throw new Error(`A project transaction directory is invalid: ${directoryPath}`);
  }
}

async function assertProjectAssetPathsContained(
  boundary: ProjectPhysicalBoundary,
  project: ProjectBundle
): Promise<void> {
  for (const assetRoot of project.manifest.assetRoots) {
    const rootEntry = await inspectContainedPath(boundary, assetRoot, true);
    if (rootEntry && !rootEntry.isDirectory()) {
      throw new Error(`A project asset root is not a directory: ${assetRoot}`);
    }
  }

  for (const asset of project.assets.assets) {
    for (const variant of Object.values(asset.variants)) {
      const sourceEntry = await inspectContainedPath(boundary, variant.sourcePath, true);
      if (sourceEntry && !sourceEntry.isFile()) {
        throw new Error(`A project asset source is not a regular file: ${variant.sourcePath}`);
      }
      for (const generatedPath of [variant.proxyPath, variant.posterPath]) {
        if (!generatedPath) {
          continue;
        }
        const generatedEntry = await inspectContainedPath(boundary, generatedPath, true);
        if (generatedEntry && !generatedEntry.isFile()) {
          throw new Error(`A generated project asset is not a regular file: ${generatedPath}`);
        }
      }
    }
  }
}

async function runContainedMutationHook(
  boundary: ProjectPhysicalBoundary,
  kind: ContainedMutationContext["kind"],
  candidatePath: string,
  destinationPath?: string
): Promise<void> {
  await __projectIoTestHooks.beforeContainedMutation?.({
    kind,
    projectDir: boundary.requestedRoot,
    path: candidatePath,
    destinationPath
  });
}

async function createContainedDirectory(
  boundary: ProjectPhysicalBoundary,
  directoryPath: string
): Promise<void> {
  await runContainedMutationHook(boundary, "mkdir", directoryPath);
  await assertContainedDirectory(boundary, path.dirname(directoryPath));
  await inspectContainedPath(boundary, directoryPath, true);
  await mkdir(directoryPath);
  await assertContainedDirectory(boundary, directoryPath);
}

async function ensureContainedDirectory(
  boundary: ProjectPhysicalBoundary,
  directoryPath: string
): Promise<void> {
  const directoryEntry = await inspectContainedPath(boundary, directoryPath, true);
  if (!directoryEntry) {
    await createContainedDirectory(boundary, directoryPath);
    return;
  }
  if (!directoryEntry.isDirectory()) {
    throw new Error(`A project transaction directory is invalid: ${directoryPath}`);
  }
}

async function writeContainedFile(
  boundary: ProjectPhysicalBoundary,
  filePath: string,
  contents: string | Buffer
): Promise<void> {
  await runContainedMutationHook(boundary, "write", filePath);
  await assertContainedDirectory(boundary, path.dirname(filePath));
  await inspectContainedPath(boundary, filePath, true);
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(contents);
  } finally {
    await handle.close();
  }
  await inspectContainedPath(boundary, filePath, false);
}

async function writeContainedJson(
  boundary: ProjectPhysicalBoundary,
  filePath: string,
  value: unknown
): Promise<void> {
  await writeContainedFile(boundary, filePath, JSON.stringify(value, null, 2));
}

async function renameContainedPath(
  boundary: ProjectPhysicalBoundary,
  sourcePath: string,
  targetPath: string
): Promise<void> {
  await runContainedMutationHook(boundary, "rename", sourcePath, targetPath);
  await inspectContainedPath(boundary, sourcePath, false);
  await assertContainedDirectory(boundary, path.dirname(targetPath));
  await inspectContainedPath(boundary, targetPath, true);
  await rename(sourcePath, targetPath);
}

async function unlinkContainedFile(
  boundary: ProjectPhysicalBoundary,
  filePath: string
): Promise<void> {
  await runContainedMutationHook(boundary, "unlink", filePath);
  const fileEntry = await inspectContainedPath(boundary, filePath, false);
  if (fileEntry?.isDirectory()) {
    throw new Error(`Refusing to unlink a directory as a project file: ${filePath}`);
  }
  await unlink(filePath);
}

async function removeContainedDirectory(
  boundary: ProjectPhysicalBoundary,
  directoryPath: string
): Promise<void> {
  await runContainedMutationHook(boundary, "rmdir", directoryPath);
  await assertContainedDirectory(boundary, directoryPath);
  await rmdir(directoryPath);
}

async function readContainedFile(
  boundary: ProjectPhysicalBoundary,
  filePath: string
): Promise<Buffer> {
  const fileEntry = await inspectContainedPath(boundary, filePath, false);
  if (fileEntry?.isDirectory()) {
    throw new Error(`A project transaction file is invalid: ${filePath}`);
  }
  return readFile(filePath);
}

async function readContainedFileIfPresent(
  boundary: ProjectPhysicalBoundary,
  filePath: string
): Promise<Buffer | undefined> {
  const fileEntry = await inspectContainedPath(boundary, filePath, true);
  if (!fileEntry) {
    return undefined;
  }
  if (fileEntry.isDirectory()) {
    throw new Error(`A project file path is a directory: ${filePath}`);
  }
  return readFile(filePath);
}

async function readContainedJson(
  boundary: ProjectPhysicalBoundary,
  filePath: string
): Promise<unknown> {
  return JSON.parse((await readContainedFile(boundary, filePath)).toString("utf8"));
}

async function removeContainedFileIfPresent(
  boundary: ProjectPhysicalBoundary,
  filePath: string
): Promise<void> {
  const fileEntry = await inspectContainedPath(boundary, filePath, true);
  if (!fileEntry) {
    return;
  }
  if (fileEntry.isDirectory()) {
    throw new Error(`A project file path is a directory: ${filePath}`);
  }
  await unlinkContainedFile(boundary, filePath);
}

async function containedPathExists(
  boundary: ProjectPhysicalBoundary,
  filePath: string
): Promise<boolean> {
  return Boolean(await inspectContainedPath(boundary, filePath, true));
}

async function collectContainedTree(
  boundary: ProjectPhysicalBoundary,
  currentPath: string,
  files: string[],
  directories: string[]
): Promise<void> {
  const currentEntry = await inspectContainedPath(boundary, currentPath, false);
  if (!currentEntry?.isDirectory()) {
    files.push(currentPath);
    return;
  }

  for (const childName of await readdir(currentPath)) {
    await collectContainedTree(boundary, path.join(currentPath, childName), files, directories);
  }
  directories.push(currentPath);
}

async function removeTransactionArtifacts(
  boundary: ProjectPhysicalBoundary,
  transactionRoot: string
): Promise<void> {
  await assertOptionalContainedDirectory(
    boundary,
    path.join(boundary.requestedRoot, ".mage2")
  );
  const transactionEntry = await inspectContainedPath(boundary, transactionRoot, true);
  if (!transactionEntry) {
    return;
  }
  if (!transactionEntry.isDirectory()) {
    throw new Error(`The project transaction path is not a directory: ${transactionRoot}`);
  }

  const files: string[] = [];
  const directories: string[] = [];
  await collectContainedTree(boundary, transactionRoot, files, directories);
  for (const filePath of files) {
    await unlinkContainedFile(boundary, filePath);
  }
  for (const directoryPath of directories) {
    await removeContainedDirectory(boundary, directoryPath);
  }
}

async function removeTransactionArtifactsBestEffort(
  boundary: ProjectPhysicalBoundary,
  transactionRoot: string
): Promise<void> {
  try {
    await removeTransactionArtifacts(boundary, transactionRoot);
  } catch {
    // A published journal is the commit boundary. Safe cleanup may be retried later; aliases and
    // reparse points are deliberately left untouched instead of traversed.
  }
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveProjectFilePaths(projectDir: string): Record<keyof typeof FILES, string> {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, fileName]) => [key, path.join(projectDir, fileName)])
  ) as Record<keyof typeof FILES, string>;
}

async function readJson(filePath: string): Promise<unknown> {
  const source = await readFile(filePath, "utf8");
  return JSON.parse(source);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "project_default";
}

async function seedStarterSceneAsset(projectDir: string, project: ProjectBundle): Promise<void> {
  const assetsDir = path.join(projectDir, "assets");
  const starterAssetPath = path.join(assetsDir, STARTER_SCENE_ASSET_NAME);
  const defaultLocale = project.manifest.defaultLanguage;

  await mkdir(assetsDir, { recursive: true });
  await copyFile(resolveStarterSceneTemplatePath(), starterAssetPath);

  const starterVariant: AssetVariant = {
    sourcePath: starterAssetPath,
    sha256: await computeFileSha256(starterAssetPath),
    importedAt: new Date().toISOString(),
    width: 1280,
    height: 720
  };
  const starterAsset: Asset = {
    id: "asset_placeholder",
    kind: "image",
    name: STARTER_SCENE_ASSET_NAME,
    variants: {
      [defaultLocale]: starterVariant
    }
  };

  const existingAssetIndex = project.assets.assets.findIndex((asset) => asset.id === starterAsset.id);
  if (existingAssetIndex >= 0) {
    project.assets.assets[existingAssetIndex] = await generateProxy(starterAsset, defaultLocale, projectDir);
  } else {
    project.assets.assets.push(await generateProxy(starterAsset, defaultLocale, projectDir));
  }

  if (!project.manifest.assetRoots.includes(assetsDir)) {
    project.manifest.assetRoots.push(assetsDir);
  }
}

async function ensureProjectAssetPreviews(
  boundary: ProjectPhysicalBoundary,
  project: ProjectBundle
): Promise<ProjectBundle> {
  const projectDir = boundary.requestedRoot;
  let updated = false;

  for (let assetIndex = 0; assetIndex < project.assets.assets.length; assetIndex += 1) {
    let asset = project.assets.assets[assetIndex]!;

    for (const locale of Object.keys(asset.variants)) {
      if (!(await shouldRegenerateAssetPreview(asset, locale))) {
        continue;
      }

      asset = await generateProxy(asset, locale, projectDir);
      project.assets.assets[assetIndex] = asset;
      updated = true;
    }
  }

  if (!updated) {
    return project;
  }

  return saveProjectTransaction(boundary, project);
}

async function shouldRegenerateAssetPreview(asset: Asset, locale: string): Promise<boolean> {
  const variant = resolveAssetVariant(asset, locale);
  if (!variant) {
    return false;
  }

  if (asset.kind === "audio") {
    return !(await pathExists(variant.proxyPath));
  }

  if (asset.kind === "video") {
    return !(await pathExists(variant.proxyPath)) || !(await pathExists(variant.posterPath));
  }

  if (!(await pathExists(variant.proxyPath))) {
    return true;
  }

  if (!(await pathExists(variant.posterPath))) {
    return true;
  }

  return variant.posterPath === variant.proxyPath;
}

async function pathExists(candidatePath: string | undefined): Promise<boolean> {
  if (!candidatePath) {
    return false;
  }

  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

function resolveStarterSceneTemplatePath(): string {
  const bundledAssetPath = path.join(__dirname, STARTER_SCENE_ASSET_NAME);
  if (existsSync(bundledAssetPath)) {
    return bundledAssetPath;
  }

  return path.resolve(__dirname, "..", "electron", STARTER_SCENE_ASSET_NAME);
}

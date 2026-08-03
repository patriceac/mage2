import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Asset, ProjectBundle } from "@mage2/schema";

const MEDIA_PROTOCOL = "mage2-file:";

interface GrantedDirectory {
  requestedPath: string;
  physicalPath: string;
}

export class FilesystemCapabilities {
  private readonly browseRoots = new Map<string, GrantedDirectory>();
  private readonly projectRoots = new Map<string, GrantedDirectory>();
  private readonly droppedPaths = new Set<string>();
  private readonly mediaPathByToken = new Map<string, string>();
  private readonly mediaTokenByPath = new Map<string, string>();

  async grantBrowseRoot(inputPath: string): Promise<string> {
    const grant = await captureDirectoryGrant(inputPath);
    this.browseRoots.set(pathKey(grant.requestedPath), grant);
    return grant.requestedPath;
  }

  async grantProjectRoot(inputPath: string): Promise<string> {
    const grant = await captureDirectoryGrant(inputPath);
    this.projectRoots.set(pathKey(grant.requestedPath), grant);
    this.browseRoots.set(pathKey(grant.requestedPath), grant);
    return grant.requestedPath;
  }

  async tryGrantProjectRoot(inputPath: string): Promise<boolean> {
    try {
      await this.grantProjectRoot(inputPath);
      return true;
    } catch {
      return false;
    }
  }

  grantDroppedPath(inputPath: string): string {
    const resolvedPath = resolveAbsolutePath(inputPath, "dropped path");
    this.droppedPaths.add(pathKey(resolvedPath));
    return resolvedPath;
  }

  async assertBrowsePath(inputPath: string): Promise<string> {
    return assertPathWithinGrants(inputPath, this.browseRoots.values(), "browse path");
  }

  async assertProjectSelection(inputPath: string): Promise<string> {
    const resolvedPath = resolveAbsolutePath(inputPath, "project selection");
    if (this.projectRoots.has(pathKey(resolvedPath))) {
      return this.assertProjectRoot(resolvedPath);
    }

    if (this.droppedPaths.has(pathKey(resolvedPath))) {
      await assertExistingPath(resolvedPath, "dropped project path");
      return resolvedPath;
    }

    return this.assertBrowsePath(resolvedPath);
  }

  async assertProjectRoot(inputPath: string): Promise<string> {
    const resolvedPath = resolveAbsolutePath(inputPath, "project path");
    const grant = this.projectRoots.get(pathKey(resolvedPath));
    if (!grant) {
      throw new Error("The requested project folder has not been granted to this editor session.");
    }

    const currentPhysicalPath = await realpath(grant.requestedPath);
    if (pathKey(currentPhysicalPath) !== pathKey(grant.physicalPath)) {
      throw new Error("The granted project folder changed physical identity.");
    }
    return grant.requestedPath;
  }

  async assertGrantedProjectPath(inputPath: string, allowMissing = false): Promise<string> {
    const resolvedPath = resolveAbsolutePath(inputPath, "project file");
    const matchingProject = [...this.projectRoots.values()].find((grant) =>
      isPathWithin(grant.requestedPath, resolvedPath)
    );
    if (!matchingProject) {
      throw new Error("The requested path is outside every project granted to this editor session.");
    }
    return this.assertProjectPath(matchingProject.requestedPath, resolvedPath, allowMissing);
  }

  async assertImportFile(inputPath: string): Promise<string> {
    const resolvedPath = resolveAbsolutePath(inputPath, "import file");
    if (this.droppedPaths.has(pathKey(resolvedPath))) {
      await assertRegularFile(resolvedPath, "dropped import file");
      return resolvedPath;
    }

    const grantedPath = await assertPathWithinGrants(
      resolvedPath,
      this.browseRoots.values(),
      "import file"
    );
    await assertRegularFile(grantedPath, "import file");
    return grantedPath;
  }

  async assertProjectBundlePaths(projectDir: string, project: ProjectBundle): Promise<void> {
    await this.assertProjectRoot(projectDir);
    for (const assetRoot of project.manifest.assetRoots) {
      await this.assertProjectPath(projectDir, assetRoot, true);
    }
    await this.assertProjectAssetPaths(projectDir, project.assets.assets);
  }

  async assertProjectAssetPaths(projectDir: string, assets: readonly Asset[]): Promise<void> {
    await this.assertProjectRoot(projectDir);
    for (const asset of assets) {
      for (const variant of Object.values(asset.variants)) {
        await this.assertProjectPath(projectDir, variant.sourcePath, true);
        if (variant.proxyPath) {
          await this.assertProjectPath(projectDir, variant.proxyPath, true);
        }
        if (variant.posterPath) {
          await this.assertProjectPath(projectDir, variant.posterPath, true);
        }
      }
    }
  }

  async assertProjectPath(projectDir: string, inputPath: string, allowMissing = false): Promise<string> {
    const projectRoot = await this.assertProjectRoot(projectDir);
    const grant = this.projectRoots.get(pathKey(projectRoot))!;
    const candidatePath = resolveAbsolutePath(inputPath, "project file");

    if (!isPathWithin(projectRoot, candidatePath)) {
      throw new Error("A project file path escaped the granted project folder.");
    }

    let physicalCandidate: string;
    try {
      physicalCandidate = await realpath(candidatePath);
    } catch (error) {
      if (allowMissing && isMissingPathError(error)) {
        physicalCandidate = await resolveNearestExistingPhysicalPath(candidatePath);
        if (!isPathWithin(grant.physicalPath, physicalCandidate)) {
          throw new Error("A missing project file path resolves through a folder outside the granted project folder.");
        }
        return candidatePath;
      }
      throw error;
    }

    if (!isPathWithin(grant.physicalPath, physicalCandidate)) {
      throw new Error("A project file path resolved outside the granted project folder.");
    }
    return candidatePath;
  }

  async createMediaUrl(inputPath: string): Promise<string> {
    const resolvedPath = resolveAbsolutePath(inputPath, "media file");
    const matchingProject = [...this.projectRoots.values()].find((grant) =>
      isPathWithin(grant.requestedPath, resolvedPath)
    );
    if (!matchingProject) {
      throw new Error("Media access is limited to files inside a granted project folder.");
    }

    await this.assertProjectPath(matchingProject.requestedPath, resolvedPath, false);
    const key = pathKey(resolvedPath);
    let token = this.mediaTokenByPath.get(key);
    if (!token) {
      token = randomUUID();
      this.mediaTokenByPath.set(key, token);
      this.mediaPathByToken.set(token, resolvedPath);
    }

    return `${MEDIA_PROTOCOL}//asset/${token}`;
  }

  resolveMediaUrl(inputUrl: string): string | undefined {
    try {
      const parsedUrl = new URL(inputUrl);
      if (
        parsedUrl.protocol !== MEDIA_PROTOCOL ||
        parsedUrl.hostname !== "asset" ||
        parsedUrl.search ||
        parsedUrl.hash
      ) {
        return undefined;
      }
      const token = parsedUrl.pathname.replace(/^\/+/, "");
      return token ? this.mediaPathByToken.get(token) : undefined;
    } catch {
      return undefined;
    }
  }
}

async function captureDirectoryGrant(inputPath: string): Promise<GrantedDirectory> {
  const requestedPath = resolveAbsolutePath(inputPath, "directory grant");
  const entry = await stat(requestedPath);
  if (!entry.isDirectory()) {
    throw new Error(`A filesystem grant must target a directory: "${requestedPath}".`);
  }
  return {
    requestedPath,
    physicalPath: await realpath(requestedPath)
  };
}

async function assertPathWithinGrants(
  inputPath: string,
  grants: Iterable<GrantedDirectory>,
  label: string
): Promise<string> {
  const candidatePath = resolveAbsolutePath(inputPath, label);
  const matchingGrant = [...grants]
    .filter((grant) => isPathWithin(grant.requestedPath, candidatePath))
    .sort((left, right) => right.requestedPath.length - left.requestedPath.length)[0];
  if (!matchingGrant) {
    throw new Error(`The ${label} is outside the folders granted to this editor session.`);
  }

  const physicalCandidate = await realpath(candidatePath);
  if (!isPathWithin(matchingGrant.physicalPath, physicalCandidate)) {
    throw new Error(`The ${label} resolves outside its granted folder.`);
  }
  return candidatePath;
}

async function assertExistingPath(inputPath: string, label: string): Promise<void> {
  try {
    await stat(inputPath);
  } catch (error) {
    throw new Error(`The ${label} is not available.`, { cause: error });
  }
}

async function assertRegularFile(inputPath: string, label: string): Promise<void> {
  const entry = await stat(inputPath);
  if (!entry.isFile()) {
    throw new Error(`The ${label} is not a regular file.`);
  }
}

function resolveAbsolutePath(inputPath: string, label: string): string {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new Error(`A ${label} is required.`);
  }
  if (!path.isAbsolute(inputPath.trim())) {
    throw new Error(`The ${label} must be an absolute path.`);
  }
  return path.resolve(inputPath.trim());
}

function isPathWithin(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath === "" ||
    (relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath))
  );
}

function pathKey(inputPath: string): string {
  const normalized = path.normalize(inputPath);
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function resolveNearestExistingPhysicalPath(inputPath: string): Promise<string> {
  let candidatePath = inputPath;
  while (true) {
    try {
      return await realpath(candidatePath);
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
      const parentPath = path.dirname(candidatePath);
      if (parentPath === candidatePath) {
        throw error;
      }
      candidatePath = parentPath;
    }
  }
}

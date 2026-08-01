import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle, type ProjectBundle } from "@mage2/schema";

const electronApp = vi.hoisted(() => ({ isPackaged: true }));
const renameControl = vi.hoisted(() => ({
  actualRename: undefined as typeof import("node:fs/promises").rename | undefined,
  rename: vi.fn()
}));

vi.mock("electron", () => ({ app: electronApp }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  renameControl.actualRename = actual.rename;
  renameControl.rename.mockImplementation(actual.rename);
  return { ...actual, rename: renameControl.rename };
});

import { exportProjectBundle } from "./exporter";

const tempDirectories: string[] = [];
let resourcesDirectory: string;
let previousResourcesPathDescriptor: PropertyDescriptor | undefined;

beforeAll(async () => {
  resourcesDirectory = await mkdtemp(path.join(os.tmpdir(), "mage2-export-resources-"));
  const runtimeDirectory = path.join(resourcesDirectory, "runtime-web");
  await mkdir(runtimeDirectory, { recursive: true });
  await writeFile(path.join(runtimeDirectory, "index.html"), "<!doctype html><title>MAGE2 Runtime</title>", "utf8");
  await writeFile(path.join(runtimeDirectory, "runtime.js"), "globalThis.mage2Runtime = true;", "utf8");

  previousResourcesPathDescriptor = Object.getOwnPropertyDescriptor(process, "resourcesPath");
  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value: resourcesDirectory
  });
});

beforeEach(() => {
  renameControl.rename.mockReset();
  renameControl.rename.mockImplementation(renameControl.actualRename!);
});

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

afterAll(async () => {
  await rm(resourcesDirectory, { recursive: true, force: true });
  if (previousResourcesPathDescriptor) {
    Object.defineProperty(process, "resourcesPath", previousResourcesPathDescriptor);
  } else {
    Reflect.deleteProperty(process, "resourcesPath");
  }
});

describe("safe project export", () => {
  it("blocks validation errors before inspecting or touching the configured output", async () => {
    const { projectDir, project } = await createValidProject();
    const externalOutput = await createTempDirectory("mage2-export-external-");
    const sentinelPath = path.join(externalOutput, "keep.txt");
    await writeFile(sentinelPath, "must remain", "utf8");

    project.assets.assets = [];
    project.manifest.buildSettings.outputDir = externalOutput;

    await expect(exportProjectBundle(projectDir, project)).rejects.toThrow(/Export blocked by .*validation error/i);
    await expect(readFile(sentinelPath, "utf8")).resolves.toBe("must remain");
  });

  it.each([
    ["project root", "."],
    ["parent traversal", "../outside"],
    ["normalized traversal", "exports/../build"],
    ["repeated separators", "exports//build"],
    ["drive-relative path", "C:build"],
    ["UNC path", "\\\\server\\share\\build"]
  ])("rejects a non-canonical %s output path", async (_label, configuredOutput) => {
    const { projectDir, project } = await createValidProject();
    project.manifest.buildSettings.outputDir = configuredOutput;

    await expect(exportProjectBundle(projectDir, project)).rejects.toThrow(/Export output folder/i);
  });

  it("rejects an absolute output path", async () => {
    const { projectDir, project } = await createValidProject();
    const externalOutput = await createTempDirectory("mage2-export-absolute-");
    project.manifest.buildSettings.outputDir = externalOutput;

    await expect(exportProjectBundle(projectDir, project)).rejects.toThrow(/must be relative/i);
  });

  it("rejects output paths that escape through a symbolic link or junction", async () => {
    const { projectDir, project } = await createValidProject();
    const externalDirectory = await createTempDirectory("mage2-export-link-target-");
    const linkedDirectory = path.join(projectDir, "build");
    await symlink(externalDirectory, linkedDirectory, process.platform === "win32" ? "junction" : "dir");

    await expect(exportProjectBundle(projectDir, project)).rejects.toThrow(/escapes.*symbolic link or junction/i);
    await expect(readdir(externalDirectory)).resolves.toEqual([]);
  });

  it("exports to the empty reserved destination and writes a complete ownership marker", async () => {
    const { projectDir, project } = await createValidProject();
    const outputDirectory = path.join(projectDir, "build");
    await mkdir(outputDirectory, { recursive: true });

    const result = await exportProjectBundle(projectDir, project);
    const marker = JSON.parse(await readFile(path.join(outputDirectory, ".mage2-export.json"), "utf8"));

    expect(result.outputDirectory).toBe(outputDirectory);
    expect(marker).toMatchObject({
      format: "mage2-runtime-export",
      version: 2,
      projectId: project.manifest.projectId
    });
    expect(marker.exportId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(marker.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "index.html" }),
        expect.objectContaining({ path: "media/asset_background.en.svg" })
      ])
    );
    await expect(readFile(path.join(outputDirectory, "index.html"), "utf8")).resolves.toContain("MAGE2 Runtime");
    await expect(readFile(path.join(outputDirectory, "media", "asset_background.en.svg"), "utf8")).resolves.toContain(
      "<svg"
    );
  });

  it("refuses to replace a nonempty unowned destination", async () => {
    const { projectDir, project } = await createValidProject();
    const outputDirectory = path.join(projectDir, "build");
    const sentinelPath = path.join(outputDirectory, "user-file.txt");
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(sentinelPath, "personal data", "utf8");

    await expect(exportProjectBundle(projectDir, project)).rejects.toThrow(/not a verified prior MAGE2 export/i);
    await expect(readFile(sentinelPath, "utf8")).resolves.toBe("personal data");
  });

  it("replaces only an unchanged owned export for the same project", async () => {
    const { projectDir, project } = await createValidProject();
    const outputDirectory = path.join(projectDir, "build");
    await exportProjectBundle(projectDir, project);
    const firstMarker = await readFile(path.join(outputDirectory, ".mage2-export.json"), "utf8");

    await exportProjectBundle(projectDir, project);

    expect(await readFile(path.join(outputDirectory, ".mage2-export.json"), "utf8")).not.toBe(firstMarker);
    const markerBeforeMismatch = await readFile(path.join(outputDirectory, ".mage2-export.json"), "utf8");

    project.manifest.projectId = "project_other";
    await expect(exportProjectBundle(projectDir, project)).rejects.toThrow(/belongs to a different project/i);
    await expect(readFile(path.join(outputDirectory, ".mage2-export.json"), "utf8")).resolves.toBe(
      markerBeforeMismatch
    );
  });

  it("keeps the prior export intact when staging the replacement fails", async () => {
    const { projectDir, project, sourcePath } = await createValidProject();
    const outputDirectory = path.join(projectDir, "build");
    await exportProjectBundle(projectDir, project);
    const previousManifest = await readFile(path.join(outputDirectory, "build-manifest.json"), "utf8");
    await rm(sourcePath);

    await expect(exportProjectBundle(projectDir, project)).rejects.toThrow(/existing export was not changed/i);

    await expect(readFile(path.join(outputDirectory, "build-manifest.json"), "utf8")).resolves.toBe(previousManifest);
    expect(await exporterTemporaryEntries(projectDir)).toEqual([]);
  });

  it("rolls back to the prior export when atomic promotion fails", async () => {
    const { projectDir, project } = await createValidProject();
    const outputDirectory = path.join(projectDir, "build");
    await exportProjectBundle(projectDir, project);
    const previousManifest = await readFile(path.join(outputDirectory, "build-manifest.json"), "utf8");

    renameControl.rename.mockImplementation(async (source, destination) => {
      if (String(source).endsWith(".staging") && path.resolve(String(destination)) === outputDirectory) {
        throw Object.assign(new Error("simulated promotion failure"), { code: "EACCES" });
      }
      return renameControl.actualRename!(source, destination);
    });

    await expect(exportProjectBundle(projectDir, project)).rejects.toThrow(/previous export was restored/i);

    await expect(readFile(path.join(outputDirectory, "build-manifest.json"), "utf8")).resolves.toBe(previousManifest);
    expect(await exporterTemporaryEntries(projectDir)).toEqual([]);
  });

  it("rejects unknown content even when a genuine marker and manifest are present", async () => {
    const { projectDir, project } = await createValidProject();
    const outputDirectory = path.join(projectDir, "build");
    await exportProjectBundle(projectDir, project);
    const sentinelPath = path.join(outputDirectory, "unknown-user-content.txt");
    await writeFile(sentinelPath, "must not be deleted", "utf8");

    await expect(exportProjectBundle(projectDir, project)).rejects.toThrow(/unknown, missing, or changed content/i);
    await expect(readFile(sentinelPath, "utf8")).resolves.toBe("must not be deleted");
  });

  it("rejects project-controlled asset path traversal before copying any media", async () => {
    const { projectDir, project } = await createValidProject();
    const externalDirectory = await createTempDirectory("mage2-export-asset-escape-");
    const sentinelPath = path.join(externalDirectory, "keep.svg");
    await writeFile(sentinelPath, "external sentinel", "utf8");
    project.assets.assets[0].id = `../../../${path.basename(externalDirectory)}/keep`;
    project.scenes.items[0].backgroundAssetId = project.assets.assets[0].id;

    await expect(exportProjectBundle(projectDir, project)).rejects.toThrow(/asset ID.*safe generated filename/i);
    await expect(readFile(sentinelPath, "utf8")).resolves.toBe("external sentinel");
  });

  it("fails closed when the verified output identity is swapped for a junction at promotion", async () => {
    const { projectDir, project } = await createValidProject();
    const outputDirectory = path.join(projectDir, "build");
    const displacedDirectory = path.join(projectDir, "displaced-prior-build");
    const externalDirectory = await createTempDirectory("mage2-export-promotion-swap-");
    const sentinelPath = path.join(externalDirectory, "keep.txt");
    await writeFile(sentinelPath, "external sentinel", "utf8");
    await exportProjectBundle(projectDir, project);

    let injected = false;
    renameControl.rename.mockImplementation(async (source, destination) => {
      if (!injected && path.resolve(String(source)) === outputDirectory && String(destination).endsWith(".backup")) {
        injected = true;
        await renameControl.actualRename!(source, displacedDirectory);
        await symlink(externalDirectory, outputDirectory, process.platform === "win32" ? "junction" : "dir");
      }
      return renameControl.actualRename!(source, destination);
    });

    await expect(exportProjectBundle(projectDir, project)).rejects.toThrow(/not a normal directory|identity|changed or became unsafe/i);
    await expect(readFile(sentinelPath, "utf8")).resolves.toBe("external sentinel");
    await expect(readFile(path.join(displacedDirectory, "build-manifest.json"), "utf8")).resolves.toContain(
      project.manifest.projectId
    );
  });
});

async function createValidProject(
  options: { outputDir?: string; projectId?: string } = {}
): Promise<{ projectDir: string; project: ProjectBundle; sourcePath: string }> {
  const projectDir = await createTempDirectory("mage2-export-project-");
  const sourcePath = path.join(projectDir, "assets", "background.svg");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(
    sourcePath,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#123456"/></svg>',
    "utf8"
  );

  const project = createDefaultProjectBundle("Safe Export Test");
  project.manifest.projectId = options.projectId ?? "project_safe_export";
  project.manifest.buildSettings.outputDir = options.outputDir ?? "build";
  project.assets.assets = [
    {
      id: "asset_background",
      kind: "image",
      category: "background",
      name: "background.svg",
      variants: {
        en: {
          sourcePath,
          importedAt: "2026-08-01T00:00:00.000Z"
        }
      }
    }
  ];
  project.scenes.items[0].backgroundAssetId = "asset_background";

  return { projectDir, project, sourcePath };
}

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function exporterTemporaryEntries(projectDir: string): Promise<string[]> {
  return (await readdir(projectDir)).filter(
    (entry) => entry.startsWith(".mage2-export-") && (entry.endsWith(".staging") || entry.endsWith(".backup"))
  );
}

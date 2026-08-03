import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilesystemCapabilities } from "./filesystem-capabilities";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("filesystem capabilities", () => {
  it("limits browsing and imports to granted roots", async () => {
    const grantedRoot = await temporaryDirectory("mage2-cap-granted-");
    const outsideRoot = await temporaryDirectory("mage2-cap-outside-");
    const insideFile = path.join(grantedRoot, "inside.png");
    const outsideFile = path.join(outsideRoot, "outside.png");
    await writeFile(insideFile, "inside");
    await writeFile(outsideFile, "outside");

    const capabilities = new FilesystemCapabilities();
    await capabilities.grantBrowseRoot(grantedRoot);

    await expect(capabilities.assertBrowsePath(insideFile)).resolves.toBe(path.resolve(insideFile));
    await expect(capabilities.assertImportFile(insideFile)).resolves.toBe(path.resolve(insideFile));
    await expect(capabilities.assertBrowsePath(outsideFile)).rejects.toThrow(/outside/i);
    await expect(capabilities.assertImportFile(outsideFile)).rejects.toThrow(/outside/i);
  });

  it("allows an explicitly dropped file without granting its parent", async () => {
    const outsideRoot = await temporaryDirectory("mage2-cap-drop-");
    const droppedFile = path.join(outsideRoot, "chosen.png");
    const siblingFile = path.join(outsideRoot, "sibling.png");
    await writeFile(droppedFile, "chosen");
    await writeFile(siblingFile, "sibling");

    const capabilities = new FilesystemCapabilities();
    capabilities.grantDroppedPath(droppedFile);

    await expect(capabilities.assertImportFile(droppedFile)).resolves.toBe(path.resolve(droppedFile));
    await expect(capabilities.assertImportFile(siblingFile)).rejects.toThrow(/outside/i);
  });

  it("issues opaque media URLs only for files inside a granted project", async () => {
    const projectRoot = await temporaryDirectory("mage2-cap-project-");
    const mediaPath = path.join(projectRoot, "assets", "scene.png");
    await mkdir(path.dirname(mediaPath), { recursive: true });
    await writeFile(mediaPath, "scene");

    const capabilities = new FilesystemCapabilities();
    await capabilities.grantProjectRoot(projectRoot);

    const mediaUrl = await capabilities.createMediaUrl(mediaPath);
    expect(mediaUrl).toMatch(/^mage2-file:\/\/asset\/[0-9a-f-]+$/u);
    expect(mediaUrl).not.toContain("scene.png");
    expect(capabilities.resolveMediaUrl(mediaUrl)).toBe(path.resolve(mediaPath));
    expect(capabilities.resolveMediaUrl(`${mediaUrl}?guess=1`)).toBeUndefined();
  });

  it("refuses a symlink or junction that escapes a granted root", async () => {
    const grantedRoot = await temporaryDirectory("mage2-cap-link-root-");
    const outsideRoot = await temporaryDirectory("mage2-cap-link-outside-");
    const outsideFile = path.join(outsideRoot, "secret.txt");
    const linkPath = path.join(grantedRoot, "escape");
    await writeFile(outsideFile, "secret");
    await symlink(outsideRoot, linkPath, process.platform === "win32" ? "junction" : "dir");

    const capabilities = new FilesystemCapabilities();
    await capabilities.grantBrowseRoot(grantedRoot);

    await expect(capabilities.assertBrowsePath(path.join(linkPath, "secret.txt"))).rejects.toThrow(/resolves outside/i);
  });

  it("checks the nearest existing parent before allowing a missing project file", async () => {
    const projectRoot = await temporaryDirectory("mage2-cap-missing-project-");
    const outsideRoot = await temporaryDirectory("mage2-cap-missing-outside-");
    const linkPath = path.join(projectRoot, "escape");
    await symlink(outsideRoot, linkPath, process.platform === "win32" ? "junction" : "dir");

    const capabilities = new FilesystemCapabilities();
    await capabilities.grantProjectRoot(projectRoot);

    await expect(
      capabilities.assertProjectPath(projectRoot, path.join(projectRoot, "not-created", "asset.png"), true)
    ).resolves.toBe(path.join(projectRoot, "not-created", "asset.png"));
    await expect(
      capabilities.assertProjectPath(projectRoot, path.join(linkPath, "not-created.png"), true)
    ).rejects.toThrow(/outside/i);
  });

  it("honors a more specific explicit grant nested beneath a broader lexical root", async () => {
    const broadRoot = await temporaryDirectory("mage2-cap-broad-");
    const outsideRoot = await temporaryDirectory("mage2-cap-specific-");
    const linkedRoot = path.join(broadRoot, "explicit-link");
    const selectedFile = path.join(linkedRoot, "selected.png");
    await writeFile(path.join(outsideRoot, "selected.png"), "selected");
    await symlink(outsideRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");

    const capabilities = new FilesystemCapabilities();
    await capabilities.grantBrowseRoot(broadRoot);
    await capabilities.grantBrowseRoot(linkedRoot);

    await expect(capabilities.assertImportFile(selectedFile)).resolves.toBe(path.resolve(selectedFile));
  });
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

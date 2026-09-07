import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { resolveStoredProjectPaths } from "./project-paths";

const openedDir = path.resolve("portable-project");

function legacyProject(root: string, api = path.win32) {
  const project = createDefaultProjectBundle("Legacy");
  project.manifest.assetRoots = [api.join(root, "assets")];
  project.assets.assets = [{
    id: "asset_legacy", kind: "image", name: "Legacy image", variants: {
      en: {
        sourcePath: api.join(root, "assets", "nested", "source.png"),
        proxyPath: api.join(root, ".mage2", "proxies", "asset_legacy.en.png"),
        posterPath: api.join(root, ".mage2", "proxies", "asset_legacy.en.thumb.png"),
        importedAt: "2026-09-08T00:00:00Z"
      }
    }
  }];
  return project;
}

describe("legacy path origin inference", () => {
  it.each([
    ["C:\\old-project", path.win32],
    ["\\\\server\\share\\old-project", path.win32],
    ["/old-project", path.posix]
  ])("relocates %s independently of the current operating system", (oldRoot, api) => {
    const result = resolveStoredProjectPaths(legacyProject(oldRoot, api), openedDir);
    expect(result.needsMigration).toBe(true);
    expect(result.project.manifest.assetRoots).toEqual([path.join(openedDir, "assets")]);
    expect(result.project.assets.assets[0]!.variants.en!.sourcePath).toBe(
      path.join(openedDir, "assets", "nested", "source.png")
    );
  });

  it("uses generated metadata when the legacy project has no registered asset root", () => {
    const project = legacyProject("C:\\old-project");
    project.manifest.assetRoots = [];
    expect(resolveStoredProjectPaths(project, openedDir).project.assets.assets[0]!.variants.en!.sourcePath)
      .toBe(path.join(openedDir, "assets", "nested", "source.png"));
  });

  it("refuses ambiguous old roots and assets outside the inferred root", () => {
    const project = legacyProject("C:\\old-project");
    project.manifest.assetRoots.push("C:\\other-project\\assets");
    expect(() => resolveStoredProjectPaths(project, openedDir)).toThrow(/no single original project folder/i);
    project.manifest.assetRoots.pop();
    project.assets.assets[0]!.variants.en!.sourcePath = "C:\\outside\\source.png";
    expect(() => resolveStoredProjectPaths(project, openedDir)).toThrow(/outside the original project folder/i);
  });

  it.each(["../outside.png", "assets\\..\\outside.png", "C:outside.png", "\\outside.png", "assets/image.png:stream"])(
    "rejects unsafe relative paths: %s", (sourcePath) => {
      const project = legacyProject("C:\\old-project");
      project.assets.assets[0]!.variants.en!.sourcePath = sourcePath;
      expect(() => resolveStoredProjectPaths(project, openedDir)).toThrow(/invalid.*project asset path/i);
    }
  );
});

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isValidGameVersion } from "@mage2/schema";
import {
  resolveRuntimePackageIcon,
  resolveRuntimePackageVersion
} from "./runtime-package-assets.mjs";

describe("runtime package assets", () => {
  it("uses the exported default-locale creator icon", async () => {
    const buildDirectory = await mkdtemp(path.join(os.tmpdir(), "mage2-runtime-icon-"));
    await mkdir(path.join(buildDirectory, "media"));
    const iconPath = path.join(buildDirectory, "media", "creator.en.png");
    await writeFile(iconPath, "png");

    await expect(
      resolveRuntimePackageIcon({
        runtimeBuildDirectory: buildDirectory,
        buildManifest: { assetMap: { asset_icon: { en: "media/creator.en.png" } } },
        projectContent: {
          manifest: {
            defaultLanguage: "en",
            playerPresentation: { appIconAssetId: "asset_icon" }
          }
        }
      })
    ).resolves.toEqual({
      assetId: "asset_icon",
      sourcePath: iconPath,
      resourceName: "creator-icon.png"
    });
  });

  it("rejects unsupported or escaping icon paths", async () => {
    const buildDirectory = await mkdtemp(path.join(os.tmpdir(), "mage2-runtime-icon-"));
    const projectContent = {
      manifest: {
        defaultLanguage: "en",
        playerPresentation: { appIconAssetId: "asset_icon" }
      }
    };

    await expect(
      resolveRuntimePackageIcon({
        runtimeBuildDirectory: buildDirectory,
        buildManifest: { assetMap: { asset_icon: { en: "../icon.png" } } },
        projectContent
      })
    ).rejects.toThrow(/outside the runtime build/i);

    await expect(
      resolveRuntimePackageIcon({
        runtimeBuildDirectory: buildDirectory,
        buildManifest: { assetMap: { asset_icon: { en: "media/icon.jpg" } } },
        projectContent
      })
    ).rejects.toThrow(/PNG/i);
  });

  it("uses the creator game version as the desktop package version", () => {
    expect(resolveRuntimePackageVersion("2.3.0-beta.1", isValidGameVersion)).toBe("2.3.0-beta.1");
    expect(() => resolveRuntimePackageVersion("release one", isValidGameVersion)).toThrow(/semantic versioning/i);
  });
});

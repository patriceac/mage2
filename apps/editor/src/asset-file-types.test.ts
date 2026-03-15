import { describe, expect, it } from "vitest";
import { type Asset } from "@mage2/schema";
import { MEDIA_DIALOG_FILTER_EXTENSIONS, classifyImportAssetPaths, collectAssetImportPaths } from "./asset-file-types";

describe("classifyImportAssetPaths", () => {
  it("keeps supported paths, rejects unsupported ones, and skips duplicates", () => {
    const result = classifyImportAssetPaths(
      [
        "C:\\media\\intro.mp4",
        "C:\\media\\bg.png",
        "C:\\media\\readme.txt",
        "C:\\media\\INTRO.mp4",
        "C:\\media\\intro.mp4",
        "   ",
        "C:\\media\\captions.vtt"
      ],
      ["C:\\media\\intro.mp4", "C:\\media\\already-there.mp3"]
    );

    expect(result).toEqual({
      importFilePaths: [
        "C:\\media\\bg.png",
        "C:\\media\\captions.vtt"
      ],
      rejectedFilePaths: ["C:\\media\\readme.txt"],
      duplicateFilePaths: ["C:\\media\\intro.mp4", "C:\\media\\INTRO.mp4", "C:\\media\\intro.mp4"]
    });
  });
});

describe("MEDIA_DIALOG_FILTER_EXTENSIONS", () => {
  it("strips leading dots for Electron file dialog filters", () => {
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS).toContain("mp4");
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS).toContain("png");
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS).toContain("mp3");
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS).toContain("vtt");
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS.some((extension) => extension.startsWith("."))).toBe(false);
  });
});

describe("collectAssetImportPaths", () => {
  it("includes both copied project paths and original import paths", () => {
    const assets: Asset[] = [
      {
        id: "asset_project_copy",
        kind: "video",
        name: "intro.mp4",
        sourcePath: "D:\\projects\\demo\\assets\\intro.mp4",
        importSourcePath: "D:\\media\\intro.mp4",
        importedAt: "2026-03-15T00:00:00.000Z"
      },
      {
        id: "asset_legacy",
        kind: "image",
        name: "legacy.png",
        sourcePath: "D:\\legacy\\legacy.png",
        importedAt: "2026-03-15T00:00:00.000Z"
      }
    ];

    expect(collectAssetImportPaths(assets)).toEqual([
      "D:\\projects\\demo\\assets\\intro.mp4",
      "D:\\media\\intro.mp4",
      "D:\\legacy\\legacy.png"
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { MEDIA_DIALOG_FILTER_EXTENSIONS, classifyImportAssetPaths } from "./asset-file-types";

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

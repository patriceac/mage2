import { describe, expect, it } from "vitest";
import {
  MEDIA_DIALOG_FILTER_EXTENSIONS,
  SUBTITLE_DIALOG_FILTER_EXTENSIONS,
  classifyImportAssetPaths,
  isBackgroundImportPath
} from "./asset-file-types";

describe("classifyImportAssetPaths", () => {
  it("keeps supported paths and leaves duplicate detection to hash-based import inspection", () => {
    const result = classifyImportAssetPaths([
      "C:\\media\\intro.mp4",
      "C:\\media\\bg.png",
      "C:\\media\\readme.txt",
      "C:\\media\\INTRO.mp4",
      "C:\\media\\intro.mp4",
      "   ",
      "C:\\media\\captions.vtt"
    ]);

    expect(result).toEqual({
      importFilePaths: [
        "C:\\media\\intro.mp4",
        "C:\\media\\bg.png",
        "C:\\media\\INTRO.mp4",
        "C:\\media\\intro.mp4"
      ],
      rejectedFilePaths: ["C:\\media\\readme.txt", "C:\\media\\captions.vtt"],
      duplicateFilePaths: []
    });
  });
});

describe("MEDIA_DIALOG_FILTER_EXTENSIONS", () => {
  it("strips leading dots for Electron file dialog filters", () => {
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS).toContain("mp4");
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS).toContain("png");
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS).not.toContain("mp3");
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS.some((extension) => extension.startsWith("."))).toBe(false);
  });
});

describe("SUBTITLE_DIALOG_FILTER_EXTENSIONS", () => {
  it("keeps subtitle imports separate from generic asset imports", () => {
    expect(SUBTITLE_DIALOG_FILTER_EXTENSIONS).toEqual(["srt", "vtt"]);
  });
});

describe("isBackgroundImportPath", () => {
  it("accepts images and videos while rejecting unsupported file types", () => {
    expect(isBackgroundImportPath("C:\\media\\scene.mp4")).toBe(true);
    expect(isBackgroundImportPath("C:\\media\\scene.PNG")).toBe(true);
    expect(isBackgroundImportPath("C:\\media\\scene.txt")).toBe(false);
  });
});

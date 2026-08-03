import { describe, expect, it } from "vitest";
import {
  MEDIA_DIALOG_FILTER_EXTENSIONS,
  FOREGROUND_MEDIA_IMPORT_EXTENSIONS,
  SCENE_AUDIO_IMPORT_EXTENSIONS,
  classifyImportAssetPaths,
  isBackgroundImportPath,
  isForegroundMediaImportPath,
  isImageImportPath,
  isInventoryImageImportPath,
  isSceneAudioImportPath,
  isVideoImportPath
} from "./asset-file-types";

describe("classifyImportAssetPaths", () => {
  it("keeps supported paths and leaves duplicate detection to hash-based import inspection", () => {
    const result = classifyImportAssetPaths([
      "C:\\media\\intro.mp4",
      "C:\\media\\bg.png",
      "C:\\media\\ambience.mp3",
      "C:\\media\\readme.txt",
      "C:\\media\\INTRO.mp4",
      "C:\\media\\intro.mp4",
      "   ",
      "C:\\media\\timing.vtt"
    ]);

    expect(result).toEqual({
      importFilePaths: [
        "C:\\media\\intro.mp4",
        "C:\\media\\bg.png",
        "C:\\media\\ambience.mp3",
        "C:\\media\\INTRO.mp4",
        "C:\\media\\intro.mp4"
      ],
      rejectedFilePaths: ["C:\\media\\readme.txt", "C:\\media\\timing.vtt"],
      duplicateFilePaths: []
    });
  });
});

describe("MEDIA_DIALOG_FILTER_EXTENSIONS", () => {
  it("strips leading dots for Electron file dialog filters", () => {
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS).toContain("mp4");
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS).toContain("png");
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS).toContain("mp3");
    expect(MEDIA_DIALOG_FILTER_EXTENSIONS.some((extension) => extension.startsWith("."))).toBe(false);
  });
});

describe("SCENE_AUDIO_IMPORT_EXTENSIONS", () => {
  it("tracks the supported dedicated audio-import file types", () => {
    expect(SCENE_AUDIO_IMPORT_EXTENSIONS).toContain(".mp3");
    expect(SCENE_AUDIO_IMPORT_EXTENSIONS).toContain(".wav");
  });
});

describe("FOREGROUND_MEDIA_IMPORT_EXTENSIONS", () => {
  it("accepts audio and video without treating images as triggered foreground media", () => {
    expect(FOREGROUND_MEDIA_IMPORT_EXTENSIONS).toContain(".mp4");
    expect(FOREGROUND_MEDIA_IMPORT_EXTENSIONS).toContain(".wav");
    expect(isForegroundMediaImportPath("C:\\media\\voice.mp3")).toBe(true);
    expect(isForegroundMediaImportPath("C:\\media\\cut-in.WEBM")).toBe(true);
    expect(isForegroundMediaImportPath("C:\\media\\portrait.png")).toBe(false);
  });
});

describe("isBackgroundImportPath", () => {
  it("accepts images and videos while rejecting unsupported file types", () => {
    expect(isBackgroundImportPath("C:\\media\\scene.mp4")).toBe(true);
    expect(isBackgroundImportPath("C:\\media\\scene.PNG")).toBe(true);
    expect(isBackgroundImportPath("C:\\media\\scene.mp3")).toBe(false);
    expect(isBackgroundImportPath("C:\\media\\scene.txt")).toBe(false);
  });
});

describe("dedicated visual import path checks", () => {
  it("distinguishes videos from images for scene background rules", () => {
    expect(isVideoImportPath("C:\\media\\scene.mp4")).toBe(true);
    expect(isVideoImportPath("C:\\media\\scene.png")).toBe(false);
    expect(isImageImportPath("C:\\media\\scene.PNG")).toBe(true);
    expect(isImageImportPath("C:\\media\\scene.webm")).toBe(false);
  });
});

describe("isSceneAudioImportPath", () => {
  it("accepts supported audio files while rejecting visual file types", () => {
    expect(isSceneAudioImportPath("C:\\media\\scene.mp3")).toBe(true);
    expect(isSceneAudioImportPath("C:\\media\\scene.WAV")).toBe(true);
    expect(isSceneAudioImportPath("C:\\media\\scene.png")).toBe(false);
  });
});

describe("isInventoryImageImportPath", () => {
  it("accepts supported image files while rejecting audio and video", () => {
    expect(isInventoryImageImportPath("C:\\media\\item.webp")).toBe(true);
    expect(isInventoryImageImportPath("C:\\media\\item.SVG")).toBe(true);
    expect(isInventoryImageImportPath("C:\\media\\item.mp3")).toBe(false);
    expect(isInventoryImageImportPath("C:\\media\\item.mp4")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { isRedoShortcut, isSaveShortcut, isUndoShortcut } from "./keyboard-shortcuts";

describe("isSaveShortcut", () => {
  it("matches Ctrl+S", () => {
    expect(
      isSaveShortcut({
        key: "s",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false
      })
    ).toBe(true);
  });

  it("matches Cmd+S", () => {
    expect(
      isSaveShortcut({
        key: "S",
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: false
      })
    ).toBe(true);
  });

  it("does not match with modifier combinations reserved for other shortcuts", () => {
    expect(
      isSaveShortcut({
        key: "s",
        ctrlKey: true,
        metaKey: false,
        altKey: true,
        shiftKey: false
      })
    ).toBe(false);
    expect(
      isSaveShortcut({
        key: "s",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true
      })
    ).toBe(false);
  });

  it("ignores unrelated keys", () => {
    expect(
      isSaveShortcut({
        key: "p",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false
      })
    ).toBe(false);
  });
});

describe("isUndoShortcut", () => {
  it("matches Ctrl+Z and Cmd+Z", () => {
    expect(
      isUndoShortcut({
        key: "z",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false
      })
    ).toBe(true);
    expect(
      isUndoShortcut({
        key: "Z",
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: false
      })
    ).toBe(true);
  });

  it("does not match shifted or alt-modified variants", () => {
    expect(
      isUndoShortcut({
        key: "z",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true
      })
    ).toBe(false);
    expect(
      isUndoShortcut({
        key: "z",
        ctrlKey: true,
        metaKey: false,
        altKey: true,
        shiftKey: false
      })
    ).toBe(false);
  });
});

describe("isRedoShortcut", () => {
  it("matches Ctrl+Y and Cmd+Shift+Z", () => {
    expect(
      isRedoShortcut({
        key: "y",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false
      })
    ).toBe(true);
    expect(
      isRedoShortcut({
        key: "Z",
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: true
      })
    ).toBe(true);
  });

  it("does not match Ctrl+Shift+Z, Cmd+Y, or alt-modified variants", () => {
    expect(
      isRedoShortcut({
        key: "z",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true
      })
    ).toBe(false);
    expect(
      isRedoShortcut({
        key: "y",
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: false
      })
    ).toBe(false);
    expect(
      isRedoShortcut({
        key: "y",
        ctrlKey: true,
        metaKey: false,
        altKey: true,
        shiftKey: false
      })
    ).toBe(false);
  });
});

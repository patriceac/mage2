import { describe, expect, it } from "vitest";
import { isSaveShortcut } from "./keyboard-shortcuts";

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

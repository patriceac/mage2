import { describe, expect, it } from "vitest";
import {
  formatFileBrowserModified,
  formatFileBrowserSize,
  resolveDialogFocusLoopIndex,
  shouldToggleFileSelectionOnClick
} from "./dialogs";

describe("shouldToggleFileSelectionOnClick", () => {
  it("keeps single clicks selectable", () => {
    expect(shouldToggleFileSelectionOnClick(1)).toBe(true);
  });

  it("prevents the second click in a double click from toggling selection back off", () => {
    expect(shouldToggleFileSelectionOnClick(2)).toBe(false);
    expect(shouldToggleFileSelectionOnClick(3)).toBe(false);
  });
});

describe("dialog focus loop", () => {
  it("wraps forward and backward at modal boundaries", () => {
    expect(resolveDialogFocusLoopIndex(0, 3, false)).toBe(1);
    expect(resolveDialogFocusLoopIndex(2, 3, false)).toBe(0);
    expect(resolveDialogFocusLoopIndex(0, 3, true)).toBe(2);
    expect(resolveDialogFocusLoopIndex(2, 3, true)).toBe(1);
  });

  it("enters the first or last focusable control when focus starts outside", () => {
    expect(resolveDialogFocusLoopIndex(-1, 4, false)).toBe(0);
    expect(resolveDialogFocusLoopIndex(-1, 4, true)).toBe(3);
    expect(resolveDialogFocusLoopIndex(-1, 0, false)).toBe(-1);
  });
});

describe("file browser locale formatting", () => {
  it("formats modified dates with the active editor locale", () => {
    const modifiedAtMs = Date.UTC(2026, 7, 4, 14, 5);
    const options: Intl.DateTimeFormatOptions = {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    };

    expect(formatFileBrowserModified(modifiedAtMs, "fr")).toBe(
      new Intl.DateTimeFormat("fr", options).format(new Date(modifiedAtMs))
    );
    expect(formatFileBrowserModified(undefined, "ar")).toBe("—");
  });

  it("formats file sizes with localized numbers and units", () => {
    const entry = { name: "clip.mp4", path: "C:\\clip.mp4", kind: "file" as const, sizeBytes: 1536 };
    expect(formatFileBrowserSize(entry, "fr")).toBe(
      new Intl.NumberFormat("fr", {
        style: "unit",
        unit: "kilobyte",
        unitDisplay: "short",
        maximumFractionDigits: 1
      }).format(1.5)
    );
  });
});

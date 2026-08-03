import { describe, expect, it } from "vitest";
import { resolveDialogFocusLoopIndex, shouldToggleFileSelectionOnClick } from "./dialogs";

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

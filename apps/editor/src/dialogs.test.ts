import { describe, expect, it } from "vitest";
import { shouldToggleFileSelectionOnClick } from "./dialogs";

describe("shouldToggleFileSelectionOnClick", () => {
  it("keeps single clicks selectable", () => {
    expect(shouldToggleFileSelectionOnClick(1)).toBe(true);
  });

  it("prevents the second click in a double click from toggling selection back off", () => {
    expect(shouldToggleFileSelectionOnClick(2)).toBe(false);
    expect(shouldToggleFileSelectionOnClick(3)).toBe(false);
  });
});

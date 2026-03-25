import { describe, expect, it } from "vitest";
import { formatEditorWindowTitle } from "./window-title";

describe("formatEditorWindowTitle", () => {
  it("uses the app name when no project is open", () => {
    expect(formatEditorWindowTitle()).toBe("MAGE2 Editor");
  });

  it("shows the project name when the current project is saved", () => {
    expect(formatEditorWindowTitle("Castle Escape")).toBe("Castle Escape - MAGE2 Editor");
  });

  it("adds an unsaved indicator when the current project is dirty", () => {
    expect(formatEditorWindowTitle("Castle Escape", true)).toBe("Castle Escape - MAGE2 Editor [Unsaved]");
  });
});

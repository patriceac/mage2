import { describe, expect, it } from "vitest";
import { EDITOR_TITLE_BAR_OVERLAY_HEIGHT, resolveEditorWindowChromeOptions } from "./window-chrome";

describe("resolveEditorWindowChromeOptions", () => {
  it("enables a title-bar overlay on Windows", () => {
    expect(resolveEditorWindowChromeOptions("win32")).toEqual({
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: "#0c1218",
        symbolColor: "#f7fafc",
        height: EDITOR_TITLE_BAR_OVERLAY_HEIGHT
      }
    });
  });

  it("keeps a hidden title bar without overlay controls on macOS", () => {
    expect(resolveEditorWindowChromeOptions("darwin")).toEqual({
      titleBarStyle: "hidden"
    });
  });
});

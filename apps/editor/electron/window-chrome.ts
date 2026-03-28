import type { BrowserWindowConstructorOptions } from "electron";

export const EDITOR_TITLE_BAR_OVERLAY_HEIGHT = 56;

const TITLE_BAR_OVERLAY_COLOR = "#0c1218";
const TITLE_BAR_OVERLAY_SYMBOL_COLOR = "#f7fafc";

export function resolveEditorWindowChromeOptions(
  platform = process.platform
): Pick<BrowserWindowConstructorOptions, "titleBarStyle" | "titleBarOverlay"> {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hidden"
    };
  }

  return {
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: TITLE_BAR_OVERLAY_COLOR,
      symbolColor: TITLE_BAR_OVERLAY_SYMBOL_COLOR,
      height: EDITOR_TITLE_BAR_OVERLAY_HEIGHT
    }
  };
}

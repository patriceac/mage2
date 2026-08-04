import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  formatRuntimeExportClock,
  RuntimeExportProgressOverlay
} from "./RuntimeExportProgressOverlay";

describe("runtime export progress overlay", () => {
  it("shows a measurable phase, percent, elapsed time, and ETA", () => {
    const markup = renderToStaticMarkup(
      React.createElement(RuntimeExportProgressOverlay, {
        progress: {
          format: "windows",
          phase: "compressing",
          progress: 0.61,
          elapsedSeconds: 66.9,
          estimatedSecondsRemaining: 125,
          payloadBytes: 356 * 1024 * 1024
        }
      })
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="61"');
    expect(markup).toContain('data-runtime-export-progress-phase="compressing"');
    expect(markup).toContain("Compressing executable");
    expect(markup).toContain('data-runtime-export-elapsed="true">1:06');
    expect(markup).toContain('data-runtime-export-eta="true">~2:05');
    expect(markup).toContain("The selected destination is replaced only after the export succeeds.");
  });

  it("shows a truthful terminal state only at complete progress", () => {
    const markup = renderToStaticMarkup(
      React.createElement(RuntimeExportProgressOverlay, {
        progress: {
          format: "web",
          phase: "complete",
          progress: 1,
          elapsedSeconds: 4.2,
          estimatedSecondsRemaining: 0
        }
      })
    );

    expect(markup).toContain('aria-valuenow="100"');
    expect(markup).toContain('aria-busy="false"');
    expect(markup).toContain("Export complete");
    expect(markup).toContain('data-runtime-export-eta="true">Export complete');
  });

  it("formats elapsed time down and remaining time up", () => {
    expect(formatRuntimeExportClock(66.9, "elapsed")).toBe("1:06");
    expect(formatRuntimeExportClock(66.1, "remaining")).toBe("1:07");
    expect(formatRuntimeExportClock(3_661, "elapsed")).toBe("1:01:01");
  });
});

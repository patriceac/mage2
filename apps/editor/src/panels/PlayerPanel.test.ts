import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { PlayerPanel } from "./PlayerPanel";

describe("PlayerPanel", () => {
  it("exposes the bounded creator controls and the shared shell preview", () => {
    const project = createDefaultProjectBundle("Player authoring");
    const markup = renderToStaticMarkup(
      React.createElement(PlayerPanel, {
        project,
        mutateProject: () => undefined,
        setStatusMessage: () => undefined
      })
    );

    expect(markup).toContain("Landscape-first shell");
    expect(markup).toContain('data-player-screen="title"');
    expect(markup).toContain("Show title screen on launch");
    expect(markup).toContain("Title alignment");
    expect(markup).toContain("Save compatibility version");
    expect(markup).toContain("Use a square PNG");
    expect(markup).toContain("Use semantic versioning");
    expect(markup).toContain("Show a landscape hint in portrait");
    expect(markup).toContain("cinematic v1");
  });
});

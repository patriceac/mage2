import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, createInitialSaveState } from "@mage2/schema";
import { createPlayerController } from "./index";

describe("player controller", () => {
  it("activates hotspots inside their timing window", () => {
    const project = createDefaultProjectBundle();
    project.assets.assets.push({
      id: "asset_placeholder",
      kind: "image",
      name: "Placeholder",
      sourcePath: "placeholder.png",
      importedAt: new Date().toISOString()
    });

    const controller = createPlayerController(project);
    expect(controller.getVisibleHotspots(1000)).toHaveLength(1);
    expect(controller.getVisibleHotspots(35000)).toHaveLength(0);
  });

  it("drops legacy currentSegmentId values from loaded save state", () => {
    const project = createDefaultProjectBundle();
    const controller = createPlayerController(
      project,
      {
        ...createInitialSaveState(project),
        playheadMs: 1250,
        currentSegmentId: "segment_intro"
      } as unknown as Parameters<typeof createPlayerController>[1]
    );

    expect(controller.getSnapshot().saveState.playheadMs).toBe(1250);
    expect(controller.getSnapshot().saveState).not.toHaveProperty("currentSegmentId");
    expect(controller.save()).not.toHaveProperty("currentSegmentId");
  });
});

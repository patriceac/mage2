import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
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
});

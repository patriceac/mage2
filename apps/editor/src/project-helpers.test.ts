import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { addHotspot } from "./project-helpers";

describe("addHotspot", () => {
  it("keeps hotspot numbers increasing after earlier hotspots are deleted", () => {
    const project = createDefaultProjectBundle("Hotspot numbering");
    const scene = project.scenes.items[0];
    scene.hotspots = [];

    addHotspot(project, scene.id, 0.2, 0.2);
    addHotspot(project, scene.id, 0.4, 0.4);
    addHotspot(project, scene.id, 0.6, 0.6);

    expect(scene.hotspots.map((hotspot) => hotspot.name)).toEqual([
      "Hotspot 1",
      "Hotspot 2",
      "Hotspot 3"
    ]);

    scene.hotspots.splice(0, 1);

    const hotspot = addHotspot(project, scene.id, 0.8, 0.8);

    expect(hotspot?.name).toBe("Hotspot 4");
    expect(project.strings.values[hotspot!.labelTextId]).toBe("Hotspot 4");
    expect(
      hotspot?.polygon?.map((point) => ({
        x: Number(point.x.toFixed(2)),
        y: Number(point.y.toFixed(2))
      }))
    ).toEqual([
      { x: 0.72, y: 0.72 },
      { x: 0.88, y: 0.72 },
      { x: 0.88, y: 0.88 },
      { x: 0.72, y: 0.88 }
    ]);
    expect(scene.hotspots.map((entry) => entry.name)).toEqual([
      "Hotspot 2",
      "Hotspot 3",
      "Hotspot 4"
    ]);
  });
});

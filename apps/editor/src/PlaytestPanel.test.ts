import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { addInventoryItem } from "./project-helpers";
import { resolvePlaytestInventorySummary } from "./PlaytestPanel";

describe("resolvePlaytestInventorySummary", () => {
  it("prefers localized inventory names over plain item names", () => {
    const project = createDefaultProjectBundle("Playtest inventory");
    const item = addInventoryItem(project);
    item.name = "Lantern";
    project.strings.values[item.textId] = "Localized Lantern";

    expect(resolvePlaytestInventorySummary([item], project.strings.values)).toBe("Localized Lantern");
  });

  it("returns Empty when there are no inventory items", () => {
    expect(resolvePlaytestInventorySummary([], {})).toBe("Empty");
  });
});

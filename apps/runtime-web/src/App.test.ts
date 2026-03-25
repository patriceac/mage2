import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, toExportProjectData } from "@mage2/schema";
import { resolveRuntimeHeaderContent, resolveRuntimeHotspotVisuals, resolveRuntimeInventoryItems } from "./App";

describe("resolveRuntimeHeaderContent", () => {
  it("keeps only project identity in the runtime header", () => {
    const content = toExportProjectData(createDefaultProjectBundle("Runtime Header"));

    expect(resolveRuntimeHeaderContent(content)).toEqual({
      projectName: "Runtime Header"
    });
  });

  it("maps inventory items to their localized labels and exported image paths", () => {
    const project = createDefaultProjectBundle("Runtime Inventory");
    project.assets.assets.push({
      id: "asset_item",
      kind: "image",
      name: "lantern.png",
      category: "inventory",
      variants: {
        en: {
          sourcePath: "media/asset_item.en.png",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.inventory.items.push({
      id: "item_lantern",
      name: "Lantern",
      textId: "text.item_lantern.name",
      imageAssetId: "asset_item"
    });
    project.strings.byLocale.en["text.item_lantern.name"] = "Brass Lantern";

    const items = resolveRuntimeInventoryItems(
      project.inventory.items,
      project.assets.assets,
      project.manifest.defaultLanguage,
      project.strings.byLocale.en
    );

    expect(items).toEqual([
      {
        id: "item_lantern",
        label: "Brass Lantern",
        imageSrc: "media/asset_item.en.png"
      }
    ]);
  });

  it("maps inventory-backed hotspot art without depending on hotspot debug visibility", () => {
    const project = createDefaultProjectBundle("Runtime Hotspots");
    project.assets.assets.push({
      id: "asset_item",
      kind: "image",
      name: "lantern.png",
      category: "inventory",
      variants: {
        en: {
          sourcePath: "media/asset_item.en.png",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.inventory.items.push({
      id: "item_lantern",
      name: "Lantern",
      textId: "text.item_lantern.name",
      imageAssetId: "asset_item"
    });
    project.strings.byLocale.en["text.item_lantern.name"] = "Brass Lantern";
    project.scenes.items[0]!.hotspots[0]!.inventoryItemId = "item_lantern";

    const visuals = resolveRuntimeHotspotVisuals(
      project.scenes.items[0]!.hotspots,
      project.inventory.items,
      project.assets.assets,
      project.manifest.defaultLanguage,
      project.strings.byLocale.en
    );

    expect(visuals).toEqual({
      [project.scenes.items[0]!.hotspots[0]!.id]: {
        imageSrc: "media/asset_item.en.png",
        alt: "Brass Lantern"
      }
    });
  });
});

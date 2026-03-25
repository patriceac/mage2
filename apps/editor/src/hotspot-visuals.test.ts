import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { resolveHotspotVisuals } from "./hotspot-visuals";

describe("resolveHotspotVisuals", () => {
  it("maps item-backed hotspots to inventory art source paths", () => {
    const project = createDefaultProjectBundle("Hotspot visuals");
    project.assets.assets.push({
      id: "asset_item",
      kind: "image",
      name: "lantern.png",
      category: "inventory",
      variants: {
        en: {
          sourcePath: "D:\\project\\assets\\lantern.png",
          proxyPath: "D:\\project\\cache\\lantern.webp",
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

    expect(
      resolveHotspotVisuals({
        hotspots: project.scenes.items[0]!.hotspots,
        inventoryItems: project.inventory.items,
        assets: project.assets.assets,
        locale: project.manifest.defaultLanguage,
        strings: project.strings.byLocale.en
      })
    ).toEqual({
      [project.scenes.items[0]!.hotspots[0]!.id]: {
        sourcePath: "D:\\project\\cache\\lantern.webp",
        alt: "Brass Lantern"
      }
    });
  });

  it("skips linked items that no longer have valid inventory art", () => {
    const project = createDefaultProjectBundle("Hotspot visuals invalid");
    project.assets.assets.push({
      id: "asset_background",
      kind: "image",
      name: "background.png",
      category: "background",
      variants: {
        en: {
          sourcePath: "D:\\project\\assets\\background.png",
          importedAt: new Date().toISOString()
        }
      }
    });
    project.inventory.items.push({
      id: "item_lantern",
      name: "Lantern",
      textId: "text.item_lantern.name",
      imageAssetId: "asset_background"
    });
    project.scenes.items[0]!.hotspots[0]!.inventoryItemId = "item_lantern";

    expect(
      resolveHotspotVisuals({
        hotspots: project.scenes.items[0]!.hotspots,
        inventoryItems: project.inventory.items,
        assets: project.assets.assets,
        locale: project.manifest.defaultLanguage,
        strings: project.strings.byLocale.en
      })
    ).toEqual({});
  });
});

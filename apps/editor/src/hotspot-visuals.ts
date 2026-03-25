import { resolveAssetCategory, resolveAssetVariant, type Asset, type Hotspot, type InventoryItem } from "@mage2/schema";

export interface HotspotVisual {
  sourcePath: string;
  alt: string;
}

interface ResolveHotspotVisualsOptions {
  hotspots: Hotspot[];
  inventoryItems: InventoryItem[];
  assets: Asset[];
  locale: string;
  strings: Record<string, string>;
}

export function resolveHotspotVisuals({
  hotspots,
  inventoryItems,
  assets,
  locale,
  strings
}: ResolveHotspotVisualsOptions): Record<string, HotspotVisual> {
  const itemsById = new Map(inventoryItems.map((item) => [item.id, item] as const));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset] as const));
  const visuals: Record<string, HotspotVisual> = {};

  for (const hotspot of hotspots) {
    if (!hotspot.inventoryItemId) {
      continue;
    }

    const item = itemsById.get(hotspot.inventoryItemId);
    if (!item?.imageAssetId) {
      continue;
    }

    const asset = assetsById.get(item.imageAssetId);
    if (!asset || asset.kind !== "image" || resolveAssetCategory(asset) !== "inventory") {
      continue;
    }

    const variant = resolveAssetVariant(asset, locale);
    const sourcePath = variant?.proxyPath ?? variant?.sourcePath;
    if (!sourcePath) {
      continue;
    }

    visuals[hotspot.id] = {
      sourcePath,
      alt: strings[item.textId] ?? item.name ?? hotspot.name ?? hotspot.id
    };
  }

  return visuals;
}

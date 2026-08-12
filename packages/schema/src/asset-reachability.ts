import type { ProjectBundle } from "./types";

export interface ProjectAssetReachability {
  totalAssetCount: number;
  referencedAssetCount: number;
  unusedAssetCount: number;
  referencedAssetIds: string[];
  unusedAssetIds: string[];
}

/**
 * Collects every explicit media reference understood by the authored project
 * schema. Assets that are not returned stay in the project library, but do not
 * need to be copied into a playable export.
 */
export function collectReferencedAssetIds(project: ProjectBundle): Set<string> {
  const referencedAssetIds = new Set<string>();
  const addReference = (assetId: string | undefined) => {
    if (assetId) {
      referencedAssetIds.add(assetId);
    }
  };

  for (const scene of project.scenes.items) {
    addReference(scene.backgroundAssetId);
    addReference(scene.sceneAudioAssetId);
    for (const hotspot of scene.hotspots) {
      addReference(hotspot.mediaAssetId);
    }
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      addReference(node.mediaAssetId);
    }
  }

  for (const item of project.inventory.items) {
    addReference(item.imageAssetId);
  }

  for (const group of project.dialogues.responseGroups) {
    for (const entry of group.entries) {
      if (entry.kind !== "text") {
        addReference(entry.assetId);
      }
    }
  }

  const presentation = project.manifest.playerPresentation;
  addReference(presentation.titleBackgroundAssetId);
  addReference(presentation.logoAssetId);
  addReference(presentation.appIconAssetId);

  return referencedAssetIds;
}

export function analyzeProjectAssetReachability(project: ProjectBundle): ProjectAssetReachability {
  const referencedAssetIdSet = collectReferencedAssetIds(project);
  const referencedAssetIds: string[] = [];
  const unusedAssetIds: string[] = [];

  for (const asset of project.assets.assets) {
    if (referencedAssetIdSet.has(asset.id)) {
      referencedAssetIds.push(asset.id);
    } else {
      unusedAssetIds.push(asset.id);
    }
  }

  return {
    totalAssetCount: project.assets.assets.length,
    referencedAssetCount: referencedAssetIds.length,
    unusedAssetCount: unusedAssetIds.length,
    referencedAssetIds,
    unusedAssetIds
  };
}

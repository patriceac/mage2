import type { ProjectBundle } from "./types";
import { visitProjectEffects } from "./effects";

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
    addReference(scene.soundscape?.music?.assetId);
    addReference(scene.soundscape?.ambience?.assetId);
    for (const region of scene.ambient?.regions ?? []) {
      addReference(region.fallbackAssetId);
      addReference(region.mask.assetId);
      for (const clip of region.clips) addReference(clip.assetId);
    }
    for (const hotspot of scene.hotspots) {
      addReference(hotspot.mediaAssetId);
    }
  }

  visitProjectEffects(project, (effect) => {
    if (effect.type === "playSound") addReference(effect.assetId);
  });

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      addReference(node.mediaAssetId);
    }
  }

  for (const assetId of Object.values(project.dialogues.speakerPortraits)) {
    addReference(assetId);
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

import { resolveAssetCategory, type Hotspot, type ProjectBundle } from "@mage2/schema";
import { STARTER_PLACEHOLDER_ASSET_ID } from "./project-helpers";

export type FirstProjectChecklistStepId = "media" | "interaction" | "validation";

export interface FirstProjectChecklistStep {
  id: FirstProjectChecklistStepId;
  complete: boolean;
  title: string;
  description: string;
}

export interface FirstProjectChecklistState {
  isStarterProject: boolean;
  shouldShow: boolean;
  completedCount: number;
  sceneId?: string;
  hotspotId?: string;
  steps: FirstProjectChecklistStep[];
}

const STARTER_SCENE_ID = "scene_intro";
const STARTER_HOTSPOT_ID = "hotspot_inspect";

export function resolveFirstProjectChecklist(
  project: ProjectBundle,
  validationValid: boolean,
  validationIssueCount: number
): FirstProjectChecklistState {
  const starterScene =
    project.scenes.items.find((scene) => scene.id === STARTER_SCENE_ID) ??
    project.scenes.items.find((scene) => scene.backgroundAssetId === STARTER_PLACEHOLDER_ASSET_ID) ??
    project.scenes.items.find((scene) => scene.hotspots.some((hotspot) => hotspot.id === STARTER_HOTSPOT_ID));
  const starterHotspot = starterScene?.hotspots.find((hotspot) => hotspot.id === STARTER_HOTSPOT_ID);
  const usesStarterMedia = project.scenes.items.some(
    (scene) => scene.backgroundAssetId === STARTER_PLACEHOLDER_ASSET_ID
  );
  const hasStarterHotspot = project.scenes.items.some((scene) =>
    scene.hotspots.some((hotspot) => hotspot.id === STARTER_HOTSPOT_ID)
  );
  const isStarterProject = usesStarterMedia || hasStarterHotspot;

  const sceneAsset = starterScene?.backgroundAssetId
    ? project.assets.assets.find((asset) => asset.id === starterScene.backgroundAssetId)
    : undefined;
  const sceneMediaComplete = Boolean(
    starterScene?.backgroundAssetId &&
      starterScene.backgroundAssetId !== STARTER_PLACEHOLDER_ASSET_ID &&
      sceneAsset &&
      resolveAssetCategory(sceneAsset) === "background" &&
      (sceneAsset.kind === "image" || sceneAsset.kind === "video")
  );
  const interactionComplete = project.scenes.items.some((scene) =>
    scene.hotspots.some((hotspot) => isMeaningfulStarterInteraction(hotspot))
  );

  const steps: FirstProjectChecklistStep[] = [
    {
      id: "media",
      complete: sceneMediaComplete,
      title: "Replace the starter scene",
      description: sceneMediaComplete
        ? "Your opening scene uses project media."
        : "Upload your own image or video for the opening scene."
    },
    {
      id: "interaction",
      complete: interactionComplete,
      title: "Wire the first interaction",
      description: interactionComplete
        ? "At least one scene hotspot has a real player-facing purpose."
        : "Turn the placeholder hotspot into a transition, dialogue, pickup, or placement."
    },
    {
      id: "validation",
      complete: validationValid,
      title: "Clear project issues",
      description: validationValid
        ? "The project is valid and ready to playtest."
        : `Resolve ${validationIssueCount} validation ${validationIssueCount === 1 ? "issue" : "issues"} before playtesting.`
    }
  ];
  const completedCount = steps.filter((step) => step.complete).length;

  return {
    isStarterProject,
    shouldShow: isStarterProject && completedCount < steps.length,
    completedCount,
    sceneId: starterScene?.id,
    hotspotId: starterHotspot?.id,
    steps
  };
}

function isMeaningfulStarterInteraction(hotspot: Hotspot): boolean {
  const hasBehavior = Boolean(
    hotspot.targetSceneId ||
      hotspot.dialogueTreeId ||
      hotspot.inventoryItemId ||
      hotspot.placedInventoryItemId ||
      hotspot.requiredItemIds.length > 0 ||
      hotspot.conditions.some((condition) => condition.type !== "always") ||
      hotspot.effects.length > 0
  );

  return hotspot.id === STARTER_HOTSPOT_ID ? hasBehavior : hasBehavior || Boolean(hotspot.commentTextId);
}

import { resolveAssetCategory, type Hotspot, type ProjectBundle } from "@mage2/schema";
import { STARTER_PLACEHOLDER_ASSET_ID } from "./project-helpers";
import type { EditorTranslator } from "./i18n/translate";

export type FirstProjectChecklistStepId = "media" | "interaction" | "player" | "validation";

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
  validationIssueCount: number,
  t: EditorTranslator = (source, params) => source.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name) =>
    Object.prototype.hasOwnProperty.call(params ?? {}, name) ? String(params?.[name]) : placeholder
  )
): FirstProjectChecklistState {
  const starterScene =
    project.scenes.items.find((scene) => scene.id === STARTER_SCENE_ID) ??
    project.scenes.items.find((scene) => scene.backgroundAssetId === STARTER_PLACEHOLDER_ASSET_ID) ??
    project.scenes.items.find((scene) => scene.hotspots.some((hotspot) => hotspot.id === STARTER_HOTSPOT_ID));
  const starterHotspot = starterScene?.hotspots.find((hotspot) => hotspot.id === STARTER_HOTSPOT_ID);
  const usesStarterMedia = project.scenes.items.some((scene) => {
    const asset = project.assets.assets.find((entry) => entry.id === scene.backgroundAssetId);
    return scene.backgroundAssetId === STARTER_PLACEHOLDER_ASSET_ID || asset?.provenance?.source === "starter-kit";
  });
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
      sceneAsset.provenance?.source !== "starter-kit" &&
      resolveAssetCategory(sceneAsset) === "background" &&
      (sceneAsset.kind === "image" || sceneAsset.kind === "video")
  );
  const interactionComplete = project.scenes.items.some((scene) =>
    scene.hotspots.some((hotspot) => isMeaningfulStarterInteraction(hotspot))
  );
  const titleAsset = project.assets.assets.find(
    (asset) => asset.id === project.manifest.playerPresentation.titleBackgroundAssetId
  );
  const playerPresentationComplete =
    !project.manifest.playerPresentation.titleScreenEnabled ||
    Boolean(
      titleAsset &&
        resolveAssetCategory(titleAsset) === "player" &&
        titleAsset.kind === "image" &&
        project.manifest.gameVersion.trim()
    );

  const steps: FirstProjectChecklistStep[] = [
    {
      id: "media",
      complete: sceneMediaComplete,
      title: t("Replace the starter scene"),
      description: sceneMediaComplete
        ? t("Your opening scene uses project media.")
        : t("Upload your own image or video for the opening scene.")
    },
    {
      id: "interaction",
      complete: interactionComplete,
      title: t("Wire the first interaction"),
      description: interactionComplete
        ? t("At least one scene hotspot has a real player-facing purpose.")
        : t("Turn the placeholder hotspot into a transition, dialogue, pickup, or placement.")
    },
    {
      id: "player",
      complete: playerPresentationComplete,
      title: t("Review the player experience"),
      description: playerPresentationComplete
        ? t("The title screen and release identity have a usable starting point.")
        : t("Choose title artwork and set the version players will see.")
    },
    {
      id: "validation",
      complete: validationValid,
      title: t("Clear project issues"),
      description: validationValid
        ? t("The project is valid and ready to playtest.")
        : validationIssueCount === 1
          ? t("Resolve {count} validation issue before playtesting.", { count: validationIssueCount })
          : t("Resolve {count} validation issues before playtesting.", { count: validationIssueCount })
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

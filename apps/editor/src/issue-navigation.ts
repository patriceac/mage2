import type { ProjectBundle, ValidationIssue } from "@mage2/schema";
import type { EditorNavigationTarget } from "./navigation-target";
import { resolveProjectTextUsageForIssue } from "./project-text";

export function resolveSceneNavigationTarget(
  project: ProjectBundle,
  sceneId: string | undefined
): EditorNavigationTarget | undefined {
  if (!sceneId) {
    return undefined;
  }

  const scene = project.scenes.items.find((entry) => entry.id === sceneId);
  if (!scene) {
    return undefined;
  }

  return {
    label: scene.name,
    tab: "scenes",
    locationId: scene.locationId,
    sceneId: scene.id
  };
}

export function resolveIssueNavigation(
  project: ProjectBundle,
  issue: ValidationIssue
): EditorNavigationTarget | undefined {
  const projectTextUsage = resolveProjectTextUsageForIssue(project, issue);
  if (projectTextUsage) {
    return {
      label: projectTextUsage.textId,
      tab: "localization",
      textId: projectTextUsage.textId
    };
  }

  const { entityId } = issue;

  if (entityId) {
    const location = project.locations.items.find((entry) => entry.id === entityId);
    if (location) {
      return {
        label: location.name,
        tab: "world",
        locationId: location.id,
        sceneId: location.sceneIds[0]
      };
    }

    const scene = project.scenes.items.find((entry) => entry.id === entityId);
    if (scene) {
      return resolveSceneNavigationTarget(project, scene.id);
    }

    for (const candidateScene of project.scenes.items) {
      const hotspot = candidateScene.hotspots.find((entry) => entry.id === entityId);
      if (hotspot) {
        return {
          label: hotspot.name,
          tab: "scenes",
          locationId: candidateScene.locationId,
          sceneId: candidateScene.id,
          hotspotId: hotspot.id
        };
      }

      if (candidateScene.subtitleTracks.some((track) => track.id === entityId)) {
        return {
          label: `${candidateScene.name} subtitles`,
          tab: "scenes",
          locationId: candidateScene.locationId,
          sceneId: candidateScene.id
        };
      }

      if (candidateScene.subtitleTracks.some((track) => track.cues.some((cue) => cue.id === entityId))) {
        return {
          label: `${candidateScene.name} subtitles`,
          tab: "scenes",
          locationId: candidateScene.locationId,
          sceneId: candidateScene.id
        };
      }
    }

    const inventoryItem = project.inventory.items.find((entry) => entry.id === entityId);
    if (inventoryItem) {
      return {
        label: inventoryItem.name,
        tab: "inventory",
        inventoryItemId: inventoryItem.id
      };
    }

    const dialogue = project.dialogues.items.find((entry) => entry.id === entityId);
    if (dialogue) {
      return {
        label: dialogue.name,
        tab: "dialogue",
        dialogueId: dialogue.id
      };
    }

    for (const candidateDialogue of project.dialogues.items) {
      const node = candidateDialogue.nodes.find((entry) => entry.id === entityId);
      if (node) {
        return {
          label: `${candidateDialogue.name} / ${node.id}`,
          tab: "dialogue",
          dialogueId: candidateDialogue.id,
          dialogueNodeId: node.id
        };
      }

      const owningNode = candidateDialogue.nodes.find((nodeEntry) =>
        nodeEntry.choices.some((choice) => choice.id === entityId)
      );
      if (owningNode) {
        return {
          label: `${candidateDialogue.name} / ${owningNode.id}`,
          tab: "dialogue",
          dialogueId: candidateDialogue.id,
          dialogueNodeId: owningNode.id
        };
      }
    }
  }

  switch (issue.code) {
    case "MISSING_START_LOCATION":
      return {
        label: "start location",
        tab: "world",
        locationId: project.manifest.startLocationId,
        sceneId: project.manifest.startSceneId
      };
    case "MISSING_START_SCENE":
      return {
        label: "start scene",
        tab: "scenes",
        sceneId: project.manifest.startSceneId
      };
    case "SCENE_BACKGROUND_MISSING":
      return {
        label: "scene media",
        tab: "scenes",
        sceneId: project.manifest.startSceneId
      };
    case "HOTSPOT_DIALOGUE_MISSING":
    case "EFFECT_DIALOGUE_MISSING":
    case "DIALOGUE_START_NODE_MISSING":
    case "DIALOGUE_NEXT_NODE_MISSING":
    case "DIALOGUE_CHOICE_TARGET_MISSING":
      return {
        label: "dialogue",
        tab: "dialogue"
      };
    case "HOTSPOT_ITEM_MISSING":
    case "CONDITION_ITEM_MISSING":
    case "EFFECT_ITEM_MISSING":
      return {
        label: "inventory",
        tab: "inventory"
      };
    default:
      return undefined;
  }
}

export function resolveIssueEntityLabel(
  project: ProjectBundle,
  issue: ValidationIssue,
  target: EditorNavigationTarget | undefined
): string {
  if (issue.code === "SCENE_UNREACHABLE") {
    return resolveSceneNavigationTarget(project, issue.entityId)?.label ?? issue.entityId ?? "Unknown scene";
  }

  return target?.label ?? issue.entityId ?? "Unknown item";
}

export function getIssueHint(issue: ValidationIssue): string {
  switch (issue.code) {
    case "HOTSPOT_TEXT_MISSING":
    case "HOTSPOT_COMMENT_TEXT_MISSING":
      return "Add the missing entry in the Localization tab or restore it from the hotspot editor in Scenes.";
    case "DIALOGUE_TEXT_MISSING":
    case "DIALOGUE_CHOICE_TEXT_MISSING":
      return "Add the missing entry in the Localization tab or restore it from the dialogue editor.";
    case "SCENE_BACKGROUND_MISSING":
      return "Import media in Assets, then assign a background asset in the Scenes tab.";
    case "HOTSPOT_TARGET_SCENE_MISSING":
    case "EFFECT_SCENE_MISSING":
      return "Create the target scene first, then update the scene link or effect.";
    case "HOTSPOT_ITEM_MISSING":
    case "CONDITION_ITEM_MISSING":
    case "EFFECT_ITEM_MISSING":
      return "Create the inventory item in the Inventory tab or remove the item reference.";
    case "HOTSPOT_DIALOGUE_MISSING":
    case "EFFECT_DIALOGUE_MISSING":
      return "Create the dialogue tree in the Dialogue tab or clear the broken reference.";
    case "SCENE_UNREACHABLE":
      return "Add a path from the start scene or another reachable scene if this content should be playable.";
    default:
      return "Open the related editor tab and correct the broken reference or timing.";
  }
}

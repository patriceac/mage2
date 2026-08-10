import type { ProjectBundle, ValidationIssue } from "@mage2/schema";
import type { EditorNavigationTarget } from "./navigation-target";
import { resolveProjectTextUsageForIssue } from "./project-text";
import type { EditorTab } from "./store";

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
      textId: projectTextUsage.textId,
      locale: issue.locale ?? project.manifest.defaultLanguage,
      localizationSection: "strings"
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
    }

    const inventoryItem = project.inventory.items.find((entry) => entry.id === entityId);
    if (inventoryItem) {
      return {
        label: inventoryItem.name,
        tab: "inventory",
        inventoryItemId: inventoryItem.id
      };
    }

    const variable = project.manifest.variables.find((entry) => entry.id === entityId);
    if (variable) {
      return {
        label: variable.name,
        tab: "logic",
        variableId: variable.id
      };
    }

    const responseGroup = project.dialogues.responseGroups.find((entry) => entry.id === entityId);
    if (responseGroup) {
      return {
        label: responseGroup.name,
        tab: "dialogue",
        dialogueSection: "responses",
        responseGroupId: responseGroup.id,
        responseEntryId: responseGroup.entries[0]?.id
      };
    }

    for (const group of project.dialogues.responseGroups) {
      const responseEntry = group.entries.find((entry) => entry.id === entityId);
      if (responseEntry) {
        return {
          label: group.name,
          tab: "dialogue",
          dialogueSection: "responses",
          responseGroupId: group.id,
          responseEntryId: responseEntry.id
        };
      }
    }

    const asset = project.assets.assets.find((entry) => entry.id === entityId);
    if (asset) {
      if (issue.code.startsWith("PLAYER_")) {
        return {
          label: asset.name,
          tab: "player",
          assetId: asset.id
        };
      }
      if (
        issue.code === "SCENE_BACKGROUND_LOCALE_MISSING" ||
        issue.code === "SCENE_AUDIO_LOCALE_MISSING" ||
        issue.code === "HOTSPOT_MEDIA_LOCALE_MISSING" ||
        issue.code === "DIALOGUE_MEDIA_LOCALE_MISSING" ||
        issue.code === "RESPONSE_MEDIA_LOCALE_MISSING"
      ) {
        return {
          label: asset.name,
          tab: "localization",
          assetId: asset.id,
          locale: issue.locale ?? project.manifest.defaultLanguage,
          localizationSection: "media"
        };
      }

      return {
        label: asset.name,
        tab: "assets",
        assetId: asset.id
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
    case "PLAYER_TITLE_BACKGROUND_MISSING":
    case "PLAYER_APP_ICON_RECOMMENDED":
    case "PLAYER_WEBSITE_INVALID":
    case "PLAYER_GAME_VERSION_MISSING":
    case "PLAYER_GAME_VERSION_INVALID":
    case "PLAYER_TEXT_SOURCE_INCOMPLETE":
    case "PLAYER_TEXT_LOCALE_INCOMPLETE":
    case "STARTER_PLAYER_ARTWORK_IN_USE":
      return {
        // i18n-ignore-next-line -- canonical routing label translated by the renderer
        label: "player presentation",
        tab: "player"
      };
    case "MISSING_START_LOCATION":
      return {
        // i18n-ignore-next-line -- canonical routing label translated by the renderer
        label: "start location",
        tab: "world",
        locationId: project.manifest.startLocationId,
        sceneId: project.manifest.startSceneId
      };
    case "MISSING_START_SCENE":
      return {
        // i18n-ignore-next-line -- canonical routing label translated by the renderer
        label: "start scene",
        tab: "scenes",
        sceneId: project.manifest.startSceneId
      };
    case "SCENE_BACKGROUND_MISSING":
    case "SCENE_AUDIO_MISSING":
      return {
        // i18n-ignore-next-line -- canonical routing label translated by the renderer
        label: "scene media",
        tab: "scenes",
        sceneId: project.manifest.startSceneId
      };
    case "SCENE_BACKGROUND_LOCALE_MISSING":
    case "SCENE_AUDIO_LOCALE_MISSING":
    case "HOTSPOT_MEDIA_LOCALE_MISSING":
    case "DIALOGUE_MEDIA_LOCALE_MISSING":
    case "INVENTORY_IMAGE_LOCALE_MISSING":
    case "RESPONSE_MEDIA_LOCALE_MISSING":
      return {
        // i18n-ignore-next-line -- canonical routing label translated by the renderer
        label: "localized media",
        tab: "localization",
        locale: issue.locale ?? project.manifest.defaultLanguage,
        assetId: issue.entityId,
        localizationSection: "media"
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
    case "RESPONSE_GROUP_EMPTY":
    case "RESPONSE_GROUP_ID_DUPLICATE":
    case "RESPONSE_ENTRY_ID_DUPLICATE":
    case "RESPONSE_MEDIA_UNASSIGNED":
    case "RESPONSE_MEDIA_MISSING":
    case "RESPONSE_MEDIA_KIND_INVALID":
      return {
        label: "responses",
        tab: "dialogue",
        dialogueSection: "responses",
        responseGroupId: issue.entityId,
        responseEntryId: issue.entityId
      };
    case "HOTSPOT_INVENTORY_ITEM_MISSING":
    case "CONDITION_ITEM_MISSING":
    case "EFFECT_ITEM_MISSING":
    case "INVENTORY_IMAGE_MISSING":
    case "INVENTORY_IMAGE_ASSET_MISSING":
    case "INVENTORY_IMAGE_KIND_INVALID":
    case "INVENTORY_IMAGE_CATEGORY_INVALID":
      return {
        label: "inventory",
        tab: "inventory"
      };
    case "SCENE_BACKGROUND_CATEGORY_INVALID":
    case "SCENE_BACKGROUND_KIND_INVALID":
    case "SCENE_AUDIO_CATEGORY_INVALID":
    case "SCENE_AUDIO_KIND_INVALID":
    case "SCENE_AUDIO_REQUIRES_IMAGE_BACKGROUND":
    case "SCENE_AUDIO_MODE_INVALID":
    case "VIDEO_EXTERNAL_AUDIO_MISSING":
    case "VIDEO_EMBEDDED_AUDIO_MISSING":
    case "VIDEO_EMBEDDED_AUDIO_UNVERIFIED":
    case "VIDEO_EXTERNAL_AUDIO_DURATION_MISMATCH":
    case "VIDEO_LOOP_MEDIA_END_EFFECTS_INVALID":
    case "MEDIA_END_EFFECTS_REQUIRE_VIDEO":
      return {
        // i18n-ignore-next-line -- canonical routing label translated by the renderer
        label: "scene media",
        tab: "scenes",
        sceneId: issue.entityId
      };
    default:
      return undefined;
  }
}

export function resolveVisibleIssuesForTab(
  project: ProjectBundle,
  issues: ValidationIssue[],
  activeTab: EditorTab
): ValidationIssue[] {
  if (activeTab === "world") {
    return issues;
  }

  return issues.filter((issue) => resolveIssueNavigation(project, issue)?.tab === activeTab);
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
    case "PLAYER_TITLE_BACKGROUND_MISSING":
    case "PLAYER_TITLE_BACKGROUND_ASSET_MISSING":
    case "PLAYER_TITLE_BACKGROUND_KIND_INVALID":
    case "PLAYER_TITLE_BACKGROUND_CATEGORY_INVALID":
    case "PLAYER_TITLE_BACKGROUND_DEFAULT_LOCALE_MISSING":
    case "PLAYER_LOGO_ASSET_MISSING":
    case "PLAYER_LOGO_KIND_INVALID":
    case "PLAYER_LOGO_CATEGORY_INVALID":
    case "PLAYER_LOGO_DEFAULT_LOCALE_MISSING":
    case "PLAYER_APP_ICON_ASSET_MISSING":
    case "PLAYER_APP_ICON_KIND_INVALID":
    case "PLAYER_APP_ICON_CATEGORY_INVALID":
    case "PLAYER_APP_ICON_DEFAULT_LOCALE_MISSING":
    case "PLAYER_APP_ICON_RECOMMENDED":
      return "Open Player and assign valid Player artwork, then use Localization > Media for locale variants.";
    case "PLAYER_TITLE_BACKGROUND_LOCALE_MISSING":
    case "PLAYER_LOGO_LOCALE_MISSING":
    case "PLAYER_APP_ICON_LOCALE_MISSING":
      return "Add the missing artwork variant in Localization > Media, or keep the intentional default-locale fallback.";
    case "PLAYER_TEXT_SOURCE_INCOMPLETE":
    case "PLAYER_TEXT_LOCALE_INCOMPLETE":
      return "Complete player interface copy in Localization > Strings and mark non-source text Translated or Reviewed.";
    case "PLAYER_WEBSITE_INVALID":
      return "Enter a complete http or https creator URL in Player, or leave the field empty.";
    case "PLAYER_GAME_VERSION_MISSING":
    case "PLAYER_GAME_VERSION_INVALID":
      return "Set the player-facing release version in Player.";
    case "STARTER_SCENE_MEDIA_IN_USE":
      return "Replace the starter background with creator-owned scene media before building a release.";
    case "STARTER_HOTSPOT_UNWIRED":
      return "Open the starter hotspot in Scenes and give it a transition, dialogue, item action, media, or response.";
    case "STARTER_PLAYER_ARTWORK_IN_USE":
      return "Review the starter title and icon artwork in Player, then replace anything that should not ship.";
    case "HOTSPOT_COMMENT_TEXT_MISSING":
      return "Add the missing text in Localization > Strings, or restore the default-locale value from Scenes.";
    case "DIALOGUE_TEXT_MISSING":
    case "DIALOGUE_CHOICE_TEXT_MISSING":
      return "Add the missing text in Localization > Strings, or restore the default-locale value from Dialogue.";
    case "INVENTORY_NAME_TEXT_MISSING":
    case "INVENTORY_DESCRIPTION_TEXT_MISSING":
      return "Add the missing text in Localization > Strings, or restore the default-locale value from Inventory.";
    case "INVENTORY_IMAGE_MISSING":
      return "Upload or assign an inventory image in the Inventory tab.";
    case "INVENTORY_IMAGE_ASSET_MISSING":
    case "INVENTORY_IMAGE_KIND_INVALID":
    case "INVENTORY_IMAGE_CATEGORY_INVALID":
      return "Assign a valid inventory image asset in the Inventory tab.";
    case "SCENE_BACKGROUND_LOCALE_MISSING":
    case "SCENE_AUDIO_LOCALE_MISSING":
    case "HOTSPOT_MEDIA_LOCALE_MISSING":
    case "DIALOGUE_MEDIA_LOCALE_MISSING":
    case "INVENTORY_IMAGE_LOCALE_MISSING":
    case "RESPONSE_MEDIA_LOCALE_MISSING":
      return "Add or replace the missing locale media variant in Localization > Media.";
    case "RESPONSE_TEXT_MISSING":
      return "Add the missing response text in Localization > Strings or Dialogue > Responses.";
    case "RESPONSE_GROUP_EMPTY":
    case "RESPONSE_MEDIA_UNASSIGNED":
    case "RESPONSE_MEDIA_MISSING":
    case "RESPONSE_MEDIA_KIND_INVALID":
      return "Open Dialogue > Responses and complete the response entry before exporting.";
    case "RESPONSE_GROUP_MISSING":
    case "RESPONSE_GROUP_ASSIGNED_EMPTY":
    case "RESPONSE_ENTRY_MISSING":
    case "PLAYER_FEEDBACK_CONFLICT":
      return "Open the hotspot in Scenes and choose one valid Player feedback option.";
    case "SCENE_BACKGROUND_MISSING":
    case "SCENE_BACKGROUND_CATEGORY_INVALID":
    case "SCENE_BACKGROUND_KIND_INVALID":
      return "Upload or assign a background image or video in the Scenes tab.";
    case "SCENE_AUDIO_MISSING":
    case "SCENE_AUDIO_CATEGORY_INVALID":
    case "SCENE_AUDIO_KIND_INVALID":
      return "Upload, assign, or clear the scene audio asset in the Scenes tab.";
    case "SCENE_AUDIO_REQUIRES_IMAGE_BACKGROUND":
    case "SCENE_AUDIO_MODE_INVALID":
      return "Choose External track for a video with separate scene audio, or clear the scene audio.";
    case "VIDEO_EXTERNAL_AUDIO_MISSING":
      return "Assign a scene audio asset or choose Embedded audio or Silent for this video.";
    case "VIDEO_EMBEDDED_AUDIO_MISSING":
      return "This file has no embedded audio stream. Choose External track or Silent.";
    case "VIDEO_EMBEDDED_AUDIO_UNVERIFIED":
      return "Re-import this older video to detect its audio stream before using Embedded audio.";
    case "VIDEO_EXTERNAL_AUDIO_DURATION_MISMATCH":
      return "Use external audio whose duration, including its delay, matches the video within 500ms.";
    case "VIDEO_LOOP_MEDIA_END_EFFECTS_INVALID":
      return "Turn off video looping or clear the effects that run when the video ends.";
    case "MEDIA_END_EFFECTS_REQUIRE_VIDEO":
      return "Clear the media-end effects or assign a video background.";
    case "HOTSPOT_TARGET_SCENE_MISSING":
    case "EFFECT_SCENE_MISSING":
      return "Create the target scene first, then update the scene link or effect.";
    case "HOTSPOT_INVENTORY_ITEM_MISSING":
    case "CONDITION_ITEM_MISSING":
    case "EFFECT_ITEM_MISSING":
      return "Create the inventory item in the Inventory tab or remove the item reference.";
    case "HOTSPOT_DIALOGUE_MISSING":
    case "EFFECT_DIALOGUE_MISSING":
      return "Create the dialogue tree in the Dialogue tab or clear the broken reference.";
    case "HOTSPOT_MEDIA_ASSET_MISSING":
    case "HOTSPOT_MEDIA_CATEGORY_INVALID":
    case "HOTSPOT_MEDIA_KIND_INVALID":
      return "Assign a foreground audio or video asset to the hotspot, or clear the interaction media field.";
    case "DIALOGUE_MEDIA_ASSET_MISSING":
    case "DIALOGUE_MEDIA_CATEGORY_INVALID":
    case "DIALOGUE_MEDIA_KIND_INVALID":
      return "Assign a foreground audio or video asset to the dialogue line, or clear the line media field.";
    case "DUPLICATE_VARIABLE_ID":
    case "DUPLICATE_VARIABLE_CHOICE_ID":
    case "VARIABLE_INITIAL_CHOICE_MISSING":
    case "VARIABLE_NAME_MISSING":
    case "VARIABLE_CHOICES_TOO_FEW":
    case "VARIABLE_CHOICE_NAME_MISSING":
      return "Open Logic and correct the variable definition before saving or exporting.";
    case "CONDITION_VARIABLE_MISSING":
    case "CONDITION_VARIABLE_VALUE_INVALID":
    case "CONDITION_VARIABLE_OPERATOR_INVALID":
      return "Open the related condition builder and choose a valid variable, comparison, and value.";
    case "EFFECT_VARIABLE_MISSING":
    case "EFFECT_VARIABLE_VALUE_INVALID":
    case "EFFECT_VARIABLE_CHANGE_INVALID":
      return "Open the related action builder and choose a valid variable and value.";
    case "EFFECT_TERMINAL_NOT_LAST":
      return "Move scene changes and dialogue starts to the end of the action list unless continuation is intentional.";
    case "SCENE_UNREACHABLE":
      return "Add a path from the start scene or another reachable scene if this content should be playable.";
    default:
      return "Open the related editor tab and correct the broken reference or timing.";
  }
}

import {
  type Condition,
  type DialogueTree,
  type Effect,
  type ProjectBundle,
  type Scene,
  type ValidationIssue,
  type ValidationReport
} from "./types";
import { getLocalizedText, normalizeSupportedLocales, resolveAssetCategory, resolveAssetVariant } from "./localization";

export function collectSceneLinks(scene: Scene): string[] {
  const links = new Set<string>();

  for (const hotspot of scene.hotspots) {
    if (hotspot.targetSceneId) {
      links.add(hotspot.targetSceneId);
    }

    for (const effect of hotspot.effects) {
      if (effect.type === "goToScene") {
        links.add(effect.sceneId);
      }
    }
  }

  for (const effect of scene.onEnterEffects) {
    if (effect.type === "goToScene") {
      links.add(effect.sceneId);
    }
  }

  for (const effect of scene.onExitEffects) {
    if (effect.type === "goToScene") {
      links.add(effect.sceneId);
    }
  }

  return [...links];
}

export function validateProject(project: ProjectBundle): ValidationReport {
  const issues: ValidationIssue[] = [];
  const assetIds = new Set(project.assets.assets.map((asset) => asset.id));
  const assetsById = new Map(project.assets.assets.map((asset) => [asset.id, asset]));
  const locationIds = new Set(project.locations.items.map((location) => location.id));
  const sceneIds = new Set(project.scenes.items.map((scene) => scene.id));
  const dialogueIds = new Set(project.dialogues.items.map((dialogue) => dialogue.id));
  const inventoryIds = new Set(project.inventory.items.map((item) => item.id));
  const supportedLocales = normalizeSupportedLocales(
    project.manifest.defaultLanguage,
    project.manifest.supportedLocales
  );

  if (!locationIds.has(project.manifest.startLocationId)) {
    issues.push({
      level: "error",
      code: "MISSING_START_LOCATION",
      message: `Start location '${project.manifest.startLocationId}' does not exist.`
    });
  }

  if (!sceneIds.has(project.manifest.startSceneId)) {
    issues.push({
      level: "error",
      code: "MISSING_START_SCENE",
      message: `Start scene '${project.manifest.startSceneId}' does not exist.`
    });
  }

  for (const location of project.locations.items) {
    for (const sceneId of location.sceneIds) {
      if (!sceneIds.has(sceneId)) {
        issues.push({
          level: "error",
          code: "LOCATION_SCENE_MISSING",
          message: `Location '${location.id}' references missing scene '${sceneId}'.`,
          entityId: location.id
        });
      }
    }
  }

  for (const scene of project.scenes.items) {
    validateScene(project, scene, supportedLocales, assetIds, assetsById, locationIds, sceneIds, dialogueIds, inventoryIds, issues);
  }

  for (const dialogue of project.dialogues.items) {
    validateDialogue(project, dialogue, supportedLocales, sceneIds, inventoryIds, dialogueIds, issues);
  }

  for (const item of project.inventory.items) {
    validateInventoryItem(project, item, supportedLocales, assetsById, issues);
  }

  const reachableScenes = new Set<string>();
  const stack = [project.manifest.startSceneId];
  while (stack.length > 0) {
    const sceneId = stack.pop()!;
    if (reachableScenes.has(sceneId)) {
      continue;
    }

    reachableScenes.add(sceneId);
    const scene = project.scenes.items.find((entry) => entry.id === sceneId);
    if (!scene) {
      continue;
    }

    for (const nextSceneId of collectSceneLinks(scene)) {
      stack.push(nextSceneId);
    }
  }

  const startScene = project.scenes.items.find((entry) => entry.id === project.manifest.startSceneId);

  for (const scene of project.scenes.items) {
    if (!reachableScenes.has(scene.id)) {
      issues.push({
        level: "warning",
        code: "SCENE_UNREACHABLE",
        message: `Scene '${scene.name}' is unreachable from '${startScene?.name ?? project.manifest.startSceneId}'.`,
        entityId: scene.id
      });
    }
  }

  return {
    valid: issues.every((issue) => issue.level !== "error"),
    issues
  };
}

function validateScene(
  project: ProjectBundle,
  scene: Scene,
  supportedLocales: string[],
  assetIds: Set<string>,
  assetsById: Map<string, ProjectBundle["assets"]["assets"][number]>,
  locationIds: Set<string>,
  sceneIds: Set<string>,
  dialogueIds: Set<string>,
  inventoryIds: Set<string>,
  issues: ValidationIssue[]
): void {
  let backgroundAssetKind: ProjectBundle["assets"]["assets"][number]["kind"] | undefined;
  const { backgroundAssetId } = scene;

  if (!locationIds.has(scene.locationId)) {
    issues.push({
      level: "error",
      code: "SCENE_LOCATION_MISSING",
      message: `Scene '${scene.id}' references missing location '${scene.locationId}'.`,
      entityId: scene.id
    });
  }

  if (!backgroundAssetId) {
    issues.push({
      level: "error",
      code: "SCENE_BACKGROUND_MISSING",
      message: `Scene '${scene.id}' does not have a background asset assigned.`,
      entityId: scene.id
    });
  } else if (!assetIds.has(backgroundAssetId)) {
    issues.push({
      level: "error",
      code: "SCENE_BACKGROUND_MISSING",
      message: `Scene '${scene.id}' references missing asset '${backgroundAssetId}'.`,
      entityId: scene.id
    });
  } else {
    const asset = assetsById.get(backgroundAssetId);
    if (asset) {
      backgroundAssetKind = asset.kind;

      if (resolveAssetCategory(asset) !== "background") {
        issues.push({
          level: "error",
          code: "SCENE_BACKGROUND_CATEGORY_INVALID",
          message: `Scene '${scene.id}' must reference a background asset, but '${backgroundAssetId}' is categorized as '${resolveAssetCategory(asset) ?? "legacy"}'.`,
          entityId: scene.id
        });
      }

      if (asset.kind !== "image" && asset.kind !== "video") {
        issues.push({
          level: "error",
          code: "SCENE_BACKGROUND_KIND_INVALID",
          message: `Scene '${scene.id}' must reference an image or video asset, but '${backgroundAssetId}' is '${asset.kind}'.`,
          entityId: scene.id
        });
      }

      for (const locale of supportedLocales) {
        if (resolveAssetVariant(asset, locale)) {
          continue;
        }

        issues.push({
          level: "error",
          code: "SCENE_BACKGROUND_LOCALE_MISSING",
          message: `Asset '${asset.id}' is missing a '${locale}' variant for scene '${scene.id}'.`,
          entityId: asset.id,
          locale
        });
      }
    }
  }

  if (scene.sceneAudioAssetId) {
    if (!assetIds.has(scene.sceneAudioAssetId)) {
      issues.push({
        level: "error",
        code: "SCENE_AUDIO_MISSING",
        message: `Scene '${scene.id}' references missing scene audio asset '${scene.sceneAudioAssetId}'.`,
        entityId: scene.id
      });
    } else {
      const asset = assetsById.get(scene.sceneAudioAssetId);
      if (asset) {
        if (resolveAssetCategory(asset) !== "sceneAudio") {
          issues.push({
            level: "error",
            code: "SCENE_AUDIO_CATEGORY_INVALID",
            message: `Scene '${scene.id}' must reference a scene audio asset, but '${scene.sceneAudioAssetId}' is categorized as '${resolveAssetCategory(asset) ?? "legacy"}'.`,
            entityId: scene.id
          });
        }

        if (asset.kind !== "audio") {
          issues.push({
            level: "error",
            code: "SCENE_AUDIO_KIND_INVALID",
            message: `Scene '${scene.id}' must reference an audio asset, but '${scene.sceneAudioAssetId}' is '${asset.kind}'.`,
            entityId: scene.id
          });
        }

        for (const locale of supportedLocales) {
          if (resolveAssetVariant(asset, locale)) {
            continue;
          }

          issues.push({
            level: "error",
            code: "SCENE_AUDIO_LOCALE_MISSING",
            message: `Asset '${asset.id}' is missing a '${locale}' variant for scene audio on scene '${scene.id}'.`,
            entityId: asset.id,
            locale
          });
        }
      }
    }

    if (backgroundAssetKind !== "image") {
      issues.push({
        level: "error",
        code: "SCENE_AUDIO_REQUIRES_IMAGE_BACKGROUND",
        message: `Scene '${scene.id}' can only use scene audio when its background asset is an image.`,
        entityId: scene.id
      });
    }
  }

  for (const hotspot of scene.hotspots) {
    if (hotspot.endMs <= hotspot.startMs) {
      issues.push({
        level: "error",
        code: "HOTSPOT_RANGE_INVALID",
        message: `Hotspot '${hotspot.id}' has an invalid timing window.`,
        entityId: hotspot.id
      });
    }

    if (hotspot.commentTextId) {
      validateLocalizedTextCoverage(
        project,
        supportedLocales,
        hotspot.commentTextId,
        "error",
        "HOTSPOT_COMMENT_TEXT_MISSING",
        `Hotspot '${hotspot.id}' references missing comment text`,
        hotspot.id,
        issues
      );
    }

    if (hotspot.targetSceneId && !sceneIds.has(hotspot.targetSceneId)) {
      issues.push({
        level: "error",
        code: "HOTSPOT_TARGET_SCENE_MISSING",
        message: `Hotspot '${hotspot.id}' targets missing scene '${hotspot.targetSceneId}'.`,
        entityId: hotspot.id
      });
    }

    if (hotspot.dialogueTreeId && !dialogueIds.has(hotspot.dialogueTreeId)) {
      issues.push({
        level: "error",
        code: "HOTSPOT_DIALOGUE_MISSING",
        message: `Hotspot '${hotspot.id}' targets missing dialogue tree '${hotspot.dialogueTreeId}'.`,
        entityId: hotspot.id
      });
    }

    for (const itemId of hotspot.requiredItemIds) {
      if (!inventoryIds.has(itemId)) {
        issues.push({
          level: "error",
          code: "HOTSPOT_ITEM_MISSING",
          message: `Hotspot '${hotspot.id}' requires missing inventory item '${itemId}'.`,
          entityId: hotspot.id
        });
      }
    }

    validateConditionEffectRefs(
      hotspot.conditions,
      hotspot.effects,
      issues,
      inventoryIds,
      sceneIds,
      dialogueIds,
      hotspot.id
    );
  }

  validateConditionEffectRefs([], scene.onEnterEffects, issues, inventoryIds, sceneIds, dialogueIds, scene.id);
  validateConditionEffectRefs([], scene.onExitEffects, issues, inventoryIds, sceneIds, dialogueIds, scene.id);

  for (const track of scene.subtitleTracks) {
    for (const cue of track.cues) {
      if (cue.endMs <= cue.startMs) {
        issues.push({
          level: "error",
          code: "SUBTITLE_RANGE_INVALID",
          message: `Subtitle cue '${cue.id}' has an invalid time range.`,
          entityId: cue.id
        });
      }

      validateLocalizedTextCoverage(
        project,
        supportedLocales,
        cue.textId,
        "error",
        "SUBTITLE_TEXT_MISSING",
        `Subtitle cue '${cue.id}' references missing text`,
        cue.id,
        issues
      );

      for (const locale of supportedLocales) {
        const subtitleText = getLocalizedText(project, locale, cue.textId);
        if (subtitleText?.trim().length === 0) {
          issues.push({
            level: "warning",
            code: "SUBTITLE_TEXT_EMPTY",
            message: `Subtitle cue '${cue.id}' has no visible text for locale '${locale}'.`,
            entityId: cue.id,
            locale
          });
        }
      }
    }

    if (track.cues.length === 0) {
      issues.push({
        level: "warning",
        code: "SUBTITLE_TRACK_EMPTY",
        message: `Subtitle track '${track.id}' has no cues.`,
        entityId: track.id
      });
    }
  }
}

function validateInventoryItem(
  project: ProjectBundle,
  item: ProjectBundle["inventory"]["items"][number],
  supportedLocales: string[],
  assetsById: Map<string, ProjectBundle["assets"]["assets"][number]>,
  issues: ValidationIssue[]
): void {
  validateLocalizedTextCoverage(
    project,
    supportedLocales,
    item.textId,
    "error",
    "INVENTORY_NAME_TEXT_MISSING",
    `Inventory item '${item.id}' references missing name text`,
    item.id,
    issues
  );

  if (item.descriptionTextId) {
    validateLocalizedTextCoverage(
      project,
      supportedLocales,
      item.descriptionTextId,
      "error",
      "INVENTORY_DESCRIPTION_TEXT_MISSING",
      `Inventory item '${item.id}' references missing description text`,
      item.id,
      issues
    );
  }

  if (!item.imageAssetId) {
    issues.push({
      level: "warning",
      code: "INVENTORY_IMAGE_MISSING",
      message: `Inventory item '${item.id}' has no assigned inventory image.`,
      entityId: item.id
    });
    return;
  }

  const asset = assetsById.get(item.imageAssetId);
  if (!asset) {
    issues.push({
      level: "error",
      code: "INVENTORY_IMAGE_ASSET_MISSING",
      message: `Inventory item '${item.id}' references missing image asset '${item.imageAssetId}'.`,
      entityId: item.id
    });
    return;
  }

  if (asset.kind !== "image") {
    issues.push({
      level: "error",
      code: "INVENTORY_IMAGE_KIND_INVALID",
      message: `Inventory item '${item.id}' must reference an image asset, but '${item.imageAssetId}' is '${asset.kind}'.`,
      entityId: item.id
    });
    return;
  }

  if (resolveAssetCategory(asset) !== "inventory") {
    issues.push({
      level: "error",
      code: "INVENTORY_IMAGE_CATEGORY_INVALID",
      message: `Inventory item '${item.id}' must reference an inventory asset, but '${item.imageAssetId}' is categorized as '${resolveAssetCategory(asset) ?? "legacy"}'.`,
      entityId: item.id
    });
    return;
  }

  for (const locale of supportedLocales) {
    if (resolveAssetVariant(asset, locale)) {
      continue;
    }

    issues.push({
      level: "error",
      code: "INVENTORY_IMAGE_LOCALE_MISSING",
      message: `Asset '${asset.id}' is missing a '${locale}' variant for inventory item '${item.id}'.`,
      entityId: asset.id,
      locale
    });
  }
}

function validateDialogue(
  project: ProjectBundle,
  dialogue: DialogueTree,
  supportedLocales: string[],
  sceneIds: Set<string>,
  inventoryIds: Set<string>,
  dialogueIds: Set<string>,
  issues: ValidationIssue[]
): void {
  const nodeIds = new Set(dialogue.nodes.map((node) => node.id));
  if (!nodeIds.has(dialogue.startNodeId)) {
    issues.push({
      level: "error",
      code: "DIALOGUE_START_NODE_MISSING",
      message: `Dialogue '${dialogue.id}' references missing start node '${dialogue.startNodeId}'.`,
      entityId: dialogue.id
    });
  }

  for (const node of dialogue.nodes) {
    validateLocalizedTextCoverage(
      project,
      supportedLocales,
      node.textId,
      "error",
      "DIALOGUE_TEXT_MISSING",
      `Dialogue node '${node.id}' references missing text`,
      node.id,
      issues
    );

    if (node.nextNodeId && !nodeIds.has(node.nextNodeId)) {
      issues.push({
        level: "error",
        code: "DIALOGUE_NEXT_NODE_MISSING",
        message: `Dialogue node '${node.id}' references missing node '${node.nextNodeId}'.`,
        entityId: node.id
      });
    }

    validateConditionEffectRefs([], node.effects, issues, inventoryIds, sceneIds, dialogueIds, node.id);

    for (const choice of node.choices) {
      validateLocalizedTextCoverage(
        project,
        supportedLocales,
        choice.textId,
        "error",
        "DIALOGUE_CHOICE_TEXT_MISSING",
        `Dialogue choice '${choice.id}' references missing text`,
        choice.id,
        issues
      );

      if (choice.nextNodeId && !nodeIds.has(choice.nextNodeId)) {
        issues.push({
          level: "error",
          code: "DIALOGUE_CHOICE_TARGET_MISSING",
          message: `Dialogue choice '${choice.id}' references missing node '${choice.nextNodeId}'.`,
          entityId: choice.id
        });
      }

      if (choice.nextNodeId === node.id) {
        issues.push({
          level: "warning",
          code: "DIALOGUE_SELF_LOOP",
          message: `Dialogue choice '${choice.id}' loops to the same node.`,
          entityId: choice.id
        });
      }

      validateConditionEffectRefs(
        choice.conditions,
        choice.effects,
        issues,
        inventoryIds,
        sceneIds,
        dialogueIds,
        choice.id
      );
    }
  }

  const reachable = new Set<string>();
  const stack = [dialogue.startNodeId];
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (reachable.has(nodeId)) {
      continue;
    }

    reachable.add(nodeId);
    const node = dialogue.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      continue;
    }

    if (node.nextNodeId) {
      stack.push(node.nextNodeId);
    }

    for (const choice of node.choices) {
      if (choice.nextNodeId) {
        stack.push(choice.nextNodeId);
      }
    }
  }

  for (const node of dialogue.nodes) {
    if (!reachable.has(node.id)) {
      issues.push({
        level: "warning",
        code: "DIALOGUE_NODE_UNREACHABLE",
        message: `Dialogue node '${node.id}' is unreachable from '${dialogue.startNodeId}'.`,
        entityId: node.id
      });
    }
  }
}

function validateLocalizedTextCoverage(
  project: ProjectBundle,
  supportedLocales: string[],
  textId: string,
  level: ValidationIssue["level"],
  code: string,
  messagePrefix: string,
  entityId: string,
  issues: ValidationIssue[]
): void {
  for (const locale of supportedLocales) {
    if (getLocalizedText(project, locale, textId) !== undefined) {
      continue;
    }

    issues.push({
      level,
      code,
      message: `${messagePrefix} '${textId}' for locale '${locale}'.`,
      entityId,
      locale
    });
  }
}

function validateConditionEffectRefs(
  conditions: Condition[],
  effects: Effect[],
  issues: ValidationIssue[],
  inventoryIds: Set<string>,
  sceneIds: Set<string>,
  dialogueIds: Set<string>,
  entityId: string
): void {
  for (const condition of conditions) {
    if (condition.type === "inventoryHas" && !inventoryIds.has(condition.itemId)) {
      issues.push({
        level: "error",
        code: "CONDITION_ITEM_MISSING",
        message: `Condition on '${entityId}' references missing inventory item '${condition.itemId}'.`,
        entityId
      });
    }

    if (condition.type === "sceneVisited" && !sceneIds.has(condition.sceneId)) {
      issues.push({
        level: "error",
        code: "CONDITION_SCENE_MISSING",
        message: `Condition on '${entityId}' references missing scene '${condition.sceneId}'.`,
        entityId
      });
    }
  }

  for (const effect of effects) {
    if ((effect.type === "addItem" || effect.type === "removeItem") && !inventoryIds.has(effect.itemId)) {
      issues.push({
        level: "error",
        code: "EFFECT_ITEM_MISSING",
        message: `Effect on '${entityId}' references missing inventory item '${effect.itemId}'.`,
        entityId
      });
    }

    if (effect.type === "goToScene" && !sceneIds.has(effect.sceneId)) {
      issues.push({
        level: "error",
        code: "EFFECT_SCENE_MISSING",
        message: `Effect on '${entityId}' references missing scene '${effect.sceneId}'.`,
        entityId
      });
    }

    if (effect.type === "playDialogue" && !dialogueIds.has(effect.dialogueTreeId)) {
      issues.push({
        level: "error",
        code: "EFFECT_DIALOGUE_MISSING",
        message: `Effect on '${entityId}' references missing dialogue tree '${effect.dialogueTreeId}'.`,
        entityId
      });
    }
  }
}

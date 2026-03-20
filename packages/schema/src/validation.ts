import {
  type Condition,
  type DialogueTree,
  type Effect,
  type ProjectBundle,
  type Scene,
  type ValidationIssue,
  type ValidationReport
} from "./types";

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
  const locationIds = new Set(project.locations.items.map((location) => location.id));
  const sceneIds = new Set(project.scenes.items.map((scene) => scene.id));
  const dialogueIds = new Set(project.dialogues.items.map((dialogue) => dialogue.id));
  const inventoryIds = new Set(project.inventory.items.map((item) => item.id));

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
    validateScene(project, scene, assetIds, locationIds, sceneIds, dialogueIds, inventoryIds, issues);
  }

  for (const dialogue of project.dialogues.items) {
    validateDialogue(project, dialogue, sceneIds, inventoryIds, dialogueIds, issues);
  }

  for (const item of project.inventory.items) {
    if (!(item.textId in project.strings.values)) {
      issues.push({
        level: "warning",
        code: "INVENTORY_NAME_TEXT_MISSING",
        message: `Inventory item '${item.id}' references missing name text '${item.textId}'.`,
        entityId: item.id
      });
    }

    if (item.descriptionTextId && !(item.descriptionTextId in project.strings.values)) {
      issues.push({
        level: "warning",
        code: "INVENTORY_DESCRIPTION_TEXT_MISSING",
        message: `Inventory item '${item.id}' references missing description text '${item.descriptionTextId}'.`,
        entityId: item.id
      });
    }
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
  assetIds: Set<string>,
  locationIds: Set<string>,
  sceneIds: Set<string>,
  dialogueIds: Set<string>,
  inventoryIds: Set<string>,
  issues: ValidationIssue[]
): void {
  if (!locationIds.has(scene.locationId)) {
    issues.push({
      level: "error",
      code: "SCENE_LOCATION_MISSING",
      message: `Scene '${scene.id}' references missing location '${scene.locationId}'.`,
      entityId: scene.id
    });
  }

  if (!assetIds.has(scene.backgroundAssetId)) {
    issues.push({
      level: "error",
      code: "SCENE_BACKGROUND_MISSING",
      message: `Scene '${scene.id}' references missing asset '${scene.backgroundAssetId}'.`,
      entityId: scene.id
    });
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

    if (hotspot.commentTextId && !(hotspot.commentTextId in project.strings.values)) {
      issues.push({
        level: "warning",
        code: "HOTSPOT_COMMENT_TEXT_MISSING",
        message: `Hotspot '${hotspot.id}' references missing comment text '${hotspot.commentTextId}'.`,
        entityId: hotspot.id
      });
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

      const subtitleText = project.strings.values[cue.textId];
      if (!(cue.textId in project.strings.values)) {
        issues.push({
          level: "warning",
          code: "SUBTITLE_TEXT_MISSING",
          message: `Subtitle cue '${cue.id}' references missing text '${cue.textId}'.`,
          entityId: cue.id
        });
      } else if (subtitleText.trim().length === 0) {
        issues.push({
          level: "warning",
          code: "SUBTITLE_TEXT_EMPTY",
          message: `Subtitle cue '${cue.id}' has no visible text.`,
          entityId: cue.id
        });
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

function validateDialogue(
  project: ProjectBundle,
  dialogue: DialogueTree,
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
    if (!(node.textId in project.strings.values)) {
      issues.push({
        level: "warning",
        code: "DIALOGUE_TEXT_MISSING",
        message: `Dialogue node '${node.id}' references missing text '${node.textId}'.`,
        entityId: node.id
      });
    }

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
      if (!(choice.textId in project.strings.values)) {
        issues.push({
          level: "warning",
          code: "DIALOGUE_CHOICE_TEXT_MISSING",
          message: `Dialogue choice '${choice.id}' references missing text '${choice.textId}'.`,
          entityId: choice.id
        });
      }

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

import {
  type Condition,
  type DialogueTree,
  type Effect,
  type HotspotEvent,
  type ProjectBundle,
  type Scene,
  type ValidationIssue,
  type ValidationReport
} from "./types";
import { effectCanStartTerminalFlow, effectsContain, visitEffects } from "./effects";
import { getLocalizedText, normalizeSupportedLocales, resolveAssetCategory, resolveAssetVariant } from "./localization";

export function collectSceneLinks(scene: Scene): string[] {
  const links = new Set<string>();

  for (const hotspot of scene.hotspots) {
    if (hotspot.targetSceneId) {
      links.add(hotspot.targetSceneId);
    }

    visitEffects(hotspot.effects, (effect) => {
      if (effect.type === "goToScene") links.add(effect.sceneId);
    });

    for (const event of [hotspot.clickEvent, hotspot.otherItemEvent]) {
      if (event?.targetSceneId) {
        links.add(event.targetSceneId);
      }

      visitEffects(event?.effects ?? [], (effect) => {
        if (effect.type === "goToScene") links.add(effect.sceneId);
      });
    }
  }

  for (const effects of [scene.onEnterEffects, scene.onExitEffects, scene.onMediaEndEffects ?? []]) {
    visitEffects(effects, (effect) => {
      if (effect.type === "goToScene") links.add(effect.sceneId);
    });
  }

  return [...links];
}

export function validateProject(project: ProjectBundle): ValidationReport {
  const issues: ValidationIssue[] = [];
  const assetIds = new Set(project.assets.assets.map((asset) => asset.id));
  const assetsById = new Map(project.assets.assets.map((asset) => [asset.id, asset]));
  const locationIds = new Set(project.locations.items.map((location) => location.id));
  const locationsById = new Map(project.locations.items.map((location) => [location.id, location]));
  const sceneIds = new Set(project.scenes.items.map((scene) => scene.id));
  const scenesById = new Map(project.scenes.items.map((scene) => [scene.id, scene]));
  const dialogueIds = new Set(project.dialogues.items.map((dialogue) => dialogue.id));
  const inventoryIds = new Set(project.inventory.items.map((item) => item.id));
  const supportedLocales = normalizeSupportedLocales(
    project.manifest.defaultLanguage,
    project.manifest.supportedLocales
  );

  validateDuplicateEntityIds(project.assets.assets, "asset", "DUPLICATE_ASSET_ID", issues);
  validateDuplicateEntityIds(project.locations.items, "location", "DUPLICATE_LOCATION_ID", issues);
  validateDuplicateEntityIds(project.scenes.items, "scene", "DUPLICATE_SCENE_ID", issues);
  validateDuplicateEntityIds(project.dialogues.items, "dialogue tree", "DUPLICATE_DIALOGUE_ID", issues);
  validateDuplicateEntityIds(project.inventory.items, "inventory item", "DUPLICATE_INVENTORY_ITEM_ID", issues);
  validateDuplicateEntityIds(project.manifest.variables, "game variable", "DUPLICATE_VARIABLE_ID", issues);
  validateGameVariables(project, issues);
  validateDuplicateEntityIds(
    project.scenes.items.flatMap((scene) => scene.hotspots),
    "hotspot",
    "DUPLICATE_HOTSPOT_ID",
    issues
  );
  validateDuplicateEntityIds(
    project.dialogues.items.flatMap((dialogue) => dialogue.nodes),
    "dialogue node",
    "DUPLICATE_DIALOGUE_NODE_ID",
    issues
  );
  validateDuplicateEntityIds(
    project.dialogues.items.flatMap((dialogue) => dialogue.nodes.flatMap((node) => node.choices)),
    "dialogue choice",
    "DUPLICATE_DIALOGUE_CHOICE_ID",
    issues
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

  const sceneLocationOwners = new Map<string, Set<string>>();
  for (const location of project.locations.items) {
    validateDuplicateReferenceIds(
      location.sceneIds,
      "LOCATION_SCENE_DUPLICATE",
      `Location '${location.id}' lists the same scene more than once.`,
      location.id,
      issues
    );

    for (const sceneId of location.sceneIds) {
      if (!sceneIds.has(sceneId)) {
        issues.push({
          level: "error",
          code: "LOCATION_SCENE_MISSING",
          message: `Location '${location.id}' references missing scene '${sceneId}'.`,
          entityId: location.id
        });
        continue;
      }

      const owners = sceneLocationOwners.get(sceneId) ?? new Set<string>();
      owners.add(location.id);
      sceneLocationOwners.set(sceneId, owners);

      const scene = scenesById.get(sceneId);
      if (scene && scene.locationId !== location.id) {
        issues.push({
          level: "error",
          code: "LOCATION_SCENE_OWNERSHIP_MISMATCH",
          message: `Location '${location.id}' lists scene '${sceneId}', but the scene belongs to location '${scene.locationId}'.`,
          entityId: location.id
        });
      }
    }
  }

  const startLocation = locationsById.get(project.manifest.startLocationId);
  const startScene = scenesById.get(project.manifest.startSceneId);
  if (startLocation && startScene) {
    if (startScene.locationId !== startLocation.id) {
      issues.push({
        level: "error",
        code: "START_SCENE_LOCATION_MISMATCH",
        message: `Start scene '${startScene.id}' belongs to location '${startScene.locationId}', not start location '${startLocation.id}'.`,
        entityId: startScene.id
      });
    }

    if (!startLocation.sceneIds.includes(startScene.id)) {
      issues.push({
        level: "error",
        code: "START_SCENE_NOT_OWNED_BY_START_LOCATION",
        message: `Start location '${startLocation.id}' does not list start scene '${startScene.id}'.`,
        entityId: startLocation.id
      });
    }
  }

  for (const scene of project.scenes.items) {
    const ownerIds = sceneLocationOwners.get(scene.id);
    const ownerLocation = locationsById.get(scene.locationId);
    if (ownerLocation && !ownerLocation.sceneIds.includes(scene.id)) {
      issues.push({
        level: "error",
        code: "SCENE_LOCATION_OWNERSHIP_MISSING",
        message: `Scene '${scene.id}' belongs to location '${scene.locationId}', but that location does not list the scene.`,
        entityId: scene.id
      });
    }

    if (ownerIds && ownerIds.size > 1) {
      issues.push({
        level: "error",
        code: "SCENE_LOCATION_MULTIPLE_OWNERS",
        message: `Scene '${scene.id}' is listed by multiple locations (${[...ownerIds].join(", ")}).`,
        entityId: scene.id
      });
    }

    validateScene(project, scene, supportedLocales, assetIds, assetsById, locationIds, sceneIds, dialogueIds, inventoryIds, issues);
  }

  for (const dialogue of project.dialogues.items) {
    validateDialogue(project, dialogue, supportedLocales, assetsById, sceneIds, inventoryIds, dialogueIds, issues);
  }

  validateResponseLibrary(project, supportedLocales, assetsById, issues);

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

  const reachabilityStartScene = project.scenes.items.find((entry) => entry.id === project.manifest.startSceneId);

  for (const scene of project.scenes.items) {
    if (!reachableScenes.has(scene.id)) {
      issues.push({
        level: "warning",
        code: "SCENE_UNREACHABLE",
        message: `Scene '${scene.name}' is unreachable from '${reachabilityStartScene?.name ?? project.manifest.startSceneId}'.`,
        entityId: scene.id
      });
    }
  }

  return {
    valid: issues.every((issue) => issue.level !== "error"),
    issues
  };
}

function validateDuplicateEntityIds<T extends { id: string }>(
  entities: readonly T[],
  entityLabel: string,
  code: string,
  issues: ValidationIssue[]
): void {
  const seen = new Set<string>();
  for (const entity of entities) {
    if (!seen.has(entity.id)) {
      seen.add(entity.id);
      continue;
    }

    issues.push({
      level: "error",
      code,
      message: `Duplicate ${entityLabel} id '${entity.id}'.`,
      entityId: entity.id
    });
  }
}

function validateDuplicateReferenceIds(
  ids: readonly string[],
  code: string,
  message: string,
  entityId: string,
  issues: ValidationIssue[]
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      continue;
    }

    issues.push({ level: "error", code, message, entityId });
    return;
  }
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
  const onMediaEndEffects = scene.onMediaEndEffects ?? [];
  let backgroundAssetKind: ProjectBundle["assets"]["assets"][number]["kind"] | undefined;
  let backgroundAsset: ProjectBundle["assets"]["assets"][number] | undefined;
  let sceneAudioAsset: ProjectBundle["assets"]["assets"][number] | undefined;
  const { backgroundAssetId } = scene;

  validateDuplicateReferenceIds(
    scene.dialogueTreeIds,
    "SCENE_DIALOGUE_DUPLICATE",
    `Scene '${scene.id}' lists the same dialogue tree more than once.`,
    scene.id,
    issues
  );
  for (const dialogueTreeId of scene.dialogueTreeIds) {
    if (!dialogueIds.has(dialogueTreeId)) {
      issues.push({
        level: "error",
        code: "SCENE_DIALOGUE_MISSING",
        message: `Scene '${scene.id}' references missing dialogue tree '${dialogueTreeId}'.`,
        entityId: scene.id
      });
    }
  }

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
      backgroundAsset = asset;
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
        sceneAudioAsset = asset;
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

    if (
      backgroundAssetKind !== "image" &&
      !(backgroundAssetKind === "video" && scene.videoAudioMode === "external")
    ) {
      issues.push({
        level: "error",
        code: "SCENE_AUDIO_MODE_INVALID",
        message: `Scene '${scene.id}' can only use scene audio with an image background or a video using external audio.`,
        entityId: scene.id
      });
    }
  }

  if (backgroundAssetKind === "video") {
    if (scene.videoAudioMode === "external" && !scene.sceneAudioAssetId) {
      issues.push({
        level: "error",
        code: "VIDEO_EXTERNAL_AUDIO_MISSING",
        message: `Scene '${scene.id}' uses external video audio but has no scene audio asset assigned.`,
        entityId: scene.id
      });
    }

    if (scene.videoAudioMode === "embedded" && backgroundAsset) {
      for (const locale of supportedLocales) {
        const variant = resolveAssetVariant(backgroundAsset, locale);
        if (!variant) {
          continue;
        }

        if (variant.hasAudio === false) {
          issues.push({
            level: "warning",
            code: "VIDEO_EMBEDDED_AUDIO_MISSING",
            message: `Video asset '${backgroundAsset.id}' has no embedded audio stream for scene '${scene.id}'.`,
            entityId: scene.id,
            locale
          });
        } else if (variant.hasAudio === undefined) {
          issues.push({
            level: "warning",
            code: "VIDEO_EMBEDDED_AUDIO_UNVERIFIED",
            message: `Video asset '${backgroundAsset.id}' was imported before audio-stream detection and should be re-imported before using embedded audio.`,
            entityId: scene.id,
            locale
          });
        }
      }
    }

    if (scene.videoAudioMode === "external" && backgroundAsset && sceneAudioAsset) {
      for (const locale of supportedLocales) {
        const videoVariant = resolveAssetVariant(backgroundAsset, locale);
        const audioVariant = resolveAssetVariant(sceneAudioAsset, locale);
        if (
          videoVariant?.durationMs !== undefined &&
          audioVariant?.durationMs !== undefined &&
          Math.abs(videoVariant.durationMs - (Math.max(0, scene.sceneAudioDelayMs) + audioVariant.durationMs)) > 500
        ) {
          issues.push({
            level: "warning",
            code: "VIDEO_EXTERNAL_AUDIO_DURATION_MISMATCH",
            message: `Scene '${scene.id}' external audio differs from the video duration by more than 500ms for '${locale}'.`,
            entityId: scene.id,
            locale
          });
        }
      }
    }

    if (scene.backgroundVideoLoop && onMediaEndEffects.length > 0) {
      issues.push({
        level: "error",
        code: "VIDEO_LOOP_MEDIA_END_EFFECTS_INVALID",
        message: `Scene '${scene.id}' cannot run media-end effects while its background video loops.`,
        entityId: scene.id
      });
    }
  } else if (onMediaEndEffects.length > 0) {
    issues.push({
      level: "error",
      code: "MEDIA_END_EFFECTS_REQUIRE_VIDEO",
      message: `Scene '${scene.id}' can only run media-end effects with a video background.`,
      entityId: scene.id
    });
  }

  for (const hotspot of scene.hotspots) {
    if (hotspot.timingMode !== "sceneDuration" && hotspot.endMs <= hotspot.startMs) {
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

    if (hotspot.mediaAssetId) {
      validateForegroundMediaReference(
        hotspot.mediaAssetId,
        `Hotspot '${hotspot.id}'`,
        hotspot.id,
        "HOTSPOT_MEDIA",
        supportedLocales,
        assetsById,
        issues
      );
    }

    validateResponseSelection(project, hotspot, "Hotspot", hotspot.id, issues);

    validateHotspotEventReferences(
      project,
      hotspot.clickEvent,
      "On click",
      "HOTSPOT_CLICK",
      hotspot.id,
      issues,
      inventoryIds,
      sceneIds,
      dialogueIds
    );
    validateHotspotEventReferences(
      project,
      hotspot.otherItemEvent,
      "Any other item",
      "HOTSPOT_OTHER_ITEM",
      hotspot.id,
      issues,
      inventoryIds,
      sceneIds,
      dialogueIds
    );

    if (hotspot.inventoryItemId && !inventoryIds.has(hotspot.inventoryItemId)) {
      issues.push({
        level: "error",
        code: "HOTSPOT_INVENTORY_ITEM_MISSING",
        message: `Hotspot '${hotspot.id}' references missing inventory item '${hotspot.inventoryItemId}'.`,
        entityId: hotspot.id
      });
    }

    if (hotspot.placedInventoryItemId && !inventoryIds.has(hotspot.placedInventoryItemId)) {
      issues.push({
        level: "error",
        code: "HOTSPOT_PLACED_INVENTORY_ITEM_MISSING",
        message: `Hotspot '${hotspot.id}' references missing placed inventory item '${hotspot.placedInventoryItemId}'.`,
        entityId: hotspot.id
      });
    }

    if (
      hotspot.inventoryItemId &&
      hotspot.placedInventoryItemId &&
      hotspot.inventoryItemId !== hotspot.placedInventoryItemId
    ) {
      issues.push({
        level: "error",
        code: "HOTSPOT_INVENTORY_REFERENCE_AMBIGUOUS",
        message: `Hotspot '${hotspot.id}' references different inventory items for pickup and placement.`,
        entityId: hotspot.id
      });
    }

    if (hotspot.placedInventoryGeometry && !hotspot.placedInventoryItemId && !hotspot.inventoryItemId) {
      issues.push({
        level: "error",
        code: "HOTSPOT_PLACED_GEOMETRY_ORPHANED",
        message: `Hotspot '${hotspot.id}' has placed-inventory geometry but no inventory item reference.`,
        entityId: hotspot.id
      });
    }

    validateDuplicateReferenceIds(
      hotspot.requiredItemIds,
      "HOTSPOT_REQUIRED_ITEM_DUPLICATE",
      `Hotspot '${hotspot.id}' requires the same inventory item more than once.`,
      hotspot.id,
      issues
    );

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
      project,
      hotspot.conditions,
      hotspot.effects,
      issues,
      inventoryIds,
      sceneIds,
      dialogueIds,
      hotspot.id
    );
  }

  validateConditionEffectRefs(project, [], scene.onEnterEffects, issues, inventoryIds, sceneIds, dialogueIds, scene.id);
  validateConditionEffectRefs(project, [], scene.onExitEffects, issues, inventoryIds, sceneIds, dialogueIds, scene.id);
  validateConditionEffectRefs(project, [], onMediaEndEffects, issues, inventoryIds, sceneIds, dialogueIds, scene.id);

}

function validateHotspotEventReferences(
  project: ProjectBundle,
  event: HotspotEvent | undefined,
  eventLabel: string,
  codePrefix: "HOTSPOT_CLICK" | "HOTSPOT_OTHER_ITEM",
  hotspotId: string,
  issues: ValidationIssue[],
  inventoryIds: Set<string>,
  sceneIds: Set<string>,
  dialogueIds: Set<string>
): void {
  if (!event) {
    return;
  }

  if (event.targetSceneId && !sceneIds.has(event.targetSceneId)) {
    issues.push({
      level: "error",
      code: `${codePrefix}_TARGET_SCENE_MISSING`,
      message: `Hotspot '${hotspotId}' ${eventLabel} event targets missing scene '${event.targetSceneId}'.`,
      entityId: hotspotId
    });
  }

  if (event.dialogueTreeId && !dialogueIds.has(event.dialogueTreeId)) {
    issues.push({
      level: "error",
      code: `${codePrefix}_DIALOGUE_MISSING`,
      message: `Hotspot '${hotspotId}' ${eventLabel} event targets missing dialogue tree '${event.dialogueTreeId}'.`,
      entityId: hotspotId
    });
  }

  validateResponseSelection(project, event, `Hotspot ${eventLabel.toLowerCase()} event`, hotspotId, issues);

  validateConditionEffectRefs(project, [], event.effects, issues, inventoryIds, sceneIds, dialogueIds, hotspotId);
}

function validateResponseLibrary(
  project: ProjectBundle,
  supportedLocales: string[],
  assetsById: Map<string, ProjectBundle["assets"]["assets"][number]>,
  issues: ValidationIssue[]
): void {
  const groupIds = new Set<string>();
  const entryIds = new Set<string>();

  for (const group of project.dialogues.responseGroups) {
    if (groupIds.has(group.id)) {
      issues.push({
        level: "error",
        code: "RESPONSE_GROUP_ID_DUPLICATE",
        message: `Response group ID '${group.id}' is used more than once.`,
        entityId: group.id
      });
    }
    groupIds.add(group.id);

    if (group.entries.length === 0) {
      issues.push({
        level: "warning",
        code: "RESPONSE_GROUP_EMPTY",
        message: `Response group '${group.name}' has no entries.`,
        entityId: group.id
      });
    }

    for (const entry of group.entries) {
      if (entryIds.has(entry.id)) {
        issues.push({
          level: "error",
          code: "RESPONSE_ENTRY_ID_DUPLICATE",
          message: `Response entry ID '${entry.id}' is used more than once.`,
          entityId: entry.id
        });
      }
      entryIds.add(entry.id);

      if (entry.kind === "text") {
        validateLocalizedTextCoverage(
          project,
          supportedLocales,
          entry.textId,
          "error",
          "RESPONSE_TEXT_MISSING",
          `Response entry '${entry.id}' references missing text`,
          entry.id,
          issues
        );
        continue;
      }

      if (!entry.assetId) {
        issues.push({
          level: "error",
          code: "RESPONSE_MEDIA_UNASSIGNED",
          message: `Response entry '${entry.id}' does not have a ${entry.kind} asset assigned.`,
          entityId: entry.id
        });
        continue;
      }

      const asset = assetsById.get(entry.assetId);
      if (!asset) {
        issues.push({
          level: "error",
          code: "RESPONSE_MEDIA_MISSING",
          message: `Response entry '${entry.id}' references missing asset '${entry.assetId}'.`,
          entityId: entry.id
        });
        continue;
      }

      if (asset.kind !== entry.kind) {
        issues.push({
          level: "error",
          code: "RESPONSE_MEDIA_KIND_INVALID",
          message: `Response entry '${entry.id}' requires ${entry.kind}, but asset '${asset.id}' is '${asset.kind}'.`,
          entityId: entry.id
        });
      }

      for (const locale of supportedLocales) {
        if (resolveAssetVariant(asset, locale)) {
          continue;
        }
        issues.push({
          level: "error",
          code: "RESPONSE_MEDIA_LOCALE_MISSING",
          message: `Asset '${asset.id}' is missing a '${locale}' variant for response '${entry.id}'.`,
          entityId: asset.id,
          locale
        });
      }
    }
  }
}

function validateResponseSelection(
  project: ProjectBundle,
  event: Pick<HotspotEvent, "dialogueTreeId" | "response" | "effects">,
  eventLabel: string,
  entityId: string,
  issues: ValidationIssue[]
): void {
  const response = event.response;
  if (!response) {
    return;
  }

  const startsDialogue = Boolean(
    event.dialogueTreeId || effectsContain(event.effects, (effect) => effect.type === "playDialogue")
  );
  if (startsDialogue) {
    issues.push({
      level: "error",
      code: "PLAYER_FEEDBACK_CONFLICT",
      message: `${eventLabel} '${entityId}' cannot start a dialogue and present a response at the same time.`,
      entityId
    });
  }

  if (response.type === "group") {
    const group = project.dialogues.responseGroups.find((candidate) => candidate.id === response.groupId);
    if (!group) {
      issues.push({
        level: "error",
        code: "RESPONSE_GROUP_MISSING",
        message: `${eventLabel} '${entityId}' references missing response group '${response.groupId}'.`,
        entityId
      });
      return;
    }

    if (group.entries.length === 0) {
      issues.push({
        level: "error",
        code: "RESPONSE_GROUP_ASSIGNED_EMPTY",
        message: `${eventLabel} '${entityId}' references response group '${group.name}', which has no entries.`,
        entityId
      });
    }
    return;
  }

  const entryExists = project.dialogues.responseGroups.some((group) =>
    group.entries.some((entry) => entry.id === response.entryId)
  );
  if (!entryExists) {
    issues.push({
      level: "error",
      code: "RESPONSE_ENTRY_MISSING",
      message: `${eventLabel} '${entityId}' references missing response entry '${response.entryId}'.`,
      entityId
    });
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
  assetsById: Map<string, ProjectBundle["assets"]["assets"][number]>,
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

    if (node.mediaAssetId) {
      validateForegroundMediaReference(
        node.mediaAssetId,
        `Dialogue node '${node.id}'`,
        node.id,
        "DIALOGUE_MEDIA",
        supportedLocales,
        assetsById,
        issues
      );
    }

    if (node.nextNodeId && !nodeIds.has(node.nextNodeId)) {
      issues.push({
        level: "error",
        code: "DIALOGUE_NEXT_NODE_MISSING",
        message: `Dialogue node '${node.id}' references missing node '${node.nextNodeId}'.`,
        entityId: node.id
      });
    }

    validateConditionEffectRefs(project, [], node.effects, issues, inventoryIds, sceneIds, dialogueIds, node.id);

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
        project,
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

function validateForegroundMediaReference(
  assetId: string,
  ownerLabel: string,
  ownerId: string,
  codePrefix: "HOTSPOT_MEDIA" | "DIALOGUE_MEDIA",
  supportedLocales: string[],
  assetsById: Map<string, ProjectBundle["assets"]["assets"][number]>,
  issues: ValidationIssue[]
): void {
  const asset = assetsById.get(assetId);
  if (!asset) {
    issues.push({
      level: "error",
      code: `${codePrefix}_ASSET_MISSING`,
      message: `${ownerLabel} references missing foreground media asset '${assetId}'.`,
      entityId: ownerId
    });
    return;
  }

  if (resolveAssetCategory(asset) !== "foreground") {
    issues.push({
      level: "error",
      code: `${codePrefix}_CATEGORY_INVALID`,
      message: `${ownerLabel} must reference a foreground media asset, but '${assetId}' is categorized as '${resolveAssetCategory(asset) ?? "legacy"}'.`,
      entityId: ownerId
    });
  }

  if (asset.kind !== "audio" && asset.kind !== "video") {
    issues.push({
      level: "error",
      code: `${codePrefix}_KIND_INVALID`,
      message: `${ownerLabel} must reference an audio or video asset, but '${assetId}' is '${asset.kind}'.`,
      entityId: ownerId
    });
  }

  for (const locale of supportedLocales) {
    if (resolveAssetVariant(asset, locale)) {
      continue;
    }

    issues.push({
      level: "error",
      code: `${codePrefix}_LOCALE_MISSING`,
      message: `Asset '${asset.id}' is missing a '${locale}' variant for ${ownerLabel.toLowerCase()}.`,
      entityId: asset.id,
      locale
    });
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
  project: ProjectBundle,
  conditions: Condition[],
  effects: Effect[],
  issues: ValidationIssue[],
  inventoryIds: Set<string>,
  sceneIds: Set<string>,
  dialogueIds: Set<string>,
  entityId: string,
  conditionalDepth = 0
): void {
  const variablesById = new Map(project.manifest.variables.map((variable) => [variable.id, variable]));
  for (const condition of conditions) {
    if (condition.type === "variableCompare") {
      const variable = variablesById.get(condition.variableId);
      if (!variable) {
        issues.push({
          level: "error",
          code: "CONDITION_VARIABLE_MISSING",
          message: `Condition on '${entityId}' references missing variable '${condition.variableId}'.`,
          entityId
        });
      } else if (!isVariableValueValid(variable, condition.value)) {
        issues.push({
          level: "error",
          code: "CONDITION_VARIABLE_VALUE_INVALID",
          message: `Condition on '${entityId}' compares variable '${condition.variableId}' with an invalid value.`,
          entityId
        });
      } else if (
        variable.type !== "integer" &&
        condition.operator !== "equals" &&
        condition.operator !== "notEquals"
      ) {
        issues.push({
          level: "error",
          code: "CONDITION_VARIABLE_OPERATOR_INVALID",
          message: `Condition on '${entityId}' uses a numeric comparison for non-integer variable '${condition.variableId}'.`,
          entityId
        });
      }
    }

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

  for (const [effectIndex, effect] of effects.entries()) {
    if (effect.type === "conditional") {
      if (conditionalDepth >= 1) {
        issues.push({
          level: "error",
          code: "CONDITIONAL_NESTING_TOO_DEEP",
          message: `Conditional action on '${entityId}' is nested more than one level deep.`,
          entityId
        });
      }
      if (effect.conditions.length === 0) {
        issues.push({
          level: "error",
          code: "CONDITIONAL_CONDITION_MISSING",
          message: `Conditional action on '${entityId}' needs at least one condition.`,
          entityId
        });
      }
      if (effect.thenEffects.length === 0 && effect.elseEffects.length === 0) {
        issues.push({
          level: "error",
          code: "CONDITIONAL_BRANCHES_EMPTY",
          message: `Conditional action on '${entityId}' needs an action in Then or Else.`,
          entityId
        });
      }
      validateConditionEffectRefs(
        project,
        effect.conditions,
        [],
        issues,
        inventoryIds,
        sceneIds,
        dialogueIds,
        entityId,
        conditionalDepth + 1
      );
      validateConditionEffectRefs(
        project,
        [],
        effect.thenEffects,
        issues,
        inventoryIds,
        sceneIds,
        dialogueIds,
        entityId,
        conditionalDepth + 1
      );
      validateConditionEffectRefs(
        project,
        [],
        effect.elseEffects,
        issues,
        inventoryIds,
        sceneIds,
        dialogueIds,
        entityId,
        conditionalDepth + 1
      );
    }

    if (effect.type === "setVariable" || effect.type === "changeVariable") {
      const variable = variablesById.get(effect.variableId);
      if (!variable) {
        issues.push({
          level: "error",
          code: "EFFECT_VARIABLE_MISSING",
          message: `Effect on '${entityId}' references missing variable '${effect.variableId}'.`,
          entityId
        });
      } else if (effect.type === "setVariable" && !isVariableValueValid(variable, effect.value)) {
        issues.push({
          level: "error",
          code: "EFFECT_VARIABLE_VALUE_INVALID",
          message: `Effect on '${entityId}' assigns an invalid value to variable '${effect.variableId}'.`,
          entityId
        });
      } else if (effect.type === "changeVariable" && variable.type !== "integer") {
        issues.push({
          level: "error",
          code: "EFFECT_VARIABLE_CHANGE_INVALID",
          message: `Effect on '${entityId}' changes non-integer variable '${effect.variableId}'.`,
          entityId
        });
      }
    }

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

    if (effectCanStartTerminalFlow(effect) && effectIndex < effects.length - 1) {
      issues.push({
        level: "warning",
        code: "EFFECT_TERMINAL_NOT_LAST",
        message: `Effect on '${entityId}' continues after '${effect.type}'. Move that action last unless the order is intentional.`,
        entityId
      });
    }
  }
}

function validateGameVariables(project: ProjectBundle, issues: ValidationIssue[]): void {
  for (const variable of project.manifest.variables) {
    if (!variable.name.trim()) {
      issues.push({
        level: "error",
        code: "VARIABLE_NAME_MISSING",
        message: `Variable '${variable.id}' needs an author-facing name.`,
        entityId: variable.id
      });
    }
    if (variable.type !== "choice") {
      continue;
    }
    if (variable.options.length < 2) {
      issues.push({
        level: "error",
        code: "VARIABLE_CHOICES_TOO_FEW",
        message: `Variable '${variable.id}' needs at least two choices.`,
        entityId: variable.id
      });
    }
    const optionIds = new Set<string>();
    for (const option of variable.options) {
      if (!option.name.trim()) {
        issues.push({
          level: "error",
          code: "VARIABLE_CHOICE_NAME_MISSING",
          message: `Choice '${option.id}' on variable '${variable.id}' needs a label.`,
          entityId: variable.id
        });
      }
      if (optionIds.has(option.id)) {
        issues.push({
          level: "error",
          code: "DUPLICATE_VARIABLE_CHOICE_ID",
          message: `Variable '${variable.id}' contains duplicate choice '${option.id}'.`,
          entityId: variable.id
        });
      }
      optionIds.add(option.id);
    }
    if (!optionIds.has(variable.initialValue)) {
      issues.push({
        level: "error",
        code: "VARIABLE_INITIAL_CHOICE_MISSING",
        message: `Variable '${variable.id}' starts with missing choice '${variable.initialValue}'.`,
        entityId: variable.id
      });
    }
  }
}

function isVariableValueValid(
  variable: ProjectBundle["manifest"]["variables"][number],
  value: boolean | number | string
): boolean {
  if (variable.type === "boolean") {
    return typeof value === "boolean";
  }
  if (variable.type === "integer") {
    return typeof value === "number" && Number.isInteger(value);
  }
  return typeof value === "string" && variable.options.some((option) => option.id === value);
}

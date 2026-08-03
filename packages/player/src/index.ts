import {
  type Condition,
  type DialogueChoice,
  type DialogueNode,
  type DialogueTree,
  type Effect,
  resolveAssetVariant,
  type Hotspot,
  type HotspotEvent,
  type InventoryItem,
  type Location,
  parseSaveState,
  type ProjectBundle,
  type ResponseEntry,
  type ResponseSelection,
  type SaveState,
  type Scene,
  createInitialSaveState,
  validateSaveStateForProject
} from "@mage2/schema";
export * from "./media-playhead";

export interface ActiveDialogueState {
  tree: DialogueTree;
  node: DialogueNode;
  choices: DialogueChoice[];
}

export interface PlayerSnapshot {
  saveState: SaveState;
  scene: Scene;
  location: Location;
  inventoryItems: InventoryItem[];
  flags: Record<string, boolean>;
  activeDialogue?: ActiveDialogueState;
}

export interface HotspotResolution {
  transitionedToSceneId?: string;
  startedDialogueTreeId?: string;
  mediaAssetId?: string;
  response?: ActivePlayerResponse;
}

export interface ActivePlayerResponse {
  sequence: number;
  entry: ResponseEntry;
  sourceGroupId?: string;
}

export interface PlayerControllerOptions {
  random?: () => number;
}

export type HotspotInteractionEventType = "click" | "otherItem";

export interface PlayerController {
  getSnapshot(): PlayerSnapshot;
  getVisibleHotspots(timeMs: number, sceneTimelineDurationMs?: number): Hotspot[];
  enterScene(sceneId: string): void;
  selectHotspot(hotspotId: string, timeMs: number, sceneTimelineDurationMs?: number): HotspotResolution;
  selectHotspotEvent(
    hotspotId: string,
    eventType: HotspotInteractionEventType,
    timeMs: number,
    sceneTimelineDurationMs?: number
  ): HotspotResolution;
  startDialogue(dialogueTreeId: string): void;
  continueDialogue(): void;
  chooseDialogueChoice(choiceId: string): void;
  save(): SaveState;
}

export const DEFAULT_SCENE_TIMELINE_DURATION_MS = 30000;

export function createPlayerController(
  project: ProjectBundle,
  initialSaveState?: SaveState,
  options: PlayerControllerOptions = {}
): PlayerController {
  const requestedState = parseSaveState({
    ...createInitialSaveState(project),
    ...(initialSaveState ?? {})
  });
  // Player controllers are also used outside the browser save UI. Keep that
  // boundary fail-safe if a caller supplies a stale state directly.
  const state = validateSaveStateForProject(requestedState, project)
    ? createInitialSaveState(project)
    : requestedState;
  const lastResponseEntryIdByGroup = new Map<string, string>();
  const random = options.random ?? Math.random;
  let responseSequence = 0;

  function getScene(sceneId = state.currentSceneId): Scene {
    const scene = project.scenes.items.find((entry) => entry.id === sceneId);
    if (!scene) {
      throw new Error(`Unknown scene '${sceneId}'.`);
    }

    return scene;
  }

  function getLocation(locationId = state.currentLocationId): Location {
    const location = project.locations.items.find((entry) => entry.id === locationId);
    if (!location) {
      throw new Error(`Unknown location '${locationId}'.`);
    }

    return location;
  }

  function getDialogue(dialogueTreeId: string): DialogueTree {
    const dialogue = project.dialogues.items.find((entry) => entry.id === dialogueTreeId);
    if (!dialogue) {
      throw new Error(`Unknown dialogue tree '${dialogueTreeId}'.`);
    }

    return dialogue;
  }

  function getDialogueNode(tree: DialogueTree, nodeId: string): DialogueNode {
    const node = tree.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      throw new Error(`Unknown dialogue node '${nodeId}'.`);
    }

    return node;
  }

  function hasInventoryItem(itemId: string): boolean {
    return state.inventory.includes(itemId);
  }

  function evaluateCondition(condition: Condition): boolean {
    switch (condition.type) {
      case "always":
        return true;
      case "flagEquals":
        return Boolean(state.flags[condition.flag]) === condition.value;
      case "inventoryHas":
        return hasInventoryItem(condition.itemId);
      case "sceneVisited":
        return state.visitedSceneIds.includes(condition.sceneId);
    }
  }

  function areConditionsMet(conditions: Condition[]): boolean {
    return conditions.every(evaluateCondition);
  }

  function resolveActiveDialogue(): ActiveDialogueState | undefined {
    if (!state.activeDialogueTreeId || !state.activeDialogueNodeId) {
      return undefined;
    }

    const tree = getDialogue(state.activeDialogueTreeId);
    const node = getDialogueNode(tree, state.activeDialogueNodeId);
    const choices = node.choices.filter((choice) => areConditionsMet(choice.conditions));
    return { tree, node, choices };
  }

  function setActiveDialogue(treeId?: string, nodeId?: string): void {
    state.activeDialogueTreeId = treeId;
    state.activeDialogueNodeId = nodeId;
  }

  function applyEffects(effects: Effect[]): HotspotResolution {
    const resolution: HotspotResolution = {};

    for (const effect of effects) {
      switch (effect.type) {
        case "setFlag":
          state.flags[effect.flag] = effect.value;
          break;
        case "addItem":
          state.inventory.unshift(effect.itemId);
          break;
        case "removeItem":
          state.inventory = removeSingleInventoryItem(state.inventory, effect.itemId);
          break;
        case "goToScene":
          enterScene(effect.sceneId);
          resolution.transitionedToSceneId = effect.sceneId;
          break;
        case "playDialogue":
          startDialogue(effect.dialogueTreeId);
          resolution.startedDialogueTreeId = effect.dialogueTreeId;
          break;
      }
    }

    return resolution;
  }

  function enterScene(sceneId: string): void {
    const currentScene = getScene();
    if (currentScene.id !== sceneId) {
      applyEffects(currentScene.onExitEffects);
    }

    const nextScene = getScene(sceneId);
    state.currentSceneId = nextScene.id;
    state.currentLocationId = nextScene.locationId;
    state.playheadMs = 0;

    if (!state.visitedSceneIds.includes(nextScene.id)) {
      state.visitedSceneIds.push(nextScene.id);
    }

    setActiveDialogue(undefined, undefined);
    applyEffects(nextScene.onEnterEffects);
  }

  function applyNodeEntry(tree: DialogueTree, nodeId: string): void {
    const node = getDialogueNode(tree, nodeId);
    setActiveDialogue(tree.id, node.id);
    applyEffects(node.effects);
  }

  function startDialogue(dialogueTreeId: string): void {
    const tree = getDialogue(dialogueTreeId);
    applyNodeEntry(tree, tree.startNodeId);
  }

  function continueDialogue(): void {
    const activeDialogue = resolveActiveDialogue();
    if (!activeDialogue || activeDialogue.node.choices.length > 0) {
      return;
    }

    if (!activeDialogue.node.nextNodeId) {
      setActiveDialogue(undefined, undefined);
      return;
    }

    applyNodeEntry(activeDialogue.tree, activeDialogue.node.nextNodeId);
  }

  function chooseDialogueChoice(choiceId: string): void {
    const activeDialogue = resolveActiveDialogue();
    if (!activeDialogue) {
      return;
    }

    const choice = activeDialogue.choices.find((entry) => entry.id === choiceId);
    if (!choice) {
      return;
    }

    applyEffects(choice.effects);

    if (!choice.nextNodeId) {
      setActiveDialogue(undefined, undefined);
      return;
    }

    applyNodeEntry(activeDialogue.tree, choice.nextNodeId);
  }

  function getVisibleHotspots(timeMs: number, sceneTimelineDurationMs?: number): Hotspot[] {
    const scene = getScene();
    const resolvedSceneTimelineDurationMs = sceneTimelineDurationMs ?? resolveProjectSceneTimelineDurationMs(project, scene);
    return scene.hotspots.filter((hotspot) => {
      const timingWindow = resolveHotspotTimingWindow(hotspot, resolvedSceneTimelineDurationMs);
      const withinWindow = timeMs >= timingWindow.startMs && timeMs <= timingWindow.endMs;
      const hasItems = hotspot.requiredItemIds.every(hasInventoryItem);
      return withinWindow && hasItems && areConditionsMet(hotspot.conditions);
    });
  }

  function selectHotspot(hotspotId: string, timeMs: number, sceneTimelineDurationMs?: number): HotspotResolution {
    const hotspot = getVisibleHotspots(timeMs, sceneTimelineDurationMs).find((entry) => entry.id === hotspotId);
    if (!hotspot) {
      return {};
    }

    const resolution = applyHotspotEvent(hotspot);
    resolution.mediaAssetId = hotspot.mediaAssetId;
    return resolution;
  }

  function selectHotspotEvent(
    hotspotId: string,
    eventType: HotspotInteractionEventType,
    timeMs: number,
    sceneTimelineDurationMs?: number
  ): HotspotResolution {
    const hotspot = getVisibleHotspots(timeMs, sceneTimelineDurationMs).find((entry) => entry.id === hotspotId);
    const event = eventType === "click" ? hotspot?.clickEvent : hotspot?.otherItemEvent;
    return event ? applyHotspotEvent(event) : {};
  }

  function applyHotspotEvent(event: HotspotEvent): HotspotResolution {
    const resolution = applyEffects(event.effects);
    if (event.dialogueTreeId && !resolution.startedDialogueTreeId) {
      startDialogue(event.dialogueTreeId);
      resolution.startedDialogueTreeId = event.dialogueTreeId;
    }

    if (event.targetSceneId && !resolution.transitionedToSceneId) {
      enterScene(event.targetSceneId);
      resolution.transitionedToSceneId = event.targetSceneId;
    }

    if (event.response && !resolution.startedDialogueTreeId) {
      resolution.response = resolvePlayerResponse(event.response);
    }

    return resolution;
  }

  function resolvePlayerResponse(selection: ResponseSelection): ActivePlayerResponse | undefined {
    if (selection.type === "entry") {
      for (const group of project.dialogues.responseGroups) {
        const entry = group.entries.find((candidate) => candidate.id === selection.entryId);
        if (entry) {
          responseSequence += 1;
          return { sequence: responseSequence, entry };
        }
      }
      return undefined;
    }

    const group = project.dialogues.responseGroups.find((candidate) => candidate.id === selection.groupId);
    if (!group || group.entries.length === 0) {
      return undefined;
    }

    const lastEntryId = lastResponseEntryIdByGroup.get(group.id);
    const candidates =
      group.entries.length > 1
        ? group.entries.filter((entry) => entry.id !== lastEntryId)
        : group.entries;
    const sampledRandomValue = random();
    const randomValue = Number.isFinite(sampledRandomValue) ? Math.max(0, sampledRandomValue) : 0;
    const selectedIndex = Math.min(candidates.length - 1, Math.floor(randomValue * candidates.length));
    const entry = candidates[selectedIndex] ?? candidates[0];
    if (!entry) {
      return undefined;
    }

    lastResponseEntryIdByGroup.set(group.id, entry.id);
    responseSequence += 1;
    return { sequence: responseSequence, entry, sourceGroupId: group.id };
  }

  function getSnapshot(): PlayerSnapshot {
    const scene = getScene();
    return {
      saveState: structuredClone(state),
      scene,
      location: getLocation(scene.locationId),
      inventoryItems: state.inventory
        .map((itemId) => project.inventory.items.find((item) => item.id === itemId))
        .filter((item): item is InventoryItem => Boolean(item)),
      flags: structuredClone(state.flags),
      activeDialogue: resolveActiveDialogue()
    };
  }

  return {
    getSnapshot,
    getVisibleHotspots,
    enterScene,
    selectHotspot,
    selectHotspotEvent,
    startDialogue,
    continueDialogue,
    chooseDialogueChoice,
    save: () => structuredClone(state)
  };
}

function removeSingleInventoryItem(inventory: string[], itemIdToRemove: string): string[] {
  const indexToRemove = inventory.findIndex((itemId) => itemId === itemIdToRemove);
  if (indexToRemove < 0) {
    return inventory;
  }

  return [
    ...inventory.slice(0, indexToRemove),
    ...inventory.slice(indexToRemove + 1)
  ];
}

export function resolveSceneTimelineDurationMs(
  visualDurationMs?: number,
  sceneAudioDelayMs = 0,
  sceneAudioDurationMs?: number
): number {
  const sceneAudioTimelineDurationMs =
    sceneAudioDurationMs !== undefined ? Math.max(0, sceneAudioDelayMs) + sceneAudioDurationMs : 0;

  const mediaDurationMs = Math.max(0, visualDurationMs ?? 0, sceneAudioTimelineDurationMs);
  return mediaDurationMs > 0 ? mediaDurationMs : DEFAULT_SCENE_TIMELINE_DURATION_MS;
}

export function resolveProjectSceneTimelineDurationMs(
  project: Pick<ProjectBundle, "assets" | "manifest">,
  scene: Scene,
  locale = project.manifest.defaultLanguage
): number {
  const backgroundAsset = project.assets.assets.find((asset) => asset.id === scene.backgroundAssetId);
  const backgroundVariant = backgroundAsset ? resolveAssetVariant(backgroundAsset, locale) : undefined;
  const sceneAudioAsset =
    backgroundAsset?.kind === "image" && scene.sceneAudioAssetId
      ? project.assets.assets.find((asset) => asset.id === scene.sceneAudioAssetId)
      : undefined;
  const sceneAudioVariant = sceneAudioAsset ? resolveAssetVariant(sceneAudioAsset, locale) : undefined;

  return resolveSceneTimelineDurationMs(
    backgroundVariant?.durationMs,
    backgroundAsset?.kind === "image" ? scene.sceneAudioDelayMs : 0,
    backgroundAsset?.kind === "image" ? sceneAudioVariant?.durationMs : undefined
  );
}

export function resolveHotspotTimingWindow(
  hotspot: Pick<Hotspot, "startMs" | "endMs" | "timingMode">,
  sceneTimelineDurationMs = DEFAULT_SCENE_TIMELINE_DURATION_MS
): { startMs: number; endMs: number } {
  if (hotspot.timingMode === "sceneDuration") {
    const resolvedSceneTimelineDurationMs =
      Number.isFinite(sceneTimelineDurationMs) && sceneTimelineDurationMs > 0
        ? sceneTimelineDurationMs
        : DEFAULT_SCENE_TIMELINE_DURATION_MS;

    return {
      startMs: 0,
      endMs: resolvedSceneTimelineDurationMs
    };
  }

  return {
    startMs: Math.max(0, hotspot.startMs),
    endMs: Math.max(0, hotspot.endMs)
  };
}

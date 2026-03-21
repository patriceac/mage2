import {
  type Condition,
  type DialogueChoice,
  type DialogueNode,
  type DialogueTree,
  type Effect,
  getLocaleStringValues,
  type Hotspot,
  type InventoryItem,
  type Location,
  parseSaveState,
  type ProjectBundle,
  type SaveState,
  type Scene,
  type SubtitleTrack,
  createInitialSaveState
} from "@mage2/schema";

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
}

export interface PlayerController {
  getSnapshot(): PlayerSnapshot;
  getVisibleHotspots(timeMs: number): Hotspot[];
  getSubtitleLines(timeMs: number, locale: string): string[];
  enterScene(sceneId: string): void;
  selectHotspot(hotspotId: string, timeMs: number): HotspotResolution;
  startDialogue(dialogueTreeId: string): void;
  continueDialogue(): void;
  chooseDialogueChoice(choiceId: string): void;
  save(): SaveState;
}

export const DEFAULT_SCENE_TIMELINE_DURATION_MS = 30000;

export function createPlayerController(
  project: ProjectBundle,
  initialSaveState?: SaveState
): PlayerController {
  const state = parseSaveState({
    ...createInitialSaveState(project),
    ...(initialSaveState ?? {})
  });

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
          if (!state.inventory.includes(effect.itemId)) {
            state.inventory.push(effect.itemId);
          }
          break;
        case "removeItem":
          state.inventory = state.inventory.filter((itemId) => itemId !== effect.itemId);
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

  function getVisibleHotspots(timeMs: number): Hotspot[] {
    const scene = getScene();
    return scene.hotspots.filter((hotspot) => {
      const withinWindow = timeMs >= hotspot.startMs && timeMs <= hotspot.endMs;
      const hasItems = hotspot.requiredItemIds.every(hasInventoryItem);
      return withinWindow && hasItems && areConditionsMet(hotspot.conditions);
    });
  }

  function selectHotspot(hotspotId: string, timeMs: number): HotspotResolution {
    const hotspot = getVisibleHotspots(timeMs).find((entry) => entry.id === hotspotId);
    if (!hotspot) {
      return {};
    }

    const resolution = applyEffects(hotspot.effects);
    if (hotspot.dialogueTreeId && !resolution.startedDialogueTreeId) {
      startDialogue(hotspot.dialogueTreeId);
      resolution.startedDialogueTreeId = hotspot.dialogueTreeId;
    }

    if (hotspot.targetSceneId && !resolution.transitionedToSceneId) {
      enterScene(hotspot.targetSceneId);
      resolution.transitionedToSceneId = hotspot.targetSceneId;
    }

    return resolution;
  }

  function getSubtitleLines(timeMs: number, locale: string): string[] {
    const scene = getScene();
    return scene.subtitleTracks.flatMap((track) =>
      resolveSubtitleTrackLines(track, timeMs, getLocaleStringValues(project, locale))
    );
  }

  function getSnapshot(): PlayerSnapshot {
    const scene = getScene();
    return {
      saveState: structuredClone(state),
      scene,
      location: getLocation(scene.locationId),
      inventoryItems: project.inventory.items.filter((item) => state.inventory.includes(item.id)),
      flags: structuredClone(state.flags),
      activeDialogue: resolveActiveDialogue()
    };
  }

  return {
    getSnapshot,
    getVisibleHotspots,
    getSubtitleLines,
    enterScene,
    selectHotspot,
    startDialogue,
    continueDialogue,
    chooseDialogueChoice,
    save: () => structuredClone(state)
  };
}

export function resolveSubtitleTrackLines(
  track: SubtitleTrack,
  timeMs: number,
  strings: Record<string, string>
): string[] {
  return track.cues
    .filter((cue) => timeMs >= cue.startMs && timeMs <= cue.endMs)
    .map((cue) => strings[cue.textId] ?? "")
    .filter((line) => line.trim().length > 0);
}

export function resolveSceneTimelineDurationMs(
  visualDurationMs?: number,
  sceneAudioDelayMs = 0,
  sceneAudioDurationMs?: number
): number {
  const sceneAudioTimelineDurationMs =
    sceneAudioDurationMs !== undefined ? Math.max(0, sceneAudioDelayMs) + sceneAudioDurationMs : 0;

  return Math.max(DEFAULT_SCENE_TIMELINE_DURATION_MS, visualDurationMs ?? 0, sceneAudioTimelineDurationMs);
}

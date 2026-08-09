import {
  type Condition,
  type DialogueChoice,
  type DialogueNode,
  type DialogueTree,
  type Effect,
  type GameVariableDefinition,
  type GameVariableValue,
  hydrateSaveStateVariables,
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
  variables: Record<string, GameVariableValue>;
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

export type HotspotInteractionEventType = "click" | "otherItem";

export type PlayerRuntimeIssueCode = "scene-transition-cycle" | "effect-budget-exceeded";

export interface PlayerRuntimeIssue {
  code: PlayerRuntimeIssueCode;
  message: string;
  scenePath: string[];
  effectsExecuted: number;
  effectBudget: number;
}

export interface ConditionEvaluation {
  condition: Condition;
  passed: boolean;
  actualValue?: GameVariableValue;
}

export interface HotspotAvailabilityExplanation {
  hotspotId: string;
  hotspotName: string;
  available: boolean;
  timing: { startMs: number; endMs: number; currentMs: number; passed: boolean };
  requiredItems: Array<{ itemId: string; present: boolean }>;
  conditionMode: "all" | "any";
  conditions: ConditionEvaluation[];
}

export type LogicTraceSourceKind =
  | "sceneEnter"
  | "sceneExit"
  | "sceneMediaEnd"
  | "hotspot"
  | "hotspotClick"
  | "hotspotOtherItem"
  | "dialogueNode"
  | "dialogueChoice";

export interface LogicTraceEntry {
  sequence: number;
  source: { kind: LogicTraceSourceKind; entityId: string };
  effect: Effect;
  previousValue?: GameVariableValue;
  nextValue?: GameVariableValue;
  applied: boolean;
  branch?: "then" | "otherwise";
  conditionEvaluations?: ConditionEvaluation[];
}

export interface PlayerControllerOptions {
  random?: () => number;
  effectBudget?: number;
}
export interface PlayerController {
  getSnapshot(): PlayerSnapshot;
  getRuntimeIssues(): PlayerRuntimeIssue[];
  getLogicTrace(): LogicTraceEntry[];
  clearLogicTrace(): void;
  explainHotspotAvailability(timeMs: number, sceneTimelineDurationMs?: number): HotspotAvailabilityExplanation[];
  getVisibleHotspots(timeMs: number, sceneTimelineDurationMs?: number): Hotspot[];
  enterScene(sceneId: string): void;
  completeSceneMedia(): HotspotResolution;
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
export const DEFAULT_EFFECT_BUDGET = 256;

interface EffectExecutionContext {
  effectBudget: number;
  effectsExecuted: number;
  halted: boolean;
  isDrainingTransitions: boolean;
  pendingSceneIds: string[];
  transitionPath?: string[];
}

export function createPlayerController(
  project: ProjectBundle,
  initialSaveState?: SaveState,
  options: PlayerControllerOptions = {}
): PlayerController {
  const requestedState = hydrateSaveStateVariables(
    project,
    parseSaveState({
      ...createInitialSaveState(project),
      ...(initialSaveState ?? {})
    })
  );
  // Player controllers are also used outside the browser save UI. Keep that
  // boundary fail-safe if a caller supplies a stale state directly.
  const state = validateSaveStateForProject(requestedState, project)
    ? createInitialSaveState(project)
    : requestedState;
  const lastResponseEntryIdByGroup = new Map<string, string>();
  const random = options.random ?? Math.random;
  let responseSequence = 0;
  let sceneEntrySequence = 0;
  let completedMediaEntrySequence: number | undefined;
  const effectBudget = resolveEffectBudget(options.effectBudget);
  const runtimeIssues: PlayerRuntimeIssue[] = [];
  const logicTrace: LogicTraceEntry[] = [];
  let logicTraceSequence = 0;
  let activeExecutionContext: EffectExecutionContext | undefined;

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

  function getVariableDefinition(variableId: string): GameVariableDefinition | undefined {
    return project.manifest.variables.find((variable) => variable.id === variableId);
  }

  function getVariableValue(variableId: string): GameVariableValue | undefined {
    const definition = getVariableDefinition(variableId);
    if (!definition) {
      return undefined;
    }
    return state.variables[variableId] ?? definition.initialValue;
  }

  function setVariableValue(variableId: string, value: GameVariableValue): void {
    const definition = getVariableDefinition(variableId);
    if (!definition) {
      return;
    }
    state.variables[variableId] = value;
    if (definition.type === "boolean" && typeof value === "boolean") {
      state.flags[variableId] = value;
    }
  }

  function evaluateCondition(condition: Condition): boolean {
    switch (condition.type) {
      case "always":
        return true;
      case "variableCompare": {
        const currentValue = getVariableValue(condition.variableId);
        switch (condition.operator) {
          case "equals":
            return currentValue === condition.value;
          case "notEquals":
            return currentValue !== condition.value;
          case "greaterThan":
            return typeof currentValue === "number" && typeof condition.value === "number" && currentValue > condition.value;
          case "greaterThanOrEqual":
            return typeof currentValue === "number" && typeof condition.value === "number" && currentValue >= condition.value;
          case "lessThan":
            return typeof currentValue === "number" && typeof condition.value === "number" && currentValue < condition.value;
          case "lessThanOrEqual":
            return typeof currentValue === "number" && typeof condition.value === "number" && currentValue <= condition.value;
        }
      }
      case "inventoryHas":
        return hasInventoryItem(condition.itemId) === (condition.present !== false);
      case "sceneVisited":
        return state.visitedSceneIds.includes(condition.sceneId) === (condition.visited !== false);
    }
  }

  function explainCondition(condition: Condition): ConditionEvaluation {
    if (condition.type === "variableCompare") {
      const actualValue = getVariableValue(condition.variableId);
      return { condition: structuredClone(condition), passed: evaluateCondition(condition), actualValue };
    }
    if (condition.type === "inventoryHas") {
      const actualValue = hasInventoryItem(condition.itemId);
      return { condition: structuredClone(condition), passed: evaluateCondition(condition), actualValue };
    }
    if (condition.type === "sceneVisited") {
      const actualValue = state.visitedSceneIds.includes(condition.sceneId);
      return { condition: structuredClone(condition), passed: evaluateCondition(condition), actualValue };
    }
    return { condition: structuredClone(condition), passed: true };
  }

  function areConditionsMet(conditions: Condition[], mode: "all" | "any" = "all"): boolean {
    if (conditions.length === 0) {
      return true;
    }
    return mode === "any" ? conditions.some(evaluateCondition) : conditions.every(evaluateCondition);
  }

  function resolveActiveDialogue(): ActiveDialogueState | undefined {
    if (!state.activeDialogueTreeId || !state.activeDialogueNodeId) {
      return undefined;
    }

    const tree = getDialogue(state.activeDialogueTreeId);
    const node = getDialogueNode(tree, state.activeDialogueNodeId);
    const choices = node.choices.filter((choice) => areConditionsMet(choice.conditions, choice.conditionMode));
    return { tree, node, choices };
  }

  function setActiveDialogue(treeId?: string, nodeId?: string): void {
    state.activeDialogueTreeId = treeId;
    state.activeDialogueNodeId = nodeId;
  }

  function runPlayerAction<T>(action: (context: EffectExecutionContext) => T): T {
    if (activeExecutionContext) {
      return action(activeExecutionContext);
    }

    const context: EffectExecutionContext = {
      effectBudget,
      effectsExecuted: 0,
      halted: false,
      isDrainingTransitions: false,
      pendingSceneIds: []
    };
    activeExecutionContext = context;

    try {
      return action(context);
    } finally {
      context.pendingSceneIds.length = 0;
      activeExecutionContext = undefined;
    }
  }

  function haltExecution(
    context: EffectExecutionContext,
    code: PlayerRuntimeIssueCode,
    message: string,
    scenePath = context.transitionPath ?? [state.currentSceneId]
  ): void {
    if (context.halted) {
      return;
    }

    context.halted = true;
    context.pendingSceneIds.length = 0;
    runtimeIssues.push({
      code,
      message,
      scenePath: [...scenePath],
      effectsExecuted: context.effectsExecuted,
      effectBudget: context.effectBudget
    });
  }

  function ensureEffectCapacity(context: EffectExecutionContext, requiredEffectCount: number): boolean {
    if (context.halted) {
      return false;
    }

    if (context.effectsExecuted + requiredEffectCount <= context.effectBudget) {
      return true;
    }

    haltExecution(
      context,
      "effect-budget-exceeded",
      `Effect budget of ${context.effectBudget} exceeded after ${context.effectsExecuted} effects.`
    );
    return false;
  }

  function consumeEffectBudget(context: EffectExecutionContext): boolean {
    if (!ensureEffectCapacity(context, 1)) {
      return false;
    }

    context.effectsExecuted += 1;
    return true;
  }

  function applyEffects(
    effects: Effect[],
    context: EffectExecutionContext,
    source: LogicTraceEntry["source"]
  ): HotspotResolution {
    const resolution: HotspotResolution = {};

    for (const effect of effects) {
      if (!consumeEffectBudget(context)) {
        break;
      }

      const previousValue = resolveEffectObservedValue(effect);
      let applied = true;
      let tracedBeforeNestedEffects = false;
      switch (effect.type) {
        case "setVariable":
          applied = Boolean(getVariableDefinition(effect.variableId));
          setVariableValue(effect.variableId, effect.value);
          break;
        case "changeVariable": {
          const currentValue = getVariableValue(effect.variableId);
          if (typeof currentValue === "number") {
            setVariableValue(effect.variableId, currentValue + effect.delta);
          } else {
            applied = false;
          }
          break;
        }
        case "addItem":
          state.inventory.unshift(effect.itemId);
          break;
        case "removeItem":
          applied = state.inventory.includes(effect.itemId);
          state.inventory = removeSingleInventoryItem(state.inventory, effect.itemId);
          break;
        case "goToScene":
          applied = effect.sceneId !== state.currentSceneId;
          appendLogicTrace(source, effect, previousValue, effect.sceneId, applied);
          tracedBeforeNestedEffects = true;
          requestSceneTransition(effect.sceneId, context);
          resolution.transitionedToSceneId = effect.sceneId;
          break;
        case "playDialogue":
          appendLogicTrace(source, effect, previousValue, effect.dialogueTreeId, true);
          tracedBeforeNestedEffects = true;
          startDialogueWithinAction(effect.dialogueTreeId, context);
          resolution.startedDialogueTreeId = effect.dialogueTreeId;
          break;
        case "conditional": {
          const conditionEvaluations = effect.conditions.map(explainCondition);
          const passed = effect.conditions.length > 0 && (
            effect.conditionMode === "any"
              ? conditionEvaluations.some((evaluation) => evaluation.passed)
              : conditionEvaluations.every((evaluation) => evaluation.passed)
          );
          const branch = passed ? "then" : "otherwise";
          appendLogicTrace(source, effect, passed, passed, true, { branch, conditionEvaluations });
          tracedBeforeNestedEffects = true;
          const branchResolution = applyEffects(
            passed ? effect.thenEffects : effect.elseEffects,
            context,
            source
          );
          Object.assign(resolution, branchResolution);
          break;
        }
      }

      if (!tracedBeforeNestedEffects) {
        appendLogicTrace(source, effect, previousValue, resolveEffectObservedValue(effect), applied);
      }

      if (context.halted) {
        break;
      }
    }

    return resolution;
  }

  function requestSceneTransition(sceneId: string, context: EffectExecutionContext): void {
    getScene(sceneId);

    // A request to the scene active when the effect runs is a no-op. In
    // particular, self-transitions in onExit/onEnter never rerun either hook.
    if (sceneId === state.currentSceneId || context.halted) {
      return;
    }

    context.pendingSceneIds.push(sceneId);
    drainSceneTransitions(context);
  }

  function drainSceneTransitions(context: EffectExecutionContext): void {
    if (context.isDrainingTransitions || context.halted) {
      return;
    }

    context.isDrainingTransitions = true;
    const previousTransitionPath = context.transitionPath;
    const transitionPath = [state.currentSceneId];
    context.transitionPath = transitionPath;

    try {
      while (context.pendingSceneIds.length > 0 && !context.halted) {
        const nextSceneId = context.pendingSceneIds.shift()!;
        if (nextSceneId === state.currentSceneId) {
          continue;
        }

        if (transitionPath.includes(nextSceneId)) {
          const cyclePath = [...transitionPath, nextSceneId];
          haltExecution(
            context,
            "scene-transition-cycle",
            `Scene transition cycle blocked: ${cyclePath.join(" -> ")}.`,
            cyclePath
          );
          break;
        }

        const currentScene = getScene();
        const nextScene = getScene(nextSceneId);
        if (!ensureEffectCapacity(
          context,
          currentScene.onExitEffects.length + nextScene.onEnterEffects.length
        )) {
          break;
        }

        applyEffects(currentScene.onExitEffects, context, { kind: "sceneExit", entityId: currentScene.id });
        if (context.halted || !ensureEffectCapacity(context, nextScene.onEnterEffects.length)) {
          break;
        }

        state.currentSceneId = nextScene.id;
        state.currentLocationId = nextScene.locationId;
        state.playheadMs = 0;
        sceneEntrySequence += 1;
        completedMediaEntrySequence = undefined;

        if (!state.visitedSceneIds.includes(nextScene.id)) {
          state.visitedSceneIds.push(nextScene.id);
        }

        setActiveDialogue(undefined, undefined);
        transitionPath.push(nextScene.id);
        applyEffects(nextScene.onEnterEffects, context, { kind: "sceneEnter", entityId: nextScene.id });
      }
    } finally {
      context.isDrainingTransitions = false;
      context.transitionPath = previousTransitionPath;
      if (context.halted) {
        context.pendingSceneIds.length = 0;
      }
    }
  }

  function enterScene(sceneId: string): void {
    runPlayerAction((context) => {
      requestSceneTransition(sceneId, context);
    });
  }

  function applyNodeEntry(tree: DialogueTree, nodeId: string, context: EffectExecutionContext): void {
    const node = getDialogueNode(tree, nodeId);
    setActiveDialogue(tree.id, node.id);
    applyEffects(node.effects, context, { kind: "dialogueNode", entityId: node.id });
  }

  function startDialogueWithinAction(dialogueTreeId: string, context: EffectExecutionContext): void {
    const tree = getDialogue(dialogueTreeId);
    applyNodeEntry(tree, tree.startNodeId, context);
  }

  function startDialogue(dialogueTreeId: string): void {
    runPlayerAction((context) => {
      startDialogueWithinAction(dialogueTreeId, context);
    });
  }

  function continueDialogue(): void {
    runPlayerAction((context) => {
      const activeDialogue = resolveActiveDialogue();
      if (!activeDialogue || activeDialogue.node.choices.length > 0) {
        return;
      }

      if (!activeDialogue.node.nextNodeId) {
        setActiveDialogue(undefined, undefined);
        return;
      }

      applyNodeEntry(activeDialogue.tree, activeDialogue.node.nextNodeId, context);
    });
  }

  function chooseDialogueChoice(choiceId: string): void {
    runPlayerAction((context) => {
      const activeDialogue = resolveActiveDialogue();
      if (!activeDialogue) {
        return;
      }

      const choice = activeDialogue.choices.find((entry) => entry.id === choiceId);
      if (!choice) {
        return;
      }

      applyEffects(choice.effects, context, { kind: "dialogueChoice", entityId: choice.id });
      if (context.halted) {
        return;
      }

      if (!choice.nextNodeId) {
        setActiveDialogue(undefined, undefined);
        return;
      }

      applyNodeEntry(activeDialogue.tree, choice.nextNodeId, context);
    });
  }

  function explainHotspotAvailability(
    timeMs: number,
    sceneTimelineDurationMs?: number
  ): HotspotAvailabilityExplanation[] {
    const scene = getScene();
    const resolvedSceneTimelineDurationMs = sceneTimelineDurationMs ?? resolveProjectSceneTimelineDurationMs(project, scene);
    return scene.hotspots.map((hotspot) => {
      const timingWindow = resolveHotspotTimingWindow(hotspot, resolvedSceneTimelineDurationMs);
      const withinWindow = timeMs >= timingWindow.startMs && timeMs <= timingWindow.endMs;
      const requiredItems = hotspot.requiredItemIds.map((itemId) => ({ itemId, present: hasInventoryItem(itemId) }));
      const conditions = hotspot.conditions.map(explainCondition);
      const conditionMode = hotspot.conditionMode ?? "all";
      const conditionsPassed = conditions.length === 0
        || (conditionMode === "any"
          ? conditions.some((condition) => condition.passed)
          : conditions.every((condition) => condition.passed));
      return {
        hotspotId: hotspot.id,
        hotspotName: hotspot.name,
        available: withinWindow && requiredItems.every((item) => item.present) && conditionsPassed,
        timing: { ...timingWindow, currentMs: timeMs, passed: withinWindow },
        requiredItems,
        conditionMode,
        conditions
      };
    });
  }

  function getVisibleHotspots(timeMs: number, sceneTimelineDurationMs?: number): Hotspot[] {
    const visibleIds = new Set(
      explainHotspotAvailability(timeMs, sceneTimelineDurationMs)
        .filter((entry) => entry.available)
        .map((entry) => entry.hotspotId)
    );
    return getScene().hotspots.filter((hotspot) => visibleIds.has(hotspot.id));
  }

  function selectHotspot(hotspotId: string, timeMs: number, sceneTimelineDurationMs?: number): HotspotResolution {
    return runPlayerAction((context) => {
      const hotspot = getVisibleHotspots(timeMs, sceneTimelineDurationMs).find((entry) => entry.id === hotspotId);
      if (!hotspot) {
        return {};
      }

      const resolution = applyHotspotEvent(hotspot, context, { kind: "hotspot", entityId: hotspot.id });
      resolution.mediaAssetId = hotspot.mediaAssetId;
      return resolution;
    });
  }

  function completeSceneMedia(): HotspotResolution {
    return runPlayerAction((context) => {
      if (completedMediaEntrySequence === sceneEntrySequence) {
        return {};
      }

      completedMediaEntrySequence = sceneEntrySequence;
      const scene = getScene();
      return applyEffects(scene.onMediaEndEffects, context, { kind: "sceneMediaEnd", entityId: scene.id });
    });
  }

  function selectHotspotEvent(
    hotspotId: string,
    eventType: HotspotInteractionEventType,
    timeMs: number,
    sceneTimelineDurationMs?: number
  ): HotspotResolution {
    return runPlayerAction((context) => {
      const hotspot = getVisibleHotspots(timeMs, sceneTimelineDurationMs).find((entry) => entry.id === hotspotId);
      const event = eventType === "click" ? hotspot?.clickEvent : hotspot?.otherItemEvent;
      return event
        ? applyHotspotEvent(event, context, {
            kind: eventType === "click" ? "hotspotClick" : "hotspotOtherItem",
            entityId: hotspotId
          })
        : {};
    });
  }

  function applyHotspotEvent(
    event: HotspotEvent,
    context: EffectExecutionContext,
    source: LogicTraceEntry["source"]
  ): HotspotResolution {
    const resolution = applyEffects(event.effects, context, source);
    if (context.halted) {
      return resolution;
    }

    if (event.dialogueTreeId && !resolution.startedDialogueTreeId) {
      startDialogueWithinAction(event.dialogueTreeId, context);
      resolution.startedDialogueTreeId = event.dialogueTreeId;
    }

    if (context.halted) {
      return resolution;
    }

    if (event.targetSceneId && !resolution.transitionedToSceneId) {
      requestSceneTransition(event.targetSceneId, context);
      resolution.transitionedToSceneId = event.targetSceneId;
    }

    if (context.halted) {
      return resolution;
    }

    if (event.response && !resolution.startedDialogueTreeId) {
      resolution.response = resolvePlayerResponse(event.response);
    }

    return resolution;
  }

  function resolveEffectObservedValue(effect: Effect): GameVariableValue | undefined {
    if (effect.type === "setVariable" || effect.type === "changeVariable") {
      return getVariableValue(effect.variableId);
    }
    if (effect.type === "addItem" || effect.type === "removeItem") {
      return state.inventory.includes(effect.itemId);
    }
    if (effect.type === "goToScene") {
      return state.currentSceneId;
    }
    if (effect.type === "conditional") {
      return undefined;
    }
    return state.activeDialogueTreeId ?? "";
  }

  function appendLogicTrace(
    source: LogicTraceEntry["source"],
    effect: Effect,
    previousValue: GameVariableValue | undefined,
    nextValue: GameVariableValue | undefined,
    applied: boolean,
    details: Pick<LogicTraceEntry, "branch" | "conditionEvaluations"> = {}
  ): void {
    logicTraceSequence += 1;
    logicTrace.push({
      sequence: logicTraceSequence,
      source: { ...source },
      effect: structuredClone(effect),
      previousValue,
      nextValue,
      applied,
      ...structuredClone(details)
    });
    if (logicTrace.length > 80) {
      logicTrace.splice(0, logicTrace.length - 80);
    }
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
      variables: structuredClone(state.variables),
      activeDialogue: resolveActiveDialogue()
    };
  }

  return {
    getSnapshot,
    getRuntimeIssues: () => structuredClone(runtimeIssues),
    getLogicTrace: () => structuredClone(logicTrace),
    clearLogicTrace: () => {
      logicTrace.length = 0;
    },
    explainHotspotAvailability,
    getVisibleHotspots,
    enterScene,
    completeSceneMedia,
    selectHotspot,
    selectHotspotEvent,
    startDialogue,
    continueDialogue,
    chooseDialogueChoice,
    save: () => structuredClone(state)
  };
}

function resolveEffectBudget(effectBudget: number | undefined): number {
  if (effectBudget === undefined) {
    return DEFAULT_EFFECT_BUDGET;
  }

  if (!Number.isInteger(effectBudget) || effectBudget <= 0) {
    throw new Error("Player effect budget must be a positive integer.");
  }

  return effectBudget;
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

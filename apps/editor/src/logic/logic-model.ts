import {
  type Condition,
  type Effect,
  type GameVariableDefinition,
  type GameVariableValue,
  type ProjectBundle,
  visitEffectConditions,
  visitEffects
} from "@mage2/schema";

export type NewVariableType = GameVariableDefinition["type"];

export function createVariableId(name: string, existingIds: Iterable<string>): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "") || "variable";
  const ids = new Set(existingIds);
  let candidate = base;
  let suffix = 2;
  while (ids.has(candidate)) {
    candidate = `${base}.${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function createGameVariableDefinition(
  name: string,
  type: NewVariableType,
  existingVariables: readonly GameVariableDefinition[],
  choiceNames: readonly string[] = []
): GameVariableDefinition {
  const trimmedName = name.trim();
  const id = createVariableId(trimmedName, existingVariables.map((variable) => variable.id));
  if (type === "boolean") {
    return { id, name: trimmedName, description: "", type, initialValue: false, system: false };
  }
  if (type === "integer") {
    return { id, name: trimmedName, description: "", type, initialValue: 0, system: false };
  }
  const optionIds = new Set<string>();
  const options = choiceNames
    .map((optionName) => optionName.trim())
    .filter(Boolean)
    .map((optionName) => {
      const option = { id: createVariableId(optionName, optionIds), name: optionName };
      optionIds.add(option.id);
      return option;
    });
  return {
    id,
    name: trimmedName,
    description: "",
    type,
    options,
    initialValue: options[0]!.id,
    system: false
  };
}

export function createVariableCondition(variable: GameVariableDefinition): Condition {
  return {
    type: "variableCompare",
    variableId: variable.id,
    operator: "equals",
    value: resolveSuggestedVariableValue(variable)
  };
}

export function createSetVariableEffect(variable: GameVariableDefinition): Effect {
  return {
    type: "setVariable",
    variableId: variable.id,
    value: resolveSuggestedVariableValue(variable)
  };
}

export function resolveSuggestedVariableValue(variable: GameVariableDefinition): GameVariableValue {
  return variable.type === "boolean" ? true : variable.initialValue;
}

export function isValueValidForVariable(variable: GameVariableDefinition, value: GameVariableValue): boolean {
  if (variable.type === "boolean") {
    return typeof value === "boolean";
  }
  if (variable.type === "integer") {
    return typeof value === "number" && Number.isInteger(value);
  }
  return typeof value === "string" && variable.options.some((option) => option.id === value);
}

export interface VariableUsage {
  variableId: string;
  conditions: number;
  effects: number;
}

export function collectVariableUsage(project: ProjectBundle): VariableUsage[] {
  const usage = new Map<string, VariableUsage>();
  const getUsage = (variableId: string) => {
    const current = usage.get(variableId) ?? { variableId, conditions: 0, effects: 0 };
    usage.set(variableId, current);
    return current;
  };
  const readConditions = (conditions: readonly Condition[]) => {
    for (const condition of conditions) {
      if (condition.type === "variableCompare") {
        getUsage(condition.variableId).conditions += 1;
      }
    }
  };
  const readEffects = (effects: readonly Effect[]) => {
    visitEffects(effects, (effect) => {
      if (effect.type === "setVariable" || effect.type === "changeVariable") {
        getUsage(effect.variableId).effects += 1;
      }
    });
    visitEffectConditions(effects, readConditions);
  };

  for (const scene of project.scenes.items) {
    readEffects(scene.onEnterEffects);
    readEffects(scene.onExitEffects);
    readEffects(scene.onMediaEndEffects);
    for (const hotspot of scene.hotspots) {
      readConditions(hotspot.conditions);
      readEffects(hotspot.effects);
      readEffects(hotspot.clickEvent?.effects ?? []);
      readEffects(hotspot.otherItemEvent?.effects ?? []);
    }
  }
  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      readEffects(node.effects);
      for (const choice of node.choices) {
        readConditions(choice.conditions);
        readEffects(choice.effects);
      }
    }
  }
  return [...usage.values()].sort((left, right) => left.variableId.localeCompare(right.variableId, "en"));
}

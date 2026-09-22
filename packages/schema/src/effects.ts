import type { Condition, Effect, ProjectBundle } from "./types";

/** Visits nested effects with their authoring owner, including both hotspot events. */
export function visitProjectEffects(
  project: ProjectBundle,
  visit: (effect: Effect, owner: { kind: "scene" | "dialogue"; id: string; name: string }) => void
): void {
  for (const scene of project.scenes.items) {
    const read = (effects: readonly Effect[]) => visitEffects(effects, (effect) => visit(effect, { kind: "scene", id: scene.id, name: scene.name }));
    read(scene.onEnterEffects);
    read(scene.onExitEffects);
    read(scene.onMediaEndEffects);
    for (const hotspot of scene.hotspots) {
      read(hotspot.effects);
      read(hotspot.clickEvent?.effects ?? []);
      read(hotspot.otherItemEvent?.effects ?? []);
    }
  }
  for (const dialogue of project.dialogues.items) {
    const read = (effects: readonly Effect[]) => visitEffects(effects, (effect) => visit(effect, { kind: "dialogue", id: dialogue.id, name: dialogue.name }));
    for (const node of dialogue.nodes) {
      read(node.effects);
      for (const choice of node.choices) read(choice.effects);
    }
  }
}

export function visitEffects(effects: readonly Effect[], visit: (effect: Effect) => void): void {
  for (const effect of effects) {
    visit(effect);
    if (effect.type === "conditional") {
      visitEffects(effect.thenEffects, visit);
      visitEffects(effect.elseEffects, visit);
    }
  }
}

export function visitEffectConditions(
  effects: readonly Effect[],
  visit: (conditions: readonly Condition[]) => void
): void {
  for (const effect of effects) {
    if (effect.type === "conditional") {
      visit(effect.conditions);
      visitEffectConditions(effect.thenEffects, visit);
      visitEffectConditions(effect.elseEffects, visit);
    }
  }
}

export function effectsContain(
  effects: readonly Effect[],
  predicate: (effect: Effect) => boolean
): boolean {
  for (const effect of effects) {
    if (predicate(effect)) {
      return true;
    }
    if (
      effect.type === "conditional" &&
      (effectsContain(effect.thenEffects, predicate) || effectsContain(effect.elseEffects, predicate))
    ) {
      return true;
    }
  }
  return false;
}

export function effectCanStartTerminalFlow(effect: Effect): boolean {
  return effect.type === "goToScene" ||
    effect.type === "playDialogue" ||
    (effect.type === "conditional" &&
      (effectsContain(effect.thenEffects, effectCanStartTerminalFlow) ||
        effectsContain(effect.elseEffects, effectCanStartTerminalFlow)));
}

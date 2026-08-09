import type { Condition, Effect } from "./types";

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

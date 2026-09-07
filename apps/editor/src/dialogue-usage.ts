import { visitEffects, type Effect, type ProjectBundle } from "@mage2/schema";
import type { EditorTranslator } from "./i18n";

export type DialogueUsage = {
  key: string;
  dialogueId: string;
  originName: string;
  label: string;
} & (
  | { kind: "scene"; sceneId: string; hotspotId?: string }
  | { kind: "dialogue"; sourceDialogueId: string; nodeId: string }
);

/** Authored launch locations, including conditional actions; not a runtime reachability guarantee. */
export function collectDialogueUsage(project: ProjectBundle, t: EditorTranslator): Map<string, DialogueUsage[]> {
  const usageByDialogue = new Map<string, DialogueUsage[]>();
  const addOrigin = (origin: Omit<Extract<DialogueUsage, { kind: "scene" }>, "dialogueId"> | Omit<Extract<DialogueUsage, { kind: "dialogue" }>, "dialogueId">,
    effects: readonly Effect[], directDialogueId?: string) => {
    const dialogueIds = new Set<string>();
    if (directDialogueId) dialogueIds.add(directDialogueId);
    visitEffects(effects, (effect) => {
      if (effect.type === "playDialogue") dialogueIds.add(effect.dialogueTreeId);
    });
    for (const dialogueId of dialogueIds) {
      const usages = usageByDialogue.get(dialogueId) ?? [];
      usages.push({ ...origin, dialogueId });
      usageByDialogue.set(dialogueId, usages);
    }
  };

  for (const scene of project.scenes.items) {
    scene.hotspots.forEach((hotspot, index) => {
      const base = { kind: "scene" as const, sceneId: scene.id, hotspotId: hotspot.id, originName: scene.name };
      const label = hotspot.name || t("Hotspot {number} ({id})", { number: index + 1, id: hotspot.id });
      addOrigin({ ...base, key: JSON.stringify(["hotspot", scene.id, hotspot.id, "primary"]), label }, hotspot.effects, hotspot.dialogueTreeId);
      for (const [eventKey, event, eventLabel] of [
        ["click", hotspot.clickEvent, t("On click")],
        ["other-item", hotspot.otherItemEvent, t("Any other item")]
      ] as const) {
        if (event) {
          addOrigin({ ...base, key: JSON.stringify(["hotspot", scene.id, hotspot.id, eventKey]), label: `${label} · ${eventLabel}` },
            event.effects, event.dialogueTreeId);
        }
      }
    });
    for (const [eventKey, effects, label] of [
      ["enter", scene.onEnterEffects, t("On entering {name}", { name: scene.name })],
      ["exit", scene.onExitEffects, t("On leaving {name}", { name: scene.name })],
      ["media-end", scene.onMediaEndEffects ?? [], t("When media ends in {name}", { name: scene.name })]
    ] as const) {
      addOrigin({ kind: "scene", key: JSON.stringify(["scene", scene.id, eventKey]), sceneId: scene.id, originName: scene.name, label }, effects);
    }
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      const base = { kind: "dialogue" as const, sourceDialogueId: dialogue.id, nodeId: node.id, originName: dialogue.name };
      addOrigin({ ...base, key: JSON.stringify(["line", dialogue.id, node.id]), label: t("From dialogue line {id}", { id: node.id }) }, node.effects);
      for (const choice of node.choices) {
        addOrigin({ ...base, key: JSON.stringify(["choice", dialogue.id, node.id, choice.id]), label: t("From dialogue choice {id}", { id: choice.id }) }, choice.effects);
      }
    }
  }
  return usageByDialogue;
}

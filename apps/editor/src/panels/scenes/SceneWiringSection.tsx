import type { Effect, GameVariableDefinition, ProjectBundle } from "@mage2/schema";
import { useEditorI18n } from "../../i18n/EditorI18nProvider";
import { EffectListEditor } from "../../logic/RuleBuilder";

type ProjectScene = ProjectBundle["scenes"]["items"][number];

interface SceneWiringSectionProps {
  project: ProjectBundle;
  scene: ProjectScene;
  isVideoScene: boolean;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}

export function SceneWiringSection({ project, scene, isVideoScene, mutateProject }: SceneWiringSectionProps) {
  const { t } = useEditorI18n();

  function updateEffects(
    field: "onEnterEffects" | "onExitEffects" | "onMediaEndEffects",
    effects: Effect[],
    variables?: GameVariableDefinition[]
  ) {
    mutateProject((draft) => {
      const draftScene = draft.scenes.items.find((entry) => entry.id === scene.id);
      if (draftScene) {
        draftScene[field] = effects;
        if (variables) {
          draft.manifest.variables = variables;
        }
      }
    });
  }

  return (
    <details className="scenes-panel__details">
      <summary className="scenes-panel__details-summary">
        <span>{t("Scene wiring")}</span>
        <span>{isVideoScene ? t("Enter, exit, and video-end effects") : t("Enter and exit effects")}</span>
      </summary>
      <div className="scenes-panel__details-body">
        <EffectListEditor
          project={project}
          label={t("When the scene starts")}
          description={t("Run these actions in order whenever the player enters this scene.")}
          effects={scene.onEnterEffects}
          onChange={(effects, variables) => updateEffects("onEnterEffects", effects, variables)}
        />
        <EffectListEditor
          project={project}
          label={t("When the scene ends")}
          description={t("Run these actions before the player leaves this scene.")}
          effects={scene.onExitEffects}
          onChange={(effects, variables) => updateEffects("onExitEffects", effects, variables)}
        />
        {isVideoScene ? (
          <EffectListEditor
            project={project}
            label={t("When the video ends")}
            description={t("Run these actions once when a non-looping background video finishes.")}
            effects={scene.onMediaEndEffects}
            onChange={(effects, variables) => updateEffects("onMediaEndEffects", effects, variables)}
          />
        ) : null}
      </div>
    </details>
  );
}

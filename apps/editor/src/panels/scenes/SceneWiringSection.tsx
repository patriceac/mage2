import type { Effect, ProjectBundle } from "@mage2/schema";
import { useEditorI18n } from "../../i18n/EditorI18nProvider";
import { JsonField, parseJsonWithFallback } from "./JsonField";

type ProjectScene = ProjectBundle["scenes"]["items"][number];

interface SceneWiringSectionProps {
  scene: ProjectScene;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}

export function SceneWiringSection({ scene, mutateProject }: SceneWiringSectionProps) {
  const { t } = useEditorI18n();

  function updateEffects(field: "onEnterEffects" | "onExitEffects", input: string) {
    mutateProject((draft) => {
      const draftScene = draft.scenes.items.find((entry) => entry.id === scene.id);
      if (draftScene) {
        draftScene[field] = parseSceneWiringEffectsJson(input, draftScene[field]);
      }
    });
  }

  return (
    <details className="scenes-panel__details">
      <summary className="scenes-panel__details-summary">
        <span>{t("Scene wiring")}</span>
        <span>{t("Enter and exit effects")}</span>
      </summary>
      <div className="scenes-panel__details-body">
        <div className="split-columns">
          <section>
            <JsonField
              label={t("On Enter Effects JSON")}
              value={JSON.stringify(scene.onEnterEffects, null, 2)}
              tooltip={t("JSON effect list that runs automatically when the player enters this scene.")}
              labelClassName="field-label--inset"
              onCommit={(nextValue) => updateEffects("onEnterEffects", nextValue)}
            />
            <JsonField
              label={t("On Exit Effects JSON")}
              value={JSON.stringify(scene.onExitEffects, null, 2)}
              tooltip={t("JSON effect list that runs automatically when the player leaves this scene.")}
              labelClassName="field-label--inset"
              onCommit={(nextValue) => updateEffects("onExitEffects", nextValue)}
            />
          </section>
        </div>
      </div>
    </details>
  );
}

export function parseSceneWiringEffectsJson(input: string, fallback: Effect[]): Effect[] {
  return parseJsonWithFallback(input, fallback);
}

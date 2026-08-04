import type { FirstProjectChecklistState, FirstProjectChecklistStepId } from "./first-project-checklist";

interface FirstProjectChecklistProps {
  state: FirstProjectChecklistState;
  onOpenSceneMedia: () => void;
  onOpenInteraction: () => void;
  onOpenPlayer: () => void;
  onReviewValidation: () => void;
  onOpenPlaytest: () => void;
  onDismiss: () => void;
}

export function FirstProjectChecklist({
  state,
  onOpenSceneMedia,
  onOpenInteraction,
  onOpenPlayer,
  onReviewValidation,
  onOpenPlaytest,
  onDismiss
}: FirstProjectChecklistProps) {
  return (
    <section className="first-project-checklist" aria-labelledby="first-project-checklist-title">
      <header className="first-project-checklist__header">
        <div>
          <p className="first-project-checklist__eyebrow">First project</p>
          <h3 id="first-project-checklist-title">Turn the starter into a playable scene</h3>
          <p>{state.completedCount} of {state.steps.length} setup steps complete</p>
        </div>
        <button
          type="button"
          className="first-project-checklist__dismiss"
          aria-label="Hide first project guide"
          title="Hide this guide for the current editor session."
          onClick={onDismiss}
        >
          ×
        </button>
      </header>

      <div
        className="first-project-checklist__progress"
        role="progressbar"
        aria-label="First project setup progress"
        aria-valuemin={0}
        aria-valuemax={state.steps.length}
        aria-valuenow={state.completedCount}
      >
        <span style={{ width: `${(state.completedCount / state.steps.length) * 100}%` }} />
      </div>

      <ol className="first-project-checklist__steps">
        {state.steps.map((step, index) => (
          <li
            key={step.id}
            className={step.complete ? "first-project-checklist__step first-project-checklist__step--complete" : "first-project-checklist__step"}
          >
            <span className="first-project-checklist__step-mark" aria-hidden="true">
              {step.complete ? "✓" : index + 1}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </div>
            <button
              type="button"
              data-first-project-step={step.id}
              onClick={resolveStepAction(step.id, step.complete, {
                onOpenSceneMedia,
                onOpenInteraction,
                onOpenPlayer,
                onReviewValidation,
                onOpenPlaytest
              })}
            >
              {resolveStepActionLabel(step.id, step.complete)}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function resolveStepAction(
  stepId: FirstProjectChecklistStepId,
  complete: boolean,
  actions: Pick<
    FirstProjectChecklistProps,
    "onOpenSceneMedia" | "onOpenInteraction" | "onOpenPlayer" | "onReviewValidation" | "onOpenPlaytest"
  >
): () => void {
  if (stepId === "media") {
    return actions.onOpenSceneMedia;
  }
  if (stepId === "interaction") {
    return actions.onOpenInteraction;
  }
  if (stepId === "player") {
    return actions.onOpenPlayer;
  }
  return complete ? actions.onOpenPlaytest : actions.onReviewValidation;
}

function resolveStepActionLabel(stepId: FirstProjectChecklistStepId, complete: boolean): string {
  if (stepId === "media") {
    return complete ? "Open scene" : "Add media";
  }
  if (stepId === "interaction") {
    return complete ? "Open hotspot" : "Wire hotspot";
  }
  if (stepId === "player") {
    return "Open player";
  }
  return complete ? "Playtest" : "Review issues";
}

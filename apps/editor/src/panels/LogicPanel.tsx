import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import {
  type GameVariableDefinition,
  type ProjectBundle,
  visitEffectConditions,
  visitEffects
} from "@mage2/schema";
import { DropdownSelect } from "../DropdownSelect";
import { useDialogs } from "../dialogs";
import { useEditorI18n } from "../i18n";
import { collectVariableUsage, createVariableId } from "../logic/logic-model";
import { VariableCreator } from "../logic/RuleBuilder";
import { useEditorStore } from "../store";
import "./LogicPanel.css";

interface LogicPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  setStatusMessage: (message: string) => void;
}

export function LogicPanel({ project, mutateProject, setStatusMessage }: LogicPanelProps) {
  const dialogs = useDialogs();
  const { direction, t } = useEditorI18n();
  const selectedVariableId = useEditorStore((state) => state.selectedVariableId);
  const setSelectedVariableId = useEditorStore((state) => state.setSelectedVariableId);
  const [isCreating, setIsCreating] = useState(false);
  const addVariableInvokerRef = useRef<HTMLButtonElement>(null);
  const usageByVariableId = useMemo(
    () => new Map(collectVariableUsage(project).map((usage) => [usage.variableId, usage])),
    [project]
  );
  const authoredVariables = project.manifest.variables.filter((variable) => !variable.system);
  const managedVariables = project.manifest.variables.filter((variable) => variable.system);
  const selectedVariable =
    project.manifest.variables.find((variable) => variable.id === selectedVariableId)
    ?? authoredVariables[0]
    ?? managedVariables[0];
  const selectedUsage = selectedVariable
    ? usageByVariableId.get(selectedVariable.id) ?? { variableId: selectedVariable.id, conditions: 0, effects: 0 }
    : undefined;

  const openVariableCreator = (event: ReactMouseEvent<HTMLButtonElement>) => {
    addVariableInvokerRef.current = event.currentTarget;
    setIsCreating(true);
  };

  useEffect(() => {
    if (selectedVariable && selectedVariable.id !== selectedVariableId) {
      setSelectedVariableId(selectedVariable.id);
    }
  }, [selectedVariable, selectedVariableId, setSelectedVariableId]);

  const updateSelectedVariable = (mutator: (variable: GameVariableDefinition) => void) => {
    if (!selectedVariable || selectedVariable.system) {
      return;
    }
    mutateProject((draft) => {
      const variable = draft.manifest.variables.find((entry) => entry.id === selectedVariable.id);
      if (variable && !variable.system) {
        mutator(variable);
      }
    });
  };

  const createVariable = (variable: GameVariableDefinition) => {
    mutateProject((draft) => {
      draft.manifest.variables.push(variable);
    });
    setSelectedVariableId(variable.id);
    setIsCreating(false);
    setStatusMessage(t("Created {name}. Add it to conditions or actions where the story should react to it.", {
      name: variable.name
    }));
  };

  const deleteSelectedVariable = async () => {
    if (!selectedVariable || selectedVariable.system || !selectedUsage) {
      return;
    }
    if (selectedUsage.conditions > 0 || selectedUsage.effects > 0) {
      return;
    }
    const confirmed = await dialogs.confirm({
      title: t("Delete {name}?", { name: selectedVariable.name }),
      body: <p>{t("This variable is unused. Deleting it cannot be undone after you save and close the project.")}</p>,
      confirmLabel: t("Delete Variable"),
      tone: "danger"
    });
    if (!confirmed) {
      return;
    }
    const selectedIndex = project.manifest.variables.findIndex((entry) => entry.id === selectedVariable.id);
    const nextSelection =
      project.manifest.variables[selectedIndex + 1]?.id
      ?? project.manifest.variables[selectedIndex - 1]?.id;
    mutateProject((draft) => {
      draft.manifest.variables = draft.manifest.variables.filter((entry) => entry.id !== selectedVariable.id);
    });
    setSelectedVariableId(nextSelection);
    setStatusMessage(t("Deleted {name}.", { name: selectedVariable.name }));
  };

  return (
    <section className="logic-workbench" aria-label={t("Logic and variables")} dir={direction}>
      <header className="logic-workbench__toolbar">
        <div>
          <strong>{t("Variables")}</strong>
          <span>{t("Story state shared by scene and dialogue rules.")}</span>
        </div>
        <span className="logic-workbench__count">
          {formatVariableCount(project.manifest.variables.length, t)}
        </span>
        <button
          type="button"
          className="logic-workbench__add"
          onClick={(event) => {
            if (isCreating) {
              setIsCreating(false);
              return;
            }
            openVariableCreator(event);
          }}
          aria-expanded={isCreating}
        >
          <span aria-hidden="true">+</span>
          {t("Add Variable")}
        </button>
      </header>

      {isCreating ? (
        <div className="logic-workbench__creator">
          <VariableCreator
            existingVariables={project.manifest.variables}
            submitLabel={t("Create Variable")}
            returnFocusRef={addVariableInvokerRef}
            onCreate={createVariable}
            onCancel={() => setIsCreating(false)}
          />
        </div>
      ) : null}

      <div className="logic-workbench__body">
        <aside className="logic-variable-browser" aria-label={t("Project variables")}>
          {authoredVariables.length > 0 ? (
            <VariableList
              title={t("Story variables")}
              variables={authoredVariables}
              selectedVariableId={selectedVariable?.id}
              usageByVariableId={usageByVariableId}
              onSelect={setSelectedVariableId}
            />
          ) : (
            <div className="logic-variable-browser__empty">
              <strong>{t("No story variables yet")}</strong>
              <span>{t("Create one here or directly inside a condition or action.")}</span>
              <button type="button" onClick={openVariableCreator}>{t("Add Variable")}</button>
            </div>
          )}
          {managedVariables.length > 0 ? (
            <VariableList
              title={t("Managed state")}
              description={t("Created automatically by inventory hotspot behaviors.")}
              variables={managedVariables}
              selectedVariableId={selectedVariable?.id}
              usageByVariableId={usageByVariableId}
              onSelect={setSelectedVariableId}
            />
          ) : null}
        </aside>

        <main className="logic-variable-detail" aria-label={t("Variable details")}>
          {selectedVariable && selectedUsage ? (
            <VariableDetail
              project={project}
              variable={selectedVariable}
              conditionCount={selectedUsage.conditions}
              effectCount={selectedUsage.effects}
              updateVariable={updateSelectedVariable}
              onDelete={() => void deleteSelectedVariable()}
            />
          ) : (
            <div className="logic-variable-detail__empty">
              <strong>{t("Create a variable to remember story state")}</strong>
              <p>{t("Use Yes / No for milestones, Number for counters, or Choice for a small set of named states.")}</p>
              <button type="button" onClick={openVariableCreator}>{t("Add Variable")}</button>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

function VariableList({
  title,
  description,
  variables,
  selectedVariableId,
  usageByVariableId,
  onSelect
}: {
  title: string;
  description?: string;
  variables: GameVariableDefinition[];
  selectedVariableId?: string;
  usageByVariableId: Map<string, { conditions: number; effects: number }>;
  onSelect: (variableId: string) => void;
}) {
  const { t } = useEditorI18n();
  return (
    <section className="logic-variable-group">
      <header>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </header>
      <div role="list">
        {variables.map((variable) => {
          const usage = usageByVariableId.get(variable.id) ?? { conditions: 0, effects: 0 };
          const useCount = usage.conditions + usage.effects;
          return (
            <button
              key={variable.id}
              type="button"
              role="listitem"
              className={variable.id === selectedVariableId ? "logic-variable-row logic-variable-row--selected" : "logic-variable-row"}
              aria-pressed={variable.id === selectedVariableId}
              onClick={() => onSelect(variable.id)}
              data-variable-id={variable.id}
            >
              <span className={`logic-variable-row__type logic-variable-row__type--${variable.type}`} aria-hidden="true">
                {variable.type === "boolean" ? "Y/N" : variable.type === "integer" ? "#" : "≡"}
              </span>
              <span className="logic-variable-row__identity">
                <strong>{variable.name}</strong>
                <small>{formatVariableType(variable, t)}</small>
              </span>
              <span className="logic-variable-row__uses">{formatUseCount(useCount, t)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function VariableDetail({
  project,
  variable,
  conditionCount,
  effectCount,
  updateVariable,
  onDelete
}: {
  project: ProjectBundle;
  variable: GameVariableDefinition;
  conditionCount: number;
  effectCount: number;
  updateVariable: (mutator: (variable: GameVariableDefinition) => void) => void;
  onDelete: () => void;
}) {
  const { t } = useEditorI18n();
  const useCount = conditionCount + effectCount;
  const isManaged = variable.system;
  return (
    <>
      <header className="logic-variable-detail__header">
        <div>
          <span className="logic-variable-detail__eyebrow">{isManaged ? t("Managed state") : t("Story variable")}</span>
          <h3>{variable.name}</h3>
          <p>{formatVariableType(variable, t)}</p>
        </div>
        {!isManaged ? (
          <button
            type="button"
            className="logic-variable-detail__delete"
            disabled={useCount > 0}
            onClick={onDelete}
            title={
              useCount > 0
                ? t("Remove this variable from every condition and action before deleting it.")
                : t("Delete this unused variable.")
            }
          >
            {t("Delete")}
          </button>
        ) : null}
      </header>

      <div className="logic-variable-usage" aria-label={t("Variable usage")}>
        <div><strong>{conditionCount}</strong><span>{t("Conditions")}</span></div>
        <div><strong>{effectCount}</strong><span>{t("Actions")}</span></div>
        <p>
          {isManaged
            ? t("This value is maintained by a hotspot inventory behavior. Edit that behavior from its scene.")
            : useCount > 0
              ? t("This variable is protected from deletion while rules use it.")
              : t("This variable is not used yet. Add it from a condition or action builder.")}
        </p>
      </div>

      <div className="logic-variable-form">
        <label>
          <span>{t("Name")}</span>
          <input
            value={variable.name}
            disabled={isManaged}
            onChange={(event) => updateVariable((entry) => { entry.name = event.target.value; })}
          />
          <small>{t("Use a phrase an author can recognize inside a rule.")}</small>
        </label>
        <label>
          <span>{t("ID")}</span>
          <input value={variable.id} readOnly />
          <small>{t("Stable internal ID. It does not change when the name changes.")}</small>
        </label>
        <label className="logic-variable-form__wide">
          <span>{t("Description")}</span>
          <textarea
            value={variable.description}
            disabled={isManaged}
            placeholder={t("What does this remember, and when should it change?")}
            onChange={(event) => updateVariable((entry) => { entry.description = event.target.value; })}
          />
        </label>
        <label>
          <span>{t("Type")}</span>
          <input value={formatVariableType(variable, t)} readOnly />
          <small>{t("Type stays fixed so existing rules remain valid.")}</small>
        </label>
        <label>
          <span>{t("Starting value")}</span>
          <InitialValueEditor variable={variable} disabled={isManaged} updateVariable={updateVariable} />
          <small>{t("Used when a player starts a new game.")}</small>
        </label>
      </div>

      {variable.type === "choice" ? (
        <ChoiceOptionsEditor
          project={project}
          variable={variable}
          disabled={isManaged}
          updateVariable={updateVariable}
        />
      ) : null}
    </>
  );
}

function InitialValueEditor({
  variable,
  disabled,
  updateVariable
}: {
  variable: GameVariableDefinition;
  disabled: boolean;
  updateVariable: (mutator: (variable: GameVariableDefinition) => void) => void;
}) {
  const { t } = useEditorI18n();
  if (variable.type === "boolean") {
    return (
      <DropdownSelect
        value={variable.initialValue ? "true" : "false"}
        disabled={disabled}
        onChange={(event) => updateVariable((entry) => {
          if (entry.type === "boolean") entry.initialValue = event.target.value === "true";
        })}
      >
        <option value="false">{t("No")}</option>
        <option value="true">{t("Yes")}</option>
      </DropdownSelect>
    );
  }
  if (variable.type === "integer") {
    return (
      <input
        type="number"
        step={1}
        value={variable.initialValue}
        disabled={disabled}
        onChange={(event) => updateVariable((entry) => {
          if (entry.type === "integer") entry.initialValue = Math.round(Number(event.target.value) || 0);
        })}
      />
    );
  }
  return (
    <DropdownSelect
      value={variable.initialValue}
      disabled={disabled}
      onChange={(event) => updateVariable((entry) => {
        if (entry.type === "choice") entry.initialValue = event.target.value;
      })}
    >
      {variable.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </DropdownSelect>
  );
}

function ChoiceOptionsEditor({
  project,
  variable,
  disabled,
  updateVariable
}: {
  project: ProjectBundle;
  variable: Extract<GameVariableDefinition, { type: "choice" }>;
  disabled: boolean;
  updateVariable: (mutator: (variable: GameVariableDefinition) => void) => void;
}) {
  const { t } = useEditorI18n();
  const optionUsage = collectChoiceOptionUsage(project, variable.id);
  const addOption = () => updateVariable((entry) => {
    if (entry.type !== "choice") return;
    const name = t("New choice");
    entry.options.push({ id: createVariableId(name, entry.options.map((option) => option.id)), name });
  });
  return (
    <section className="logic-choice-editor">
      <header>
        <div>
          <h4>{t("Choices")}</h4>
          <p>{t("Rules store the stable ID; changing a visible label is safe.")}</p>
        </div>
        <button type="button" disabled={disabled} onClick={addOption}>+ {t("Add Choice")}</button>
      </header>
      <div className="logic-choice-editor__table">
        <div className="logic-choice-editor__head" aria-hidden="true">
          <span>{t("Label")}</span><span>{t("Stable ID")}</span><span>{t("Uses")}</span><span />
        </div>
        {variable.options.map((option) => {
          const uses = optionUsage.get(option.id) ?? 0;
          const isStartingValue = option.id === variable.initialValue;
          const canDelete = !disabled && variable.options.length > 2 && !isStartingValue && uses === 0;
          const deleteReason = variable.options.length <= 2
            ? t("A Choice variable needs at least two choices.")
            : isStartingValue
              ? t("Choose a different starting value before deleting this choice.")
              : uses > 0
                ? t("Remove this choice from every condition and action before deleting it.")
                : t("Delete this choice.");
          return (
            <div key={option.id} className="logic-choice-editor__row">
              <input
                value={option.name}
                disabled={disabled}
                aria-label={t("Choice label")}
                onChange={(event) => updateVariable((entry) => {
                  if (entry.type !== "choice") return;
                  const nextOption = entry.options.find((candidate) => candidate.id === option.id);
                  if (nextOption) nextOption.name = event.target.value;
                })}
              />
              <code>{option.id}</code>
              <span>{formatUseCount(uses, t)}</span>
              <button
                type="button"
                disabled={!canDelete}
                title={deleteReason}
                aria-label={t("Delete {name}", { name: option.name })}
                onClick={() => updateVariable((entry) => {
                  if (entry.type === "choice") {
                    entry.options = entry.options.filter((candidate) => candidate.id !== option.id);
                  }
                })}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function collectChoiceOptionUsage(project: ProjectBundle, variableId: string): Map<string, number> {
  const usage = new Map<string, number>();
  const record = (value: boolean | number | string) => {
    if (typeof value === "string") usage.set(value, (usage.get(value) ?? 0) + 1);
  };
  const readConditions = (conditions: readonly ProjectBundle["scenes"]["items"][number]["hotspots"][number]["conditions"][number][]) => {
    for (const condition of conditions) {
      if (condition.type === "variableCompare" && condition.variableId === variableId) record(condition.value);
    }
  };
  const readEffects = (effects: ProjectBundle["scenes"]["items"][number]["onEnterEffects"]) => {
    visitEffects(effects, (effect) => {
      if (effect.type === "setVariable" && effect.variableId === variableId) record(effect.value);
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
  return usage;
}

function formatVariableType(variable: GameVariableDefinition, t: ReturnType<typeof useEditorI18n>["t"]): string {
  if (variable.type === "boolean") return t("Yes / No");
  if (variable.type === "integer") return t("Number");
  return t("Choice");
}

function formatVariableCount(count: number, t: ReturnType<typeof useEditorI18n>["t"]): string {
  return count === 1 ? t("{count} variable", { count }) : t("{count} variables", { count });
}

function formatUseCount(count: number, t: ReturnType<typeof useEditorI18n>["t"]): string {
  if (count === 0) return t("Unused");
  return count === 1 ? t("{count} use", { count }) : t("{count} uses", { count });
}

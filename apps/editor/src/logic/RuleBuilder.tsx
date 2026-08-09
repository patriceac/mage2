import { useState } from "react";
import {
  type Condition,
  type ConditionMatchMode,
  type Effect,
  effectCanStartTerminalFlow,
  type GameVariableDefinition,
  type GameVariableValue,
  type ProjectBundle,
  type VariableComparisonOperator
} from "@mage2/schema";
import { DropdownSelect } from "../DropdownSelect";
import { useEditorI18n } from "../i18n";
import {
  createGameVariableDefinition,
  createSetVariableEffect,
  createVariableCondition,
  isValueValidForVariable,
  type NewVariableType
} from "./logic-model";
import "./RuleBuilder.css";

interface LogicEditorProps {
  project: ProjectBundle;
  label: string;
  description?: string;
  compact?: boolean;
}

interface ConditionListEditorProps extends LogicEditorProps {
  conditions: Condition[];
  mode: ConditionMatchMode;
  onChange: (
    conditions: Condition[],
    mode: ConditionMatchMode,
    variables?: GameVariableDefinition[]
  ) => void;
}

interface EffectListEditorProps extends LogicEditorProps {
  effects: Effect[];
  onChange: (effects: Effect[], variables?: GameVariableDefinition[]) => void;
  nestingDepth?: number;
}

type ConditionKind = Exclude<Condition["type"], "always">;
type EffectKind = Effect["type"];
type VariableEffectKind = Extract<EffectKind, "setVariable" | "changeVariable">;

export function ConditionListEditor({
  project,
  label,
  description,
  conditions,
  mode,
  compact,
  onChange
}: ConditionListEditorProps) {
  const { t } = useEditorI18n();
  const [isCreatingVariable, setIsCreatingVariable] = useState(false);
  const editableConditions = conditions.filter((condition) => condition.type !== "always");

  const updateConditions = (
    nextConditions: Condition[],
    variables?: GameVariableDefinition[]
  ) => onChange(nextConditions, mode, variables);
  const addCondition = (kind: ConditionKind) => {
    if (kind === "variableCompare") {
      const variable = project.manifest.variables.find((entry) => !entry.system) ?? project.manifest.variables[0];
      if (!variable) {
        setIsCreatingVariable(true);
        return;
      }
      updateConditions([...editableConditions, createVariableCondition(variable)]);
      return;
    }
    if (kind === "inventoryHas") {
      const item = project.inventory.items[0];
      if (item) {
        updateConditions([...editableConditions, { type: "inventoryHas", itemId: item.id, present: true }]);
      }
      return;
    }
    const scene = project.scenes.items[0];
    if (scene) {
      updateConditions([...editableConditions, { type: "sceneVisited", sceneId: scene.id, visited: true }]);
    }
  };

  const createVariable = (variable: GameVariableDefinition) => {
    onChange(
      [...editableConditions, createVariableCondition(variable)],
      mode,
      [...project.manifest.variables, variable]
    );
    setIsCreatingVariable(false);
  };

  return (
    <section className={compact ? "logic-editor logic-editor--compact" : "logic-editor"} aria-label={label}>
      <header className="logic-editor__header">
        <div>
          <h5>{label}</h5>
          {description ? <p>{description}</p> : null}
        </div>
        {editableConditions.length > 1 ? (
          <label className="logic-editor__match-mode">
            <span>{t("Match")}</span>
            <DropdownSelect
              value={mode}
              aria-label={t("How these conditions are combined")}
              onChange={(event) => onChange(editableConditions, event.target.value as ConditionMatchMode)}
            >
              <option value="all">{t("All conditions")}</option>
              <option value="any">{t("Any condition")}</option>
            </DropdownSelect>
          </label>
        ) : null}
      </header>

      {editableConditions.length === 0 ? (
        <div className="logic-editor__empty">
          <strong>{t("Always")}</strong>
          <span>{t("No conditions limit this behavior.")}</span>
        </div>
      ) : (
        <ol className="logic-editor__rows">
          {editableConditions.map((condition, index) => (
            <li key={`${condition.type}:${index}`} className="logic-editor__row">
              <span className="logic-editor__connector" aria-hidden="true">
                {index === 0 ? t("If") : mode === "any" ? t("Or") : t("And")}
              </span>
              <ConditionRow
                condition={condition}
                project={project}
                onChange={(nextCondition, variables) =>
                  updateConditions(
                    editableConditions.map((entry, entryIndex) => (entryIndex === index ? nextCondition : entry)),
                    variables
                  )
                }
              />
              <RowActions
                index={index}
                count={editableConditions.length}
                onMove={(offset) => updateConditions(moveEntry(editableConditions, index, offset))}
                onRemove={() => updateConditions(editableConditions.filter((_, entryIndex) => entryIndex !== index))}
              />
            </li>
          ))}
        </ol>
      )}

      {isCreatingVariable ? (
        <VariableCreator
          existingVariables={project.manifest.variables}
          onCreate={createVariable}
          onCancel={() => setIsCreatingVariable(false)}
        />
      ) : (
        <div className="logic-editor__add-row">
          <DropdownSelect
            value=""
            aria-label={t("Add condition")}
            onChange={(event) => {
              const kind = event.target.value as ConditionKind;
              if (kind) {
                addCondition(kind);
              }
            }}
          >
            <option value="">{t("Add condition...")}</option>
            <option value="variableCompare">{t("Compare a variable")}</option>
            <option value="inventoryHas" disabled={project.inventory.items.length === 0}>
              {t("Check inventory")}
            </option>
            <option value="sceneVisited" disabled={project.scenes.items.length === 0}>
              {t("Check scene history")}
            </option>
          </DropdownSelect>
        </div>
      )}
    </section>
  );
}

export function EffectListEditor({
  project,
  label,
  description,
  effects,
  compact,
  nestingDepth = 0,
  onChange
}: EffectListEditorProps) {
  const { t } = useEditorI18n();
  const [creatingVariableFor, setCreatingVariableFor] = useState<VariableEffectKind | undefined>();

  const addEffect = (kind: EffectKind) => {
    const variable = project.manifest.variables.find((entry) => !entry.system) ?? project.manifest.variables[0];
    const integerVariable = project.manifest.variables.find((entry) => entry.type === "integer" && !entry.system)
      ?? project.manifest.variables.find((entry) => entry.type === "integer");
    const item = project.inventory.items[0];
    const scene = project.scenes.items[0];
    const dialogue = project.dialogues.items[0];
    switch (kind) {
      case "setVariable":
        if (variable) {
          onChange([...effects, createSetVariableEffect(variable)]);
        } else {
          setCreatingVariableFor("setVariable");
        }
        return;
      case "changeVariable":
        if (integerVariable) {
          onChange([...effects, { type: "changeVariable", variableId: integerVariable.id, delta: 1 }]);
        } else {
          setCreatingVariableFor("changeVariable");
        }
        return;
      case "addItem":
      case "removeItem":
        if (item) {
          onChange([...effects, { type: kind, itemId: item.id }]);
        }
        return;
      case "goToScene":
        if (scene) {
          onChange([...effects, { type: kind, sceneId: scene.id }]);
        }
        return;
      case "playDialogue":
        if (dialogue) {
          onChange([...effects, { type: kind, dialogueTreeId: dialogue.id }]);
        }
        return;
      case "conditional":
        if (nestingDepth === 0) {
          onChange([...effects, createConditionalEffect(project)]);
        }
        return;
    }
  };

  const createVariable = (variable: GameVariableDefinition) => {
    const effect = creatingVariableFor === "changeVariable"
      ? { type: "changeVariable" as const, variableId: variable.id, delta: 1 }
      : createSetVariableEffect(variable);
    onChange([...effects, effect], [...project.manifest.variables, variable]);
    setCreatingVariableFor(undefined);
  };

  return (
    <section className={compact ? "logic-editor logic-editor--compact" : "logic-editor"} aria-label={label}>
      <header className="logic-editor__header">
        <div>
          <h5>{label}</h5>
          {description ? <p>{description}</p> : null}
        </div>
      </header>

      {effects.length === 0 ? (
        <div className="logic-editor__empty">
          <strong>{t("No actions")}</strong>
          <span>{t("Nothing changes when this happens.")}</span>
        </div>
      ) : (
        <ol className="logic-editor__rows logic-editor__rows--effects">
          {effects.map((effect, index) => (
            <li key={`${effect.type}:${index}`} className="logic-editor__row">
              <span className="logic-editor__connector logic-editor__connector--step" aria-hidden="true">
                {index + 1}
              </span>
              <EffectRow
                effect={effect}
                project={project}
                nestingDepth={nestingDepth}
                showTerminalWarning={
                  index < effects.length - 1 && effectCanStartTerminalFlow(effect)
                }
                onChange={(nextEffect, variables) =>
                  onChange(
                    effects.map((entry, entryIndex) => (entryIndex === index ? nextEffect : entry)),
                    variables
                  )
                }
              />
              <RowActions
                index={index}
                count={effects.length}
                onMove={(offset) => onChange(moveEntry(effects, index, offset))}
                onRemove={() => onChange(effects.filter((_, entryIndex) => entryIndex !== index))}
              />
            </li>
          ))}
        </ol>
      )}

      {creatingVariableFor ? (
        <VariableCreator
          existingVariables={project.manifest.variables}
          preferredType={creatingVariableFor === "changeVariable" ? "integer" : "boolean"}
          fixedType={creatingVariableFor === "changeVariable" ? "integer" : undefined}
          onCreate={createVariable}
          onCancel={() => setCreatingVariableFor(undefined)}
        />
      ) : (
        <div className="logic-editor__add-row">
          <DropdownSelect
            value=""
            aria-label={t("Add action")}
            onChange={(event) => {
              const kind = event.target.value as EffectKind;
              if (kind) {
                addEffect(kind);
              }
            }}
          >
            <option value="">{t("Add action...")}</option>
            <option value="setVariable">{t("Set a variable")}</option>
            <option value="changeVariable">{t("Change a number")}</option>
            <option value="addItem" disabled={project.inventory.items.length === 0}>{t("Add inventory item")}</option>
            <option value="removeItem" disabled={project.inventory.items.length === 0}>{t("Remove inventory item")}</option>
            <option value="goToScene" disabled={project.scenes.items.length === 0}>{t("Go to scene")}</option>
            <option value="playDialogue" disabled={project.dialogues.items.length === 0}>{t("Start dialogue")}</option>
            {nestingDepth === 0 ? <option value="conditional">{t("If / Otherwise")}</option> : null}
          </DropdownSelect>
          {nestingDepth === 0 ? (
            <button
              type="button"
              className="button-secondary logic-editor__conditional-shortcut"
              onClick={() => addEffect("conditional")}
            >
              <span aria-hidden="true">+</span>
              {t("If / Otherwise")}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ConditionRow({
  condition,
  project,
  onChange
}: {
  condition: Exclude<Condition, { type: "always" }>;
  project: ProjectBundle;
  onChange: (condition: Condition, variables?: GameVariableDefinition[]) => void;
}) {
  const { t } = useEditorI18n();
  return (
    <div className="logic-editor__sentence">
      <DropdownSelect
        value={condition.type}
        aria-label={t("Condition type")}
        onChange={(event) => {
          const kind = event.target.value as ConditionKind;
          if (kind === "variableCompare") {
            const variable = project.manifest.variables[0];
            if (variable) {
              onChange(createVariableCondition(variable));
            }
          } else if (kind === "inventoryHas") {
            const item = project.inventory.items[0];
            if (item) {
              onChange({ type: kind, itemId: item.id, present: true });
            }
          } else {
            const scene = project.scenes.items[0];
            if (scene) {
              onChange({ type: kind, sceneId: scene.id, visited: true });
            }
          }
        }}
      >
        <option value="variableCompare">{t("Variable")}</option>
        <option value="inventoryHas" disabled={project.inventory.items.length === 0}>{t("Inventory")}</option>
        <option value="sceneVisited" disabled={project.scenes.items.length === 0}>{t("Scene history")}</option>
      </DropdownSelect>
      {condition.type === "variableCompare" ? (
        <VariableConditionFields condition={condition} project={project} onChange={onChange} />
      ) : condition.type === "inventoryHas" ? (
        <>
          <DropdownSelect
            value={condition.present !== false ? "has" : "missing"}
            aria-label={t("Inventory comparison")}
            onChange={(event) => onChange({ ...condition, present: event.target.value === "has" })}
          >
            <option value="has">{t("contains")}</option>
            <option value="missing">{t("does not contain")}</option>
          </DropdownSelect>
          <ReferenceSelect
            value={condition.itemId}
            label={t("Inventory item")}
            options={project.inventory.items.map((item) => ({ id: item.id, name: item.name }))}
            onChange={(itemId) => onChange({ ...condition, itemId })}
          />
        </>
      ) : (
        <>
          <DropdownSelect
            value={condition.visited !== false ? "visited" : "notVisited"}
            aria-label={t("Scene history comparison")}
            onChange={(event) => onChange({ ...condition, visited: event.target.value === "visited" })}
          >
            <option value="visited">{t("includes")}</option>
            <option value="notVisited">{t("does not include")}</option>
          </DropdownSelect>
          <ReferenceSelect
            value={condition.sceneId}
            label={t("Scene")}
            options={project.scenes.items.map((scene) => ({ id: scene.id, name: scene.name }))}
            onChange={(sceneId) => onChange({ ...condition, sceneId })}
          />
        </>
      )}
    </div>
  );
}

function VariableConditionFields({
  condition,
  project,
  onChange
}: {
  condition: Extract<Condition, { type: "variableCompare" }>;
  project: ProjectBundle;
  onChange: (condition: Condition, variables?: GameVariableDefinition[]) => void;
}) {
  const { t } = useEditorI18n();
  const [isCreatingVariable, setIsCreatingVariable] = useState(false);
  const variable = project.manifest.variables.find((entry) => entry.id === condition.variableId);
  const operators = variable?.type === "integer"
    ? ["equals", "notEquals", "greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual"] as const
    : ["equals", "notEquals"] as const;
  return (
    <>
      <div className="logic-editor__variable-reference">
        <ReferenceSelect
          value={condition.variableId}
          label={t("Variable")}
          options={project.manifest.variables.map((entry) => ({
            id: entry.id,
            name: entry.system ? t("{name} (managed)", { name: entry.name }) : entry.name
          }))}
          onChange={(variableId) => {
            const nextVariable = project.manifest.variables.find((entry) => entry.id === variableId);
            if (nextVariable) {
              onChange({ ...condition, variableId, operator: "equals", value: nextVariable.initialValue });
            }
          }}
        />
        <NewVariableButton expanded={isCreatingVariable} onClick={() => setIsCreatingVariable((value) => !value)} />
      </div>
      <DropdownSelect
        value={operators.includes(condition.operator as never) ? condition.operator : "equals"}
        aria-label={t("Comparison")}
        onChange={(event) => onChange({ ...condition, operator: event.target.value as VariableComparisonOperator })}
      >
        {operators.map((operator) => <option key={operator} value={operator}>{formatOperator(operator, t)}</option>)}
      </DropdownSelect>
      {variable ? (
        <VariableValueEditor
          variable={variable}
          value={isValueValidForVariable(variable, condition.value) ? condition.value : variable.initialValue}
          label={t("Comparison value")}
          onChange={(value) => onChange({ ...condition, value })}
        />
      ) : (
        <span className="logic-editor__missing">{t("Missing variable")}</span>
      )}
      {isCreatingVariable ? (
        <div className="logic-editor__inline-creator">
          <VariableCreator
            existingVariables={project.manifest.variables}
            onCreate={(nextVariable) => {
              onChange(
                createVariableCondition(nextVariable),
                [...project.manifest.variables, nextVariable]
              );
              setIsCreatingVariable(false);
            }}
            onCancel={() => setIsCreatingVariable(false)}
          />
        </div>
      ) : null}
    </>
  );
}

function EffectRow({
  effect,
  project,
  nestingDepth,
  showTerminalWarning,
  onChange
}: {
  effect: Effect;
  project: ProjectBundle;
  nestingDepth: number;
  showTerminalWarning: boolean;
  onChange: (effect: Effect, variables?: GameVariableDefinition[]) => void;
}) {
  const { t } = useEditorI18n();
  return (
    <div className="logic-editor__sentence-wrap">
      <div className="logic-editor__sentence">
        <DropdownSelect
          value={effect.type}
          aria-label={t("Action type")}
          onChange={(event) => {
            const kind = event.target.value as EffectKind;
            const variable = project.manifest.variables[0];
            const integerVariable = project.manifest.variables.find((entry) => entry.type === "integer");
            const item = project.inventory.items[0];
            const scene = project.scenes.items[0];
            const dialogue = project.dialogues.items[0];
            if (kind === "setVariable" && variable) onChange(createSetVariableEffect(variable));
            if (kind === "changeVariable" && integerVariable) onChange({ type: kind, variableId: integerVariable.id, delta: 1 });
            if ((kind === "addItem" || kind === "removeItem") && item) onChange({ type: kind, itemId: item.id });
            if (kind === "goToScene" && scene) onChange({ type: kind, sceneId: scene.id });
            if (kind === "playDialogue" && dialogue) onChange({ type: kind, dialogueTreeId: dialogue.id });
            if (kind === "conditional" && nestingDepth === 0) onChange(createConditionalEffect(project));
          }}
        >
          <option value="setVariable" disabled={project.manifest.variables.length === 0}>{t("Set variable")}</option>
          <option value="changeVariable" disabled={!project.manifest.variables.some((entry) => entry.type === "integer")}>{t("Change number")}</option>
          <option value="addItem" disabled={project.inventory.items.length === 0}>{t("Add item")}</option>
          <option value="removeItem" disabled={project.inventory.items.length === 0}>{t("Remove item")}</option>
          <option value="goToScene" disabled={project.scenes.items.length === 0}>{t("Go to scene")}</option>
          <option value="playDialogue" disabled={project.dialogues.items.length === 0}>{t("Start dialogue")}</option>
          {nestingDepth === 0 || effect.type === "conditional" ? (
            <option value="conditional">{t("If / Otherwise")}</option>
          ) : null}
        </DropdownSelect>
        {effect.type === "setVariable" ? (
          <VariableEffectFields effect={effect} project={project} onChange={onChange} />
        ) : effect.type === "changeVariable" ? (
          <ChangeVariableFields effect={effect} project={project} onChange={onChange} />
        ) : effect.type === "addItem" || effect.type === "removeItem" ? (
          <ReferenceSelect
            value={effect.itemId}
            label={t("Inventory item")}
            options={project.inventory.items.map((item) => ({ id: item.id, name: item.name }))}
            onChange={(itemId) => onChange({ ...effect, itemId })}
          />
        ) : effect.type === "goToScene" ? (
          <ReferenceSelect
            value={effect.sceneId}
            label={t("Scene")}
            options={project.scenes.items.map((scene) => ({ id: scene.id, name: scene.name }))}
            onChange={(sceneId) => onChange({ ...effect, sceneId })}
          />
        ) : effect.type === "playDialogue" ? (
          <ReferenceSelect
            value={effect.dialogueTreeId}
            label={t("Dialogue")}
            options={project.dialogues.items.map((dialogue) => ({ id: dialogue.id, name: dialogue.name }))}
            onChange={(dialogueTreeId) => onChange({ ...effect, dialogueTreeId })}
          />
        ) : (
          <span className="logic-editor__word">{t("choose which actions run")}</span>
        )}
      </div>
      {effect.type === "conditional" ? (
        <ConditionalEffectEditor
          effect={effect}
          project={project}
          nestingDepth={nestingDepth}
          onChange={onChange}
        />
      ) : null}
      {showTerminalWarning ? (
        <span className="logic-editor__warning">
          {effect.type === "conditional"
            ? t("A branch starts a scene or dialogue before later actions. Move this decision last unless that is intentional.")
            : t("This continues before the later actions. Move it last unless that is intentional.")}
        </span>
      ) : null}
    </div>
  );
}

function ConditionalEffectEditor({
  effect,
  project,
  nestingDepth,
  onChange
}: {
  effect: Extract<Effect, { type: "conditional" }>;
  project: ProjectBundle;
  nestingDepth: number;
  onChange: (effect: Effect, variables?: GameVariableDefinition[]) => void;
}) {
  const { t } = useEditorI18n();
  const hasNoBranchActions = effect.thenEffects.length === 0 && effect.elseEffects.length === 0;
  return (
    <div className="logic-editor__conditional">
      <ConditionListEditor
        compact
        project={project}
        label={t("Choose a branch")}
        description={t("When these conditions pass, run Then. Otherwise, run Otherwise.")}
        conditions={effect.conditions}
        mode={effect.conditionMode}
        onChange={(conditions, conditionMode, variables) =>
          onChange({ ...effect, conditions, conditionMode }, variables)
        }
      />
      <div className="logic-editor__branches">
        <div className="logic-editor__branch logic-editor__branch--then">
          <EffectListEditor
            compact
            project={project}
            label={t("Then")}
            description={t("Runs when the conditions pass.")}
            effects={effect.thenEffects}
            nestingDepth={nestingDepth + 1}
            onChange={(thenEffects, variables) => onChange({ ...effect, thenEffects }, variables)}
          />
        </div>
        <div className="logic-editor__branch logic-editor__branch--otherwise">
          <EffectListEditor
            compact
            project={project}
            label={t("Otherwise")}
            description={t("Runs when the conditions do not pass. Leave empty to do nothing.")}
            effects={effect.elseEffects}
            nestingDepth={nestingDepth + 1}
            onChange={(elseEffects, variables) => onChange({ ...effect, elseEffects }, variables)}
          />
        </div>
      </div>
      {effect.conditions.length === 0 ? (
        <span className="logic-editor__warning">{t("Add a condition so MAGE2 can choose a branch.")}</span>
      ) : null}
      {hasNoBranchActions ? (
        <span className="logic-editor__warning">{t("Add an action to Then or Otherwise.")}</span>
      ) : null}
    </div>
  );
}

function VariableEffectFields({
  effect,
  project,
  onChange
}: {
  effect: Extract<Effect, { type: "setVariable" }>;
  project: ProjectBundle;
  onChange: (effect: Effect, variables?: GameVariableDefinition[]) => void;
}) {
  const { t } = useEditorI18n();
  const [isCreatingVariable, setIsCreatingVariable] = useState(false);
  const variable = project.manifest.variables.find((entry) => entry.id === effect.variableId);
  return (
    <>
      <div className="logic-editor__variable-reference">
        <ReferenceSelect
          value={effect.variableId}
          label={t("Variable")}
          options={project.manifest.variables.map((entry) => ({ id: entry.id, name: entry.name }))}
          onChange={(variableId) => {
            const nextVariable = project.manifest.variables.find((entry) => entry.id === variableId);
            if (nextVariable) onChange({ ...effect, variableId, value: nextVariable.initialValue });
          }}
        />
        <NewVariableButton expanded={isCreatingVariable} onClick={() => setIsCreatingVariable((value) => !value)} />
      </div>
      <span className="logic-editor__word">{t("to")}</span>
      {variable ? (
        <VariableValueEditor
          variable={variable}
          value={isValueValidForVariable(variable, effect.value) ? effect.value : variable.initialValue}
          label={t("New value")}
          onChange={(value) => onChange({ ...effect, value })}
        />
      ) : <span className="logic-editor__missing">{t("Missing variable")}</span>}
      {isCreatingVariable ? (
        <div className="logic-editor__inline-creator">
          <VariableCreator
            existingVariables={project.manifest.variables}
            onCreate={(nextVariable) => {
              onChange(
                createSetVariableEffect(nextVariable),
                [...project.manifest.variables, nextVariable]
              );
              setIsCreatingVariable(false);
            }}
            onCancel={() => setIsCreatingVariable(false)}
          />
        </div>
      ) : null}
    </>
  );
}

function ChangeVariableFields({
  effect,
  project,
  onChange
}: {
  effect: Extract<Effect, { type: "changeVariable" }>;
  project: ProjectBundle;
  onChange: (effect: Effect, variables?: GameVariableDefinition[]) => void;
}) {
  const { t } = useEditorI18n();
  const [isCreatingVariable, setIsCreatingVariable] = useState(false);
  const integerVariables = project.manifest.variables.filter((entry) => entry.type === "integer");
  return (
    <>
      <div className="logic-editor__variable-reference">
        <ReferenceSelect
          value={effect.variableId}
          label={t("Number variable")}
          options={integerVariables.map((entry) => ({ id: entry.id, name: entry.name }))}
          onChange={(variableId) => onChange({ ...effect, variableId })}
        />
        <NewVariableButton expanded={isCreatingVariable} onClick={() => setIsCreatingVariable((value) => !value)} />
      </div>
      <DropdownSelect
        value={effect.delta < 0 ? "decrease" : "increase"}
        aria-label={t("Number operation")}
        onChange={(event) => onChange({ ...effect, delta: Math.max(1, Math.abs(effect.delta)) * (event.target.value === "decrease" ? -1 : 1) })}
      >
        <option value="increase">{t("increase by")}</option>
        <option value="decrease">{t("decrease by")}</option>
      </DropdownSelect>
      <input
        className="logic-editor__number"
        type="number"
        min={1}
        step={1}
        value={Math.max(1, Math.abs(effect.delta))}
        aria-label={t("Amount")}
        onChange={(event) => {
          const amount = Math.max(1, Math.round(Number(event.target.value) || 1));
          onChange({ ...effect, delta: effect.delta < 0 ? -amount : amount });
        }}
      />
      {isCreatingVariable ? (
        <div className="logic-editor__inline-creator">
          <VariableCreator
            existingVariables={project.manifest.variables}
            preferredType="integer"
            fixedType="integer"
            onCreate={(nextVariable) => {
              onChange(
                { ...effect, variableId: nextVariable.id },
                [...project.manifest.variables, nextVariable]
              );
              setIsCreatingVariable(false);
            }}
            onCancel={() => setIsCreatingVariable(false)}
          />
        </div>
      ) : null}
    </>
  );
}

function NewVariableButton({
  expanded,
  onClick
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  const { t } = useEditorI18n();
  return (
    <button
      type="button"
      className="button-secondary logic-editor__new-variable"
      aria-expanded={expanded}
      onClick={onClick}
    >
      <span aria-hidden="true">+</span>
      {t("New variable")}
    </button>
  );
}

function VariableValueEditor({
  variable,
  value,
  label,
  onChange
}: {
  variable: GameVariableDefinition;
  value: GameVariableValue;
  label: string;
  onChange: (value: GameVariableValue) => void;
}) {
  const { t } = useEditorI18n();
  if (variable.type === "boolean") {
    return (
      <DropdownSelect value={value === true ? "true" : "false"} aria-label={label} onChange={(event) => onChange(event.target.value === "true")}>
        <option value="true">{t("True")}</option>
        <option value="false">{t("False")}</option>
      </DropdownSelect>
    );
  }
  if (variable.type === "integer") {
    return (
      <input
        className="logic-editor__number"
        type="number"
        step={1}
        value={typeof value === "number" ? value : variable.initialValue}
        aria-label={label}
        onChange={(event) => onChange(Math.round(Number(event.target.value) || 0))}
      />
    );
  }
  return (
    <DropdownSelect value={typeof value === "string" ? value : variable.initialValue} aria-label={label} onChange={(event) => onChange(event.target.value)}>
      {variable.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </DropdownSelect>
  );
}

function ReferenceSelect({
  value,
  label,
  options,
  onChange
}: {
  value: string;
  label: string;
  options: Array<{ id: string; name: string }>;
  onChange: (value: string) => void;
}) {
  const { t } = useEditorI18n();
  const missing = value && !options.some((option) => option.id === value);
  return (
    <DropdownSelect value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>
      {missing ? <option value={value}>{t("Missing: {id}", { id: value })}</option> : null}
      {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </DropdownSelect>
  );
}

function RowActions({
  index,
  count,
  onMove,
  onRemove
}: {
  index: number;
  count: number;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useEditorI18n();
  return (
    <div className="logic-editor__row-actions">
      <button type="button" className="logic-editor__icon-button" disabled={index === 0} onClick={() => onMove(-1)} title={t("Move up")} aria-label={t("Move up")}>↑</button>
      <button type="button" className="logic-editor__icon-button" disabled={index === count - 1} onClick={() => onMove(1)} title={t("Move down")} aria-label={t("Move down")}>↓</button>
      <button type="button" className="logic-editor__icon-button logic-editor__icon-button--remove" onClick={onRemove} title={t("Remove")} aria-label={t("Remove")}>×</button>
    </div>
  );
}

function createConditionalEffect(project: ProjectBundle): Extract<Effect, { type: "conditional" }> {
  const variable = project.manifest.variables.find((entry) => !entry.system) ?? project.manifest.variables[0];
  const item = project.inventory.items[0];
  const scene = project.scenes.items[0];
  const condition: Condition | undefined = variable
    ? createVariableCondition(variable)
    : item
      ? { type: "inventoryHas", itemId: item.id, present: true }
      : scene
        ? { type: "sceneVisited", sceneId: scene.id, visited: true }
        : undefined;
  return {
    type: "conditional",
    conditionMode: "all",
    conditions: condition ? [condition] : [],
    thenEffects: [],
    elseEffects: []
  };
}

export function VariableCreator({
  existingVariables,
  preferredType = "boolean",
  fixedType,
  submitLabel,
  onCreate,
  onCancel
}: {
  existingVariables: readonly GameVariableDefinition[];
  preferredType?: NewVariableType;
  fixedType?: NewVariableType;
  submitLabel?: string;
  onCreate: (variable: GameVariableDefinition) => void;
  onCancel: () => void;
}) {
  const { t } = useEditorI18n();
  const [name, setName] = useState("");
  const [type, setType] = useState<NewVariableType>(fixedType ?? preferredType);
  const [choiceText, setChoiceText] = useState("");
  const choices = choiceText.split(",").map((entry) => entry.trim()).filter(Boolean);
  const canCreate = name.trim().length > 0 && (type !== "choice" || new Set(choices.map((entry) => entry.toLowerCase())).size >= 2);
  return (
    <div className="logic-editor__creator" role="group" aria-label={t("Create variable") }>
      <div className="logic-editor__creator-heading">
        <strong>{t("Create variable")}</strong>
        <span>{t("Give story state a clear author-facing name.")}</span>
      </div>
      <label>
        <span>{t("Name")}</span>
        <input autoFocus value={name} placeholder={t("For example: Cabinet opened")} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        <span>{t("Type")}</span>
        <DropdownSelect
          value={type}
          disabled={fixedType !== undefined}
          onChange={(event) => setType(event.target.value as NewVariableType)}
        >
          <option value="boolean">{t("Yes / No")}</option>
          <option value="integer">{t("Number")}</option>
          <option value="choice">{t("Choice")}</option>
        </DropdownSelect>
      </label>
      {type === "choice" ? (
        <label className="logic-editor__creator-options">
          <span>{t("Choices")}</span>
          <input value={choiceText} placeholder={t("For example: Unknown, Friend, Rival")} onChange={(event) => setChoiceText(event.target.value)} />
          <small>{t("Enter at least two choices, separated by commas.")}</small>
        </label>
      ) : null}
      <div className="logic-editor__creator-actions">
        <button type="button" className="button-secondary" onClick={onCancel}>{t("Cancel")}</button>
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => onCreate(createGameVariableDefinition(name, type, existingVariables, choices))}
        >
          {submitLabel ?? t("Create and use")}
        </button>
      </div>
    </div>
  );
}

function formatOperator(operator: VariableComparisonOperator, t: ReturnType<typeof useEditorI18n>["t"]): string {
  switch (operator) {
    case "equals": return t("is");
    case "notEquals": return t("is not");
    case "greaterThan": return t("is greater than");
    case "greaterThanOrEqual": return t("is at least");
    case "lessThan": return t("is less than");
    case "lessThanOrEqual": return t("is at most");
  }
}

function moveEntry<T>(entries: T[], index: number, offset: -1 | 1): T[] {
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= entries.length) {
    return entries;
  }
  const next = [...entries];
  [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
  return next;
}

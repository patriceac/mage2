import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import { type DialogueChoice, type DialogueNode, type ProjectBundle } from "@mage2/schema";
import { addDialogueTree, createId, ensureString } from "../project-helpers";
import { useEditorStore } from "../store";

interface DialoguePanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}

export function DialoguePanel({ project, mutateProject }: DialoguePanelProps) {
  const selectedDialogueId = useEditorStore((state) => state.selectedDialogueId);
  const selectedDialogueNodeId = useEditorStore((state) => state.selectedDialogueNodeId);
  const setSelectedDialogueId = useEditorStore((state) => state.setSelectedDialogueId);
  const setSelectedDialogueNodeId = useEditorStore((state) => state.setSelectedDialogueNodeId);
  const currentDialogue = project.dialogues.items.find((entry) => entry.id === selectedDialogueId) ?? project.dialogues.items[0];

  const dialogueNodes: Node[] =
    currentDialogue?.nodes.map((node, index) => ({
      id: node.id,
      position: { x: 80 + (index % 3) * 260, y: 80 + Math.floor(index / 3) * 180 },
      data: { label: `${node.speaker}: ${project.strings.values[node.textId] ?? node.textId}` },
      style: {
        background:
          node.id === selectedDialogueNodeId
            ? "#7dd3fc"
            : node.id === currentDialogue.startNodeId
              ? "#f6c177"
              : "#24313d",
        color:
          node.id === selectedDialogueNodeId || node.id === currentDialogue.startNodeId
            ? "#172026"
            : "#f7fafc",
        borderRadius: 14,
        padding: 10,
        width: 220,
        border:
          node.id === selectedDialogueNodeId
            ? "2px solid rgba(125, 211, 252, 0.95)"
            : "1px solid rgba(255,255,255,0.06)"
      }
    })) ?? [];

  const dialogueEdges: Edge[] =
    currentDialogue?.nodes.flatMap((node) => {
      const nextEdges: Edge[] = [];
      if (node.nextNodeId) {
        nextEdges.push({
          id: `${node.id}-${node.nextNodeId}`,
          source: node.id,
          target: node.nextNodeId,
          label: "next"
        });
      }

      for (const choice of node.choices) {
        if (choice.nextNodeId) {
          nextEdges.push({
            id: `${choice.id}-${choice.nextNodeId}`,
            source: node.id,
            target: choice.nextNodeId,
            label: project.strings.values[choice.textId] ?? choice.textId
          });
        }
      }
      return nextEdges;
    }) ?? [];

  return (
    <div className="panel-grid panel-grid--dialogue">
      <section className="panel panel--flow">
        <div className="panel__toolbar">
          <div className="stack-inline">
            <select
              value={currentDialogue?.id}
              title="Choose which dialogue tree to inspect and edit."
              onChange={(event) => {
                setSelectedDialogueId(event.target.value);
                setSelectedDialogueNodeId(undefined);
              }}
            >
              {project.dialogues.items.map((dialogue) => (
                <option key={dialogue.id} value={dialogue.id}>
                  {dialogue.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              title="Create a new dialogue tree with a starter node and make it the active editor target."
              onClick={() =>
                mutateProject((draft) => {
                  const dialogue = addDialogueTree(draft);
                  setSelectedDialogueId(dialogue.id);
                  setSelectedDialogueNodeId(dialogue.startNodeId);
                })
              }
            >
              Add Dialogue
            </button>
            {currentDialogue ? (
              <button
                type="button"
                title="Append a new dialogue node to the currently selected dialogue tree."
                onClick={() =>
                  mutateProject((draft) => {
                    const dialogue = draft.dialogues.items.find((entry) => entry.id === currentDialogue.id);
                    if (!dialogue) {
                      return;
                    }

                    const nodeId = createId("node");
                    const textId = `text.${nodeId}.line`;
                    ensureString(draft, textId, "New line");
                    dialogue.nodes.push({
                      id: nodeId,
                      speaker: "NPC",
                      textId,
                      choices: [],
                      effects: []
                    });
                    setSelectedDialogueNodeId(nodeId);
                  })
                }
              >
                Add Node
              </button>
            ) : null}
          </div>
        </div>

        {currentDialogue ? (
          <ReactFlow nodes={dialogueNodes} edges={dialogueEdges} fitView aria-label="Dialogue flow editor">
            <Background color="#30404d" />
            <Controls />
          </ReactFlow>
        ) : (
          <p>No dialogue trees yet.</p>
        )}
      </section>

      <aside className="panel">
        {currentDialogue ? (
          <>
            <label title="Readable editor name for this dialogue tree.">
              Dialogue Name
              <input
                value={currentDialogue.name}
                title="Readable editor name for this dialogue tree."
                onChange={(event) =>
                  mutateProject((draft) => {
                    const dialogue = draft.dialogues.items.find((entry) => entry.id === currentDialogue.id);
                    if (dialogue) {
                      dialogue.name = event.target.value;
                    }
                  })
                }
              />
            </label>
            <label title="Select which node acts as the entry point when this dialogue begins.">
              Start Node
              <select
                value={currentDialogue.startNodeId}
                title="Select which node acts as the entry point when this dialogue begins."
                onChange={(event) =>
                  mutateProject((draft) => {
                    const dialogue = draft.dialogues.items.find((entry) => entry.id === currentDialogue.id);
                    if (dialogue) {
                      dialogue.startNodeId = event.target.value;
                    }
                  })
                }
              >
                {currentDialogue.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.id}
                  </option>
                ))}
              </select>
            </label>

            {currentDialogue.nodes.map((node) => (
              <article
                key={node.id}
                className={node.id === selectedDialogueNodeId ? "list-card list-card--selected" : "list-card"}
              >
                <label>
                  Speaker
                  <input
                    value={node.speaker}
                    title="Speaker name displayed for this dialogue node."
                    onFocus={() => setSelectedDialogueNodeId(node.id)}
                    onChange={(event) =>
                      mutateProject((draft) => {
                        const target = findNode(draft, currentDialogue.id, node.id);
                        if (target) {
                          target.speaker = event.target.value;
                        }
                      })
                    }
                  />
                </label>
                <label>
                  Line
                  <textarea
                    value={project.strings.values[node.textId] ?? ""}
                    title="Dialogue line text spoken by this node."
                    onFocus={() => setSelectedDialogueNodeId(node.id)}
                    onChange={(event) =>
                      mutateProject((draft) => {
                        draft.strings.values[node.textId] = event.target.value;
                      })
                    }
                  />
                </label>
                <label title="Fallback node to visit after this line when no explicit choice is selected.">
                  Next Node
                  <select
                    value={node.nextNodeId ?? ""}
                    title="Fallback node to visit after this line when no explicit choice is selected."
                    onFocus={() => setSelectedDialogueNodeId(node.id)}
                    onChange={(event) =>
                      mutateProject((draft) => {
                        const target = findNode(draft, currentDialogue.id, node.id);
                        if (target) {
                          target.nextNodeId = event.target.value || undefined;
                        }
                      })
                    }
                  >
                    <option value="">End</option>
                    {currentDialogue.nodes
                      .filter((option) => option.id !== node.id)
                      .map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.id}
                        </option>
                      ))}
                  </select>
                </label>
                <JsonField
                  label="Node Effects JSON"
                  value={JSON.stringify(node.effects, null, 2)}
                  tooltip="Advanced JSON effect list that runs when this dialogue node is entered."
                  onCommit={(nextValue) =>
                    mutateProject((draft) => {
                      const target = findNode(draft, currentDialogue.id, node.id);
                      if (target) {
                        target.effects = parseJson(nextValue, target.effects);
                      }
                    })
                  }
                />

                <div className="choice-stack">
                  {node.choices.map((choice) => (
                    <ChoiceEditor
                      key={choice.id}
                      choice={choice}
                      nodes={currentDialogue.nodes.filter((option) => option.id !== node.id)}
                      project={project}
                      onFocus={() => setSelectedDialogueNodeId(node.id)}
                      onTextChange={(value) =>
                        mutateProject((draft) => {
                          draft.strings.values[choice.textId] = value;
                        })
                      }
                      onUpdate={(nextChoice) =>
                        mutateProject((draft) => {
                          const target = findNode(draft, currentDialogue.id, node.id);
                          if (!target) {
                            return;
                          }
                          target.choices = target.choices.map((entry) =>
                            entry.id === nextChoice.id ? nextChoice : entry
                          );
                        })
                      }
                    />
                  ))}

                  <button
                    type="button"
                    title="Add a new player choice to this dialogue node."
                    onClick={() =>
                      mutateProject((draft) => {
                        const target = findNode(draft, currentDialogue.id, node.id);
                        if (!target) {
                          return;
                        }

                        const choiceId = createId("choice");
                        const textId = `text.${choiceId}.label`;
                        ensureString(draft, textId, "Choice");
                        target.choices.push({
                          id: choiceId,
                          textId,
                          conditions: [],
                          effects: []
                        });
                      })
                    }
                  >
                    Add Choice
                  </button>
                </div>
              </article>
            ))}
          </>
        ) : (
          <p>Add a dialogue tree to start authoring.</p>
        )}
      </aside>
    </div>
  );
}

function ChoiceEditor({
  choice,
  nodes,
  project,
  onFocus,
  onTextChange,
  onUpdate
}: {
  choice: DialogueChoice;
  nodes: DialogueNode[];
  project: ProjectBundle;
  onFocus: () => void;
  onTextChange: (value: string) => void;
  onUpdate: (nextChoice: DialogueChoice) => void;
}) {
  return (
    <div className="choice-editor">
      <label title="Text shown to the player for this choice.">
        Choice Text
        <input
          value={project.strings.values[choice.textId] ?? ""}
          title="Text shown to the player for this choice."
          onFocus={onFocus}
          onChange={(event) => onTextChange(event.target.value)}
        />
      </label>
      <label title="Node that should be opened when the player selects this choice.">
        Next Node
        <select
          value={choice.nextNodeId ?? ""}
          title="Node that should be opened when the player selects this choice."
          onFocus={onFocus}
          onChange={(event) => onUpdate({ ...choice, nextNodeId: event.target.value || undefined })}
        >
          <option value="">End Dialogue</option>
          {nodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.id}
            </option>
          ))}
        </select>
      </label>
      <JsonField
        label="Conditions JSON"
        value={JSON.stringify(choice.conditions, null, 2)}
        tooltip="Advanced JSON condition list that must pass before this choice appears."
        onCommit={(nextValue) => onUpdate({ ...choice, conditions: parseJson(nextValue, choice.conditions) })}
      />
      <JsonField
        label="Effects JSON"
        value={JSON.stringify(choice.effects, null, 2)}
        tooltip="Advanced JSON effect list that runs after the player selects this choice."
        onCommit={(nextValue) => onUpdate({ ...choice, effects: parseJson(nextValue, choice.effects) })}
      />
    </div>
  );
}

function JsonField({
  label,
  value,
  tooltip,
  onCommit
}: {
  label: string;
  value: string;
  tooltip?: string;
  onCommit: (nextValue: string) => void;
}) {
  return (
    <label title={tooltip}>
      {label}
      <textarea defaultValue={value} onBlur={(event) => onCommit(event.target.value)} title={tooltip} />
    </label>
  );
}

function findNode(project: ProjectBundle, dialogueId: string, nodeId: string): DialogueNode | undefined {
  return project.dialogues.items.find((entry) => entry.id === dialogueId)?.nodes.find((node) => node.id === nodeId);
}

function parseJson<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

import { useMemo, useState } from "react";
import {
  getLocaleStringValues,
  type Asset,
  type DialogueChoice,
  type DialogueNode,
  type DialogueTree,
  type ProjectBundle
} from "@mage2/schema";
import { FOREGROUND_MEDIA_IMPORT_EXTENSIONS } from "../asset-file-types";
import { useDialogs } from "../dialogs";
import { DropdownSelect } from "../DropdownSelect";
import { addAssetRoots, addDialogueTree, createId, ensureString, isForegroundMediaAsset } from "../project-helpers";
import { setEditorLocalizedText } from "../localized-project";
import { AssetPreview } from "../previews";
import {
  collectOwnedGeneratedProjectTextIdsForDialogueChoice,
  collectOwnedGeneratedProjectTextIdsForDialogueNode,
  pruneOwnedGeneratedProjectTextEntries
} from "../project-text";
import { useEditorStore } from "../store";
import { ResponseGroupsPanel } from "./ResponseGroupsPanel";

interface DialoguePanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  setStatusMessage?: (message: string) => void;
  setBusyLabel?: (label?: string) => void;
  onOpenScenesHotspot?: (sceneId?: string, hotspotId?: string) => void;
}

interface DialogueNodeOption {
  id: string;
  label: string;
}

interface DialogueUsage {
  dialogueId: string;
  sceneId: string;
  sceneName: string;
  hotspotId: string;
  hotspotLabel: string;
}

const LINE_LABEL_PREVIEW_LENGTH = 64;

export function DialoguePanel(props: DialoguePanelProps) {
  const dialogueSection = useEditorStore((state) => state.dialogueSection) ?? "dialogues";
  const setDialogueSection = useEditorStore((state) => state.setDialogueSection);

  return (
    <div className="dialogue-screen">
      <nav className="dialogue-section-tabs" aria-label="Dialogue authoring sections">
        <button
          type="button"
          className={dialogueSection === "dialogues" ? "dialogue-section-tab dialogue-section-tab--active" : "dialogue-section-tab"}
          aria-pressed={dialogueSection === "dialogues"}
          onClick={() => setDialogueSection("dialogues")}
        >
          Dialogues
        </button>
        <button
          type="button"
          className={dialogueSection === "responses" ? "dialogue-section-tab dialogue-section-tab--active" : "dialogue-section-tab"}
          aria-pressed={dialogueSection === "responses"}
          onClick={() => setDialogueSection("responses")}
        >
          Responses
        </button>
      </nav>
      {dialogueSection === "dialogues" ? (
        <DialogueAuthoringPanel {...props} />
      ) : (
        <ResponseGroupsPanel
          project={props.project}
          mutateProject={props.mutateProject}
          setStatusMessage={props.setStatusMessage ?? (() => undefined)}
          setBusyLabel={props.setBusyLabel ?? (() => undefined)}
          onOpenScenesHotspot={props.onOpenScenesHotspot}
        />
      )}
    </div>
  );
}

function DialogueAuthoringPanel({
  project,
  mutateProject,
  setStatusMessage = () => undefined,
  setBusyLabel = () => undefined,
  onOpenScenesHotspot
}: DialoguePanelProps) {
  const dialogs = useDialogs();
  const selectedDialogueId = useEditorStore((state) => state.selectedDialogueId);
  const selectedDialogueNodeId = useEditorStore((state) => state.selectedDialogueNodeId);
  const setSelectedDialogueId = useEditorStore((state) => state.setSelectedDialogueId);
  const setSelectedDialogueNodeId = useEditorStore((state) => state.setSelectedDialogueNodeId);
  const [dialogueFilter, setDialogueFilter] = useState("");
  const activeLocale = project.manifest.defaultLanguage;
  const localeStrings = getLocaleStringValues(project, activeLocale);
  const foregroundMediaAssets = project.assets.assets.filter(isForegroundMediaAsset);
  const usageByDialogue = useMemo(() => collectDialogueUsage(project), [project]);
  const currentDialogue = project.dialogues.items.find((entry) => entry.id === selectedDialogueId) ?? project.dialogues.items[0];
  const currentUsage = currentDialogue ? usageByDialogue.get(currentDialogue.id) ?? [] : [];
  const filteredDialogues = project.dialogues.items.filter((dialogue) =>
    dialogue.name.toLowerCase().includes(dialogueFilter.trim().toLowerCase())
  );
  const selectedNode = selectedDialogueNodeId
    ? currentDialogue?.nodes.find((node) => node.id === selectedDialogueNodeId) ??
      currentDialogue?.nodes.find((node) => node.id === currentDialogue.startNodeId) ??
      currentDialogue?.nodes[0]
    : undefined;
  const selectedNodeId = selectedNode?.id;
  const nodeOptions: DialogueNodeOption[] =
    currentDialogue?.nodes.map((node, index) => ({
      id: node.id,
      label: formatDialogueNodeOption(node, index, localeStrings)
    })) ?? [];

  const selectDialogue = (dialogue: DialogueTree) => {
    setSelectedDialogueId(dialogue.id);
    setSelectedDialogueNodeId(dialogue.startNodeId);
  };

  const createDialogue = () => {
    mutateProject((draft) => {
      const dialogue = addDialogueTree(draft);
      setSelectedDialogueId(dialogue.id);
      setSelectedDialogueNodeId(dialogue.startNodeId);
    });
  };

  const addLine = () => {
    if (!currentDialogue) {
      return;
    }

    mutateProject((draft) => {
      const dialogue = findDialogue(draft, currentDialogue.id);
      if (!dialogue) {
        return;
      }

      const nodeId = createId("node");
      const textId = `text.${nodeId}.line`;
      ensureString(draft, textId, "New line");
      dialogue.nodes.push({
        id: nodeId,
        speaker: selectedNode?.speaker ?? "NPC",
        textId,
        choices: [],
        effects: []
      });
      setSelectedDialogueNodeId(nodeId);
    });
  };

  const deleteLine = (nodeId: string) => {
    if (!currentDialogue || currentDialogue.nodes.length <= 1) {
      return;
    }

    const nextSelectedNodeId = currentDialogue.nodes.find((node) => node.id !== nodeId)?.id;
    mutateProject((draft) => {
      const dialogue = findDialogue(draft, currentDialogue.id);
      const node = dialogue?.nodes.find((entry) => entry.id === nodeId);
      if (!dialogue || !node || dialogue.nodes.length <= 1) {
        return;
      }

      const removedTextIds = [
        ...collectOwnedGeneratedProjectTextIdsForDialogueNode(node),
        ...node.choices.flatMap((choice) => collectOwnedGeneratedProjectTextIdsForDialogueChoice(choice))
      ];

      dialogue.nodes = dialogue.nodes.filter((entry) => entry.id !== nodeId);
      if (dialogue.startNodeId === nodeId) {
        dialogue.startNodeId = dialogue.nodes[0]?.id ?? "";
      }

      for (const candidate of dialogue.nodes) {
        if (candidate.nextNodeId === nodeId) {
          candidate.nextNodeId = undefined;
        }
        candidate.choices = candidate.choices.map((choice) =>
          choice.nextNodeId === nodeId ? { ...choice, nextNodeId: undefined } : choice
        );
      }

      pruneOwnedGeneratedProjectTextEntries(draft, removedTextIds);
      setSelectedDialogueNodeId(nextSelectedNodeId);
    });
  };

  const addReply = (nodeId: string) => {
    if (!currentDialogue) {
      return;
    }

    mutateProject((draft) => {
      const target = findNode(draft, currentDialogue.id, nodeId);
      if (!target) {
        return;
      }

      const choiceId = createId("choice");
      const textId = `text.${choiceId}.label`;
      ensureString(draft, textId, "Player reply");
      target.choices.push({
        id: choiceId,
        textId,
        conditions: [],
        effects: []
      });
      target.nextNodeId = undefined;
    });
  };

  const deleteReply = (nodeId: string, choiceId: string) => {
    if (!currentDialogue) {
      return;
    }

    mutateProject((draft) => {
      const target = findNode(draft, currentDialogue.id, nodeId);
      const choice = target?.choices.find((entry) => entry.id === choiceId);
      if (!target || !choice) {
        return;
      }

      target.choices = target.choices.filter((entry) => entry.id !== choiceId);
      pruneOwnedGeneratedProjectTextEntries(draft, collectOwnedGeneratedProjectTextIdsForDialogueChoice(choice));
    });
  };

  const openScenes = (usage?: DialogueUsage) => {
    onOpenScenesHotspot?.(usage?.sceneId, usage?.hotspotId);
  };

  const importDialogueMediaFromFilePath = async (dialogueId: string, nodeId: string, filePath: string) => {
    try {
      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error("No project directory is currently open.");
      }

      setBusyLabel("Importing dialogue media");
      const { importedAssets, duplicateAssets, duplicateFilePaths } = await window.editorApi.importAssets(
        projectDir,
        activeLocale,
        project.assets.assets,
        [filePath],
        "foreground"
      );
      const assignedAsset =
        importedAssets[0] ??
        (duplicateAssets[0]
          ? project.assets.assets.find((asset) => asset.id === duplicateAssets[0]!.assetId)
          : undefined);

      if (!assignedAsset) {
        setStatusMessage(
          duplicateFilePaths.length > 0
            ? "That file already exists as foreground media. Choose it from the line media picker."
            : "No new dialogue media asset was created."
        );
        return;
      }

      mutateProject((draft) => {
        if (importedAssets[0]) {
          addAssetRoots(draft, [assignedAsset]);
          draft.assets.assets.push(assignedAsset);
        }
        const target = findNode(draft, dialogueId, nodeId);
        if (target) {
          target.mediaAssetId = assignedAsset.id;
        }
      });
      useEditorStore.getState().setSelectedAssetId(assignedAsset.id);
      setStatusMessage(
        `${importedAssets[0] ? "Imported" : "Assigned existing"} ${assignedAsset.name} as foreground media for this dialogue line. Save the project to keep this change.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Dialogue media import failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  };

  const handleImportDialogueMedia = async (dialogueId: string, node: DialogueNode) => {
    const filePaths = await dialogs.pickFiles({
      title: `Import Media for ${node.speaker || "Dialogue Line"}`,
      description: "Choose an audio or video file to play once when this dialogue line opens.",
      initialPath: useEditorStore.getState().projectDir,
      confirmLabel: "Use as Line Media",
      allowedExtensions: [...FOREGROUND_MEDIA_IMPORT_EXTENSIONS]
    });
    const filePath = filePaths[0];
    if (filePath) {
      await importDialogueMediaFromFilePath(dialogueId, node.id, filePath);
    }
  };

  return (
    <div className="panel-grid panel-grid--dialogue dialogue-workspace">
      <aside className="panel dialogue-library" aria-label="Dialogue library">
        <div className="dialogue-library__header">
          <div>
            <p className="eyebrow">Dialogue Authoring</p>
            <h3>Dialogues</h3>
          </div>
          <button type="button" className="button-accent" onClick={createDialogue}>
            New Dialogue
          </button>
        </div>
        <label className="dialogue-search">
          <span className="field-label--inset">Find dialogue</span>
          <input
            value={dialogueFilter}
            placeholder="Search by name"
            onChange={(event) => setDialogueFilter(event.target.value)}
          />
        </label>
        {project.dialogues.items.length > 0 ? (
          <div className="dialogue-library__list">
            {filteredDialogues.map((dialogue) => {
              const usage = usageByDialogue.get(dialogue.id) ?? [];
              const isSelected = dialogue.id === currentDialogue?.id;
              return (
                <button
                  key={dialogue.id}
                  type="button"
                  className={isSelected ? "dialogue-library-item dialogue-library-item--selected" : "dialogue-library-item"}
                  onClick={() => selectDialogue(dialogue)}
                >
                  <span className="dialogue-library-item__name">{dialogue.name}</span>
                  <span className="dialogue-library-item__meta">
                    {formatLineCount(dialogue.nodes.length)} · {formatUsageBadge(usage.length)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="dialogue-empty-state">
            <h4>Create your first dialogue</h4>
            <p className="muted">Write the conversation here, then start it from a hotspot in Scenes.</p>
            <button type="button" className="button-accent" onClick={createDialogue}>
              New Dialogue
            </button>
          </div>
        )}
        {project.dialogues.items.length > 0 && filteredDialogues.length === 0 ? (
          <p className="muted">No dialogues match this search.</p>
        ) : null}
      </aside>

      <main className="panel dialogue-builder" aria-label="Conversation builder">
        {currentDialogue ? (
          <>
            <header className="dialogue-builder__header">
              <div>
                <p className="eyebrow">Write dialogue here. Start it from a hotspot in Scenes.</p>
                <label className="dialogue-title-field">
                  <span className="field-label--inset">Dialogue name</span>
                  <input
                    value={currentDialogue.name}
                    onChange={(event) =>
                      mutateProject((draft) => {
                        const dialogue = findDialogue(draft, currentDialogue.id);
                        if (dialogue) {
                          dialogue.name = event.target.value;
                        }
                      })
                    }
                  />
                </label>
              </div>
              <div className="dialogue-builder__actions">
                <button type="button" className="button-secondary" onClick={() => openScenes(currentUsage[0])}>
                  Set up in Scenes
                </button>
                <button type="button" className="button-accent" onClick={addLine}>
                  Add Line
                </button>
              </div>
            </header>

            <section className="dialogue-start-panel">
              <label title="First line shown when this dialogue starts.">
                <span className="field-label--inset">First line</span>
                <DropdownSelect
                  value={currentDialogue.startNodeId}
                  onChange={(event) =>
                    mutateProject((draft) => {
                      const dialogue = findDialogue(draft, currentDialogue.id);
                      if (dialogue) {
                        dialogue.startNodeId = event.target.value;
                      }
                      setSelectedDialogueNodeId(event.target.value);
                    })
                  }
                >
                  {nodeOptions.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </DropdownSelect>
              </label>
              <div className={currentUsage.length > 0 ? "dialogue-connection-badge" : "dialogue-connection-badge dialogue-connection-badge--warning"}>
                {currentUsage.length > 0 ? formatUsageBadge(currentUsage.length) : "Not connected to a hotspot yet"}
              </div>
            </section>

            {currentDialogue.nodes.length > 0 ? (
              <div className="dialogue-line-stack">
                {currentDialogue.nodes.map((node, index) => (
                  <LineCard
                    key={node.id}
                    activeLocale={activeLocale}
                    currentDialogue={currentDialogue}
                    index={index}
                    isFirstLine={node.id === currentDialogue.startNodeId}
                    isSelected={node.id === selectedNodeId}
                    localeStrings={localeStrings}
                    mediaAssets={foregroundMediaAssets}
                    mutateProject={mutateProject}
                    node={node}
                    nodeOptions={nodeOptions}
                    onAddReply={addReply}
                    onDeleteLine={deleteLine}
                    onDeleteReply={deleteReply}
                    onImportMedia={(targetNode) => void handleImportDialogueMedia(currentDialogue.id, targetNode)}
                    onToggle={() => setSelectedDialogueNodeId(node.id === selectedNodeId ? undefined : node.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="dialogue-empty-state dialogue-empty-state--wide">
                <h4>Add the first line</h4>
                <p className="muted">Start with who speaks and what they say. Branches can come later.</p>
                <button type="button" className="button-accent" onClick={addLine}>
                  Add Line
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="dialogue-empty-state dialogue-empty-state--wide">
            <h4>No dialogue selected</h4>
            <p className="muted">Create a dialogue to begin authoring conversations.</p>
            <button type="button" className="button-accent" onClick={createDialogue}>
              New Dialogue
            </button>
          </div>
        )}
      </main>

      <aside className="panel dialogue-launch-panel" aria-label="Dialogue preview and launch locations">
        {currentDialogue ? (
          <>
            <section className="dialogue-preview">
              <div className="dialogue-panel-heading">
                <div>
                  <p className="eyebrow">Preview</p>
                  <h4>{selectedNode ? `Line ${getLineNumber(currentDialogue, selectedNode.id)}` : "No line selected"}</h4>
                </div>
              </div>
              {selectedNode ? (
                <DialoguePreview
                  activeLocale={activeLocale}
                  mediaAsset={foregroundMediaAssets.find((asset) => asset.id === selectedNode.mediaAssetId)}
                  node={selectedNode}
                  nodeOptions={nodeOptions}
                  strings={localeStrings}
                />
              ) : (
                <p className="muted">Select a line to preview it.</p>
              )}
            </section>

            <section className="dialogue-start-callout">
              <div>
                <p className="eyebrow">Launch</p>
                <h4>Start this dialogue from a hotspot in Scenes</h4>
                <p>Choose this dialogue in the selected hotspot's Start Dialogue field.</p>
              </div>
              <button type="button" className="button-accent" onClick={() => openScenes(currentUsage[0])}>
                Go to Scenes
              </button>
            </section>

            <section className="dialogue-usage-list">
              <div className="dialogue-panel-heading">
                <div>
                  <p className="eyebrow">Started From</p>
                  <h4>{currentUsage.length > 0 ? formatUsageBadge(currentUsage.length) : "No hotspots yet"}</h4>
                </div>
              </div>
              {currentUsage.length > 0 ? (
                <div className="dialogue-usage-list__items">
                  {currentUsage.map((usage) => (
                    <button
                      key={`${usage.sceneId}:${usage.hotspotId}`}
                      type="button"
                      className="dialogue-usage-item"
                      onClick={() => openScenes(usage)}
                    >
                      <span className="dialogue-usage-item__scene">{usage.sceneName}</span>
                      <span className="dialogue-usage-item__hotspot">{usage.hotspotLabel}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">No hotspot starts this dialogue yet.</p>
              )}
            </section>
          </>
        ) : (
          <p className="muted">Create a dialogue to see preview and launch details.</p>
        )}
      </aside>
    </div>
  );
}

function LineCard({
  activeLocale,
  currentDialogue,
  index,
  isFirstLine,
  isSelected,
  localeStrings,
  mediaAssets,
  mutateProject,
  node,
  nodeOptions,
  onAddReply,
  onDeleteLine,
  onDeleteReply,
  onImportMedia,
  onToggle
}: {
  activeLocale: string;
  currentDialogue: DialogueTree;
  index: number;
  isFirstLine: boolean;
  isSelected: boolean;
  localeStrings: Record<string, string>;
  mediaAssets: Asset[];
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  node: DialogueNode;
  nodeOptions: DialogueNodeOption[];
  onAddReply: (nodeId: string) => void;
  onDeleteLine: (nodeId: string) => void;
  onDeleteReply: (nodeId: string, choiceId: string) => void;
  onImportMedia: (node: DialogueNode) => void;
  onToggle: () => void;
}) {
  const lineText = localeStrings[node.textId] ?? "";
  const hasReplies = node.choices.length > 0;
  const branchOptions = nodeOptions.filter((option) => option.id !== node.id);

  return (
    <article className={isSelected ? "dialogue-line-card dialogue-line-card--selected" : "dialogue-line-card"}>
      <header className="dialogue-line-card__header">
        <button
          type="button"
          className="dialogue-line-card__select"
          aria-expanded={isSelected}
          title={isSelected ? "Collapse this line." : "Edit this line."}
          onClick={onToggle}
        >
          <span className="dialogue-line-card__number">{index + 1}</span>
          <span>
            <span className="dialogue-line-card__title">{formatDialogueNodeLabel(node, localeStrings)}</span>
            <span className="dialogue-line-card__meta">
              {isFirstLine ? "First line" : "Line"} · {formatChoiceCount(node.choices.length)}
              {node.mediaAssetId ? " · Media" : ""}
            </span>
          </span>
        </button>
        <div className="dialogue-line-card__tools">
          <button
            type="button"
            className="button-danger"
            disabled={currentDialogue.nodes.length <= 1}
            onClick={() => onDeleteLine(node.id)}
          >
            Delete
          </button>
        </div>
      </header>

      {isSelected ? (
        <div className="dialogue-line-editor">
          <div className="dialogue-line-editor__fields">
            <label>
              <span className="field-label--inset">Who speaks</span>
              <input
                value={node.speaker}
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
            <label title="Next line when there are no player replies.">
              <span className="field-label--inset">After this line</span>
              <DropdownSelect
                value={node.nextNodeId ?? ""}
                disabled={hasReplies}
                onChange={(event) =>
                  mutateProject((draft) => {
                    const target = findNode(draft, currentDialogue.id, node.id);
                    if (target) {
                      target.nextNodeId = event.target.value || undefined;
                    }
                  })
                }
              >
                <option value="">End dialogue</option>
                {branchOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </DropdownSelect>
              {hasReplies ? <span className="dialogue-field-note">Player replies decide what happens next.</span> : null}
            </label>
          </div>

          <label>
            <span className="field-label--inset">What they say</span>
            <textarea
              value={lineText}
              onChange={(event) =>
                mutateProject((draft) => {
                  setEditorLocalizedText(draft, activeLocale, node.textId, event.target.value);
                })
              }
            />
          </label>

          <section className="dialogue-line-media" aria-label="Dialogue line media">
            <div className="dialogue-line-media__controls">
              <label title="Audio or video that plays once when this line opens, independently of scene background media.">
                <span className="field-label--inset">Line media</span>
                <DropdownSelect
                  value={node.mediaAssetId ?? ""}
                  onChange={(event) =>
                    mutateProject((draft) => {
                      const target = findNode(draft, currentDialogue.id, node.id);
                      if (target) {
                        target.mediaAssetId = event.target.value || undefined;
                      }
                    })
                  }
                >
                  <option value="">No line media</option>
                  {node.mediaAssetId && !mediaAssets.some((asset) => asset.id === node.mediaAssetId) ? (
                    <option value={node.mediaAssetId}>Missing foreground media</option>
                  ) : null}
                  {mediaAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name} ({asset.kind})
                    </option>
                  ))}
                </DropdownSelect>
              </label>
              <button type="button" className="button-secondary" onClick={() => onImportMedia(node)}>
                Import Audio / Video
              </button>
            </div>
            <p className="dialogue-field-note">Plays once when this line opens; it does not replace or loop with the scene background.</p>
          </section>

          <section className="dialogue-replies">
            <div className="dialogue-replies__header">
              <h5>Player replies</h5>
              <button type="button" className="button-secondary" onClick={() => onAddReply(node.id)}>
                Add Reply
              </button>
            </div>
            {node.choices.length > 0 ? (
              <div className="dialogue-replies__list">
                {node.choices.map((choice, choiceIndex) => (
                  <ChoiceEditor
                    key={choice.id}
                    choice={choice}
                    choiceIndex={choiceIndex}
                    nodeOptions={branchOptions}
                    strings={localeStrings}
                    onDelete={() => onDeleteReply(node.id, choice.id)}
                    onTextChange={(value) =>
                      mutateProject((draft) => {
                        setEditorLocalizedText(draft, activeLocale, choice.textId, value);
                      })
                    }
                    onUpdate={(nextChoice) =>
                      mutateProject((draft) => {
                        const target = findNode(draft, currentDialogue.id, node.id);
                        if (!target) {
                          return;
                        }
                        target.choices = target.choices.map((entry) => (entry.id === nextChoice.id ? nextChoice : entry));
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="muted">No player replies. The line follows After this line.</p>
            )}
          </section>

          <details className="dialogue-advanced">
            <summary>Advanced line effects</summary>
            <JsonField
              label="When this line starts"
              value={JSON.stringify(node.effects, null, 2)}
              tooltip="JSON effect list that runs when this line opens."
              labelClassName="field-label--inset"
              onCommit={(nextValue) =>
                mutateProject((draft) => {
                  const target = findNode(draft, currentDialogue.id, node.id);
                  if (target) {
                    target.effects = parseJson(nextValue, target.effects);
                  }
                })
              }
            />
          </details>
        </div>
      ) : (
        <p className="dialogue-line-card__summary">{lineText || "Untitled line"}</p>
      )}
    </article>
  );
}

function ChoiceEditor({
  choice,
  choiceIndex,
  nodeOptions,
  strings,
  onDelete,
  onTextChange,
  onUpdate
}: {
  choice: DialogueChoice;
  choiceIndex: number;
  nodeOptions: DialogueNodeOption[];
  strings: Record<string, string>;
  onDelete: () => void;
  onTextChange: (value: string) => void;
  onUpdate: (nextChoice: DialogueChoice) => void;
}) {
  return (
    <div className="choice-editor dialogue-reply-card">
      <div className="dialogue-reply-card__marker">{String.fromCharCode(65 + choiceIndex)}</div>
      <div className="dialogue-reply-card__fields">
        <label title="Text shown to the player for this reply.">
          <span className="field-label--inset">Player reply</span>
          <input value={strings[choice.textId] ?? ""} onChange={(event) => onTextChange(event.target.value)} />
        </label>
        <label title="Line that opens when the player selects this reply.">
          <span className="field-label--inset">After reply</span>
          <DropdownSelect
            value={choice.nextNodeId ?? ""}
            onChange={(event) => onUpdate({ ...choice, nextNodeId: event.target.value || undefined })}
          >
            <option value="">End dialogue</option>
            {nodeOptions.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label}
              </option>
            ))}
          </DropdownSelect>
        </label>
        <details className="dialogue-advanced dialogue-advanced--choice">
          <summary>Advanced reply rules</summary>
          <JsonField
            label="Show reply when"
            value={JSON.stringify(choice.conditions, null, 2)}
            tooltip="JSON condition list that must pass before this reply appears."
            labelClassName="field-label--inset"
            onCommit={(nextValue) => onUpdate({ ...choice, conditions: parseJson(nextValue, choice.conditions) })}
          />
          <JsonField
            label="After reply effects"
            value={JSON.stringify(choice.effects, null, 2)}
            tooltip="JSON effect list that runs after the player selects this reply."
            labelClassName="field-label--inset"
            onCommit={(nextValue) => onUpdate({ ...choice, effects: parseJson(nextValue, choice.effects) })}
          />
        </details>
      </div>
      <button type="button" className="button-danger dialogue-reply-card__delete" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

function DialoguePreview({
  activeLocale,
  mediaAsset,
  node,
  nodeOptions,
  strings
}: {
  activeLocale: string;
  mediaAsset?: Asset;
  node: DialogueNode;
  nodeOptions: DialogueNodeOption[];
  strings: Record<string, string>;
}) {
  const lineText = strings[node.textId] ?? "Untitled line";
  const nextLineLabel = nodeOptions.find((option) => option.id === node.nextNodeId)?.label;

  return (
    <div className="dialogue-preview-card">
      {mediaAsset ? (
        <div className="dialogue-preview-card__media">
          <AssetPreview
            asset={mediaAsset}
            locale={activeLocale}
            allowSourceFallback
            fit="contain"
            emptyTitle="Line media unavailable"
            emptyBody="Add the active locale variant in Localization."
          />
        </div>
      ) : null}
      <div className="dialogue-preview-card__bubble">
        <strong>{node.speaker || "Speaker"}</strong>
        <p>{lineText}</p>
      </div>
      {node.choices.length > 0 ? (
        <div className="dialogue-preview-card__choices">
          {node.choices.map((choice, index) => (
            <div key={choice.id} className="dialogue-preview-choice">
              <span>{String.fromCharCode(65 + index)}</span>
              <p>{strings[choice.textId] ?? "Player reply"}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{nextLineLabel ? `Continues to ${nextLineLabel}` : "Ends after this line"}</p>
      )}
    </div>
  );
}

function JsonField({
  label,
  value,
  tooltip,
  labelClassName,
  onCommit
}: {
  label: string;
  value: string;
  tooltip?: string;
  labelClassName?: string;
  onCommit: (nextValue: string) => void;
}) {
  return (
    <label title={tooltip}>
      {labelClassName ? <span className={labelClassName}>{label}</span> : label}
      <textarea defaultValue={value} onBlur={(event) => onCommit(event.target.value)} title={tooltip} />
    </label>
  );
}

function collectDialogueUsage(project: ProjectBundle): Map<string, DialogueUsage[]> {
  const usageByDialogue = new Map<string, DialogueUsage[]>();
  for (const scene of project.scenes.items) {
    scene.hotspots.forEach((hotspot, index) => {
      if (hotspot.dialogueTreeId) {
        const usages = usageByDialogue.get(hotspot.dialogueTreeId) ?? [];
        usages.push({
          dialogueId: hotspot.dialogueTreeId,
          sceneId: scene.id,
          sceneName: scene.name,
          hotspotId: hotspot.id,
          hotspotLabel: `Hotspot ${index + 1} (${formatCompactId(hotspot.id)})`
        });
        usageByDialogue.set(hotspot.dialogueTreeId, usages);
      }

      for (const [event, label] of [
        [hotspot.clickEvent, "On click"],
        [hotspot.otherItemEvent, "Any other item"]
      ] as const) {
        if (event?.dialogueTreeId) {
          const usages = usageByDialogue.get(event.dialogueTreeId) ?? [];
          usages.push({
            dialogueId: event.dialogueTreeId,
            sceneId: scene.id,
            sceneName: scene.name,
            hotspotId: hotspot.id,
            hotspotLabel: `Hotspot ${index + 1} ${label} (${formatCompactId(hotspot.id)})`
          });
          usageByDialogue.set(event.dialogueTreeId, usages);
        }
      }
    });
  }
  return usageByDialogue;
}

function findDialogue(project: ProjectBundle, dialogueId: string): DialogueTree | undefined {
  return project.dialogues.items.find((entry) => entry.id === dialogueId);
}

function findNode(project: ProjectBundle, dialogueId: string, nodeId: string): DialogueNode | undefined {
  return findDialogue(project, dialogueId)?.nodes.find((node) => node.id === nodeId);
}

function getLineNumber(dialogue: DialogueTree, nodeId: string): number {
  return Math.max(1, dialogue.nodes.findIndex((node) => node.id === nodeId) + 1);
}

function formatDialogueNodeOption(node: DialogueNode, index: number, strings: Record<string, string>): string {
  return `${index + 1}. ${formatDialogueNodeLabel(node, strings)}`;
}

function formatDialogueNodeLabel(node: DialogueNode, strings: Record<string, string>): string {
  const speaker = node.speaker.trim() || "Speaker";
  const line = strings[node.textId]?.trim() || "Untitled line";
  return `${speaker}: ${truncateText(line, LINE_LABEL_PREVIEW_LENGTH)}`;
}

function formatChoiceCount(choiceCount: number): string {
  return choiceCount === 1 ? "1 reply" : `${choiceCount} replies`;
}

function formatLineCount(lineCount: number): string {
  return lineCount === 1 ? "1 line" : `${lineCount} lines`;
}

function formatUsageBadge(usageCount: number): string {
  if (usageCount === 0) {
    return "Not started anywhere";
  }
  return usageCount === 1 ? "Starts from 1 hotspot" : `Starts from ${usageCount} hotspots`;
}

function formatCompactId(id: string): string {
  return id.length <= 10 ? id : id.slice(-8);
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

function parseJson<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

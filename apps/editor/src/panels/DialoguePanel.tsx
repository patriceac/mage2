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
import { translateRuntimeMessage, useEditorI18n, type EditorTranslator } from "../i18n";
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
import { ConditionListEditor, EffectListEditor } from "../logic/RuleBuilder";

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
  const { direction, t } = useEditorI18n();
  const dialogueSection = useEditorStore((state) => state.dialogueSection) ?? "dialogues";
  const setDialogueSection = useEditorStore((state) => state.setDialogueSection);

  return (
    <div className="dialogue-screen" dir={direction}>
      <nav className="dialogue-section-tabs" aria-label={t("Dialogue authoring sections")}>
        <button
          type="button"
          className={dialogueSection === "dialogues" ? "dialogue-section-tab dialogue-section-tab--active" : "dialogue-section-tab"}
          aria-pressed={dialogueSection === "dialogues"}
          onClick={() => setDialogueSection("dialogues")}
        >
          {t("Dialogues")}
        </button>
        <button
          type="button"
          className={dialogueSection === "responses" ? "dialogue-section-tab dialogue-section-tab--active" : "dialogue-section-tab"}
          aria-pressed={dialogueSection === "responses"}
          onClick={() => setDialogueSection("responses")}
        >
          {t("Responses")}
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
  const { t } = useEditorI18n();
  const selectedDialogueId = useEditorStore((state) => state.selectedDialogueId);
  const selectedDialogueNodeId = useEditorStore((state) => state.selectedDialogueNodeId);
  const setSelectedDialogueId = useEditorStore((state) => state.setSelectedDialogueId);
  const setSelectedDialogueNodeId = useEditorStore((state) => state.setSelectedDialogueNodeId);
  const [dialogueFilter, setDialogueFilter] = useState("");
  const activeLocale = project.manifest.defaultLanguage;
  const localeStrings = getLocaleStringValues(project, activeLocale);
  const foregroundMediaAssets = project.assets.assets.filter(isForegroundMediaAsset);
  const usageByDialogue = useMemo(() => collectDialogueUsage(project, t), [project, t]);
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
      label: formatDialogueNodeOption(t, node, index, localeStrings)
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
      ensureString(draft, textId, t("New line"));
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
      ensureString(draft, textId, t("Player reply"));
      target.choices.push({
        id: choiceId,
        textId,
        conditionMode: "all",
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
        throw new Error(t("No project directory is currently open."));
      }

      setBusyLabel(t("Importing dialogue media"));
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
            ? t("That file already exists as foreground media. Choose it from the line media picker.")
            : t("No new dialogue media asset was created.")
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
        importedAssets[0]
          ? t("Imported {name} as foreground media for this dialogue line. Save the project to keep this change.", { name: assignedAsset.name })
          : t("Assigned existing {name} as foreground media for this dialogue line. Save the project to keep this change.", { name: assignedAsset.name })
      );
    } catch (error) {
      const message = translateRuntimeMessage(error, t);
      setStatusMessage(t("Dialogue media import failed: {message}", { message }));
    } finally {
      setBusyLabel(undefined);
    }
  };

  const handleImportDialogueMedia = async (dialogueId: string, node: DialogueNode) => {
    const filePaths = await dialogs.pickFiles({
      title: t("Import Media for {name}", { name: node.speaker || t("Dialogue Line") }),
      description: t("Choose an audio or video file to play once when this dialogue line opens."),
      initialPath: useEditorStore.getState().projectDir,
      confirmLabel: t("Use as Line Media"),
      allowedExtensions: [...FOREGROUND_MEDIA_IMPORT_EXTENSIONS]
    });
    const filePath = filePaths[0];
    if (filePath) {
      await importDialogueMediaFromFilePath(dialogueId, node.id, filePath);
    }
  };

  return (
    <div className="panel-grid panel-grid--dialogue dialogue-workspace">
      <aside className="panel dialogue-library" aria-label={t("Dialogue library")}>
        <div className="dialogue-library__header">
          <div>
            <p className="eyebrow">{t("Dialogue Authoring")}</p>
            <h3>{t("Dialogues")}</h3>
          </div>
          <button type="button" className="button-accent" onClick={createDialogue}>
            {t("New Dialogue")}
          </button>
        </div>
        <label className="dialogue-search">
          <span className="field-label--inset">{t("Find dialogue")}</span>
          <input
            value={dialogueFilter}
            placeholder={t("Search by name")}
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
                    {formatLineCount(t, dialogue.nodes.length)} · {formatUsageBadge(t, usage.length)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="dialogue-empty-state">
            <h4>{t("Create your first dialogue")}</h4>
            <p className="muted">{t("Write the conversation here, then start it from a hotspot in Scenes.")}</p>
            <button type="button" className="button-accent" onClick={createDialogue}>
              {t("New Dialogue")}
            </button>
          </div>
        )}
        {project.dialogues.items.length > 0 && filteredDialogues.length === 0 ? (
          <p className="muted">{t("No dialogues match this search.")}</p>
        ) : null}
      </aside>

      <main className="panel dialogue-builder" aria-label={t("Conversation builder")}>
        {currentDialogue ? (
          <>
            <header className="dialogue-builder__header">
              <div>
                <p className="eyebrow">{t("Write dialogue here. Start it from a hotspot in Scenes.")}</p>
                <label className="dialogue-title-field">
                  <span className="field-label--inset">{t("Dialogue name")}</span>
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
                  {t("Set up in Scenes")}
                </button>
                <button type="button" className="button-accent" onClick={addLine}>
                  {t("Add Line")}
                </button>
              </div>
            </header>

            <section className="dialogue-start-panel">
              <label title={t("First line shown when this dialogue starts.")}>
                <span className="field-label--inset">{t("First line")}</span>
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
                {currentUsage.length > 0 ? formatUsageBadge(t, currentUsage.length) : t("Not connected to a hotspot yet")}
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
                    project={project}
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
                <h4>{t("Add the first line")}</h4>
                <p className="muted">{t("Start with who speaks and what they say. Branches can come later.")}</p>
                <button type="button" className="button-accent" onClick={addLine}>
                  {t("Add Line")}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="dialogue-empty-state dialogue-empty-state--wide">
            <h4>{t("No dialogue selected")}</h4>
            <p className="muted">{t("Create a dialogue to begin authoring conversations.")}</p>
            <button type="button" className="button-accent" onClick={createDialogue}>
              {t("New Dialogue")}
            </button>
          </div>
        )}
      </main>

      <aside className="panel dialogue-launch-panel" aria-label={t("Dialogue preview and launch locations")}>
        {currentDialogue ? (
          <>
            <section className="dialogue-preview">
              <div className="dialogue-panel-heading">
                <div>
                  <p className="eyebrow">{t("Preview")}</p>
                  <h4>{selectedNode ? t("Line {number}", { number: getLineNumber(currentDialogue, selectedNode.id) }) : t("No line selected")}</h4>
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
                <p className="muted">{t("Select a line to preview it.")}</p>
              )}
            </section>

            <section className="dialogue-start-callout">
              <div>
                <p className="eyebrow">{t("Launch")}</p>
                <h4>{t("Start this dialogue from a hotspot in Scenes")}</h4>
                <p>{t("Choose this dialogue in the selected hotspot's Start Dialogue field.")}</p>
              </div>
              <button type="button" className="button-accent" onClick={() => openScenes(currentUsage[0])}>
                {t("Go to Scenes")}
              </button>
            </section>

            <section className="dialogue-usage-list">
              <div className="dialogue-panel-heading">
                <div>
                  <p className="eyebrow">{t("Started From")}</p>
                  <h4>{currentUsage.length > 0 ? formatUsageBadge(t, currentUsage.length) : t("No hotspots yet")}</h4>
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
                <p className="muted">{t("No hotspot starts this dialogue yet.")}</p>
              )}
            </section>
          </>
        ) : (
          <p className="muted">{t("Create a dialogue to see preview and launch details.")}</p>
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
  project,
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
  project: ProjectBundle;
  node: DialogueNode;
  nodeOptions: DialogueNodeOption[];
  onAddReply: (nodeId: string) => void;
  onDeleteLine: (nodeId: string) => void;
  onDeleteReply: (nodeId: string, choiceId: string) => void;
  onImportMedia: (node: DialogueNode) => void;
  onToggle: () => void;
}) {
  const { t } = useEditorI18n();
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
          title={isSelected ? t("Collapse this line.") : t("Edit this line.")}
          onClick={onToggle}
        >
          <span className="dialogue-line-card__number">{index + 1}</span>
          <span>
            <span className="dialogue-line-card__title">{formatDialogueNodeLabel(t, node, localeStrings)}</span>
            <span className="dialogue-line-card__meta">
              {isFirstLine ? t("First line") : t("Line")} · {formatChoiceCount(t, node.choices.length)}
              {node.mediaAssetId ? ` · ${t("Media")}` : ""}
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
            {t("Delete")}
          </button>
        </div>
      </header>

      {isSelected ? (
        <div className="dialogue-line-editor">
          <div className="dialogue-line-editor__fields">
            <label>
              <span className="field-label--inset">{t("Who speaks")}</span>
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
            <label title={t("Next line when there are no player replies.")}>
              <span className="field-label--inset">{t("After this line")}</span>
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
                <option value="">{t("End dialogue")}</option>
                {branchOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </DropdownSelect>
              {hasReplies ? <span className="dialogue-field-note">{t("Player replies decide what happens next.")}</span> : null}
            </label>
          </div>

          <label>
            <span className="field-label--inset">{t("What they say")}</span>
            <textarea
              value={lineText}
              onChange={(event) =>
                mutateProject((draft) => {
                  setEditorLocalizedText(draft, activeLocale, node.textId, event.target.value);
                })
              }
            />
          </label>

          <section className="dialogue-line-media" aria-label={t("Dialogue line media")}>
            <div className="dialogue-line-media__controls">
              <label title={t("Audio or video that plays once when this line opens, independently of scene background media.")}>
                <span className="field-label--inset">{t("Line media")}</span>
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
                  <option value="">{t("No line media")}</option>
                  {node.mediaAssetId && !mediaAssets.some((asset) => asset.id === node.mediaAssetId) ? (
                    <option value={node.mediaAssetId}>{t("Missing foreground media")}</option>
                  ) : null}
                  {mediaAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name} ({formatMediaKind(t, asset.kind)})
                    </option>
                  ))}
                </DropdownSelect>
              </label>
              <button type="button" className="button-secondary" onClick={() => onImportMedia(node)}>
                {t("Import Audio / Video")}
              </button>
            </div>
            <p className="dialogue-field-note">{t("Plays once when this line opens; it does not replace or loop with the scene background.")}</p>
          </section>

          <section className="dialogue-replies">
            <div className="dialogue-replies__header">
              <h5>{t("Player replies")}</h5>
              <button type="button" className="button-secondary" onClick={() => onAddReply(node.id)}>
                {t("Add Reply")}
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
                    project={project}
                    strings={localeStrings}
                    onDelete={() => onDeleteReply(node.id, choice.id)}
                    onTextChange={(value) =>
                      mutateProject((draft) => {
                        setEditorLocalizedText(draft, activeLocale, choice.textId, value);
                      })
                    }
                    onUpdate={(nextChoice, variables) =>
                      mutateProject((draft) => {
                        const target = findNode(draft, currentDialogue.id, node.id);
                        if (!target) {
                          return;
                        }
                        target.choices = target.choices.map((entry) => (entry.id === nextChoice.id ? nextChoice : entry));
                        if (variables) draft.manifest.variables = variables;
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="muted">{t("No player replies. The line follows After this line.")}</p>
            )}
          </section>

          <details className="dialogue-advanced" open={node.effects.length > 0 || undefined}>
            <summary>{t("When this line starts")}</summary>
            <EffectListEditor
              compact
              project={project}
              label={t("Line actions")}
              description={t("Run these actions in order when this line opens.")}
              effects={node.effects}
              onChange={(effects, variables) =>
                mutateProject((draft) => {
                  const target = findNode(draft, currentDialogue.id, node.id);
                  if (target) target.effects = effects;
                  if (variables) draft.manifest.variables = variables;
                })
              }
            />
          </details>
        </div>
      ) : (
        <p className="dialogue-line-card__summary">{lineText || t("Untitled line")}</p>
      )}
    </article>
  );
}

function ChoiceEditor({
  choice,
  choiceIndex,
  nodeOptions,
  project,
  strings,
  onDelete,
  onTextChange,
  onUpdate
}: {
  choice: DialogueChoice;
  choiceIndex: number;
  nodeOptions: DialogueNodeOption[];
  project: ProjectBundle;
  strings: Record<string, string>;
  onDelete: () => void;
  onTextChange: (value: string) => void;
  onUpdate: (nextChoice: DialogueChoice, variables?: ProjectBundle["manifest"]["variables"]) => void;
}) {
  const { t } = useEditorI18n();
  return (
    <div className="choice-editor dialogue-reply-card">
      <div className="dialogue-reply-card__marker">{String.fromCharCode(65 + choiceIndex)}</div>
      <div className="dialogue-reply-card__fields">
        <label title={t("Text shown to the player for this reply.")}>
          <span className="field-label--inset">{t("Player reply")}</span>
          <input value={strings[choice.textId] ?? ""} onChange={(event) => onTextChange(event.target.value)} />
        </label>
        <label title={t("Line that opens when the player selects this reply.")}>
          <span className="field-label--inset">{t("After reply")}</span>
          <DropdownSelect
            value={choice.nextNodeId ?? ""}
            onChange={(event) => onUpdate({ ...choice, nextNodeId: event.target.value || undefined })}
          >
            <option value="">{t("End dialogue")}</option>
            {nodeOptions.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label}
              </option>
            ))}
          </DropdownSelect>
        </label>
        <details className="dialogue-advanced dialogue-advanced--choice" open={choice.conditions.length > 0 || choice.effects.length > 0 || undefined}>
          <summary>{t("Reply availability and actions")}</summary>
          <ConditionListEditor
            compact
            project={project}
            label={t("Show reply when")}
            description={t("Choose when the player can see this reply.")}
            conditions={choice.conditions}
            mode={choice.conditionMode ?? "all"}
            onChange={(conditions, conditionMode, variables) =>
              onUpdate({ ...choice, conditions, conditionMode }, variables)
            }
          />
          <EffectListEditor
            compact
            project={project}
            label={t("After the reply")}
            description={t("Run these actions in order after the player chooses this reply.")}
            effects={choice.effects}
            onChange={(effects, variables) => onUpdate({ ...choice, effects }, variables)}
          />
        </details>
      </div>
      <button type="button" className="button-danger dialogue-reply-card__delete" onClick={onDelete}>
        {t("Delete")}
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
  const { t } = useEditorI18n();
  const lineText = strings[node.textId] ?? t("Untitled line");
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
            emptyTitle={t("Line media unavailable")}
            emptyBody={t("Add the active locale variant in Localization.")}
          />
        </div>
      ) : null}
      <div className="dialogue-preview-card__bubble">
        <strong>{node.speaker || t("Speaker")}</strong>
        <p>{lineText}</p>
      </div>
      {node.choices.length > 0 ? (
        <div className="dialogue-preview-card__choices">
          {node.choices.map((choice, index) => (
            <div key={choice.id} className="dialogue-preview-choice">
              <span>{String.fromCharCode(65 + index)}</span>
              <p>{strings[choice.textId] ?? t("Player reply")}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{nextLineLabel ? t("Continues to {line}", { line: nextLineLabel }) : t("Ends after this line")}</p>
      )}
    </div>
  );
}

function collectDialogueUsage(project: ProjectBundle, t: EditorTranslator): Map<string, DialogueUsage[]> {
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
          hotspotLabel: t("Hotspot {number} ({id})", { number: index + 1, id: formatCompactId(hotspot.id) })
        });
        usageByDialogue.set(hotspot.dialogueTreeId, usages);
      }

      for (const [event, label] of [
        [hotspot.clickEvent, t("On click")],
        [hotspot.otherItemEvent, t("Any other item")]
      ] as const) {
        if (event?.dialogueTreeId) {
          const usages = usageByDialogue.get(event.dialogueTreeId) ?? [];
          usages.push({
            dialogueId: event.dialogueTreeId,
            sceneId: scene.id,
            sceneName: scene.name,
            hotspotId: hotspot.id,
            hotspotLabel: t("Hotspot {number} {label} ({id})", {
              number: index + 1,
              label,
              id: formatCompactId(hotspot.id)
            })
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

function formatDialogueNodeOption(t: EditorTranslator, node: DialogueNode, index: number, strings: Record<string, string>): string {
  return `${index + 1}. ${formatDialogueNodeLabel(t, node, strings)}`;
}

function formatDialogueNodeLabel(t: EditorTranslator, node: DialogueNode, strings: Record<string, string>): string {
  const speaker = node.speaker.trim() || t("Speaker");
  const line = strings[node.textId]?.trim() || t("Untitled line");
  return `${speaker}: ${truncateText(line, LINE_LABEL_PREVIEW_LENGTH)}`;
}

function formatChoiceCount(t: EditorTranslator, choiceCount: number): string {
  return choiceCount === 1 ? t("1 reply") : t("{count} replies", { count: choiceCount });
}

function formatLineCount(t: EditorTranslator, lineCount: number): string {
  return lineCount === 1 ? t("1 line") : t("{count} lines", { count: lineCount });
}

function formatUsageBadge(t: EditorTranslator, usageCount: number): string {
  if (usageCount === 0) {
    return t("Not started anywhere");
  }
  return usageCount === 1 ? t("Starts from 1 hotspot") : t("Starts from {count} hotspots", { count: usageCount });
}

function formatMediaKind(t: EditorTranslator, kind: Asset["kind"]): string {
  if (kind === "audio") return t("audio");
  if (kind === "video") return t("video");
  return kind;
}

function formatCompactId(id: string): string {
  return id.length <= 10 ? id : id.slice(-8);
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

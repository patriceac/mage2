import { useMemo, useState } from "react";
import {
  getLocaleStringValues,
  hasHotspotEvent,
  type Asset,
  type HotspotEvent,
  type ProjectBundle,
  type ResponseEntry,
  type ResponseGroup
} from "@mage2/schema";
import { DropdownSelect } from "../DropdownSelect";
import { AUDIO_IMPORT_EXTENSIONS, VIDEO_IMPORT_EXTENSIONS } from "../asset-file-types";
import { useDialogs } from "../dialogs";
import { setEditorLocalizedText } from "../localized-project";
import { addAssetRoots, createId } from "../project-helpers";
import { AssetPreview } from "../previews";
import { useEditorStore } from "../store";

interface ResponseGroupsPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  setStatusMessage: (message: string) => void;
  setBusyLabel: (label?: string) => void;
  onOpenScenesHotspot?: (sceneId?: string, hotspotId?: string) => void;
}

interface ResponseUsage {
  sceneId: string;
  sceneName: string;
  hotspotId: string;
  hotspotName: string;
  branchLabel: string;
}

export function ResponseGroupsPanel({
  project,
  mutateProject,
  setStatusMessage,
  setBusyLabel,
  onOpenScenesHotspot
}: ResponseGroupsPanelProps) {
  const dialogs = useDialogs();
  const selectedGroupId = useEditorStore((state) => state.selectedResponseGroupId);
  const selectedEntryId = useEditorStore((state) => state.selectedResponseEntryId);
  const setSelectedGroupId = useEditorStore((state) => state.setSelectedResponseGroupId);
  const setSelectedEntryId = useEditorStore((state) => state.setSelectedResponseEntryId);
  const [groupFilter, setGroupFilter] = useState("");
  const groups = project.dialogues.responseGroups;
  const currentGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0];
  const currentEntry =
    currentGroup?.entries.find((entry) => entry.id === selectedEntryId) ?? currentGroup?.entries[0];
  const locale = project.manifest.defaultLanguage;
  const strings = getLocaleStringValues(project, locale);
  const filteredGroups = groups.filter((group) =>
    group.name.toLocaleLowerCase().includes(groupFilter.trim().toLocaleLowerCase())
  );
  const usages = useMemo(
    () => (currentGroup ? collectResponseUsage(project, currentGroup, currentEntry) : []),
    [currentEntry, currentGroup, project]
  );

  function selectGroup(group: ResponseGroup) {
    setSelectedGroupId(group.id);
    setSelectedEntryId(group.entries[0]?.id);
  }

  function createGroup() {
    const group: ResponseGroup = {
      id: createId("response_group"),
      name: "New response group",
      entries: []
    };
    mutateProject((draft) => {
      draft.dialogues.responseGroups.push(group);
    });
    setSelectedGroupId(group.id);
    setSelectedEntryId(undefined);
    setStatusMessage("Created a response group. Add text, audio, or video responses to it.");
  }

  async function deleteGroup() {
    if (!currentGroup) {
      return;
    }
    const groupUsageCount =
      collectResponseUsage(project, currentGroup).length +
      currentGroup.entries.reduce(
        (count, entry) => count + collectResponseUsage(project, undefined, entry).length,
        0
      );
    const confirmed = await dialogs.confirm({
      title: `Delete “${currentGroup.name}”?`,
      body: (
        <>
          <p>{`This removes ${formatEntryCount(currentGroup.entries.length)} from the response library.`}</p>
          <p>
            {groupUsageCount > 0
              ? `${groupUsageCount} hotspot assignment${groupUsageCount === 1 ? "" : "s"} will be changed to no player feedback.`
              : "No hotspots currently use this group."}
          </p>
        </>
      ),
      confirmLabel: "Delete Group",
      tone: "danger"
    });
    if (!confirmed) {
      return;
    }

    const nextGroup = groups.find((group) => group.id !== currentGroup.id);
    mutateProject((draft) => {
      const removedGroup = draft.dialogues.responseGroups.find((group) => group.id === currentGroup.id);
      if (!removedGroup) {
        return;
      }
      clearResponseAssignments(draft, { groupId: removedGroup.id });
      for (const entry of removedGroup.entries) {
        clearResponseAssignments(draft, { entryId: entry.id });
        if (entry.kind === "text") {
          deleteTextFromEveryLocale(draft, entry.textId);
        }
      }
      draft.dialogues.responseGroups = draft.dialogues.responseGroups.filter((group) => group.id !== removedGroup.id);
    });
    setSelectedGroupId(nextGroup?.id);
    setSelectedEntryId(nextGroup?.entries[0]?.id);
    setStatusMessage(`Deleted ${currentGroup.name}.`);
  }

  function addEntry(kind: ResponseEntry["kind"]) {
    if (!currentGroup) {
      return;
    }
    const entryId = createId("response");
    const entry: ResponseEntry =
      kind === "text"
        ? { id: entryId, kind, textId: `text.response.${entryId}` }
        : { id: entryId, kind };
    mutateProject((draft) => {
      const group = draft.dialogues.responseGroups.find((candidate) => candidate.id === currentGroup.id);
      if (!group) {
        return;
      }
      group.entries.push(entry);
      if (entry.kind === "text") {
        setEditorLocalizedText(draft, locale, entry.textId, "New response");
      }
    });
    setSelectedEntryId(entry.id);
    setStatusMessage(`Added a ${kind} response to ${currentGroup.name}.`);
  }

  async function deleteEntry() {
    if (!currentGroup || !currentEntry) {
      return;
    }
    const directUsageCount = collectResponseUsage(project, undefined, currentEntry).length;
    const confirmed = await dialogs.confirm({
      title: "Delete this response?",
      body: (
        <p>
          {directUsageCount > 0
            ? `${directUsageCount} direct hotspot assignment${directUsageCount === 1 ? "" : "s"} will be changed to no player feedback.`
            : "The response will be removed from this group."}
        </p>
      ),
      confirmLabel: "Delete Response",
      tone: "danger"
    });
    if (!confirmed) {
      return;
    }
    const nextEntry = currentGroup.entries.find((entry) => entry.id !== currentEntry.id);
    mutateProject((draft) => {
      const group = draft.dialogues.responseGroups.find((candidate) => candidate.id === currentGroup.id);
      const entry = group?.entries.find((candidate) => candidate.id === currentEntry.id);
      if (!group || !entry) {
        return;
      }
      clearResponseAssignments(draft, { entryId: entry.id });
      if (entry.kind === "text") {
        deleteTextFromEveryLocale(draft, entry.textId);
      }
      group.entries = group.entries.filter((candidate) => candidate.id !== entry.id);
    });
    setSelectedEntryId(nextEntry?.id);
    setStatusMessage(`Deleted a response from ${currentGroup.name}.`);
  }

  function changeEntryKind(kind: ResponseEntry["kind"]) {
    if (!currentGroup || !currentEntry || currentEntry.kind === kind) {
      return;
    }
    mutateProject((draft) => {
      const group = draft.dialogues.responseGroups.find((candidate) => candidate.id === currentGroup.id);
      const index = group?.entries.findIndex((candidate) => candidate.id === currentEntry.id) ?? -1;
      if (!group || index < 0) {
        return;
      }
      const previous = group.entries[index]!;
      if (previous.kind === "text") {
        deleteTextFromEveryLocale(draft, previous.textId);
      }
      const replacement: ResponseEntry =
        kind === "text"
          ? { id: previous.id, kind, textId: `text.response.${previous.id}` }
          : { id: previous.id, kind };
      group.entries[index] = replacement;
      if (replacement.kind === "text") {
        setEditorLocalizedText(draft, locale, replacement.textId, "New response");
      }
    });
  }

  async function importResponseMedia(kind: "audio" | "video") {
    if (!currentGroup || !currentEntry || currentEntry.kind !== kind) {
      return;
    }
    const projectDir = useEditorStore.getState().projectDir;
    if (!projectDir || !window.editorApi) {
      setStatusMessage("Open this project in the desktop editor to import media.");
      return;
    }
    const filePaths = await dialogs.pickFiles({
      title: `Import ${kind === "audio" ? "Audio" : "Video"} Response`,
      description: `Choose a ${kind} file. It will become a normal project asset and be assigned to this response.`,
      initialPath: projectDir,
      confirmLabel: `Import ${kind === "audio" ? "Audio" : "Video"}`,
      allowedExtensions: [...(kind === "audio" ? AUDIO_IMPORT_EXTENSIONS : VIDEO_IMPORT_EXTENSIONS)]
    });
    const filePath = filePaths[0];
    if (!filePath) {
      return;
    }
    try {
      setBusyLabel(`Importing response ${kind}`);
      const result = await window.editorApi.importAssets(
        projectDir,
        locale,
        project.assets.assets,
        [filePath],
        "response"
      );
      const importedAsset = result.importedAssets[0];
      const duplicateAsset = result.duplicateAssets[0]
        ? project.assets.assets.find((asset) => asset.id === result.duplicateAssets[0]!.assetId)
        : undefined;
      const assignedAsset = importedAsset ?? duplicateAsset;
      if (!assignedAsset || assignedAsset.kind !== kind) {
        throw new Error(`The selected file did not create a usable ${kind} asset.`);
      }
      mutateProject((draft) => {
        if (importedAsset) {
          draft.assets.assets.push(importedAsset);
          addAssetRoots(draft, [importedAsset]);
        }
        const group = draft.dialogues.responseGroups.find((candidate) => candidate.id === currentGroup.id);
        const entry = group?.entries.find((candidate) => candidate.id === currentEntry.id);
        if (entry && entry.kind === kind) {
          entry.assetId = assignedAsset.id;
        }
      });
      useEditorStore.getState().setSelectedAssetId(assignedAsset.id);
      setStatusMessage(`${importedAsset ? "Imported" : "Reused"} ${assignedAsset.name} for this response.`);
    } catch (error) {
      setStatusMessage(`Response media import failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  return (
    <div className="response-workspace">
      <aside className="panel response-library" aria-label="Response group library">
        <header className="response-library__header">
          <div>
            <p className="eyebrow">Player Feedback</p>
            <h3>Response Groups</h3>
          </div>
          <button type="button" className="button-accent" onClick={createGroup}>New Group</button>
        </header>
        <p className="muted response-library__intro">
          Groups pick one response at random and avoid repeating the most recent choice.
        </p>
        <label className="dialogue-search">
          <span className="field-label--inset">Find group</span>
          <input value={groupFilter} placeholder="Search by name" onChange={(event) => setGroupFilter(event.target.value)} />
        </label>
        <div className="response-library__list">
          {filteredGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={group.id === currentGroup?.id ? "response-group-item response-group-item--selected" : "response-group-item"}
              onClick={() => selectGroup(group)}
            >
              <span>{group.name}</span>
              <small>{formatEntryCount(group.entries.length)}</small>
            </button>
          ))}
        </div>
        {groups.length === 0 ? (
          <div className="dialogue-empty-state">
            <h4>Create a response group</h4>
            <p className="muted">Collect related text, audio, or video feedback in one reusable set.</p>
            <button type="button" className="button-accent" onClick={createGroup}>New Group</button>
          </div>
        ) : filteredGroups.length === 0 ? <p className="muted">No groups match this search.</p> : null}
      </aside>

      <main className="panel response-builder" aria-label="Response group editor">
        {currentGroup ? (
          <>
            <header className="response-builder__header">
              <label className="response-group-name">
                <span className="field-label--inset">Group name</span>
                <input
                  value={currentGroup.name}
                  onChange={(event) => mutateProject((draft) => {
                    const group = draft.dialogues.responseGroups.find((candidate) => candidate.id === currentGroup.id);
                    if (group) group.name = event.target.value;
                  })}
                  onBlur={(event) => {
                    if (event.target.value.trim()) return;
                    mutateProject((draft) => {
                      const group = draft.dialogues.responseGroups.find((candidate) => candidate.id === currentGroup.id);
                      if (group) group.name = "Untitled response group";
                    });
                  }}
                />
              </label>
              <button type="button" className="button-danger" onClick={() => void deleteGroup()}>Delete Group</button>
            </header>

            <section className="response-add-row" aria-label="Add response">
              <span>Add response</span>
              <button type="button" onClick={() => addEntry("text")}>Text</button>
              <button type="button" onClick={() => addEntry("audio")}>Audio</button>
              <button type="button" onClick={() => addEntry("video")}>Video</button>
            </section>

            {currentGroup.entries.length > 0 ? (
              <div className="response-entry-list">
                {currentGroup.entries.map((entry, index) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={entry.id === currentEntry?.id ? "response-entry-item response-entry-item--selected" : "response-entry-item"}
                    onClick={() => setSelectedEntryId(entry.id)}
                  >
                    <span className={`response-kind response-kind--${entry.kind}`}>{entry.kind}</span>
                    <span className="response-entry-item__label">{formatResponseEntryLabel(entry, project, strings, index)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="dialogue-empty-state response-empty-state">
                <h4>This group is empty</h4>
                <p className="muted">Add a response above. Text appears quietly; audio plays without blocking; video pauses the game.</p>
              </div>
            )}

            {currentEntry ? (
              <ResponseEntryEditor
                entry={currentEntry}
                group={currentGroup}
                locale={locale}
                project={project}
                strings={strings}
                mutateProject={mutateProject}
                onChangeKind={changeEntryKind}
                onDelete={() => void deleteEntry()}
                onImportMedia={importResponseMedia}
              />
            ) : null}
          </>
        ) : (
          <div className="dialogue-empty-state dialogue-empty-state--wide">
            <h4>No response group selected</h4>
            <p className="muted">Create a group to author reusable player feedback.</p>
            <button type="button" className="button-accent" onClick={createGroup}>New Group</button>
          </div>
        )}
      </main>

      <aside className="panel response-usage" aria-label="Response usage">
        <section>
          <p className="eyebrow">How it plays</p>
          <h4>{currentEntry ? formatKindHeading(currentEntry.kind) : "Select a response"}</h4>
          <p className="muted">{currentEntry ? formatKindDescription(currentEntry.kind) : "Choose an entry to edit and preview it."}</p>
          {currentEntry?.kind === "text" ? (
            <blockquote className="response-text-preview">{strings[currentEntry.textId]?.trim() || "No text yet"}</blockquote>
          ) : currentEntry ? (
            <div className="response-media-preview">
              <AssetPreview
                asset={project.assets.assets.find((asset) => asset.id === currentEntry.assetId)}
                locale={locale}
                allowSourceFallback
                fit="contain"
                emptyTitle={`No ${currentEntry.kind} selected`}
                emptyBody="Choose an existing asset or import one in the editor."
              />
            </div>
          ) : null}
        </section>
        <section className="response-usage__connections">
          <p className="eyebrow">Used From</p>
          <h4>{usages.length === 0 ? "Not assigned yet" : `${usages.length} hotspot ${usages.length === 1 ? "assignment" : "assignments"}`}</h4>
          {usages.length > 0 ? (
            <div className="response-usage__list">
              {usages.map((usage) => (
                <button
                  key={`${usage.sceneId}:${usage.hotspotId}:${usage.branchLabel}`}
                  type="button"
                  onClick={() => onOpenScenesHotspot?.(usage.sceneId, usage.hotspotId)}
                >
                  <strong>{usage.sceneName}</strong>
                  <span>{usage.hotspotName} · {usage.branchLabel}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">In Scenes, choose this group or line in an event’s Player feedback field.</p>
          )}
          <button type="button" className="button-accent" onClick={() => onOpenScenesHotspot?.(usages[0]?.sceneId, usages[0]?.hotspotId)}>
            Go to Scenes
          </button>
        </section>
      </aside>
    </div>
  );
}

function ResponseEntryEditor({
  entry,
  group,
  locale,
  project,
  strings,
  mutateProject,
  onChangeKind,
  onDelete,
  onImportMedia
}: {
  entry: ResponseEntry;
  group: ResponseGroup;
  locale: string;
  project: ProjectBundle;
  strings: Record<string, string>;
  mutateProject: ResponseGroupsPanelProps["mutateProject"];
  onChangeKind: (kind: ResponseEntry["kind"]) => void;
  onDelete: () => void;
  onImportMedia: (kind: "audio" | "video") => Promise<void>;
}) {
  const mediaAssets = entry.kind === "text" ? [] : project.assets.assets.filter((asset) => asset.kind === entry.kind);
  return (
    <section className="response-entry-editor">
      <header>
        <div>
          <p className="eyebrow">Selected Response</p>
          <h4>Edit response</h4>
        </div>
        <button type="button" className="button-danger" onClick={onDelete}>Delete Response</button>
      </header>
      <fieldset className="response-kind-picker">
        <legend>Type</legend>
        {(["text", "audio", "video"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={entry.kind === kind ? "response-kind-button response-kind-button--active" : "response-kind-button"}
            aria-pressed={entry.kind === kind}
            onClick={() => onChangeKind(kind)}
          >
            {kind.charAt(0).toUpperCase() + kind.slice(1)}
          </button>
        ))}
      </fieldset>
      {entry.kind === "text" ? (
        <>
          <label>
            <span className="field-label--inset">Text ({locale})</span>
            <textarea
              value={strings[entry.textId] ?? ""}
              placeholder="What should the player see?"
              onChange={(event) => mutateProject((draft) => {
                setEditorLocalizedText(draft, locale, entry.textId, event.target.value);
              })}
            />
          </label>
          <button
            type="button"
            className="button-secondary response-localization-link"
            onClick={() => {
              useEditorStore.getState().setSelectedTextId(entry.textId);
              useEditorStore.getState().setLocalizationLocale(locale);
              useEditorStore.getState().setLocalizationSection("strings");
              useEditorStore.getState().setActiveTab("localization");
            }}
          >
            Edit translations
          </button>
        </>
      ) : (
        <div className="response-media-fields">
          <label>
            <span className="field-label--inset">{entry.kind === "audio" ? "Audio" : "Video"} asset</span>
            <DropdownSelect
              value={entry.assetId ?? ""}
              onChange={(event) => mutateProject((draft) => {
                const draftGroup = draft.dialogues.responseGroups.find((candidate) => candidate.id === group.id);
                const draftEntry = draftGroup?.entries.find((candidate) => candidate.id === entry.id);
                if (draftEntry && draftEntry.kind === entry.kind) {
                  draftEntry.assetId = event.target.value || undefined;
                }
              })}
            >
              <option value="">Choose an existing asset</option>
              {entry.assetId && !mediaAssets.some((asset) => asset.id === entry.assetId) ? (
                <option value={entry.assetId}>Missing or incompatible asset</option>
              ) : null}
              {mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
            </DropdownSelect>
          </label>
          <span className="response-media-or">or</span>
          <button type="button" className="button-accent" onClick={() => void onImportMedia(entry.kind)}>
            Import {entry.kind === "audio" ? "Audio" : "Video"}
          </button>
          <p className="muted">Imported files become normal project assets and remain available in Assets.</p>
        </div>
      )}
    </section>
  );
}

function collectResponseUsage(
  project: ProjectBundle,
  group?: ResponseGroup,
  entry?: ResponseEntry
): ResponseUsage[] {
  const usages: ResponseUsage[] = [];
  for (const scene of project.scenes.items) {
    for (const hotspot of scene.hotspots) {
      const candidates: Array<{ event: HotspotEvent | undefined; branchLabel: string }> = [
        { event: hotspot, branchLabel: "Main action" },
        { event: hotspot.clickEvent, branchLabel: "On click" },
        { event: hotspot.otherItemEvent, branchLabel: "Any other item" }
      ];
      for (const candidate of candidates) {
        const selection = candidate.event?.response;
        const matchesGroup = Boolean(group && selection?.type === "group" && selection.groupId === group.id);
        const matchesEntry = Boolean(entry && selection?.type === "entry" && selection.entryId === entry.id);
        if (!matchesGroup && !matchesEntry) {
          continue;
        }
        usages.push({
          sceneId: scene.id,
          sceneName: scene.name,
          hotspotId: hotspot.id,
          hotspotName: hotspot.name,
          branchLabel: candidate.branchLabel
        });
      }
    }
  }
  return usages;
}

function clearResponseAssignments(
  project: ProjectBundle,
  target: { groupId?: string; entryId?: string }
) {
  for (const scene of project.scenes.items) {
    for (const hotspot of scene.hotspots) {
      clearMatchingResponse(hotspot, target);
      for (const key of ["clickEvent", "otherItemEvent"] as const) {
        const event = hotspot[key];
        if (!event) continue;
        clearMatchingResponse(event, target);
        if (!hasHotspotEvent(event)) delete hotspot[key];
      }
    }
  }
}

function clearMatchingResponse(event: HotspotEvent, target: { groupId?: string; entryId?: string }) {
  const response = event.response;
  if (
    (target.groupId && response?.type === "group" && response.groupId === target.groupId) ||
    (target.entryId && response?.type === "entry" && response.entryId === target.entryId)
  ) {
    delete event.response;
  }
}

function deleteTextFromEveryLocale(project: ProjectBundle, textId: string) {
  for (const values of Object.values(project.strings.byLocale)) {
    delete values[textId];
  }
}

function formatResponseEntryLabel(
  entry: ResponseEntry,
  project: ProjectBundle,
  strings: Record<string, string>,
  index: number
): string {
  if (entry.kind === "text") {
    return strings[entry.textId]?.trim() || `Untitled text response ${index + 1}`;
  }
  return project.assets.assets.find((asset) => asset.id === entry.assetId)?.name ?? `Choose ${entry.kind}`;
}

function formatEntryCount(count: number): string {
  return `${count} ${count === 1 ? "response" : "responses"}`;
}

function formatKindHeading(kind: ResponseEntry["kind"]): string {
  if (kind === "text") return "Quiet text message";
  if (kind === "audio") return "Nonblocking audio";
  return "Full-screen video";
}

function formatKindDescription(kind: ResponseEntry["kind"]): string {
  if (kind === "text") return "Appears without blocking the game, then disappears automatically based on its length.";
  if (kind === "audio") return "Plays without blocking other gameplay and can be stopped by the player.";
  return "Pauses gameplay until it ends or the player skips it. In Playtest, it stays inside the playtest area.";
}

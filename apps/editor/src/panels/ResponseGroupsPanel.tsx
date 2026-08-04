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
import { translateRuntimeMessage, useEditorI18n, type EditorTranslator } from "../i18n";
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
  const { direction, t } = useEditorI18n();
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
    formatResponseGroupName(t, group).toLocaleLowerCase().includes(groupFilter.trim().toLocaleLowerCase())
  );
  const usages = useMemo(
    () => (currentGroup ? collectResponseUsage(project, t, currentGroup, currentEntry) : []),
    [currentEntry, currentGroup, project, t]
  );

  function selectGroup(group: ResponseGroup) {
    setSelectedGroupId(group.id);
    setSelectedEntryId(group.entries[0]?.id);
  }

  function createGroup() {
    const group: ResponseGroup = {
      id: createId("response_group"),
      name: t("New response group"),
      entries: []
    };
    mutateProject((draft) => {
      draft.dialogues.responseGroups.push(group);
    });
    setSelectedGroupId(group.id);
    setSelectedEntryId(undefined);
    setStatusMessage(t("Created a response group. Add text, audio, or video responses to it."));
  }

  async function deleteGroup() {
    if (!currentGroup) {
      return;
    }
    const groupUsageCount =
      collectResponseUsage(project, t, currentGroup).length +
      currentGroup.entries.reduce(
        (count, entry) => count + collectResponseUsage(project, t, undefined, entry).length,
        0
      );
    const confirmed = await dialogs.confirm({
      title: t("Delete “{name}”?", { name: formatResponseGroupName(t, currentGroup) }),
      body: (
        <>
          <p>{t("This removes {responses} from the response library.", { responses: formatEntryCount(t, currentGroup.entries.length) })}</p>
          <p>
            {groupUsageCount > 0
              ? groupUsageCount === 1
                ? t("1 hotspot assignment will be changed to no player feedback.")
                : t("{count} hotspot assignments will be changed to no player feedback.", { count: groupUsageCount })
              : t("No hotspots currently use this group.")}
          </p>
        </>
      ),
      confirmLabel: t("Delete Group"),
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
    setStatusMessage(t("Deleted {name}.", { name: formatResponseGroupName(t, currentGroup) }));
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
        setEditorLocalizedText(draft, locale, entry.textId, t("New response"));
      }
    });
    setSelectedEntryId(entry.id);
    setStatusMessage(t("Added a {kind} response to {name}.", { kind: formatResponseKind(t, kind).toLocaleLowerCase(), name: formatResponseGroupName(t, currentGroup) }));
  }

  async function deleteEntry() {
    if (!currentGroup || !currentEntry) {
      return;
    }
    const directUsageCount = collectResponseUsage(project, t, undefined, currentEntry).length;
    const confirmed = await dialogs.confirm({
      title: t("Delete this response?"),
      body: (
        <p>
          {directUsageCount > 0
              ? directUsageCount === 1
                ? t("1 direct hotspot assignment will be changed to no player feedback.")
                : t("{count} direct hotspot assignments will be changed to no player feedback.", { count: directUsageCount })
              : t("The response will be removed from this group.")}
        </p>
      ),
      confirmLabel: t("Delete Response"),
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
    setStatusMessage(t("Deleted a response from {name}.", { name: formatResponseGroupName(t, currentGroup) }));
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
        setEditorLocalizedText(draft, locale, replacement.textId, t("New response"));
      }
    });
  }

  async function importResponseMedia(kind: "audio" | "video") {
    if (!currentGroup || !currentEntry || currentEntry.kind !== kind) {
      return;
    }
    const projectDir = useEditorStore.getState().projectDir;
    if (!projectDir || !window.editorApi) {
      setStatusMessage(t("Open this project in the desktop editor to import media."));
      return;
    }
    const filePaths = await dialogs.pickFiles({
      title: t("Import {kind} Response", { kind: formatResponseKind(t, kind) }),
      description: t("Choose a {kind} file. It will become a normal project asset and be assigned to this response.", {
        kind: formatResponseKind(t, kind).toLocaleLowerCase()
      }),
      initialPath: projectDir,
      confirmLabel: t("Import {kind}", { kind: formatResponseKind(t, kind) }),
      allowedExtensions: [...(kind === "audio" ? AUDIO_IMPORT_EXTENSIONS : VIDEO_IMPORT_EXTENSIONS)]
    });
    const filePath = filePaths[0];
    if (!filePath) {
      return;
    }
    try {
      setBusyLabel(t("Importing response {kind}", { kind: formatResponseKind(t, kind).toLocaleLowerCase() }));
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
        throw new Error(t("The selected file did not create a usable {kind} asset.", {
          kind: formatResponseKind(t, kind).toLocaleLowerCase()
        }));
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
      setStatusMessage(importedAsset
        ? t("Imported {name} for this response.", { name: assignedAsset.name })
        : t("Reused {name} for this response.", { name: assignedAsset.name }));
    } catch (error) {
      setStatusMessage(t("Response media import failed: {message}", {
        message: translateRuntimeMessage(error, t)
      }));
    } finally {
      setBusyLabel(undefined);
    }
  }

  return (
    <div className="response-workspace" dir={direction}>
      <aside className="panel response-library" aria-label={t("Response group library")}>
        <header className="response-library__header">
          <div>
            <p className="eyebrow">{t("Player Feedback")}</p>
            <h3>{t("Response Groups")}</h3>
          </div>
          <button type="button" className="button-accent" onClick={createGroup}>{t("New Group")}</button>
        </header>
        <p className="muted response-library__intro">
          {t("Groups pick one response at random and avoid repeating the most recent choice.")}
        </p>
        <label className="dialogue-search">
          <span className="field-label--inset">{t("Find group")}</span>
          <input value={groupFilter} placeholder={t("Search by name")} onChange={(event) => setGroupFilter(event.target.value)} />
        </label>
        <div className="response-library__list">
          {filteredGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={group.id === currentGroup?.id ? "response-group-item response-group-item--selected" : "response-group-item"}
              onClick={() => selectGroup(group)}
            >
              <span>{formatResponseGroupName(t, group)}</span>
              <small>{formatEntryCount(t, group.entries.length)}</small>
            </button>
          ))}
        </div>
        {groups.length === 0 ? (
          <div className="dialogue-empty-state">
            <h4>{t("Create a response group")}</h4>
            <p className="muted">{t("Collect related text, audio, or video feedback in one reusable set.")}</p>
            <button type="button" className="button-accent" onClick={createGroup}>{t("New Group")}</button>
          </div>
        ) : filteredGroups.length === 0 ? <p className="muted">{t("No groups match this search.")}</p> : null}
      </aside>

      <main className="panel response-builder" aria-label={t("Response group editor")}>
        {currentGroup ? (
          <>
            <header className="response-builder__header">
              <label className="response-group-name">
                <span className="field-label--inset">{t("Group name")}</span>
                <input
                  value={formatResponseGroupName(t, currentGroup)}
                  onChange={(event) => mutateProject((draft) => {
                    const group = draft.dialogues.responseGroups.find((candidate) => candidate.id === currentGroup.id);
                    if (group) group.name = event.target.value;
                  })}
                  onBlur={(event) => {
                    if (event.target.value.trim()) return;
                    mutateProject((draft) => {
                      const group = draft.dialogues.responseGroups.find((candidate) => candidate.id === currentGroup.id);
                      if (group) group.name = t("Untitled response group");
                    });
                  }}
                />
              </label>
              <button type="button" className="button-danger" onClick={() => void deleteGroup()}>{t("Delete Group")}</button>
            </header>

            <section className="response-add-row" aria-label={t("Add response")}>
              <span>{t("Add response")}</span>
              <button type="button" onClick={() => addEntry("text")}>{t("Text")}</button>
              <button type="button" onClick={() => addEntry("audio")}>{t("Audio")}</button>
              <button type="button" onClick={() => addEntry("video")}>{t("Video")}</button>
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
                    <span className={`response-kind response-kind--${entry.kind}`}>{formatResponseKind(t, entry.kind)}</span>
                    <span className="response-entry-item__label">{formatResponseEntryLabel(t, entry, project, strings, index)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="dialogue-empty-state response-empty-state">
                <h4>{t("This group is empty")}</h4>
                <p className="muted">{t("Add a response above. Text appears quietly; audio plays without blocking; video pauses the game.")}</p>
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
            <h4>{t("No response group selected")}</h4>
            <p className="muted">{t("Create a group to author reusable player feedback.")}</p>
            <button type="button" className="button-accent" onClick={createGroup}>{t("New Group")}</button>
          </div>
        )}
      </main>

      <aside className="panel response-usage" aria-label={t("Response usage")}>
        <section>
          <p className="eyebrow">{t("How it plays")}</p>
          <h4>{currentEntry ? formatKindHeading(t, currentEntry.kind) : t("Select a response")}</h4>
          <p className="muted">{currentEntry ? formatKindDescription(t, currentEntry.kind) : t("Choose an entry to edit and preview it.")}</p>
          {currentEntry?.kind === "text" ? (
            <blockquote className="response-text-preview">{strings[currentEntry.textId]?.trim() || t("No text yet")}</blockquote>
          ) : currentEntry ? (
            <div className="response-media-preview">
              <AssetPreview
                asset={project.assets.assets.find((asset) => asset.id === currentEntry.assetId)}
                locale={locale}
                allowSourceFallback
                fit="contain"
                emptyTitle={t("No {kind} selected", { kind: formatResponseKind(t, currentEntry.kind).toLocaleLowerCase() })}
                emptyBody={t("Choose an existing asset or import one in the editor.")}
              />
            </div>
          ) : null}
        </section>
        <section className="response-usage__connections">
          <p className="eyebrow">{t("Used From")}</p>
          <h4>{usages.length === 0 ? t("Not assigned yet") : formatHotspotAssignmentCount(t, usages.length)}</h4>
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
            <p className="muted">{t("In Scenes, choose this group or line in an event’s Player feedback field.")}</p>
          )}
          <button type="button" className="button-accent" onClick={() => onOpenScenesHotspot?.(usages[0]?.sceneId, usages[0]?.hotspotId)}>
            {t("Go to Scenes")}
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
  const { t } = useEditorI18n();
  const mediaAssets = entry.kind === "text" ? [] : project.assets.assets.filter((asset) => asset.kind === entry.kind);
  return (
    <section className="response-entry-editor">
      <header>
        <div>
          <p className="eyebrow">{t("Selected Response")}</p>
          <h4>{t("Edit response")}</h4>
        </div>
        <button type="button" className="button-danger" onClick={onDelete}>{t("Delete Response")}</button>
      </header>
      <fieldset className="response-kind-picker">
        <legend>{t("Type")}</legend>
        {(["text", "audio", "video"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={entry.kind === kind ? "response-kind-button response-kind-button--active" : "response-kind-button"}
            aria-pressed={entry.kind === kind}
            onClick={() => onChangeKind(kind)}
          >
            {formatResponseKind(t, kind)}
          </button>
        ))}
      </fieldset>
      {entry.kind === "text" ? (
        <>
          <label>
            <span className="field-label--inset">{t("Text ({locale})", { locale })}</span>
            <textarea
              value={strings[entry.textId] ?? ""}
              placeholder={t("What should the player see?")}
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
            {t("Edit translations")}
          </button>
        </>
      ) : (
        <div className="response-media-fields">
          <label>
            <span className="field-label--inset">{t("{kind} asset", { kind: formatResponseKind(t, entry.kind) })}</span>
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
              <option value="">{t("Choose an existing asset")}</option>
              {entry.assetId && !mediaAssets.some((asset) => asset.id === entry.assetId) ? (
                <option value={entry.assetId}>{t("Missing or incompatible asset")}</option>
              ) : null}
              {mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
            </DropdownSelect>
          </label>
          <span className="response-media-or">{t("or")}</span>
          <button type="button" className="button-accent" onClick={() => void onImportMedia(entry.kind)}>
            {t("Import {kind}", { kind: formatResponseKind(t, entry.kind) })}
          </button>
          <p className="muted">{t("Imported files become normal project assets and remain available in Assets.")}</p>
        </div>
      )}
    </section>
  );
}

function collectResponseUsage(
  project: ProjectBundle,
  t: EditorTranslator,
  group?: ResponseGroup,
  entry?: ResponseEntry
): ResponseUsage[] {
  const usages: ResponseUsage[] = [];
  for (const scene of project.scenes.items) {
    for (const hotspot of scene.hotspots) {
      const candidates: Array<{ event: HotspotEvent | undefined; branchLabel: string }> = [
        { event: hotspot, branchLabel: t("Main action") },
        { event: hotspot.clickEvent, branchLabel: t("On click") },
        { event: hotspot.otherItemEvent, branchLabel: t("Any other item") }
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
  t: EditorTranslator,
  entry: ResponseEntry,
  project: ProjectBundle,
  strings: Record<string, string>,
  index: number
): string {
  if (entry.kind === "text") {
    return strings[entry.textId]?.trim() || t("Untitled text response {number}", { number: index + 1 });
  }
  return project.assets.assets.find((asset) => asset.id === entry.assetId)?.name ??
    t("Choose {kind}", { kind: formatResponseKind(t, entry.kind).toLocaleLowerCase() });
}

function formatEntryCount(t: EditorTranslator, count: number): string {
  return count === 1 ? t("1 response") : t("{count} responses", { count });
}

const STARTER_RESPONSE_GROUP_NAMES: Readonly<Record<string, string>> = {
  response_group_wrong_item: "Wrong item",
  response_group_missing_prerequisite: "Missing prerequisite",
  response_group_already_completed: "Already completed",
  response_group_no_effect: "No effect",
  response_group_nothing_useful: "Nothing useful"
};

function formatResponseGroupName(t: EditorTranslator, group: ResponseGroup): string {
  const starterName = STARTER_RESPONSE_GROUP_NAMES[group.id];
  return starterName && group.name === starterName ? t(starterName) : group.name;
}

function formatHotspotAssignmentCount(t: EditorTranslator, count: number): string {
  return count === 1 ? t("1 hotspot assignment") : t("{count} hotspot assignments", { count });
}

function formatResponseKind(t: EditorTranslator, kind: ResponseEntry["kind"]): string {
  if (kind === "text") return t("Text");
  if (kind === "audio") return t("Audio");
  return t("Video");
}

function formatKindHeading(t: EditorTranslator, kind: ResponseEntry["kind"]): string {
  if (kind === "text") return t("Quiet text message");
  if (kind === "audio") return t("Nonblocking audio");
  return t("Full-screen video");
}

function formatKindDescription(t: EditorTranslator, kind: ResponseEntry["kind"]): string {
  if (kind === "text") return t("Appears without blocking the game, then disappears automatically based on its length.");
  if (kind === "audio") return t("Plays without blocking other gameplay and can be stopped by the player.");
  return t("Pauses gameplay until it ends or the player skips it. In Playtest, it stays inside the playtest area.");
}

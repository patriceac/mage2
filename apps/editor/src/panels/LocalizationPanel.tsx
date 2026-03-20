import { useEffect, useState } from "react";
import type { ProjectBundle } from "@mage2/schema";
import { useDialogs } from "../dialogs";
import type { EditorNavigationTarget } from "../navigation-target";
import {
  collectProjectTextEntries,
  deleteOrphanedProjectTextEntries,
  filterProjectTextEntries,
  formatProjectTextUsageKind,
  getProjectTextAreaLabel,
  getProjectTextStatusLabel,
  resolveProjectTextArea,
  resolveProjectTextSelection,
  summarizeProjectTextUsages
} from "../project-text";
import { useEditorStore } from "../store";

interface LocalizationPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}

export function LocalizationPanel({ project, mutateProject }: LocalizationPanelProps) {
  const dialogs = useDialogs();
  const allEntries = collectProjectTextEntries(project);
  const selectedTextId = useEditorStore((state) => state.selectedTextId);
  const setSelectedTextId = useEditorStore((state) => state.setSelectedTextId);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const setSelectedLocationId = useEditorStore((state) => state.setSelectedLocationId);
  const setSelectedSceneId = useEditorStore((state) => state.setSelectedSceneId);
  const setSelectedHotspotId = useEditorStore((state) => state.setSelectedHotspotId);
  const setSelectedDialogueId = useEditorStore((state) => state.setSelectedDialogueId);
  const setSelectedDialogueNodeId = useEditorStore((state) => state.setSelectedDialogueNodeId);
  const setSelectedInventoryItemId = useEditorStore((state) => state.setSelectedInventoryItemId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "missing" | "referenced" | "orphaned">("all");
  const [areaFilter, setAreaFilter] = useState<"all" | "dialogue" | "inventory" | "subtitles">("all");
  const [sortOption, setSortOption] = useState<"status" | "textId" | "mostUses">("status");

  const visibleEntries = filterProjectTextEntries(allEntries, {
    search,
    status: statusFilter,
    area: areaFilter,
    sort: sortOption
  });
  const activeTextId = resolveProjectTextSelection(visibleEntries, selectedTextId);
  const selectedEntry = visibleEntries.find((entry) => entry.textId === activeTextId);
  const missingCount = allEntries.filter((entry) => entry.status === "missing").length;
  const referencedCount = allEntries.filter((entry) => entry.status === "referenced").length;
  const orphanedCount = allEntries.filter((entry) => entry.status === "orphaned").length;
  const visibleOrphanedEntries = visibleEntries.filter((entry) => entry.status === "orphaned");
  const hasActiveSearchOrFilter = search.trim().length > 0 || statusFilter !== "all" || areaFilter !== "all";

  useEffect(() => {
    const nextSelectedTextId = resolveProjectTextSelection(visibleEntries, selectedTextId);
    if (nextSelectedTextId !== selectedTextId) {
      setSelectedTextId(nextSelectedTextId);
    }
  }, [selectedTextId, setSelectedTextId, visibleEntries]);

  function handleNavigate(target: EditorNavigationTarget, textId: string) {
    setSelectedTextId(target.textId ?? textId);
    setActiveTab(target.tab);
    setSelectedLocationId(target.locationId);
    setSelectedSceneId(target.sceneId);
    setSelectedHotspotId(target.hotspotId);
    setSelectedDialogueId(target.dialogueId);
    setSelectedDialogueNodeId(target.dialogueNodeId);
    setSelectedInventoryItemId(target.inventoryItemId);
  }

  async function handleDeleteOrphanedEntries(textIds: string[]) {
    if (textIds.length === 0) {
      return;
    }

    const isBulkDelete = textIds.length > 1;
    const confirmed = await dialogs.confirm({
      title: isBulkDelete ? `Delete ${textIds.length} orphaned strings?` : `Delete ${textIds[0]}?`,
      body: (
        <>
          <p>
            {isBulkDelete
              ? "Only the currently visible orphaned entries will be removed from the stored project text."
              : "This orphaned entry is no longer referenced anywhere in the project and will be removed from the stored project text."}
          </p>
          <div className="dialog-callout">
            <strong>Removing</strong>
            <ul className="dialog-detail-list">
              {textIds.slice(0, 8).map((textId) => (
                <li key={textId}>
                  <code>{textId}</code>
                </li>
              ))}
              {textIds.length > 8 ? <li>{`${textIds.length - 8} more entry${textIds.length - 8 === 1 ? "" : "ies"}`}</li> : null}
            </ul>
          </div>
        </>
      ),
      confirmLabel: isBulkDelete ? "Delete Visible Orphaned" : "Delete Orphaned Entry",
      cancelLabel: "Keep Entries",
      tone: "danger"
    });

    if (!confirmed) {
      return;
    }

    mutateProject((draft) => {
      deleteOrphanedProjectTextEntries(draft, textIds);
    });
  }

  return (
    <div className="panel-grid panel-grid--localization">
      <section className="panel localization-panel">
        <div className="panel__toolbar localization-panel__header">
          <div>
            <h3>Project Text</h3>
            <p className="muted localization-panel__summary">
              {hasActiveSearchOrFilter
                ? `${visibleEntries.length} of ${allEntries.length} visible. `
                : `${allEntries.length} entr${allEntries.length === 1 ? "y" : "ies"}: `}
              {missingCount} missing, {referencedCount} referenced, {orphanedCount} orphaned.
            </p>
          </div>
          <div className="localization-panel__toolbar-actions">
            <button
              type="button"
              className="button-danger"
              disabled={visibleOrphanedEntries.length === 0}
              title="Delete all orphaned entries currently visible in this filtered list."
              onClick={() => void handleDeleteOrphanedEntries(visibleOrphanedEntries.map((entry) => entry.textId))}
            >
              Delete Visible Orphaned
            </button>
          </div>
        </div>

        <div className="localization-panel__controls">
          <label className="localization-filter localization-filter--search">
            <span className="field-label--inset">Search</span>
            <input
              value={search}
              placeholder="Search text id, value, usage, or owner"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="localization-filter">
            <span className="field-label--inset">Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">All statuses</option>
              <option value="missing">Missing</option>
              <option value="referenced">Referenced</option>
              <option value="orphaned">Orphaned</option>
            </select>
          </label>
          <label className="localization-filter">
            <span className="field-label--inset">Area</span>
            <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value as typeof areaFilter)}>
              <option value="all">All areas</option>
              <option value="dialogue">Dialogue</option>
              <option value="inventory">Inventory</option>
              <option value="subtitles">Subtitles</option>
            </select>
          </label>
          <label className="localization-filter">
            <span className="field-label--inset">Sort</span>
            <select value={sortOption} onChange={(event) => setSortOption(event.target.value as typeof sortOption)}>
              <option value="status">Status then ID</option>
              <option value="textId">Text ID A-Z</option>
              <option value="mostUses">Most Uses</option>
            </select>
          </label>
        </div>

        {visibleEntries.length > 0 ? (
          <div className="list-stack localization-list">
            {visibleEntries.map((entry) => {
              const isSelected = entry.textId === activeTextId;
              const usageAreas = [...new Set(entry.usages.map((usage) => getProjectTextAreaLabel(resolveProjectTextArea(usage.kind))))];
              return (
                <article
                  key={entry.textId}
                  className={isSelected ? "list-card list-card--selected localization-entry" : "list-card localization-entry"}
                >
                  <div className="localization-entry__header">
                    <button
                      type="button"
                      className="localization-entry__select"
                      onClick={() => setSelectedTextId(entry.textId)}
                      title={`Inspect the project text entry ${entry.textId}.`}
                    >
                      <code>{entry.textId}</code>
                    </button>
                    <div className="localization-entry__badges">
                      {usageAreas.map((area) => (
                        <span key={area} className="localization-area">
                          {area}
                        </span>
                      ))}
                      <span
                        className={`localization-status localization-status--${entry.status}`}
                        title={`This entry is ${getProjectTextStatusLabel(entry.status).toLowerCase()}.`}
                      >
                        {getProjectTextStatusLabel(entry.status)}
                      </span>
                      {entry.status === "orphaned" ? (
                        <button
                          type="button"
                          className="button-danger button-danger--compact"
                          title={`Delete the orphaned string ${entry.textId}.`}
                          onClick={() => void handleDeleteOrphanedEntries([entry.textId])}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <p className="muted localization-entry__summary">{summarizeProjectTextUsages(entry.usages)}</p>

                  <label>
                    <span className="field-label--inset">Source Text</span>
                    <textarea
                      value={entry.value}
                      title={`Edit the source text stored under ${entry.textId}.`}
                      onFocus={() => setSelectedTextId(entry.textId)}
                      onChange={(event) =>
                        mutateProject((draft) => {
                          draft.strings.values[entry.textId] = event.target.value;
                        })
                      }
                    />
                  </label>

                  {entry.usages.length > 0 ? (
                    <div className="pill-list localization-entry__actions">
                      {entry.usages.map((usage, index) => (
                        <button
                          key={`${usage.kind}-${usage.ownerId}-${index}`}
                          type="button"
                          className="button-secondary localization-entry__jump"
                          onClick={() => handleNavigate(usage.navigation, entry.textId)}
                          title={`Open ${usage.ownerLabel} in the ${usage.navigation.tab} tab.`}
                        >
                          {formatProjectTextUsageKind(usage.kind)} - {usage.ownerLabel}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="muted localization-entry__orphan">
                      No current references. Keep this entry for later reuse or repurpose it when you are ready.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        ) : allEntries.length > 0 ? (
          <p className="muted localization-panel__empty-state">
            No project text entries match the current search and filters.
          </p>
        ) : (
          <p className="muted">No project text entries yet.</p>
        )}
      </section>

      <aside className="panel localization-context">
        <div className="panel__toolbar">
          <div>
            <h3>Context</h3>
            <p className="muted">Use this pane to review where the selected source text is used across the project.</p>
          </div>
        </div>

        {selectedEntry ? (
          <div className="localization-context__body">
            <div className="localization-context__headline">
              <code className="localization-context__text-id">{selectedEntry.textId}</code>
              <span
                className={`localization-status localization-status--${selectedEntry.status}`}
                title={`This entry is ${getProjectTextStatusLabel(selectedEntry.status).toLowerCase()}.`}
              >
                {getProjectTextStatusLabel(selectedEntry.status)}
              </span>
            </div>

            <p className="muted localization-context__note">
              {selectedEntry.status === "missing"
                ? "This text id is referenced in the project, but it does not exist in the stored source text yet. Editing it from the list will create it immediately."
                : selectedEntry.status === "orphaned"
                  ? "This text id is still stored in the project, but nothing currently points at it."
                  : "This source text is already connected to one or more project surfaces."}
            </p>

            <dl className="inspector-grid localization-context__meta">
              <dt>Uses</dt>
              <dd>{selectedEntry.usages.length}</dd>
              <dt>Stored Value</dt>
              <dd>{selectedEntry.value.length > 0 ? "Yes" : "Empty"}</dd>
              <dt>Next Step</dt>
              <dd>{selectedEntry.usages.length > 0 ? "Review usage targets below." : "Review whether this key should stay."}</dd>
            </dl>

            {selectedEntry.usages.length > 0 ? (
              <div className="list-stack localization-context__usages">
                {selectedEntry.usages.map((usage, index) => (
                  <article key={`${usage.kind}-${usage.ownerId}-${index}`} className="list-card list-card--compact">
                    <div className="localization-context__usage-header">
                      <strong>{formatProjectTextUsageKind(usage.kind)}</strong>
                      <span className="muted">{usage.ownerLabel}</span>
                    </div>
                    <button
                      type="button"
                      className="button-secondary localization-context__jump"
                      onClick={() => handleNavigate(usage.navigation, selectedEntry.textId)}
                      title={`Open ${usage.ownerLabel} in the ${usage.navigation.tab} tab.`}
                    >
                      Open {usage.navigation.label}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted localization-context__empty">
                No editor surfaces currently reference this text id. This pane is ready for richer preview tooling in a
                later localization pass.
              </p>
            )}
          </div>
        ) : (
          <p className="muted">Select a project text entry to inspect its context.</p>
        )}
      </aside>
    </div>
  );
}

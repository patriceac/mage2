import type { ProjectBundle } from "@mage2/schema";
import type { EditorNavigationTarget } from "../navigation-target";
import {
  collectProjectTextEntries,
  formatProjectTextUsageKind,
  getProjectTextStatusLabel,
  summarizeProjectTextUsages
} from "../project-text";
import { useEditorStore } from "../store";

interface LocalizationPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}

export function LocalizationPanel({ project, mutateProject }: LocalizationPanelProps) {
  const entries = collectProjectTextEntries(project);
  const selectedTextId = useEditorStore((state) => state.selectedTextId);
  const setSelectedTextId = useEditorStore((state) => state.setSelectedTextId);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const setSelectedLocationId = useEditorStore((state) => state.setSelectedLocationId);
  const setSelectedSceneId = useEditorStore((state) => state.setSelectedSceneId);
  const setSelectedHotspotId = useEditorStore((state) => state.setSelectedHotspotId);
  const setSelectedDialogueId = useEditorStore((state) => state.setSelectedDialogueId);
  const setSelectedDialogueNodeId = useEditorStore((state) => state.setSelectedDialogueNodeId);
  const setSelectedInventoryItemId = useEditorStore((state) => state.setSelectedInventoryItemId);

  const activeTextId = entries.some((entry) => entry.textId === selectedTextId) ? selectedTextId : entries[0]?.textId;
  const selectedEntry = entries.find((entry) => entry.textId === activeTextId);
  const missingCount = entries.filter((entry) => entry.status === "missing").length;
  const referencedCount = entries.filter((entry) => entry.status === "referenced").length;
  const orphanedCount = entries.filter((entry) => entry.status === "orphaned").length;

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

  return (
    <div className="panel-grid panel-grid--localization">
      <section className="panel localization-panel">
        <div className="panel__toolbar localization-panel__header">
          <div>
            <h3>Project Text</h3>
            <p className="muted localization-panel__summary">
              {entries.length} entr{entries.length === 1 ? "y" : "ies"}: {missingCount} missing, {referencedCount}{" "}
              referenced, {orphanedCount} orphaned.
            </p>
          </div>
        </div>

        {entries.length > 0 ? (
          <div className="list-stack localization-list">
            {entries.map((entry) => {
              const isSelected = entry.textId === activeTextId;
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
                    <span
                      className={`localization-status localization-status--${entry.status}`}
                      title={`This entry is ${getProjectTextStatusLabel(entry.status).toLowerCase()}.`}
                    >
                      {getProjectTextStatusLabel(entry.status)}
                    </span>
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

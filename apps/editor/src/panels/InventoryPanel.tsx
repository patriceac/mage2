import { getLocaleStringValues, type ProjectBundle } from "@mage2/schema";
import { setEditorLocalizedText } from "../localized-project";
import { addInventoryItem } from "../project-helpers";
import { useEditorStore } from "../store";

interface InventoryPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}

export function InventoryPanel({ project, mutateProject }: InventoryPanelProps) {
  const selectedInventoryItemId = useEditorStore((state) => state.selectedInventoryItemId);
  const setSelectedInventoryItemId = useEditorStore((state) => state.setSelectedInventoryItemId);
  const activeLocale = useEditorStore((state) => state.activeLocale) ?? project.manifest.defaultLanguage;
  const localeStrings = getLocaleStringValues(project, activeLocale);
  return (
    <div className="panel-grid panel-grid--single">
      <section className="panel">
        <div className="panel__toolbar">
          <h3>Inventory Items</h3>
          <button
            type="button"
            title="Create a new inventory item and open it for editing."
            onClick={() =>
              mutateProject((draft) => {
                const item = addInventoryItem(draft);
                setSelectedInventoryItemId(item.id);
              })
            }
          >
            Add Item
          </button>
        </div>

        {project.inventory.items.map((item) => (
          <article
            key={item.id}
            className={item.id === selectedInventoryItemId ? "list-card list-card--selected" : "list-card"}
          >
            <label>
              <span className="field-label--inset">Name</span>
              <input
                value={item.name}
                title="Internal name used to identify this inventory item in the editor."
                onFocus={() => setSelectedInventoryItemId(item.id)}
                onChange={(event) =>
                  mutateProject((draft) => {
                    const target = draft.inventory.items.find((entry) => entry.id === item.id);
                    if (target) {
                      target.name = event.target.value;
                    }
                  })
                }
              />
            </label>
            <label>
              <span className="field-label--inset">Display Text</span>
              <input
                value={localeStrings[item.textId] ?? ""}
                title="Player-facing item label stored in project text."
                onFocus={() => setSelectedInventoryItemId(item.id)}
                onChange={(event) =>
                  mutateProject((draft) => {
                    setEditorLocalizedText(draft, activeLocale, item.textId, event.target.value);
                  })
                }
              />
            </label>
            <label>
              <span className="field-label--inset">Description</span>
              <textarea
                value={localeStrings[item.descriptionTextId ?? ""] ?? ""}
                title="Longer inspection text shown when the player looks at this item."
                onFocus={() => setSelectedInventoryItemId(item.id)}
                onChange={(event) =>
                  mutateProject((draft) => {
                    if (item.descriptionTextId) {
                      setEditorLocalizedText(draft, activeLocale, item.descriptionTextId, event.target.value);
                    }
                  })
                }
              />
            </label>
          </article>
        ))}
      </section>
    </div>
  );
}

import type { ProjectBundle } from "@mage2/schema";
import { addInventoryItem } from "../project-helpers";
import { useEditorStore } from "../store";

interface InventoryPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
}

export function InventoryPanel({ project, mutateProject }: InventoryPanelProps) {
  const selectedInventoryItemId = useEditorStore((state) => state.selectedInventoryItemId);
  const setSelectedInventoryItemId = useEditorStore((state) => state.setSelectedInventoryItemId);
  return (
    <div className="panel-grid panel-grid--inventory">
      <section className="panel">
        <div className="panel__toolbar">
          <h3>Inventory Items</h3>
          <button
            type="button"
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
            <input
              value={item.name}
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
            <label>
              Display Text
              <input
                value={project.strings.values[item.textId] ?? ""}
                onFocus={() => setSelectedInventoryItemId(item.id)}
                onChange={(event) =>
                  mutateProject((draft) => {
                    draft.strings.values[item.textId] = event.target.value;
                  })
                }
              />
            </label>
            <label>
              Description
              <textarea
                value={project.strings.values[item.descriptionTextId ?? ""] ?? ""}
                onFocus={() => setSelectedInventoryItemId(item.id)}
                onChange={(event) =>
                  mutateProject((draft) => {
                    if (item.descriptionTextId) {
                      draft.strings.values[item.descriptionTextId] = event.target.value;
                    }
                  })
                }
              />
            </label>
          </article>
        ))}
      </section>

      <aside className="panel">
        <h3>String Table</h3>
        <div className="string-table">
          {Object.entries(project.strings.values).map(([textId, value]) => (
            <label key={textId}>
              <span>{textId}</span>
              <textarea
                value={value}
                onChange={(event) =>
                  mutateProject((draft) => {
                    draft.strings.values[textId] = event.target.value;
                  })
                }
              />
            </label>
          ))}
        </div>
      </aside>
    </div>
  );
}

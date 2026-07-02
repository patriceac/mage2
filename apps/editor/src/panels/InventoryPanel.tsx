import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  getLocaleStringValues,
  type Asset,
  type Condition,
  type Effect,
  type Hotspot,
  type InventoryItem,
  type ProjectBundle
} from "@mage2/schema";
import { INVENTORY_IMAGE_EXTENSIONS, isInventoryImageImportPath } from "../asset-file-types";
import { useDialogs } from "../dialogs";
import { DropdownSelect } from "../DropdownSelect";
import { setEditorLocalizedText } from "../localized-project";
import { addAssetRoots, addInventoryItem, isInventoryImageAsset } from "../project-helpers";
import { AssetPreview } from "../previews";
import { useEditorStore } from "../store";

interface InventoryPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  setStatusMessage: (message: string) => void;
  setBusyLabel: (label?: string) => void;
  onOpenScenesHotspot?: (sceneId?: string, hotspotId?: string) => void;
}

type InventoryIconKind =
  | "add"
  | "check"
  | "chevron"
  | "clear"
  | "copy"
  | "delete"
  | "filter"
  | "grid"
  | "image"
  | "list"
  | "pickup"
  | "place"
  | "replace"
  | "scene"
  | "search"
  | "upload"
  | "warning";

interface InventoryUsageScene {
  sceneId: string;
  sceneName: string;
  references: number;
  hotspotId?: string;
}

interface InventoryUsageHotspot {
  key: string;
  sceneId: string;
  sceneName: string;
  hotspotId: string;
  entityName: string;
  label: string;
}

interface InventoryUsageSummary {
  scenes: InventoryUsageScene[];
  pickups: InventoryUsageHotspot[];
  placements: InventoryUsageHotspot[];
}

interface InventoryValidationRow {
  key: string;
  label: string;
  status: "Valid" | "Warning";
  tone: "valid" | "warning";
}

export function InventoryPanel({
  project,
  mutateProject,
  setStatusMessage,
  setBusyLabel,
  onOpenScenesHotspot
}: InventoryPanelProps) {
  const dialogs = useDialogs();
  const selectedInventoryItemId = useEditorStore((state) => state.selectedInventoryItemId);
  const setSelectedInventoryItemId = useEditorStore((state) => state.setSelectedInventoryItemId);
  const setSelectedAssetId = useEditorStore((state) => state.setSelectedAssetId);
  const activeLocale = project.manifest.defaultLanguage;
  const localeStrings = getLocaleStringValues(project, activeLocale);
  const availableInventoryAssets = project.assets.assets.filter(isInventoryImageAsset);
  const [activeDropItemId, setActiveDropItemId] = useState<string | undefined>(undefined);
  const [itemSearch, setItemSearch] = useState("");
  const [sortMode, setSortMode] = useState<"name-asc" | "name-desc" | "status">("name-asc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const inventoryDropDepthRef = useRef<Record<string, number>>({});

  const selectedItem =
    project.inventory.items.find((item) => item.id === selectedInventoryItemId) ?? project.inventory.items[0];
  const selectedAssignedAsset = selectedItem
    ? project.assets.assets.find((asset) => asset.id === selectedItem.imageAssetId)
    : undefined;
  const selectedAssetIsValid = selectedAssignedAsset ? isInventoryImageAsset(selectedAssignedAsset) : false;
  const selectedDisplayText = selectedItem ? resolveInventoryItemDisplayLabel(selectedItem, localeStrings) : "";
  const selectedDescription =
    selectedItem && selectedItem.descriptionTextId ? localeStrings[selectedItem.descriptionTextId] ?? "" : "";
  const selectedUsage = useMemo(
    () => (selectedItem ? collectInventoryUsage(project, selectedItem.id) : createEmptyUsageSummary()),
    [project, selectedItem]
  );
  const selectedValidationRows = selectedItem
    ? collectInventoryValidationRows(
        selectedItem,
        selectedAssignedAsset,
        selectedAssetIsValid,
        selectedDisplayText,
        selectedUsage
      )
    : [];
  const selectedWarningCount = selectedValidationRows.filter((row) => row.tone === "warning").length;

  const filteredItems = useMemo(() => {
    const searchNeedle = itemSearch.trim().toLowerCase();
    const items = project.inventory.items.filter((item) => {
      if (!searchNeedle) {
        return true;
      }
      const displayLabel = resolveInventoryItemDisplayLabel(item, localeStrings);
      const description = item.descriptionTextId ? localeStrings[item.descriptionTextId] ?? "" : "";
      return `${displayLabel} ${item.name} ${item.id} ${description}`.toLowerCase().includes(searchNeedle);
    });

    return [...items].sort((left, right) => {
      if (sortMode === "status") {
        const leftStatus = getInventoryItemStatus(left, project, localeStrings);
        const rightStatus = getInventoryItemStatus(right, project, localeStrings);
        if (leftStatus !== rightStatus) {
          return leftStatus === "warning" ? -1 : 1;
        }
      }

      const leftLabel = resolveInventoryItemDisplayLabel(left, localeStrings).toLowerCase();
      const rightLabel = resolveInventoryItemDisplayLabel(right, localeStrings).toLowerCase();
      const direction = sortMode === "name-desc" ? -1 : 1;
      return leftLabel.localeCompare(rightLabel) * direction;
    });
  }, [itemSearch, localeStrings, project, sortMode]);

  function createInventoryItem() {
    mutateProject((draft) => {
      const item = addInventoryItem(draft);
      setSelectedInventoryItemId(item.id);
    });
  }

  function duplicateSelectedInventoryItem() {
    if (!selectedItem) {
      return;
    }

    const displayText = selectedDisplayText || selectedItem.name;
    const description = selectedDescription;
    mutateProject((draft) => {
      const item = addInventoryItem(draft);
      item.name = `${selectedItem.name} Copy`;
      item.imageAssetId = selectedItem.imageAssetId;
      setEditorLocalizedText(draft, activeLocale, item.textId, `${displayText} Copy`);
      if (item.descriptionTextId && description.trim()) {
        setEditorLocalizedText(draft, activeLocale, item.descriptionTextId, description);
      }
      setSelectedInventoryItemId(item.id);
    });
    setStatusMessage(`Duplicated ${selectedItem.name}. Save the project to keep this change.`);
  }

  async function importInventoryImageFromFilePath(itemId: string, itemName: string, filePath: string) {
    try {
      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error("No project directory is currently open.");
      }

      setBusyLabel("Importing inventory image");
      const { importedAssets, duplicateFilePaths, duplicateAssets } = await window.editorApi.importAssets(
        projectDir,
        activeLocale,
        project.assets.assets,
        [filePath],
        "inventory"
      );
      if (importedAssets.length === 0) {
        const duplicateAsset = duplicateAssets[0]
          ? project.assets.assets.find((entry) => entry.id === duplicateAssets[0]!.assetId)
          : undefined;
        if (duplicateAsset) {
          mutateProject((draft) => {
            const targetItem = draft.inventory.items.find((entry) => entry.id === itemId);
            if (targetItem) {
              targetItem.imageAssetId = duplicateAsset.id;
            }
          });
          setSelectedInventoryItemId(itemId);
          setSelectedAssetId(duplicateAsset.id);
          setStatusMessage(
            `Assigned existing ${duplicateAsset.name} to ${itemName}. Save the project to keep this change.`
          );
          return;
        }

        if (duplicateFilePaths.length > 0) {
          setStatusMessage("That file already exists as an inventory asset. Choose it from the item image picker.");
        } else {
          setStatusMessage("No new inventory image asset was created.");
        }
        return;
      }

      const importedAsset = importedAssets[0]!;
      mutateProject((draft) => {
        addAssetRoots(draft, [importedAsset]);
        draft.assets.assets.push(importedAsset);
        const targetItem = draft.inventory.items.find((entry) => entry.id === itemId);
        if (targetItem) {
          targetItem.imageAssetId = importedAsset.id;
        }
      });
      setSelectedInventoryItemId(itemId);
      setSelectedAssetId(importedAsset.id);
      setStatusMessage(
        `Imported ${importedAsset.name} and assigned it to ${itemName}. Save the project to keep this change.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Inventory image import failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  async function handleImportInventoryImage(itemId: string, itemName: string, hasExistingImage: boolean) {
    const filePaths = await dialogs.pickFiles({
      title: hasExistingImage ? `Replace Image for ${itemName}` : `Upload Image for ${itemName}`,
      description: "Choose an image file to create an inventory asset and assign it to this item.",
      initialPath: useEditorStore.getState().projectDir,
      confirmLabel: hasExistingImage ? "Use Inventory Image" : "Upload Inventory Image",
      allowedExtensions: [...INVENTORY_IMAGE_EXTENSIONS]
    });
    const filePath = filePaths[0];
    if (!filePath) {
      return;
    }

    await importInventoryImageFromFilePath(itemId, itemName, filePath);
  }

  function isFileDrag(event: DragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleInventoryImageDragEnter(itemId: string, event: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    inventoryDropDepthRef.current[itemId] = (inventoryDropDepthRef.current[itemId] ?? 0) + 1;
    setActiveDropItemId(itemId);
  }

  function handleInventoryImageDragOver(itemId: string, event: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (activeDropItemId !== itemId) {
      setActiveDropItemId(itemId);
    }
  }

  function handleInventoryImageDragLeave(itemId: string, event: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    const nextDepth = Math.max((inventoryDropDepthRef.current[itemId] ?? 0) - 1, 0);
    inventoryDropDepthRef.current[itemId] = nextDepth;
    if (nextDepth === 0 && activeDropItemId === itemId) {
      setActiveDropItemId(undefined);
    }
  }

  async function handleInventoryImageDrop(itemId: string, itemName: string, event: DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    inventoryDropDepthRef.current[itemId] = 0;
    setActiveDropItemId(undefined);
    setSelectedInventoryItemId(itemId);

    const droppedFilePaths = Array.from(event.dataTransfer.files)
      .map((file) => window.editorApi.getPathForDroppedFile(file))
      .filter((filePath) => filePath.trim().length > 0);
    const filePath = droppedFilePaths.find(isInventoryImageImportPath);

    if (!filePath) {
      setStatusMessage("Drop an image file onto the item preview to assign inventory art.");
      return;
    }

    await importInventoryImageFromFilePath(itemId, itemName, filePath);
  }

  return (
    <section className="inventory-workbench" aria-label="Inventory">
      <header className="inventory-workbench__toolbar">
        <div className="inventory-workbench__title">Inventory</div>
        <div className="inventory-workbench__actions" aria-label="Inventory actions">
          <button
            type="button"
            className="inventory-tool-button inventory-tool-button--primary"
            title="Create a new inventory item."
            onClick={createInventoryItem}
          >
            <InventoryPanelIcon kind="add" />
            <span>Add Item</span>
          </button>
          <button
            type="button"
            className="inventory-tool-button inventory-tool-button--icon"
            title={selectedItem ? `Duplicate ${selectedItem.name}.` : "Select an item to duplicate."}
            disabled={!selectedItem}
            onClick={duplicateSelectedInventoryItem}
          >
            <InventoryPanelIcon kind="copy" />
          </button>
          <button
            type="button"
            className="inventory-tool-button inventory-tool-button--icon inventory-tool-button--danger"
            title="Delete is not available while scene references may exist."
            disabled
          >
            <InventoryPanelIcon kind="delete" />
          </button>
          <button
            type="button"
            className="inventory-tool-button inventory-tool-button--icon"
            title={selectedItem ? `Upload image for ${selectedItem.name}.` : "Select an item to upload art."}
            disabled={!selectedItem}
            onClick={() =>
              selectedItem
                ? void handleImportInventoryImage(selectedItem.id, selectedItem.name, Boolean(selectedItem.imageAssetId))
                : undefined
            }
          >
            <InventoryPanelIcon kind="upload" />
          </button>
        </div>
        <span className="inventory-workbench__count">{formatCount(project.inventory.items.length, "item")}</span>
        <div className="inventory-workbench__spacer" />
        <label className="inventory-sort-control">
          <span className="sr-only">Sort inventory items</span>
          <DropdownSelect
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as "name-asc" | "name-desc" | "status")}
          >
            <option value="name-asc">Sort: Name (A-Z)</option>
            <option value="name-desc">Sort: Name (Z-A)</option>
            <option value="status">Sort: Status</option>
          </DropdownSelect>
        </label>
        <div className="inventory-view-toggle" aria-label="Inventory view">
          <button
            type="button"
            className={viewMode === "grid" ? "inventory-tool-button inventory-tool-button--icon inventory-tool-button--active" : "inventory-tool-button inventory-tool-button--icon"}
            title="Compact grid view."
            onClick={() => setViewMode("grid")}
          >
            <InventoryPanelIcon kind="grid" />
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "inventory-tool-button inventory-tool-button--icon inventory-tool-button--active" : "inventory-tool-button inventory-tool-button--icon"}
            title="Detailed list view."
            onClick={() => setViewMode("list")}
          >
            <InventoryPanelIcon kind="list" />
          </button>
        </div>
      </header>

      <div className="inventory-workbench__body">
        <aside className="inventory-browser" aria-label="Inventory items">
          <div className="inventory-browser__search-row">
            <label className="inventory-search-field">
              <InventoryPanelIcon kind="search" />
              <input
                aria-label="Search items"
                placeholder="Search items"
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="inventory-tool-button inventory-tool-button--icon control-wiring-issue"
              title="Filter items is not wired yet."
            >
              <InventoryPanelIcon kind="filter" />
            </button>
          </div>

          <div className="inventory-browser-table__header" aria-hidden="true">
            <span className="inventory-browser-table__name-heading">Name ↑</span>
            <span>ID</span>
            <span>Status</span>
          </div>

          <div
            className={viewMode === "grid" ? "inventory-browser__list inventory-browser__list--compact" : "inventory-browser__list"}
            role="list"
          >
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => {
                const itemAsset = project.assets.assets.find((asset) => asset.id === item.imageAssetId);
                const displayLabel = resolveInventoryItemDisplayLabel(item, localeStrings);
                const status = getInventoryItemStatus(item, project, localeStrings);
                const isSelected = item.id === selectedItem?.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    className={isSelected ? "inventory-item-row inventory-item-row--selected" : "inventory-item-row"}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedInventoryItemId(item.id)}
                    title={`Select ${displayLabel}.`}
                  >
                    <span className="inventory-item-row__thumb">
                      <AssetPreview
                        asset={itemAsset}
                        locale={activeLocale}
                        allowSourceFallback
                        preferPosterForImages
                        fit="contain"
                        emptyTitle="No image"
                        emptyBody=""
                      />
                    </span>
                    <span className="inventory-item-row__name">{displayLabel}</span>
                    <span className="inventory-item-row__id">{item.id}</span>
                    <span className={status === "valid" ? "inventory-status-chip inventory-status-chip--valid" : "inventory-status-chip inventory-status-chip--warning"}>
                      <span aria-hidden="true" />
                      {status === "valid" ? "Valid" : "Warning"}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="inventory-empty-state">
                <strong>No matching items</strong>
              </div>
            )}
          </div>

          <footer className="inventory-browser__footer">
            <span>{formatCount(project.inventory.items.length, "item")}</span>
            <InventoryPanelIcon kind="replace" />
          </footer>
        </aside>

        <main className="inventory-detail" aria-label="Inventory item details">
          {selectedItem ? (
            <>
              <header className="inventory-detail__header">
                <h3>{selectedDisplayText}</h3>
              </header>

              <div className="inventory-detail__form">
                <label>
                  <span className="field-label--inset">ID (Internal Name)</span>
                  <input value={selectedItem.id} readOnly title="Inventory item identifier." />
                  <span className="inventory-field-help">Unique identifier used in data and scripts.</span>
                </label>

                <label>
                  <span className="field-label--inset">Display Text</span>
                  <input
                    value={localeStrings[selectedItem.textId] ?? ""}
                    title="Shown to players in the inventory UI."
                    onFocus={() => setSelectedInventoryItemId(selectedItem.id)}
                    onChange={(event) =>
                      mutateProject((draft) => {
                        setEditorLocalizedText(draft, activeLocale, selectedItem.textId, event.target.value);
                      })
                    }
                  />
                  <span className="inventory-field-help">Shown to players in the inventory UI.</span>
                </label>

                <label>
                  <span className="field-label--inset">Description</span>
                  <textarea
                    value={selectedDescription}
                    title="Longer inspection text shown when the player looks at this item."
                    onFocus={() => setSelectedInventoryItemId(selectedItem.id)}
                    onChange={(event) =>
                      mutateProject((draft) => {
                        if (selectedItem.descriptionTextId) {
                          setEditorLocalizedText(draft, activeLocale, selectedItem.descriptionTextId, event.target.value);
                        }
                      })
                    }
                  />
                  <span className="inventory-field-counter">{selectedDescription.length} / 500</span>
                </label>

                <section className="inventory-image-editor" aria-label="Inventory image">
                  <h4>Inventory Image</h4>
                  <div className="inventory-image-editor__body">
                    <div
                      className={
                        activeDropItemId === selectedItem.id
                          ? "inventory-image-stage inventory-image-stage--active"
                          : "inventory-image-stage"
                      }
                      onDragEnter={(event) => handleInventoryImageDragEnter(selectedItem.id, event)}
                      onDragOver={(event) => handleInventoryImageDragOver(selectedItem.id, event)}
                      onDragLeave={(event) => handleInventoryImageDragLeave(selectedItem.id, event)}
                      onDrop={(event) => void handleInventoryImageDrop(selectedItem.id, selectedItem.name, event)}
                    >
                      <AssetPreview
                        asset={selectedAssignedAsset}
                        locale={activeLocale}
                        allowSourceFallback
                        preferPosterForImages
                        fit="contain"
                        emptyTitle="No image"
                        emptyBody="Upload or drop an image."
                      />
                      {activeDropItemId === selectedItem.id ? (
                        <div className="inventory-image-stage__overlay" aria-hidden="true">
                          <strong>{selectedItem.imageAssetId ? "Drop to replace image" : "Drop image here"}</strong>
                          <span>Images only</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="inventory-image-editor__meta">
                      <span>{formatAssetDimensions(selectedAssignedAsset, activeLocale)}</span>
                      <span className={selectedItem.imageAssetId ? "inventory-inline-valid" : "inventory-inline-warning"}>
                        <span aria-hidden="true" />
                        {selectedItem.imageAssetId ? "Valid" : "Missing"}
                      </span>
                      <p>Recommended: 512x512 PNG with transparent background.</p>
                    </div>
                  </div>
                  <div className="inventory-image-editor__actions">
                    <button
                      type="button"
                      className="inventory-tool-button inventory-tool-button--primary"
                      onClick={() => void handleImportInventoryImage(selectedItem.id, selectedItem.name, Boolean(selectedItem.imageAssetId))}
                      title="Create a new inventory image asset from disk and assign it to this item."
                    >
                      <InventoryPanelIcon kind="upload" />
                      <span>Upload</span>
                    </button>
                    <button
                      type="button"
                      className="inventory-tool-button"
                      onClick={() => void handleImportInventoryImage(selectedItem.id, selectedItem.name, Boolean(selectedItem.imageAssetId))}
                      title="Replace the current inventory image."
                    >
                      <InventoryPanelIcon kind="replace" />
                      <span>Replace</span>
                    </button>
                    <button
                      type="button"
                      className="inventory-tool-button"
                      disabled={!selectedItem.imageAssetId}
                      onClick={() =>
                        mutateProject((draft) => {
                          const target = draft.inventory.items.find((entry) => entry.id === selectedItem.id);
                          if (target) {
                            target.imageAssetId = undefined;
                          }
                        })
                      }
                      title={
                        selectedItem.imageAssetId
                          ? "Remove the current image assignment from this inventory item."
                          : "No inventory image is currently assigned."
                      }
                    >
                      <InventoryPanelIcon kind="clear" />
                      <span>Clear</span>
                    </button>
                  </div>
                </section>

                <label>
                  <span className="field-label--inset">Category</span>
                  <DropdownSelect value="key-items" disabled title="Categories are reserved for a future inventory schema.">
                    <option value="key-items">Key Items</option>
                  </DropdownSelect>
                </label>

                <label className="inventory-checkbox-row">
                  <span className="field-label--inset">Stackable</span>
                  <span>
                    <input type="checkbox" disabled />
                    <span>Allow multiple in inventory</span>
                  </span>
                </label>

                <label>
                  <span className="field-label--inset">Max Stack Size</span>
                  <input value="1" readOnly disabled />
                </label>
              </div>
            </>
          ) : (
            <div className="inventory-empty-state inventory-empty-state--center">
              <strong>No inventory item selected</strong>
              <button type="button" className="inventory-tool-button inventory-tool-button--primary" onClick={createInventoryItem}>
                <InventoryPanelIcon kind="add" />
                <span>Add Item</span>
              </button>
            </div>
          )}
        </main>

        <aside className="inventory-reference" aria-label="Inventory usage and validation">
          {selectedItem ? (
            <>
              <InventoryReferenceSection title="Used in Scenes" count={selectedUsage.scenes.length}>
                <div className="inventory-reference-table inventory-reference-table--two">
                  <div className="inventory-reference-table__header">
                    <span>Scene</span>
                    <span>References</span>
                  </div>
                  {selectedUsage.scenes.length > 0 ? (
                    selectedUsage.scenes.map((entry) => (
                      <button
                        key={entry.sceneId}
                        type="button"
                        className="inventory-reference-row"
                        onClick={() => onOpenScenesHotspot?.(entry.sceneId, entry.hotspotId)}
                      >
                        <span>{entry.sceneName}</span>
                        <span>{entry.references}</span>
                        <InventoryPanelIcon kind="chevron" />
                      </button>
                    ))
                  ) : (
                    <p className="inventory-reference-empty">No scene references</p>
                  )}
                </div>
              </InventoryReferenceSection>

              <InventoryReferenceSection title="Pickup hotspots" count={selectedUsage.pickups.length}>
                <div className="inventory-reference-table inventory-reference-table--three">
                  <div className="inventory-reference-table__header">
                    <span>Scene</span>
                    <span>Entity</span>
                    <span>Name</span>
                  </div>
                  {selectedUsage.pickups.length > 0 ? (
                    selectedUsage.pickups.map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        className="inventory-reference-row"
                        onClick={() => onOpenScenesHotspot?.(entry.sceneId, entry.hotspotId)}
                      >
                        <span>{entry.sceneName}</span>
                        <span>{entry.entityName}</span>
                        <span>{entry.label}</span>
                        <InventoryPanelIcon kind="chevron" />
                      </button>
                    ))
                  ) : (
                    <p className="inventory-reference-empty">No pickup hotspots</p>
                  )}
                </div>
              </InventoryReferenceSection>

              <InventoryReferenceSection title="Placement targets" count={selectedUsage.placements.length}>
                <div className="inventory-reference-table inventory-reference-table--three">
                  <div className="inventory-reference-table__header">
                    <span>Scene</span>
                    <span>Entity</span>
                    <span>Socket / Target</span>
                  </div>
                  {selectedUsage.placements.length > 0 ? (
                    selectedUsage.placements.map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        className="inventory-reference-row"
                        onClick={() => onOpenScenesHotspot?.(entry.sceneId, entry.hotspotId)}
                      >
                        <span>{entry.sceneName}</span>
                        <span>{entry.entityName}</span>
                        <span>{entry.label}</span>
                        <InventoryPanelIcon kind="chevron" />
                      </button>
                    ))
                  ) : (
                    <p className="inventory-reference-empty">No placement targets</p>
                  )}
                </div>
              </InventoryReferenceSection>

              <InventoryReferenceSection title="Validation" count={selectedValidationRows.length}>
                <div className="inventory-validation-list">
                  {selectedValidationRows.map((row) => (
                    <div key={row.key} className="inventory-validation-row">
                      <InventoryPanelIcon kind={row.tone === "valid" ? "check" : "warning"} />
                      <span>{row.label}</span>
                      <strong className={row.tone === "valid" ? "inventory-validation-row__status--valid" : "inventory-validation-row__status--warning"}>
                        {row.status}
                      </strong>
                    </div>
                  ))}
                </div>
              </InventoryReferenceSection>

              <footer className="inventory-reference__summary">
                <span className="inventory-inline-valid">
                  <span aria-hidden="true" />
                  No errors
                </span>
                <span className={selectedWarningCount > 0 ? "inventory-inline-warning" : "inventory-inline-valid"}>
                  <span aria-hidden="true" />
                  {formatCount(selectedWarningCount, "warning")}
                </span>
              </footer>
            </>
          ) : (
            <p className="inventory-reference-empty">Select an item to inspect references.</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function InventoryReferenceSection({
  title,
  count,
  children
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="inventory-reference-section">
      <header className="inventory-reference-section__header">
        <h4>{title}</h4>
        <span>{count}</span>
      </header>
      {children}
    </section>
  );
}

function collectInventoryUsage(project: ProjectBundle, itemId: string): InventoryUsageSummary {
  const scenes = new Map<string, InventoryUsageScene>();
  const pickups: InventoryUsageHotspot[] = [];
  const placements: InventoryUsageHotspot[] = [];

  function registerScene(sceneId: string, sceneName: string, hotspotId?: string, referenceCount = 1) {
    const existing = scenes.get(sceneId);
    if (existing) {
      existing.references += referenceCount;
      existing.hotspotId = existing.hotspotId ?? hotspotId;
      return;
    }
    scenes.set(sceneId, {
      sceneId,
      sceneName,
      references: referenceCount,
      hotspotId
    });
  }

  for (const scene of project.scenes.items) {
    const sceneEffectRefs =
      countInventoryEffects(scene.onEnterEffects, itemId) + countInventoryEffects(scene.onExitEffects, itemId);
    if (sceneEffectRefs > 0) {
      registerScene(scene.id, scene.name, undefined, sceneEffectRefs);
    }

    scene.hotspots.forEach((hotspot, index) => {
      let hotspotRefs = 0;
      if (hotspot.inventoryItemId === itemId) {
        hotspotRefs += 1;
        pickups.push({
          key: `${scene.id}:${hotspot.id}:pickup`,
          sceneId: scene.id,
          sceneName: scene.name,
          hotspotId: hotspot.id,
          entityName: hotspot.name || `Hotspot ${index + 1}`,
          label: hasInventoryEffect(hotspot.effects, "addItem", itemId) ? "Key Pickup" : "Pickup"
        });
      }

      if (hotspot.placedInventoryItemId === itemId) {
        hotspotRefs += 1;
        placements.push({
          key: `${scene.id}:${hotspot.id}:placement`,
          sceneId: scene.id,
          sceneName: scene.name,
          hotspotId: hotspot.id,
          entityName: hotspot.name || `Hotspot ${index + 1}`,
          label: "Keyhole"
        });
      }

      if (hotspot.requiredItemIds.includes(itemId)) {
        hotspotRefs += 1;
      }

      hotspotRefs += countInventoryConditions(hotspot.conditions, itemId);
      hotspotRefs += countInventoryEffects(hotspot.effects, itemId);

      if (hotspotRefs > 0) {
        registerScene(scene.id, scene.name, hotspot.id, hotspotRefs);
      }
    });
  }

  return {
    scenes: Array.from(scenes.values()),
    pickups,
    placements
  };
}

function collectInventoryValidationRows(
  item: InventoryItem,
  assignedAsset: Asset | undefined,
  isValidInventoryAsset: boolean,
  displayText: string,
  usage: InventoryUsageSummary
): InventoryValidationRow[] {
  const rows: InventoryValidationRow[] = [];
  if (!item.imageAssetId) {
    rows.push({ key: "image-missing", label: "Has inventory image", status: "Warning", tone: "warning" });
  } else if (!assignedAsset || !isValidInventoryAsset) {
    rows.push({ key: "image-invalid", label: "Has inventory image", status: "Warning", tone: "warning" });
  } else {
    rows.push({ key: "image-valid", label: "Has inventory image", status: "Valid", tone: "valid" });
  }

  rows.push(
    displayText.trim()
      ? { key: "display-valid", label: "Display text is set", status: "Valid", tone: "valid" }
      : { key: "display-missing", label: "Display text is set", status: "Warning", tone: "warning" }
  );

  rows.push(
    usage.pickups.length > 0
      ? { key: "pickup-valid", label: "Used by a pickup hotspot", status: "Valid", tone: "valid" }
      : { key: "pickup-missing", label: "Not used by a pickup hotspot.", status: "Warning", tone: "warning" }
  );

  rows.push(
    usage.placements.length > 0
      ? { key: "target-valid", label: "Used as a placement target", status: "Valid", tone: "valid" }
      : { key: "target-missing", label: "Not used as a placement target.", status: "Warning", tone: "warning" }
  );

  return rows;
}

function createEmptyUsageSummary(): InventoryUsageSummary {
  return {
    scenes: [],
    pickups: [],
    placements: []
  };
}

function getInventoryItemStatus(
  item: InventoryItem,
  project: ProjectBundle,
  localeStrings: Record<string, string>
): "valid" | "warning" {
  const assignedAsset = item.imageAssetId ? project.assets.assets.find((asset) => asset.id === item.imageAssetId) : undefined;
  if (!item.imageAssetId || !assignedAsset || !isInventoryImageAsset(assignedAsset)) {
    return "warning";
  }
  if (!resolveInventoryItemDisplayLabel(item, localeStrings).trim()) {
    return "warning";
  }
  return "valid";
}

function resolveInventoryItemDisplayLabel(item: InventoryItem, localeStrings: Record<string, string>): string {
  return localeStrings[item.textId]?.trim() || item.name || item.id;
}

function formatCount(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function formatAssetDimensions(asset: Asset | undefined, locale: string): string {
  if (!asset) {
    return "No image assigned";
  }

  const variant = asset.variants[locale] ?? Object.values(asset.variants)[0];
  const dimensions = variant?.width && variant?.height ? `${variant.width} x ${variant.height}` : "Image asset";
  const extension = resolveAssetExtension(variant?.sourcePath ?? variant?.proxyPath ?? asset.name);
  return extension ? `${dimensions} (${extension})` : dimensions;
}

function resolveAssetExtension(path: string | undefined): string | undefined {
  const extension = path?.split(".").pop()?.trim();
  return extension ? extension.toUpperCase() : undefined;
}

function countInventoryConditions(conditions: Condition[], itemId: string): number {
  return conditions.filter((condition) => condition.type === "inventoryHas" && condition.itemId === itemId).length;
}

function countInventoryEffects(effects: Effect[], itemId: string): number {
  return effects.filter((effect) => (effect.type === "addItem" || effect.type === "removeItem") && effect.itemId === itemId).length;
}

function hasInventoryEffect(effects: Effect[], type: "addItem" | "removeItem", itemId: string): boolean {
  return effects.some((effect) => effect.type === type && effect.itemId === itemId);
}

function InventoryPanelIcon({ kind }: { kind: InventoryIconKind }) {
  if (kind === "add") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (kind === "search") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.8" cy="10.8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.65" />
        <path d="m15 15 4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      </svg>
    );
  }

  if (kind === "filter") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.4 7.2h13.2M8.2 12h7.6M10.4 16.8h3.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (kind === "copy") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="7" width="10" height="12" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.65" />
        <path d="M6 16H5.8A1.8 1.8 0 0 1 4 14.2V5.8A1.8 1.8 0 0 1 5.8 4h8.4A1.8 1.8 0 0 1 16 5.8V6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.65" />
      </svg>
    );
  }

  if (kind === "delete") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 7.2h13M9 7.2V5.4h6v1.8M8.2 9.5l.5 9.1h6.6l.5-9.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" />
      </svg>
    );
  }

  if (kind === "upload") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15V5.5m-3.2 3.2L12 5.5l3.2 3.2M5.5 15.5v2.8h13v-2.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (kind === "replace") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.8 8.4A6.7 6.7 0 0 0 6.5 7.2L5.2 8.5M6.2 15.6a6.7 6.7 0 0 0 11.3 1.2l1.3-1.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" />
        <path d="M5.1 5.5v3.1h3.1M18.9 18.5v-3.1h-3.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" />
      </svg>
    );
  }

  if (kind === "clear") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (kind === "grid") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6h4.6v4.6H6V6Zm7.4 0H18v4.6h-4.6V6ZM6 13.4h4.6V18H6v-4.6Zm7.4 0H18V18h-4.6v-4.6Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.55" />
      </svg>
    );
  }

  if (kind === "list") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.2 7h10.2M8.2 12h10.2M8.2 17h10.2M5.6 7h.01M5.6 12h.01M5.6 17h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (kind === "image") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 6.2h13v11.6h-13V6.2Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
        <path d="m7.8 15.2 2.8-3 2 2 1.5-1.5 2.4 2.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" />
      </svg>
    );
  }

  if (kind === "scene") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.4 7h13.2v11H5.4V7Zm1.2 0 1.8-3h7.2l1.8 3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        <path d="M8.2 10.8h5.1M8.2 14.2h7.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
      </svg>
    );
  }

  if (kind === "pickup") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8.8 12 5l5 3.8v6.5L12 19l-5-3.7V8.8Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.55" />
        <path d="m7.4 9 4.6 3.4L16.6 9M12 12.4V19" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.25" />
      </svg>
    );
  }

  if (kind === "place") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20s5.2-5 5.2-9.5a5.2 5.2 0 0 0-10.4 0C6.8 15 12 20 12 20Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        <circle cx="12" cy="10.4" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.55" />
      </svg>
    );
  }

  if (kind === "check") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.55" />
        <path d="m8.6 12.3 2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (kind === "warning") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4.8 20 18H4l8-13.2Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.55" />
        <path d="M12 9.4v4.1M12 16.5h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (kind === "chevron") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  return null;
}

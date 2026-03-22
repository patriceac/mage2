import { useRef, useState } from "react";
import { getLocaleStringValues, type ProjectBundle } from "@mage2/schema";
import { INVENTORY_IMAGE_EXTENSIONS, isInventoryImageImportPath } from "../asset-file-types";
import { useDialogs } from "../dialogs";
import { setEditorLocalizedText } from "../localized-project";
import { addAssetRoots, addInventoryItem, cloneProject, isInventoryImageAsset } from "../project-helpers";
import { AssetPreview } from "../previews";
import { useEditorStore } from "../store";

interface InventoryPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  setSavedProject: (project: ProjectBundle) => void;
  setStatusMessage: (message: string) => void;
  setBusyLabel: (label?: string) => void;
}

export function InventoryPanel({
  project,
  mutateProject,
  setSavedProject,
  setStatusMessage,
  setBusyLabel
}: InventoryPanelProps) {
  const dialogs = useDialogs();
  const selectedInventoryItemId = useEditorStore((state) => state.selectedInventoryItemId);
  const setSelectedInventoryItemId = useEditorStore((state) => state.setSelectedInventoryItemId);
  const setSelectedAssetId = useEditorStore((state) => state.setSelectedAssetId);
  const activeLocale = project.manifest.defaultLanguage;
  const localeStrings = getLocaleStringValues(project, activeLocale);
  const availableInventoryAssets = project.assets.assets.filter(isInventoryImageAsset);
  const [activeDropItemId, setActiveDropItemId] = useState<string | undefined>(undefined);
  const inventoryDropDepthRef = useRef<Record<string, number>>({});

  async function importInventoryImageFromFilePath(itemId: string, itemName: string, filePath: string) {
    try {
      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error("No project directory is currently open.");
      }

      setBusyLabel("Importing inventory image");
      const { importedAssets, duplicateFilePaths } = await window.editorApi.importAssets(
        projectDir,
        activeLocale,
        project.assets.assets,
        [filePath],
        "inventory"
      );
      if (importedAssets.length === 0) {
        if (duplicateFilePaths.length > 0) {
          setStatusMessage("That file already exists as an inventory asset. Choose it from the item image picker.");
        } else {
          setStatusMessage("No new inventory image asset was created.");
        }
        return;
      }

      const importedAsset = importedAssets[0]!;
      const nextProject = cloneProject(project);
      addAssetRoots(nextProject, [importedAsset]);
      nextProject.assets.assets.push(importedAsset);
      const targetItem = nextProject.inventory.items.find((entry) => entry.id === itemId);
      if (targetItem) {
        targetItem.imageAssetId = importedAsset.id;
      }

      const result = await window.editorApi.saveProject(projectDir, nextProject);
      setSavedProject(result.project);
      setSelectedInventoryItemId(itemId);
      setSelectedAssetId(importedAsset.id);
      setStatusMessage(
        result.validationReport.valid
          ? `Assigned ${importedAsset.name} to ${itemName}.`
          : `Assigned ${importedAsset.name} to ${itemName}, saved with ${result.validationReport.issues.length} validation issue(s).`
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

  function isFileDrag(event: React.DragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleInventoryImageDragEnter(itemId: string, event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    inventoryDropDepthRef.current[itemId] = (inventoryDropDepthRef.current[itemId] ?? 0) + 1;
    setActiveDropItemId(itemId);
  }

  function handleInventoryImageDragOver(itemId: string, event: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (activeDropItemId !== itemId) {
      setActiveDropItemId(itemId);
    }
  }

  function handleInventoryImageDragLeave(itemId: string, event: React.DragEvent<HTMLDivElement>) {
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

  async function handleInventoryImageDrop(
    itemId: string,
    itemName: string,
    event: React.DragEvent<HTMLDivElement>
  ) {
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
    <div className="panel-grid panel-grid--single">
      <section className="panel">
        <div className="panel__toolbar">
          <div>
            <h3>Inventory Items</h3>
            <p className="muted">
              Assign item art here. Uploaded or dropped item images become inventory assets automatically.
            </p>
          </div>
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

        {project.inventory.items.map((item) => {
          const assignedAsset = project.assets.assets.find((asset) => asset.id === item.imageAssetId);
          const isValidInventoryAsset = assignedAsset ? isInventoryImageAsset(assignedAsset) : false;
          return (
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

              <div className="inventory-item-art">
                <div
                  className={
                    activeDropItemId === item.id
                      ? "inventory-item-art__dropzone inventory-item-art__dropzone--active"
                      : "inventory-item-art__dropzone"
                  }
                  onDragEnter={(event) => handleInventoryImageDragEnter(item.id, event)}
                  onDragOver={(event) => handleInventoryImageDragOver(item.id, event)}
                  onDragLeave={(event) => handleInventoryImageDragLeave(item.id, event)}
                  onDrop={(event) => void handleInventoryImageDrop(item.id, item.name, event)}
                >
                  <div className="inventory-item-art__preview">
                    <AssetPreview
                      asset={assignedAsset}
                      locale={activeLocale}
                      allowSourceFallback
                      preferPosterForImages
                      emptyTitle="No item image"
                      emptyBody="Assign or upload an inventory image for this item."
                    />
                    {activeDropItemId === item.id ? (
                      <div className="inventory-item-art__dropzone-overlay" aria-hidden="true">
                        <strong>{item.imageAssetId ? "Drop to replace image" : "Drop image here"}</strong>
                        <span>Images only. The first supported image will be imported and assigned.</span>
                      </div>
                    ) : null}
                  </div>
                  <p className="muted inventory-item-art__dropzone-hint">
                    Drag an image onto the preview to assign this item&apos;s art.
                  </p>
                </div>
                <div className="inventory-item-art__controls">
                  <label>
                    <span className="field-label--inset">Inventory Image</span>
                    <select
                      value={item.imageAssetId ?? ""}
                      onFocus={() => setSelectedInventoryItemId(item.id)}
                      onChange={(event) =>
                        mutateProject((draft) => {
                          const target = draft.inventory.items.find((entry) => entry.id === item.id);
                          if (target) {
                            target.imageAssetId = event.target.value || undefined;
                          }
                        })
                      }
                    >
                      <option value="">No image assigned</option>
                      {item.imageAssetId && assignedAsset && !isValidInventoryAsset ? (
                        <option value={item.imageAssetId}>Invalid current image selection</option>
                      ) : null}
                      {availableInventoryAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="list-card__actions">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void handleImportInventoryImage(item.id, item.name, Boolean(item.imageAssetId))}
                      title="Create a new inventory image asset from disk and assign it to this item."
                    >
                      {item.imageAssetId ? "Replace Image" : "Upload Image"}
                    </button>
                    <button
                      type="button"
                      className="button-danger"
                      disabled={!item.imageAssetId}
                      onClick={() =>
                        mutateProject((draft) => {
                          const target = draft.inventory.items.find((entry) => entry.id === item.id);
                          if (target) {
                            target.imageAssetId = undefined;
                          }
                        })
                      }
                      title={
                        item.imageAssetId
                          ? "Remove the current image assignment from this inventory item."
                          : "No inventory image is currently assigned."
                      }
                    >
                      Clear Image
                    </button>
                  </div>
                  {assignedAsset && !isValidInventoryAsset ? (
                    <p className="muted">The current image reference is not an inventory image asset. Pick or upload a valid item image.</p>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

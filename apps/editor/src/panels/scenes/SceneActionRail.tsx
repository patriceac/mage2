import type { RefObject } from "react";
import { SceneActionIcon } from "./SceneEditorIcons";

interface SceneActionRailProps {
  hasBackground: boolean;
  hasSelectedHotspot: boolean;
  inventoryPickerAnchorRef: RefObject<HTMLButtonElement | null>;
  isInventoryPickerVisible: boolean;
  onCreateHotspot: () => void;
  onDeleteSelectedHotspot: () => void;
  onToggleInventoryPicker: () => void;
}

export function SceneActionRail({
  hasBackground,
  hasSelectedHotspot,
  inventoryPickerAnchorRef,
  isInventoryPickerVisible,
  onCreateHotspot,
  onDeleteSelectedHotspot,
  onToggleInventoryPicker
}: SceneActionRailProps) {
  return (
    <aside className="scenes-panel__action-rail" aria-label="Scene object actions">
      <div className="scenes-panel__hotspot-actions">
        <button
          type="button"
          className="scenes-panel__tool-button scenes-panel__tool-button--primary"
          title="Create a new hotspot in the emptiest available area of this scene. Shortcut: Ctrl+click empty space in the preview."
          onClick={onCreateHotspot}
        >
          <SceneActionIcon kind="hotspot" />
          Create Hotspot
        </button>
        <button
          ref={inventoryPickerAnchorRef}
          type="button"
          className="button-secondary scenes-panel__tool-button scenes-panel__tool-button--secondary"
          aria-label="Add Inventory Item"
          title="Search inventory items and place them into this scene."
          aria-expanded={isInventoryPickerVisible}
          onClick={onToggleInventoryPicker}
        >
          <SceneActionIcon kind="item" />
          Add Item
        </button>
        <button
          type="button"
          className="button-danger-quiet scenes-panel__tool-button scenes-panel__tool-button--danger scenes-panel__hotspot-delete-button"
          disabled={!hasSelectedHotspot}
          title="Delete the currently selected hotspot or linked inventory placement from this scene. Shortcut: Delete."
          onClick={onDeleteSelectedHotspot}
        >
          <SceneActionIcon kind="delete" />
          Delete
        </button>
      </div>
      {!hasBackground ? (
        <p className="muted scenes-panel__background-dropzone-hint">
          Drop image or video on the preview to assign a background to this scene.
        </p>
      ) : null}
    </aside>
  );
}

import { useState } from "react";
import { type Asset, type ProjectBundle } from "@mage2/schema";
import { useDialogs } from "../dialogs";
import { getLocalizedAssetVariant } from "../localized-project";
import {
  classifyEditorAssetCategory,
  cloneProject,
  collectAssetReferenceSummary,
  countAssetReferences,
  evaluateAssetDeletion,
  removeAssetFromProject,
  type AssetReferenceSummary
} from "../project-helpers";
import { AssetPreview } from "../previews";
import { useEditorStore } from "../store";

interface AssetsPanelProps {
  project: ProjectBundle;
  setSavedProject: (project: ProjectBundle) => void;
  setStatusMessage: (message: string) => void;
  setBusyLabel: (label?: string) => void;
}

const EMPTY_ASSET_REFERENCE_SUMMARY: AssetReferenceSummary = {
  sceneBackgrounds: [],
  sceneAudioAssignments: [],
  inventoryImages: []
};

type AssetLibraryFilter = "background" | "inventory" | "sceneAudio";

export function resolveAssetCardPreviewPresentation(category: AssetLibraryFilter): {
  fit: "cover" | "contain";
} {
  return category === "inventory" ? { fit: "contain" } : { fit: "cover" };
}

export function AssetsPanel({
  project,
  setSavedProject,
  setStatusMessage,
  setBusyLabel
}: AssetsPanelProps) {
  const dialogs = useDialogs();
  const activeLocale = project.manifest.defaultLanguage;
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const setSelectedAssetId = useEditorStore((state) => state.setSelectedAssetId);
  const selectedAsset = project.assets.assets.find((asset) => asset.id === selectedAssetId);
  const assetReferenceSummaries = new Map(
    project.assets.assets.map((asset) => [asset.id, collectAssetReferenceSummary(project, asset.id)])
  );
  const assetDeletionEligibility = new Map(
    project.assets.assets.map((asset) => [asset.id, evaluateAssetDeletion(project, asset.id)])
  );
  const [assetFilter, setAssetFilter] = useState<AssetLibraryFilter>(
    selectedAsset ? classifyEditorAssetCategory(selectedAsset) : "background"
  );

  async function handleDeleteAsset(asset: Asset) {
    const projectDir = useEditorStore.getState().projectDir;
    if (!projectDir) {
      setStatusMessage("No project directory is currently open.");
      return;
    }

    const deletionEligibility = assetDeletionEligibility.get(asset.id);
    if (!deletionEligibility || !deletionEligibility.canDelete) {
      setStatusMessage(resolveDeleteBlockedMessage(asset.name, deletionEligibility?.blockedReason));
      return;
    }
    const referenceSummary = deletionEligibility.referenceSummary;
    const fallbackAsset = project.assets.assets.find((entry) => entry.id === deletionEligibility.fallbackAssetId);

    const confirmed = await dialogs.confirm({
      title: `Delete ${asset.name}?`,
      body: renderDeleteAssetConfirmation(asset.name, referenceSummary, fallbackAsset?.name),
      confirmLabel: "Delete Asset",
      cancelLabel: "Keep Asset",
      tone: "danger"
    });
    if (!confirmed) {
      return;
    }

    try {
      setBusyLabel("Deleting asset");
      const nextProject = cloneProject(project);
      const deletion = removeAssetFromProject(nextProject, asset.id);
      if (!deletion.deleted) {
        setStatusMessage(resolveDeleteBlockedMessage(asset.name, deletion.blockedReason));
        return;
      }

      const result = await window.editorApi.saveProject(projectDir, nextProject);
      let deletedSourceFileCount = 0;
      let deletedProxyFileCount = 0;
      let cleanupError: string | undefined;

      try {
        const cleanupResult = await window.editorApi.deleteManagedAssetFiles(
          projectDir,
          asset,
          result.project.assets.assets
        );
        deletedSourceFileCount = cleanupResult.deletedSourcePaths.length;
        deletedProxyFileCount = cleanupResult.deletedProxyPaths.length;
      } catch (error) {
        cleanupError = error instanceof Error ? error.message : String(error);
      }

      setSavedProject(result.project);
      setStatusMessage(
        resolveDeleteStatusMessage(
          asset.name,
          deletion,
          fallbackAsset?.name,
          deletedSourceFileCount,
          deletedProxyFileCount,
          cleanupError,
          result.validationReport.valid,
          result.validationReport.issues.length
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Delete failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }
  const visibleAssets = project.assets.assets.filter((asset) => classifyEditorAssetCategory(asset) === assetFilter);

  return (
    <div className="panel-grid panel-grid--assets">
      <section className="panel assets-panel">
        <div className="panel__toolbar">
          <div>
            <h3>Asset Library</h3>
            <p className="muted">Background and inventory media are created from their owning tabs, then managed here.</p>
          </div>
          <label className="assets-panel__filter">
            <span className="field-label--inset">Category</span>
            <select value={assetFilter} onChange={(event) => setAssetFilter(event.target.value as AssetLibraryFilter)}>
              <option value="background">Background</option>
              <option value="sceneAudio">Scene Audio</option>
              <option value="inventory">Inventory</option>
            </select>
          </label>
        </div>

        <div className="list-stack">
          <div className="asset-library-note">
              <strong>
              {assetFilter === "background"
                ? "Create new background assets from Scenes."
                : assetFilter === "sceneAudio"
                  ? "Create new scene audio assets from Scenes."
                  : "Create new inventory assets from Inventory."}
            </strong>
            <span>Use Localization to manage locale-specific variants after the asset exists.</span>
          </div>

          {visibleAssets.length > 0 ? visibleAssets.map((asset) => {
            const referenceSummary = assetReferenceSummaries.get(asset.id) ?? EMPTY_ASSET_REFERENCE_SUMMARY;
            const deletionEligibility = assetDeletionEligibility.get(asset.id);
            const deleteDisabled = !deletionEligibility?.canDelete;
            const activeVariant = getLocalizedAssetVariant(asset, activeLocale);
            const isSelected = selectedAssetId === asset.id;
            const assetCategory = classifyEditorAssetCategory(asset);
            const previewPresentation = resolveAssetCardPreviewPresentation(assetCategory);

            return (
              <article
                key={asset.id}
                className={isSelected ? "list-card list-card--asset list-card--selected" : "list-card list-card--asset"}
                onClick={() => setSelectedAssetId(asset.id)}
              >
                <AssetPreview
                  asset={asset}
                  locale={activeLocale}
                  allowSourceFallback
                  preferPosterForImages
                  fit={previewPresentation.fit}
                />

                <div className="asset-card__body">
                  <div>
                    <h4>{asset.name}</h4>
                    <p>
                      {formatAssetCategoryLabel(assetCategory)} /{" "}
                      {asset.kind}
                      {activeVariant?.durationMs ? ` / ${Math.round(activeVariant.durationMs / 100) / 10}s` : " / still"}
                      {activeVariant?.width && activeVariant?.height ? ` / ${activeVariant.width}x${activeVariant.height}` : ""}
                    </p>
                    <p className="muted">{formatAssetUsageSummary(referenceSummary)}</p>
                  </div>

                  <div className="list-card__actions">
                    <button
                      type="button"
                      className="button-danger"
                      disabled={deleteDisabled}
                      onClick={() => void handleDeleteAsset(asset)}
                      title={
                        deleteDisabled
                          ? resolveDeleteDisabledTitle(asset.name, deletionEligibility?.blockedReason)
                          : countAssetReferences(referenceSummary) > 0
                          ? `Delete ${asset.name} from the project and review its current usages before removal.`
                          : `Delete ${asset.name} from the project library.`
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          }) : (
            <p className="muted">{resolveEmptyLibraryMessage(assetFilter)}</p>
          )}
        </div>
      </section>

      <aside className="panel">
        <h3>Asset Roots</h3>
        <ul className="simple-list">
          {project.manifest.assetRoots.map((assetRoot) => (
            <li key={assetRoot}>{assetRoot}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function formatAssetUsageSummary(summary: AssetReferenceSummary): string {
  const segments: string[] = [];

  if (summary.sceneBackgrounds.length > 0) {
    segments.push(`${summary.sceneBackgrounds.length} scene background${summary.sceneBackgrounds.length === 1 ? "" : "s"}`);
  }

  if (summary.sceneAudioAssignments.length > 0) {
    segments.push(`${summary.sceneAudioAssignments.length} scene audio assignment${summary.sceneAudioAssignments.length === 1 ? "" : "s"}`);
  }

  if (summary.inventoryImages.length > 0) {
    segments.push(`${summary.inventoryImages.length} inventory image${summary.inventoryImages.length === 1 ? "" : "s"}`);
  }

  return segments.length > 0 ? `In use by ${joinList(segments)}.` : "Not currently in use.";
}

function renderDeleteAssetConfirmation(assetName: string, summary: AssetReferenceSummary, fallbackAssetName?: string) {
  if (countAssetReferences(summary) === 0) {
    return (
      <>
        <p>{`Delete "${assetName}" from the project library?`}</p>
        <div className="dialog-callout">
          <strong>No in-project references found</strong>
          <p>
            This removes the asset from MAGE2, deletes any generated proxy files, deletes its project copy from this
            project's assets folder when applicable, and leaves the original import source untouched.
          </p>
        </div>
      </>
    );
  }

  const consequences: string[] = [];
  if (summary.sceneBackgrounds.length > 0 && fallbackAssetName) {
    consequences.push(`Affected scene backgrounds will switch to "${fallbackAssetName}".`);
  }
  if (summary.sceneAudioAssignments.length > 0) {
    consequences.push("Affected scene audio assignments will be cleared.");
  }
  consequences.push("Any generated proxy files will be deleted.");
  consequences.push("If this asset was copied into the project's assets folder, that project copy will be deleted.");
  consequences.push("The original import source file on disk will not be deleted.");

  return (
    <>
      <p>{`Delete "${assetName}" from the project library?`}</p>
        <div className="dialog-callout">
          <strong>Currently in use by</strong>
          <ul className="dialog-detail-list">
          {summary.sceneBackgrounds.length > 0 ? (
            <li>
              {`Scene background${summary.sceneBackgrounds.length === 1 ? "" : "s"}: ${summary.sceneBackgrounds
                .map((entry) => entry.sceneName)
                .join(", ")}`}
            </li>
          ) : null}
          {summary.sceneAudioAssignments.length > 0 ? (
            <li>
              {`Scene audio assignment${summary.sceneAudioAssignments.length === 1 ? "" : "s"}: ${summary.sceneAudioAssignments
                .map((entry) => entry.sceneName)
                .join(", ")}`}
            </li>
          ) : null}
          {summary.inventoryImages.length > 0 ? (
            <li>
              {`Inventory image${summary.inventoryImages.length === 1 ? "" : "s"}: ${summary.inventoryImages
                .map((entry) => entry.itemName)
                .join(", ")}`}
            </li>
          ) : null}
        </ul>
      </div>
      <div className="dialog-callout dialog-callout--danger">
        <strong>What happens next</strong>
        <ul className="dialog-detail-list">
          {consequences.map((consequence) => (
            <li key={consequence}>{consequence}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

function resolveDeleteBlockedMessage(
  assetName: string,
  blockedReason: ReturnType<typeof removeAssetFromProject>["blockedReason"] | undefined
): string {
  if (blockedReason === "background-in-use-without-replacement") {
    return `Cannot delete ${assetName} because it is still used as a scene background and there is no replacement asset available.`;
  }

  if (blockedReason === "inventory-image-in-use") {
    return `Cannot delete ${assetName} because one or more inventory items still reference it.`;
  }

  return `${assetName} could not be deleted because it is no longer present in the project.`;
}

function resolveDeleteDisabledTitle(
  assetName: string,
  blockedReason: ReturnType<typeof removeAssetFromProject>["blockedReason"] | undefined
): string {
  if (blockedReason === "background-in-use-without-replacement") {
    return `${assetName} cannot be deleted until another asset is available to replace its scene background usage.`;
  }

  if (blockedReason === "inventory-image-in-use") {
    return `${assetName} cannot be deleted until it is removed from every inventory item that references it.`;
  }

  return `${assetName} could not be deleted because it is no longer present in the project.`;
}

function resolveDeleteStatusMessage(
  assetName: string,
  deletion: ReturnType<typeof removeAssetFromProject>,
  fallbackAssetName: string | undefined,
  deletedSourceFileCount: number,
  deletedProxyFileCount: number,
  cleanupError: string | undefined,
  valid: boolean,
  issueCount: number
): string {
  const segments = [`Deleted ${assetName}.`];

  if (deletion.referenceSummary.sceneBackgrounds.length > 0 && fallbackAssetName) {
    segments.push(
      `Reassigned ${deletion.referenceSummary.sceneBackgrounds.length} scene background${
        deletion.referenceSummary.sceneBackgrounds.length === 1 ? "" : "s"
      } to ${fallbackAssetName}.`
    );
  }

  if (deletion.referenceSummary.sceneAudioAssignments.length > 0) {
    segments.push(
      `Cleared ${deletion.referenceSummary.sceneAudioAssignments.length} scene audio assignment${
        deletion.referenceSummary.sceneAudioAssignments.length === 1 ? "" : "s"
      }.`
    );
  }

  if (deletedSourceFileCount > 0) {
    segments.push(`Deleted ${deletedSourceFileCount} project asset file${deletedSourceFileCount === 1 ? "" : "s"}.`);
  }

  if (deletedProxyFileCount > 0) {
    segments.push(`Deleted ${deletedProxyFileCount} generated proxy file${deletedProxyFileCount === 1 ? "" : "s"}.`);
  }

  if (!valid) {
    segments.push(`Saved with ${issueCount} validation issue(s).`);
  }

  if (cleanupError) {
    segments.push(`Asset file cleanup failed: ${cleanupError}`);
  }

  return segments.join(" ");
}

function joinList(values: string[]): string {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function resolveEmptyLibraryMessage(filter: AssetLibraryFilter): string {
  switch (filter) {
    case "background":
      return "No background assets yet. Upload a background from the Scenes tab to add one here.";
    case "sceneAudio":
      return "No scene audio assets yet. Upload scene audio from the Scenes tab to add one here.";
    case "inventory":
      return "No inventory assets yet. Upload an inventory image from the Inventory tab to add one here.";
  }
}

function formatAssetCategoryLabel(category: AssetLibraryFilter): string {
  switch (category) {
    case "background":
      return "Background";
    case "sceneAudio":
      return "Scene Audio";
    case "inventory":
      return "Inventory";
  }
}

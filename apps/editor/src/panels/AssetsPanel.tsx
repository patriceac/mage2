import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import {
  resolveAssetVariant,
  type Asset,
  type AssetCategory,
  type AssetVariant,
  type ProjectBundle
} from "@mage2/schema";
import {
  BACKGROUND_IMPORT_EXTENSIONS,
  IMAGE_IMPORT_EXTENSIONS,
  INVENTORY_IMAGE_EXTENSIONS,
  isSceneAudioImportPath,
  SCENE_AUDIO_IMPORT_EXTENSIONS,
  SUPPORTED_ASSET_EXTENSIONS,
  VIDEO_IMPORT_EXTENSIONS
} from "../asset-file-types";
import { useDialogs } from "../dialogs";
import {
  getLocalizedAssetVariant,
  getLocaleCompletenessStatus,
  getSupportedProjectLocales
} from "../localized-project";
import {
  addAssetRoots,
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

type AssetLibraryFilter = "all" | "background" | "inventory" | "sceneAudio";
type AssetViewMode = "grid" | "list";

interface AssetRowModel {
  asset: Asset;
  category: AssetCategory;
  activeVariant?: AssetVariant;
  referenceSummary: AssetReferenceSummary;
  usageCount: number;
  variantCount: number;
  missingVariantCount: number;
  canDelete: boolean;
  blockedReason?: ReturnType<typeof removeAssetFromProject>["blockedReason"];
}

const CATEGORY_TABS: Array<{
  id: AssetLibraryFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "background", label: "Backgrounds" },
  { id: "sceneAudio", label: "Scene Audio" },
  { id: "inventory", label: "Inventory" }
];

const ASSET_GROUPS: Array<{
  id: AssetCategory;
  label: string;
  icon: IconName;
}> = [
  { id: "background", label: "Backgrounds", icon: "image" },
  { id: "sceneAudio", label: "Scene Audio", icon: "waveform" },
  { id: "inventory", label: "Inventory", icon: "box" }
];

export function resolveAssetCardPreviewPresentation(category: AssetLibraryFilter): {
  fit: "cover" | "contain";
} {
  return category === "inventory" ? { fit: "contain" } : { fit: "cover" };
}

export function resolveAssetLibraryKeyboardSelection(
  key: string,
  groupedAssetIds: string[][],
  selectedAssetId?: string,
  pageSize = 1
): string | undefined {
  if (!["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(key)) {
    return undefined;
  }

  const orderedAssetIds = groupedAssetIds.flat();
  if (orderedAssetIds.length === 0) {
    return undefined;
  }

  const selectedIndex = selectedAssetId ? orderedAssetIds.indexOf(selectedAssetId) : -1;
  if (key === "Home") {
    return orderedAssetIds[0];
  }

  if (key === "End") {
    return orderedAssetIds[orderedAssetIds.length - 1];
  }

  if (selectedIndex < 0) {
    return key === "ArrowDown" || key === "PageDown" ? orderedAssetIds[0] : orderedAssetIds[orderedAssetIds.length - 1];
  }

  const resolvedPageSize = Math.max(1, Math.floor(pageSize));
  const offset =
    key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : key === "PageDown" ? resolvedPageSize : -resolvedPageSize;
  const nextIndex = Math.max(0, Math.min(orderedAssetIds.length - 1, selectedIndex + offset));
  return orderedAssetIds[nextIndex];
}

export function AssetsPanel({
  project,
  setSavedProject,
  setStatusMessage,
  setBusyLabel
}: AssetsPanelProps) {
  const dialogs = useDialogs();
  const activeLocale = project.manifest.defaultLanguage;
  const supportedLocales = useMemo(() => getSupportedProjectLocales(project), [project]);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const setSelectedAssetId = useEditorStore((state) => state.setSelectedAssetId);
  const [assetFilter, setAssetFilter] = useState<AssetLibraryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<AssetViewMode>("grid");

  const assetRows = useMemo<AssetRowModel[]>(() => {
    return project.assets.assets.map((asset) => {
      const category = classifyEditorAssetCategory(asset);
      const referenceSummary = collectAssetReferenceSummary(project, asset.id);
      const deletionEligibility = evaluateAssetDeletion(project, asset.id);
      const completeness = getLocaleCompletenessStatus(asset, supportedLocales);
      return {
        asset,
        category,
        activeVariant: getLocalizedAssetVariant(asset, activeLocale),
        referenceSummary,
        usageCount: countAssetReferences(referenceSummary),
        variantCount: completeness.present.length,
        missingVariantCount: completeness.missing.length,
        canDelete: deletionEligibility.canDelete,
        blockedReason: deletionEligibility.blockedReason
      };
    });
  }, [activeLocale, project, supportedLocales]);

  const visibleRows = assetRows.filter((row) => {
    if (assetFilter !== "all" && row.category !== assetFilter) {
      return false;
    }

    return matchesAssetSearch(row, searchQuery);
  });
  const selectedRow =
    visibleRows.find((row) => row.asset.id === selectedAssetId) ??
    assetRows.find((row) => row.asset.id === selectedAssetId) ??
    visibleRows[0] ??
    assetRows[0];
  const selectedAsset = selectedRow?.asset;
  const selectedVariant = selectedRow?.activeVariant;
  const categoryCounts = calculateCategoryCounts(assetRows);
  const assetTotals = calculateAssetTotals(assetRows);
  const groupedRows = ASSET_GROUPS.map((group) => ({
    ...group,
    rows: visibleRows.filter((row) => row.category === group.id)
  })).filter((group) => group.rows.length > 0 || assetFilter === group.id);

  function handleFilterChange(nextFilter: AssetLibraryFilter) {
    setAssetFilter(nextFilter);
    const nextSelectedRow =
      assetRows.find((row) => nextFilter === "all" || row.category === nextFilter) ?? assetRows[0];
    if (nextSelectedRow) {
      setSelectedAssetId(nextSelectedRow.asset.id);
    }
  }

  async function handleImportAsset() {
    const projectDir = useEditorStore.getState().projectDir;
    if (!projectDir) {
      setStatusMessage("No project directory is currently open.");
      return;
    }

    const filePaths = await dialogs.pickFiles({
      title: resolveImportDialogTitle(assetFilter),
      description: resolveImportDialogDescription(assetFilter),
      initialPath: projectDir,
      confirmLabel: "Import Asset",
      allowedExtensions: [...resolveImportExtensions(assetFilter)]
    });
    if (filePaths.length === 0) {
      return;
    }

    const groupedFilePaths = groupImportPathsByCategory(filePaths, assetFilter);
    const rejectedFileCount = filePaths.length - Object.values(groupedFilePaths).reduce((total, paths) => total + paths.length, 0);

    try {
      setBusyLabel("Importing assets");
      const importedAssets: Asset[] = [];
      const duplicateAssets: Array<{ filePath: string; assetId: string }> = [];
      const duplicateFilePaths: string[] = [];

      for (const [category, paths] of Object.entries(groupedFilePaths) as Array<[AssetCategory, string[]]>) {
        if (paths.length === 0) {
          continue;
        }

        const result = await window.editorApi.importAssets(projectDir, activeLocale, project.assets.assets, paths, category);
        importedAssets.push(...result.importedAssets);
        duplicateAssets.push(...result.duplicateAssets);
        duplicateFilePaths.push(...result.duplicateFilePaths);
      }

      if (importedAssets.length === 0) {
        const duplicateSegment =
          duplicateAssets.length > 0 || duplicateFilePaths.length > 0
            ? `${duplicateAssets.length + duplicateFilePaths.length} duplicate file${duplicateAssets.length + duplicateFilePaths.length === 1 ? "" : "s"} skipped.`
            : "No new asset was created.";
        const rejectedSegment =
          rejectedFileCount > 0 ? ` ${rejectedFileCount} unsupported file${rejectedFileCount === 1 ? "" : "s"} skipped.` : "";
        setStatusMessage(`${duplicateSegment}${rejectedSegment}`);
        return;
      }

      const nextProject = cloneProject(project);
      addAssetRoots(nextProject, importedAssets);
      nextProject.assets.assets.push(...importedAssets);
      const saveResult = await window.editorApi.saveProject(projectDir, nextProject);
      setSavedProject(saveResult.project);
      const firstImportedAsset = importedAssets[0];
      if (firstImportedAsset) {
        setSelectedAssetId(firstImportedAsset.id);
      }

      const skippedCount = duplicateAssets.length + duplicateFilePaths.length + rejectedFileCount;
      setStatusMessage(
        `Imported ${importedAssets.length} asset${importedAssets.length === 1 ? "" : "s"}.${skippedCount > 0 ? ` Skipped ${skippedCount} file${skippedCount === 1 ? "" : "s"}.` : ""}${
          saveResult.validationReport.valid
            ? ""
            : ` Saved with ${saveResult.validationReport.issues.length} validation issue(s).`
        }`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Asset import failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  async function handleRevealSelectedAsset() {
    const targetPath = resolveAssetRevealPath(selectedVariant);
    if (!targetPath) {
      setStatusMessage("No source path is available for this asset.");
      return;
    }

    try {
      await window.editorApi.revealPath(targetPath);
      setStatusMessage(`Revealed ${selectedAsset?.name ?? "asset"} in the file browser.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Could not reveal asset: ${message}`);
    }
  }

  async function handleReplaceSelectedAsset() {
    if (!selectedAsset || !selectedRow) {
      setStatusMessage("Select an asset before replacing its source.");
      return;
    }

    const projectDir = useEditorStore.getState().projectDir;
    if (!projectDir) {
      setStatusMessage("No project directory is currently open.");
      return;
    }

    const filePaths = await dialogs.pickFiles({
      title: `Replace Source for ${selectedAsset.name}`,
      description: `Choose a replacement ${selectedAsset.kind} file for the ${activeLocale} variant.`,
      initialPath: projectDir,
      confirmLabel: "Replace Source",
      allowedExtensions: [...resolveAssetVariantImportExtensions(selectedAsset, selectedRow.category)]
    });
    const filePath = filePaths[0];
    if (!filePath) {
      return;
    }

    try {
      setBusyLabel("Replacing asset source");
      const updatedAsset = await window.editorApi.importAssetVariant(projectDir, selectedAsset, activeLocale, filePath);
      const nextProject = cloneProject(project);
      const targetAssetIndex = nextProject.assets.assets.findIndex((entry) => entry.id === selectedAsset.id);
      if (targetAssetIndex < 0) {
        setStatusMessage(`${selectedAsset.name} could not be replaced because it is no longer present in the project.`);
        return;
      }

      nextProject.assets.assets[targetAssetIndex] = updatedAsset;
      addAssetRoots(nextProject, [updatedAsset]);
      const saveResult = await window.editorApi.saveProject(projectDir, nextProject);
      setSavedProject(saveResult.project);
      setSelectedAssetId(updatedAsset.id);
      setStatusMessage(
        `Replaced ${updatedAsset.name} source for ${activeLocale}.${
          saveResult.validationReport.valid
            ? ""
            : ` Saved with ${saveResult.validationReport.issues.length} validation issue(s).`
        }`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Replace source failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  async function handleDeleteAsset(asset: Asset) {
    const projectDir = useEditorStore.getState().projectDir;
    if (!projectDir) {
      setStatusMessage("No project directory is currently open.");
      return;
    }

    const deletionEligibility = evaluateAssetDeletion(project, asset.id);
    if (!deletionEligibility.canDelete) {
      setStatusMessage(resolveDeleteBlockedMessage(asset.name, deletionEligibility.blockedReason));
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
      const nextSelectedAsset = result.project.assets.assets.find((entry) => entry.id !== asset.id);
      setSelectedAssetId(nextSelectedAsset?.id);
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

  function navigateToUsage(usage: AssetUsageModel) {
    if (usage.kind === "inventory") {
      useEditorStore.getState().setSelectedInventoryItemId(usage.id);
      useEditorStore.getState().setActiveTab("inventory");
      return;
    }

    useEditorStore.getState().setSelectedSceneId(usage.id);
    useEditorStore.getState().setActiveTab("scenes");
  }

  return (
    <div className="assets-workbench-page">
      <div className="assets-command-bar" aria-label="Asset library controls">
        <div className="assets-category-tabs" aria-label="Category">
          <span>Category:</span>
          {CATEGORY_TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={assetFilter === tab.id ? "assets-category-tab assets-category-tab--active" : "assets-category-tab"}
              onClick={() => handleFilterChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <label className="assets-search-field">
          <Icon name="search" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search assets..."
          />
          <kbd>Ctrl+F</kbd>
        </label>

        <div className="assets-view-switch" aria-label="Asset view">
          <button
            type="button"
            className={viewMode === "grid" ? "assets-icon-button assets-icon-button--active" : "assets-icon-button"}
            onClick={() => setViewMode("grid")}
            title="Grid view"
          >
            <Icon name="grid" />
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "assets-icon-button assets-icon-button--active" : "assets-icon-button"}
            onClick={() => setViewMode("list")}
            title="List view"
          >
            <Icon name="list" />
          </button>
        </div>

        <button type="button" className="assets-import-button" onClick={() => void handleImportAsset()}>
          <Icon name="upload" />
          <span>Import Asset</span>
        </button>

        <span className="assets-total-count">
          {project.assets.assets.length} asset{project.assets.assets.length === 1 ? "" : "s"}
        </span>
      </div>

      <section className="assets-workbench" aria-label="Assets workbench">
        <AssetBrowser
          activeLocale={activeLocale}
          categoryCounts={categoryCounts}
          groupedRows={groupedRows}
          selectedAssetId={selectedAsset?.id}
          viewMode={viewMode}
          visibleCount={visibleRows.length}
          totalCount={assetRows.length}
          onSelectAsset={setSelectedAssetId}
          onDeleteAsset={(asset) => void handleDeleteAsset(asset)}
        />

        <AssetInspector
          activeLocale={activeLocale}
          assetRow={selectedRow}
          defaultLocale={project.manifest.defaultLanguage}
          locales={supportedLocales}
          onReplaceSelectedAsset={() => void handleReplaceSelectedAsset()}
          onRevealSelectedAsset={() => void handleRevealSelectedAsset()}
          onDeleteAsset={(asset) => void handleDeleteAsset(asset)}
        />

        <AssetUsageRail
          assetRow={selectedRow}
          project={project}
          onNavigateToUsage={navigateToUsage}
          onFindUnused={() => {
            const unusedRow = assetRows.find((row) => row.usageCount === 0);
            if (unusedRow) {
              setSelectedAssetId(unusedRow.asset.id);
              setStatusMessage(`Selected unused asset ${unusedRow.asset.name}.`);
            } else {
              setStatusMessage("No unused assets found.");
            }
          }}
          onReviewMissingVariants={() => {
            const missingVariantRow = assetRows.find((row) => row.missingVariantCount > 0);
            if (missingVariantRow) {
              setSelectedAssetId(missingVariantRow.asset.id);
              setStatusMessage(`Selected ${missingVariantRow.asset.name}, which is missing localized variants.`);
            } else {
              setStatusMessage("No missing asset variants found.");
            }
          }}
        />
      </section>

      <footer className="assets-status-footer" aria-label="Asset summary">
        <span>
          <span className="assets-footer-locale-icon" aria-hidden="true">
            <Icon name="globe" />
          </span>
          {activeLocale === project.manifest.defaultLanguage ? "Project default locale" : "Editing locale"}: {activeLocale}
          {activeLocale === project.manifest.defaultLanguage ? null : (
            <span className="assets-footer-locale-source">Project default: {project.manifest.defaultLanguage}</span>
          )}
        </span>
        <span>Total Assets: {assetTotals.total}</span>
        <span>In Use: {assetTotals.inUse}</span>
        <span>Unused: {assetTotals.unused}</span>
        <span>Missing Variants: {assetTotals.missingVariants}</span>
        <span>Disk Usage: {formatTotalKnownBytes(assetRows)}</span>
        <span className="assets-footer-save-state">
          <Icon name="check" />
          Auto-saved
        </span>
      </footer>
    </div>
  );
}

function AssetBrowser({
  activeLocale,
  categoryCounts,
  groupedRows,
  selectedAssetId,
  viewMode,
  visibleCount,
  totalCount,
  onSelectAsset,
  onDeleteAsset
}: {
  activeLocale: string;
  categoryCounts: Record<AssetCategory, number>;
  groupedRows: Array<{
    id: AssetCategory;
    label: string;
    icon: IconName;
    rows: AssetRowModel[];
  }>;
  selectedAssetId?: string;
  viewMode: AssetViewMode;
  visibleCount: number;
  totalCount: number;
  onSelectAsset: (assetId: string) => void;
  onDeleteAsset: (asset: Asset) => void;
}) {
  const selectedRowElementRef = useRef<HTMLElement | null>(null);
  const shouldFocusSelectedRowRef = useRef(false);
  const groupedAssetIds = groupedRows.map((group) => group.rows.map((row) => row.asset.id));

  useEffect(() => {
    if (!shouldFocusSelectedRowRef.current) {
      return;
    }

    shouldFocusSelectedRowRef.current = false;
    selectedRowElementRef.current?.focus({ preventScroll: true });
    selectedRowElementRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedAssetId]);

  function handleAssetListKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    const nextAssetId = resolveAssetLibraryKeyboardSelection(
      event.key,
      groupedAssetIds,
      selectedAssetId,
      resolveVisibleAssetRowCount(event.currentTarget)
    );
    if (!nextAssetId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    shouldFocusSelectedRowRef.current = true;
    if (nextAssetId === selectedAssetId) {
      shouldFocusSelectedRowRef.current = false;
      selectedRowElementRef.current?.focus({ preventScroll: true });
      return;
    }

    onSelectAsset(nextAssetId);
  }

  return (
    <section className="assets-browser panel" aria-label="Asset Library">
      <div className={viewMode === "list" ? "assets-browser__header assets-browser__header--list" : "assets-browser__header"}>
        <h3>
          <Icon name="image" />
          Asset Library
        </h3>
        <span>Usage</span>
        <span>Variants</span>
      </div>

      <div
        className={viewMode === "grid" ? "assets-browser__list assets-browser__list--grid" : "assets-browser__list"}
        onKeyDown={handleAssetListKeyDown}
      >
        {groupedRows.length > 0 ? (
          groupedRows.map((group) => (
            <div className="assets-group" key={group.id}>
              <div className={`assets-group__heading assets-group__heading--${group.id}`}>
                <Icon name={group.icon} />
                <span>
                  {group.label} ({categoryCounts[group.id]})
                </span>
              </div>
              {group.rows.length > 0 ? (
                group.rows.map((row) => (
                  <AssetBrowserRow
                    activeLocale={activeLocale}
                    key={row.asset.id}
                    row={row}
                    selected={selectedAssetId === row.asset.id}
                    rowRef={selectedAssetId === row.asset.id ? (node) => {
                      if (node) {
                        selectedRowElementRef.current = node;
                      }
                    } : undefined}
                    viewMode={viewMode}
                    onSelectAsset={onSelectAsset}
                    onDeleteAsset={onDeleteAsset}
                  />
                ))
              ) : (
                <p className="assets-browser__empty">No assets in this category.</p>
              )}
            </div>
          ))
        ) : (
          <p className="assets-browser__empty">No assets match the current search.</p>
        )}
      </div>

      <div className="assets-browser__pagination">
        <span>
          {visibleCount === 0 ? "0" : "1"}-{visibleCount} of {totalCount} assets
        </span>
        <div>
          <button type="button" disabled title="Previous page">
            <Icon name="chevronLeft" />
          </button>
          <button type="button" className="assets-page-button assets-page-button--active">
            1
          </button>
          <button type="button" disabled title="Next page">
            <Icon name="chevronRight" />
          </button>
        </div>
      </div>
    </section>
  );
}

function resolveVisibleAssetRowCount(container: HTMLElement): number {
  const containerBounds = container.getBoundingClientRect();
  const visibleRowCount = Array.from(container.querySelectorAll<HTMLElement>(".assets-browser-row")).filter((row) => {
    const rowBounds = row.getBoundingClientRect();
    return rowBounds.bottom > containerBounds.top && rowBounds.top < containerBounds.bottom;
  }).length;

  return Math.max(1, visibleRowCount);
}

function AssetBrowserRow({
  activeLocale,
  row,
  selected,
  rowRef,
  viewMode,
  onSelectAsset,
  onDeleteAsset
}: {
  activeLocale: string;
  row: AssetRowModel;
  selected: boolean;
  rowRef?: (node: HTMLElement | null) => void;
  viewMode: AssetViewMode;
  onSelectAsset: (assetId: string) => void;
  onDeleteAsset: (asset: Asset) => void;
}) {
  const previewPresentation = resolveAssetCardPreviewPresentation(row.category);
  const usageLabel = formatUsageCountLabel(row.referenceSummary);
  const dimensionLabel = formatAssetDimensions(row.activeVariant);
  const durationLabel = formatAssetDuration(row.activeVariant);
  const metadata = [row.asset.kind, dimensionLabel, durationLabel].filter(Boolean).join(" / ");

  return (
    <article
      className={[
        "assets-browser-row",
        selected ? "assets-browser-row--selected" : "",
        viewMode === "list" ? "assets-browser-row--list" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      data-asset-row-id={row.asset.id}
      onClick={() => onSelectAsset(row.asset.id)}
      ref={rowRef}
      tabIndex={selected ? 0 : -1}
    >
      <div className="assets-browser-row__preview">
        <AssetPreview
          asset={row.asset}
          locale={activeLocale}
          allowSourceFallback
          preferPosterForImages
          fit={previewPresentation.fit}
        />
      </div>
      <div className="assets-browser-row__identity">
        <strong>{row.asset.name}</strong>
        <span>{metadata || row.asset.kind}</span>
      </div>
      <div className="assets-browser-row__usage">
        <strong>{row.usageCount}</strong>
        <span>{usageLabel}</span>
      </div>
      <div className="assets-browser-row__variants">
        <span className={row.missingVariantCount > 0 ? "assets-variant-dot assets-variant-dot--missing" : "assets-variant-dot"} />
        <strong>{row.variantCount}</strong>
      </div>
      <button
        type="button"
        className={row.canDelete ? "assets-delete-status assets-delete-status--available" : "assets-delete-status"}
        onClick={(event) => {
          event.stopPropagation();
          if (row.canDelete) {
            onDeleteAsset(row.asset);
          }
        }}
        disabled={!row.canDelete}
        title={
          row.canDelete
            ? `Delete ${row.asset.name}.`
            : resolveDeleteDisabledTitle(row.asset.name, row.blockedReason)
        }
        aria-label={row.canDelete ? `Delete ${row.asset.name}` : resolveDeleteDisabledTitle(row.asset.name, row.blockedReason)}
      >
        <Icon name="trash" />
      </button>
    </article>
  );
}

function AssetInspector({
  activeLocale,
  assetRow,
  defaultLocale,
  locales,
  onReplaceSelectedAsset,
  onRevealSelectedAsset,
  onDeleteAsset
}: {
  activeLocale: string;
  assetRow?: AssetRowModel;
  defaultLocale: string;
  locales: string[];
  onReplaceSelectedAsset: () => void;
  onRevealSelectedAsset: () => void;
  onDeleteAsset: (asset: Asset) => void;
}) {
  if (!assetRow) {
    return (
      <section className="assets-inspector panel assets-inspector--empty" aria-label="Selected asset">
        <h3>No asset selected</h3>
        <p>Import media from the asset browser to inspect it here.</p>
      </section>
    );
  }

  const { asset, activeVariant, category } = assetRow;
  const hasRevealPath = Boolean(resolveAssetRevealPath(activeVariant));

  return (
    <section className="assets-inspector panel" aria-label={`Selected asset ${asset.name}`}>
      <div className="assets-inspector__title-row">
        <h3>{asset.name}</h3>
        <button type="button" title="Copy asset id" onClick={() => void navigator.clipboard?.writeText(asset.id)}>
          <Icon name="copy" />
        </button>
      </div>

      <div className="assets-chip-row" aria-label="Asset status">
        <span className={`assets-chip assets-chip--${category}`}>{formatAssetCategoryLabel(category)}</span>
        <span className="assets-chip assets-chip--info">{assetRow.usageCount > 0 ? "In use" : "Unused"}</span>
        <span className={assetRow.missingVariantCount > 0 ? "assets-chip assets-chip--warning" : "assets-chip assets-chip--ok"}>
          {assetRow.variantCount} variant{assetRow.variantCount === 1 ? "" : "s"}
        </span>
        <span className={activeVariant ? "assets-chip assets-chip--ok" : "assets-chip assets-chip--danger"}>
          {activeVariant ? "Source OK" : "Missing source"}
        </span>
      </div>

      <div className="assets-preview-stage">
        <AssetPreview
          asset={asset}
          locale={activeLocale}
          allowSourceFallback
          preferPosterForImages
          fit={category === "inventory" ? "contain" : "cover"}
        />
      </div>
      <p className="assets-preview-caption">
        {[formatAssetDimensions(activeVariant), asset.kind.toUpperCase(), formatAssetDuration(activeVariant)]
          .filter(Boolean)
          .join("  -  ") || "No preview metadata"}
      </p>

      <section className="assets-metadata-panel" aria-label="Metadata">
        <h4>Metadata</h4>
        <dl>
          <div>
            <dt>Kind</dt>
            <dd>{asset.kind}</dd>
          </div>
          <div>
            <dt>Dimensions</dt>
            <dd>{formatAssetDimensions(activeVariant) || "-"}</dd>
          </div>
          <div>
            <dt>Original Path</dt>
            <dd title={activeVariant?.importSourcePath ?? activeVariant?.sourcePath}>
              {activeVariant?.importSourcePath ?? activeVariant?.sourcePath ?? "-"}
            </dd>
          </div>
          <div>
            <dt>Imported</dt>
            <dd>{formatImportedAt(activeVariant?.importedAt)}</dd>
          </div>
          <div>
            <dt>File Hash (SHA-256)</dt>
            <dd title={activeVariant?.sha256}>{activeVariant?.sha256 ?? "-"}</dd>
          </div>
        </dl>
      </section>

      <section className="assets-variants-panel" aria-label="Localized Variants">
        <h4>Localized Variants</h4>
        <table>
          <thead>
            <tr>
              <th>Locale</th>
              <th>Status</th>
              <th>Source</th>
              <th>Imported</th>
            </tr>
          </thead>
          <tbody>
            {locales.map((locale) => {
              const variant = resolveAssetVariant(asset, locale);
              const isDefault = locale === defaultLocale;
              return (
                <tr key={locale}>
                  <td>
                    {locale}
                    {isDefault ? <span>Project default</span> : null}
                  </td>
                  <td>
                    <span className={variant ? "assets-status-label assets-status-label--present" : "assets-status-label assets-status-label--missing"}>
                      {variant ? "Present" : "Missing"}
                    </span>
                  </td>
                  <td title={variant?.sourcePath}>{variant?.sourcePath ? formatPathTail(variant.sourcePath) : "-"}</td>
                  <td>{formatImportedAt(variant?.importedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="assets-inspector__actions">
        <button type="button" className="assets-action-button assets-action-button--primary" onClick={onReplaceSelectedAsset}>
          <Icon name="refresh" />
          <span>Replace Source</span>
        </button>
        <button type="button" className="assets-action-button" onClick={onRevealSelectedAsset} disabled={!hasRevealPath}>
          <Icon name="folderOpen" />
          <span>Reveal in Folder</span>
        </button>
        <button
          type="button"
          className="assets-action-button assets-action-button--danger"
          onClick={() => onDeleteAsset(asset)}
          disabled={!assetRow.canDelete}
          title={assetRow.canDelete ? `Delete ${asset.name}.` : resolveDeleteDisabledTitle(asset.name, assetRow.blockedReason)}
        >
          <Icon name="trash" />
          <span>Delete</span>
        </button>
      </div>
    </section>
  );
}

function AssetUsageRail({
  assetRow,
  project,
  onNavigateToUsage,
  onFindUnused,
  onReviewMissingVariants
}: {
  assetRow?: AssetRowModel;
  project: ProjectBundle;
  onNavigateToUsage: (usage: AssetUsageModel) => void;
  onFindUnused: () => void;
  onReviewMissingVariants: () => void;
}) {
  const usages = assetRow ? buildAssetUsageModels(assetRow.referenceSummary) : [];

  return (
    <aside className="assets-usage-rail panel" aria-label="Usage and Safety">
      <div className="assets-rail__header">
        <h3>Usage and Safety</h3>
      </div>

      <section className="assets-rail-section">
        <div className="assets-rail-section__title">
          <h4>Where Used</h4>
          <span>
            {usages.length} reference{usages.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="assets-usage-list">
          {usages.length > 0 ? (
            usages.map((usage) => (
              <div className="assets-usage-item" key={`${usage.kind}-${usage.id}`}>
                <Icon name={usage.kind === "inventory" ? "box" : "film"} />
                <div>
                  <strong>{usage.label}</strong>
                  <span>{usage.detail}</span>
                </div>
                <button type="button" onClick={() => onNavigateToUsage(usage)}>
                  {usage.actionLabel}
                </button>
              </div>
            ))
          ) : (
            <p className="assets-rail-empty">No project references found.</p>
          )}
        </div>
      </section>

      <section className={assetRow?.canDelete ? "assets-delete-safety assets-delete-safety--ok" : "assets-delete-safety"}>
        <h4>
          <Icon name="shield" />
          Delete Safety
        </h4>
        <strong>{assetRow?.canDelete ? "Safe to delete" : "Cannot delete this asset."}</strong>
        <p>{resolveDeleteSafetyMessage(assetRow)}</p>
      </section>

      <section className="assets-roots-panel">
        <h4>Asset Roots</h4>
        <ul>
          {project.manifest.assetRoots.length > 0 ? (
            project.manifest.assetRoots.map((assetRoot) => (
              <li key={assetRoot}>
                <Icon name="folder" />
                <span title={assetRoot}>{assetRoot}</span>
              </li>
            ))
          ) : (
            <li>
              <Icon name="folder" />
              <span>No asset roots yet</span>
            </li>
          )}
        </ul>
      </section>

      <section className="assets-quick-actions">
        <h4>Quick Actions</h4>
        <button type="button" onClick={onFindUnused}>
          <Icon name="search" />
          <span>Find Unused</span>
          <kbd>U</kbd>
        </button>
        <button type="button" onClick={onReviewMissingVariants}>
          <Icon name="warning" />
          <span>Review Missing Variants</span>
          <kbd>M</kbd>
        </button>
        <button type="button" disabled>
          <Icon name="upload" />
          <span>Import Translations...</span>
          <kbd>I</kbd>
        </button>
        <button type="button" disabled>
          <Icon name="download" />
          <span>Export Asset Manifest...</span>
          <kbd>E</kbd>
        </button>
      </section>
    </aside>
  );
}

interface AssetUsageModel {
  id: string;
  kind: "scene" | "inventory";
  label: string;
  detail: string;
  actionLabel: string;
}

function buildAssetUsageModels(summary: AssetReferenceSummary): AssetUsageModel[] {
  return [
    ...summary.sceneBackgrounds.map((entry) => ({
      id: entry.sceneId,
      kind: "scene" as const,
      label: entry.sceneName,
      detail: "Scene Background",
      actionLabel: "Open Scene"
    })),
    ...summary.sceneAudioAssignments.map((entry) => ({
      id: entry.sceneId,
      kind: "scene" as const,
      label: entry.sceneName,
      detail: "Scene Audio",
      actionLabel: "Open Scene"
    })),
    ...summary.inventoryImages.map((entry) => ({
      id: entry.itemId,
      kind: "inventory" as const,
      label: entry.itemName,
      detail: "Inventory Image",
      actionLabel: "Open Item"
    }))
  ];
}

function calculateCategoryCounts(rows: AssetRowModel[]): Record<AssetCategory, number> {
  return {
    background: rows.filter((row) => row.category === "background").length,
    sceneAudio: rows.filter((row) => row.category === "sceneAudio").length,
    inventory: rows.filter((row) => row.category === "inventory").length
  };
}

function calculateAssetTotals(rows: AssetRowModel[]) {
  return {
    total: rows.length,
    inUse: rows.filter((row) => row.usageCount > 0).length,
    unused: rows.filter((row) => row.usageCount === 0).length,
    missingVariants: rows.reduce((total, row) => total + row.missingVariantCount, 0)
  };
}

function matchesAssetSearch(row: AssetRowModel, searchQuery: string): boolean {
  const trimmedQuery = searchQuery.trim().toLowerCase();
  if (!trimmedQuery) {
    return true;
  }

  return [
    row.asset.id,
    row.asset.name,
    row.asset.kind,
    row.category,
    ...Object.values(row.asset.variants).flatMap((variant) => [
      variant.sourcePath,
      variant.importSourcePath ?? "",
      variant.sha256 ?? ""
    ])
  ].some((candidate) => candidate.toLowerCase().includes(trimmedQuery));
}

function resolveImportDialogTitle(filter: AssetLibraryFilter): string {
  switch (filter) {
    case "background":
      return "Import Background Assets";
    case "sceneAudio":
      return "Import Scene Audio Assets";
    case "inventory":
      return "Import Inventory Assets";
    case "all":
      return "Import Assets";
  }
}

function resolveImportDialogDescription(filter: AssetLibraryFilter): string {
  switch (filter) {
    case "background":
      return "Choose image or video files to add to the background asset library.";
    case "sceneAudio":
      return "Choose audio files to add to the scene audio asset library.";
    case "inventory":
      return "Choose image files to add to the inventory asset library.";
    case "all":
      return "Choose media files to add to the asset library. Audio imports as scene audio; image and video imports as backgrounds.";
  }
}

function resolveImportExtensions(filter: AssetLibraryFilter): readonly string[] {
  switch (filter) {
    case "background":
      return BACKGROUND_IMPORT_EXTENSIONS;
    case "sceneAudio":
      return SCENE_AUDIO_IMPORT_EXTENSIONS;
    case "inventory":
      return INVENTORY_IMAGE_EXTENSIONS;
    case "all":
      return SUPPORTED_ASSET_EXTENSIONS;
  }
}

function resolveAssetVariantImportExtensions(asset: Asset, category: AssetCategory): readonly string[] {
  if (asset.kind === "audio") {
    return SCENE_AUDIO_IMPORT_EXTENSIONS;
  }

  if (asset.kind === "video") {
    return VIDEO_IMPORT_EXTENSIONS;
  }

  return category === "inventory" ? INVENTORY_IMAGE_EXTENSIONS : IMAGE_IMPORT_EXTENSIONS;
}

function groupImportPathsByCategory(filePaths: string[], filter: AssetLibraryFilter): Record<AssetCategory, string[]> {
  const groupedPaths: Record<AssetCategory, string[]> = {
    background: [],
    sceneAudio: [],
    inventory: []
  };

  for (const filePath of filePaths) {
    if (filter === "background" || filter === "sceneAudio" || filter === "inventory") {
      groupedPaths[filter].push(filePath);
      continue;
    }

    groupedPaths[isSceneAudioImportPath(filePath) ? "sceneAudio" : "background"].push(filePath);
  }

  return groupedPaths;
}

function formatAssetCategoryLabel(category: AssetCategory): string {
  switch (category) {
    case "background":
      return "Background";
    case "sceneAudio":
      return "Scene Audio";
    case "inventory":
      return "Inventory";
  }
}

function formatUsageCountLabel(summary: AssetReferenceSummary): string {
  if (summary.sceneBackgrounds.length > 0) {
    return `scene${summary.sceneBackgrounds.length === 1 ? "" : "s"}`;
  }

  if (summary.sceneAudioAssignments.length > 0) {
    return `scene${summary.sceneAudioAssignments.length === 1 ? "" : "s"}`;
  }

  if (summary.inventoryImages.length > 0) {
    return `item${summary.inventoryImages.length === 1 ? "" : "s"}`;
  }

  return "unused";
}

function formatAssetDimensions(variant?: AssetVariant): string {
  return variant?.width && variant.height ? `${variant.width}x${variant.height}` : "";
}

function formatAssetDuration(variant?: AssetVariant): string {
  return variant?.durationMs ? `${Math.round(variant.durationMs / 100) / 10}s` : "";
}

function formatImportedAt(importedAt?: string): string {
  if (!importedAt) {
    return "-";
  }

  const parsedDate = new Date(importedAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return importedAt;
  }

  return `${parsedDate.toISOString().slice(0, 10)} ${parsedDate.toISOString().slice(11, 16)}`;
}

function formatPathTail(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/");
  const pieces = normalizedPath.split("/");
  return pieces.slice(-2).join("/");
}

function resolveAssetRevealPath(variant?: AssetVariant): string | undefined {
  return variant?.importSourcePath ?? variant?.sourcePath;
}

function formatTotalKnownBytes(rows: AssetRowModel[]): string {
  const knownBytes = rows.reduce((total, row) => {
    const rawSize = extractByteSizeFromAsset(row.asset);
    return rawSize ? total + rawSize : total;
  }, 0);

  return knownBytes > 0 ? formatBytes(knownBytes) : "Unknown";
}

function extractByteSizeFromAsset(asset: Asset): number | undefined {
  const values = Object.values(asset.variants) as Array<AssetVariant & { sizeBytes?: number }>;
  return values.find((variant) => typeof variant.sizeBytes === "number")?.sizeBytes;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }

  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

function resolveDeleteSafetyMessage(row?: AssetRowModel): string {
  if (!row) {
    return "Select an asset to review delete safety.";
  }

  if (row.canDelete && row.usageCount === 0) {
    return "This asset has no project references. Deleting it removes managed project copies and generated proxy files.";
  }

  if (row.canDelete) {
    return "This asset can be deleted. Current references will be cleared or reassigned using the existing project rules.";
  }

  if (row.blockedReason === "inventory-image-in-use") {
    return "This asset is used by an inventory item. Remove or replace that item image before deleting.";
  }

  if (row.blockedReason === "background-in-use-without-replacement") {
    return "This asset is used as a scene background and no replacement background asset is available.";
  }

  return "This asset cannot be deleted from the current project state.";
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

type IconName =
  | "box"
  | "check"
  | "chevronLeft"
  | "chevronRight"
  | "copy"
  | "download"
  | "film"
  | "folder"
  | "folderOpen"
  | "globe"
  | "grid"
  | "image"
  | "list"
  | "pin"
  | "refresh"
  | "search"
  | "shield"
  | "trash"
  | "upload"
  | "warning"
  | "waveform"
  | "x";

function Icon({ name }: { name: IconName }) {
  switch (name) {
    case "box":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8.2 12 4l8 4.2-8 4.1L4 8.2Z" />
          <path d="M4 8.2v7.6L12 20l8-4.2V8.2" />
          <path d="M12 12.3V20" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m5 12.5 4.2 4.1L19 7" />
        </svg>
      );
    case "chevronLeft":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m14.5 6-6 6 6 6" />
        </svg>
      );
    case "chevronRight":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9.5 6 6 6-6 6" />
        </svg>
      );
    case "copy":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="8" y="8" width="10" height="10" rx="2" />
          <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case "download":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v10" />
          <path d="m8 10 4 4 4-4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "film":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4" />
        </svg>
      );
    case "folder":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.5 7.5h6l2 2H20a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 20 18.5H4A1.5 1.5 0 0 1 2.5 17V9A1.5 1.5 0 0 1 4 7.5Z" />
        </svg>
      );
    case "folderOpen":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 18.5 5 9h5.4l1.8 2H21l-2 7.5H3Z" />
          <path d="M4.5 9V6.5h5.2l1.7 2H18V11" />
        </svg>
      );
    case "globe":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
          <path d="M3.6 9h16.8M3.6 15h16.8" />
          <path d="M12 3c2.3 2.4 3.5 5.4 3.5 9s-1.2 6.6-3.5 9c-2.3-2.4-3.5-5.4-3.5-9S9.7 5.4 12 3Z" />
        </svg>
      );
    case "grid":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <rect x="14" y="14" width="6" height="6" rx="1" />
        </svg>
      );
    case "image":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="m7 16 3.5-4 3 3.4 2-2.2L19 17" />
          <circle cx="9" cy="9" r="1.2" />
        </svg>
      );
    case "list":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 6h12M8 12h12M8 18h12" />
          <path d="M4 6h.1M4 12h.1M4 18h.1" />
        </svg>
      );
    case "pin":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m14 4 6 6-3 1-4 4v5l-2-2-2-2h5l4-4 1-3-6-6Z" />
          <path d="m4 20 6-6" />
        </svg>
      );
    case "refresh":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 6v5h-5" />
          <path d="M4 18v-5h5" />
          <path d="M18 11a6 6 0 0 0-10-4.2L4 11" />
          <path d="M6 13a6 6 0 0 0 10 4.2L20 13" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="m15 15 5 5" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.7 20 5.6v6c0 5-3.1 8.2-8 10-4.9-1.8-8-5-8-10v-6l8-2.9Z" />
        </svg>
      );
    case "trash":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7h14" />
          <path d="M9 7V5h6v2" />
          <path d="m7 7 1 13h8l1-13" />
          <path d="M10 11v5M14 11v5" />
        </svg>
      );
    case "upload":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 16V5" />
          <path d="m8 9 4-4 4 4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "warning":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4 21 20H3L12 4Z" />
          <path d="M12 10v4M12 17h.1" />
        </svg>
      );
    case "waveform":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 13v-2M7 16V8M10 19V5M13 17V7M16 15V9M19 13v-2" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
  }
}

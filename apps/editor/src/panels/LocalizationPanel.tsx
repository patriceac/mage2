import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { getLocaleStringValues, type Asset, type ProjectBundle } from "@mage2/schema";
import { BACKGROUND_IMPORT_EXTENSIONS, INVENTORY_IMAGE_EXTENSIONS, SCENE_AUDIO_IMPORT_EXTENSIONS } from "../asset-file-types";
import { useDialogs } from "../dialogs";
import { DropdownSelect } from "../DropdownSelect";
import {
  addProjectLocale,
  getLocaleCompletenessStatus,
  getLocalizedAssetVariant,
  getSupportedProjectLocales,
  removeProjectLocale,
  setEditorLocalizedText,
  setProjectDefaultLocale
} from "../localized-project";
import type { EditorNavigationTarget } from "../navigation-target";
import { AssetPreview } from "../previews";
import { classifyEditorAssetCategory } from "../project-helpers";
import {
  collectProjectTextEntries,
  deleteOrphanedProjectTextEntries,
  filterProjectTextEntries,
  formatProjectTextUsageKind,
  getProjectTextAreaLabel,
  resolveProjectTextArea,
  resolveProjectTextSelection,
  summarizeProjectTextUsages,
  type ProjectTextArea,
  type ProjectTextEntry,
  type ProjectTextUsage
} from "../project-text";
import { type LocalizationSection, useEditorStore } from "../store";

type StringsAreaFilter = "all" | "scenes" | "dialogue" | "inventory";
type MediaAssetFilter = "background" | "inventory" | "sceneAudio";
type LocalizationStatusFilter = "all" | LocalizedStringStatus;
type LocalizedStringStatus = "missing" | "empty" | "ready" | "orphaned";
type QueueItemStatus = LocalizedStringStatus;
type QueueItemKind = "string" | "media";

interface LocalizationPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  setSavedProject: (project: ProjectBundle) => void;
  setStatusMessage: (message: string) => void;
  setBusyLabel: (label?: string) => void;
}

interface QueueItemBase {
  id: string;
  kind: QueueItemKind;
  status: QueueItemStatus;
  areaLabel: string;
  title: string;
  subtitle: string;
  preview: string;
}

interface StringQueueItem extends QueueItemBase {
  kind: "string";
  entry: ProjectTextEntry;
}

interface MediaQueueItem extends QueueItemBase {
  kind: "media";
  asset: Asset;
  category: MediaAssetFilter;
}

type LocalizationQueueItem = StringQueueItem | MediaQueueItem;

interface CoverageRow {
  label: string;
  total: number;
  done: number;
  missing: number;
}

interface AssetUsage {
  label: string;
  detail: string;
  navigation: EditorNavigationTarget;
}

const LOCALIZATION_SUBTABS: ReadonlyArray<{
  id: LocalizationSection;
  label: string;
}> = [
  { id: "overview", label: "Work Queue" },
  { id: "strings", label: "Strings" },
  { id: "media", label: "Media" }
];

const QUEUE_GROUPS: ReadonlyArray<{
  status: QueueItemStatus;
  label: string;
  icon: LocalizationIconName;
}> = [
  { status: "missing", label: "Missing", icon: "alert" },
  { status: "empty", label: "Empty", icon: "circle" },
  { status: "orphaned", label: "Orphans", icon: "unlink" },
  { status: "ready", label: "Ready", icon: "check" }
];

const TEXT_AREAS: ReadonlyArray<ProjectTextArea> = ["scenes", "dialogue", "inventory"];

export function LocalizationPanel({
  project,
  mutateProject,
  setSavedProject,
  setStatusMessage,
  setBusyLabel
}: LocalizationPanelProps) {
  const dialogs = useDialogs();
  const activeLocale = useEditorStore((state) => state.localizationLocale) ?? project.manifest.defaultLanguage;
  const setLocalizationLocale = useEditorStore((state) => state.setLocalizationLocale);
  const localizationSection = useEditorStore((state) => state.localizationSection);
  const setLocalizationSection = useEditorStore((state) => state.setLocalizationSection);
  const selectedTextId = useEditorStore((state) => state.selectedTextId);
  const setSelectedTextId = useEditorStore((state) => state.setSelectedTextId);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const setSelectedAssetId = useEditorStore((state) => state.setSelectedAssetId);
  const selectedAsset = project.assets.assets.find((asset) => asset.id === selectedAssetId);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const setSelectedLocationId = useEditorStore((state) => state.setSelectedLocationId);
  const setSelectedSceneId = useEditorStore((state) => state.setSelectedSceneId);
  const setSelectedHotspotId = useEditorStore((state) => state.setSelectedHotspotId);
  const setSelectedDialogueId = useEditorStore((state) => state.setSelectedDialogueId);
  const setSelectedDialogueNodeId = useEditorStore((state) => state.setSelectedDialogueNodeId);
  const setSelectedInventoryItemId = useEditorStore((state) => state.setSelectedInventoryItemId);
  const supportedLocales = getSupportedProjectLocales(project);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LocalizationStatusFilter>("all");
  const [areaFilter, setAreaFilter] = useState<StringsAreaFilter>("all");
  const [sortOption, setSortOption] = useState<"status" | "textId" | "mostUses">("status");
  const [mediaAssetFilter, setMediaAssetFilter] = useState<MediaAssetFilter>(
    selectedAsset ? classifyEditorAssetCategory(selectedAsset) : "background"
  );
  const stringsListRef = useRef<HTMLDivElement | null>(null);
  const defaultLocaleStrings = getLocaleStringValues(project, project.manifest.defaultLanguage);

  const allStringEntries = useMemo(
    () => collectStringLocalizationEntries(project, activeLocale),
    [activeLocale, project]
  );
  const visibleStringEntries = useMemo(
    () =>
      filterLocalizedStringEntries(allStringEntries, {
        area: areaFilter,
        search,
        sort: sortOption,
        status: statusFilter
      }),
    [allStringEntries, areaFilter, search, sortOption, statusFilter]
  );
  const activeTextEntryId = resolveProjectTextSelection(visibleStringEntries, selectedTextId);
  const selectedStringEntry =
    visibleStringEntries.find((entry) => entry.textId === activeTextEntryId) ??
    allStringEntries.find((entry) => entry.textId === selectedTextId) ??
    visibleStringEntries[0];
  const stringMetrics = useMemo(() => summarizeStringMetrics(allStringEntries), [allStringEntries]);
  const visibleOrphanedEntries = visibleStringEntries.filter((entry) => getLocalizedStringStatus(entry) === "orphaned");
  const hasActiveSearchOrFilter = search.trim().length > 0 || statusFilter !== "all" || areaFilter !== "all";

  const mediaCoverage = useMemo(
    () => getProjectLocaleAssetCoverage(project, activeLocale),
    [activeLocale, project]
  );
  const visibleMediaAssets = useMemo(
    () =>
      project.assets.assets.filter(
        (asset) =>
          classifyEditorAssetCategory(asset) === mediaAssetFilter &&
          matchesMediaSearch(asset, search)
      ),
    [mediaAssetFilter, project.assets.assets, search]
  );
  const selectedMediaAsset = visibleMediaAssets.find((asset) => asset.id === selectedAssetId) ?? visibleMediaAssets[0];
  const selectedMediaUsages = useMemo(
    () => (selectedMediaAsset ? collectAssetUsages(project, selectedMediaAsset) : []),
    [project, selectedMediaAsset]
  );
  const stringCoverageRows = useMemo(() => buildStringCoverageRows(allStringEntries), [allStringEntries]);
  const mediaCoverageRows = useMemo(() => buildMediaCoverageRows(project, activeLocale), [activeLocale, project]);
  const isDefaultLocale = activeLocale === project.manifest.defaultLanguage;
  const localeLabel = formatLocaleDisplayName(activeLocale);
  const queueItems = useMemo(
    () => buildQueueItems(project, activeLocale, visibleStringEntries, { search, areaFilter, statusFilter }),
    [activeLocale, areaFilter, project, search, statusFilter, visibleStringEntries]
  );
  const selectedQueueItem =
    queueItems.find((item) => item.kind === "media" && item.asset.id === selectedAssetId) ??
    queueItems.find((item) => item.kind === "string" && item.entry.textId === selectedTextId) ??
    (selectedStringEntry ? buildStringQueueItem(selectedStringEntry, defaultLocaleStrings) : undefined) ??
    queueItems[0];

  useEffect(() => {
    const nextSelectedTextId = resolveProjectTextSelection(visibleStringEntries, selectedTextId);
    if (nextSelectedTextId !== selectedTextId && !selectedAssetId) {
      setSelectedTextId(nextSelectedTextId);
    }
  }, [selectedAssetId, selectedTextId, setSelectedTextId, visibleStringEntries]);

  useEffect(() => {
    if (localizationSection !== "strings" && localizationSection !== "overview") {
      return;
    }

    const listElement = stringsListRef.current;
    if (!listElement || !activeTextEntryId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const selectedRow = listElement.querySelector<HTMLElement>(".localization-queue-row--selected");
      if (!selectedRow) {
        return;
      }

      const listBounds = listElement.getBoundingClientRect();
      const rowBounds = selectedRow.getBoundingClientRect();
      const scrollMargin = 12;

      if (rowBounds.top < listBounds.top + scrollMargin) {
        listElement.scrollTop -= listBounds.top + scrollMargin - rowBounds.top;
        return;
      }

      if (rowBounds.bottom > listBounds.bottom - scrollMargin) {
        listElement.scrollTop += rowBounds.bottom - (listBounds.bottom - scrollMargin);
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeTextEntryId, localizationSection, visibleStringEntries]);

  function handleNavigate(target: EditorNavigationTarget, textId?: string) {
    setSelectedTextId(target.textId ?? textId);
    if (target.tab === "localization") {
      setLocalizationLocale(target.locale);
      if (target.localizationSection) {
        setLocalizationSection(target.localizationSection);
      }
    }
    setActiveTab(target.tab);
    setSelectedLocationId(target.locationId);
    setSelectedSceneId(target.sceneId);
    setSelectedHotspotId(target.hotspotId);
    setSelectedDialogueId(target.dialogueId);
    setSelectedDialogueNodeId(target.dialogueNodeId);
    setSelectedInventoryItemId(target.inventoryItemId);
    setSelectedAssetId(target.assetId);
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
      confirmLabel: isBulkDelete ? "Delete Orphans" : "Delete Orphaned Entry",
      cancelLabel: "Keep Entries",
      tone: "danger"
    });

    if (!confirmed) {
      return;
    }

    mutateProject((draft) => {
      deleteOrphanedProjectTextEntries(draft, activeLocale, textIds);
    });
  }

  async function handleAddLocale() {
    const nextLocale = await dialogs.promptText({
      title: "Add Locale",
      description: "Add a locale code like en, fr, or pt-BR. Existing source text is copied into the new locale as a starting point.",
      label: "Locale Code",
      placeholder: "fr",
      confirmLabel: "Add Locale",
      cancelLabel: "Cancel"
    });
    const normalizedLocale = normalizeLocaleInput(nextLocale);
    if (!normalizedLocale) {
      return;
    }

    if (supportedLocales.includes(normalizedLocale)) {
      setLocalizationLocale(normalizedLocale);
      return;
    }

    mutateProject((draft) => {
      addProjectLocale(draft, normalizedLocale);
    });
    setLocalizationLocale(normalizedLocale);
  }

  async function handleRemoveLocale() {
    if (activeLocale === project.manifest.defaultLanguage) {
      return;
    }

    const confirmed = await dialogs.confirm({
      title: `Remove locale ${activeLocale}?`,
      body: <p>This removes the locale's stored text and media variants from the project.</p>,
      confirmLabel: "Remove Locale",
      cancelLabel: "Keep Locale",
      tone: "danger"
    });
    if (!confirmed) {
      return;
    }

    mutateProject((draft) => {
      removeProjectLocale(draft, activeLocale);
    });
    setLocalizationLocale(project.manifest.defaultLanguage);
  }

  function handleSetDefaultLocale() {
    mutateProject((draft) => {
      setProjectDefaultLocale(draft, activeLocale);
    });
  }

  async function handleImportVariant(asset: Asset) {
    const variantAction = getLocalizedAssetVariant(asset, activeLocale) ? "Updated" : "Added";
    const filePaths = await dialogs.pickFiles({
      title: `${variantAction === "Updated" ? "Replace" : "Add"} ${activeLocale} Variant`,
      description: `Choose a ${asset.kind} file for the ${activeLocale} variant of ${asset.name}.`,
      initialPath: resolveAssetImportInitialPath(project, activeLocale) ?? useEditorStore.getState().projectDir,
      confirmLabel: "Use This File",
      allowedExtensions: resolveAssetVariantImportExtensions(asset)
    });
    const filePath = filePaths[0];
    if (!filePath) {
      return;
    }

    try {
      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error("No project directory is currently open.");
      }

      setBusyLabel("Updating localized media");
      const updatedAsset = await window.editorApi.importAssetVariant(projectDir, asset, activeLocale, filePath);
      mutateProject((draft) => {
        const index = draft.assets.assets.findIndex((entry) => entry.id === asset.id);
        if (index >= 0) {
          draft.assets.assets[index] = updatedAsset;
        }
      });
      setSelectedAssetId(asset.id);
      setSelectedTextId(undefined);
      setStatusMessage(`${variantAction} ${activeLocale} variant for ${asset.name}. Save the project to keep this change.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Variant import failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  async function handleRemoveVariant(asset: Asset) {
    const variant = getLocalizedAssetVariant(asset, activeLocale);
    if (!variant) {
      return;
    }

    if (Object.keys(asset.variants).length <= 1) {
      setStatusMessage(`Delete ${asset.name} entirely in Assets if you want to remove its only locale variant.`);
      return;
    }

    const confirmed = await dialogs.confirm({
      title: `Remove ${activeLocale} variant from ${asset.name}?`,
      body: <p>This removes the stored file and generated proxies for the selected locale variant only.</p>,
      confirmLabel: "Remove Variant",
      cancelLabel: "Keep Variant",
      tone: "danger"
    });
    if (!confirmed) {
      return;
    }

    try {
      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error("No project directory is currently open.");
      }

      setBusyLabel("Removing localized media");
      const nextProject = structuredClone(project) as ProjectBundle;
      const target = nextProject.assets.assets.find((entry) => entry.id === asset.id);
      if (!target) {
        throw new Error("Asset is no longer present.");
      }

      delete target.variants[activeLocale];
      const result = await window.editorApi.saveProject(projectDir, nextProject);
      await window.editorApi.deleteManagedAssetVariantFiles(projectDir, asset, activeLocale, result.project.assets.assets);
      setSavedProject(result.project);
      setSelectedAssetId(asset.id);
      setSelectedTextId(undefined);
      setStatusMessage(`Removed ${activeLocale} variant from ${asset.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Variant removal failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  function handleSelectQueueItem(item: LocalizationQueueItem) {
    if (item.kind === "string") {
      setSelectedTextId(item.entry.textId);
      setSelectedAssetId(undefined);
      return;
    }

    setSelectedAssetId(item.asset.id);
    setSelectedTextId(undefined);
  }

  function handleFindNextString(status: "missing" | "empty") {
    const nextEntry = allStringEntries.find((entry) => getLocalizedStringStatus(entry) === status);
    if (!nextEntry) {
      setStatusMessage(status === "missing" ? "No missing strings for this locale." : "No empty strings for this locale.");
      return;
    }

    setSelectedTextId(nextEntry.textId);
    setSelectedAssetId(undefined);
    setStatusFilter(status);
    setLocalizationSection("overview");
  }

  const workbenchDetail =
    selectedQueueItem?.kind === "media" ? (
      <MediaDetailPanel
        activeLocale={activeLocale}
        asset={selectedQueueItem.asset}
        isDefaultLocale={isDefaultLocale}
        projectDefaultLocale={project.manifest.defaultLanguage}
        supportedLocales={supportedLocales}
        onImportVariant={() => void handleImportVariant(selectedQueueItem.asset)}
        onRemoveVariant={() => void handleRemoveVariant(selectedQueueItem.asset)}
      />
    ) : (
      <StringDetailPanel
        activeLocale={activeLocale}
        defaultLocale={project.manifest.defaultLanguage}
        defaultValue={selectedStringEntry ? defaultLocaleStrings[selectedStringEntry.textId] ?? "" : ""}
        entry={selectedStringEntry}
        onChange={(entry, value) =>
          mutateProject((draft) => {
            setEditorLocalizedText(draft, activeLocale, entry.textId, value);
          })
        }
        onFocus={(entry) => {
          setSelectedTextId(entry.textId);
          setSelectedAssetId(undefined);
        }}
        onNavigate={handleNavigate}
      />
    );

  const selectedRailStringEntry =
    selectedQueueItem?.kind === "string"
      ? selectedQueueItem.entry
      : selectedAssetId
        ? undefined
        : selectedStringEntry;
  const selectedRailAsset = selectedQueueItem?.kind === "media" ? selectedQueueItem.asset : selectedMediaAsset;

  return (
    <div className="localization-page localization-workbench-page">
      <section className="localization-commandbar">
        <div className="localization-commandbar__field">
          <span className="localization-commandbar__label">Editing locale</span>
          <label className="localization-locale-select">
            <span className="localization-locale-select__icon" aria-hidden="true">
              <LocalizationIcon name="globe" />
            </span>
            <DropdownSelect value={activeLocale} onChange={(event) => setLocalizationLocale(event.target.value)}>
              {supportedLocales.map((locale) => (
                <option key={locale} value={locale}>
                  {formatLocaleDisplayName(locale)}
                </option>
              ))}
            </DropdownSelect>
            {isDefaultLocale ? <span className="localization-default-chip">Project default</span> : null}
          </label>
        </div>
        <div className="localization-commandbar__actions">
          <button type="button" className="button-secondary localization-command-button" onClick={() => void handleAddLocale()}>
            <LocalizationIcon name="plus" />
            <span>Add Locale</span>
          </button>
          <button
            type="button"
            className="button-secondary localization-command-button"
            disabled={isDefaultLocale}
            onClick={handleSetDefaultLocale}
            title="Make the selected locale the project default authoring locale."
          >
            <LocalizationIcon name="star" />
            <span>Set as Default</span>
          </button>
          <button
            type="button"
            className="button-danger-quiet localization-command-button localization-command-button--danger"
            disabled={isDefaultLocale}
            onClick={() => void handleRemoveLocale()}
            title="Remove the selected non-default locale from the project."
          >
            <LocalizationIcon name="trash" />
            <span>Remove Locale</span>
          </button>
        </div>
      </section>

      <section className="panel localization-health-panel" aria-label={`Locale health for ${localeLabel}`}>
        <div className="localization-health-panel__header">
          <h3>Locale Health — {localeLabel}</h3>
        </div>
        <div className="localization-health-grid">
          <HealthMetricCard
            icon="alert"
            tone="missing"
            value={stringMetrics.missing}
            label="Strings missing"
            detail={`${formatCoveragePercent(stringMetrics.missing, stringMetrics.total)} of total`}
          />
          <HealthMetricCard
            icon="circle"
            tone="empty"
            value={stringMetrics.empty}
            label="Empty strings"
            detail={`${formatCoveragePercent(stringMetrics.empty, stringMetrics.total)} of total`}
          />
          <HealthMetricCard
            icon="image"
            tone="missing"
            value={mediaCoverage.missing}
            label="Media missing"
            detail={`${formatCoveragePercent(mediaCoverage.missing, mediaCoverage.total)} of total`}
          />
          <HealthMetricCard
            icon="unlink"
            tone="orphaned"
            value={stringMetrics.orphaned}
            label="Orphans"
            detail="No references"
          />
        </div>
      </section>

      <nav className="localization-subtab-strip localization-view-switch" role="tablist" aria-label="Localization sections">
        {LOCALIZATION_SUBTABS.map((section) => (
          <button
            key={section.id}
            id={`localization-tab-${section.id}`}
            type="button"
            role="tab"
            aria-selected={localizationSection === section.id}
            aria-controls={`localization-panel-${section.id}`}
            className={
              localizationSection === section.id
                ? "localization-subtab localization-subtab--active"
                : "localization-subtab"
            }
            onClick={() => setLocalizationSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      {localizationSection === "overview" ? (
        <section
          id="localization-panel-overview"
          role="tabpanel"
          aria-labelledby="localization-tab-overview"
          className="localization-workbench localization-section localization-section--active"
        >
          <QueueList
            activeLocale={activeLocale}
            hasActiveSearchOrFilter={hasActiveSearchOrFilter}
            listRef={stringsListRef}
            items={queueItems}
            search={search}
            statusFilter={statusFilter}
            areaFilter={areaFilter}
            sortOption={sortOption}
            totalCount={allStringEntries.length + project.assets.assets.length}
            onAreaFilterChange={setAreaFilter}
            onDeleteVisibleOrphans={() => void handleDeleteOrphanedEntries(visibleOrphanedEntries.map((entry) => entry.textId))}
            onSearchChange={setSearch}
            onSelectItem={handleSelectQueueItem}
            onSortChange={setSortOption}
            onStatusFilterChange={setStatusFilter}
            selectedItemId={selectedQueueItem?.id}
            visibleOrphanCount={visibleOrphanedEntries.length}
          />
          {workbenchDetail}
          <CoverageRail
            activeLocale={activeLocale}
            asset={selectedQueueItem?.kind === "media" ? selectedQueueItem.asset : undefined}
            assetUsages={selectedQueueItem?.kind === "media" ? selectedMediaUsages : []}
            mediaCoverageRows={mediaCoverageRows}
            selectedStringEntry={selectedRailStringEntry}
            stringCoverageRows={stringCoverageRows}
            onFindNextEmpty={() => handleFindNextString("empty")}
            onFindNextMissing={() => handleFindNextString("missing")}
            onNavigate={handleNavigate}
          />
        </section>
      ) : null}

      {localizationSection === "strings" ? (
        <section
          id="localization-panel-strings"
          role="tabpanel"
          aria-labelledby="localization-tab-strings"
          className="localization-workbench localization-section localization-section--active"
        >
          <QueueList
            activeLocale={activeLocale}
            hasActiveSearchOrFilter={hasActiveSearchOrFilter}
            listRef={stringsListRef}
            items={visibleStringEntries.map((entry) => buildStringQueueItem(entry, defaultLocaleStrings))}
            search={search}
            statusFilter={statusFilter}
            areaFilter={areaFilter}
            sortOption={sortOption}
            totalCount={allStringEntries.length}
            onAreaFilterChange={setAreaFilter}
            onDeleteVisibleOrphans={() => void handleDeleteOrphanedEntries(visibleOrphanedEntries.map((entry) => entry.textId))}
            onSearchChange={setSearch}
            onSelectItem={handleSelectQueueItem}
            onSortChange={setSortOption}
            onStatusFilterChange={setStatusFilter}
            selectedItemId={selectedStringEntry ? `string:${selectedStringEntry.textId}` : undefined}
            visibleOrphanCount={visibleOrphanedEntries.length}
          />
          <StringDetailPanel
            activeLocale={activeLocale}
            defaultLocale={project.manifest.defaultLanguage}
            defaultValue={selectedStringEntry ? defaultLocaleStrings[selectedStringEntry.textId] ?? "" : ""}
            entry={selectedStringEntry}
            onChange={(entry, value) =>
              mutateProject((draft) => {
                setEditorLocalizedText(draft, activeLocale, entry.textId, value);
              })
            }
            onFocus={(entry) => {
              setSelectedTextId(entry.textId);
              setSelectedAssetId(undefined);
            }}
            onNavigate={handleNavigate}
          />
          <CoverageRail
            activeLocale={activeLocale}
            mediaCoverageRows={mediaCoverageRows}
            selectedStringEntry={selectedStringEntry}
            stringCoverageRows={stringCoverageRows}
            onFindNextEmpty={() => handleFindNextString("empty")}
            onFindNextMissing={() => handleFindNextString("missing")}
            onNavigate={handleNavigate}
          />
        </section>
      ) : null}

      {localizationSection === "media" ? (
        <section
          id="localization-panel-media"
          role="tabpanel"
          aria-labelledby="localization-tab-media"
          className="localization-workbench localization-section localization-section--active"
        >
          <MediaQueueList
            activeLocale={activeLocale}
            assets={visibleMediaAssets}
            category={mediaAssetFilter}
            search={search}
            selectedAssetId={selectedMediaAsset?.id}
            onCategoryChange={setMediaAssetFilter}
            onSearchChange={setSearch}
            onSelectAsset={(asset) => {
              setSelectedAssetId(asset.id);
              setSelectedTextId(undefined);
            }}
          />
          <MediaDetailPanel
            activeLocale={activeLocale}
            asset={selectedMediaAsset}
            isDefaultLocale={isDefaultLocale}
            projectDefaultLocale={project.manifest.defaultLanguage}
            supportedLocales={supportedLocales}
            onImportVariant={selectedMediaAsset ? () => void handleImportVariant(selectedMediaAsset) : undefined}
            onRemoveVariant={selectedMediaAsset ? () => void handleRemoveVariant(selectedMediaAsset) : undefined}
          />
          <CoverageRail
            activeLocale={activeLocale}
            asset={selectedMediaAsset}
            assetUsages={selectedMediaUsages}
            mediaCoverageRows={mediaCoverageRows}
            selectedStringEntry={undefined}
            stringCoverageRows={stringCoverageRows}
            onFindNextEmpty={() => handleFindNextString("empty")}
            onFindNextMissing={() => handleFindNextString("missing")}
            onNavigate={handleNavigate}
          />
        </section>
      ) : null}

      <footer className="localization-footer">
        <span className="localization-footer__locale">
          <span className="localization-locale-select__icon" aria-hidden="true">
            <LocalizationIcon name="globe" />
          </span>
          {isDefaultLocale ? "Project default locale" : "Editing locale"}: {activeLocale}
          {isDefaultLocale ? null : (
            <span className="localization-footer__source">Project default: {project.manifest.defaultLanguage}</span>
          )}
        </span>
        <span>Total Strings: {stringMetrics.total}</span>
        <span>Translated: {stringMetrics.ready} ({formatCoveragePercent(stringMetrics.ready, stringMetrics.total)})</span>
        <span>Missing: {stringMetrics.missing}</span>
        <span>Empty: {stringMetrics.empty}</span>
        <span>Orphans: {stringMetrics.orphaned}</span>
      </footer>
    </div>
  );
}

function QueueList({
  activeLocale,
  hasActiveSearchOrFilter,
  items,
  listRef,
  search,
  statusFilter,
  areaFilter,
  sortOption,
  totalCount,
  selectedItemId,
  visibleOrphanCount,
  onAreaFilterChange,
  onDeleteVisibleOrphans,
  onSearchChange,
  onSelectItem,
  onSortChange,
  onStatusFilterChange
}: {
  activeLocale: string;
  hasActiveSearchOrFilter: boolean;
  items: LocalizationQueueItem[];
  listRef?: RefObject<HTMLDivElement | null>;
  search: string;
  statusFilter: LocalizationStatusFilter;
  areaFilter: StringsAreaFilter;
  sortOption: "status" | "textId" | "mostUses";
  totalCount: number;
  selectedItemId?: string;
  visibleOrphanCount: number;
  onAreaFilterChange: (value: StringsAreaFilter) => void;
  onDeleteVisibleOrphans: () => void;
  onSearchChange: (value: string) => void;
  onSelectItem: (item: LocalizationQueueItem) => void;
  onSortChange: (value: "status" | "textId" | "mostUses") => void;
  onStatusFilterChange: (value: LocalizationStatusFilter) => void;
}) {
  return (
    <aside className="localization-queue-pane">
      <div className="localization-queue-controls">
        <label className="localization-search-field">
          <span className="field-label--inset">Search</span>
          <input
            value={search}
            placeholder="Search text id, asset, or source text..."
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <LocalizationIcon name="search" />
        </label>
        <label className="localization-filter">
          <span className="field-label--inset">Area</span>
          <DropdownSelect value={areaFilter} onChange={(event) => onAreaFilterChange(event.target.value as StringsAreaFilter)}>
            <option value="all">All Areas</option>
            <option value="scenes">Scenes</option>
            <option value="dialogue">Dialogue</option>
            <option value="inventory">Inventory</option>
          </DropdownSelect>
        </label>
        <label className="localization-filter">
          <span className="field-label--inset">Status</span>
          <DropdownSelect value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as LocalizationStatusFilter)}>
            <option value="all">All Statuses</option>
            <option value="missing">Missing</option>
            <option value="empty">Empty</option>
            <option value="ready">Ready</option>
            <option value="orphaned">Orphaned</option>
          </DropdownSelect>
        </label>
        <label className="localization-filter">
          <span className="field-label--inset">Sort</span>
          <DropdownSelect value={sortOption} onChange={(event) => onSortChange(event.target.value as "status" | "textId" | "mostUses")}>
            <option value="status">Status then ID</option>
            <option value="textId">Text ID A-Z</option>
            <option value="mostUses">Most Uses</option>
          </DropdownSelect>
        </label>
      </div>

      <div className="localization-queue-summary">
        <span>{hasActiveSearchOrFilter ? `${items.length} of ${totalCount} visible` : `Sorted by priority for ${activeLocale}`}</span>
        <LocalizationIcon name="sort" />
      </div>

      {visibleOrphanCount > 0 ? (
        <div className="localization-orphan-action">
          <span>{visibleOrphanCount} visible orphaned {visibleOrphanCount === 1 ? "entry" : "entries"}</span>
          <button type="button" className="button-danger-quiet button-danger--compact" onClick={onDeleteVisibleOrphans}>
            Delete Orphans
          </button>
        </div>
      ) : null}

      <div ref={listRef} className="localization-queue-list">
        {items.length > 0 ? (
          QUEUE_GROUPS.map((group) => {
            const groupItems = items.filter((item) => item.status === group.status);
            if (groupItems.length === 0) {
              return null;
            }

            return (
              <section key={group.status} className={`localization-queue-group localization-queue-group--${group.status}`}>
                <h4>
                  <LocalizationIcon name={group.icon} />
                  {group.label} ({groupItems.length})
                </h4>
                <div className="localization-queue-group__rows">
                  {groupItems.map((item) => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      selected={item.id === selectedItemId}
                      onSelect={() => onSelectItem(item)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        ) : (
          <p className="muted localization-empty-state">No localization work matches the current filters.</p>
        )}
      </div>

      <div className="localization-queue-pager" aria-label="Visible localization range">
        <span>1-{Math.min(items.length, 25)} of {items.length} items</span>
        <div className="localization-pager-buttons" aria-hidden="true">
          <span className="localization-pager-button localization-pager-button--active">1</span>
          <span className="localization-pager-button">2</span>
          <span className="localization-pager-button">3</span>
        </div>
      </div>
    </aside>
  );
}

function MediaQueueList({
  activeLocale,
  assets,
  category,
  search,
  selectedAssetId,
  onCategoryChange,
  onSearchChange,
  onSelectAsset
}: {
  activeLocale: string;
  assets: Asset[];
  category: MediaAssetFilter;
  search: string;
  selectedAssetId?: string;
  onCategoryChange: (value: MediaAssetFilter) => void;
  onSearchChange: (value: string) => void;
  onSelectAsset: (asset: Asset) => void;
}) {
  const items = assets.map((asset) => buildMediaQueueItem(asset, activeLocale));

  return (
    <aside className="localization-queue-pane">
      <div className="localization-queue-controls localization-queue-controls--media">
        <label className="localization-search-field">
          <span className="field-label--inset">Search</span>
          <input
            value={search}
            placeholder="Search media assets..."
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <LocalizationIcon name="search" />
        </label>
        <label className="localization-filter">
          <span className="field-label--inset">Category</span>
          <DropdownSelect value={category} onChange={(event) => onCategoryChange(event.target.value as MediaAssetFilter)}>
            <option value="background">Background</option>
            <option value="sceneAudio">Scene Audio</option>
            <option value="inventory">Inventory</option>
          </DropdownSelect>
        </label>
      </div>

      <div className="localization-queue-summary">
        <span>{items.length} {formatMediaCategoryLabel(category).toLowerCase()} asset{items.length === 1 ? "" : "s"}</span>
      </div>

      <div className="localization-queue-list">
        {items.length > 0 ? (
          QUEUE_GROUPS.filter((group) => group.status === "missing" || group.status === "ready").map((group) => {
            const groupItems = items.filter((item) => item.status === group.status);
            if (groupItems.length === 0) {
              return null;
            }

            return (
              <section key={group.status} className={`localization-queue-group localization-queue-group--${group.status}`}>
                <h4>
                  <LocalizationIcon name={group.status === "missing" ? "image" : "check"} />
                  {group.status === "missing" ? "Missing Variants" : "Ready"} ({groupItems.length})
                </h4>
                <div className="localization-queue-group__rows">
                  {groupItems.map((item) => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      selected={item.kind === "media" && item.asset.id === selectedAssetId}
                      onSelect={() => onSelectAsset(item.asset)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        ) : (
          <p className="muted localization-empty-state">{resolveEmptyMediaMessage(category)}</p>
        )}
      </div>
    </aside>
  );
}

function QueueRow({
  item,
  selected,
  onSelect
}: {
  item: LocalizationQueueItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={selected ? "localization-queue-row localization-queue-row--selected" : "localization-queue-row"}
      onClick={onSelect}
      title={`Inspect ${item.title}.`}
    >
      <span className="localization-queue-row__icon" aria-hidden="true">
        <LocalizationIcon name={item.kind === "media" ? "image" : "text"} />
      </span>
      <span className="localization-queue-row__area">{item.areaLabel}</span>
      <code>{item.title}</code>
      <span className="localization-queue-row__preview">{item.preview}</span>
      <span className={`localization-status localization-status--${item.status}`}>{getQueueItemStatusLabel(item)}</span>
      <LocalizationIcon name="chevronRight" />
    </button>
  );
}

function StringDetailPanel({
  activeLocale,
  defaultLocale,
  defaultValue,
  entry,
  onChange,
  onFocus,
  onNavigate
}: {
  activeLocale: string;
  defaultLocale: string;
  defaultValue: string;
  entry?: ProjectTextEntry;
  onChange: (entry: ProjectTextEntry, value: string) => void;
  onFocus: (entry: ProjectTextEntry) => void;
  onNavigate: (target: EditorNavigationTarget, textId?: string) => void;
}) {
  if (!entry) {
    return (
      <section className="panel localization-detail-panel">
        <p className="muted localization-empty-state">Select a string to inspect and edit it.</p>
      </section>
    );
  }

  const status = getLocalizedStringStatus(entry);

  return (
    <section className="panel localization-detail-panel">
      <header className="localization-detail-header">
        <div>
          <div className="localization-detail-title">
            <code>{entry.textId}</code>
            <button
              type="button"
              className="localization-icon-button control-wiring-issue"
              title={`Copy text id is not wired yet: ${entry.textId}.`}
              aria-label={`Selected text id ${entry.textId}`}
            >
              <LocalizationIcon name="copy" />
            </button>
          </div>
          <p className="muted">{summarizeProjectTextUsages(entry.usages)}</p>
        </div>
        <div className="localization-detail-header__badges">
          {resolveUsageAreaLabels(entry.usages).map((area) => (
            <span key={area} className="localization-area">
              {area}
            </span>
          ))}
          <span className={`localization-status localization-status--${status}`}>{getLocalizedStringStatusLabel(status)}</span>
        </div>
      </header>

      <div className="localization-translation-editor">
        <label className="localization-text-field localization-text-field--source">
          <span>
            Source <small>({defaultLocale})</small>
            <span className="localization-default-chip">Default</span>
          </span>
          <textarea value={defaultValue} readOnly />
          <small>{defaultValue.length} / 500</small>
        </label>
        <div className="localization-translation-arrow" aria-hidden="true">
          <LocalizationIcon name="arrowRight" />
        </div>
        <label className="localization-text-field localization-text-field--target">
          <span>
            Target <small>({activeLocale})</small>
          </span>
          <textarea
            value={entry.value}
            placeholder={`Enter ${formatLocaleDisplayName(activeLocale)} translation...`}
            title={`Edit the localized text stored under ${entry.textId}.`}
            onFocus={() => onFocus(entry)}
            onChange={(event) => onChange(entry, event.target.value)}
          />
          <small>{entry.value.length} / 500</small>
        </label>
      </div>

      <section className="localization-detail-block">
        <div className="localization-detail-block__header">
          <h4>Usage Locations ({entry.usages.length})</h4>
          {entry.usages.length > 1 ? (
            <button type="button" className="localization-link-button" onClick={() => onNavigate(entry.usages[0].navigation, entry.textId)}>
              Jump to all
              <LocalizationIcon name="arrowRight" />
            </button>
          ) : null}
        </div>
        {entry.usages.length > 0 ? (
          <div className="localization-usage-grid">
            {entry.usages.map((usage, index) => (
              <article key={`${usage.kind}-${usage.ownerId}-${index}`} className="localization-usage-card">
                <LocalizationIcon name={usage.navigation.tab === "dialogue" ? "message" : "image"} />
                <div>
                  <strong>{usage.ownerLabel}</strong>
                  <span>{formatProjectTextUsageKind(usage.kind)}</span>
                </div>
                <button
                  type="button"
                  className="button-secondary localization-usage-button"
                  onClick={() => onNavigate(usage.navigation, entry.textId)}
                  title={`Open ${usage.ownerLabel} in the ${usage.navigation.tab} tab.`}
                >
                  Open {usage.navigation.label}
                  <LocalizationIcon name="external" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted localization-empty-state">No editor surfaces currently reference this text id.</p>
        )}
      </section>

      <section className="localization-detail-block localization-detail-block--metadata">
        <h4>Metadata</h4>
        <dl className="localization-metadata-grid">
          <dt>Uses</dt>
          <dd>{entry.usages.length}</dd>
          <dt>Stored Value</dt>
          <dd>{entry.value.length > 0 ? "Yes" : "Empty"}</dd>
          <dt>Source Length</dt>
          <dd>{defaultValue.length}</dd>
          <dt>Status</dt>
          <dd>{getLocalizedStringStatusLabel(status)}</dd>
          <dt>Text ID</dt>
          <dd>{entry.textId}</dd>
        </dl>
      </section>
    </section>
  );
}

function MediaDetailPanel({
  activeLocale,
  asset,
  isDefaultLocale,
  projectDefaultLocale,
  supportedLocales,
  onImportVariant,
  onRemoveVariant
}: {
  activeLocale: string;
  asset?: Asset;
  isDefaultLocale: boolean;
  projectDefaultLocale: string;
  supportedLocales: string[];
  onImportVariant?: () => void;
  onRemoveVariant?: () => void;
}) {
  if (!asset) {
    return (
      <section className="panel localization-detail-panel">
        <p className="muted localization-empty-state">Select a media asset to inspect its localized variants.</p>
      </section>
    );
  }

  const activeVariant = getLocalizedAssetVariant(asset, activeLocale);
  const localeStatus = getLocaleCompletenessStatus(asset, supportedLocales);
  const category = classifyEditorAssetCategory(asset);

  return (
    <section className="panel localization-detail-panel localization-detail-panel--media">
      <header className="localization-detail-header">
        <div>
          <div className="localization-detail-title">
            <code>{asset.name}</code>
          </div>
          <p className="muted">
            {formatMediaCategoryLabel(category)} / {asset.kind}
            {activeVariant?.durationMs ? ` / ${Math.round(activeVariant.durationMs / 100) / 10}s` : " / still"}
            {activeVariant?.width && activeVariant?.height ? ` / ${activeVariant.width}x${activeVariant.height}` : ""}
          </p>
        </div>
        <span className={`localization-status localization-status--${activeVariant ? "ready" : "missing"}`}>
          {activeVariant ? "Ready" : "Missing"}
        </span>
      </header>

      <div className="localization-media-variant-grid">
        <section>
          <div className="localization-media-variant-grid__header">
            <h4>Source ({projectDefaultLocale})</h4>
            <span className="localization-default-chip">Default</span>
          </div>
          <AssetPreview asset={asset} locale={projectDefaultLocale} allowSourceFallback preferPosterForImages />
        </section>
        <section>
          <div className="localization-media-variant-grid__header">
            <h4>Target ({activeLocale})</h4>
            <span className={`localization-status localization-status--${activeVariant ? "ready" : "missing"}`}>
              {activeVariant ? "Ready" : "Missing"}
            </span>
          </div>
          <AssetPreview
            asset={asset}
            locale={activeLocale}
            allowSourceFallback={isDefaultLocale}
            preferPosterForImages
            emptyTitle={`${activeLocale} variant missing`}
            emptyBody="Import a localized media file for this locale."
          />
        </section>
      </div>

      <div className="localization-media-actions">
        <button type="button" className="button-secondary localization-command-button" onClick={onImportVariant}>
          <LocalizationIcon name="upload" />
          <span>{activeVariant ? `Replace ${activeLocale}` : `Import ${activeLocale} Variant`}</span>
        </button>
        <button
          type="button"
          className="button-danger-quiet localization-command-button"
          disabled={!activeVariant || Object.keys(asset.variants).length <= 1}
          onClick={onRemoveVariant}
          title={
            !activeVariant
              ? `${asset.name} does not have a ${activeLocale} variant to remove.`
              : Object.keys(asset.variants).length <= 1
                ? `Delete ${asset.name} entirely in Assets to remove its only remaining variant.`
                : `Remove only the ${activeLocale} variant from ${asset.name}.`
          }
        >
          <LocalizationIcon name="trash" />
          <span>{`Remove ${activeLocale}`}</span>
        </button>
      </div>

      <section className="localization-detail-block localization-detail-block--metadata">
        <h4>Variant Coverage</h4>
        <dl className="localization-metadata-grid">
          <dt>Present</dt>
          <dd>{localeStatus.present.join(", ") || "none"}</dd>
          <dt>Missing</dt>
          <dd>{localeStatus.missing.join(", ") || "none"}</dd>
          <dt>Asset ID</dt>
          <dd>{asset.id}</dd>
          <dt>Preview</dt>
          <dd>{activeVariant?.proxyPath ? "Ready" : activeVariant ? "Source only" : "Missing"}</dd>
        </dl>
      </section>
    </section>
  );
}

function CoverageRail({
  activeLocale,
  asset,
  assetUsages = [],
  selectedStringEntry,
  stringCoverageRows,
  mediaCoverageRows,
  onFindNextEmpty,
  onFindNextMissing,
  onNavigate
}: {
  activeLocale: string;
  asset?: Asset;
  assetUsages?: AssetUsage[];
  selectedStringEntry?: ProjectTextEntry;
  stringCoverageRows: CoverageRow[];
  mediaCoverageRows: CoverageRow[];
  onFindNextEmpty: () => void;
  onFindNextMissing: () => void;
  onNavigate: (target: EditorNavigationTarget, textId?: string) => void;
}) {
  const primaryUsage = selectedStringEntry?.usages[0];
  const primaryAssetUsage = assetUsages[0];
  const selectedStatus = selectedStringEntry ? getLocalizedStringStatus(selectedStringEntry) : asset ? (getLocalizedAssetVariant(asset, activeLocale) ? "ready" : "missing") : undefined;

  return (
    <aside className="panel localization-rail">
      <div className="localization-rail__title">
        <h3>Usage and Coverage</h3>
        <div aria-hidden="true">
          <LocalizationIcon name="pin" />
          <LocalizationIcon name="close" />
        </div>
      </div>

      <section className="localization-rail-section">
        <div className="localization-rail-section__header">
          <h4>Where Used</h4>
          <span className="muted">
            {selectedStringEntry ? `${selectedStringEntry.usages.length} location${selectedStringEntry.usages.length === 1 ? "" : "s"}` : `${assetUsages.length} location${assetUsages.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {primaryUsage ? (
          <RailUsageBlock
            icon={primaryUsage.navigation.tab === "dialogue" ? "message" : "image"}
            label={primaryUsage.ownerLabel}
            detail={formatProjectTextUsageKind(primaryUsage.kind)}
            actionLabel={`Open ${primaryUsage.navigation.label}`}
            onNavigate={() => onNavigate(primaryUsage.navigation, selectedStringEntry?.textId)}
          />
        ) : primaryAssetUsage ? (
          <RailUsageBlock
            icon={asset?.kind === "audio" ? "audio" : "image"}
            label={primaryAssetUsage.label}
            detail={primaryAssetUsage.detail}
            actionLabel={`Open ${primaryAssetUsage.navigation.label}`}
            onNavigate={() => onNavigate(primaryAssetUsage.navigation)}
          />
        ) : (
          <p className="muted localization-empty-state">No editor surfaces currently reference this item.</p>
        )}
      </section>

      <section className="localization-rail-section">
        <h4>Next Step</h4>
        <div className={`localization-next-step localization-next-step--${selectedStatus ?? "ready"}`}>
          <LocalizationIcon name={selectedStatus === "ready" ? "check" : selectedStatus === "empty" ? "circle" : "alert"} />
          <div>
            <strong>{resolveNextStepTitle(selectedStatus)}</strong>
            <span>{resolveNextStepBody(selectedStatus, activeLocale)}</span>
          </div>
        </div>
      </section>

      <section className="localization-rail-section">
        <div className="localization-rail-section__header">
          <h4>Locale Coverage</h4>
          <span className="muted">{activeLocale}</span>
        </div>
        <CoverageTable rows={[...stringCoverageRows, ...mediaCoverageRows]} />
      </section>

      <section className="localization-rail-section">
        <h4>Quick Actions</h4>
        <div className="localization-quick-actions">
          <button type="button" className="button-secondary" onClick={onFindNextMissing}>
            <LocalizationIcon name="circle" />
            Find Next Missing
            <kbd>F</kbd>
          </button>
          <button type="button" className="button-secondary" onClick={onFindNextEmpty}>
            <LocalizationIcon name="circle" />
            Find Next Empty
            <kbd>E</kbd>
          </button>
        </div>
      </section>
    </aside>
  );
}

function RailUsageBlock({
  icon,
  label,
  detail,
  actionLabel,
  onNavigate
}: {
  icon: LocalizationIconName;
  label: string;
  detail: string;
  actionLabel: string;
  onNavigate: () => void;
}) {
  return (
    <div className="localization-rail-usage">
      <LocalizationIcon name={icon} />
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <button type="button" className="button-secondary" onClick={onNavigate}>
        {actionLabel}
      </button>
    </div>
  );
}

function CoverageTable({ rows }: { rows: CoverageRow[] }) {
  return (
    <div className="localization-coverage-table">
      <div className="localization-coverage-table__header">
        <span>Area</span>
        <span>Total</span>
        <span>Done</span>
        <span>Missing</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="localization-coverage-table__row">
          <span>{row.label}</span>
          <span>{row.total}</span>
          <span>{row.done} ({formatCoveragePercent(row.done, row.total)})</span>
          <span className={row.missing > 0 ? "localization-coverage-table__missing" : ""}>{row.missing}</span>
        </div>
      ))}
    </div>
  );
}

function HealthMetricCard({
  detail,
  icon,
  label,
  tone,
  value
}: {
  detail: string;
  icon: LocalizationIconName;
  label: string;
  tone: "missing" | "empty" | "orphaned" | "ready";
  value: number;
}) {
  return (
    <article className={`localization-health-card localization-health-card--${tone}`}>
      <span className="localization-health-card__icon" aria-hidden="true">
        <LocalizationIcon name={icon} />
      </span>
      <strong>{value}</strong>
      <div>
        <span>{label}</span>
        <small>{detail}</small>
      </div>
    </article>
  );
}

type LocalizationIconName =
  | "alert"
  | "arrowRight"
  | "audio"
  | "check"
  | "chevronRight"
  | "circle"
  | "close"
  | "copy"
  | "external"
  | "filter"
  | "globe"
  | "image"
  | "message"
  | "pin"
  | "plus"
  | "search"
  | "sort"
  | "star"
  | "text"
  | "trash"
  | "unlink"
  | "upload";

function LocalizationIcon({ name }: { name: LocalizationIconName }) {
  const paths: Record<LocalizationIconName, ReactNode> = {
    alert: <path d="M12 9v4m0 4h.01M10.3 4.4 2.8 17.5A1.7 1.7 0 0 0 4.3 20h15.4a1.7 1.7 0 0 0 1.5-2.5L13.7 4.4a1.9 1.9 0 0 0-3.4 0Z" />,
    arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
    audio: <path d="M4 10v4h4l5 4V6l-5 4H4Zm12-1c1.2 1.8 1.2 4.2 0 6m3-8a8.5 8.5 0 0 1 0 10" />,
    check: <path d="m5 12 4 4L19 6" />,
    chevronRight: <path d="m9 6 6 6-6 6" />,
    circle: <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    copy: <path d="M9 9h10v10H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />,
    external: <path d="M14 5h5v5M19 5l-8 8M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />,
    filter: <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />,
    globe: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.6 9h16.8M3.6 15h16.8M12 3c2.3 2.4 3.5 5.4 3.5 9s-1.2 6.6-3.5 9c-2.3-2.4-3.5-5.4-3.5-9S9.7 5.4 12 3Z" />,
    image: <path d="M4 5h16v14H4zM7 15l3-3 2 2 3-4 3 5M8 9h.01" />,
    message: <path d="M4 5h16v10H8l-4 4V5Z" />,
    pin: <path d="M8 3h8l-1 5 3 3v2h-5v7l-1 1-1-1v-7H6v-2l3-3-1-5Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />,
    sort: <path d="M8 7h12M4 7h.01M12 12h8M4 12h4M16 17h4M4 17h8" />,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.1L12 17.2 6.4 20l1.1-6.1L3 9.6l6.2-.9L12 3Z" />,
    text: <path d="M5 6h14M8 6v12m8-12v12M5 18h14" />,
    trash: <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
    unlink: <path d="M9 7H7a5 5 0 0 0 0 10h2m6-10h2a5 5 0 0 1 0 10h-2M8 12h8M4 4l16 16" />,
    upload: <path d="M12 16V4m0 0 5 5m-5-5-5 5M5 20h14" />
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

function collectStringLocalizationEntries(project: ProjectBundle, locale: string): ProjectTextEntry[] {
  return collectProjectTextEntries(project, locale);
}

function filterLocalizedStringEntries(
  entries: ProjectTextEntry[],
  options: {
    area: StringsAreaFilter;
    search: string;
    sort: "status" | "textId" | "mostUses";
    status: LocalizationStatusFilter;
  }
): ProjectTextEntry[] {
  const baseStatus = options.status === "missing" || options.status === "orphaned" ? options.status : "all";

  return filterProjectTextEntries(entries, {
    area: options.area,
    search: options.search,
    sort: options.sort,
    status: baseStatus
  }).filter((entry) => options.status === "all" || getLocalizedStringStatus(entry) === options.status);
}

function summarizeStringMetrics(entries: ProjectTextEntry[]) {
  return entries.reduce(
    (metrics, entry) => {
      metrics.total += 1;
      metrics[getLocalizedStringStatus(entry)] += 1;
      return metrics;
    },
    { total: 0, missing: 0, empty: 0, ready: 0, orphaned: 0 }
  );
}

function buildQueueItems(
  project: ProjectBundle,
  locale: string,
  visibleStringEntries: ProjectTextEntry[],
  options: {
    areaFilter: StringsAreaFilter;
    search: string;
    statusFilter: LocalizationStatusFilter;
  }
): LocalizationQueueItem[] {
  const defaultLocaleStrings = getLocaleStringValues(project, project.manifest.defaultLanguage);
  const stringItems = visibleStringEntries.map((entry) => buildStringQueueItem(entry, defaultLocaleStrings));
  const mediaItems =
    options.areaFilter === "all"
      ? project.assets.assets
          .filter((asset) => matchesMediaSearch(asset, options.search))
          .map((asset) => buildMediaQueueItem(asset, locale))
          .filter((item) => options.statusFilter === "all" || item.status === options.statusFilter)
      : [];

  return [...stringItems, ...mediaItems].sort(compareQueueItems);
}

function buildStringQueueItem(entry: ProjectTextEntry, defaultLocaleStrings: Record<string, string>): StringQueueItem {
  const usageAreas = resolveUsageAreaLabels(entry.usages);
  const sourceValue = defaultLocaleStrings[entry.textId] ?? "";
  const status = getLocalizedStringStatus(entry);

  return {
    id: `string:${entry.textId}`,
    kind: "string",
    entry,
    status,
    areaLabel: usageAreas[0] ?? "Stored",
    title: entry.textId,
    subtitle: summarizeProjectTextUsages(entry.usages),
    preview: entry.value || sourceValue || summarizeProjectTextUsages(entry.usages)
  };
}

function buildMediaQueueItem(asset: Asset, locale: string): MediaQueueItem {
  const category = classifyEditorAssetCategory(asset);
  const activeVariant = getLocalizedAssetVariant(asset, locale);

  return {
    id: `media:${asset.id}`,
    kind: "media",
    asset,
    category,
    status: activeVariant ? "ready" : "missing",
    areaLabel: formatMediaCategoryLabel(category),
    title: asset.name,
    subtitle: `${formatMediaCategoryLabel(category)} / ${asset.kind}`,
    preview: activeVariant ? `${locale} preview ready` : `${locale} variant missing`
  };
}

function compareQueueItems(left: LocalizationQueueItem, right: LocalizationQueueItem): number {
  const statusDifference = getQueueStatusOrder(left.status) - getQueueStatusOrder(right.status);
  if (statusDifference !== 0) {
    return statusDifference;
  }

  return left.title.localeCompare(right.title);
}

function getQueueStatusOrder(status: QueueItemStatus): number {
  switch (status) {
    case "missing":
      return 0;
    case "empty":
      return 1;
    case "orphaned":
      return 2;
    case "ready":
      return 3;
  }
}

function getLocalizedStringStatus(entry: ProjectTextEntry): LocalizedStringStatus {
  if (entry.status === "missing") {
    return "missing";
  }

  if (entry.status === "orphaned") {
    return "orphaned";
  }

  return entry.value.trim().length > 0 ? "ready" : "empty";
}

function getLocalizedStringStatusLabel(status: LocalizedStringStatus): string {
  switch (status) {
    case "missing":
      return "Missing";
    case "empty":
      return "Empty";
    case "ready":
      return "Ready";
    case "orphaned":
      return "Orphaned";
  }
}

function getQueueItemStatusLabel(item: LocalizationQueueItem): string {
  if (item.kind === "media" && item.status === "missing") {
    return "Missing";
  }

  return getLocalizedStringStatusLabel(item.status);
}

function resolveUsageAreaLabels(usages: ProjectTextUsage[]): string[] {
  return [...new Set(usages.map((usage) => getProjectTextAreaLabel(resolveProjectTextArea(usage.kind))))];
}

function buildStringCoverageRows(entries: ProjectTextEntry[]): CoverageRow[] {
  return TEXT_AREAS.map((area) => {
    const areaEntries = entries.filter((entry) => entry.usages.some((usage) => resolveProjectTextArea(usage.kind) === area));
    const done = areaEntries.filter((entry) => getLocalizedStringStatus(entry) === "ready").length;
    const missing = areaEntries.filter((entry) => {
      const status = getLocalizedStringStatus(entry);
      return status === "missing" || status === "empty";
    }).length;

    return {
      label: getProjectTextAreaLabel(area),
      total: areaEntries.length,
      done,
      missing
    };
  });
}

function buildMediaCoverageRows(project: ProjectBundle, locale: string): CoverageRow[] {
  const rows: CoverageRow[] = [];

  for (const category of ["background", "sceneAudio", "inventory"] as const) {
    const assets = project.assets.assets.filter((asset) => classifyEditorAssetCategory(asset) === category);
    rows.push({
      label: formatMediaCategoryLabel(category),
      total: assets.length,
      done: assets.filter((asset) => Boolean(getLocalizedAssetVariant(asset, locale))).length,
      missing: assets.filter((asset) => !getLocalizedAssetVariant(asset, locale)).length
    });
  }

  return rows;
}

function collectAssetUsages(project: ProjectBundle, asset: Asset): AssetUsage[] {
  const usages: AssetUsage[] = [];

  for (const scene of project.scenes.items) {
    if (scene.backgroundAssetId === asset.id) {
      usages.push({
        label: scene.name,
        detail: "Scene background",
        navigation: {
          label: scene.name,
          tab: "scenes",
          locationId: scene.locationId,
          sceneId: scene.id,
          assetId: asset.id
        }
      });
    }

    if (scene.sceneAudioAssetId === asset.id) {
      usages.push({
        label: scene.name,
        detail: "Scene audio",
        navigation: {
          label: scene.name,
          tab: "scenes",
          locationId: scene.locationId,
          sceneId: scene.id,
          assetId: asset.id
        }
      });
    }
  }

  for (const item of project.inventory.items) {
    if (item.imageAssetId === asset.id) {
      usages.push({
        label: item.name,
        detail: "Inventory art",
        navigation: {
          label: item.name,
          tab: "inventory",
          inventoryItemId: item.id,
          assetId: asset.id
        }
      });
    }
  }

  return usages;
}

function matchesMediaSearch(asset: Asset, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [asset.id, asset.name, asset.kind, classifyEditorAssetCategory(asset)]
    .some((part) => part.toLowerCase().includes(normalizedSearch));
}

function getProjectLocaleAssetCoverage(project: ProjectBundle, locale: string) {
  const categoryManagedAssets = project.assets.assets;
  const total = categoryManagedAssets.length;
  const present = categoryManagedAssets.filter((asset) => Boolean(getLocalizedAssetVariant(asset, locale))).length;
  return {
    total,
    present,
    missing: total - present
  };
}

function resolveAssetImportInitialPath(project: ProjectBundle, locale: string): string | undefined {
  for (let index = project.assets.assets.length - 1; index >= 0; index -= 1) {
    const asset = project.assets.assets[index];
    const variant = getLocalizedAssetVariant(asset, locale) ?? Object.values(asset.variants)[0];
    if (!variant) {
      continue;
    }

    const importPath = variant.importSourcePath ?? variant.sourcePath;
    const parentPath = importPath.replace(/[\\/][^\\/]+$/, "");
    if (parentPath) {
      return parentPath;
    }
  }

  return undefined;
}

function formatMediaCategoryLabel(category: MediaAssetFilter): string {
  switch (category) {
    case "background":
      return "Background";
    case "sceneAudio":
      return "Scene Audio";
    case "inventory":
      return "Inventory";
  }
}

function resolveEmptyMediaMessage(filter: MediaAssetFilter): string {
  switch (filter) {
    case "background":
      return "No background assets yet. Upload scene media from Scenes before localizing it here.";
    case "sceneAudio":
      return "No scene audio assets yet. Upload scene audio from Scenes before localizing it here.";
    case "inventory":
      return "No inventory assets yet. Upload an inventory image from Inventory before localizing it here.";
  }
}

function formatLocaleDisplayName(locale: string): string {
  const localeNames: Record<string, string> = {
    en: "English",
    fr: "French",
    de: "German",
    es: "Spanish",
    it: "Italian",
    ja: "Japanese",
    ko: "Korean",
    "pt-BR": "Portuguese",
    pt: "Portuguese",
    zh: "Chinese"
  };

  const baseLocale = locale.split("-")[0] ?? locale;
  return `${locale} (${localeNames[locale] ?? localeNames[baseLocale] ?? locale.toUpperCase()})`;
}

function formatCoveragePercent(value: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}

function resolveNextStepTitle(status: LocalizedStringStatus | undefined): string {
  switch (status) {
    case "missing":
      return "Missing translation";
    case "empty":
      return "Empty translation";
    case "orphaned":
      return "No references";
    case "ready":
      return "Ready";
    default:
      return "Select an item";
  }
}

function resolveNextStepBody(status: LocalizedStringStatus | undefined, locale: string): string {
  switch (status) {
    case "missing":
      return `Add a ${locale} value for this item.`;
    case "empty":
      return `Fill the stored ${locale} value.`;
    case "orphaned":
      return "Delete the stored entry or keep it for reuse.";
    case "ready":
      return "This item has localized content for the active locale.";
    default:
      return "Choose a string or media variant to inspect.";
  }
}

export function normalizeLocaleInput(input: string | undefined): string | undefined {
  const normalized = input?.trim().replace(/_/g, "-");
  return normalized ? normalized : undefined;
}

function resolveAssetVariantImportExtensions(asset: Asset): string[] {
  switch (asset.kind) {
    case "audio":
      return [...SCENE_AUDIO_IMPORT_EXTENSIONS];
    case "video":
      return [...BACKGROUND_IMPORT_EXTENSIONS];
    case "image":
      return classifyEditorAssetCategory(asset) === "inventory"
        ? [...INVENTORY_IMAGE_EXTENSIONS]
        : [...BACKGROUND_IMPORT_EXTENSIONS];
  }
}

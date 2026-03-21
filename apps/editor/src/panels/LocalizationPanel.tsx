import { useEffect, useMemo, useRef, useState } from "react";
import { getLocaleStringValues, type Asset, type ProjectBundle } from "@mage2/schema";
import { useDialogs } from "../dialogs";
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
  getProjectTextStatusLabel,
  resolveProjectTextArea,
  resolveProjectTextSelection,
  summarizeProjectTextUsages,
  type ProjectTextEntry
} from "../project-text";
import { type LocalizationSection, useEditorStore } from "../store";

type StringsAreaFilter = "all" | "scenes" | "dialogue" | "inventory";
type SubtitleEntryStatus = "missing" | "translated" | "empty";
type MediaAssetFilter = "background" | "inventory";

interface LocalizationPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  setSavedProject: (project: ProjectBundle) => void;
  setStatusMessage: (message: string) => void;
  setBusyLabel: (label?: string) => void;
}

interface SubtitleLocalizationEntry {
  sceneId: string;
  sceneName: string;
  locationId: string;
  trackId: string;
  trackIndex: number;
  cueId: string;
  cueIndex: number;
  textId: string;
  startMs: number;
  endMs: number;
  defaultValue: string;
  localizedValue: string;
  status: SubtitleEntryStatus;
  navigation: EditorNavigationTarget;
}

interface SubtitleSceneGroup {
  sceneId: string;
  sceneName: string;
  entries: SubtitleLocalizationEntry[];
}

const LOCALIZATION_SUBTABS: ReadonlyArray<{
  id: LocalizationSection;
  label: string;
}> = [
  { id: "overview", label: "Overview" },
  { id: "strings", label: "Strings" },
  { id: "subtitles", label: "Subtitles" },
  { id: "media", label: "Media" }
];

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
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const setSelectedLocationId = useEditorStore((state) => state.setSelectedLocationId);
  const setSelectedSceneId = useEditorStore((state) => state.setSelectedSceneId);
  const setSelectedHotspotId = useEditorStore((state) => state.setSelectedHotspotId);
  const setSelectedDialogueId = useEditorStore((state) => state.setSelectedDialogueId);
  const setSelectedDialogueNodeId = useEditorStore((state) => state.setSelectedDialogueNodeId);
  const setSelectedInventoryItemId = useEditorStore((state) => state.setSelectedInventoryItemId);
  const supportedLocales = getSupportedProjectLocales(project);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "missing" | "referenced" | "orphaned">("all");
  const [areaFilter, setAreaFilter] = useState<StringsAreaFilter>("all");
  const [sortOption, setSortOption] = useState<"status" | "textId" | "mostUses">("status");
  const [mediaAssetFilter, setMediaAssetFilter] = useState<MediaAssetFilter>("background");
  const stringsListRef = useRef<HTMLDivElement | null>(null);

  const allStringEntries = useMemo(
    () => collectStringLocalizationEntries(project, activeLocale),
    [activeLocale, project]
  );
  const visibleStringEntries = useMemo(
    () =>
      filterProjectTextEntries(allStringEntries, {
        search,
        status: statusFilter,
        area: areaFilter,
        sort: sortOption
      }),
    [allStringEntries, areaFilter, search, sortOption, statusFilter]
  );
  const activeTextEntryId = resolveProjectTextSelection(visibleStringEntries, selectedTextId);
  const selectedStringEntry = visibleStringEntries.find((entry) => entry.textId === activeTextEntryId);
  const stringMissingCount = allStringEntries.filter((entry) => entry.status === "missing").length;
  const stringReferencedCount = allStringEntries.filter((entry) => entry.status === "referenced").length;
  const stringOrphanedCount = allStringEntries.filter((entry) => entry.status === "orphaned").length;
  const visibleOrphanedEntries = visibleStringEntries.filter((entry) => entry.status === "orphaned");
  const hasActiveSearchOrFilter = search.trim().length > 0 || statusFilter !== "all" || areaFilter !== "all";

  const subtitleEntries = useMemo(
    () => collectSubtitleLocalizationEntries(project, activeLocale),
    [activeLocale, project]
  );
  const subtitleSceneGroups = useMemo(
    () => groupSubtitleEntriesByScene(subtitleEntries),
    [subtitleEntries]
  );
  const subtitleMissingCount = subtitleEntries.filter((entry) => entry.status === "missing").length;
  const subtitleEmptyCount = subtitleEntries.filter((entry) => entry.status === "empty").length;
  const subtitleTranslatedCount = subtitleEntries.filter((entry) => entry.status === "translated").length;
  const mediaCoverage = useMemo(
    () => getProjectLocaleAssetCoverage(project, activeLocale),
    [activeLocale, project]
  );
  const visibleMediaAssets = useMemo(
    () => project.assets.assets.filter((asset) => classifyEditorAssetCategory(asset) === mediaAssetFilter),
    [mediaAssetFilter, project.assets.assets]
  );
  const isDefaultLocale = activeLocale === project.manifest.defaultLanguage;

  useEffect(() => {
    const nextSelectedTextId = resolveProjectTextSelection(visibleStringEntries, selectedTextId);
    if (nextSelectedTextId !== selectedTextId) {
      setSelectedTextId(nextSelectedTextId);
    }
  }, [selectedTextId, setSelectedTextId, visibleStringEntries]);

  useEffect(() => {
    if (localizationSection !== "strings") {
      return;
    }

    const listElement = stringsListRef.current;
    if (!listElement || !activeTextEntryId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const selectedCard = listElement.querySelector<HTMLElement>(".list-card--selected");
      if (!selectedCard) {
        return;
      }

      const listBounds = listElement.getBoundingClientRect();
      const cardBounds = selectedCard.getBoundingClientRect();
      const scrollMargin = 12;

      if (cardBounds.top < listBounds.top + scrollMargin) {
        listElement.scrollTop -= listBounds.top + scrollMargin - cardBounds.top;
        return;
      }

      if (cardBounds.bottom > listBounds.bottom - scrollMargin) {
        listElement.scrollTop += cardBounds.bottom - (listBounds.bottom - scrollMargin);
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
    const filePaths = await dialogs.pickFiles({
      title: `${getLocalizedAssetVariant(asset, activeLocale) ? "Replace" : "Add"} ${activeLocale} Variant`,
      description: `Choose a ${asset.kind} file for the ${activeLocale} variant of ${asset.name}.`,
      initialPath: resolveAssetImportInitialPath(project, activeLocale) ?? useEditorStore.getState().projectDir,
      confirmLabel: "Use This File"
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
      const nextProject = structuredClone(project) as ProjectBundle;
      const index = nextProject.assets.assets.findIndex((entry) => entry.id === asset.id);
      if (index >= 0) {
        nextProject.assets.assets[index] = updatedAsset;
      }
      const result = await window.editorApi.saveProject(projectDir, nextProject);
      setSavedProject(result.project);
      setSelectedAssetId(asset.id);
      setStatusMessage(
        `${getLocalizedAssetVariant(asset, activeLocale) ? "Updated" : "Added"} ${activeLocale} variant for ${asset.name}.`
      );
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
      setStatusMessage(`Removed ${activeLocale} variant from ${asset.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Variant removal failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  return (
    <div className="localization-page">
      <section className="panel localization-shell__header">
        <div className="panel__toolbar localization-shell__header-bar">
          <div>
            <h3>Localization</h3>
            <p className="muted">
              Localize strings, subtitles, and media here. The rest of the editor always authors the default locale.
            </p>
          </div>
          <div className="localization-overview__locale-controls">
            <label className="localization-filter localization-panel__locale-filter">
              <span className="field-label--inset">Locale</span>
              <select value={activeLocale} onChange={(event) => setLocalizationLocale(event.target.value)}>
                {supportedLocales.map((locale) => (
                  <option key={locale} value={locale}>
                    {locale}
                  </option>
                ))}
              </select>
            </label>
            <div className="localization-overview__actions">
              <button type="button" className="button-secondary" onClick={() => void handleAddLocale()}>
                Add Locale
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={isDefaultLocale}
                onClick={handleSetDefaultLocale}
                title="Make the selected locale the project default authoring locale."
              >
                Set Default
              </button>
              <button
                type="button"
                className="button-danger"
                disabled={isDefaultLocale}
                onClick={() => void handleRemoveLocale()}
                title="Remove the selected non-default locale from the project."
              >
                Remove Locale
              </button>
            </div>
          </div>
        </div>

        <div className="localization-overview__notice">
          <strong>{isDefaultLocale ? "Default locale" : "Non-default locale"}</strong>
          <span>
            {isDefaultLocale
              ? "World, Scenes, Dialogue, Inventory, and Assets author this locale directly."
              : "Edit this locale here for strings, subtitles, and media variants."}
          </span>
        </div>
      </section>

      <nav className="localization-subtab-strip" role="tablist" aria-label="Localization sections">
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
          className="panel localization-overview localization-section localization-section--active"
        >
          <div className="panel__toolbar localization-section__header">
            <div>
              <h3>Overview</h3>
              <p className="muted">Review locale coverage and jump into the workspace you need.</p>
            </div>
          </div>

          <div className="localization-overview__summary-grid">
            <article className="list-card list-card--compact localization-summary-card">
              <strong>Strings</strong>
              <p className="muted">
                {allStringEntries.length} total. {stringMissingCount} missing, {stringReferencedCount} referenced,{" "}
                {stringOrphanedCount} orphaned.
              </p>
              <button type="button" className="button-secondary" onClick={() => setLocalizationSection("strings")}>
                Review Strings
              </button>
            </article>
            <article className="list-card list-card--compact localization-summary-card">
              <strong>Subtitles</strong>
              <p className="muted">
                {subtitleEntries.length} cue{subtitleEntries.length === 1 ? "" : "s"}. {subtitleTranslatedCount} translated,{" "}
                {subtitleMissingCount} missing, {subtitleEmptyCount} empty.
              </p>
              <button type="button" className="button-secondary" onClick={() => setLocalizationSection("subtitles")}>
                Review Subtitles
              </button>
            </article>
            <article className="list-card list-card--compact localization-summary-card">
              <strong>Media</strong>
              <p className="muted">
                {mediaCoverage.present} of {mediaCoverage.total} asset{mediaCoverage.total === 1 ? "" : "s"} ready for{" "}
                {activeLocale}. {mediaCoverage.missing} missing.
              </p>
              <button type="button" className="button-secondary" onClick={() => setLocalizationSection("media")}>
                Review Media
              </button>
            </article>
          </div>
        </section>
      ) : null}

      {localizationSection === "strings" ? (
      <section
        id="localization-panel-strings"
        role="tabpanel"
        aria-labelledby="localization-tab-strings"
        className="panel localization-section localization-section--active"
      >
        <div className="panel__toolbar localization-section__header">
          <div>
            <h3>Strings</h3>
            <p className="muted">
              Review non-subtitle text keys used by hotspots, dialogue, and inventory for the selected locale.
            </p>
          </div>
        </div>

        <div className="panel-grid panel-grid--localization">
          <div className="localization-panel">
            <div className="localization-panel__header">
              <div className="localization-panel__toolbar-copy">
                <p className="muted localization-panel__summary">
                  {hasActiveSearchOrFilter
                    ? `${visibleStringEntries.length} of ${allStringEntries.length} visible. `
                    : `${allStringEntries.length} entr${allStringEntries.length === 1 ? "y" : "ies"} in ${activeLocale}. `}
                  {stringMissingCount} missing, {stringReferencedCount} referenced, {stringOrphanedCount} orphaned.
                </p>
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
                <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value as StringsAreaFilter)}>
                  <option value="all">All areas</option>
                  <option value="scenes">Scenes</option>
                  <option value="dialogue">Dialogue</option>
                  <option value="inventory">Inventory</option>
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

            <div className="localization-panel__results">
              {visibleOrphanedEntries.length > 0 ? (
                <div className="localization-panel__list-actions">
                  <p className="muted localization-panel__list-action-summary">
                    {visibleOrphanedEntries.length} visible orphaned entr
                    {visibleOrphanedEntries.length === 1 ? "y" : "ies"}
                  </p>
                  <button
                    type="button"
                    className="button-danger"
                    title="Delete all orphaned entries currently visible in this filtered list."
                    onClick={() => void handleDeleteOrphanedEntries(visibleOrphanedEntries.map((entry) => entry.textId))}
                  >
                    Delete Orphans
                  </button>
                </div>
              ) : null}

              {visibleStringEntries.length > 0 ? (
                <div ref={stringsListRef} className="list-stack localization-list">
                  {visibleStringEntries.map((entry) => {
                    const isSelected = entry.textId === activeTextEntryId;
                    const usageAreas = [
                      ...new Set(entry.usages.map((usage) => getProjectTextAreaLabel(resolveProjectTextArea(usage.kind))))
                    ];
                    const defaultValue = getLocaleStringValues(project, project.manifest.defaultLanguage)[entry.textId] ?? "";
                    return (
                      <article
                        key={entry.textId}
                        data-text-id={entry.textId}
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

                        {!isDefaultLocale ? (
                          <label>
                            <span className="field-label--inset">{`Default (${project.manifest.defaultLanguage})`}</span>
                            <textarea value={defaultValue} readOnly />
                          </label>
                        ) : null}

                        <label>
                          <span className="field-label--inset">{`Value for ${activeLocale}`}</span>
                          <textarea
                            value={entry.value}
                            title={`Edit the localized text stored under ${entry.textId}.`}
                            onFocus={() => setSelectedTextId(entry.textId)}
                            onChange={(event) =>
                              mutateProject((draft) => {
                                setEditorLocalizedText(draft, activeLocale, entry.textId, event.target.value);
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
              ) : allStringEntries.length > 0 ? (
                <p className="muted localization-panel__empty-state">
                  No string entries match the current search and filters.
                </p>
              ) : (
                <p className="muted">No string entries yet.</p>
              )}
            </div>
          </div>

          <aside className="localization-context">
            <div className="panel__toolbar">
              <div>
                <h3>Usage</h3>
                <p className="muted">Review where the selected text is used and jump back to its source surface.</p>
              </div>
            </div>

            {selectedStringEntry ? (
              <div className="localization-context__body">
                <div className="localization-context__headline">
                  <code className="localization-context__text-id">{selectedStringEntry.textId}</code>
                  <span
                    className={`localization-status localization-status--${selectedStringEntry.status}`}
                    title={`This entry is ${getProjectTextStatusLabel(selectedStringEntry.status).toLowerCase()}.`}
                  >
                    {getProjectTextStatusLabel(selectedStringEntry.status)}
                  </span>
                </div>

                <p className="muted localization-context__note">
                  {selectedStringEntry.status === "missing"
                    ? "This text id is referenced in the project, but it does not exist for the selected locale yet."
                    : selectedStringEntry.status === "orphaned"
                      ? "This text id is still stored in the project, but nothing currently points at it."
                      : "This localized text is already connected to one or more project surfaces."}
                </p>

                <dl className="inspector-grid localization-context__meta">
                  <dt>Uses</dt>
                  <dd>{selectedStringEntry.usages.length}</dd>
                  <dt>Stored Value</dt>
                  <dd>{selectedStringEntry.value.length > 0 ? "Yes" : "Empty"}</dd>
                  <dt>Next Step</dt>
                  <dd>{selectedStringEntry.usages.length > 0 ? "Review usage targets below." : "Review whether this key should stay."}</dd>
                </dl>

                {selectedStringEntry.usages.length > 0 ? (
                  <div className="list-stack localization-context__usages">
                    {selectedStringEntry.usages.map((usage, index) => (
                      <article key={`${usage.kind}-${usage.ownerId}-${index}`} className="list-card list-card--compact">
                        <div className="localization-context__usage-header">
                          <strong>{formatProjectTextUsageKind(usage.kind)}</strong>
                          <span className="muted">{usage.ownerLabel}</span>
                        </div>
                        <button
                          type="button"
                          className="button-secondary localization-context__jump"
                          onClick={() => handleNavigate(usage.navigation, selectedStringEntry.textId)}
                          title={`Open ${usage.ownerLabel} in the ${usage.navigation.tab} tab.`}
                        >
                          Open {usage.navigation.label}
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="muted localization-context__empty">No editor surfaces currently reference this text id.</p>
                )}
              </div>
            ) : (
              <p className="muted">Select a string entry to inspect its usage.</p>
            )}
          </aside>
        </div>
      </section>
      ) : null}

      {localizationSection === "subtitles" ? (
      <section
        id="localization-panel-subtitles"
        role="tabpanel"
        aria-labelledby="localization-tab-subtitles"
        className="panel localization-section localization-section--active"
      >
        <div className="panel__toolbar localization-section__header">
          <div>
            <h3>Subtitles</h3>
            <p className="muted">Translate subtitle cues here while keeping track timing in Scenes.</p>
          </div>
        </div>

        {subtitleSceneGroups.length > 0 ? (
          <div className="localization-subtitle-groups">
            {subtitleSceneGroups.map((sceneGroup) => (
              <article key={sceneGroup.sceneId} className="list-card localization-subtitle-group">
                <div className="localization-subtitle-group__header">
                  <div>
                    <h4>{sceneGroup.sceneName}</h4>
                    <p className="muted">
                      {sceneGroup.entries.length} cue{sceneGroup.entries.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => handleNavigate(sceneGroup.entries[0].navigation)}
                  >
                    Open Scene
                  </button>
                </div>

                <div className="localization-subtitle-group__rows">
                  {sceneGroup.entries.map((entry) => (
                    <article
                      key={entry.cueId}
                      className={selectedTextId === entry.textId ? "list-card list-card--compact list-card--selected localization-subtitle-entry" : "list-card list-card--compact localization-subtitle-entry"}
                    >
                      <div className="localization-subtitle-entry__header">
                        <div>
                          <strong>{`Track ${entry.trackIndex + 1} / Cue ${entry.cueIndex + 1}`}</strong>
                          <p className="muted">{formatCueTiming(entry.startMs, entry.endMs)}</p>
                        </div>
                        <div className="localization-entry__badges">
                          <code>{entry.textId}</code>
                          <span className={`localization-status localization-status--${mapSubtitleStatusToClassName(entry.status)}`}>
                            {getSubtitleStatusLabel(entry.status)}
                          </span>
                        </div>
                      </div>

                      {!isDefaultLocale ? (
                        <label>
                          <span className="field-label--inset">{`Default (${project.manifest.defaultLanguage})`}</span>
                          <textarea value={entry.defaultValue} readOnly />
                        </label>
                      ) : null}

                      <label>
                        <span className="field-label--inset">{`Value for ${activeLocale}`}</span>
                        <textarea
                          rows={3}
                          value={entry.localizedValue}
                          onFocus={() => setSelectedTextId(entry.textId)}
                          onChange={(event) =>
                            mutateProject((draft) => {
                              setEditorLocalizedText(draft, activeLocale, entry.textId, event.target.value);
                            })
                          }
                        />
                      </label>
                    </article>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No subtitle cues yet. Add subtitle tracks in Scenes to localize them here.</p>
        )}
      </section>
      ) : null}

      {localizationSection === "media" ? (
      <section
        id="localization-panel-media"
        role="tabpanel"
        aria-labelledby="localization-tab-media"
        className="panel localization-section localization-section--active"
      >
        <div className="panel__toolbar localization-section__header">
          <div>
            <h3>Media</h3>
            <p className="muted">Add, replace, or remove locale variants for existing logical assets.</p>
          </div>
          <label className="localization-filter localization-panel__locale-filter">
            <span className="field-label--inset">Category</span>
            <select value={mediaAssetFilter} onChange={(event) => setMediaAssetFilter(event.target.value as MediaAssetFilter)}>
              <option value="background">Background</option>
              <option value="inventory">Inventory</option>
            </select>
          </label>
        </div>

        {visibleMediaAssets.length > 0 ? (
          <div className="localization-media-grid">
            {visibleMediaAssets.map((asset) => {
              const isSelected = selectedAssetId === asset.id;
              const activeVariant = getLocalizedAssetVariant(asset, activeLocale);
              const localeStatus = getLocaleCompletenessStatus(asset, supportedLocales);
              const category = classifyEditorAssetCategory(asset);
              return (
                <article
                  key={asset.id}
                  className={isSelected ? "list-card list-card--asset list-card--selected localization-media-card" : "list-card list-card--asset localization-media-card"}
                  onClick={() => setSelectedAssetId(asset.id)}
                >
                  <AssetPreview asset={asset} locale={activeLocale} allowSourceFallback />

                  <div className="asset-card__body">
                    <div>
                      <h4>{asset.name}</h4>
                      <p>
                        {formatMediaCategoryLabel(category)} /{" "}
                        {asset.kind}
                        {activeVariant?.durationMs ? ` / ${Math.round(activeVariant.durationMs / 100) / 10}s` : " / still"}
                        {activeVariant?.width && activeVariant?.height ? ` / ${activeVariant.width}x${activeVariant.height}` : ""}
                      </p>
                      <p className="muted">
                        {activeVariant
                          ? activeVariant.proxyPath
                            ? `${activeLocale} preview ready`
                            : `${activeLocale} preview unavailable`
                          : `${activeLocale} variant missing`}
                      </p>
                      <p className="muted">
                        Present: {localeStatus.present.join(", ") || "none"}.
                        {localeStatus.missing.length > 0 ? ` Missing: ${localeStatus.missing.join(", ")}.` : ""}
                      </p>
                    </div>

                    <div className="list-card__actions">
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleImportVariant(asset);
                        }}
                        title={`${activeVariant ? "Replace" : "Add"} the ${activeLocale} file for ${asset.name}.`}
                      >
                        {activeVariant ? `Replace ${activeLocale}` : `Add ${activeLocale}`}
                      </button>
                      <button
                        type="button"
                        className="button-danger"
                        disabled={!activeVariant || Object.keys(asset.variants).length <= 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRemoveVariant(asset);
                        }}
                        title={
                          !activeVariant
                            ? `${asset.name} does not have a ${activeLocale} variant to remove.`
                            : Object.keys(asset.variants).length <= 1
                              ? `Delete ${asset.name} entirely in Assets to remove its only remaining variant.`
                              : `Remove only the ${activeLocale} variant from ${asset.name}.`
                        }
                      >
                        {`Remove ${activeLocale}`}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">{resolveEmptyMediaMessage(mediaAssetFilter)}</p>
        )}
      </section>
      ) : null}
    </div>
  );
}

function collectStringLocalizationEntries(project: ProjectBundle, locale: string): ProjectTextEntry[] {
  return collectProjectTextEntries(project, locale).filter(
    (entry) => !entry.usages.some((usage) => usage.kind === "subtitleCue")
  );
}

function collectSubtitleLocalizationEntries(project: ProjectBundle, locale: string): SubtitleLocalizationEntry[] {
  const localizedStrings = getLocaleStringValues(project, locale);
  const defaultStrings = getLocaleStringValues(project, project.manifest.defaultLanguage);

  return project.scenes.items.flatMap((scene) =>
    scene.subtitleTracks.flatMap((track, trackIndex) =>
      track.cues.map((cue, cueIndex) => {
        const hasLocalizedValue = Object.prototype.hasOwnProperty.call(localizedStrings, cue.textId);
        const localizedValue = localizedStrings[cue.textId] ?? "";
        const status: SubtitleEntryStatus = !hasLocalizedValue
          ? "missing"
          : localizedValue.trim().length === 0
            ? "empty"
            : "translated";

        return {
          sceneId: scene.id,
          sceneName: scene.name,
          locationId: scene.locationId,
          trackId: track.id,
          trackIndex,
          cueId: cue.id,
          cueIndex,
          textId: cue.textId,
          startMs: cue.startMs,
          endMs: cue.endMs,
          defaultValue: defaultStrings[cue.textId] ?? "",
          localizedValue,
          status,
          navigation: {
            label: `${scene.name} subtitles`,
            tab: "scenes",
            locationId: scene.locationId,
            sceneId: scene.id
          }
        };
      })
    )
  );
}

function groupSubtitleEntriesByScene(entries: SubtitleLocalizationEntry[]): SubtitleSceneGroup[] {
  const groups = new Map<string, SubtitleSceneGroup>();

  for (const entry of entries) {
    const group = groups.get(entry.sceneId);
    if (group) {
      group.entries.push(entry);
      continue;
    }

    groups.set(entry.sceneId, {
      sceneId: entry.sceneId,
      sceneName: entry.sceneName,
      entries: [entry]
    });
  }

  return [...groups.values()];
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

function getSubtitleStatusLabel(status: SubtitleEntryStatus): string {
  switch (status) {
    case "missing":
      return "Missing";
    case "translated":
      return "Translated";
    case "empty":
      return "Empty";
  }
}

function mapSubtitleStatusToClassName(status: SubtitleEntryStatus): "missing" | "referenced" | "empty" {
  switch (status) {
    case "missing":
      return "missing";
    case "translated":
      return "referenced";
    case "empty":
      return "empty";
  }
}

function formatCueTiming(startMs: number, endMs: number): string {
  return `${startMs}ms - ${endMs}ms`;
}

function formatMediaCategoryLabel(category: MediaAssetFilter): string {
  switch (category) {
    case "background":
      return "Background";
    case "inventory":
      return "Inventory";
  }
}

function resolveEmptyMediaMessage(filter: MediaAssetFilter): string {
  switch (filter) {
    case "background":
      return "No background assets yet. Upload scene media from Scenes before localizing it here.";
    case "inventory":
      return "No inventory assets yet. Upload an inventory image from Inventory before localizing it here.";
  }
}

export function normalizeLocaleInput(input: string | undefined): string | undefined {
  const normalized = input?.trim().replace(/_/g, "-");
  return normalized ? normalized : undefined;
}

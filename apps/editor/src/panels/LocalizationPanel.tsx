import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  getLocaleStringValues,
  type Asset,
  type ProjectBundle,
  type StringTranslationState
} from "@mage2/schema";
import {
  BACKGROUND_IMPORT_EXTENSIONS,
  FOREGROUND_MEDIA_IMPORT_EXTENSIONS,
  INVENTORY_IMAGE_EXTENSIONS,
  SCENE_AUDIO_IMPORT_EXTENSIONS
} from "../asset-file-types";
import { useDialogs } from "../dialogs";
import { DropdownSelect } from "../DropdownSelect";
import { translateRuntimeMessage, useEditorI18n, type EditorMessageParams } from "../i18n";
import {
  addProjectLocale,
  getLocaleCompletenessStatus,
  getLocalizedAssetVariant,
  getSupportedProjectLocales,
  removeProjectLocale,
  setEditorLocalizedText,
  setEditorStringTranslationState,
  setProjectDefaultLocale
} from "../localized-project";
import {
  calculateStringCoverage,
  getLocalizedStringStatus,
  type LocalizedStringStatus
} from "../localization-workflow";
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

type StringsAreaFilter = "all" | "scenes" | "dialogue" | "inventory" | "player";
type MediaAssetFilter = "background" | "inventory" | "sceneAudio" | "foreground" | "response" | "player";
type LocalizationStatusFilter = "all" | LocalizedStringStatus;
type QueueItemStatus = LocalizedStringStatus | "present";
type QueueItemKind = "string" | "media";
type CopyTextIdFeedbackStatus = "copied" | "failed";
type EditorTranslator = (source: string, params?: EditorMessageParams) => string;

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
  complete: number;
  needsWork: number;
}

interface AssetUsage {
  label: string;
  detail: string;
  navigation: EditorNavigationTarget;
}

const LOCALIZATION_SUBTABS: ReadonlyArray<{
  id: LocalizationSection;
}> = [{ id: "overview" }, { id: "strings" }, { id: "media" }];

const QUEUE_GROUPS: ReadonlyArray<{
  status: QueueItemStatus;
  icon: LocalizationIconName;
}> = [
  { status: "missing", icon: "alert" },
  { status: "empty", icon: "circle" },
  { status: "inherited", icon: "copy" },
  { status: "draft", icon: "circle" },
  { status: "translated", icon: "check" },
  { status: "reviewed", icon: "shield" },
  { status: "source", icon: "text" },
  { status: "orphaned", icon: "unlink" },
  { status: "present", icon: "check" }
];

const TEXT_AREAS: ReadonlyArray<ProjectTextArea> = ["scenes", "dialogue", "inventory", "player"];
const COPY_TEXT_ID_FEEDBACK_MS = 1600;

export function LocalizationPanel({
  project,
  mutateProject,
  setSavedProject,
  setStatusMessage,
  setBusyLabel
}: LocalizationPanelProps) {
  const dialogs = useDialogs();
  const { t } = useEditorI18n();
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
  const setSelectedResponseGroupId = useEditorStore((state) => state.setSelectedResponseGroupId);
  const setSelectedResponseEntryId = useEditorStore((state) => state.setSelectedResponseEntryId);
  const setDialogueSection = useEditorStore((state) => state.setDialogueSection);
  const setSelectedInventoryItemId = useEditorStore((state) => state.setSelectedInventoryItemId);
  const supportedLocales = getSupportedProjectLocales(project);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LocalizationStatusFilter>("all");
  const [areaFilter, setAreaFilter] = useState<StringsAreaFilter>("all");
  const [sortOption, setSortOption] = useState<"status" | "textId" | "mostUses">("status");
  const [mediaAssetFilter, setMediaAssetFilter] = useState<MediaAssetFilter>(
    selectedAsset ? classifyEditorAssetCategory(selectedAsset) : "background"
  );
  const [copyTextIdFeedback, setCopyTextIdFeedback] = useState<{
    textId: string;
    status: CopyTextIdFeedbackStatus;
  }>();
  const copyTextIdFeedbackTimerRef = useRef<number | undefined>(undefined);
  const stringsListRef = useRef<HTMLDivElement | null>(null);
  const defaultLocaleStrings = getLocaleStringValues(project, project.manifest.defaultLanguage);

  const allStringEntries = useMemo(
    () => collectStringLocalizationEntries(project, activeLocale, t),
    [activeLocale, project, t]
  );
  const visibleStringEntries = useMemo(
    () =>
      filterLocalizedStringEntries(allStringEntries, {
        area: areaFilter,
        search,
        sort: sortOption,
        status: statusFilter,
        t
      }),
    [allStringEntries, areaFilter, search, sortOption, statusFilter, t]
  );
  const activeTextEntryId = resolveProjectTextSelection(visibleStringEntries, selectedTextId);
  const selectedStringEntry =
    visibleStringEntries.find((entry) => entry.textId === activeTextEntryId) ??
    allStringEntries.find((entry) => entry.textId === selectedTextId) ??
    visibleStringEntries[0];
  const stringMetrics = useMemo(() => calculateStringCoverage(allStringEntries), [allStringEntries]);
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
    () => (selectedMediaAsset ? collectAssetUsages(project, selectedMediaAsset, t) : []),
    [project, selectedMediaAsset, t]
  );
  const stringCoverageRows = useMemo(() => buildStringCoverageRows(allStringEntries, t), [allStringEntries, t]);
  const mediaCoverageRows = useMemo(() => buildMediaCoverageRows(project, activeLocale, t), [activeLocale, project, t]);
  const isDefaultLocale = activeLocale === project.manifest.defaultLanguage;
  const localeLabel = formatLocaleDisplayName(activeLocale, t);
  const queueItems = useMemo(
    () => buildQueueItems(project, activeLocale, visibleStringEntries, { search, areaFilter, statusFilter }, t),
    [activeLocale, areaFilter, project, search, statusFilter, t, visibleStringEntries]
  );
  const selectedQueueItem =
    queueItems.find((item) => item.kind === "media" && item.asset.id === selectedAssetId) ??
    queueItems.find((item) => item.kind === "string" && item.entry.textId === selectedTextId) ??
    (selectedStringEntry ? buildStringQueueItem(selectedStringEntry, defaultLocaleStrings, t) : undefined) ??
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

  useEffect(() => {
    return () => {
      if (copyTextIdFeedbackTimerRef.current !== undefined) {
        window.clearTimeout(copyTextIdFeedbackTimerRef.current);
      }
    };
  }, []);

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
    setSelectedResponseGroupId(target.responseGroupId);
    setSelectedResponseEntryId(target.responseEntryId);
    if (target.dialogueSection) {
      setDialogueSection(target.dialogueSection);
    }
    setSelectedInventoryItemId(target.inventoryItemId);
    setSelectedAssetId(target.assetId);
  }

  async function handleDeleteOrphanedEntries(textIds: string[]) {
    if (textIds.length === 0) {
      return;
    }

    const isBulkDelete = textIds.length > 1;
    const confirmed = await dialogs.confirm({
      title: isBulkDelete
        ? t("Delete {count} orphaned strings?", { count: textIds.length })
        : t("Delete {textId}?", { textId: textIds[0] }),
      body: (
        <>
          <p>
            {isBulkDelete
              ? t("Only the currently visible orphaned entries will be removed from the stored project text.")
              : t("This orphaned entry is no longer referenced anywhere in the project and will be removed from the stored project text.")}
          </p>
          <div className="dialog-callout">
            <strong>{t("Removing")}</strong>
            <ul className="dialog-detail-list">
              {textIds.slice(0, 8).map((textId) => (
                <li key={textId}>
                  <code>{textId}</code>
                </li>
              ))}
              {textIds.length > 8 ? (
                <li>
                  {t(textIds.length - 8 === 1 ? "{count} more entry" : "{count} more entries", {
                    count: textIds.length - 8
                  })}
                </li>
              ) : null}
            </ul>
          </div>
        </>
      ),
      confirmLabel: isBulkDelete ? t("Delete Orphans") : t("Delete Orphaned Entry"),
      cancelLabel: t("Keep Entries"),
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
      title: t("Add Locale"),
      description: t("Add a locale code like en, fr, or pt-BR. Source text is copied as Inherited and will not count as translated."),
      label: t("Locale Code"),
      placeholder: "fr",
      confirmLabel: t("Add Locale"),
      cancelLabel: t("Cancel")
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
      title: t("Remove locale {locale}?", { locale: activeLocale }),
      body: <p>{t("This removes the locale's stored text and media variants from the project.")}</p>,
      confirmLabel: t("Remove Locale"),
      cancelLabel: t("Keep Locale"),
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

  async function handleSetDefaultLocale() {
    if (isDefaultLocale) {
      return;
    }

    const confirmed = await dialogs.confirm({
      title: t("Make {locale} the project default?", { locale: activeLocale }),
      body: (
        <>
          <p>{t("This makes {locale} the source locale for strings and media throughout the project.", { locale: activeLocale })}</p>
          <div className="dialog-callout">
            <strong>{t("Workflow states will be recalculated")}</strong>
            <p>{t("Values that do not match the new source return to Draft so they are not reported as complete without review.")}</p>
          </div>
        </>
      ),
      confirmLabel: t("Change Project Default"),
      cancelLabel: t("Keep Current Default")
    });
    if (!confirmed) {
      return;
    }

    mutateProject((draft) => {
      setProjectDefaultLocale(draft, activeLocale);
    });
    setStatusMessage(t("{locale} is now the project default source locale.", { locale: activeLocale }));
  }

  async function handleImportVariant(asset: Asset) {
    const isReplacingVariant = Boolean(getLocalizedAssetVariant(asset, activeLocale));
    const filePaths = await dialogs.pickFiles({
      title: isReplacingVariant
        ? t("Replace {locale} Variant", { locale: activeLocale })
        : t("Add {locale} Variant", { locale: activeLocale }),
      description: t("Choose a {kind} file for the {locale} variant of {name}.", {
        kind: formatAssetKindLabel(asset.kind, t).toLocaleLowerCase(),
        locale: activeLocale,
        name: asset.name
      }),
      initialPath: resolveAssetImportInitialPath(project, activeLocale) ?? useEditorStore.getState().projectDir,
      confirmLabel: t("Use This File"),
      allowedExtensions: resolveAssetVariantImportExtensions(asset)
    });
    const filePath = filePaths[0];
    if (!filePath) {
      return;
    }

    try {
      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error(t("No project directory is currently open."));
      }

      setBusyLabel(t("Updating localized media"));
      const updatedAsset = await window.editorApi.importAssetVariant(projectDir, asset, activeLocale, filePath);
      mutateProject((draft) => {
        const index = draft.assets.assets.findIndex((entry) => entry.id === asset.id);
        if (index >= 0) {
          draft.assets.assets[index] = updatedAsset;
        }
      });
      setSelectedAssetId(asset.id);
      setSelectedTextId(undefined);
      setStatusMessage(
        t(isReplacingVariant
          ? "Updated {locale} variant for {name}. Save the project to keep this change."
          : "Added {locale} variant for {name}. Save the project to keep this change.", {
          locale: activeLocale,
          name: asset.name
        })
      );
    } catch (error) {
      const message = translateRuntimeMessage(error, t);
      setStatusMessage(t("Variant import failed: {message}", { message }));
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
      setStatusMessage(t("Delete {name} entirely in Assets if you want to remove its only locale variant.", { name: asset.name }));
      return;
    }

    const confirmed = await dialogs.confirm({
      title: t("Remove {locale} variant from {name}?", { locale: activeLocale, name: asset.name }),
      body: <p>{t("This removes the stored file and generated proxies for the selected locale variant only.")}</p>,
      confirmLabel: t("Remove Variant"),
      cancelLabel: t("Keep Variant"),
      tone: "danger"
    });
    if (!confirmed) {
      return;
    }

    try {
      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error(t("No project directory is currently open."));
      }

      setBusyLabel(t("Removing localized media"));
      const nextProject = structuredClone(project) as ProjectBundle;
      const target = nextProject.assets.assets.find((entry) => entry.id === asset.id);
      if (!target) {
        throw new Error(t("Asset is no longer present."));
      }

      delete target.variants[activeLocale];
      const result = await window.editorApi.saveProject(projectDir, nextProject);
      await window.editorApi.deleteManagedAssetVariantFiles(projectDir, asset, activeLocale, result.project.assets.assets);
      setSavedProject(result.project);
      setSelectedAssetId(asset.id);
      setSelectedTextId(undefined);
      setStatusMessage(t("Removed {locale} variant from {name}.", { locale: activeLocale, name: asset.name }));
    } catch (error) {
      const message = translateRuntimeMessage(error, t);
      setStatusMessage(t("Variant removal failed: {message}", { message }));
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
      setStatusMessage(t(status === "missing" ? "No missing strings for this locale." : "No empty strings for this locale."));
      return;
    }

    setSelectedTextId(nextEntry.textId);
    setSelectedAssetId(undefined);
    setStatusFilter(status);
    setLocalizationSection("overview");
  }

  async function handleCopyTextId(textId: string) {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error(t("Clipboard is not available."));
      }

      await navigator.clipboard.writeText(textId);
      showCopyTextIdFeedback(textId, "copied");
      setStatusMessage(t("Copied text id {textId}.", { textId }));
    } catch (error) {
      const message = translateRuntimeMessage(error, t);
      showCopyTextIdFeedback(textId, "failed");
      setStatusMessage(t("Copy text id failed: {message}", { message }));
    }
  }

  function showCopyTextIdFeedback(textId: string, status: CopyTextIdFeedbackStatus) {
    setCopyTextIdFeedback({ textId, status });

    if (copyTextIdFeedbackTimerRef.current !== undefined) {
      window.clearTimeout(copyTextIdFeedbackTimerRef.current);
    }

    copyTextIdFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyTextIdFeedback((current) =>
        current?.textId === textId && current.status === status ? undefined : current
      );
      copyTextIdFeedbackTimerRef.current = undefined;
    }, COPY_TEXT_ID_FEEDBACK_MS);
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
        copyFeedback={
          copyTextIdFeedback && selectedStringEntry?.textId === copyTextIdFeedback.textId
            ? copyTextIdFeedback.status
            : undefined
        }
        onCopyTextId={handleCopyTextId}
        onChange={(entry, value) =>
          mutateProject((draft) => {
            setEditorLocalizedText(draft, activeLocale, entry.textId, value);
          })
        }
        onStateChange={(entry, state) =>
          mutateProject((draft) => {
            setEditorStringTranslationState(draft, activeLocale, entry.textId, state);
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
          <span className="localization-commandbar__label">{t("Editing locale")}</span>
          <label className="localization-locale-select">
            <span className="localization-locale-select__icon" aria-hidden="true">
              <LocalizationIcon name="globe" />
            </span>
            <DropdownSelect value={activeLocale} onChange={(event) => setLocalizationLocale(event.target.value)}>
              {supportedLocales.map((locale) => (
                <option key={locale} value={locale}>
                  {formatLocaleDisplayName(locale, t)}
                </option>
              ))}
            </DropdownSelect>
            {isDefaultLocale ? <span className="localization-default-chip">{t("Project default")}</span> : null}
          </label>
        </div>
        <div className="localization-commandbar__actions">
          <button type="button" className="button-secondary localization-command-button" onClick={() => void handleAddLocale()}>
            <LocalizationIcon name="plus" />
            <span>{t("Add Locale")}</span>
          </button>
          <button
            type="button"
            className="button-secondary localization-command-button"
            disabled={isDefaultLocale}
            onClick={() => void handleSetDefaultLocale()}
            title={t("Make the selected locale the project default authoring locale.")}
          >
            <LocalizationIcon name="star" />
            <span>{t("Set as Default")}</span>
          </button>
          <button
            type="button"
            className="button-danger-quiet localization-command-button localization-command-button--danger"
            disabled={isDefaultLocale}
            onClick={() => void handleRemoveLocale()}
            title={t("Remove the selected non-default locale from the project.")}
          >
            <LocalizationIcon name="trash" />
            <span>{t("Remove Locale")}</span>
          </button>
        </div>
      </section>

      <section className="panel localization-health-panel" aria-label={t("Locale health for {locale}", { locale: localeLabel })}>
        <div className="localization-health-panel__header">
          <h3>{t("Locale Health - {locale}", { locale: localeLabel })}</h3>
        </div>
        <div className="localization-health-grid">
          <HealthMetricCard
            icon="check"
            tone="ready"
            value={stringMetrics.complete}
            label={t(isDefaultLocale ? "Source authored" : "Translation complete")}
            detail={t("{percent} of total", { percent: formatCoveragePercent(stringMetrics.complete, stringMetrics.total) })}
          />
          {isDefaultLocale ? (
            <>
              <HealthMetricCard
                icon="alert"
                tone="missing"
                value={stringMetrics.missing}
                label={t("Source strings missing")}
                detail={t("{percent} of total", { percent: formatCoveragePercent(stringMetrics.missing, stringMetrics.total) })}
              />
              <HealthMetricCard
                icon="circle"
                tone="empty"
                value={stringMetrics.empty}
                label={t("Empty source strings")}
                detail={t("{percent} of total", { percent: formatCoveragePercent(stringMetrics.empty, stringMetrics.total) })}
              />
            </>
          ) : (
            <>
              <HealthMetricCard
                icon="copy"
                tone="inherited"
                value={stringMetrics.inherited}
                label={t("Inherited copies")}
                detail={t("Excluded from completion")}
              />
              <HealthMetricCard
                icon="circle"
                tone="draft"
                value={stringMetrics.draft}
                label={t("Draft strings")}
                detail={t("Excluded from completion")}
              />
              <HealthMetricCard
                icon="alert"
                tone="missing"
                value={stringMetrics.missing + stringMetrics.empty}
                label={t("Strings missing")}
                detail={t("{percent} of total", { percent: formatCoveragePercent(stringMetrics.missing + stringMetrics.empty, stringMetrics.total) })}
              />
            </>
          )}
          <HealthMetricCard
            icon="image"
            tone="missing"
            value={mediaCoverage.missing}
            label={t("Media missing")}
            detail={t("{percent} of total", { percent: formatCoveragePercent(mediaCoverage.missing, mediaCoverage.total) })}
          />
          <HealthMetricCard
            icon="unlink"
            tone="orphaned"
            value={stringMetrics.orphaned}
            label={t("Orphans")}
            detail={t("No references")}
          />
        </div>
      </section>

      <nav className="localization-subtab-strip localization-view-switch" role="tablist" aria-label={t("Localization sections")}>
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
            {t(getLocalizationSubtabLabel(section.id))}
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
            items={visibleStringEntries.map((entry) => buildStringQueueItem(entry, defaultLocaleStrings, t))}
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
            copyFeedback={
              copyTextIdFeedback && selectedStringEntry?.textId === copyTextIdFeedback.textId
                ? copyTextIdFeedback.status
                : undefined
            }
            onCopyTextId={handleCopyTextId}
            onChange={(entry, value) =>
              mutateProject((draft) => {
                setEditorLocalizedText(draft, activeLocale, entry.textId, value);
              })
            }
            onStateChange={(entry, state) =>
              mutateProject((draft) => {
                setEditorStringTranslationState(draft, activeLocale, entry.textId, state);
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
          {t(isDefaultLocale ? "Project default locale" : "Editing locale")}: {activeLocale}
          {isDefaultLocale ? null : (
            <span className="localization-footer__source">
              {t("Project default: {locale}", { locale: project.manifest.defaultLanguage })}
            </span>
          )}
        </span>
        <span>{t("Total Strings: {count}", { count: stringMetrics.total })}</span>
        <span>
          {t("{label}: {count} ({percent})", {
            label: t(isDefaultLocale ? "Source authored" : "Complete"),
            count: stringMetrics.complete,
            percent: formatCoveragePercent(stringMetrics.complete, stringMetrics.total)
          })}
        </span>
        {isDefaultLocale ? null : <span>{t("Inherited: {count}", { count: stringMetrics.inherited })}</span>}
        {isDefaultLocale ? null : <span>{t("Draft: {count}", { count: stringMetrics.draft })}</span>}
        {isDefaultLocale ? null : <span>{t("Translated: {count}", { count: stringMetrics.translated })}</span>}
        {isDefaultLocale ? null : <span>{t("Reviewed: {count}", { count: stringMetrics.reviewed })}</span>}
        <span>{t("Missing or empty: {count}", { count: stringMetrics.missing + stringMetrics.empty })}</span>
        <span>{t("Orphans: {count}", { count: stringMetrics.orphaned })}</span>
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
  const { t } = useEditorI18n();

  return (
    <aside className="localization-queue-pane">
      <div className="localization-queue-controls">
        <label className="localization-search-field">
          <span className="field-label--inset">{t("Search")}</span>
          <input
            value={search}
            placeholder={t("Search text id, asset, or source text...")}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <LocalizationIcon name="search" />
        </label>
        <label className="localization-filter">
          <span className="field-label--inset">{t("Area")}</span>
          <DropdownSelect value={areaFilter} onChange={(event) => onAreaFilterChange(event.target.value as StringsAreaFilter)}>
            <option value="all">{t("All Areas")}</option>
            <option value="scenes">{t("Scenes")}</option>
            <option value="dialogue">{t("Dialogue")}</option>
            <option value="inventory">{t("Inventory")}</option>
            <option value="player">{t("Player")}</option>
          </DropdownSelect>
        </label>
        <label className="localization-filter">
          <span className="field-label--inset">{t("Status")}</span>
          <DropdownSelect value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as LocalizationStatusFilter)}>
            <option value="all">{t("All Statuses")}</option>
            <option value="missing">{t("Missing")}</option>
            <option value="empty">{t("Empty")}</option>
            <option value="inherited">{t("Inherited")}</option>
            <option value="draft">{t("Draft")}</option>
            <option value="translated">{t("Translated")}</option>
            <option value="reviewed">{t("Reviewed")}</option>
            <option value="source">{t("Source")}</option>
            <option value="orphaned">{t("Orphaned")}</option>
          </DropdownSelect>
        </label>
        <label className="localization-filter">
          <span className="field-label--inset">{t("Sort")}</span>
          <DropdownSelect value={sortOption} onChange={(event) => onSortChange(event.target.value as "status" | "textId" | "mostUses")}>
            <option value="status">{t("Status then ID")}</option>
            <option value="textId">{t("Text ID A-Z")}</option>
            <option value="mostUses">{t("Most Uses")}</option>
          </DropdownSelect>
        </label>
      </div>

      <div className="localization-queue-summary">
        <span>
          {hasActiveSearchOrFilter
            ? t("{visible} of {total} visible", { visible: items.length, total: totalCount })
            : t("Sorted by priority for {locale}", { locale: activeLocale })}
        </span>
        <LocalizationIcon name="sort" />
      </div>

      {visibleOrphanCount > 0 ? (
        <div className="localization-orphan-action">
          <span>{t(visibleOrphanCount === 1 ? "{count} visible orphaned entry" : "{count} visible orphaned entries", { count: visibleOrphanCount })}</span>
          <button type="button" className="button-danger-quiet button-danger--compact" onClick={onDeleteVisibleOrphans}>
            {t("Delete Orphans")}
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
                   {t("{label} ({count})", { label: getQueueGroupLabel(group.status, t), count: groupItems.length })}
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
          <p className="muted localization-empty-state">{t("No localization work matches the current filters.")}</p>
        )}
      </div>

      <div className="localization-queue-pager" aria-label={t("Visible localization range")}>
        <span>{t("{start}-{end} of {count} items", { start: items.length > 0 ? 1 : 0, end: Math.min(items.length, 25), count: items.length })}</span>
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
  const { t } = useEditorI18n();
  const items = assets.map((asset) => buildMediaQueueItem(asset, activeLocale, t));

  return (
    <aside className="localization-queue-pane">
      <div className="localization-queue-controls localization-queue-controls--media">
        <label className="localization-search-field">
          <span className="field-label--inset">{t("Search")}</span>
          <input
            value={search}
            placeholder={t("Search media assets...")}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <LocalizationIcon name="search" />
        </label>
        <label className="localization-filter">
          <span className="field-label--inset">{t("Category")}</span>
          <DropdownSelect value={category} onChange={(event) => onCategoryChange(event.target.value as MediaAssetFilter)}>
            <option value="background">{t("Background")}</option>
            <option value="sceneAudio">{t("Scene Audio")}</option>
            <option value="foreground">{t("Foreground Media")}</option>
            <option value="response">{t("Responses")}</option>
            <option value="inventory">{t("Inventory")}</option>
            <option value="player">{t("Player")}</option>
          </DropdownSelect>
        </label>
      </div>

      <div className="localization-queue-summary">
        <span>{t(items.length === 1 ? "{count} {category} asset" : "{count} {category} assets", {
          count: items.length,
          category: formatMediaCategoryLabel(category, t).toLocaleLowerCase()
        })}</span>
      </div>

      <div className="localization-queue-list">
        {items.length > 0 ? (
          QUEUE_GROUPS.filter((group) => group.status === "missing" || group.status === "present").map((group) => {
            const groupItems = items.filter((item) => item.status === group.status);
            if (groupItems.length === 0) {
              return null;
            }

            return (
              <section key={group.status} className={`localization-queue-group localization-queue-group--${group.status}`}>
                <h4>
                  <LocalizationIcon name={group.status === "missing" ? "image" : "check"} />
                  {t("{label} ({count})", {
                    label: t(group.status === "missing" ? "Missing Variants" : "Present"),
                    count: groupItems.length
                  })}
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
          <p className="muted localization-empty-state">{resolveEmptyMediaMessage(category, t)}</p>
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
  const { t } = useEditorI18n();

  return (
    <button
      type="button"
      className={selected ? "localization-queue-row localization-queue-row--selected" : "localization-queue-row"}
      onClick={onSelect}
      title={t("Inspect {title}.", { title: item.title })}
    >
      <span className="localization-queue-row__icon" aria-hidden="true">
        <LocalizationIcon name={item.kind === "media" ? "image" : "text"} />
      </span>
      <span className="localization-queue-row__area">{item.areaLabel}</span>
      <code>{item.title}</code>
      <span className="localization-queue-row__preview">{item.preview}</span>
      <span className={`localization-status localization-status--${item.status}`}>{getQueueItemStatusLabel(item, t)}</span>
      <LocalizationIcon name="chevronRight" />
    </button>
  );
}

function StringDetailPanel({
  activeLocale,
  defaultLocale,
  defaultValue,
  entry,
  copyFeedback,
  onCopyTextId,
  onChange,
  onStateChange,
  onFocus,
  onNavigate
}: {
  activeLocale: string;
  defaultLocale: string;
  defaultValue: string;
  entry?: ProjectTextEntry;
  copyFeedback?: CopyTextIdFeedbackStatus;
  onCopyTextId: (textId: string) => void | Promise<void>;
  onChange: (entry: ProjectTextEntry, value: string) => void;
  onStateChange: (entry: ProjectTextEntry, state: StringTranslationState) => void;
  onFocus: (entry: ProjectTextEntry) => void;
  onNavigate: (target: EditorNavigationTarget, textId?: string) => void;
}) {
  const { t } = useEditorI18n();

  if (!entry) {
    return (
      <section className="panel localization-detail-panel">
        <p className="muted localization-empty-state">{t("Select a string to inspect and edit it.")}</p>
      </section>
    );
  }

  const status = getLocalizedStringStatus(entry);
  const copyFeedbackLabel =
    copyFeedback === "copied"
      ? t("Copied text id {textId}.", { textId: entry.textId })
      : copyFeedback === "failed"
        ? t("Copy text id failed for {textId}.", { textId: entry.textId })
        : undefined;

  return (
    <section className="panel localization-detail-panel">
      <header className="localization-detail-header">
        <div>
          <div className="localization-detail-title">
            <code>{entry.textId}</code>
            <button
              type="button"
              className={
                copyFeedback
                  ? `localization-icon-button localization-icon-button--${copyFeedback}`
                  : "localization-icon-button"
              }
              title={copyFeedbackLabel ?? t("Copy text id {textId}", { textId: entry.textId })}
              aria-label={copyFeedbackLabel ?? t("Selected text id {textId}", { textId: entry.textId })}
              onClick={() => void onCopyTextId(entry.textId)}
            >
              <LocalizationIcon name={copyFeedback === "copied" ? "check" : copyFeedback === "failed" ? "alert" : "copy"} />
              <span className="sr-only" aria-live="polite">
                {copyFeedbackLabel ?? ""}
              </span>
            </button>
          </div>
          <p className="muted">{summarizeProjectTextUsages(entry.usages, t)}</p>
        </div>
        <div className="localization-detail-header__badges">
          {resolveUsageAreaLabels(entry.usages, t).map((area) => (
            <span key={area} className="localization-area">
              {area}
            </span>
          ))}
          <span className={`localization-status localization-status--${status}`}>{getLocalizedStringStatusLabel(status, t)}</span>
        </div>
      </header>

      {entry.isSourceLocale ? (
        <div className="localization-source-editor">
          <label className="localization-text-field localization-text-field--source localization-text-field--source-editable">
            <span>
              {t("Source text")} <small>({defaultLocale})</small>
              <span className="localization-default-chip">{t("Project default")}</span>
            </span>
            <textarea
              value={entry.value}
              placeholder={t("Enter the project source text...")}
              title={t("Edit the source text stored under {textId}.", { textId: entry.textId })}
              onFocus={() => onFocus(entry)}
              onChange={(event) => onChange(entry, event.target.value)}
            />
            <small>{entry.value.length} / 500</small>
          </label>
          <p className="localization-source-editor__note">
            {t("This is the single source value. New locales inherit it, and edits refresh existing Inherited copies.")}
          </p>
        </div>
      ) : (
        <>
          <div className="localization-translation-editor">
            <label className="localization-text-field localization-text-field--source">
              <span>
                {t("Source")} <small>({defaultLocale})</small>
                <span className="localization-default-chip">{t("Project default")}</span>
              </span>
              <textarea value={defaultValue} readOnly />
              <small>{defaultValue.length} / 500</small>
            </label>
            <div className="localization-translation-arrow" aria-hidden="true">
              <LocalizationIcon name="arrowRight" />
            </div>
            <label className="localization-text-field localization-text-field--target">
              <span>
                {t("Translation")} <small>({activeLocale})</small>
              </span>
              <textarea
                value={entry.value}
                placeholder={t("Enter {locale} translation...", { locale: formatLocaleDisplayName(activeLocale, t) })}
                title={t("Edit the localized text stored under {textId}. Editing marks it Draft.", { textId: entry.textId })}
                onFocus={() => onFocus(entry)}
                onChange={(event) => onChange(entry, event.target.value)}
              />
              <small>{entry.value.length} / 500</small>
            </label>
          </div>
          <section className="localization-workflow-state" aria-label={t("Translation workflow state")}>
            <div>
              <strong>{t("Workflow state")}</strong>
              <span>{t("Only Translated and Reviewed count toward completion. Editing returns this string to Draft.")}</span>
            </div>
            <div className="localization-workflow-state__actions" role="group" aria-label={t("Set translation workflow state")}>
              <button
                type="button"
                className={status === "inherited" ? "button-secondary localization-state-button localization-state-button--active" : "button-secondary localization-state-button"}
                disabled={!defaultValue}
                onClick={() => onStateChange(entry, "inherited")}
              >
                {t("Inherit source")}
              </button>
              <button
                type="button"
                className={status === "draft" ? "button-secondary localization-state-button localization-state-button--active" : "button-secondary localization-state-button"}
                disabled={entry.status === "missing"}
                onClick={() => onStateChange(entry, "draft")}
              >
                {t("Mark Draft")}
              </button>
              <button
                type="button"
                className={status === "translated" ? "button-secondary localization-state-button localization-state-button--active" : "button-secondary localization-state-button"}
                disabled={entry.value.trim().length === 0}
                onClick={() => onStateChange(entry, "translated")}
              >
                {t("Mark Translated")}
              </button>
              <button
                type="button"
                className={status === "reviewed" ? "button-secondary localization-state-button localization-state-button--active" : "button-secondary localization-state-button"}
                disabled={entry.value.trim().length === 0}
                onClick={() => onStateChange(entry, "reviewed")}
              >
                {t("Mark Reviewed")}
              </button>
            </div>
          </section>
        </>
      )}

      <section className="localization-detail-block">
        <div className="localization-detail-block__header">
          <h4>{t("Usage Locations ({count})", { count: entry.usages.length })}</h4>
          {entry.usages.length > 1 ? (
            <button type="button" className="localization-link-button" onClick={() => onNavigate(entry.usages[0].navigation, entry.textId)}>
              {t("Jump to all")}
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
                  <span>{formatProjectTextUsageKind(usage.kind, t)}</span>
                </div>
                <button
                  type="button"
                  className="button-secondary localization-usage-button"
                  onClick={() => onNavigate(usage.navigation, entry.textId)}
                  title={t("Open {owner} in the {tab} tab.", {
                    owner: usage.ownerLabel,
                    tab: formatNavigationTabLabel(usage.navigation.tab, t)
                  })}
                >
                  {t("Open {label}", { label: usage.navigation.label })}
                  <LocalizationIcon name="external" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted localization-empty-state">{t("No editor surfaces currently reference this text id.")}</p>
        )}
      </section>

      <section className="localization-detail-block localization-detail-block--metadata">
        <h4>{t("Metadata")}</h4>
        <dl className="localization-metadata-grid">
          <dt>{t("Uses")}</dt>
          <dd>{entry.usages.length}</dd>
          <dt>{t("Stored Value")}</dt>
          <dd>{t(entry.value.length > 0 ? "Yes" : "Empty")}</dd>
          <dt>{t("Source Length")}</dt>
          <dd>{defaultValue.length}</dd>
          <dt>{t("Status")}</dt>
          <dd>{getLocalizedStringStatusLabel(status, t)}</dd>
          <dt>{t("Text ID")}</dt>
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
  const { t } = useEditorI18n();

  if (!asset) {
    return (
      <section className="panel localization-detail-panel">
        <p className="muted localization-empty-state">{t("Select a media asset to inspect its localized variants.")}</p>
      </section>
    );
  }

  const sourceVariant = getLocalizedAssetVariant(asset, projectDefaultLocale);
  const activeVariant = isDefaultLocale ? sourceVariant : getLocalizedAssetVariant(asset, activeLocale);
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
            {formatMediaCategoryLabel(category, t)} / {formatAssetKindLabel(asset.kind, t)}
            {" / "}
            {activeVariant?.durationMs
              ? t("{duration}s", { duration: Math.round(activeVariant.durationMs / 100) / 10 })
              : t("still")}
            {activeVariant?.width && activeVariant?.height ? ` / ${activeVariant.width}x${activeVariant.height}` : ""}
          </p>
        </div>
        <span className={`localization-status localization-status--${activeVariant ? (isDefaultLocale ? "source" : "present") : "missing"}`}>
          {t(activeVariant ? (isDefaultLocale ? "Source" : "Present") : "Missing")}
        </span>
      </header>

      <div className={isDefaultLocale ? "localization-media-variant-grid localization-media-variant-grid--single" : "localization-media-variant-grid"}>
        <section>
          <div className="localization-media-variant-grid__header">
            <h4>{t(isDefaultLocale ? "Default media" : "Source")} ({projectDefaultLocale})</h4>
            <span className="localization-default-chip">{t("Project default")}</span>
          </div>
          <AssetPreview asset={asset} locale={projectDefaultLocale} allowSourceFallback preferPosterForImages fit="contain" />
        </section>
        {isDefaultLocale ? null : (
          <section>
            <div className="localization-media-variant-grid__header">
              <h4>{t("Target ({locale})", { locale: activeLocale })}</h4>
              <span className={`localization-status localization-status--${activeVariant ? "present" : "missing"}`}>
                {t(activeVariant ? "Present" : "Missing")}
              </span>
            </div>
            <AssetPreview
              asset={asset}
              locale={activeLocale}
              preferPosterForImages
              fit="contain"
              emptyTitle={t("{locale} variant missing", { locale: activeLocale })}
              emptyBody={t("Import a localized media file for this locale.")}
            />
          </section>
        )}
      </div>

      <div className="localization-media-actions">
        <button type="button" className="button-secondary localization-command-button" onClick={onImportVariant}>
          <LocalizationIcon name="upload" />
          <span>
            {activeVariant
              ? t("Replace {locale}", { locale: isDefaultLocale ? t("default") : activeLocale })
              : t("Import {locale} Variant", { locale: activeLocale })}
          </span>
        </button>
        <button
          type="button"
          className="button-danger-quiet localization-command-button"
          disabled={!activeVariant || Object.keys(asset.variants).length <= 1}
          onClick={onRemoveVariant}
          title={
            !activeVariant
              ? t("{name} does not have a {locale} variant to remove.", { name: asset.name, locale: activeLocale })
              : Object.keys(asset.variants).length <= 1
                ? t("Delete {name} entirely in Assets to remove its only remaining variant.", { name: asset.name })
                : t("Remove only the {locale} variant from {name}.", { locale: activeLocale, name: asset.name })
          }
        >
          <LocalizationIcon name="trash" />
          <span>{t("Remove {locale}", { locale: activeLocale })}</span>
        </button>
      </div>

      <section className="localization-detail-block localization-detail-block--metadata">
        <h4>{t("Variant Coverage")}</h4>
        <dl className="localization-metadata-grid">
          <dt>{t("Present")}</dt>
          <dd>{localeStatus.present.join(", ") || t("none")}</dd>
          <dt>{t("Missing")}</dt>
          <dd>{localeStatus.missing.join(", ") || t("none")}</dd>
          <dt>{t("Asset ID")}</dt>
          <dd>{asset.id}</dd>
          <dt>{t("Preview")}</dt>
          <dd>{t(activeVariant?.proxyPath ? "Ready" : activeVariant ? "Source only" : "Missing")}</dd>
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
  const { t } = useEditorI18n();
  const primaryUsage = selectedStringEntry?.usages[0];
  const primaryAssetUsage = assetUsages[0];
  const selectedStatus = selectedStringEntry ? getLocalizedStringStatus(selectedStringEntry) : asset ? (getLocalizedAssetVariant(asset, activeLocale) ? "present" : "missing") : undefined;

  return (
    <aside className="panel localization-rail">
      <div className="localization-rail__title">
        <h3>{t("Usage and Coverage")}</h3>
        <div aria-hidden="true">
          <LocalizationIcon name="pin" />
          <LocalizationIcon name="close" />
        </div>
      </div>

      <section className="localization-rail-section">
        <div className="localization-rail-section__header">
          <h4>{t("Where Used")}</h4>
          <span className="muted">
            {t((selectedStringEntry?.usages.length ?? assetUsages.length) === 1 ? "{count} location" : "{count} locations", {
              count: selectedStringEntry?.usages.length ?? assetUsages.length
            })}
          </span>
        </div>
        {primaryUsage ? (
          <RailUsageBlock
            icon={primaryUsage.navigation.tab === "dialogue" ? "message" : "image"}
            label={primaryUsage.ownerLabel}
            detail={formatProjectTextUsageKind(primaryUsage.kind, t)}
            actionLabel={t("Open {label}", { label: primaryUsage.navigation.label })}
            onNavigate={() => onNavigate(primaryUsage.navigation, selectedStringEntry?.textId)}
          />
        ) : primaryAssetUsage ? (
          <RailUsageBlock
            icon={asset?.kind === "audio" ? "audio" : "image"}
            label={primaryAssetUsage.label}
            detail={primaryAssetUsage.detail}
            actionLabel={t("Open {label}", { label: primaryAssetUsage.navigation.label })}
            onNavigate={() => onNavigate(primaryAssetUsage.navigation)}
          />
        ) : (
          <p className="muted localization-empty-state">{t("No editor surfaces currently reference this item.")}</p>
        )}
      </section>

      <section className="localization-rail-section">
        <h4>{t("Next Step")}</h4>
        <div className={`localization-next-step localization-next-step--${selectedStatus ?? "present"}`}>
          <LocalizationIcon name={getLocalizedStatusIcon(selectedStatus)} />
          <div>
            <strong>{resolveNextStepTitle(selectedStatus, t)}</strong>
            <span>{resolveNextStepBody(selectedStatus, activeLocale, t)}</span>
          </div>
        </div>
      </section>

      <section className="localization-rail-section">
        <div className="localization-rail-section__header">
          <h4>{t("Locale Coverage")}</h4>
          <span className="muted">{activeLocale}</span>
        </div>
        <CoverageTable rows={[...stringCoverageRows, ...mediaCoverageRows]} />
      </section>

      <section className="localization-rail-section">
        <h4>{t("Quick Actions")}</h4>
        <div className="localization-quick-actions">
          <button type="button" className="button-secondary" onClick={onFindNextMissing}>
            <LocalizationIcon name="circle" />
            {t("Find Next Missing")}
            <kbd>F</kbd>
          </button>
          <button type="button" className="button-secondary" onClick={onFindNextEmpty}>
            <LocalizationIcon name="circle" />
            {t("Find Next Empty")}
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
  const { t } = useEditorI18n();

  return (
    <div className="localization-coverage-table">
      <div className="localization-coverage-table__header">
        <span>{t("Area")}</span>
        <span>{t("Total")}</span>
        <span>{t("Complete")}</span>
        <span>{t("Needs work")}</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="localization-coverage-table__row">
          <span>{row.label}</span>
          <span>{row.total}</span>
          <span>{row.complete} ({formatCoveragePercent(row.complete, row.total)})</span>
          <span className={row.needsWork > 0 ? "localization-coverage-table__missing" : ""}>{row.needsWork}</span>
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
  tone: "missing" | "empty" | "inherited" | "draft" | "orphaned" | "ready";
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
  | "shield"
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
    // i18n-ignore-next-line -- SVG path geometry, not user-facing text.
    message: <path d="M4 5h16v10H8l-4 4V5Z" />,
    pin: <path d="M8 3h8l-1 5 3 3v2h-5v7l-1 1-1-1v-7H6v-2l3-3-1-5Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />,
    shield: <path d="M12 3 20 6v5.8c0 4.7-2.8 7.6-8 9.2-5.2-1.6-8-4.5-8-9.2V6l8-3Zm-3.5 9 2.2 2.2 4.8-5" />,
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

function collectStringLocalizationEntries(
  project: ProjectBundle,
  locale: string,
  t: EditorTranslator
): ProjectTextEntry[] {
  return collectProjectTextEntries(project, locale, t);
}

function filterLocalizedStringEntries(
  entries: ProjectTextEntry[],
  options: {
    area: StringsAreaFilter;
    search: string;
    sort: "status" | "textId" | "mostUses";
    status: LocalizationStatusFilter;
    t: EditorTranslator;
  }
): ProjectTextEntry[] {
  const baseStatus = options.status === "missing" || options.status === "orphaned" ? options.status : "all";

  return filterProjectTextEntries(entries, {
    area: options.area,
    search: options.search,
    sort: options.sort,
    status: baseStatus,
    translate: options.t
  }).filter((entry) => options.status === "all" || getLocalizedStringStatus(entry) === options.status);
}

function buildQueueItems(
  project: ProjectBundle,
  locale: string,
  visibleStringEntries: ProjectTextEntry[],
  options: {
    areaFilter: StringsAreaFilter;
    search: string;
    statusFilter: LocalizationStatusFilter;
  },
  t: EditorTranslator
): LocalizationQueueItem[] {
  const defaultLocaleStrings = getLocaleStringValues(project, project.manifest.defaultLanguage);
  const stringItems = visibleStringEntries.map((entry) => buildStringQueueItem(entry, defaultLocaleStrings, t));
  const mediaItems =
    options.areaFilter === "all"
      ? project.assets.assets
          .filter((asset) => matchesMediaSearch(asset, options.search))
          .map((asset) => buildMediaQueueItem(asset, locale, t))
          .filter((item) => options.statusFilter === "all" || item.status === options.statusFilter)
      : [];

  return [...stringItems, ...mediaItems].sort(compareQueueItems);
}

function buildStringQueueItem(
  entry: ProjectTextEntry,
  defaultLocaleStrings: Record<string, string>,
  t: EditorTranslator
): StringQueueItem {
  const usageAreas = resolveUsageAreaLabels(entry.usages, t);
  const sourceValue = defaultLocaleStrings[entry.textId] ?? "";
  const status = getLocalizedStringStatus(entry);

  return {
    id: `string:${entry.textId}`,
    kind: "string",
    entry,
    status,
    areaLabel: usageAreas[0] ?? t("Stored"),
    title: entry.textId,
    subtitle: summarizeProjectTextUsages(entry.usages, t),
    preview: entry.value || sourceValue || summarizeProjectTextUsages(entry.usages, t)
  };
}

function buildMediaQueueItem(asset: Asset, locale: string, t: EditorTranslator): MediaQueueItem {
  const category = classifyEditorAssetCategory(asset);
  const activeVariant = getLocalizedAssetVariant(asset, locale);

  return {
    id: `media:${asset.id}`,
    kind: "media",
    asset,
    category,
    status: activeVariant ? "present" : "missing",
    areaLabel: formatMediaCategoryLabel(category, t),
    title: asset.name,
    subtitle: `${formatMediaCategoryLabel(category, t)} / ${formatAssetKindLabel(asset.kind, t)}`,
    preview: t(activeVariant ? "{locale} variant present" : "{locale} variant missing", { locale })
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
    case "inherited":
      return 2;
    case "draft":
      return 3;
    case "translated":
      return 4;
    case "reviewed":
      return 5;
    case "source":
      return 6;
    case "orphaned":
      return 7;
    case "present":
      return 8;
  }
}

function getLocalizedStringStatusLabel(status: LocalizedStringStatus, t: EditorTranslator): string {
  switch (status) {
    case "missing":
      return t("Missing");
    case "empty":
      return t("Empty");
    case "inherited":
      return t("Inherited");
    case "draft":
      return t("Draft");
    case "translated":
      return t("Translated");
    case "reviewed":
      return t("Reviewed");
    case "source":
      return t("Source");
    case "orphaned":
      return t("Orphaned");
  }
}

function getQueueItemStatusLabel(item: LocalizationQueueItem, t: EditorTranslator): string {
  if (item.kind === "media") {
    return t(item.status === "missing" ? "Missing" : "Present");
  }

  return getLocalizedStringStatusLabel(item.status as LocalizedStringStatus, t);
}

function getQueueGroupLabel(status: QueueItemStatus, t: EditorTranslator): string {
  if (status === "present") {
    return t("Present");
  }
  return status === "orphaned" ? t("Orphans") : getLocalizedStringStatusLabel(status, t);
}

function getLocalizationSubtabLabel(section: LocalizationSection): string {
  switch (section) {
    case "overview":
      return "Work Queue";
    case "strings":
      return "Strings";
    case "media":
      return "Media";
  }
}

function resolveUsageAreaLabels(usages: ProjectTextUsage[], t: EditorTranslator): string[] {
  return [...new Set(usages.map((usage) => getProjectTextAreaLabel(resolveProjectTextArea(usage.kind), t)))];
}

function buildStringCoverageRows(entries: ProjectTextEntry[], t: EditorTranslator): CoverageRow[] {
  return TEXT_AREAS.map((area) => {
    const areaEntries = entries.filter((entry) => entry.usages.some((usage) => resolveProjectTextArea(usage.kind) === area));
    const coverage = calculateStringCoverage(areaEntries);

    return {
      label: getProjectTextAreaLabel(area, t),
      total: coverage.total,
      complete: coverage.complete,
      needsWork: coverage.needsWork
    };
  });
}

function buildMediaCoverageRows(project: ProjectBundle, locale: string, t: EditorTranslator): CoverageRow[] {
  const rows: CoverageRow[] = [];

  for (const category of ["background", "sceneAudio", "foreground", "response", "inventory", "player"] as const) {
    const assets = project.assets.assets.filter((asset) => classifyEditorAssetCategory(asset) === category);
    rows.push({
      label: formatMediaCategoryLabel(category, t),
      total: assets.length,
      complete: assets.filter((asset) => Boolean(getLocalizedAssetVariant(asset, locale))).length,
      needsWork: assets.filter((asset) => !getLocalizedAssetVariant(asset, locale)).length
    });
  }

  return rows;
}

function collectAssetUsages(project: ProjectBundle, asset: Asset, t: EditorTranslator): AssetUsage[] {
  const usages: AssetUsage[] = [];

  for (const scene of project.scenes.items) {
    if (scene.backgroundAssetId === asset.id) {
      usages.push({
        label: scene.name,
        detail: t("Scene background"),
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
        detail: t("Scene audio"),
        navigation: {
          label: scene.name,
          tab: "scenes",
          locationId: scene.locationId,
          sceneId: scene.id,
          assetId: asset.id
        }
      });
    }

    for (const hotspot of scene.hotspots) {
      if (hotspot.mediaAssetId === asset.id) {
        usages.push({
          label: hotspot.name,
          detail: t("Interaction media in {scene}", { scene: scene.name }),
          navigation: {
            label: hotspot.name,
            tab: "scenes",
            locationId: scene.locationId,
            sceneId: scene.id,
            hotspotId: hotspot.id,
            assetId: asset.id
          }
        });
      }
    }
  }

  for (const dialogue of project.dialogues.items) {
    for (const node of dialogue.nodes) {
      if (node.mediaAssetId === asset.id) {
        usages.push({
          label: node.speaker || node.id,
          detail: t("Dialogue media in {dialogue}", { dialogue: dialogue.name }),
          navigation: {
            label: node.speaker || node.id,
            tab: "dialogue",
            dialogueId: dialogue.id,
            dialogueNodeId: node.id,
            assetId: asset.id
          }
        });
      }
    }
  }

  for (const item of project.inventory.items) {
    if (item.imageAssetId === asset.id) {
      usages.push({
        label: item.name,
        detail: t("Inventory art"),
        navigation: {
          label: item.name,
          tab: "inventory",
          inventoryItemId: item.id,
          assetId: asset.id
        }
      });
    }
  }

  for (const group of project.dialogues.responseGroups) {
    for (const entry of group.entries) {
      if (entry.kind !== "text" && entry.assetId === asset.id) {
        usages.push({
          label: group.name,
          detail: t("{kind} response", { kind: t(entry.kind === "audio" ? "Audio" : "Video") }),
          navigation: {
            label: group.name,
            tab: "dialogue",
            dialogueSection: "responses",
            responseGroupId: group.id,
            responseEntryId: entry.id,
            assetId: asset.id
          }
        });
      }
    }
  }

  const presentation = project.manifest.playerPresentation;
  const presentationRoles = [
    [presentation.titleBackgroundAssetId, t("Title background")],
    [presentation.logoAssetId, t("Title logo")],
    [presentation.appIconAssetId, t("Application icon")]
  ] as const;
  for (const [assetId, detail] of presentationRoles) {
    if (assetId !== asset.id) {
      continue;
    }
    usages.push({
      label: project.manifest.projectName,
      detail,
      navigation: {
        label: detail,
        tab: "player",
        assetId: asset.id
      }
    });
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

function formatMediaCategoryLabel(category: MediaAssetFilter, t: EditorTranslator): string {
  switch (category) {
    case "background":
      return t("Background");
    case "sceneAudio":
      return t("Scene Audio");
    case "foreground":
      return t("Foreground Media");
    case "inventory":
      return t("Inventory");
    case "response":
      return t("Responses");
    case "player":
      return t("Player");
  }
}

function formatAssetKindLabel(kind: Asset["kind"], t: EditorTranslator): string {
  switch (kind) {
    case "audio":
      return t("Audio");
    case "video":
      return t("Video");
    case "image":
      return t("Image");
  }
}

function formatNavigationTabLabel(tab: EditorNavigationTarget["tab"], t: EditorTranslator): string {
  switch (tab) {
    case "world":
      return t("World");
    case "scenes":
      return t("Scenes");
    case "dialogue":
      return t("Dialogue");
    case "logic":
      return t("Logic");
    case "inventory":
      return t("Inventory");
    case "localization":
      return t("Localization");
    case "assets":
      return t("Assets");
    case "player":
      return t("Player");
    case "playtest":
      return t("Playtest");
  }
}

function resolveEmptyMediaMessage(filter: MediaAssetFilter, t: EditorTranslator): string {
  switch (filter) {
    case "background":
      return t("No background assets yet. Upload scene media from Scenes before localizing it here.");
    case "sceneAudio":
      return t("No scene audio assets yet. Upload scene audio from Scenes before localizing it here.");
    case "foreground":
      return t("No foreground media yet. Upload audio or video from Dialogue, a hotspot, or Assets before localizing it here.");
    case "inventory":
      return t("No inventory assets yet. Upload an inventory image from Inventory before localizing it here.");
    case "response":
      return t("No response media yet. Import audio or video from Dialogue > Responses before localizing it here.");
    case "player":
      return t("No player assets yet. Import title, logo, or icon artwork from Assets before localizing it here.");
  }
}

function formatLocaleDisplayName(locale: string, t: EditorTranslator): string {
  const localeNames: Record<string, string> = {
    en: "English",
    fr: "French",
    de: "German",
    es: "Spanish",
    it: "Italian",
    ja: "Japanese",
    ko: "Korean",
    ar: "Arabic",
    "pt-BR": "Portuguese",
    pt: "Portuguese",
    zh: "Chinese",
    "zh-Hans": "Simplified Chinese"
  };

  const baseLocale = locale.split("-")[0] ?? locale;
  const languageName = localeNames[locale] ?? localeNames[baseLocale];
  return languageName ? `${locale} (${t(languageName)})` : locale;
}

function formatCoveragePercent(value: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}

function getLocalizedStatusIcon(status: QueueItemStatus | undefined): LocalizationIconName {
  switch (status) {
    case "translated":
    case "present":
      return "check";
    case "reviewed":
      return "shield";
    case "inherited":
      return "copy";
    case "source":
      return "text";
    case "draft":
    case "empty":
      return "circle";
    case "orphaned":
      return "unlink";
    case "missing":
    default:
      return "alert";
  }
}

function resolveNextStepTitle(status: QueueItemStatus | undefined, t: EditorTranslator): string {
  switch (status) {
    case "missing":
      return t("Missing translation");
    case "empty":
      return t("Empty translation");
    case "inherited":
      return t("Inherited source copy");
    case "draft":
      return t("Draft translation");
    case "translated":
      return t("Translation complete");
    case "reviewed":
      return t("Reviewed translation");
    case "source":
      return t("Source text");
    case "orphaned":
      return t("No references");
    case "present":
      return t("Variant present");
    default:
      return t("Select an item");
  }
}

function resolveNextStepBody(status: QueueItemStatus | undefined, locale: string, t: EditorTranslator): string {
  switch (status) {
    case "missing":
      return t("Add a {locale} value for this item.", { locale });
    case "empty":
      return t("Fill the stored {locale} value.", { locale });
    case "inherited":
      return t("Translate this source copy; inherited text is excluded from completion.");
    case "draft":
      return t("Finish the text, then mark it Translated or Reviewed.");
    case "translated":
      return t("This value counts toward completion and can still be marked Reviewed.");
    case "reviewed":
      return t("This value has passed review and counts toward completion.");
    case "source":
      return t("This is the project source value used by every target locale.");
    case "orphaned":
      return t("Delete the stored entry or keep it for reuse.");
    case "present":
      return t("This locale has a dedicated media variant.");
    default:
      return t("Choose a string or media variant to inspect.");
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
      return classifyEditorAssetCategory(asset) === "foreground"
        ? [...FOREGROUND_MEDIA_IMPORT_EXTENSIONS]
        : [...BACKGROUND_IMPORT_EXTENSIONS];
    case "image":
      return classifyEditorAssetCategory(asset) === "inventory"
        ? [...INVENTORY_IMAGE_EXTENSIONS]
        : [...BACKGROUND_IMPORT_EXTENSIONS];
  }
}

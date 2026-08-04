import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PLAYER_CREDITS_TEXT_ID,
  DEFAULT_PLAYER_TAGLINE_TEXT_ID,
  collectPlayerUiOverrides,
  getLocaleStringValues,
  normalizeSupportedLocales,
  type Asset,
  type BuiltInLocale,
  type PlayerPresentation,
  type ProjectBundle
} from "@mage2/schema";
import {
  DEFAULT_PLAYER_EXPERIENCE_PREFERENCES,
  PlayerExperienceShell,
  type PlayerExperiencePreferences,
  type PlayerExperienceScreen
} from "@mage2/player-ui";
import { setEditorLocalizedText } from "../localized-project";
import { useEditorI18n } from "../i18n";
import { useEditorAssetFileUrl } from "../player-asset-url";
import { isPlayerPresentationAsset } from "../project-helpers";

interface PlayerPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  setStatusMessage: (message: string) => void;
}

export type EditorPlayerInterfaceLocalePreference = "automatic" | BuiltInLocale;

export function resolveEditorPlayerInterfaceLocale(
  preference: EditorPlayerInterfaceLocalePreference,
  editorLocale: BuiltInLocale
): BuiltInLocale {
  return preference === "automatic" ? editorLocale : preference;
}

export function PlayerPanel({ project, mutateProject, setStatusMessage }: PlayerPanelProps) {
  const { locale: editorLocale, t } = useEditorI18n();
  const presentation = project.manifest.playerPresentation;
  const defaultLocale = project.manifest.defaultLanguage;
  const supportedLocales = normalizeSupportedLocales(defaultLocale, project.manifest.supportedLocales);
  const sourceStrings = getLocaleStringValues(project, defaultLocale);
  const playerAssets = useMemo(
    () => project.assets.assets.filter(isPlayerPresentationAsset),
    [project.assets.assets]
  );
  const titleAsset = findAsset(playerAssets, presentation.titleBackgroundAssetId);
  const logoAsset = findAsset(playerAssets, presentation.logoAssetId);
  const iconAsset = findAsset(playerAssets, presentation.appIconAssetId);
  const [previewScreen, setPreviewScreen] = useState<PlayerExperienceScreen>("title");
  const [previewLocale, setPreviewLocale] = useState(defaultLocale);
  const [previewInterfaceLocalePreference, setPreviewInterfaceLocalePreference] =
    useState<EditorPlayerInterfaceLocalePreference>("automatic");
  const [previewPreferences, setPreviewPreferences] = useState<PlayerExperiencePreferences>(
    DEFAULT_PLAYER_EXPERIENCE_PREFERENCES
  );

  useEffect(() => {
    if (!supportedLocales.includes(previewLocale)) {
      setPreviewLocale(defaultLocale);
    }
  }, [defaultLocale, previewLocale, supportedLocales]);

  const previewContentLocale = supportedLocales.includes(previewLocale) ? previewLocale : defaultLocale;
  const titleBackgroundUrl = useEditorAssetFileUrl(titleAsset, previewContentLocale);
  const logoUrl = useEditorAssetFileUrl(logoAsset, previewContentLocale);
  const iconUrl = useEditorAssetFileUrl(iconAsset, previewContentLocale);
  const previewStrings = {
    ...sourceStrings,
    ...getLocaleStringValues(project, previewContentLocale)
  };
  const previewInterfaceLocale = resolveEditorPlayerInterfaceLocale(previewInterfaceLocalePreference, editorLocale);
  const playerUiOverrides = collectPlayerUiOverrides(project);
  const taglineTextId = presentation.taglineTextId ?? DEFAULT_PLAYER_TAGLINE_TEXT_ID;
  const creditsTextId = presentation.creditsTextId ?? DEFAULT_PLAYER_CREDITS_TEXT_ID;

  function updatePresentation(update: Partial<PlayerPresentation>, message: string) {
    mutateProject((draft) => {
      Object.assign(draft.manifest.playerPresentation, update);
    });
    setStatusMessage(t("{message} Save the project to keep this change.", { message }));
  }

  function updateSourceText(textId: string, value: string, field: "tagline" | "credits") {
    mutateProject((draft) => {
      const draftPresentation = draft.manifest.playerPresentation;
      if (field === "tagline") {
        draftPresentation.taglineTextId ??= DEFAULT_PLAYER_TAGLINE_TEXT_ID;
      } else {
        draftPresentation.creditsTextId ??= DEFAULT_PLAYER_CREDITS_TEXT_ID;
      }
      setEditorLocalizedText(draft, defaultLocale, textId, value);
    });
  }

  return (
    <div className="panel-grid panel-grid--player">
      <section className="panel player-panel__preview-panel">
        <div className="panel__toolbar">
          <div>
            <p className="dialog-eyebrow">{t("Player preview")}</p>
            <h3>{t("Landscape-first shell")}</h3>
            <p className="muted">{t("This is the same title, pause, settings, and credits layer used by exports.")}</p>
          </div>
          <button type="button" onClick={() => setPreviewScreen("title")}>{t("Preview title")}</button>
        </div>

        <div className="player-panel__preview" data-title-enabled={presentation.titleScreenEnabled ? "true" : "false"}>
          <PlayerExperienceShell
            projectName={project.manifest.projectName}
            gameVersion={project.manifest.gameVersion}
            presentation={presentation}
            screen={previewScreen}
            onScreenChange={setPreviewScreen}
            locale={previewContentLocale}
            supportedLocales={supportedLocales}
            localeStrings={previewStrings}
            onLocaleChange={setPreviewLocale}
            interfaceLocale={previewInterfaceLocale}
            interfaceLocalePreference={previewInterfaceLocalePreference}
            onInterfaceLocalePreferenceChange={setPreviewInterfaceLocalePreference}
            playerUiOverrides={playerUiOverrides}
            preferences={previewPreferences}
            onPreferencesChange={setPreviewPreferences}
            hasSavedGame={false}
            onContinue={() => undefined}
            onNewGame={() => undefined}
            onSave={() => undefined}
            titleBackgroundUrl={titleBackgroundUrl}
            logoUrl={logoUrl}
            iconUrl={iconUrl}
            resolveLocaleName={resolveLocaleName}
          >
            <div className="player-panel__game-placeholder">
              <strong>{t("Game canvas")}</strong>
              <span>{t("Open the menu to preview the paused state, or return to the title.")}</span>
            </div>
          </PlayerExperienceShell>
        </div>
        {!presentation.titleScreenEnabled ? (
          <p className="player-panel__preview-note">{t("The title screen is disabled for exported builds; the preview remains available for editing.")}</p>
        ) : null}
      </section>

      <aside className="panel panel--flow player-panel__controls">
        <div className="panel__toolbar">
          <div>
            <p className="dialog-eyebrow">{t("Creator controls")}</p>
            <h3>{t("Player presentation")}</h3>
            <p className="muted">{t("Start from the bundled cinematic kit, then replace only what your game needs.")}</p>
          </div>
        </div>

        <fieldset className="player-panel__fieldset">
          <legend>{t("Title screen")}</legend>
          <label className="player-panel__check-row">
            <span>{t("Show title screen on launch")}</span>
            <input
              type="checkbox"
              checked={presentation.titleScreenEnabled}
              onChange={(event) => updatePresentation({ titleScreenEnabled: event.target.checked }, t("Updated title-screen launch behavior."))}
            />
          </label>
          <AssetSelect
            label={t("Background")}
            value={presentation.titleBackgroundAssetId}
            assets={playerAssets}
            allowNone
            noneLabel={t("None")}
            starterLabel={t("Starter")}
            onChange={(titleBackgroundAssetId) => updatePresentation({ titleBackgroundAssetId }, t("Updated the title background."))}
          />
          <AssetSelect
            label={t("Logo")}
            value={presentation.logoAssetId}
            assets={playerAssets}
            allowNone
            noneLabel={t("None")}
            starterLabel={t("Starter")}
            onChange={(logoAssetId) => updatePresentation({ logoAssetId }, t("Updated the title logo."))}
          />
          <AssetSelect
            label={t("App icon")}
            value={presentation.appIconAssetId}
            assets={playerAssets}
            allowNone
            noneLabel={t("None")}
            starterLabel={t("Starter")}
            help={t("Use a square PNG, ideally 512 by 512 pixels or larger.")}
            onChange={(appIconAssetId) => updatePresentation({ appIconAssetId }, t("Updated the player icon."))}
          />
          <label>
            <span>{t("Title alignment")}</span>
            <select
              value={presentation.titleLayout}
              onChange={(event) => updatePresentation({ titleLayout: event.target.value as PlayerPresentation["titleLayout"] }, t("Updated title alignment."))}
            >
              <option value="left">{t("Left")}</option>
              <option value="center">{t("Center")}</option>
            </select>
          </label>
          <label>
            <span>{t("Tagline ({locale})", { locale: defaultLocale })}</span>
            <input
              value={sourceStrings[taglineTextId] ?? ""}
              onChange={(event) => updateSourceText(taglineTextId, event.target.value, "tagline")}
              placeholder={t("An interactive story")}
            />
          </label>
        </fieldset>

        <fieldset className="player-panel__fieldset">
          <legend>{t("Look and feel")}</legend>
          <label>
            <span>{t("Font preset")}</span>
            <select
              value={presentation.fontPreset}
              onChange={(event) => updatePresentation({ fontPreset: event.target.value as PlayerPresentation["fontPreset"] }, t("Updated player typography."))}
            >
              <option value="cinematic">{t("Cinematic")}</option>
              <option value="modern">{t("Modern")}</option>
              <option value="classic">{t("Classic")}</option>
            </select>
          </label>
          <label>
            <span>{t("Overlay tone")}</span>
            <select
              value={presentation.overlayTone}
              onChange={(event) => updatePresentation({ overlayTone: event.target.value as PlayerPresentation["overlayTone"] }, t("Updated overlay tone."))}
            >
              <option value="dark">{t("Dark")}</option>
              <option value="light">{t("Light")}</option>
            </select>
          </label>
          <label className="player-panel__color-row">
            <span>{t("Accent")}</span>
            <input
              type="color"
              value={presentation.accentColor}
              aria-label={t("Player accent color")}
              onChange={(event) => updatePresentation({ accentColor: event.target.value }, t("Updated player accent color."))}
            />
            <code>{presentation.accentColor}</code>
          </label>
          <label className="player-panel__check-row">
            <span>{t("Show a landscape hint in portrait")}</span>
            <input
              type="checkbox"
              checked={presentation.showLandscapeHintInPortrait}
              onChange={(event) => updatePresentation({ showLandscapeHintInPortrait: event.target.checked }, t("Updated the portrait hint."))}
            />
          </label>
        </fieldset>

        <fieldset className="player-panel__fieldset">
          <legend>{t("Credits and release identity")}</legend>
          <label>
            <span>{t("Creator name")}</span>
            <input
              value={presentation.creatorName ?? ""}
              onChange={(event) => updatePresentation({ creatorName: event.target.value || undefined }, t("Updated creator credits."))}
            />
          </label>
          <label>
            <span>{t("Website")}</span>
            <input
              type="url"
              value={presentation.websiteUrl ?? ""}
              onChange={(event) => updatePresentation({ websiteUrl: event.target.value || undefined }, t("Updated creator website."))}
              placeholder="https://example.com"
            />
          </label>
          <label>
            <span>{t("Credits ({locale})", { locale: defaultLocale })}</span>
            <textarea
              rows={3}
              value={sourceStrings[creditsTextId] ?? ""}
              onChange={(event) => updateSourceText(creditsTextId, event.target.value, "credits")}
            />
          </label>
          <label>
            <span>{t("Game version")}</span>
            <input
              value={project.manifest.gameVersion}
              onChange={(event) => mutateProject((draft) => { draft.manifest.gameVersion = event.target.value; })}
              placeholder="1.0.0"
            />
            <small>{t("Use semantic versioning, such as 1.0.0 or 1.2.0-beta.1.")}</small>
          </label>
          <label>
            <span>{t("Save compatibility version")}</span>
            <input
              type="number"
              min={1}
              step={1}
              value={project.manifest.saveCompatibilityVersion}
              onChange={(event) => {
                const saveCompatibilityVersion = Math.max(1, Math.trunc(Number(event.target.value) || 1));
                mutateProject((draft) => { draft.manifest.saveCompatibilityVersion = saveCompatibilityVersion; });
                setStatusMessage(t("Updated save compatibility. Existing saves with a different value will recover into a fresh game."));
              }}
            />
            <small>{t("Increase only when a release intentionally breaks existing player saves.")}</small>
          </label>
        </fieldset>

        <div className="player-panel__starter-note">
          <strong>{t("Starter kit")}</strong>
          <span>{presentation.starterKitId ?? t("Custom")} v{presentation.starterKitVersion ?? 1}</span>
          <p>{t("Bundled assets are ordinary project assets: keep, localize, replace, or delete them once no screen references them.")}</p>
        </div>
      </aside>
    </div>
  );
}

function AssetSelect({
  label,
  value,
  assets,
  allowNone,
  noneLabel,
  starterLabel,
  help,
  onChange
}: {
  label: string;
  value?: string;
  assets: Asset[];
  allowNone?: boolean;
  noneLabel: string;
  starterLabel: string;
  help?: string;
  onChange: (assetId?: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)}>
        {allowNone ? <option value="">{noneLabel}</option> : null}
        {assets.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.name}{asset.provenance?.source === "starter-kit" ? ` (${starterLabel})` : ""}
          </option>
        ))}
      </select>
      {help ? <small>{help}</small> : null}
    </label>
  );
}

function findAsset(assets: Asset[], assetId?: string): Asset | undefined {
  return assetId ? assets.find((asset) => asset.id === assetId) : undefined;
}

function resolveLocaleName(locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import {
  DEFAULT_PLAYER_UI_STRINGS,
  PLAYER_UI_TEXT_IDS,
  type PlayerPresentation
} from "@mage2/schema";
import { resolvePlayerTextDirection } from "./model";

export type PlayerExperienceScreen = "title" | "game";
export type PlayerTextSize = "small" | "medium" | "large";

export interface PlayerExperiencePreferences {
  volume: number;
  textSize: PlayerTextSize;
  reducedMotion: boolean;
}

export const DEFAULT_PLAYER_EXPERIENCE_PREFERENCES: PlayerExperiencePreferences = {
  volume: 1,
  textSize: "medium",
  reducedMotion: false
};

export interface PlayerExperienceShellCopy {
  cancel: string;
  close: string;
  confirmLoadBody: string;
  confirmNewGameBody: string;
  continueGame: string;
  credits: string;
  creditsHeading: string;
  fullscreen: string;
  language: string;
  landscapeHint: string;
  loadGame: string;
  menu: string;
  menuHeading: string;
  newGame: string;
  noSavedGame: string;
  quit: string;
  reducedMotion: string;
  resume: string;
  saveGame: string;
  settings: string;
  settingsHeading: string;
  startGame: string;
  textSize: string;
  textSizeLarge: string;
  textSizeMedium: string;
  textSizeSmall: string;
  version: string;
  volume: string;
}

export interface PlayerExperienceShellProps {
  projectName: string;
  gameVersion: string;
  presentation: PlayerPresentation;
  screen: PlayerExperienceScreen;
  onScreenChange: (screen: PlayerExperienceScreen) => void;
  locale: string;
  supportedLocales: readonly string[];
  localeStrings: Record<string, string>;
  onLocaleChange: (locale: string) => void;
  preferences: PlayerExperiencePreferences;
  onPreferencesChange: (preferences: PlayerExperiencePreferences) => void;
  hasSavedGame: boolean;
  onContinue: () => void;
  onNewGame: () => void;
  onSave?: () => void;
  onLoad?: () => void;
  onQuit?: () => void;
  onFullscreen?: () => void;
  titleBackgroundUrl?: string;
  logoUrl?: string;
  iconUrl?: string;
  status?: string;
  debugOverlay?: ReactNode;
  children?: ReactNode;
  onMenuOpenChange?: (open: boolean) => void;
  resolveLocaleName?: (locale: string) => string;
}

type PlayerExperiencePanel = "menu" | "settings" | "credits";
type PlayerExperienceConfirmation = "newGame" | "load";

export function resolvePlayerExperienceShellCopy(strings: Record<string, string>): PlayerExperienceShellCopy {
  const value = (textId: keyof typeof PLAYER_UI_TEXT_IDS) => {
    const id = PLAYER_UI_TEXT_IDS[textId];
    return strings[id]?.trim() || DEFAULT_PLAYER_UI_STRINGS[id];
  };

  return {
    cancel: value("cancel"),
    close: value("close"),
    confirmLoadBody: value("confirmLoadBody"),
    confirmNewGameBody: value("confirmNewGameBody"),
    continueGame: value("continueGame"),
    credits: value("credits"),
    creditsHeading: value("creditsHeading"),
    fullscreen: value("fullscreen"),
    language: value("language"),
    landscapeHint: value("landscapeHint"),
    loadGame: value("loadGame"),
    menu: value("menu"),
    menuHeading: value("menuHeading"),
    newGame: value("newGame"),
    noSavedGame: value("noSavedGame"),
    quit: value("quit"),
    reducedMotion: value("reducedMotion"),
    resume: value("resume"),
    saveGame: value("saveGame"),
    settings: value("settings"),
    settingsHeading: value("settingsHeading"),
    startGame: value("startGame"),
    textSize: value("textSize"),
    textSizeLarge: value("textSizeLarge"),
    textSizeMedium: value("textSizeMedium"),
    textSizeSmall: value("textSizeSmall"),
    version: value("version"),
    volume: value("volume")
  };
}

export function PlayerExperienceShell({
  projectName,
  gameVersion,
  presentation,
  screen,
  onScreenChange,
  locale,
  supportedLocales,
  localeStrings,
  onLocaleChange,
  preferences,
  onPreferencesChange,
  hasSavedGame,
  onContinue,
  onNewGame,
  onSave,
  onLoad,
  onQuit,
  onFullscreen,
  titleBackgroundUrl,
  logoUrl,
  iconUrl,
  status,
  debugOverlay,
  children,
  onMenuOpenChange,
  resolveLocaleName = (value) => value
}: PlayerExperienceShellProps) {
  const [panel, setPanel] = useState<PlayerExperiencePanel>();
  const [confirmation, setConfirmation] = useState<PlayerExperienceConfirmation>();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasModalOpenRef = useRef(false);
  const headingId = useId();
  const copy = useMemo(() => resolvePlayerExperienceShellCopy(localeStrings), [localeStrings]);
  const tagline = presentation.taglineTextId ? localeStrings[presentation.taglineTextId]?.trim() : undefined;
  const credits = presentation.creditsTextId ? localeStrings[presentation.creditsTextId]?.trim() : undefined;
  const modalOpen = Boolean(panel || confirmation);
  const rootStyle = {
    "--mage2-experience-accent": presentation.accentColor,
    "--mage2-experience-text-scale": preferences.textSize === "large" ? 1.14 : preferences.textSize === "small" ? 0.9 : 1
  } as CSSProperties;
  const rootClassName = [
    "mage2-experience",
    `mage2-experience--${presentation.overlayTone}`,
    `mage2-experience--font-${presentation.fontPreset}`,
    preferences.reducedMotion ? "mage2-experience--reduced-motion" : undefined
  ].filter(Boolean).join(" ");

  const setOpenPanel = (nextPanel?: PlayerExperiencePanel) => {
    if (nextPanel && !modalOpen) {
      const activeElement = document.activeElement;
      returnFocusRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : menuButtonRef.current;
    }
    setPanel(nextPanel);
    setConfirmation(undefined);
    onMenuOpenChange?.(Boolean(nextPanel));
  };

  const setOpenConfirmation = (nextConfirmation: PlayerExperienceConfirmation) => {
    if (!modalOpen) {
      const activeElement = document.activeElement;
      returnFocusRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : menuButtonRef.current;
    }
    setPanel(undefined);
    setConfirmation(nextConfirmation);
    onMenuOpenChange?.(true);
  };

  const closeOverlays = () => {
    setPanel(undefined);
    setConfirmation(undefined);
    onMenuOpenChange?.(false);
  };

  const enterGame = (action: () => void) => {
    action();
    closeOverlays();
    onScreenChange("game");
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!modalOpen || !dialog) {
      return;
    }

    const selector = "button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
    const frame = window.requestAnimationFrame(() => dialog.querySelector<HTMLElement>(selector)?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverlays();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(selector));
      if (controls.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirmation, panel]);

  useEffect(() => {
    if (modalOpen) {
      wasModalOpenRef.current = true;
      return;
    }
    if (!wasModalOpenRef.current) {
      return;
    }

    wasModalOpenRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const returnFocusTarget = returnFocusRef.current;
      (returnFocusTarget?.isConnected ? returnFocusTarget : menuButtonRef.current)?.focus();
      returnFocusRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [modalOpen]);

  useEffect(() => {
    if (screen === "title") {
      closeOverlays();
    }
  }, [screen]);

  return (
    <section
      className={rootClassName}
      style={rootStyle}
      lang={locale}
      dir={resolvePlayerTextDirection(locale)}
      data-player-screen={screen}
      data-player-menu-open={modalOpen ? "true" : "false"}
    >
      <div className="mage2-experience__game" aria-hidden={screen === "title" || modalOpen || undefined} inert={screen === "title" || modalOpen || undefined}>
        <div className="mage2-experience__game-canvas">{children}</div>
        {screen === "game" ? (
          <button
            ref={menuButtonRef}
            type="button"
            className="mage2-experience__menu-button"
            aria-label={copy.menu}
            aria-expanded={Boolean(panel)}
            onClick={() => setOpenPanel(panel ? undefined : "menu")}
          >
            <span aria-hidden="true"><i /><i /><i /></span>
            <b>{copy.menu}</b>
          </button>
        ) : null}
        {debugOverlay}
      </div>

      {status ? <p className="mage2-experience__status" role="status">{status}</p> : null}

      {screen === "title" ? (
        <div
          className={`mage2-experience__title mage2-experience__title--${presentation.titleLayout}`}
          style={titleBackgroundUrl ? { backgroundImage: `url(${JSON.stringify(titleBackgroundUrl)})` } : undefined}
        >
          <div className="mage2-experience__title-shade" aria-hidden="true" />
          <div className="mage2-experience__title-content">
            {logoUrl ? <img src={logoUrl} alt={projectName} className="mage2-experience__logo" /> : (
              <div className="mage2-experience__wordmark">
                {iconUrl ? <img src={iconUrl} alt="" aria-hidden="true" /> : null}
                <h1>{projectName}</h1>
              </div>
            )}
            {tagline ? <p className="mage2-experience__tagline">{tagline}</p> : null}
            <div className="mage2-experience__title-actions">
              <button
                type="button"
                className="mage2-experience__primary-action"
                onClick={() => enterGame(hasSavedGame ? onContinue : onNewGame)}
              >
                {hasSavedGame ? copy.continueGame : copy.startGame}
              </button>
              {hasSavedGame ? (
                <button type="button" onClick={() => setOpenConfirmation("newGame")}>{copy.newGame}</button>
              ) : null}
              <button type="button" onClick={() => setOpenPanel("settings")}>{copy.settings}</button>
              <button type="button" onClick={() => setOpenPanel("credits")}>{copy.credits}</button>
              {onQuit ? <button type="button" onClick={onQuit}>{copy.quit}</button> : null}
            </div>
          </div>
        </div>
      ) : null}

      {presentation.showLandscapeHintInPortrait ? (
        <p className="mage2-experience__landscape-hint">{copy.landscapeHint}</p>
      ) : null}

      {panel ? (
        <div className="mage2-experience__modal-layer">
          <button type="button" className="mage2-experience__scrim" aria-label={copy.close} onClick={closeOverlays} />
          <section
            ref={dialogRef}
            className="mage2-experience__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            tabIndex={-1}
          >
            <header>
              <div>
                <p>{projectName}</p>
                <h2 id={headingId}>{panel === "menu" ? copy.menuHeading : panel === "settings" ? copy.settingsHeading : copy.creditsHeading}</h2>
              </div>
              <button type="button" className="mage2-experience__close" onClick={closeOverlays}>{copy.close}</button>
            </header>

            {panel === "menu" ? (
              <nav className="mage2-experience__panel-actions" aria-label={copy.menuHeading}>
                <button type="button" className="mage2-experience__primary-action" onClick={closeOverlays}>{copy.resume}</button>
                {onSave ? <button type="button" onClick={() => { onSave(); closeOverlays(); }}>{copy.saveGame}</button> : null}
                {onLoad ? <button type="button" disabled={!hasSavedGame} title={!hasSavedGame ? copy.noSavedGame : undefined} onClick={() => setOpenConfirmation("load")}>{copy.loadGame}</button> : null}
                <button type="button" onClick={() => setOpenConfirmation("newGame")}>{copy.newGame}</button>
                <button type="button" onClick={() => setPanel("settings")}>{copy.settings}</button>
                <button type="button" onClick={() => setPanel("credits")}>{copy.credits}</button>
                {onQuit ? <button type="button" onClick={onQuit}>{copy.quit}</button> : null}
              </nav>
            ) : null}

            {panel === "settings" ? (
              <div className="mage2-experience__settings">
                {supportedLocales.length > 1 ? (
                  <label>
                    <span>{copy.language}</span>
                    <select value={locale} onChange={(event) => onLocaleChange(event.target.value)}>
                      {supportedLocales.map((value) => <option key={value} value={value}>{resolveLocaleName(value)}</option>)}
                    </select>
                  </label>
                ) : null}
                <label>
                  <span>{copy.volume}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={preferences.volume}
                    onChange={(event) => onPreferencesChange({ ...preferences, volume: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>{copy.textSize}</span>
                  <select
                    value={preferences.textSize}
                    onChange={(event) => onPreferencesChange({ ...preferences, textSize: event.target.value as PlayerTextSize })}
                  >
                    <option value="small">{copy.textSizeSmall}</option>
                    <option value="medium">{copy.textSizeMedium}</option>
                    <option value="large">{copy.textSizeLarge}</option>
                  </select>
                </label>
                <label className="mage2-experience__checkbox-row">
                  <span>{copy.reducedMotion}</span>
                  <input
                    type="checkbox"
                    checked={preferences.reducedMotion}
                    onChange={(event) => onPreferencesChange({ ...preferences, reducedMotion: event.target.checked })}
                  />
                </label>
                {onFullscreen ? <button type="button" onClick={onFullscreen}>{copy.fullscreen}</button> : null}
              </div>
            ) : null}

            {panel === "credits" ? (
              <div className="mage2-experience__credits">
                {credits ? <p>{credits}</p> : null}
                {presentation.creatorName ? <strong>{presentation.creatorName}</strong> : null}
                {presentation.websiteUrl ? <a href={presentation.websiteUrl} target="_blank" rel="noreferrer">{presentation.websiteUrl}</a> : null}
                <small>{copy.version} {gameVersion}</small>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {confirmation ? (
        <div className="mage2-experience__modal-layer">
          <button type="button" className="mage2-experience__scrim" aria-label={copy.cancel} onClick={closeOverlays} />
          <section ref={dialogRef} className="mage2-experience__confirmation" role="alertdialog" aria-modal="true" tabIndex={-1}>
            <h2>{confirmation === "newGame" ? copy.newGame : copy.loadGame}</h2>
            <p>{confirmation === "newGame" ? copy.confirmNewGameBody : copy.confirmLoadBody}</p>
            <div>
              <button type="button" onClick={closeOverlays}>{copy.cancel}</button>
              <button
                type="button"
                className="mage2-experience__primary-action"
                onClick={() => enterGame(confirmation === "newGame" ? onNewGame : onLoad!)}
              >
                {confirmation === "newGame" ? copy.newGame : copy.loadGame}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

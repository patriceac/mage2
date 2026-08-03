import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPlayerController,
  resolveSceneTimelineDurationMs,
  type ActivePlayerResponse
} from "@mage2/player";
import {
  createSaveEnvelope,
  loadSaveForProject,
  normalizeSupportedLocales,
  parseProjectBundle,
  resolveAssetVariant,
  type Asset,
  type BuildManifest,
  type ExportProjectData,
  type ProjectBundle,
  type SaveState,
  parseBuildManifest
} from "@mage2/schema";
import {
  PlayerSceneAudio,
  PlayerSceneRenderer,
  resolvePlayerSystemCopy,
  resolvePlayerTextDirection,
  type PlayerSourceResolver
} from "@mage2/player-ui";

const resolveRuntimeSourcePath: PlayerSourceResolver = async (sourcePath) => sourcePath;
const RUNTIME_INVENTORY_BAG_ICON_SRC = new URL(
  "../../editor/src/assets/playtest-inventory-bag.png",
  import.meta.url
).href;

export function resolveRuntimeHeaderContent(content: Pick<ExportProjectData, "manifest">): {
  projectName: string;
} {
  return {
    projectName: content.manifest.projectName
  };
}

export function isRuntimeDebugMode(search: string): boolean {
  return new URLSearchParams(search).get("debug") === "1";
}

export function createRuntimeProject(content: ExportProjectData): ProjectBundle {
  return parseProjectBundle({
    manifest: content.manifest,
    assets: { schemaVersion: content.schemaVersion, assets: content.assets },
    locations: { schemaVersion: content.schemaVersion, items: content.locations },
    scenes: { schemaVersion: content.schemaVersion, items: content.scenes },
    dialogues: {
      schemaVersion: content.schemaVersion,
      items: content.dialogues,
      responseGroups: content.responseGroups ?? [],
      starterResponsesVersion: content.starterResponsesVersion ?? 0
    },
    inventory: { schemaVersion: content.schemaVersion, items: content.inventoryItems },
    strings: { schemaVersion: content.schemaVersion, byLocale: content.strings }
  });
}

export function resolveRuntimeSaveStorageKey(projectId: string): string {
  return `mage2-runtime-save:${projectId}`;
}

interface RuntimeSystemCopy {
  cancel: string;
  close: string;
  closeMenu: string;
  confirmLoad: string;
  confirmLoadBody: string;
  confirmLoadTitle: string;
  confirmRestart: string;
  confirmRestartBody: string;
  confirmRestartTitle: string;
  debugMode: string;
  gameLoaded: string;
  gameRestarted: string;
  gameSaved: string;
  language: string;
  loadGame: string;
  loading: string;
  menu: string;
  menuTitle: string;
  noValidSave: string;
  placedObject: string;
  playhead: string;
  quit: string;
  rawSave: string;
  restartGame: string;
  saveGame: string;
  saveRecovered: string;
  showHotspots: string;
  startupErrorBody: string;
  startupErrorTitle: string;
}

const RUNTIME_SYSTEM_COPY: Record<string, RuntimeSystemCopy> = {
  en: {
    cancel: "Cancel",
    close: "Close",
    closeMenu: "Close player menu",
    confirmLoad: "Load",
    confirmLoadBody: "Current progress will be replaced.",
    confirmLoadTitle: "Load saved game?",
    confirmRestart: "New game",
    confirmRestartBody: "Saved progress on this device will be deleted.",
    confirmRestartTitle: "Start a new game?",
    debugMode: "Debug mode",
    gameLoaded: "Saved game loaded.",
    gameRestarted: "New game started.",
    gameSaved: "Game saved.",
    language: "Language",
    loadGame: "Load game",
    loading: "Loading game...",
    menu: "Menu",
    menuTitle: "Player menu",
    noValidSave: "No valid saved game is available.",
    placedObject: "This object is placed here.",
    playhead: "Playhead",
    quit: "Quit",
    rawSave: "Raw save state",
    restartGame: "New game",
    saveGame: "Save game",
    saveRecovered: "The saved game could not be read. A new game was started.",
    showHotspots: "Show hotspots",
    startupErrorBody: "Check that the complete exported game was published, then try again.",
    startupErrorTitle: "Unable to start this game"
  },
  fr: {
    cancel: "Annuler",
    close: "Fermer",
    closeMenu: "Fermer le menu du jeu",
    confirmLoad: "Charger",
    confirmLoadBody: "La progression actuelle sera remplacée.",
    confirmLoadTitle: "Charger la sauvegarde ?",
    confirmRestart: "Nouvelle partie",
    confirmRestartBody: "La sauvegarde de cet appareil sera supprimée.",
    confirmRestartTitle: "Commencer une nouvelle partie ?",
    debugMode: "Mode debug",
    gameLoaded: "Sauvegarde chargée.",
    gameRestarted: "Nouvelle partie commencée.",
    gameSaved: "Partie sauvegardée.",
    language: "Langue",
    loadGame: "Charger la partie",
    loading: "Chargement du jeu...",
    menu: "Menu",
    menuTitle: "Menu du jeu",
    noValidSave: "Aucune sauvegarde valide n'est disponible.",
    placedObject: "Cet objet est placé ici.",
    playhead: "Tête de lecture",
    quit: "Quitter",
    rawSave: "État brut de la sauvegarde",
    restartGame: "Nouvelle partie",
    saveGame: "Sauvegarder",
    saveRecovered: "La sauvegarde était illisible. Une nouvelle partie a été lancée.",
    showHotspots: "Afficher les zones",
    startupErrorBody: "Vérifiez que le jeu exporté a été publié en entier, puis réessayez.",
    startupErrorTitle: "Impossible de lancer ce jeu"
  }
};

export function resolveRuntimeSystemCopy(locale: string): RuntimeSystemCopy {
  const normalizedLocale = locale.trim().toLowerCase().replaceAll("_", "-");
  const baseLanguage = normalizedLocale.split("-")[0] ?? "";
  return RUNTIME_SYSTEM_COPY[normalizedLocale] ?? RUNTIME_SYSTEM_COPY[baseLanguage] ?? RUNTIME_SYSTEM_COPY.en!;
}

export function resolveRuntimeSaveLoadNotice(
  loadResult: Pick<ReturnType<typeof loadSaveForProject>, "message" | "shouldQuarantine">,
  locale: string
): string | undefined {
  return loadResult.shouldQuarantine ? resolveRuntimeSystemCopy(locale).saveRecovered : loadResult.message;
}

export function resolveRuntimePlayerCopy(locale: string) {
  return resolvePlayerSystemCopy(locale);
}

export function resolveRuntimeLocaleStrings(
  strings: Record<string, Record<string, string>>,
  locale: string,
  defaultLocale: string
): Record<string, string> {
  return {
    ...(strings[defaultLocale] ?? {}),
    ...(strings[locale] ?? {})
  };
}

function RuntimeForegroundMediaPlayer({
  asset,
  locale,
  label,
  onDismiss
}: {
  asset: Asset;
  locale: string;
  label: string;
  onDismiss?: () => void;
}) {
  const variant = resolveAssetVariant(asset, locale);
  const sourcePath = variant?.proxyPath ?? variant?.sourcePath;

  return (
    <section className={`runtime-foreground-media runtime-foreground-media--${asset.kind}`} aria-label={`${label}: ${asset.name}`}>
      <header>
        <span>{label}</span>
        <strong>{asset.name}</strong>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} aria-label={`Close ${asset.name}`} title="Close foreground media">
            &times;
          </button>
        ) : null}
      </header>
      {sourcePath && asset.kind === "video" ? (
        <video src={sourcePath} autoPlay controls playsInline preload="auto" />
      ) : sourcePath && asset.kind === "audio" ? (
        <audio src={sourcePath} autoPlay controls preload="auto" />
      ) : (
        <div>No playable {locale} variant.</div>
      )}
    </section>
  );
}

export interface RuntimeSessionRestoration {
  controller: ReturnType<typeof createPlayerController>;
  saveState: SaveState;
  recovered: boolean;
  loadResult: ReturnType<typeof loadSaveForProject>;
}

export function restoreRuntimeSession(
  content: ExportProjectData,
  storedSave: string | null
): RuntimeSessionRestoration {
  const project = createRuntimeProject(content);
  const loadResult = loadSaveForProject(storedSave, project);
  const controller = createPlayerController(project, loadResult.saveState);
  return {
    controller,
    saveState: controller.save(),
    recovered: loadResult.shouldQuarantine,
    loadResult
  };
}

export function resolveRuntimeLanguageName(locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(locale);
    return name ? `${name.charAt(0).toLocaleUpperCase(locale)}${name.slice(1)}` : locale;
  } catch {
    return locale;
  }
}

export function App() {
  const [debugMode] = useState(() =>
    isRuntimeDebugMode(typeof window === "undefined" ? "" : window.location.search)
  );
  const [buildManifest, setBuildManifest] = useState<BuildManifest>();
  const [content, setContent] = useState<ExportProjectData>();
  const [controller, setController] = useState<ReturnType<typeof createPlayerController>>();
  const [activeLocale, setActiveLocale] = useState<string>();
  const [playheadMs, setPlayheadMs] = useState(0);
  const [showHotspots, setShowHotspots] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<"load" | "restart">();
  const [hasValidStoredSave, setHasValidStoredSave] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [snapshot, setSnapshot] = useState(() => controller?.getSnapshot());
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string>();
  const [runtimeNotice, setRuntimeNotice] = useState<string>();
  const [interactionMediaPlayback, setInteractionMediaPlayback] = useState<{ assetId: string; sequence: number }>();
  const interactionMediaSequenceRef = useRef(0);
  const [activeResponse, setActiveResponse] = useState<ActivePlayerResponse>();
  const completeResponse = useCallback((sequence: number) => {
    setActiveResponse((current) => (current?.sequence === sequence ? undefined : current));
  }, []);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuDialogRef = useRef<HTMLElement>(null);
  const confirmationDialogRef = useRef<HTMLElement>(null);
  const startupCopy = resolveRuntimeSystemCopy(
    typeof navigator === "undefined" ? "en" : navigator.language
  );

  useEffect(() => {
    async function loadBuild() {
      try {
        const manifestResponse = await fetch("./build-manifest.json");
        if (!manifestResponse.ok) {
          throw new Error("build-manifest.json not found. Export a project and open the generated folder.");
        }

        const manifest = parseBuildManifest(await manifestResponse.json());
        const contentResponse = await fetch(`./${manifest.contentPath}`);
        if (!contentResponse.ok) {
          throw new Error(`Could not load exported content '${manifest.contentPath}'.`);
        }
        const parsedContent = (await contentResponse.json()) as ExportProjectData;
        const loadedProject = createRuntimeProject(parsedContent);
        if (loadedProject.manifest.projectId !== manifest.projectId) {
          throw new Error("The build manifest and exported content identify different projects.");
        }
        const supportedLocales = normalizeSupportedLocales(
          loadedProject.manifest.defaultLanguage,
          loadedProject.manifest.supportedLocales
        );

        const storageKey = resolveRuntimeSaveStorageKey(manifest.projectId);
        const localeStorageKey = `mage2-runtime-locale:${manifest.projectId}`;
        const storedSave = localStorage.getItem(storageKey);
        const storedLocale = localStorage.getItem(localeStorageKey);
        const nextLocale =
          storedLocale && supportedLocales.includes(storedLocale)
            ? storedLocale
            : loadedProject.manifest.defaultLanguage;
        const restoredSession = restoreRuntimeSession(parsedContent, storedSave);
        if (storedSave && restoredSession.loadResult.shouldQuarantine) {
          quarantineRejectedRuntimeSave(storageKey, storedSave, restoredSession.loadResult.status);
        }
        if (restoredSession.loadResult.status === "migrated" && restoredSession.loadResult.envelope) {
          persistRuntimeSave(storageKey, restoredSession.loadResult.envelope);
        }

        setBuildManifest(manifest);
        setContent(parsedContent);
        setController(restoredSession.controller);
        setActiveLocale(nextLocale);
        setSnapshot(restoredSession.controller.getSnapshot());
        setPlayheadMs(restoredSession.saveState.playheadMs);
        setInteractionMediaPlayback(undefined);
        setActiveResponse(undefined);
        setHasValidStoredSave(
          restoredSession.loadResult.status === "compatible" || restoredSession.loadResult.status === "migrated"
        );
        setRuntimeNotice(resolveRuntimeSaveLoadNotice(restoredSession.loadResult, nextLocale));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }

    void loadBuild();
  }, []);

  const storageKey = buildManifest ? resolveRuntimeSaveStorageKey(buildManifest.projectId) : "";
  const localeStorageKey = buildManifest ? `mage2-runtime-locale:${buildManifest.projectId}` : "";
  const supportedLocales =
    content
      ? normalizeSupportedLocales(content.manifest.defaultLanguage, content.manifest.supportedLocales)
      : [];
  const locale = activeLocale ?? content?.manifest.defaultLanguage ?? "en";
  const localeStrings = content
    ? resolveRuntimeLocaleStrings(content.strings, locale, content.manifest.defaultLanguage)
    : {};
  const systemCopy = resolveRuntimeSystemCopy(locale);
  const canQuitRuntime = typeof window !== "undefined" && typeof window.mage2Runtime?.quit === "function";
  const playerCopy = resolveRuntimePlayerCopy(locale);
  const runtimeProject = useMemo(() => (content ? createRuntimeProject(content) : undefined), [content]);
  const currentAsset =
    content && snapshot
      ? (content.assets.find((asset) => asset.id === snapshot.scene.backgroundAssetId) as Asset | undefined)
      : undefined;
  const currentAssetVariant = currentAsset ? resolveAssetVariant(currentAsset, locale) : undefined;
  const sceneAudioAsset =
    content && snapshot?.scene.sceneAudioAssetId
      ? (content.assets.find((asset) => asset.id === snapshot.scene.sceneAudioAssetId) as Asset | undefined)
      : undefined;
  const sceneAudioVariant = sceneAudioAsset ? resolveAssetVariant(sceneAudioAsset, locale) : undefined;
  const dialogueMediaAssetId = snapshot?.activeDialogue?.node.mediaAssetId;
  const foregroundMediaAssetId = dialogueMediaAssetId ?? interactionMediaPlayback?.assetId;
  const foregroundMediaAsset =
    content && foregroundMediaAssetId
      ? (content.assets.find((asset) => asset.id === foregroundMediaAssetId) as Asset | undefined)
      : undefined;
  const foregroundMediaPlaybackKey = dialogueMediaAssetId
    ? `dialogue:${snapshot?.activeDialogue?.tree.id}:${snapshot?.activeDialogue?.node.id}:${locale}`
    : interactionMediaPlayback
      ? `interaction:${interactionMediaPlayback.sequence}:${locale}`
      : undefined;
  const sceneTimelineDurationMs = resolveSceneTimelineDurationMs(
    currentAssetVariant?.durationMs,
    currentAsset?.kind === "image" ? snapshot?.scene.sceneAudioDelayMs ?? 0 : 0,
    currentAsset?.kind === "image" ? sceneAudioVariant?.durationMs : undefined
  );
  const visibleHotspots = controller ? controller.getVisibleHotspots(playheadMs, sceneTimelineDurationMs) : [];
  const gameplayPaused = activeResponse?.entry.kind === "video";

  useEffect(() => {
    if (dialogueMediaAssetId) {
      setInteractionMediaPlayback(undefined);
    }
  }, [dialogueMediaAssetId]);

  useEffect(() => {
    if (!content) {
      return;
    }

    document.documentElement.lang = locale;
    document.documentElement.dir = resolvePlayerTextDirection(locale);
    document.title = content.manifest.projectName;
    if (localeStorageKey) {
      localStorage.setItem(localeStorageKey, locale);
    }
  }, [content, locale, localeStorageKey]);

  useEffect(() => {
    const dialog = menuOpen
      ? menuDialogRef.current
      : confirmationAction
        ? confirmationDialogRef.current
        : undefined;
    if (!dialog) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const focusableSelector = [
      "button:not([disabled])",
      "select:not([disabled])",
      "input:not([disabled])",
      "[href]",
      '[tabindex]:not([tabindex="-1"])'
    ].join(",");
    const focusFirstControl = () => dialog.querySelector<HTMLElement>(focusableSelector)?.focus();
    const animationFrame = window.requestAnimationFrame(focusFirstControl);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        setConfirmationAction(undefined);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true"
      );
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
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      } else {
        menuButtonRef.current?.focus();
      }
    };
  }, [confirmationAction, menuOpen]);

  if (errorMessage) {
    return (
      <main className="runtime-shell">
        <section className="runtime-card">
          <h1>{startupCopy.startupErrorTitle}</h1>
          <p>{startupCopy.startupErrorBody}</p>
          {debugMode ? <pre className="runtime-error-details">{errorMessage}</pre> : null}
        </section>
      </main>
    );
  }

  if (!buildManifest || !content || !runtimeProject || !controller || !snapshot) {
    return (
      <main className="runtime-shell">
        <section className="runtime-card">
          <h1>{startupCopy.loading}</h1>
        </section>
      </main>
    );
  }

  const headerContent = resolveRuntimeHeaderContent(content);

  const applyRestoredSession = (restoredSession: RuntimeSessionRestoration) => {
    setController(restoredSession.controller);
    setSnapshot(restoredSession.controller.getSnapshot());
    setPlayheadMs(restoredSession.saveState.playheadMs);
    setSelectedInventoryItemId(undefined);
    setInteractionMediaPlayback(undefined);
    setActiveResponse(undefined);
  };

  const applyPlayerResponseResolution = (
    resolution: ReturnType<typeof controller.selectHotspot>
  ) => {
    if (resolution.mediaAssetId) {
      interactionMediaSequenceRef.current += 1;
      setInteractionMediaPlayback({
        assetId: resolution.mediaAssetId,
        sequence: interactionMediaSequenceRef.current
      });
    } else {
      setInteractionMediaPlayback(undefined);
    }

    if (resolution.response) {
      setActiveResponse(resolution.response);
    } else if (resolution.startedDialogueTreeId || resolution.transitionedToSceneId) {
      setActiveResponse(undefined);
    }
  };

  const saveGame = () => {
    const nextSave = controller.save();
    nextSave.playheadMs = playheadMs;
    try {
      localStorage.setItem(storageKey, JSON.stringify(createSaveEnvelope(runtimeProject, nextSave)));
      setHasValidStoredSave(true);
      setRuntimeNotice(systemCopy.gameSaved);
    } catch {
      setRuntimeNotice("Progress could not be saved in local storage.");
    }
    setMenuOpen(false);
  };

  const loadSavedGame = () => {
    const storedSave = localStorage.getItem(storageKey);
    if (storedSave === null) {
      setHasValidStoredSave(false);
      setRuntimeNotice(systemCopy.noValidSave);
      setConfirmationAction(undefined);
      return;
    }

    const restoredSession = restoreRuntimeSession(content, storedSave);
    applyRestoredSession(restoredSession);
    if (restoredSession.loadResult.shouldQuarantine) {
      quarantineRejectedRuntimeSave(storageKey, storedSave, restoredSession.loadResult.status);
      setHasValidStoredSave(false);
      setRuntimeNotice(systemCopy.saveRecovered);
    } else {
      if (restoredSession.loadResult.status === "migrated" && restoredSession.loadResult.envelope) {
        persistRuntimeSave(storageKey, restoredSession.loadResult.envelope);
      }
      setHasValidStoredSave(true);
      setRuntimeNotice(restoredSession.loadResult.message ?? systemCopy.gameLoaded);
    }
    setConfirmationAction(undefined);
  };

  const restartGame = () => {
    localStorage.removeItem(storageKey);
    applyRestoredSession(restoreRuntimeSession(content, null));
    setHasValidStoredSave(false);
    setRuntimeNotice(systemCopy.gameRestarted);
    setConfirmationAction(undefined);
  };

  const modalOpen = menuOpen || Boolean(confirmationAction);

  return (
    <main className="runtime-shell" data-runtime-mode={debugMode ? "debug" : "player"}>
      <section className="runtime-stage" aria-label={headerContent.projectName}>
        <div
          className="runtime-player-layer"
          aria-hidden={modalOpen ? true : undefined}
          inert={modalOpen ? true : undefined}
        >
          <header className="runtime-header">
            <h1>{headerContent.projectName}</h1>
            <button
              ref={menuButtonRef}
              type="button"
              className="runtime-menu-button"
              aria-expanded={menuOpen}
              aria-controls="runtime-player-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {systemCopy.menu}
            </button>
          </header>

          <div className="runtime-player-frame">
            {currentAsset?.kind === "image" && currentAssetVariant?.sourcePath ? (
              <div
                className="runtime-player-backdrop"
                style={{ backgroundImage: `url(${JSON.stringify(currentAssetVariant.sourcePath)})` }}
                aria-hidden="true"
              />
            ) : null}
            <PlayerSceneRenderer
              className={
                gameplayPaused
                  ? "runtime-player-renderer runtime-player-renderer--response-video"
                  : "runtime-player-renderer"
              }
              presentation="runtime-responsive"
              project={runtimeProject!}
              snapshot={snapshot}
              locale={locale}
              strings={localeStrings}
              visibleHotspots={visibleHotspots}
              playheadMs={playheadMs}
              showHotspots={debugMode && showHotspots}
              resolveSourcePath={resolveRuntimeSourcePath}
              bagIconUrl={RUNTIME_INVENTORY_BAG_ICON_SRC}
              copy={playerCopy}
              selectedInventoryItemId={selectedInventoryItemId}
              onSelectedInventoryItemIdChange={(itemId) => {
                setSelectedInventoryItemId(itemId);
                setRuntimeNotice(undefined);
              }}
              onHotspotActivate={(hotspotId) => {
                const resolution = controller.selectHotspot(hotspotId, playheadMs, sceneTimelineDurationMs);
                applyPlayerResponseResolution(resolution);
                setSnapshot(controller.getSnapshot());
                setPlayheadMs(0);
                setRuntimeNotice(undefined);
              }}
              onHotspotEventActivate={(hotspotId, eventType) => {
                const resolution = controller.selectHotspotEvent(
                  hotspotId,
                  eventType,
                  playheadMs,
                  sceneTimelineDurationMs
                );
                applyPlayerResponseResolution(resolution);
                setSnapshot(controller.getSnapshot());
                setPlayheadMs(0);
                setRuntimeNotice(undefined);
              }}
              onPlacedHotspotActivate={(_hotspotId, itemId) => {
                const item = itemId ? content.inventoryItems.find((entry) => entry.id === itemId) : undefined;
                const label = item ? localeStrings[item.textId] ?? item.name : undefined;
                setRuntimeNotice(label ? `${label} — ${systemCopy.placedObject}` : systemCopy.placedObject);
              }}
              onDialogueChoice={(choiceId) => {
                controller.chooseDialogueChoice(choiceId);
                setSnapshot(controller.getSnapshot());
              }}
              onDialogueContinue={() => {
                controller.continueDialogue();
                setSnapshot(controller.getSnapshot());
              }}
              onInteractionBlocked={() => setRuntimeNotice(undefined)}
              activeResponse={activeResponse}
              onResponseComplete={completeResponse}
              onPlayheadMsChange={currentAsset?.kind === "video" ? setPlayheadMs : undefined}
              playbackResetKey={`${snapshot.scene.id}:${locale}`}
            />
            {foregroundMediaAsset && foregroundMediaPlaybackKey ? (
              <RuntimeForegroundMediaPlayer
                key={foregroundMediaPlaybackKey}
                asset={foregroundMediaAsset}
                locale={locale}
                label={dialogueMediaAssetId ? "Dialogue media" : "Interaction media"}
                onDismiss={dialogueMediaAssetId ? undefined : () => setInteractionMediaPlayback(undefined)}
              />
            ) : null}
          </div>

          <PlayerSceneAudio
            sourcePath={sceneAudioVariant?.sourcePath}
            resolveSourcePath={resolveRuntimeSourcePath}
            sceneKey={snapshot.scene.id}
            assetId={snapshot.scene.sceneAudioAssetId}
            enabled={currentAsset?.kind === "image" && Boolean(snapshot.scene.sceneAudioAssetId)}
            playheadMs={playheadMs}
            delayMs={snapshot.scene.sceneAudioDelayMs}
            loop={snapshot.scene.sceneAudioLoop}
            durationMs={sceneAudioVariant?.durationMs}
            paused={gameplayPaused}
            onPlayheadMsChange={setPlayheadMs}
            className="runtime-scene-audio"
          />

          <p
            className={runtimeNotice ? "runtime-status" : "runtime-status runtime-status--empty"}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {runtimeNotice ?? ""}
          </p>

          {debugMode ? (
            <details className="runtime-debug-panel" open>
              <summary>{systemCopy.debugMode}</summary>
              <div className="runtime-debug-panel__body">
                <label className="runtime-hotspot-visibility-toggle">
                  <input
                    type="checkbox"
                    checked={showHotspots}
                    onChange={(event) => setShowHotspots(event.target.checked)}
                  />
                  <span>{systemCopy.showHotspots}</span>
                </label>
                <label className="runtime-scrubber">
                  <span>
                    {systemCopy.playhead} {Math.round(playheadMs)}ms
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={sceneTimelineDurationMs}
                    value={Math.min(playheadMs, sceneTimelineDurationMs)}
                    onChange={(event) => setPlayheadMs(Number(event.target.value))}
                  />
                </label>
                <div className="runtime-debug-state">
                  <h2>{systemCopy.rawSave}</h2>
                  <pre>{JSON.stringify(snapshot.saveState, null, 2)}</pre>
                </div>
              </div>
            </details>
          ) : null}
        </div>

        {menuOpen ? (
          <div className="runtime-modal-layer">
            <div className="runtime-modal-scrim" aria-hidden="true" onClick={() => setMenuOpen(false)} />
            <section
              ref={menuDialogRef}
              id="runtime-player-menu"
              className="runtime-menu-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="runtime-menu-title"
            >
              <div className="runtime-panel-heading">
                <h2 id="runtime-menu-title">{systemCopy.menuTitle}</h2>
                <button
                  type="button"
                  className="runtime-close-button"
                  aria-label={systemCopy.closeMenu}
                  onClick={() => setMenuOpen(false)}
                >
                  {systemCopy.close}
                </button>
              </div>
              <label className="runtime-language-picker">
                <span>{systemCopy.language}</span>
                <select value={locale} onChange={(event) => setActiveLocale(event.target.value)}>
                  {supportedLocales.map((entry) => (
                    <option key={entry} value={entry}>
                      {resolveRuntimeLanguageName(entry)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="runtime-menu-actions">
                <button type="button" onClick={saveGame}>
                  {systemCopy.saveGame}
                </button>
                <button
                  type="button"
                  disabled={!hasValidStoredSave}
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmationAction("load");
                  }}
                >
                  {systemCopy.loadGame}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmationAction("restart");
                  }}
                >
                  {systemCopy.restartGame}
                </button>
                {canQuitRuntime ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      window.mage2Runtime?.quit();
                    }}
                  >
                    {systemCopy.quit}
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {confirmationAction ? (
          <div className="runtime-modal-layer">
            <div
              className="runtime-modal-scrim"
              aria-hidden="true"
              onClick={() => setConfirmationAction(undefined)}
            />
            <section
              ref={confirmationDialogRef}
              className="runtime-confirmation"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="runtime-confirmation-title"
              aria-describedby="runtime-confirmation-body"
            >
              <h2 id="runtime-confirmation-title">
                {confirmationAction === "load" ? systemCopy.confirmLoadTitle : systemCopy.confirmRestartTitle}
              </h2>
              <p id="runtime-confirmation-body">
                {confirmationAction === "load" ? systemCopy.confirmLoadBody : systemCopy.confirmRestartBody}
              </p>
              <div className="runtime-confirmation__actions">
                <button type="button" autoFocus onClick={() => setConfirmationAction(undefined)}>
                  {systemCopy.cancel}
                </button>
                <button
                  type="button"
                  className="runtime-confirmation__primary"
                  onClick={confirmationAction === "load" ? loadSavedGame : restartGame}
                >
                  {confirmationAction === "load" ? systemCopy.confirmLoad : systemCopy.confirmRestart}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function persistRuntimeSave(storageKey: string, envelope: unknown): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(envelope));
  } catch {
    // A migrated save remains usable in memory even when local storage is unavailable.
  }
}

function quarantineRejectedRuntimeSave(storageKey: string, raw: string, status: string): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    localStorage.setItem(`${storageKey}:rejected:${status}:${timestamp}`, raw);
    localStorage.removeItem(storageKey);
  } catch {
    // Preserve the active entry when there is not enough storage to keep a copy.
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PLAYHEAD_SYNC_TOLERANCE_MS,
  createPlayerController,
  getSceneAudioPlayheadMs,
  resolvePlayableDurationMs,
  resolveSceneAudioPlaybackDirective,
  resolveSceneAudioSyncState,
  resolveSceneTimelineDurationMs,
  shouldSyncPlayheadMs,
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
    confirmRestart: "Restart",
    confirmRestartBody: "Saved progress on this device will be deleted.",
    confirmRestartTitle: "Restart the game?",
    debugMode: "Debug mode",
    gameLoaded: "Saved game loaded.",
    gameRestarted: "Game restarted.",
    gameSaved: "Game saved.",
    language: "Language",
    loadGame: "Load game",
    loading: "Loading game...",
    menu: "Menu",
    menuTitle: "Player menu",
    noValidSave: "No valid saved game is available.",
    placedObject: "This object is placed here.",
    playhead: "Playhead",
    rawSave: "Raw save state",
    restartGame: "Restart game",
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
    confirmRestart: "Recommencer",
    confirmRestartBody: "La sauvegarde de cet appareil sera supprimée.",
    confirmRestartTitle: "Recommencer la partie ?",
    debugMode: "Mode debug",
    gameLoaded: "Sauvegarde chargée.",
    gameRestarted: "Partie recommencée.",
    gameSaved: "Partie sauvegardée.",
    language: "Langue",
    loadGame: "Charger la partie",
    loading: "Chargement du jeu...",
    menu: "Menu",
    menuTitle: "Menu du jeu",
    noValidSave: "Aucune sauvegarde valide n'est disponible.",
    placedObject: "Cet objet est placé ici.",
    playhead: "Tête de lecture",
    rawSave: "État brut de la sauvegarde",
    restartGame: "Recommencer la partie",
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
  const runtimeAudioRef = useRef<HTMLAudioElement>(null);
  const sceneAudioTimeoutRef = useRef<number | undefined>(undefined);
  const sceneAudioAnimationFrameRef = useRef<number | undefined>(undefined);
  const sceneAudioDrivenPlayheadMsRef = useRef<number | undefined>(undefined);
  const syncSceneAudioToPlayheadRef = useRef<((playheadMs: number) => void) | undefined>(undefined);
  const sceneAudioPlaybackIntentRef = useRef(true);
  const sceneAudioInternalPauseRef = useRef(false);
  const sceneAudioPhaseRef = useRef<"idle" | "waiting" | "playing" | "ended">("idle");
  const latestPlayheadMsRef = useRef(playheadMs);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuDialogRef = useRef<HTMLElement>(null);
  const confirmationDialogRef = useRef<HTMLElement>(null);
  const startupCopy = resolveRuntimeSystemCopy(
    typeof navigator === "undefined" ? "en" : navigator.language
  );

  useEffect(() => {
    latestPlayheadMsRef.current = playheadMs;
  }, [playheadMs]);

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
        setRuntimeNotice(
          restoredSession.loadResult.message ??
            (restoredSession.recovered ? resolveRuntimeSystemCopy(nextLocale).saveRecovered : undefined)
        );
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
    const audio = runtimeAudioRef.current;
    syncSceneAudioToPlayheadRef.current = undefined;
    if (sceneAudioTimeoutRef.current !== undefined) {
      window.clearTimeout(sceneAudioTimeoutRef.current);
      sceneAudioTimeoutRef.current = undefined;
    }
    if (sceneAudioAnimationFrameRef.current !== undefined) {
      window.cancelAnimationFrame(sceneAudioAnimationFrameRef.current);
      sceneAudioAnimationFrameRef.current = undefined;
    }

    if (!audio || !snapshot) {
      return;
    }
    sceneAudioInternalPauseRef.current = false;

    const cancelAnimationFrameSync = () => {
      if (sceneAudioAnimationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(sceneAudioAnimationFrameRef.current);
        sceneAudioAnimationFrameRef.current = undefined;
      }
    };

    const pauseSceneAudio = () => {
      if (audio.paused) {
        return;
      }

      sceneAudioInternalPauseRef.current = true;
      audio.pause();
    };

    if (gameplayPaused) {
      pauseSceneAudio();
      return;
    }

    const clearPlayback = () => {
      if (sceneAudioTimeoutRef.current !== undefined) {
        window.clearTimeout(sceneAudioTimeoutRef.current);
        sceneAudioTimeoutRef.current = undefined;
      }
      cancelAnimationFrameSync();
      pauseSceneAudio();
      audio.currentTime = 0;
    };

    const updatePlayheadFromSceneAudio = (nextPlayheadMs: number) => {
      sceneAudioDrivenPlayheadMsRef.current = nextPlayheadMs;
      if (!shouldSyncPlayheadMs(latestPlayheadMsRef.current, nextPlayheadMs)) {
        return;
      }

      latestPlayheadMsRef.current = nextPlayheadMs;
      setPlayheadMs(nextPlayheadMs);
    };

    const syncFromAudioClock = () => {
      updatePlayheadFromSceneAudio(
        getSceneAudioPlayheadMs(
          audio.currentTime,
          audio.duration,
          snapshot.scene.sceneAudioDelayMs,
          sceneAudioVariant?.durationMs
        )
      );
    };

    const startPlaybackClock = () => {
      cancelAnimationFrameSync();

      const step = () => {
        syncFromAudioClock();
        if (audio.paused || audio.ended) {
          sceneAudioAnimationFrameRef.current = undefined;
          return;
        }

        sceneAudioAnimationFrameRef.current = window.requestAnimationFrame(step);
      };

      step();
    };

    const startDelayClock = (startingPlayheadMs: number) => {
      cancelAnimationFrameSync();

      const delayMs = Math.max(snapshot.scene.sceneAudioDelayMs, 0);
      const anchorMs = performance.now() - startingPlayheadMs;

      const step = () => {
        const elapsedMs = performance.now() - anchorMs;
        const nextPlayheadMs = Math.min(Math.max(elapsedMs, startingPlayheadMs), delayMs);
        updatePlayheadFromSceneAudio(nextPlayheadMs);
        if (nextPlayheadMs >= delayMs - PLAYHEAD_SYNC_TOLERANCE_MS) {
          sceneAudioAnimationFrameRef.current = undefined;
          return;
        }

        sceneAudioAnimationFrameRef.current = window.requestAnimationFrame(step);
      };

      step();
    };

    const syncSceneAudioToPlayhead = (nextPlayheadMs: number) => {
      if (!sceneAudioVariant?.sourcePath || currentAsset?.kind !== "image" || !snapshot.scene.sceneAudioAssetId) {
        sceneAudioPhaseRef.current = "idle";
        clearPlayback();
        return;
      }

      if (sceneAudioTimeoutRef.current !== undefined) {
        window.clearTimeout(sceneAudioTimeoutRef.current);
        sceneAudioTimeoutRef.current = undefined;
      }
      cancelAnimationFrameSync();

      const syncState = resolveSceneAudioSyncState(
        nextPlayheadMs,
        snapshot.scene.sceneAudioDelayMs,
        resolvePlayableDurationMs(audio.duration, sceneAudioVariant?.durationMs),
        snapshot.scene.sceneAudioLoop
      );
      const playbackDirective = resolveSceneAudioPlaybackDirective(syncState, sceneAudioPlaybackIntentRef.current);
      sceneAudioPhaseRef.current = syncState.phase;

      if (syncState.phase === "waiting") {
        pauseSceneAudio();
        if (Math.abs(audio.currentTime * 1000) > PLAYHEAD_SYNC_TOLERANCE_MS) {
          audio.currentTime = 0;
        }

        if (playbackDirective.shouldScheduleDelayedPlayback) {
          startDelayClock(syncState.effectivePlayheadMs);
          sceneAudioTimeoutRef.current = window.setTimeout(() => {
            sceneAudioTimeoutRef.current = undefined;
            updatePlayheadFromSceneAudio(Math.max(snapshot.scene.sceneAudioDelayMs, 0));
            void audio
              .play()
              .then(() => {
                sceneAudioPhaseRef.current = "playing";
                startPlaybackClock();
              })
              .catch(() => {
                // If autoplay is blocked, leave playback stopped without interrupting runtime.
              });
          }, syncState.startDelayMs);
          return;
        }
      }

      if (syncState.phase === "playing" || syncState.phase === "waiting") {
        if (Math.abs(audio.currentTime * 1000 - syncState.targetAudioCurrentTimeMs) > PLAYHEAD_SYNC_TOLERANCE_MS) {
          audio.currentTime = syncState.targetAudioCurrentTimeMs / 1000;
        }

        if (!playbackDirective.shouldPlay) {
          pauseSceneAudio();
          return;
        }

        if (audio.paused) {
          void audio
            .play()
            .then(() => {
              sceneAudioPhaseRef.current = "playing";
              startPlaybackClock();
            })
            .catch(() => {
              // If autoplay is blocked, leave playback stopped without interrupting runtime.
            });
        } else {
          sceneAudioPhaseRef.current = "playing";
          startPlaybackClock();
        }
        return;
      }

      pauseSceneAudio();
      if (Math.abs(audio.currentTime * 1000 - syncState.targetAudioCurrentTimeMs) > PLAYHEAD_SYNC_TOLERANCE_MS) {
        audio.currentTime = syncState.targetAudioCurrentTimeMs / 1000;
      }
      updatePlayheadFromSceneAudio(syncState.effectivePlayheadMs);
    };

    syncSceneAudioToPlayheadRef.current = syncSceneAudioToPlayhead;

    const handlePlay = () => {
      sceneAudioPlaybackIntentRef.current = true;
      sceneAudioInternalPauseRef.current = false;
      sceneAudioPhaseRef.current = "playing";
      startPlaybackClock();
    };

    const handlePause = () => {
      cancelAnimationFrameSync();
      if (sceneAudioInternalPauseRef.current) {
        sceneAudioInternalPauseRef.current = false;
        return;
      }

      sceneAudioPlaybackIntentRef.current = false;
      if (sceneAudioPhaseRef.current === "playing") {
        syncFromAudioClock();
      }
    };

    const handleSeeked = () => {
      sceneAudioPhaseRef.current = audio.paused ? "ended" : "playing";
      syncFromAudioClock();
    };

    const handleTimeUpdate = () => {
      syncFromAudioClock();
    };

    const handleLoadedMetadata = () => {
      syncSceneAudioToPlayhead(latestPlayheadMsRef.current);
    };

    const handleEnded = () => {
      cancelAnimationFrameSync();
      if (snapshot.scene.sceneAudioLoop) {
        syncSceneAudioToPlayhead(0);
        return;
      }

      const durationMs = resolvePlayableDurationMs(audio.duration, sceneAudioVariant?.durationMs);
      sceneAudioPhaseRef.current = "ended";
      if (durationMs !== undefined) {
        updatePlayheadFromSceneAudio(Math.max(snapshot.scene.sceneAudioDelayMs, 0) + durationMs);
        return;
      }

      syncFromAudioClock();
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("seeked", handleSeeked);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    syncSceneAudioToPlayhead(latestPlayheadMsRef.current);

    return () => {
      syncSceneAudioToPlayheadRef.current = undefined;
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      clearPlayback();
    };
  }, [
    currentAsset?.kind,
    sceneAudioVariant?.sourcePath,
    snapshot?.scene.id,
    snapshot?.scene.sceneAudioAssetId,
    snapshot?.scene.sceneAudioDelayMs,
    snapshot?.scene.sceneAudioLoop,
    sceneAudioVariant?.durationMs,
    gameplayPaused
  ]);

  useEffect(() => {
    const syncSceneAudioToPlayhead = syncSceneAudioToPlayheadRef.current;
    if (!syncSceneAudioToPlayhead || !sceneAudioVariant?.sourcePath || currentAsset?.kind !== "image" || !snapshot?.scene.sceneAudioAssetId) {
      return;
    }

    if (
      sceneAudioDrivenPlayheadMsRef.current !== undefined &&
      !shouldSyncPlayheadMs(sceneAudioDrivenPlayheadMsRef.current, playheadMs)
    ) {
      sceneAudioDrivenPlayheadMsRef.current = undefined;
      return;
    }

    syncSceneAudioToPlayhead(playheadMs);
  }, [playheadMs, currentAsset?.kind, sceneAudioVariant?.sourcePath, snapshot?.scene.sceneAudioAssetId]);

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

          {sceneAudioVariant?.sourcePath ? (
            <audio ref={runtimeAudioRef} src={sceneAudioVariant.sourcePath} preload="metadata" className="runtime-scene-audio" />
          ) : null}

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

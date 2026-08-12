import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPlayerController,
  resolveSceneTimelineDurationMs,
  type ActivePlayerResponse
} from "@mage2/player";
import {
  BUILT_IN_LOCALES,
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
  parseBuildManifest,
  resolveBuiltInLocale,
  type BuiltInLocale
} from "@mage2/schema";
import {
  DEFAULT_PLAYER_EXPERIENCE_PREFERENCES,
  PlayerExperienceShell,
  PlayerSceneRenderer,
  resolvePlayerSystemCopy,
  resolvePlayerTextDirection,
  type PlayerExperiencePreferences,
  type PlayerExperienceScreen,
  type PlayerSceneRendererHandle,
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

export type RuntimeInterfaceLocalePreference = "automatic" | BuiltInLocale;

export function resolveRuntimeInterfaceLocaleStorageKey(projectId: string): string {
  return `mage2-runtime-interface-locale:${projectId}`;
}

export function resolveRuntimeInterfaceLocalePreference(storedPreference: string | null): RuntimeInterfaceLocalePreference {
  return BUILT_IN_LOCALES.includes(storedPreference as BuiltInLocale)
    ? storedPreference as BuiltInLocale
    : "automatic";
}

export function resolveRuntimeInterfaceLocale(
  preference: RuntimeInterfaceLocalePreference,
  preferredLocales: readonly string[] | null | undefined
): BuiltInLocale {
  return preference === "automatic" ? resolveBuiltInLocale(preferredLocales) : preference;
}

function isSupportedBuiltInLocaleVariant(locale: string, builtInLocale: BuiltInLocale): boolean {
  if (resolveBuiltInLocale([locale]) !== builtInLocale) {
    return false;
  }
  if (builtInLocale !== "en") {
    return true;
  }
  try {
    return new Intl.Locale(locale).language === "en";
  } catch {
    return false;
  }
}

export function resolveRuntimeInitialContentLocale(options: {
  supportedLocales: readonly string[];
  defaultLanguage: string;
  storedContentLocale: string | null;
  interfaceLocale: BuiltInLocale;
}): string {
  const { supportedLocales, defaultLanguage, storedContentLocale, interfaceLocale } = options;
  if (storedContentLocale && supportedLocales.includes(storedContentLocale)) {
    return storedContentLocale;
  }
  return supportedLocales.find((locale) => isSupportedBuiltInLocaleVariant(locale, interfaceLocale)) ?? defaultLanguage;
}

export function persistRuntimeInterfaceLocalePreference(
  storage: Pick<Storage, "setItem" | "removeItem">,
  storageKey: string,
  preference: RuntimeInterfaceLocalePreference
): void {
  if (preference === "automatic") {
    storage.removeItem(storageKey);
  } else {
    storage.setItem(storageKey, preference);
  }
}

interface RuntimeSystemCopy {
  closeForegroundMedia: string;
  debugMode: string;
  dialogueMedia: string;
  gameLoaded: string;
  gameRestarted: string;
  gameSaved: string;
  loading: string;
  interactionMedia: string;
  mediaUnavailable: string;
  noValidSave: string;
  placedObject: string;
  playhead: string;
  rawSave: string;
  saveIncompatible: string;
  saveRecovered: string;
  saveFailed: string;
  showHotspots: string;
  startupErrorBody: string;
  startupErrorTitle: string;
}

const RUNTIME_SYSTEM_COPY: Readonly<Record<BuiltInLocale, RuntimeSystemCopy>> = {
  en: {
    closeForegroundMedia: "Close foreground media",
    debugMode: "Debug mode",
    dialogueMedia: "Dialogue media",
    gameLoaded: "Saved game loaded.",
    gameRestarted: "New game started.",
    gameSaved: "Game saved.",
    loading: "Loading game...",
    interactionMedia: "Interaction media",
    mediaUnavailable: "This media is unavailable in the selected game language.",
    noValidSave: "No valid saved game is available.",
    placedObject: "This object is placed here.",
    playhead: "Playhead",
    rawSave: "Raw save state",
    saveIncompatible: "This saved game is from an incompatible release. A new game was started, and the previous save was preserved.",
    saveRecovered: "The saved game could not be read. A new game was started.",
    saveFailed: "Progress could not be saved in local storage.",
    showHotspots: "Show hotspots",
    startupErrorBody: "Check that the complete exported game was published, then try again.",
    startupErrorTitle: "Unable to start this game"
  },
  fr: {
    closeForegroundMedia: "Fermer le média au premier plan",
    debugMode: "Mode debug",
    dialogueMedia: "Média de dialogue",
    gameLoaded: "Sauvegarde chargée.",
    gameRestarted: "Nouvelle partie commencée.",
    gameSaved: "Partie sauvegardée.",
    loading: "Chargement du jeu...",
    interactionMedia: "Média d’interaction",
    mediaUnavailable: "Ce média n’est pas disponible dans la langue de jeu sélectionnée.",
    noValidSave: "Aucune sauvegarde valide n'est disponible.",
    placedObject: "Cet objet est placé ici.",
    playhead: "Tête de lecture",
    rawSave: "État brut de la sauvegarde",
    saveIncompatible: "Cette sauvegarde provient d’une version incompatible. Une nouvelle partie a été lancée et l’ancienne sauvegarde a été conservée.",
    saveRecovered: "La sauvegarde était illisible. Une nouvelle partie a été lancée.",
    saveFailed: "La progression n’a pas pu être enregistrée dans le stockage local.",
    showHotspots: "Afficher les zones",
    startupErrorBody: "Vérifiez que le jeu exporté a été publié en entier, puis réessayez.",
    startupErrorTitle: "Impossible de lancer ce jeu"
  },
  es: {
    closeForegroundMedia: "Cerrar el contenido en primer plano", debugMode: "Modo de depuración", dialogueMedia: "Contenido del diálogo", gameLoaded: "Partida guardada cargada.",
    gameRestarted: "Nueva partida iniciada.", gameSaved: "Partida guardada.", interactionMedia: "Contenido de la interacción",
    loading: "Cargando el juego...", mediaUnavailable: "Este contenido no está disponible en el idioma del juego seleccionado.", noValidSave: "No hay ninguna partida guardada válida.",
    placedObject: "Este objeto está colocado aquí.", playhead: "Cabezal de reproducción", rawSave: "Estado de guardado sin procesar",
    saveFailed: "No se pudo guardar el progreso en el almacenamiento local.",
    saveIncompatible: "Esta partida guardada pertenece a una versión incompatible. Se inició una partida nueva y se conservó la anterior.",
    saveRecovered: "No se pudo leer la partida guardada. Se ha iniciado una nueva partida.", showHotspots: "Mostrar zonas interactivas",
    startupErrorBody: "Comprueba que se haya publicado el juego exportado completo y vuelve a intentarlo.",
    startupErrorTitle: "No se puede iniciar este juego"
  },
  "zh-Hans": {
    closeForegroundMedia: "关闭前景媒体", debugMode: "调试模式", dialogueMedia: "对话媒体", gameLoaded: "已读取存档。", gameRestarted: "已开始新游戏。",
    gameSaved: "游戏已保存。", interactionMedia: "互动媒体", loading: "正在加载游戏……",
    mediaUnavailable: "所选游戏语言没有此媒体。", noValidSave: "没有可用的有效存档。", placedObject: "此物品已放置在这里。", playhead: "播放位置",
    rawSave: "原始存档状态", saveFailed: "无法将进度保存到本地存储。",
    saveIncompatible: "此存档来自不兼容的版本。已开始新游戏，并保留了原存档。",
    saveRecovered: "无法读取存档。已开始新游戏。", showHotspots: "显示互动区域",
    startupErrorBody: "请检查是否已发布完整的导出游戏，然后重试。", startupErrorTitle: "无法启动此游戏"
  },
  ja: {
    closeForegroundMedia: "前景メディアを閉じる", debugMode: "デバッグモード", dialogueMedia: "会話メディア", gameLoaded: "セーブデータをロードしました。",
    gameRestarted: "ニューゲームを開始しました。", gameSaved: "ゲームをセーブしました。", interactionMedia: "インタラクションメディア",
    loading: "ゲームを読み込んでいます…", mediaUnavailable: "選択したゲーム言語ではこのメディアを利用できません。", noValidSave: "有効なセーブデータがありません。", placedObject: "このアイテムはここに置かれています。",
    playhead: "再生位置", rawSave: "セーブデータの生の状態", saveFailed: "進行状況をローカルストレージに保存できませんでした。",
    saveIncompatible: "このセーブデータは互換性のないリリースのものです。以前のセーブを保持したままニューゲームを開始しました。",
    saveRecovered: "セーブデータを読み込めませんでした。ニューゲームを開始しました。", showHotspots: "ホットスポットを表示",
    startupErrorBody: "エクスポートしたゲーム全体が公開されていることを確認して、もう一度お試しください。",
    startupErrorTitle: "このゲームを開始できません"
  },
  ko: {
    closeForegroundMedia: "전경 미디어 닫기", debugMode: "디버그 모드", dialogueMedia: "대화 미디어", gameLoaded: "저장한 게임을 불러왔습니다.",
    gameRestarted: "새 게임을 시작했습니다.", gameSaved: "게임을 저장했습니다.", interactionMedia: "상호작용 미디어",
    loading: "게임 불러오는 중…", mediaUnavailable: "선택한 게임 언어에서는 이 미디어를 사용할 수 없습니다.", noValidSave: "사용할 수 있는 유효한 저장 데이터가 없습니다.", placedObject: "이 물건은 여기에 놓여 있습니다.",
    playhead: "재생 위치", rawSave: "원시 저장 상태", saveFailed: "진행 상황을 로컬 저장소에 저장하지 못했습니다.",
    saveIncompatible: "이 저장 데이터는 호환되지 않는 릴리스에서 만들어졌습니다. 이전 저장은 보존하고 새 게임을 시작했습니다.",
    saveRecovered: "저장한 게임을 읽을 수 없어 새 게임을 시작했습니다.", showHotspots: "핫스팟 표시",
    startupErrorBody: "내보낸 게임 전체가 게시되었는지 확인한 후 다시 시도하세요.", startupErrorTitle: "이 게임을 시작할 수 없습니다"
  },
  ar: {
    closeForegroundMedia: "إغلاق وسائط المقدمة", debugMode: "وضع التصحيح", dialogueMedia: "وسائط الحوار", gameLoaded: "تم تحميل اللعبة المحفوظة.",
    gameRestarted: "بدأت لعبة جديدة.", gameSaved: "تم حفظ اللعبة.", interactionMedia: "وسائط التفاعل",
    loading: "جارٍ تحميل اللعبة...", mediaUnavailable: "هذه الوسائط غير متاحة بلغة اللعبة المحددة.", noValidSave: "لا توجد لعبة محفوظة صالحة.", placedObject: "هذا العنصر موضوع هنا.",
    playhead: "موضع التشغيل", rawSave: "حالة الحفظ الأولية", saveFailed: "تعذر حفظ التقدم في التخزين المحلي.",
    saveIncompatible: "تنتمي هذه اللعبة المحفوظة إلى إصدار غير متوافق. بدأت لعبة جديدة مع الاحتفاظ بالحفظ السابق.",
    saveRecovered: "تعذرت قراءة اللعبة المحفوظة. بدأت لعبة جديدة.", showHotspots: "إظهار مناطق التفاعل",
    startupErrorBody: "تحقق من نشر اللعبة المصدّرة كاملة، ثم حاول مرة أخرى.", startupErrorTitle: "تعذر بدء هذه اللعبة"
  }
};

export function resolveRuntimeSystemCopy(locale: string): RuntimeSystemCopy {
  return RUNTIME_SYSTEM_COPY[resolveBuiltInLocale([locale])];
}

export function resolveRuntimeSaveLoadNotice(
  loadResult: Pick<ReturnType<typeof loadSaveForProject>, "message" | "shouldQuarantine" | "status">,
  locale: string
): string | undefined {
  if (!loadResult.shouldQuarantine) {
    return loadResult.message;
  }
  const copy = resolveRuntimeSystemCopy(locale);
  return loadResult.status === "incompatible" || loadResult.status === "stale"
    ? copy.saveIncompatible
    : copy.saveRecovered;
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
  closeLabel,
  locale,
  label,
  unavailableMessage,
  onDismiss,
  volume = 1
}: {
  asset: Asset;
  closeLabel: string;
  locale: string;
  label: string;
  unavailableMessage: string;
  onDismiss?: () => void;
  volume?: number;
}) {
  const variant = resolveAssetVariant(asset, locale);
  const sourcePath = variant?.proxyPath ?? variant?.sourcePath;
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const nextVolume = Math.min(1, Math.max(0, volume));
    if (videoRef.current) {
      videoRef.current.volume = nextVolume;
    }
    if (audioRef.current) {
      audioRef.current.volume = nextVolume;
    }
  }, [volume]);

  return (
    <section className={`runtime-foreground-media runtime-foreground-media--${asset.kind}`} aria-label={`${label}: ${asset.name}`}>
      <header>
        <span>{label}</span>
        <strong>{asset.name}</strong>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} aria-label={`${closeLabel}: ${asset.name}`} title={closeLabel}>
            &times;
          </button>
        ) : null}
      </header>
      {sourcePath && asset.kind === "video" ? (
        <video ref={videoRef} src={sourcePath} autoPlay controls playsInline preload="auto" />
      ) : sourcePath && asset.kind === "audio" ? (
        <audio ref={audioRef} src={sourcePath} autoPlay controls preload="auto" />
      ) : (
        <div>{unavailableMessage}</div>
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

export function resolveRuntimePlayerPreferences(raw: string | null | undefined): PlayerExperiencePreferences {
  if (!raw) {
    return DEFAULT_PLAYER_EXPERIENCE_PREFERENCES;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      volume:
        typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
          ? Math.min(1, Math.max(0, parsed.volume))
          : DEFAULT_PLAYER_EXPERIENCE_PREFERENCES.volume,
      textSize:
        parsed.textSize === "small" || parsed.textSize === "medium" || parsed.textSize === "large"
          ? parsed.textSize
          : DEFAULT_PLAYER_EXPERIENCE_PREFERENCES.textSize,
      reducedMotion:
        typeof parsed.reducedMotion === "boolean"
          ? parsed.reducedMotion
          : DEFAULT_PLAYER_EXPERIENCE_PREFERENCES.reducedMotion
    };
  } catch {
    return DEFAULT_PLAYER_EXPERIENCE_PREFERENCES;
  }
}

function getNavigatorPreferredLocales(): readonly string[] {
  if (typeof navigator === "undefined") {
    return ["en"];
  }
  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}

export function App() {
  const [debugMode] = useState(() =>
    isRuntimeDebugMode(typeof window === "undefined" ? "" : window.location.search)
  );
  const [buildManifest, setBuildManifest] = useState<BuildManifest>();
  const [content, setContent] = useState<ExportProjectData>();
  const [controller, setController] = useState<ReturnType<typeof createPlayerController>>();
  const [activeLocale, setActiveLocale] = useState<string>();
  const [interfaceLocalePreference, setInterfaceLocalePreference] = useState<RuntimeInterfaceLocalePreference>("automatic");
  const [interfaceLocale, setInterfaceLocale] = useState<BuiltInLocale>(() =>
    resolveRuntimeInterfaceLocale("automatic", getNavigatorPreferredLocales())
  );
  const [playheadMs, setPlayheadMs] = useState(0);
  const [showHotspots, setShowHotspots] = useState(false);
  const [hasValidStoredSave, setHasValidStoredSave] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [snapshot, setSnapshot] = useState(() => controller?.getSnapshot());
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string>();
  const [runtimeNotice, setRuntimeNotice] = useState<string>();
  const [interactionMediaPlayback, setInteractionMediaPlayback] = useState<{ assetId: string; sequence: number }>();
  const [playerScreen, setPlayerScreen] = useState<PlayerExperienceScreen>("title");
  const [playerPreferences, setPlayerPreferences] = useState<PlayerExperiencePreferences>(
    DEFAULT_PLAYER_EXPERIENCE_PREFERENCES
  );
  const [shellMenuOpen, setShellMenuOpen] = useState(false);
  const interactionMediaSequenceRef = useRef(0);
  const playerRendererRef = useRef<PlayerSceneRendererHandle>(null);
  const initialSurfaceReportedRef = useRef(false);
  const [activeResponse, setActiveResponse] = useState<ActivePlayerResponse>();
  const completeResponse = useCallback((sequence: number) => {
    setActiveResponse((current) => (current?.sequence === sequence ? undefined : current));
  }, []);
  const startupCopy = resolveRuntimeSystemCopy(interfaceLocale);

  useEffect(() => {
    async function loadBuild() {
      try {
        const manifestResponse = await fetch("./build-manifest.json");
        if (!manifestResponse.ok) {
          throw new Error("build-manifest.json not found. Export a project and open the generated folder.");
        }

        const manifest = parseBuildManifest(await manifestResponse.json());
        const interfaceLocaleStorageKey = resolveRuntimeInterfaceLocaleStorageKey(manifest.projectId);
        const nextInterfacePreference = resolveRuntimeInterfaceLocalePreference(localStorage.getItem(interfaceLocaleStorageKey));
        const nextInterfaceLocale = resolveRuntimeInterfaceLocale(nextInterfacePreference, getNavigatorPreferredLocales());
        setInterfaceLocalePreference(nextInterfacePreference);
        setInterfaceLocale(nextInterfaceLocale);
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
        const nextLocale = resolveRuntimeInitialContentLocale({
          supportedLocales,
          defaultLanguage: loadedProject.manifest.defaultLanguage,
          storedContentLocale: storedLocale,
          interfaceLocale: nextInterfaceLocale
        });
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
        setRuntimeNotice(resolveRuntimeSaveLoadNotice(restoredSession.loadResult, nextInterfaceLocale));
        setPlayerScreen(loadedProject.manifest.playerPresentation.titleScreenEnabled ? "title" : "game");
        setPlayerPreferences(
          resolveRuntimePlayerPreferences(localStorage.getItem(`mage2-runtime-preferences:${manifest.projectId}`))
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }

    void loadBuild();
  }, []);

  const storageKey = buildManifest ? resolveRuntimeSaveStorageKey(buildManifest.projectId) : "";
  const localeStorageKey = buildManifest ? `mage2-runtime-locale:${buildManifest.projectId}` : "";
  const interfaceLocaleStorageKey = buildManifest ? resolveRuntimeInterfaceLocaleStorageKey(buildManifest.projectId) : "";
  const preferencesStorageKey = buildManifest ? `mage2-runtime-preferences:${buildManifest.projectId}` : "";
  const supportedLocales =
    content
      ? normalizeSupportedLocales(content.manifest.defaultLanguage, content.manifest.supportedLocales)
      : [];
  const locale = activeLocale ?? content?.manifest.defaultLanguage ?? "en";
  const localeStrings = content
    ? resolveRuntimeLocaleStrings(content.strings, locale, content.manifest.defaultLanguage)
    : {};
  const systemCopy = resolveRuntimeSystemCopy(interfaceLocale);
  const canQuitRuntime = typeof window !== "undefined" && typeof window.mage2Runtime?.quit === "function";
  const playerCopy = resolveRuntimePlayerCopy(interfaceLocale);
  const runtimeProject = useMemo(() => (content ? createRuntimeProject(content) : undefined), [content]);
  useEffect(() => {
    if (
      initialSurfaceReportedRef.current ||
      !buildManifest ||
      !content ||
      !runtimeProject ||
      !controller ||
      !snapshot
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (initialSurfaceReportedRef.current) return;
      initialSurfaceReportedRef.current = true;
      window.mage2Runtime?.reportInitialSurfaceReady?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [buildManifest, content, controller, runtimeProject, snapshot]);
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
  const gameplayPaused = activeResponse?.entry.kind === "video" || shellMenuOpen || playerScreen === "title";

  const resolvePresentationVariant = (assetId?: string) => {
    const asset = assetId ? content?.assets.find((entry) => entry.id === assetId) : undefined;
    return asset ? resolveAssetVariant(asset, locale) ?? resolveAssetVariant(asset, content!.manifest.defaultLanguage) : undefined;
  };
  const titleBackgroundVariant = resolvePresentationVariant(content?.manifest.playerPresentation.titleBackgroundAssetId);
  const logoVariant = resolvePresentationVariant(content?.manifest.playerPresentation.logoAssetId);
  const iconVariant = resolvePresentationVariant(content?.manifest.playerPresentation.appIconAssetId);
  const titleBackgroundUrl = titleBackgroundVariant?.proxyPath ?? titleBackgroundVariant?.sourcePath;
  const logoUrl = logoVariant?.proxyPath ?? logoVariant?.sourcePath;
  const iconUrl = iconVariant?.proxyPath ?? iconVariant?.sourcePath;

  useEffect(() => {
    if (dialogueMediaAssetId) {
      setInteractionMediaPlayback(undefined);
    }
  }, [dialogueMediaAssetId]);

  useEffect(() => {
    if (!content) {
      return;
    }

    document.documentElement.lang = interfaceLocale;
    document.documentElement.dir = resolvePlayerTextDirection(interfaceLocale);
    document.title = content.manifest.projectName;
    if (localeStorageKey) {
      localStorage.setItem(localeStorageKey, locale);
    }
  }, [content, interfaceLocale, locale, localeStorageKey]);

  useEffect(() => {
    if (!interfaceLocaleStorageKey) {
      return;
    }
    try {
      persistRuntimeInterfaceLocalePreference(localStorage, interfaceLocaleStorageKey, interfaceLocalePreference);
    } catch {
      // The active interface choice still applies for this session.
    }
  }, [interfaceLocalePreference, interfaceLocaleStorageKey]);

  useEffect(() => {
    if (!preferencesStorageKey) {
      return;
    }
    try {
      localStorage.setItem(preferencesStorageKey, JSON.stringify(playerPreferences));
    } catch {
      // Settings remain active for this session when storage is unavailable.
    }
  }, [playerPreferences, preferencesStorageKey]);

  useEffect(() => {
    if (!content) {
      return;
    }

    const existingIcon = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    const iconLink = existingIcon ?? document.createElement("link");
    const previousIconHref = existingIcon?.getAttribute("href");
    if (!existingIcon) {
      iconLink.rel = "icon";
      document.head.append(iconLink);
    }
    if (iconUrl) {
      iconLink.href = iconUrl;
    }

    const existingTheme = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const themeMeta = existingTheme ?? document.createElement("meta");
    const previousThemeColor = existingTheme?.content;
    if (!existingTheme) {
      themeMeta.name = "theme-color";
      document.head.append(themeMeta);
    }
    themeMeta.content = content.manifest.playerPresentation.accentColor;

    return () => {
      if (!existingIcon) {
        iconLink.remove();
      } else if (previousIconHref === null || previousIconHref === undefined) {
        iconLink.removeAttribute("href");
      } else {
        iconLink.setAttribute("href", previousIconHref);
      }

      if (!existingTheme) {
        themeMeta.remove();
      } else {
        themeMeta.content = previousThemeColor ?? "";
      }
    };
  }, [content, iconUrl]);

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
      setRuntimeNotice(systemCopy.saveFailed);
    }
  };

  const loadSavedGame = () => {
    const storedSave = localStorage.getItem(storageKey);
    if (storedSave === null) {
      setHasValidStoredSave(false);
      setRuntimeNotice(systemCopy.noValidSave);
      return;
    }

    const restoredSession = restoreRuntimeSession(content, storedSave);
    applyRestoredSession(restoredSession);
    if (restoredSession.loadResult.shouldQuarantine) {
      quarantineRejectedRuntimeSave(storageKey, storedSave, restoredSession.loadResult.status);
      setHasValidStoredSave(false);
      setRuntimeNotice(resolveRuntimeSaveLoadNotice(restoredSession.loadResult, interfaceLocale) ?? systemCopy.saveRecovered);
    } else {
      if (restoredSession.loadResult.status === "migrated" && restoredSession.loadResult.envelope) {
        persistRuntimeSave(storageKey, restoredSession.loadResult.envelope);
      }
      setHasValidStoredSave(true);
      setRuntimeNotice(systemCopy.gameLoaded);
    }
  };

  const restartGame = () => {
    localStorage.removeItem(storageKey);
    applyRestoredSession(restoreRuntimeSession(content, null));
    setHasValidStoredSave(false);
    setRuntimeNotice(systemCopy.gameRestarted);
  };

  return (
    <main className="runtime-shell" data-runtime-mode={debugMode ? "debug" : "player"}>
      <section className="runtime-stage" aria-label={headerContent.projectName}>
        <PlayerExperienceShell
          projectName={headerContent.projectName}
          gameVersion={content.manifest.gameVersion}
          presentation={content.manifest.playerPresentation}
          screen={playerScreen}
          onScreenChange={setPlayerScreen}
          onGameplayStartRequest={() => playerRendererRef.current?.resumeSceneMedia()}
          locale={locale}
          supportedLocales={supportedLocales}
          localeStrings={localeStrings}
          onLocaleChange={setActiveLocale}
          interfaceLocale={interfaceLocale}
          interfaceLocalePreference={interfaceLocalePreference}
          onInterfaceLocalePreferenceChange={(preference) => {
            setInterfaceLocalePreference(preference);
            setInterfaceLocale(resolveRuntimeInterfaceLocale(preference, getNavigatorPreferredLocales()));
          }}
          playerUiOverrides={content.playerUiOverrides}
          preferences={playerPreferences}
          onPreferencesChange={setPlayerPreferences}
          hasSavedGame={hasValidStoredSave}
          onContinue={() => setRuntimeNotice(undefined)}
          onNewGame={restartGame}
          onSave={saveGame}
          onLoad={loadSavedGame}
          onQuit={canQuitRuntime ? () => window.mage2Runtime?.quit() : undefined}
          onFullscreen={() => {
            if (document.fullscreenElement) {
              void document.exitFullscreen();
            } else {
              void document.documentElement.requestFullscreen();
            }
          }}
          titleBackgroundUrl={titleBackgroundUrl}
          logoUrl={logoUrl}
          iconUrl={iconUrl}
          status={runtimeNotice}
          onMenuOpenChange={setShellMenuOpen}
          resolveLocaleName={resolveRuntimeLanguageName}
        >
          <div className="runtime-player-layer">
          <div className="runtime-player-frame">
            {currentAsset?.kind === "image" && currentAssetVariant?.sourcePath ? (
              <div
                className="runtime-player-backdrop"
                style={{ backgroundImage: `url(${JSON.stringify(currentAssetVariant.sourcePath)})` }}
                aria-hidden="true"
              />
            ) : null}
            <PlayerSceneRenderer
              ref={playerRendererRef}
              className={
                activeResponse?.entry.kind === "video"
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
              volume={playerPreferences.volume}
              paused={gameplayPaused}
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
              onPlayheadMsChange={setPlayheadMs}
              onSceneMediaEnd={() => {
                const completedSceneId = snapshot.scene.id;
                const resolution = controller.completeSceneMedia();
                applyPlayerResponseResolution(resolution);
                const nextSnapshot = controller.getSnapshot();
                setSnapshot(nextSnapshot);
                if (nextSnapshot.scene.id !== completedSceneId) {
                  setPlayheadMs(0);
                }
              }}
              playbackResetKey={`${snapshot.scene.id}:${locale}`}
            />
            {foregroundMediaAsset && foregroundMediaPlaybackKey ? (
              <RuntimeForegroundMediaPlayer
                key={foregroundMediaPlaybackKey}
                asset={foregroundMediaAsset}
                closeLabel={systemCopy.closeForegroundMedia}
                locale={locale}
                label={dialogueMediaAssetId ? systemCopy.dialogueMedia : systemCopy.interactionMedia}
                unavailableMessage={systemCopy.mediaUnavailable}
                volume={playerPreferences.volume}
                onDismiss={dialogueMediaAssetId ? undefined : () => setInteractionMediaPlayback(undefined)}
              />
            ) : null}
          </div>

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
        </PlayerExperienceShell>

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

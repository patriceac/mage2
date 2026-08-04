import {
  BUILT_IN_LOCALES,
  PLAYER_UI_TEXT_IDS,
  resolveBuiltInLocale,
  type BuiltInLocale,
  type PlayerUiTextId
} from "@mage2/schema";

export interface PlayerExperienceShellCopy {
  automatic: string;
  cancel: string;
  close: string;
  confirmLoadBody: string;
  confirmNewGameBody: string;
  continueGame: string;
  credits: string;
  creditsHeading: string;
  fullscreen: string;
  gameLanguage: string;
  gameLanguageHelp: string;
  interfaceLanguage: string;
  interfaceLanguageHelp: string;
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

const CHROME_COPY: Readonly<Record<BuiltInLocale, PlayerExperienceShellCopy>> = {
  en: {
    automatic: "Automatic", cancel: "Cancel", close: "Close",
    confirmLoadBody: "Current unsaved progress will be replaced.",
    confirmNewGameBody: "Current progress on this device will be replaced.",
    continueGame: "Continue", credits: "Credits", creditsHeading: "Credits", fullscreen: "Fullscreen",
    gameLanguage: "Game language", gameLanguageHelp: "Changes story text and media when available.",
    interfaceLanguage: "Interface language", interfaceLanguageHelp: "Changes menus and controls.",
    landscapeHint: "Best experienced in landscape", loadGame: "Load game", menu: "Menu", menuHeading: "Paused",
    newGame: "New game", noSavedGame: "No saved game is available on this device.", quit: "Quit",
    reducedMotion: "Reduce motion", resume: "Resume", saveGame: "Save game", settings: "Settings",
    settingsHeading: "Player settings", startGame: "Begin", textSize: "Text size", textSizeLarge: "Large",
    textSizeMedium: "Medium", textSizeSmall: "Small", version: "Version", volume: "Volume"
  },
  fr: {
    automatic: "Automatique", cancel: "Annuler", close: "Fermer",
    confirmLoadBody: "La progression actuelle non sauvegardée sera remplacée.",
    confirmNewGameBody: "La progression actuelle sur cet appareil sera remplacée.",
    continueGame: "Continuer", credits: "Crédits", creditsHeading: "Crédits", fullscreen: "Plein écran",
    gameLanguage: "Langue du jeu", gameLanguageHelp: "Modifie le texte et les médias de l’histoire lorsqu’ils sont disponibles.",
    interfaceLanguage: "Langue de l’interface", interfaceLanguageHelp: "Modifie les menus et les commandes.",
    landscapeHint: "Expérience optimale en mode paysage", loadGame: "Charger la partie", menu: "Menu", menuHeading: "En pause",
    newGame: "Nouvelle partie", noSavedGame: "Aucune sauvegarde n’est disponible sur cet appareil.", quit: "Quitter",
    reducedMotion: "Réduire les animations", resume: "Reprendre", saveGame: "Sauvegarder", settings: "Paramètres",
    settingsHeading: "Paramètres du joueur", startGame: "Commencer", textSize: "Taille du texte", textSizeLarge: "Grande",
    textSizeMedium: "Moyenne", textSizeSmall: "Petite", version: "Version", volume: "Volume"
  },
  es: {
    automatic: "Automático", cancel: "Cancelar", close: "Cerrar",
    confirmLoadBody: "Se reemplazará el progreso actual que no se haya guardado.",
    confirmNewGameBody: "Se reemplazará el progreso actual de este dispositivo.",
    continueGame: "Continuar", credits: "Créditos", creditsHeading: "Créditos", fullscreen: "Pantalla completa",
    gameLanguage: "Idioma del juego", gameLanguageHelp: "Cambia el texto y los contenidos multimedia de la historia cuando están disponibles.",
    interfaceLanguage: "Idioma de la interfaz", interfaceLanguageHelp: "Cambia los menús y los controles.",
    landscapeHint: "Se disfruta mejor en horizontal", loadGame: "Cargar partida", menu: "Menú", menuHeading: "En pausa",
    newGame: "Nueva partida", noSavedGame: "No hay ninguna partida guardada en este dispositivo.", quit: "Salir",
    reducedMotion: "Reducir movimiento", resume: "Reanudar", saveGame: "Guardar partida", settings: "Ajustes",
    settingsHeading: "Ajustes del jugador", startGame: "Empezar", textSize: "Tamaño del texto", textSizeLarge: "Grande",
    textSizeMedium: "Mediano", textSizeSmall: "Pequeño", version: "Versión", volume: "Volumen"
  },
  "zh-Hans": {
    automatic: "自动", cancel: "取消", close: "关闭", confirmLoadBody: "当前未保存的进度将被替换。",
    confirmNewGameBody: "此设备上的当前进度将被替换。", continueGame: "继续游戏", credits: "制作人员",
    creditsHeading: "制作人员", fullscreen: "全屏", gameLanguage: "游戏语言",
    gameLanguageHelp: "在可用时更改剧情文字和媒体。", interfaceLanguage: "界面语言",
    interfaceLanguageHelp: "更改菜单和控件。", landscapeHint: "横屏体验更佳", loadGame: "读取游戏",
    menu: "菜单", menuHeading: "已暂停", newGame: "新游戏", noSavedGame: "此设备上没有可用的存档。",
    quit: "退出", reducedMotion: "减少动态效果", resume: "继续", saveGame: "保存游戏", settings: "设置",
    settingsHeading: "玩家设置", startGame: "开始", textSize: "文字大小", textSizeLarge: "大",
    textSizeMedium: "中", textSizeSmall: "小", version: "版本", volume: "音量"
  },
  ja: {
    automatic: "自動", cancel: "キャンセル", close: "閉じる", confirmLoadBody: "現在の未保存の進行状況は置き換えられます。",
    confirmNewGameBody: "この端末の現在の進行状況は置き換えられます。", continueGame: "続きから", credits: "クレジット",
    creditsHeading: "クレジット", fullscreen: "全画面", gameLanguage: "ゲームの言語",
    gameLanguageHelp: "利用可能な場合、物語のテキストとメディアを変更します。", interfaceLanguage: "インターフェースの言語",
    interfaceLanguageHelp: "メニューと操作表示を変更します。", landscapeHint: "横向きでのプレイをおすすめします",
    loadGame: "ロード", menu: "メニュー", menuHeading: "一時停止", newGame: "ニューゲーム",
    noSavedGame: "この端末に利用可能なセーブデータはありません。", quit: "終了", reducedMotion: "動きを減らす",
    resume: "再開", saveGame: "セーブ", settings: "設定", settingsHeading: "プレイヤー設定", startGame: "始める",
    textSize: "文字サイズ", textSizeLarge: "大", textSizeMedium: "中", textSizeSmall: "小", version: "バージョン", volume: "音量"
  },
  ko: {
    automatic: "자동", cancel: "취소", close: "닫기", confirmLoadBody: "현재 저장하지 않은 진행 상황이 교체됩니다.",
    confirmNewGameBody: "이 기기의 현재 진행 상황이 교체됩니다.", continueGame: "계속하기", credits: "제작진",
    creditsHeading: "제작진", fullscreen: "전체 화면", gameLanguage: "게임 언어",
    gameLanguageHelp: "가능한 경우 이야기 텍스트와 미디어를 변경합니다.", interfaceLanguage: "인터페이스 언어",
    interfaceLanguageHelp: "메뉴와 조작 항목을 변경합니다.", landscapeHint: "가로 화면에 최적화되어 있습니다",
    loadGame: "게임 불러오기", menu: "메뉴", menuHeading: "일시 정지", newGame: "새 게임",
    noSavedGame: "이 기기에 사용할 수 있는 저장 데이터가 없습니다.", quit: "종료", reducedMotion: "동작 줄이기",
    resume: "계속", saveGame: "게임 저장", settings: "설정", settingsHeading: "플레이어 설정", startGame: "시작",
    textSize: "글자 크기", textSizeLarge: "크게", textSizeMedium: "보통", textSizeSmall: "작게", version: "버전", volume: "음량"
  },
  ar: {
    automatic: "تلقائي", cancel: "إلغاء", close: "إغلاق", confirmLoadBody: "سيُستبدل التقدم الحالي غير المحفوظ.",
    confirmNewGameBody: "سيُستبدل التقدم الحالي على هذا الجهاز.", continueGame: "متابعة", credits: "فريق العمل",
    creditsHeading: "فريق العمل", fullscreen: "ملء الشاشة", gameLanguage: "لغة اللعبة",
    gameLanguageHelp: "تغيّر نص القصة ووسائطها عند توفرها.", interfaceLanguage: "لغة الواجهة",
    interfaceLanguageHelp: "تغيّر القوائم وعناصر التحكم.", landscapeHint: "تجربة أفضل في الوضع الأفقي",
    loadGame: "تحميل اللعبة", menu: "القائمة", menuHeading: "متوقفة مؤقتًا", newGame: "لعبة جديدة",
    noSavedGame: "لا توجد لعبة محفوظة متاحة على هذا الجهاز.", quit: "خروج", reducedMotion: "تقليل الحركة",
    resume: "استئناف", saveGame: "حفظ اللعبة", settings: "الإعدادات", settingsHeading: "إعدادات اللاعب", startGame: "ابدأ",
    textSize: "حجم النص", textSizeLarge: "كبير", textSizeMedium: "متوسط", textSizeSmall: "صغير", version: "الإصدار", volume: "مستوى الصوت"
  }
};

const SHELL_COPY_TO_TEXT_ID: Partial<Record<keyof PlayerExperienceShellCopy, PlayerUiTextId>> = {
  cancel: PLAYER_UI_TEXT_IDS.cancel, close: PLAYER_UI_TEXT_IDS.close,
  confirmLoadBody: PLAYER_UI_TEXT_IDS.confirmLoadBody, confirmNewGameBody: PLAYER_UI_TEXT_IDS.confirmNewGameBody,
  continueGame: PLAYER_UI_TEXT_IDS.continueGame, credits: PLAYER_UI_TEXT_IDS.credits,
  creditsHeading: PLAYER_UI_TEXT_IDS.creditsHeading, fullscreen: PLAYER_UI_TEXT_IDS.fullscreen,
  gameLanguage: PLAYER_UI_TEXT_IDS.language, landscapeHint: PLAYER_UI_TEXT_IDS.landscapeHint,
  loadGame: PLAYER_UI_TEXT_IDS.loadGame, menu: PLAYER_UI_TEXT_IDS.menu, menuHeading: PLAYER_UI_TEXT_IDS.menuHeading,
  newGame: PLAYER_UI_TEXT_IDS.newGame, noSavedGame: PLAYER_UI_TEXT_IDS.noSavedGame, quit: PLAYER_UI_TEXT_IDS.quit,
  reducedMotion: PLAYER_UI_TEXT_IDS.reducedMotion, resume: PLAYER_UI_TEXT_IDS.resume, saveGame: PLAYER_UI_TEXT_IDS.saveGame,
  settings: PLAYER_UI_TEXT_IDS.settings, settingsHeading: PLAYER_UI_TEXT_IDS.settingsHeading,
  startGame: PLAYER_UI_TEXT_IDS.startGame, textSize: PLAYER_UI_TEXT_IDS.textSize,
  textSizeLarge: PLAYER_UI_TEXT_IDS.textSizeLarge, textSizeMedium: PLAYER_UI_TEXT_IDS.textSizeMedium,
  textSizeSmall: PLAYER_UI_TEXT_IDS.textSizeSmall, version: PLAYER_UI_TEXT_IDS.version, volume: PLAYER_UI_TEXT_IDS.volume
};

export function resolvePlayerExperienceShellCopy(
  localeOrLegacyStrings: string | Record<string, string>,
  overrides: Partial<Record<PlayerUiTextId, string>> = {}
): PlayerExperienceShellCopy {
  const locale = typeof localeOrLegacyStrings === "string" ? resolveBuiltInLocale([localeOrLegacyStrings]) : "en";
  const legacyOverrides = typeof localeOrLegacyStrings === "string" ? overrides : localeOrLegacyStrings;
  const base = CHROME_COPY[locale];
  const result = { ...base };

  for (const [copyKey, textId] of Object.entries(SHELL_COPY_TO_TEXT_ID) as [keyof PlayerExperienceShellCopy, PlayerUiTextId][]) {
    const value = legacyOverrides[textId]?.trim();
    if (value) {
      result[copyKey] = value;
    }
  }

  return result;
}

export function hasCompleteBuiltInPlayerChrome(): boolean {
  const englishValues = CHROME_COPY.en;
  return BUILT_IN_LOCALES.every((locale) =>
    Object.keys(englishValues).every((key) => Boolean(CHROME_COPY[locale][key as keyof PlayerExperienceShellCopy]?.trim()))
  );
}

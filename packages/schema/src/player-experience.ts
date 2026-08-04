export const CINEMATIC_STARTER_KIT_ID = "cinematic";
export const CINEMATIC_STARTER_KIT_VERSION = 1;

export const PLAYER_UI_TEXT_IDS = {
  cancel: "player.ui.cancel",
  close: "player.ui.close",
  continueGame: "player.ui.continue",
  confirmLoadBody: "player.ui.confirmLoadBody",
  confirmNewGameBody: "player.ui.confirmNewGameBody",
  credits: "player.ui.credits",
  creditsHeading: "player.ui.creditsHeading",
  fullscreen: "player.ui.fullscreen",
  language: "player.ui.language",
  landscapeHint: "player.ui.landscapeHint",
  loadGame: "player.ui.loadGame",
  menu: "player.ui.menu",
  menuHeading: "player.ui.menuHeading",
  newGame: "player.ui.newGame",
  noSavedGame: "player.ui.noSavedGame",
  quit: "player.ui.quit",
  reducedMotion: "player.ui.reducedMotion",
  resume: "player.ui.resume",
  saveGame: "player.ui.saveGame",
  settings: "player.ui.settings",
  settingsHeading: "player.ui.settingsHeading",
  startGame: "player.ui.startGame",
  textSize: "player.ui.textSize",
  textSizeLarge: "player.ui.textSizeLarge",
  textSizeMedium: "player.ui.textSizeMedium",
  textSizeSmall: "player.ui.textSizeSmall",
  version: "player.ui.version",
  volume: "player.ui.volume"
} as const;

export type PlayerUiTextId = (typeof PLAYER_UI_TEXT_IDS)[keyof typeof PLAYER_UI_TEXT_IDS];

export const DEFAULT_PLAYER_UI_STRINGS: Readonly<Record<PlayerUiTextId, string>> = {
  [PLAYER_UI_TEXT_IDS.cancel]: "Cancel",
  [PLAYER_UI_TEXT_IDS.close]: "Close",
  [PLAYER_UI_TEXT_IDS.continueGame]: "Continue",
  [PLAYER_UI_TEXT_IDS.confirmLoadBody]: "Current unsaved progress will be replaced.",
  [PLAYER_UI_TEXT_IDS.confirmNewGameBody]: "Current progress on this device will be replaced.",
  [PLAYER_UI_TEXT_IDS.credits]: "Credits",
  [PLAYER_UI_TEXT_IDS.creditsHeading]: "Credits",
  [PLAYER_UI_TEXT_IDS.fullscreen]: "Fullscreen",
  [PLAYER_UI_TEXT_IDS.language]: "Language",
  [PLAYER_UI_TEXT_IDS.landscapeHint]: "Best experienced in landscape",
  [PLAYER_UI_TEXT_IDS.loadGame]: "Load game",
  [PLAYER_UI_TEXT_IDS.menu]: "Menu",
  [PLAYER_UI_TEXT_IDS.menuHeading]: "Paused",
  [PLAYER_UI_TEXT_IDS.newGame]: "New game",
  [PLAYER_UI_TEXT_IDS.noSavedGame]: "No saved game is available on this device.",
  [PLAYER_UI_TEXT_IDS.quit]: "Quit",
  [PLAYER_UI_TEXT_IDS.reducedMotion]: "Reduce motion",
  [PLAYER_UI_TEXT_IDS.resume]: "Resume",
  [PLAYER_UI_TEXT_IDS.saveGame]: "Save game",
  [PLAYER_UI_TEXT_IDS.settings]: "Settings",
  [PLAYER_UI_TEXT_IDS.settingsHeading]: "Player settings",
  [PLAYER_UI_TEXT_IDS.startGame]: "Begin",
  [PLAYER_UI_TEXT_IDS.textSize]: "Text size",
  [PLAYER_UI_TEXT_IDS.textSizeLarge]: "Large",
  [PLAYER_UI_TEXT_IDS.textSizeMedium]: "Medium",
  [PLAYER_UI_TEXT_IDS.textSizeSmall]: "Small",
  [PLAYER_UI_TEXT_IDS.version]: "Version",
  [PLAYER_UI_TEXT_IDS.volume]: "Volume"
};

export const DEFAULT_PLAYER_TAGLINE_TEXT_ID = "player.title.tagline";
export const DEFAULT_PLAYER_CREDITS_TEXT_ID = "player.credits.body";

export function seedPlayerExperienceStrings(byLocale: Record<string, Record<string, string>>, defaultLocale: string): void {
  const sourceStrings = (byLocale[defaultLocale] ??= {});
  for (const [textId, value] of Object.entries(DEFAULT_PLAYER_UI_STRINGS)) {
    sourceStrings[textId] ??= value;
  }
  sourceStrings[DEFAULT_PLAYER_TAGLINE_TEXT_ID] ??= "An interactive story";
  sourceStrings[DEFAULT_PLAYER_CREDITS_TEXT_ID] ??= "Created with MAGE2";
}

export function collectPlayerExperienceTextIds(options?: {
  taglineTextId?: string;
  creditsTextId?: string;
}): string[] {
  return [
    ...Object.values(PLAYER_UI_TEXT_IDS),
    options?.taglineTextId,
    options?.creditsTextId
  ].filter((textId): textId is string => Boolean(textId));
}

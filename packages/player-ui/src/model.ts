import {
  hasHotspotEvent,
  resolveAssetCategory,
  resolveAssetVariant,
  resolveHotspotInventoryAction,
  resolvePlacedInventoryHotspotInstance,
  resolvePlacedInventoryItemId,
  shouldDisplayHotspotInventoryVisual,
  type Asset,
  type Hotspot,
  type InventoryItem
} from "@mage2/schema";

export type PlayerSourceResolver = (sourcePath: string) => Promise<string>;
export type PlayerScenePresentation = "embedded" | "runtime-responsive";

export interface PlayerSystemCopy {
  narrator: string;
  continue: string;
  inventory: string;
  inventoryToggleLabel(options: { isExpanded: boolean; itemCount: number }): string;
  emptyInventory: string;
  chooseDialogueResponseTitle: string;
  continueDialogueTitle: string;
  activateHotspot: string;
  missingVisual: string;
  skipResponseVideo: string;
  stopResponseAudio: string;
  playResponseAudio: string;
  responseAudioPlaying: string;
  responseMediaUnavailable: string;
}

const PLAYER_SYSTEM_COPY: Record<"en" | "fr" | "es" | "zh" | "ja" | "ko" | "ar", PlayerSystemCopy> = {
  en: {
    narrator: "Narrator",
    continue: "Continue",
    inventory: "Inventory",
    inventoryToggleLabel: ({ isExpanded, itemCount }) => {
      const itemLabel = itemCount === 1 ? "1 item" : `${itemCount} items`;
      return `${isExpanded ? "Close" : "Open"} inventory (${itemLabel})`;
    },
    emptyInventory: "Empty",
    chooseDialogueResponseTitle: "Choose this response.",
    continueDialogueTitle: "Continue the dialogue.",
    activateHotspot: "Activate",
    missingVisual: "No playable visual for this scene.",
    skipResponseVideo: "Skip",
    stopResponseAudio: "Stop",
    playResponseAudio: "Play",
    responseAudioPlaying: "Audio response",
    responseMediaUnavailable: "This response media is unavailable."
  },
  fr: {
    narrator: "Narrateur",
    continue: "Continuer",
    inventory: "Inventaire",
    inventoryToggleLabel: ({ isExpanded, itemCount }) =>
      `${isExpanded ? "Fermer" : "Ouvrir"} l’inventaire (${itemCount} objet${itemCount === 1 ? "" : "s"})`,
    emptyInventory: "Vide",
    chooseDialogueResponseTitle: "Choisir cette réponse.",
    continueDialogueTitle: "Continuer le dialogue.",
    activateHotspot: "Activer",
    missingVisual: "Aucun visuel jouable pour cette scène.",
    skipResponseVideo: "Passer",
    stopResponseAudio: "Arrêter",
    playResponseAudio: "Lire",
    responseAudioPlaying: "Réponse audio",
    responseMediaUnavailable: "Ce média de réponse est indisponible."
  },
  es: {
    narrator: "Narrador",
    continue: "Continuar",
    inventory: "Inventario",
    inventoryToggleLabel: ({ isExpanded, itemCount }) =>
      `${isExpanded ? "Cerrar" : "Abrir"} inventario (${itemCount} objeto${itemCount === 1 ? "" : "s"})`,
    emptyInventory: "Vacío",
    chooseDialogueResponseTitle: "Elegir esta respuesta.",
    continueDialogueTitle: "Continuar el diálogo.",
    activateHotspot: "Activar",
    missingVisual: "No hay una imagen reproducible para esta escena.",
    skipResponseVideo: "Omitir",
    stopResponseAudio: "Detener",
    playResponseAudio: "Reproducir",
    responseAudioPlaying: "Respuesta de audio",
    responseMediaUnavailable: "Este contenido de respuesta no está disponible."
  },
  zh: {
    narrator: "旁白",
    continue: "继续",
    inventory: "物品栏",
    inventoryToggleLabel: ({ isExpanded, itemCount }) => `${isExpanded ? "关闭" : "打开"}物品栏（${itemCount} 件物品）`,
    emptyInventory: "空",
    chooseDialogueResponseTitle: "选择此回答。",
    continueDialogueTitle: "继续对话。",
    activateHotspot: "互动",
    missingVisual: "此场景没有可播放的画面。",
    skipResponseVideo: "跳过",
    stopResponseAudio: "停止",
    playResponseAudio: "播放",
    responseAudioPlaying: "音频回应",
    responseMediaUnavailable: "此回应媒体无法播放。"
  },
  ja: {
    narrator: "ナレーター",
    continue: "続ける",
    inventory: "持ち物",
    inventoryToggleLabel: ({ isExpanded, itemCount }) => `${isExpanded ? "閉じる" : "開く"}（${itemCount}個）`,
    emptyInventory: "空",
    chooseDialogueResponseTitle: "この返答を選ぶ。",
    continueDialogueTitle: "会話を続ける。",
    activateHotspot: "調べる",
    missingVisual: "このシーンには再生できる映像がありません。",
    skipResponseVideo: "スキップ",
    stopResponseAudio: "停止",
    playResponseAudio: "再生",
    responseAudioPlaying: "音声レスポンス",
    responseMediaUnavailable: "このレスポンスメディアは再生できません。"
  },
  ko: {
    narrator: "내레이터",
    continue: "계속",
    inventory: "소지품",
    inventoryToggleLabel: ({ isExpanded, itemCount }) => `소지품 ${isExpanded ? "닫기" : "열기"} (${itemCount}개)`,
    emptyInventory: "비어 있음",
    chooseDialogueResponseTitle: "이 응답을 선택합니다.",
    continueDialogueTitle: "대화를 계속합니다.",
    activateHotspot: "상호작용",
    missingVisual: "이 장면에 재생 가능한 화면이 없습니다.",
    skipResponseVideo: "건너뛰기",
    stopResponseAudio: "중지",
    playResponseAudio: "재생",
    responseAudioPlaying: "오디오 응답",
    responseMediaUnavailable: "이 응답 미디어를 재생할 수 없습니다."
  },
  ar: {
    narrator: "الراوي",
    continue: "متابعة",
    inventory: "المخزون",
    inventoryToggleLabel: ({ isExpanded, itemCount }) => `${isExpanded ? "إغلاق" : "فتح"} المخزون (${itemCount})`,
    emptyInventory: "فارغ",
    chooseDialogueResponseTitle: "اختر هذا الرد.",
    continueDialogueTitle: "تابع الحوار.",
    activateHotspot: "تفاعل",
    missingVisual: "لا توجد صورة قابلة للتشغيل لهذا المشهد.",
    skipResponseVideo: "تخطي",
    stopResponseAudio: "إيقاف",
    playResponseAudio: "تشغيل",
    responseAudioPlaying: "استجابة صوتية",
    responseMediaUnavailable: "وسائط هذا الرد غير متاحة."
  }
};

export function resolvePlayerSystemCopy(locale: string): PlayerSystemCopy {
  const baseLanguage = locale.trim().toLowerCase().replaceAll("_", "-").split("-")[0];
  return PLAYER_SYSTEM_COPY[baseLanguage as keyof typeof PLAYER_SYSTEM_COPY] ?? PLAYER_SYSTEM_COPY.en;
}

export function resolvePlayerTextDirection(locale: string): "ltr" | "rtl" {
  const baseLanguage = locale.trim().toLowerCase().replaceAll("_", "-").split("-")[0];
  return baseLanguage === "ar" || baseLanguage === "fa" || baseLanguage === "he" || baseLanguage === "ur"
    ? "rtl"
    : "ltr";
}

export interface PlayerInventoryItemView {
  id: string;
  label: string;
  tooltip: string;
  imageSrc?: string;
  selected: boolean;
}

export interface PlayerCursorPoint {
  x: number;
  y: number;
}

export interface PlayerHotspotVisual {
  sourcePath: string;
  alt: string;
}

export type PlayerPlacedHotspotInstance = NonNullable<ReturnType<typeof resolvePlacedInventoryHotspotInstance>>;

export interface PlayerSceneHotspots {
  placedInstances: PlayerPlacedHotspotInstance[];
  placedHotspots: Hotspot[];
  surfaceHotspots: Hotspot[];
}

export type PlayerHotspotInteraction =
  | { type: "blocked"; reason: "dialogue" | "response" }
  | { type: "activate"; inventoryAction: ReturnType<typeof resolveHotspotInventoryAction> }
  | { type: "event"; eventType: "click" | "otherItem" }
  | { type: "none" }
  | { type: "placed"; itemId?: string };

export function resolvePlayerInventoryItemInitial(label: string): string {
  const firstGlyph = label.trim().charAt(0);
  return firstGlyph ? firstGlyph.toLocaleUpperCase() : "?";
}

export function resolvePlayerInventoryItemTooltip(label: string, description?: string): string {
  const normalizedDescription = description?.trim().replace(/\s+/g, " ");
  return normalizedDescription && normalizedDescription !== label ? `${label} - ${normalizedDescription}` : label;
}

export function resolvePlayerInventorySlotSelection(
  itemId: string,
  isSelected: boolean,
  cursorPoint?: PlayerCursorPoint
) {
  const nextSelectedItemId = isSelected ? undefined : itemId;
  return {
    nextSelectedItemId,
    nextIsExpanded: false,
    cursorPoint: nextSelectedItemId ? cursorPoint : undefined
  };
}

export function resolvePlayerDialogueChoiceMarker(index: number): string {
  return index >= 0 && index < 26 ? String.fromCharCode("A".charCodeAt(0) + index) : String(index + 1);
}

export function resolvePlayerStageHudClassName(hasActiveDialogue: boolean, isInventoryDrawerExpanded: boolean): string {
  return [
    "mage2-player__hud",
    hasActiveDialogue ? "mage2-player__hud--dialogue" : undefined,
    isInventoryDrawerExpanded ? "mage2-player__hud--inventory-open" : undefined
  ]
    .filter(Boolean)
    .join(" ");
}

export function resolvePlayerInventoryToggleLabel(
  itemCount: number,
  isExpanded: boolean,
  copy: Pick<PlayerSystemCopy, "inventoryToggleLabel">
): string {
  return copy.inventoryToggleLabel({ itemCount, isExpanded });
}

export function shouldHandlePlayerHotspotClick(
  hasActiveDialogue: boolean,
  selectedInventoryItemId?: string,
  inventoryAction: Pick<ReturnType<typeof resolveHotspotInventoryAction>, "type" | "itemId"> = { type: "none" }
): boolean {
  if (hasActiveDialogue) {
    return false;
  }

  if (!selectedInventoryItemId) {
    return inventoryAction.type !== "placeItem";
  }

  return inventoryAction.type === "placeItem" && inventoryAction.itemId === selectedInventoryItemId;
}

export function resolvePlayerHotspotInteraction(options: {
  hasActiveDialogue: boolean;
  selectedInventoryItemId?: string;
  hotspot?: Hotspot;
  placedHotspot?: Hotspot;
}): PlayerHotspotInteraction {
  const { hasActiveDialogue, selectedInventoryItemId, hotspot, placedHotspot } = options;
  if (hasActiveDialogue) {
    return { type: "blocked", reason: "dialogue" };
  }

  if (hotspot) {
    const inventoryAction = resolveHotspotInventoryAction(hotspot);
    if (!selectedInventoryItemId && inventoryAction.type === "placeItem") {
      return hasHotspotEvent(hotspot.clickEvent)
        ? { type: "event", eventType: "click" }
        : { type: "none" };
    }

    if (shouldHandlePlayerHotspotClick(false, selectedInventoryItemId, inventoryAction)) {
      return hasHotspotEvent(hotspot) || inventoryAction.type === "placeItem"
        ? { type: "activate", inventoryAction }
        : { type: "none" };
    }

    return hasHotspotEvent(hotspot.otherItemEvent)
      ? { type: "event", eventType: "otherItem" }
      : { type: "none" };
  }

  if (placedHotspot) {
    if (selectedInventoryItemId) {
      return hasHotspotEvent(placedHotspot.otherItemEvent)
        ? { type: "event", eventType: "otherItem" }
        : { type: "none" };
    }
    return { type: "placed", itemId: placedHotspot.inventoryItemId };
  }

  return { type: "none" };
}

export function resolvePlayerSceneHotspots(
  visibleHotspots: Hotspot[],
  sceneHotspots: Hotspot[],
  flags: Record<string, boolean>
): PlayerSceneHotspots {
  const placedInstances = sceneHotspots
    .map((hotspot) =>
      resolvePlacedInventoryItemId(hotspot, flags)
        ? resolvePlacedInventoryHotspotInstance(hotspot, sceneHotspots)
        : undefined
    )
    .filter((instance): instance is PlayerPlacedHotspotInstance => Boolean(instance));
  const placedHotspots = placedInstances.map((instance) => instance.hotspot);
  const seenIds = new Set<string>();
  const surfaceHotspots = [...visibleHotspots, ...placedHotspots].filter((hotspot) => {
    if (seenIds.has(hotspot.id)) {
      return false;
    }
    seenIds.add(hotspot.id);
    return true;
  });

  return { placedInstances, placedHotspots, surfaceHotspots };
}

export function resolvePlayerHotspotVisuals(options: {
  hotspots: Hotspot[];
  inventoryItems: InventoryItem[];
  assets: Asset[];
  locale: string;
  strings: Record<string, string>;
  flags?: Record<string, boolean>;
}): Record<string, PlayerHotspotVisual> {
  const { hotspots, inventoryItems, assets, locale, strings, flags } = options;
  const itemsById = new Map(inventoryItems.map((item) => [item.id, item] as const));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset] as const));
  const visuals: Record<string, PlayerHotspotVisual> = {};

  for (const hotspot of hotspots) {
    if (!hotspot.inventoryItemId || !shouldDisplayHotspotInventoryVisual(hotspot, flags)) {
      continue;
    }

    const item = itemsById.get(hotspot.inventoryItemId);
    if (!item?.imageAssetId) {
      continue;
    }

    const asset = assetsById.get(item.imageAssetId);
    if (!asset || asset.kind !== "image" || resolveAssetCategory(asset) !== "inventory") {
      continue;
    }

    const variant = resolveAssetVariant(asset, locale);
    const sourcePath = variant?.proxyPath ?? variant?.sourcePath;
    if (!sourcePath) {
      continue;
    }

    visuals[hotspot.id] = {
      sourcePath,
      alt: strings[item.textId] ?? item.name ?? hotspot.name ?? hotspot.id
    };
  }

  return visuals;
}

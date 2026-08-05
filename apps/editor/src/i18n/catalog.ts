import { BUILT_IN_LOCALES, type BuiltInLocale } from "@mage2/schema";
import { appMessages } from "./catalogs/app";
import { assetsMessages } from "./catalogs/assets";
import { dialogueMessages } from "./catalogs/dialogue";
import { dialogsMessages } from "./catalogs/dialogs";
import { errorsMessages } from "./catalogs/errors";
import { inventoryMessages } from "./catalogs/inventory";
import { localizationMessages } from "./catalogs/localization";
import { playerMessages } from "./catalogs/player";
import { playtestMessages } from "./catalogs/playtest";
import { readinessMessages } from "./catalogs/readiness";
import { scenesMessages } from "./catalogs/scenes";
import { sharedMessages } from "./catalogs/shared";
import { worldMessages } from "./catalogs/world";
import type { EditorMessages } from "./messages";

export type EditorCatalog = Readonly<Record<string, Readonly<Partial<Record<BuiltInLocale, string>>>>>;
export interface EditorFeatureCatalog {
  feature: string;
  messages: EditorMessages;
}

export function createEditorCatalog(featureCatalogs: readonly EditorFeatureCatalog[]): EditorCatalog {
  const catalog: Record<string, Partial<Record<BuiltInLocale, string>>> = {};
  const owners = new Map<string, string>();

  for (const { feature, messages } of featureCatalogs) {
    for (const [source, translations] of Object.entries(messages)) {
      const existingOwner = owners.get(source);
      if (existingOwner) {
        const existing = catalog[source];
        const next = { en: source, ...translations };
        if (!BUILT_IN_LOCALES.every((locale) => existing?.[locale] === next[locale])) {
          throw new Error(`Editor message key collision for "${source}" between ${existingOwner} and ${feature}.`);
        }
        continue;
      }
      owners.set(source, feature);
      catalog[source] = { en: source, ...translations };
    }
  }

  return catalog;
}

export const EDITOR_FEATURE_CATALOGS: readonly EditorFeatureCatalog[] = [
  { feature: "app", messages: appMessages },
  { feature: "dialogs", messages: dialogsMessages },
  { feature: "errors", messages: errorsMessages },
  { feature: "shared", messages: sharedMessages },
  { feature: "world", messages: worldMessages },
  { feature: "scenes", messages: scenesMessages },
  { feature: "dialogue", messages: dialogueMessages },
  { feature: "inventory", messages: inventoryMessages },
  { feature: "localization", messages: localizationMessages },
  { feature: "assets", messages: assetsMessages },
  { feature: "player", messages: playerMessages },
  { feature: "readiness", messages: readinessMessages },
  { feature: "playtest", messages: playtestMessages }
];

export const EDITOR_CATALOG = createEditorCatalog(EDITOR_FEATURE_CATALOGS);

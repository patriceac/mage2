import {
  ensureLocaleStringTranslationStates,
  ensureLocaleStringValues,
  getLocaleStringValues,
  getLocalizedText,
  getStringTranslationState,
  normalizeSupportedLocales,
  resolveAssetVariant,
  type Asset,
  type AssetVariant,
  type ProjectBundle,
  type StringTranslationState
} from "@mage2/schema";

export function getSupportedProjectLocales(project: ProjectBundle): string[] {
  return normalizeSupportedLocales(project.manifest.defaultLanguage, project.manifest.supportedLocales);
}

export function getEditorLocaleStrings(project: ProjectBundle, locale: string): Record<string, string> {
  return getLocaleStringValues(project, locale);
}

export function getEditorLocalizedText(project: ProjectBundle, locale: string, textId: string): string | undefined {
  return getLocalizedText(project, locale, textId);
}

export function setEditorLocalizedText(project: ProjectBundle, locale: string, textId: string, value: string): void {
  if (locale === project.manifest.defaultLanguage) {
    const inheritedLocales = getSupportedProjectLocales(project).filter(
      (entry) => entry !== locale && getStringTranslationState(project, entry, textId) === "inherited"
    );
    ensureLocaleStringValues(project, locale)[textId] = value;

    for (const inheritedLocale of inheritedLocales) {
      ensureLocaleStringValues(project, inheritedLocale)[textId] = value;
      ensureLocaleStringTranslationStates(project, inheritedLocale)[textId] = "inherited";
    }
    return;
  }

  ensureLocaleStringValues(project, locale)[textId] = value;
  ensureLocaleStringTranslationStates(project, locale)[textId] = "draft";
}

export function deleteEditorLocalizedText(project: ProjectBundle, locale: string, textId: string): void {
  delete ensureLocaleStringValues(project, locale)[textId];
  delete ensureLocaleStringTranslationStates(project, locale)[textId];
}

export function seedProjectLocale(project: ProjectBundle, locale: string): void {
  const defaultStrings = getLocaleStringValues(project, project.manifest.defaultLanguage);
  const existingStrings = project.strings.byLocale[locale] ?? {};
  const existingStates = project.strings.translationStateByLocale[locale] ?? {};
  const seededStrings = { ...defaultStrings, ...existingStrings };
  const seededStates: Record<string, StringTranslationState> = {};

  for (const [textId, value] of Object.entries(seededStrings)) {
    seededStates[textId] =
      existingStates[textId] ??
      (Object.prototype.hasOwnProperty.call(existingStrings, textId) && value !== defaultStrings[textId]
        ? "draft"
        : "inherited");
  }

  project.strings.byLocale[locale] = seededStrings;
  project.strings.translationStateByLocale[locale] = seededStates;
}

export function removeProjectLocale(project: ProjectBundle, locale: string): void {
  if (locale === project.manifest.defaultLanguage) {
    return;
  }

  delete project.strings.byLocale[locale];
  delete project.strings.translationStateByLocale[locale];

  for (const asset of project.assets.assets) {
    delete asset.variants[locale];
  }

  project.manifest.supportedLocales = normalizeSupportedLocales(
    project.manifest.defaultLanguage,
    project.manifest.supportedLocales.filter((entry) => entry !== locale)
  );
}

export function setProjectDefaultLocale(project: ProjectBundle, locale: string): void {
  if (locale === project.manifest.defaultLanguage) {
    return;
  }

  project.strings.byLocale[locale] ??= {};
  project.manifest.defaultLanguage = locale;
  project.manifest.supportedLocales = normalizeSupportedLocales(locale, project.manifest.supportedLocales);

  const sourceStrings = project.strings.byLocale[locale];
  for (const supportedLocale of project.manifest.supportedLocales) {
    if (supportedLocale === locale) {
      project.strings.translationStateByLocale[supportedLocale] = {};
      continue;
    }

    const values = project.strings.byLocale[supportedLocale] ?? {};
    project.strings.byLocale[supportedLocale] = values;
    project.strings.translationStateByLocale[supportedLocale] = Object.fromEntries(
      Object.entries(values).map(([textId, value]) => [
        textId,
        value === sourceStrings[textId] ? "inherited" : "draft"
      ])
    );
  }
}

export function addProjectLocale(project: ProjectBundle, locale: string): void {
  project.manifest.supportedLocales = normalizeSupportedLocales(project.manifest.defaultLanguage, [
    ...project.manifest.supportedLocales,
    locale
  ]);
  seedProjectLocale(project, locale);
}

export function setEditorStringTranslationState(
  project: ProjectBundle,
  locale: string,
  textId: string,
  state: StringTranslationState
): void {
  if (locale === project.manifest.defaultLanguage) {
    return;
  }

  if (state === "inherited") {
    const sourceStrings = getLocaleStringValues(project, project.manifest.defaultLanguage);
    if (!Object.prototype.hasOwnProperty.call(sourceStrings, textId)) {
      return;
    }
    ensureLocaleStringValues(project, locale)[textId] = sourceStrings[textId] ?? "";
  } else if (!Object.prototype.hasOwnProperty.call(ensureLocaleStringValues(project, locale), textId)) {
    return;
  }

  ensureLocaleStringTranslationStates(project, locale)[textId] = state;
}

export function getLocalizedAssetVariant(asset: Asset | undefined, locale: string): AssetVariant | undefined {
  return asset ? resolveAssetVariant(asset, locale) : undefined;
}

export function getLocaleCompletenessStatus(asset: Asset, locales: string[]): {
  present: string[];
  missing: string[];
} {
  const present = locales.filter((locale) => Boolean(asset.variants[locale]));
  const missing = locales.filter((locale) => !asset.variants[locale]);
  return { present, missing };
}

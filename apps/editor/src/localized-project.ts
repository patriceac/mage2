import {
  ensureLocaleStringValues,
  getLocaleStringValues,
  getLocalizedText,
  normalizeSupportedLocales,
  resolveAssetVariant,
  type Asset,
  type AssetVariant,
  type ProjectBundle
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
  ensureLocaleStringValues(project, locale)[textId] = value;
}

export function deleteEditorLocalizedText(project: ProjectBundle, locale: string, textId: string): void {
  delete ensureLocaleStringValues(project, locale)[textId];
}

export function seedProjectLocale(project: ProjectBundle, locale: string): void {
  const defaultStrings = getLocaleStringValues(project, project.manifest.defaultLanguage);
  project.strings.byLocale[locale] = { ...defaultStrings, ...(project.strings.byLocale[locale] ?? {}) };
}

export function removeProjectLocale(project: ProjectBundle, locale: string): void {
  delete project.strings.byLocale[locale];

  for (const asset of project.assets.assets) {
    delete asset.variants[locale];
  }

  project.manifest.supportedLocales = normalizeSupportedLocales(
    project.manifest.defaultLanguage,
    project.manifest.supportedLocales.filter((entry) => entry !== locale)
  );
}

export function setProjectDefaultLocale(project: ProjectBundle, locale: string): void {
  project.manifest.defaultLanguage = locale;
  project.manifest.supportedLocales = normalizeSupportedLocales(locale, project.manifest.supportedLocales);
}

export function addProjectLocale(project: ProjectBundle, locale: string): void {
  project.manifest.supportedLocales = normalizeSupportedLocales(project.manifest.defaultLanguage, [
    ...project.manifest.supportedLocales,
    locale
  ]);
  seedProjectLocale(project, locale);
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

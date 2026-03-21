import type { Asset, AssetCategory, AssetKind, AssetVariant, ProjectBundle } from "./types";

export function normalizeSupportedLocales(defaultLanguage: string, supportedLocales: readonly string[] = []): string[] {
  const normalized = [defaultLanguage, ...supportedLocales]
    .map((locale) => locale.trim())
    .filter((locale) => locale.length > 0);

  return [...new Set(normalized)];
}

export function resolveProjectLocale(project: Pick<ProjectBundle, "manifest">, locale?: string): string {
  const supportedLocales = normalizeSupportedLocales(
    project.manifest.defaultLanguage,
    project.manifest.supportedLocales
  );
  return locale && supportedLocales.includes(locale) ? locale : project.manifest.defaultLanguage;
}

export function ensureLocaleStringValues(
  project: Pick<ProjectBundle, "manifest" | "strings">,
  locale: string
): Record<string, string> {
  const resolvedLocale = resolveProjectLocale(project as Pick<ProjectBundle, "manifest">, locale);
  const values = project.strings.byLocale[resolvedLocale];
  if (values) {
    return values;
  }

  const nextValues: Record<string, string> = {};
  project.strings.byLocale[resolvedLocale] = nextValues;
  return nextValues;
}

export function getLocaleStringValues(
  project: Pick<ProjectBundle, "manifest" | "strings">,
  locale: string
): Record<string, string> {
  return project.strings.byLocale[resolveProjectLocale(project as Pick<ProjectBundle, "manifest">, locale)] ?? {};
}

export function getLocalizedText(
  project: Pick<ProjectBundle, "manifest" | "strings">,
  locale: string,
  textId: string
): string | undefined {
  return getLocaleStringValues(project, locale)[textId];
}

export function hasLocalizedText(
  project: Pick<ProjectBundle, "manifest" | "strings">,
  locale: string,
  textId: string
): boolean {
  return Object.prototype.hasOwnProperty.call(getLocaleStringValues(project, locale), textId);
}

export function resolveAssetVariant(asset: Pick<Asset, "variants">, locale: string): AssetVariant | undefined {
  return asset.variants[locale];
}

export function resolveAssetCategory(asset: Pick<Asset, "category" | "kind">): AssetCategory | undefined {
  if (asset.category === "background" || asset.category === "inventory") {
    return asset.category;
  }

  return "background";
}

export function isAssetCategory(
  asset: Pick<Asset, "category" | "kind">,
  category: AssetCategory
): boolean {
  return resolveAssetCategory(asset) === category;
}

export function isVisualAssetKind(kind: AssetKind): kind is "image" | "video" {
  return kind === "image" || kind === "video";
}

export function collectAssetVariantPaths(asset: Pick<Asset, "variants">): string[] {
  const paths: string[] = [];

  for (const variant of Object.values(asset.variants)) {
    paths.push(variant.sourcePath);
    if (variant.proxyPath) {
      paths.push(variant.proxyPath);
    }
    if (variant.posterPath) {
      paths.push(variant.posterPath);
    }
  }

  return paths;
}

export function getAssetLocales(asset: Pick<Asset, "variants">): string[] {
  return Object.keys(asset.variants).sort();
}

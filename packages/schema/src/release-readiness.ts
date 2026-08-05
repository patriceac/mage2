import { collectPlayerExperienceTextIds } from "./player-experience";
import { getStringTranslationState, normalizeSupportedLocales, resolveAssetCategory } from "./localization";
import type { Asset, Hotspot, HotspotEvent, ProjectBundle, ValidationIssue, ValidationReport } from "./types";
import { validateProject } from "./validation";

export type ProjectReadinessStatus = "not-ready" | "ready-with-warnings" | "ready";

export interface ProjectReadinessReport {
  ready: boolean;
  status: ProjectReadinessStatus;
  health: ValidationReport;
  releaseIssues: ValidationIssue[];
  blockers: ValidationIssue[];
  warnings: ValidationIssue[];
  issues: ValidationIssue[];
}

/**
 * Assesses whether a structurally healthy project is ready to become a
 * creator-facing release. Health and release-specific issues remain available
 * separately so callers never need to present "valid" as a publishing claim.
 */
export function assessProjectReadiness(project: ProjectBundle): ProjectReadinessReport {
  const health = validateProject(project);
  const release = validateProjectReleaseReadiness(project);
  const issues = [...health.issues, ...release.issues];
  const blockers = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");
  const ready = blockers.length === 0;

  return {
    ready,
    status: !ready ? "not-ready" : warnings.length > 0 ? "ready-with-warnings" : "ready",
    health,
    releaseIssues: release.issues,
    blockers,
    warnings,
    issues
  };
}

export function validateProjectReleaseReadiness(project: ProjectBundle): ValidationReport {
  const issues: ValidationIssue[] = [];
  const presentation = project.manifest.playerPresentation;
  const assetsById = new Map(project.assets.assets.map((asset) => [asset.id, asset]));
  const supportedLocales = normalizeSupportedLocales(
    project.manifest.defaultLanguage,
    project.manifest.supportedLocales
  );

  if (presentation.titleScreenEnabled && !presentation.titleBackgroundAssetId) {
    issues.push({
      level: "error",
      code: "PLAYER_TITLE_BACKGROUND_MISSING",
      message: "The enabled title screen has no background artwork."
    });
  }

  validatePresentationAsset(
    assetsById,
    presentation.titleBackgroundAssetId,
    "title background",
    "PLAYER_TITLE_BACKGROUND",
    project.manifest.defaultLanguage,
    supportedLocales,
    issues
  );

  const appIconAsset = presentation.appIconAssetId
    ? assetsById.get(presentation.appIconAssetId)
    : undefined;
  if (appIconAsset) {
    validateApplicationIcon(appIconAsset, project.manifest.defaultLanguage, issues);
  }
  validatePresentationAsset(
    assetsById,
    presentation.logoAssetId,
    "title logo",
    "PLAYER_LOGO",
    project.manifest.defaultLanguage,
    supportedLocales,
    issues
  );
  validatePresentationAsset(
    assetsById,
    presentation.appIconAssetId,
    "application icon",
    "PLAYER_APP_ICON",
    project.manifest.defaultLanguage,
    supportedLocales,
    issues
  );

  if (!presentation.appIconAssetId) {
    issues.push({
      level: "warning",
      code: "PLAYER_APP_ICON_RECOMMENDED",
      message: "No player icon is configured. Exports will fall back to the project wordmark."
    });
  }

  if (presentation.websiteUrl && !isHttpUrl(presentation.websiteUrl)) {
    issues.push({
      level: "error",
      code: "PLAYER_WEBSITE_INVALID",
      message: "The creator website must be a complete http or https URL."
    });
  }

  if (!project.manifest.gameVersion.trim()) {
    issues.push({
      level: "error",
      code: "PLAYER_GAME_VERSION_MISSING",
      message: "Set the player-facing game version before release."
    });
  } else if (!isValidGameVersion(project.manifest.gameVersion)) {
    issues.push({
      level: "error",
      code: "PLAYER_GAME_VERSION_INVALID",
      message: "The game version must use semantic versioning, for example 1.0.0 or 1.2.0-beta.1."
    });
  }

  const playerTextIds = collectPlayerExperienceTextIds(presentation);
  const sourceStrings = project.strings.byLocale[project.manifest.defaultLanguage] ?? {};
  const missingSourceTextIds = playerTextIds.filter((textId) => !sourceStrings[textId]?.trim());
  if (missingSourceTextIds.length > 0) {
    issues.push({
      level: "error",
      code: "PLAYER_TEXT_SOURCE_INCOMPLETE",
      message: `${missingSourceTextIds.length} player string${missingSourceTextIds.length === 1 ? " is" : "s are"} missing in the default locale.`
    });
  }

  for (const locale of supportedLocales) {
    if (locale === project.manifest.defaultLanguage) {
      continue;
    }

    const localeStrings = project.strings.byLocale[locale] ?? {};
    const incompleteTextIds = playerTextIds.filter((textId) => {
      if (!localeStrings[textId]?.trim()) {
        return true;
      }
      const state = getStringTranslationState(project, locale, textId);
      return state !== "translated" && state !== "reviewed";
    });
    if (incompleteTextIds.length > 0) {
      issues.push({
        level: "warning",
        code: "PLAYER_TEXT_LOCALE_INCOMPLETE",
        message: `${incompleteTextIds.length} player string${incompleteTextIds.length === 1 ? " needs" : "s need"} translation or review for '${locale}'.`,
        locale
      });
    }
  }

  for (const scene of project.scenes.items) {
    const backgroundAsset = scene.backgroundAssetId
      ? assetsById.get(scene.backgroundAssetId)
      : undefined;
    if (
      scene.backgroundAssetId === "asset_placeholder" ||
      scene.backgroundAssetId === "asset_starter_scene" ||
      backgroundAsset?.provenance?.source === "starter-kit"
    ) {
      issues.push({
        level: "error",
        code: "STARTER_SCENE_MEDIA_IN_USE",
        message: "Starter scene media is still in use. Replace it with creator-owned media before building a release.",
        entityId: scene.id
      });
    }

    for (const hotspot of scene.hotspots) {
      if (hotspot.id === "hotspot_inspect" && !hasPlayerFacingHotspotBehavior(hotspot)) {
        issues.push({
          level: "error",
          code: "STARTER_HOTSPOT_UNWIRED",
          message: `Starter hotspot '${hotspot.name}' still has no player-facing behavior.`,
          entityId: hotspot.id
        });
      }
    }
  }

  if (
    [presentation.titleBackgroundAssetId, presentation.logoAssetId, presentation.appIconAssetId].some(
      (assetId) => assetId && assetsById.get(assetId)?.provenance?.source === "starter-kit"
    )
  ) {
    issues.push({
      level: "warning",
      code: "STARTER_PLAYER_ARTWORK_IN_USE",
      message: "Starter title or icon artwork is still in use. Review it before release."
    });
  }

  return {
    valid: issues.every((issue) => issue.level !== "error"),
    issues
  };
}

export function isValidGameVersion(value: string): boolean {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(
    value.trim()
  );
  if (!match) {
    return false;
  }

  const prerelease = match[4];
  return !prerelease?.split(".").some(
    (identifier) => /^\d+$/u.test(identifier) && identifier.length > 1 && identifier.startsWith("0")
  );
}

export function validateProjectForRelease(project: ProjectBundle): ValidationReport {
  const readiness = assessProjectReadiness(project);
  return {
    valid: readiness.ready,
    issues: readiness.issues
  };
}

function validatePresentationAsset(
  assetsById: ReadonlyMap<string, Asset>,
  assetId: string | undefined,
  role: string,
  codePrefix: string,
  defaultLocale: string,
  supportedLocales: readonly string[],
  issues: ValidationIssue[]
): void {
  if (!assetId) {
    return;
  }

  const asset = assetsById.get(assetId);
  if (!asset) {
    issues.push({
      level: "error",
      code: `${codePrefix}_ASSET_MISSING`,
      message: `The ${role} references missing asset '${assetId}'.`,
      entityId: assetId
    });
    return;
  }

  if (asset.kind !== "image") {
    issues.push({
      level: "error",
      code: `${codePrefix}_KIND_INVALID`,
      message: `The ${role} must use an image asset.`,
      entityId: asset.id
    });
  }
  if (resolveAssetCategory(asset) !== "player") {
    issues.push({
      level: "error",
      code: `${codePrefix}_CATEGORY_INVALID`,
      message: `The ${role} must use a Player asset.`,
      entityId: asset.id
    });
  }
  if (!asset.variants[defaultLocale]) {
    issues.push({
      level: "error",
      code: `${codePrefix}_DEFAULT_LOCALE_MISSING`,
      message: `The ${role} has no '${defaultLocale}' media variant.`,
      entityId: asset.id,
      locale: defaultLocale
    });
  }

  for (const locale of supportedLocales) {
    if (locale !== defaultLocale && !asset.variants[locale]) {
      issues.push({
        level: "warning",
        code: `${codePrefix}_LOCALE_MISSING`,
        message: `The ${role} falls back to '${defaultLocale}' because it has no '${locale}' variant.`,
        entityId: asset.id,
        locale
      });
    }
  }
}

function validateApplicationIcon(
  asset: Asset,
  defaultLocale: string,
  issues: ValidationIssue[]
): void {
  const variant = asset.variants[defaultLocale];
  if (!variant || asset.kind !== "image") {
    return;
  }

  const cleanSourcePath = variant.sourcePath.split(/[?#]/u, 1)[0]?.toLowerCase() ?? "";
  if (!cleanSourcePath.endsWith(".png")) {
    issues.push({
      level: "error",
      code: "PLAYER_APP_ICON_FORMAT_INVALID",
      message: "The application icon must use PNG format so web and desktop exports share one source.",
      entityId: asset.id,
      locale: defaultLocale
    });
  }

  if (variant.width !== undefined && variant.height !== undefined && variant.width !== variant.height) {
    issues.push({
      level: "error",
      code: "PLAYER_APP_ICON_NOT_SQUARE",
      message: "The application icon must be square.",
      entityId: asset.id,
      locale: defaultLocale
    });
  } else if (
    variant.width !== undefined &&
    variant.height !== undefined &&
    Math.min(variant.width, variant.height) < 512
  ) {
    issues.push({
      level: "warning",
      code: "PLAYER_APP_ICON_LOW_RESOLUTION",
      message: "Use an application icon of at least 512 by 512 pixels for crisp desktop packaging.",
      entityId: asset.id,
      locale: defaultLocale
    });
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function hasPlayerFacingHotspotBehavior(hotspot: Hotspot): boolean {
  return Boolean(
    hotspot.targetSceneId ||
      hotspot.dialogueTreeId ||
      hotspot.inventoryItemId ||
      hotspot.placedInventoryItemId ||
      hotspot.mediaAssetId ||
      hotspot.response ||
      hotspot.effects.length > 0 ||
      hasPlayerFacingHotspotEvent(hotspot.clickEvent) ||
      hasPlayerFacingHotspotEvent(hotspot.otherItemEvent)
  );
}

function hasPlayerFacingHotspotEvent(event: HotspotEvent | undefined): boolean {
  return Boolean(
    event?.targetSceneId ||
      event?.dialogueTreeId ||
      event?.response ||
      (event?.effects.length ?? 0) > 0
  );
}

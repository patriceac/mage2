import { SceneAmbientSchema, type AmbientSchedule, type ProjectBundle, type Scene, type ValidationIssue } from "./types";
import { normalizeSupportedLocales, resolveAssetVariant } from "./localization";

export function resolveAmbientSchedule(...overrides: (AmbientSchedule | undefined)[]): Required<AmbientSchedule> {
  const resolved = { minDelayMs: 5000, maxDelayMs: 9000, repeatCount: 1 };
  for (const override of overrides) for (const key of ["minDelayMs", "maxDelayMs", "repeatCount"] as const) {
    if (override?.[key] !== undefined) resolved[key] = override[key];
  }
  return resolved;
}

/** Content alignment and matching neutral endpoints are an authoring contract;
 * registration IDs and exact source dimensions make accidental mixed pools invalid. */
export function validateSceneAmbient(scene: Scene, project: Pick<ProjectBundle, "assets" | "manifest">): ValidationIssue[] {
  if (!scene.ambient) return [];
  const issues: ValidationIssue[] = [];
  const add = (code: string, message: string, level: "error" | "warning" = "error") => {
    issues.push({ code: `AMBIENT_${code}`, message: `Scene '${scene.name}': ${message}`, level, entityId: scene.id });
  };
  const parsed = SceneAmbientSchema.safeParse(scene.ambient);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) add("VALUE_INVALID", `${issue.path.join(".")}: ${issue.message}`);
    return issues;
  }
  const ambient = parsed.data;
  const assets = new Map(project.assets.assets.map((asset) => [asset.id, asset]));
  if (ambient.regions.length && assets.get(scene.backgroundAssetId ?? "")?.kind !== "image") {
    add("BASE_IMAGE_REQUIRED", "ambient regions require a complete static background image.");
  }
  const locales = normalizeSupportedLocales(project.manifest.defaultLanguage, project.manifest.supportedLocales);
  const ids = new Set<string>();
  let infiniteRegions = 0;
  for (const region of ambient.regions) {
    const label = `ambient region '${region.name}'`;
    if (ids.has(region.id)) add("DUPLICATE_ID", `${label} has a duplicate region ID.`);
    ids.add(region.id);
    if (region.x + region.width > 1.000001 || region.y + region.height > 1.000001) {
      add("PLACEMENT_INVALID", `${label} must fit inside the scene (x + width and y + height <= 1).`);
    }
    if (!region.clips.length || !region.clips.some((clip) => clip.weight > 0)) {
      add("POOL_EMPTY", `${label} needs at least one video clip with a positive weight.`);
    }
    const checkAsset = (id: string | undefined, kind: "image" | "video", role: string) => {
      const asset = assets.get(id ?? "");
      if (!asset || asset.kind !== kind) {
        add("ASSET_INVALID", `${label}: ${role} requires an existing ${kind} asset (${id ?? "unassigned"}).`);
        return;
      }
      for (const locale of locales) {
        const variant = resolveAssetVariant(asset, locale);
        if (!variant?.sourcePath) add("LOCALE_MISSING", `${label}: ${role} '${id}' has no ${locale} media.`);
        if (variant?.width !== region.sourceWidth || variant?.height !== region.sourceHeight) {
          add("DIMENSIONS_INVALID", `${label}: ${role} '${id}' (${locale}) must be ${region.sourceWidth} x ${region.sourceHeight} pixels; reimport media with dimensions.`);
        }
        if (kind === "video" && (!variant?.durationMs || !Number.isFinite(variant.durationMs))) {
          add("DURATION_INVALID", `${label}: clip '${id}' (${locale}) needs a measured positive duration; reimport the video.`);
        }
      }
    };
    if (region.fallbackMode === "image") checkAsset(region.fallbackAssetId, "image", "neutral fallback");
    if (region.mask.assetId) checkAsset(region.mask.assetId, "image", "mask");
    const schedules = [resolveAmbientSchedule(ambient.defaults, region.schedule)];
    const clipIds = new Set<string>();
    for (const clip of region.clips) {
      checkAsset(clip.assetId, "video", "clip");
      if (clip.registrationId !== region.registrationId) add("REGISTRATION_INVALID", `${label}: clip '${clip.assetId}' must use registration '${region.registrationId}'.`);
      if (clipIds.has(clip.assetId)) add("CLIP_DUPLICATE", `${label}: use a weight instead of duplicate clip '${clip.assetId}'.`);
      clipIds.add(clip.assetId);
      schedules.push(resolveAmbientSchedule(ambient.defaults, region.schedule, clip.schedule));
    }
    if (schedules.some((schedule) => schedule.minDelayMs > schedule.maxDelayMs)) {
      add("DELAY_RANGE_INVALID", `${label}: minimum delay must not exceed maximum delay, including inherited defaults.`);
    }
    if (region.enabled && region.clips.some((clip) => clip.weight > 0 && resolveAmbientSchedule(ambient.defaults, region.schedule, clip.schedule).repeatCount === 0)) infiniteRegions++;
  }
  const defaults = resolveAmbientSchedule(ambient.defaults);
  if (defaults.minDelayMs > defaults.maxDelayMs) add("DELAY_RANGE_INVALID", "ambient scene defaults have minimum delay greater than maximum delay.");
  if (infiniteRegions > 1) add("CONTINUOUS_DECODERS", `${infiniteRegions} ambient regions can decode indefinitely (repeat count 0). Check performance on target hardware.`, "warning");
  return issues;
}

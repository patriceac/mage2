import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, AmbientRegionSchema, SceneAmbientSchema, collectReferencedAssetIds, createDefaultProjectBundle, parseProjectBundle, resolveAmbientSchedule, validateSceneAmbient } from "./index";

function fixture() {
  const project = createDefaultProjectBundle("Ambient validation");
  project.manifest.supportedLocales = ["en"];
  const scene = project.scenes.items[0]!;
  project.assets.assets = ["base", "clip", "neutral", "mask"].map((id) => ({
    id, name: id, kind: id === "clip" ? "video" as const : "image" as const,
    variants: { en: { sourcePath: `${id}.media`, importedAt: "2026-09-20", width: 320, height: 180, durationMs: 2000 } }
  }));
  scene.backgroundAssetId = "base";
  scene.ambient = SceneAmbientSchema.parse({ seed: 7, defaults: { minDelayMs: 0, maxDelayMs: 0 }, regions: [
    { id: "lamp", name: "Lamp", x: 0, y: 0, width: 0.5, height: 0.5, sourceWidth: 320, sourceHeight: 180, registrationId: "lamp", fallbackMode: "image", fallbackAssetId: "neutral", mask: { assetId: "mask" }, clips: [{ assetId: "clip", registrationId: "lamp" }] }
  ] });
  return { project, scene, region: scene.ambient.regions[0]! };
}

describe("ambient scene contract", () => {
  it("migrates v17 without creating layers or changing flattened background video", () => {
    const project = createDefaultProjectBundle();
    project.scenes.items[0]!.backgroundVideoLoop = true;
    for (const file of Object.values(project)) file.schemaVersion = 17;
    const parsed = parseProjectBundle(project);
    expect(parsed.manifest.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.scenes.items[0]!.ambient).toBeUndefined();
    expect(parsed.scenes.items[0]!.backgroundVideoLoop).toBe(true);
  });
  it("retains and exports every layer reference and accepts zero delays", () => {
    const { project, scene } = fixture();
    expect(validateSceneAmbient(scene, project)).toEqual([]);
    expect([...collectReferencedAssetIds(project)]).toEqual(expect.arrayContaining(["base", "clip", "neutral", "mask"]));
    expect(parseProjectBundle(project).scenes.items[0]!.ambient).toEqual(scene.ambient);
    expect(resolveAmbientSchedule({ minDelayMs: 0, maxDelayMs: 0 }, { repeatCount: 2 }, { repeatCount: 0 })).toEqual({ minDelayMs: 0, maxDelayMs: 0, repeatCount: 0 });
  });
  it("rejects missing assets, empty pools, mismatched registration/dimensions and inherited invalid ranges", () => {
    const { project, scene, region } = fixture();
    region.fallbackAssetId = "missing";
    region.mask.assetId = "missing-mask";
    region.clips[0]!.registrationId = "wrong";
    region.sourceWidth = 640;
    region.schedule = { minDelayMs: 1 };
    region.width = 1; region.x = 0.5;
    const codes = validateSceneAmbient(scene, project).map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["AMBIENT_ASSET_INVALID", "AMBIENT_REGISTRATION_INVALID", "AMBIENT_DIMENSIONS_INVALID", "AMBIENT_DELAY_RANGE_INVALID", "AMBIENT_PLACEMENT_INVALID"]));
    region.clips = [];
    expect(validateSceneAmbient(scene, project).some((issue) => issue.code === "AMBIENT_POOL_EMPTY")).toBe(true);
    expect(AmbientRegionSchema.safeParse({ ...region, schedule: { repeatCount: -1 } }).success).toBe(false);
    expect(AmbientRegionSchema.safeParse({ ...region, mask: { feather: 0.6 } }).success).toBe(false);
  });
  it("warns for several infinite decoders and requires a static base", () => {
    const { project, scene, region } = fixture();
    region.schedule = { repeatCount: 0 };
    scene.ambient!.regions.push({ ...region, id: "second" });
    project.assets.assets[0]!.kind = "video";
    expect(validateSceneAmbient(scene, project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "AMBIENT_CONTINUOUS_DECODERS", level: "warning" }),
      expect.objectContaining({ code: "AMBIENT_BASE_IMAGE_REQUIRED", level: "error" })
    ]));
  });
});

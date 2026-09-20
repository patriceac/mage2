// Engine-owned synthetic media. This build tool never launches an application.
import { mkdir, writeFile, cp } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { AmbientRegionSchema, HotspotSchema, SceneSchema, createDefaultProjectBundle, toExportProjectData, validateProject } from "@mage2/schema";

const root = path.resolve(import.meta.dirname, "..");
const destination = path.join(root, "output", "ambient-fixture");
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
await mkdir(path.join(destination, "assets"), { recursive: true });
const width = 320, height = 180;
const ink = [24, 39, 53];
function tile(phase = 0) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const ring = Math.hypot(x - 160, y - 90);
    const color = ring < 34 ? [180 + Math.round(60 * phase), 180 + Math.round(40 * phase), 160] : ring < 39 ? [90, 125, 145] : ink;
    for (let c = 0; c < 3; c++) pixels[(y * width + x) * 3 + c] = color[c];
  }
  return pixels;
}
function encode(name, input, size, extra) {
  const result = spawnSync(ffmpeg, ["-y", "-v", "error", "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", size, "-framerate", "30", "-i", "pipe:0", ...extra, path.join(destination, "assets", name)], { input, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw new Error(`FFmpeg failed: ${result.error ?? result.stderr}`);
}
const neutral = tile();
encode("neutral.png", neutral, "320x180", ["-frames:v", "1"]);
const mask = Buffer.alloc(width * height * 3, 255);
encode("mask.png", mask, "320x180", ["-frames:v", "1"]);
for (const [name, frames, cycles] of [["pulse-a.mp4", 60, 1], ["pulse-b.mp4", 90, 2]]) {
  const input = Buffer.concat(Array.from({ length: frames }, (_, frame) => tile(Math.sin(frame / (frames - 1) * Math.PI * cycles) ** 2)));
  encode(name, input, "320x180", ["-an", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]);
}
const placements = [[80, 120], [480, 120], [880, 120], [80, 420], [480, 420], [880, 420]];
const base = Buffer.alloc(1280 * 720 * 3);
for (let i = 0; i < base.length; i++) base[i] = ink[i % 3];
// A complete base always exists, even for image-fallback regions.
for (const [left, top] of placements) for (let y = 0; y < height; y++) neutral.copy(base, ((top + y) * 1280 + left) * 3, y * width * 3, (y + 1) * width * 3);
encode("base.png", base, "1280x720", ["-frames:v", "1"]);

const project = createDefaultProjectBundle("MAGE2 Ambient Fixture");
project.manifest.projectId = "mage2_ambient_fixture";
project.manifest.supportedLocales = ["en"];
project.manifest.playerPresentation = { ...project.manifest.playerPresentation, titleScreenEnabled: false, titleBackgroundAssetId: undefined, appIconAssetId: undefined };
project.manifest.variables = [{ id: "motion", name: "Motion", description: "Ambient condition test", type: "boolean", initialValue: true, system: false }];
project.assets.assets = [
  ["base", "base.png", "image", 1280, 720], ["neutral", "neutral.png", "image", 320, 180], ["mask", "mask.png", "image", 320, 180],
  ["pulse_a", "pulse-a.mp4", "video", 320, 180], ["pulse_b", "pulse-b.mp4", "video", 320, 180]
].map(([id, name, kind, w, h]) => ({ id, name, kind, category: "background", variants: { en: { sourcePath: `assets/${name}`, width: w, height: h, importedAt: "2026-09-20T00:00:00Z", ...(kind === "video" ? { durationMs: id === "pulse_a" ? 2000 : 3000, hasAudio: false, codec: "h264" } : {}) } } }));
const scene = project.scenes.items[0];
scene.id = "ambient_scene";
scene.name = "Ambient laboratory";
scene.backgroundAssetId = "base";
scene.ambient = { enabled: true, seed: 2026, defaults: { minDelayMs: 1000, maxDelayMs: 1400, repeatCount: 1 }, regions: placements.map(([x, y], i) => AmbientRegionSchema.parse({
  id: `region_${i}`, name: `Region ${i + 1}`, x: x / 1280, y: y / 720, width: 0.25, height: 0.25, zIndex: i,
  sourceWidth: width, sourceHeight: height, registrationId: "neutral-pulse", fallbackMode: i % 2 ? "image" : "base", fallbackAssetId: i % 2 ? "neutral" : undefined,
  mask: { feather: 0.08, ...(i === 1 ? { assetId: "mask", mode: "luminance" } : {}) },
  schedule: i < 4 ? { repeatCount: 0 } : i === 4 ? { repeatCount: 2, minDelayMs: 1600, maxDelayMs: 1600 } : { repeatCount: 1, minDelayMs: 0, maxDelayMs: 0 },
  conditions: i === 3 ? [{ type: "variableCompare", variableId: "motion", operator: "equals", value: true }] : [],
  clips: [{ assetId: "pulse_a", registrationId: "neutral-pulse", weight: 1 }, ...(i === 5 ? [{ assetId: "pulse_b", registrationId: "neutral-pulse", weight: 3 }] : [])]
})) };
const hotspot = (id, name, x, effects) => {
  const commentTextId = `fixture.hotspot.${id}`;
  project.strings.byLocale.en[commentTextId] = name;
  return HotspotSchema.parse({ id, name, commentTextId, x, y: 0.88, width: 0.2, height: 0.1, startMs: 0, endMs: 600000, timingMode: "sceneDuration", effects });
};
scene.hotspots = [hotspot("talk", "Talk", 0.04, [{ type: "playDialogue", dialogueTreeId: "fixture_dialogue" }]), hotspot("stop", "Stop motion", 0.28, [{ type: "setVariable", variableId: "motion", value: false }]), hotspot("exit", "Legacy video", 0.74, [{ type: "goToScene", sceneId: "legacy_video" }])];
const legacy = SceneSchema.parse({ id: "legacy_video", locationId: scene.locationId, name: "Legacy flattened video", backgroundAssetId: "pulse_a", backgroundVideoLoop: true, videoAudioMode: "silent", hotspots: [hotspot("back", "Back", 0.1, [{ type: "goToScene", sceneId: scene.id }]), hotspot("legacy_talk", "Talk", 0.65, [{ type: "playDialogue", dialogueTreeId: "fixture_dialogue" }])] });
project.scenes.items = [scene, legacy];
project.manifest.startSceneId = scene.id;
project.locations.items[0].sceneIds = [scene.id, legacy.id];
project.dialogues.items = [{ id: "fixture_dialogue", name: "Responsiveness", startNodeId: "hello", nodes: [{ id: "hello", speaker: "MAGE2", textId: "fixture.hello", choices: [], effects: [] }] }];
project.dialogues.speakerPortraits = {};
scene.dialogueTreeIds = ["fixture_dialogue"];
project.strings.byLocale.en["fixture.hello"] = "Six independent regions. Dialogue and hotspots remain interactive.";
project.inventory.items = [];
const health = validateProject(project);
if (!health.valid) throw new Error(JSON.stringify(health.issues));
for (const [key, name] of Object.entries({ manifest: "project", assets: "assets", scenes: "scenes", locations: "locations", dialogues: "dialogues", strings: "strings", inventory: "inventory" })) await writeFile(path.join(destination, `${name}.json`), JSON.stringify(project[key], null, 2));

// Deterministic fixture build for browser/package QA. The real editor exporter is
// additionally verified by its integration test and the isolated editor check.
const build = path.join(destination, "build");
await mkdir(path.join(build, "content"), { recursive: true });
await cp(path.join(root, "apps/runtime-web/dist"), build, { recursive: true });
await cp(path.join(destination, "assets"), path.join(build, "media"), { recursive: true });
const content = toExportProjectData(project);
for (const asset of content.assets) asset.variants.en.sourcePath = `media/${asset.name}`;
await writeFile(path.join(build, "content/project-content.json"), JSON.stringify(content, null, 2));
await writeFile(path.join(build, "validation-report.json"), JSON.stringify(health, null, 2));
await writeFile(path.join(build, "build-manifest.json"), JSON.stringify({ projectId: project.manifest.projectId, projectName: project.manifest.projectName, engineVersion: project.manifest.engineVersion, generatedAt: new Date().toISOString(), defaultLanguage: "en", supportedLocales: ["en"], startLocationId: project.manifest.startLocationId, startSceneId: scene.id, contentPath: "content/project-content.json", validationReportPath: "validation-report.json", assetMap: Object.fromEntries(content.assets.map((asset) => [asset.id, { en: asset.variants.en.sourcePath }])) }, null, 2));
console.log(destination);

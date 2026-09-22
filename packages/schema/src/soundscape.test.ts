import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, SceneSoundscapeSchema, collectReferencedAssetIds, createDefaultProjectBundle,
  createSaveEnvelope, loadSaveForProject, parseProjectBundle, createInitialSaveState, validateProject } from "./index";

describe("soundscape authoring and compatibility", () => {
  it("migrates v18 additively and preserves legacy timing and saved one-shot keys", () => {
    const project = createDefaultProjectBundle();
    for (const file of Object.values(project)) file.schemaVersion = 18;
    project.scenes.items[0]!.sceneAudioDelayMs = 700;
    const migrated = parseProjectBundle(project);
    expect(migrated.manifest.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.scenes.items[0]!.sceneAudioDelayMs).toBe(700);
    expect(migrated.scenes.items[0]!.soundscape).toBeUndefined();
    const state = createInitialSaveState(migrated);
    expect(loadSaveForProject(createSaveEnvelope(migrated, state), migrated).status).toBe("compatible");
    state.playedSoundKeys = ["chapter.door"];
    expect(loadSaveForProject(createSaveEnvelope(migrated, state), migrated).saveState.playedSoundKeys).toEqual(["chapter.door"]);
  });
  it("keeps all layer and nested action assets reachable and rejects non-audio assignments", () => {
    const project = createDefaultProjectBundle();
    const scene = project.scenes.items[0]!;
    project.assets.assets.push(...["music", "room", "foley", "voice-cue"].map((id) => ({ id, name: id, kind: "audio" as const,
      variants: { en: { sourcePath: `${id}.wav`, importedAt: "2026-09-22" } } })));
    scene.soundscape = SceneSoundscapeSchema.parse({ music: { assetId: "music" }, ambience: { assetId: "room", gain: 0.4 } });
    scene.hotspots[0]!.otherItemEvent = { effects: [{ type: "conditional", conditionMode: "all", conditions: [{ type: "always" }],
      thenEffects: [], elseEffects: [{ type: "playSound", assetId: "foley" }] }] };
    project.dialogues.items.push({ id: "talk", name: "Talk", startNodeId: "hello", nodes: [{ id: "hello", speaker: "Narrator", textId: "hello", choices: [], effects: [{ type: "playSound", assetId: "voice-cue" }] }] });
    expect([...collectReferencedAssetIds(parseProjectBundle(project))]).toEqual(expect.arrayContaining(["music", "room", "foley", "voice-cue"]));
    expect(scene.soundscape.music).toMatchObject({ gain: 1, loop: true, fadeInMs: 500, fadeOutMs: 500, continueAcrossScenes: false });
    scene.soundscape.music!.assetId = "missing";
    project.assets.assets.find((asset) => asset.id === "foley")!.kind = "image";
    expect(validateProject(project).issues.filter((issue) => issue.code === "SOUNDSCAPE_AUDIO_INVALID")).toHaveLength(2);
    expect(SceneSoundscapeSchema.safeParse({ music: { assetId: "music", gain: 2 } }).success).toBe(false);
  });
});

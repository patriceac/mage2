import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HotspotSchema, SceneSchema, SceneSoundscapeSchema } from "@mage2/schema";

// Synthetic tones exercise real decoders without shipping game media or voices.
export function configureAudioFixture(project, destination, ffmpeg) {
  const encode = (args) => {
    const result = spawnSync(ffmpeg, ["-y", "-v", "error", ...args], { windowsHide: true });
    if (result.status !== 0) throw new Error(`Audio fixture encoding failed: ${result.error ?? result.stderr}`);
  };
  const media = (name) => path.join(destination, "assets", name);
  const add = (id, file, kind, category, durationMs = 10000, hasAudio = true) => project.assets.assets.push({ id, name: file, kind, category,
    variants: { en: { sourcePath: `assets/${file}`, importedAt: "2026-09-22T00:00:00Z", durationMs, hasAudio,
      ...(kind === "video" ? { width: 320, height: 180, codec: "h264", audioCodec: hasAudio ? "aac" : undefined } : {}) } } });
  for (const [id, frequency, duration] of [["music", 130, 20], ["room", 220, 17], ["room_b", 250, 17], ["foley", 880, 2], ["voice", 440, 10]]) {
    encode(["-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=${duration}:sample_rate=44100`, "-c:a", "pcm_s16le", media(`${id}.wav`)]);
    add(id, `${id}.wav`, "audio", id === "voice" ? "foreground" : "sceneAudio", duration * 1000);
  }
  encode(["-stream_loop", "-1", "-i", media("pulse-a.mp4"), "-i", media("voice.wav"), "-t", "10", "-c:v", "copy", "-c:a", "aac", "-movflags", "+faststart", media("performed.mp4")]);
  encode(["-i", media("performed.mp4"), "-an", "-c:v", "copy", media("silent.mp4")]);
  add("performed", "performed.mp4", "video", "response");
  add("silent", "silent.mp4", "video", "response", 10000, false);
  add("embedded", "performed.mp4", "video", "background");
  add("external_video", "silent.mp4", "video", "background", 10000, false);
  add("external_audio", "voice.wav", "audio", "sceneAudio");
  const performances = process.env.AUDIO_FIXTURE_DIALOGUE_LINES
    ? JSON.parse(readFileSync(process.env.AUDIO_FIXTURE_DIALOGUE_LINES, "utf8"))
    : [{ speaker: "MAGE2", text: "I thought I might find you here. There is something we should talk about." },
       { speaker: "MAGE2", text: "I came by the old road this morning. The guards thought I was a creditor, so they let me through with a great deal of respect. Will you stay a little longer?" }];
  for (const [index, line] of performances.entries()) {
    const source = line.source ?? process.env.AUDIO_FIXTURE_DIALOGUE_VIDEO ?? media("performed.mp4");
    encode(["-stream_loop", "-1", "-i", source, "-t", "10", "-vf", "scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2", "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", media(`dialogue-${index}.mp4`)]);
    add(`dialogue_performance_${index}`, `dialogue-${index}.mp4`, "video", "foreground");
    Object.assign(project.assets.assets.at(-1).variants.en, { width: 960, height: 540 });
    console.log(`Dialogue fixture input: ${source}; output: 960x540 H264/AAC, 10 seconds.`);
  }
  project.manifest.projectName = "MAGE2 Audio Fixture";
  project.manifest.projectId = "mage2_audio_fixture";
  project.manifest.gameVersion = "0.1.0-audio-fixture";
  const scene = project.scenes.items[0];
  scene.name = "Audio laboratory";
  delete scene.ambient;
  const bed = (ambience = "room") => SceneSoundscapeSchema.parse({ music: { assetId: "music", gain: 0.5, fadeInMs: 200, fadeOutMs: 250, continueAcrossScenes: true }, ambience: { assetId: ambience, gain: 0.4, fadeInMs: 150, fadeOutMs: 200 } });
  scene.soundscape = bed();
  const hotspot = (id, name, index, action) => {
    const commentTextId = `audio.${id}`;
    project.strings.byLocale.en[commentTextId] = name;
    return HotspotSchema.parse({ id, name, commentTextId, x: 0.03 + index % 5 * 0.19, y: 0.72 + Math.floor(index / 5) * 0.13,
      width: 0.175, height: 0.1, startMs: 0, endMs: 600000, timingMode: "sceneDuration", ...action });
  };
  const go = (sceneId) => ({ effects: [{ type: "goToScene", sceneId }] });
  scene.hotspots = [
    hotspot("once", "Foley once", 0, { effects: [{ type: "playSound", assetId: "foley", gain: 0.5, onceKey: "test.bell" }] }),
    hotspot("repeat", "Foley repeat", 1, { effects: [{ type: "playSound", assetId: "foley", gain: 0.5 }] }),
    hotspot("voice", "Voice", 2, { effects: [{ type: "playDialogue", dialogueTreeId: "spoken" }] }),
    hotspot("text", "Text", 3, { effects: [{ type: "playDialogue", dialogueTreeId: "text" }] }),
    hotspot("performed", "Performed video", 4, { response: { type: "entry", entryId: "performed_entry" } }),
    hotspot("silent", "Silent video", 5, { response: { type: "entry", entryId: "silent_entry" } }),
    hotspot("next", "Next room", 6, go("room_b")),
    hotspot("embedded", "Embedded scene", 7, go("embedded_scene")),
    hotspot("cinematic", "Cinematic dialogue", 8, { effects: [{ type: "playDialogue", dialogueTreeId: "cinematic" }] })
  ];
  const room = SceneSchema.parse({ id: "room_b", name: "Adjacent room", locationId: scene.locationId, backgroundAssetId: "base", soundscape: bed("room_b"),
    hotspots: [hotspot("back", "Back", 0, go(scene.id)), hotspot("quiet", "Quiet room", 1, go("quiet"))] });
  const quiet = SceneSchema.parse({ id: "quiet", name: "Quiet room", locationId: scene.locationId, backgroundAssetId: "base", hotspots: [hotspot("back_quiet", "Back", 0, go(scene.id))] });
  const embedded = SceneSchema.parse({ id: "embedded_scene", name: "Performed scene", locationId: scene.locationId, backgroundAssetId: "embedded", videoAudioMode: "embedded", soundscape: bed(),
    hotspots: [hotspot("external", "External scene", 0, go("external_scene")), hotspot("back_embedded", "Back", 1, go(scene.id))] });
  const external = SceneSchema.parse({ id: "external_scene", name: "External soundtrack", locationId: scene.locationId, backgroundAssetId: "external_video", videoAudioMode: "external", sceneAudioAssetId: "external_audio", soundscape: bed(),
    hotspots: [hotspot("back_external", "Back", 0, go(scene.id))] });
  project.scenes.items = [scene, room, quiet, embedded, external];
  project.locations.items[0].sceneIds = project.scenes.items.map((item) => item.id);
  project.dialogues.items = ["spoken", "text"].map((id) => ({ id, name: id, startNodeId: `${id}_line`, nodes: [{ id: `${id}_line`, speaker: "MAGE2", textId: `audio.${id}.line`, mediaAssetId: id === "spoken" ? "voice" : undefined, effects: [], choices: [] }] }));
  project.dialogues.items.push({ id: "cinematic", name: "Conversation", startNodeId: "cinematic_line", nodes: [
    { id: "cinematic_line", speaker: performances[0].speaker, textId: "audio.cinematic.line", mediaAssetId: "dialogue_performance_0", effects: [], choices: [], nextNodeId: "cinematic_choice" },
    { id: "cinematic_choice", speaker: performances[1].speaker, textId: "audio.cinematic.choice", mediaAssetId: "dialogue_performance_1", effects: [], choices: Array.from({ length: 6 }, (_, index) => ({ id: `cinematic_answer_${index}`, textId: "audio.cinematic.answer", conditions: [], effects: [], nextNodeId: "cinematic_after" })) },
    { id: "cinematic_after", speaker: "MAGE2", textId: "audio.cinematic.after", effects: [], choices: [] }
  ] });
  project.dialogues.speakerPortraits = { MAGE2: "neutral" };
  scene.dialogueTreeIds = ["spoken", "text", "cinematic"];
  Object.assign(project.strings.byLocale.en, { "audio.cinematic.line": performances[0].text, "audio.cinematic.choice": performances[1].text, "audio.cinematic.answer": "Of course. I am listening.", "audio.cinematic.after": "Thank you. Take your time." });
  project.strings.byLocale.en["audio.spoken.line"] = "Synthetic voiced-media test: music and ambience should duck while this tone plays.";
  project.strings.byLocale.en["audio.text.line"] = "Text-only dialogue keeps the music at its normal level.";
  project.dialogues.responseGroups = [{ id: "audio_responses", name: "Performed clips", entries: [{ id: "performed_entry", kind: "video", assetId: "performed" }, { id: "silent_entry", kind: "video", assetId: "silent" }] }];
}

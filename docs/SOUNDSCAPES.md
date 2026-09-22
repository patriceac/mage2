# Contextual audio (schema 19)

Scene Media exposes independent music and ambience. Import audio in Assets, assign the layers, and listen in Playtest. All audio assets use the existing localized variants and export pipeline.

```json
{
  "soundscape": {
    "music": {
      "assetId": "chapter_music",
      "gain": 0.5,
      "loop": true,
      "fadeInMs": 500,
      "fadeOutMs": 500,
      "continueAcrossScenes": true
    },
    "ambience": { "assetId": "room_tone", "gain": 0.4 }
  }
}
```

Only `assetId` is required within a layer. Defaults: gain 1, looping enabled, 500 ms fades, continuation disabled. Gains range from 0 to 1; fades are integer milliseconds from 0 to 60000. Both adjacent layers must opt into continuation and resolve to the same asset, localized source and loop setting. Otherwise the previous layer fades out and the new one fades in. Re-rendering never restarts an unchanged layer. A loaded/new game resets the audio session; music positions are not part of saved progress.

The shared action editor supports `{ "type": "playSound", "assetId": "door", "gain": 0.7, "onceKey": "chapter1.door" }`. Gain defaults to 1. Omit `onceKey` for repeatable Foley; a supplied key is consumed at the gameplay action and saved in optional `playedSoundKeys`. It guards this sound, not other effects in the list. Media replay, skip and settings changes do not execute gameplay effects again. A sound followed by `goToScene` in the same action still plays; an exit cleans up older scene sounds. Completed sounds release their decoder, with at most 16 simultaneous effects.

Player settings persist master (`volume`), `musicVolume`, `ambienceVolume`, `effectsVolume` and `voiceVolume`, all defaulting to 1. Playtest remembers them across sessions too. Menu/visibility pause preserves active track positions. Authored gains multiply the master and corresponding channel levels.

Music and ambience duck to 25% while dialogue/response audio or an audible performed video plays, and recover after pause, mute, end or skip. Attack/release are 180/350 ms. Text and videos marked `hasAudio: false` do not duck. Dialogue media, response media and embedded/external background-video sound use the voice channel. Legacy image-scene `sceneAudio` retains its master-only gain and existing timing; synchronized external video audio retains its playhead behavior. Visual ambient layers are unchanged.

Migration 18 → 19 adds optional fields and preserves existing scene audio and saves; the save envelope remains version 2. Explicitly launched dialogues now contribute reachable scene exits from their reachable nodes/choices, including chained dialogue starts. Unused dialogue-library entries do not create navigation links.

## Verification

Luna runs the focused schema/player/mixer/export/editor tests. The synthetic audio fixture shares the ambient verification infrastructure:

```powershell
$env:FFMPEG_PATH = 'path\to\ffmpeg.exe'
node scripts/create-ambient-fixture.mjs --audio
node scripts/verify-ambient-browser.mjs --audio
# After release editor/runtime packaging, native acceptance uses the SYSTEM broker:
./scripts/verify-ambient-hyperv.ps1 -Scenario audio -Mode editor
./scripts/verify-ambient-hyperv.ps1 -Scenario audio -Mode runtime
```

Browser evidence is written to `output/verification/audio-browser`. Native result directories contain `ambient-result.json` with `scenario: "audio"`, assertions and screenshots. Tests use generated tones and verify decoder state, gains and lifecycle; game-specific media stays outside the engine repository.

## Verification snapshot (2026-09-22)

Luna passed the focused schema, controller, mixer, export, editor and dialogue-reachability suites, including the final 38-test gain/deletion subset. Workspace typechecking, the editor localization audit and both release packages passed. Chrome passed all eight audio checks; its screenshots show all five volume controls and separate Menu/Skip positions.

Windows acceptance used the canonical `output/packaging/editor-win/dist/win-unpacked` and `output/packaging/runtime-win/dist/win-unpacked` release directories through the SYSTEM broker, with networking disabled:

- Editor request `executable-test-20260922T140257344Z-0ff733a5` passed all 11 checks, including a real gain edit from 0.5 to 0.55 in the exported JSON, all eight playback checks, and preferences retained after leaving Playtest.
- Runtime request `executable-test-20260922T135942786Z-c55ec1a4` passed all eight playback checks. Both runs used the Microsoft Basic Render Driver; this proves decoding, gains and lifecycle with the synthetic fixture, not listening quality on physical audio hardware.

Evidence is retained under `D:\Disk\VMs\Codex-Harness\Live\Broker\Results\<request-id>`. Both broker and guest harness verdicts passed, application assertions were evaluated and passed, process cleanup reported no survivors, VMs finished Off, and disposable payload children were deleted and absent. Relevant screenshots were visually inspected. The runtime's optional `application.log` could not be collected because it remained locked; all assertions and requested screenshots were retained. An initial editor run failed on a test-only filename check against opaque media URLs; the corrected driver passed on the same release artifact.

Direct disk-attachment inventory was denied by host Hyper-V authorization. Both child paths were absent, and the broker's `PayloadChildren`, `PayloadMounts` and `Processing` directories were empty; attachment inspection remains an evidence limitation.

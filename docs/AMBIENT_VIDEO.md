# Ambient video regions (schema 18)

Scenes keep their complete static background image. Optional `scene.ambient` adds silent, independently scheduled video regions under hotspots, dialogue, inventory, and player chrome. Existing static scenes and flattened background videos keep their behavior. The schema 17 → 18 migration only advances file versions; it does not create regions. Older engines reject schema 18 projects.

In **Scenes → Ambient regions**, add a region, assign imported clips, and set its normalized placement, layer order, opacity, neutral fallback, and mask. Enable **Preview ambient motion** to see the composite on the scene canvas, including its existing zoom/pan transform. Use Playtest to exercise conditions, dialogue, menus, and reduced motion. Blank schedule fields inherit from the scene, then the engine defaults (5–9 seconds, one play). Import media through Assets first.

```json
{
  "ambient": {
    "enabled": true,
    "seed": 2026,
    "defaults": { "minDelayMs": 5000, "maxDelayMs": 9000, "repeatCount": 1 },
    "regions": [{
      "id": "lamp",
      "name": "Desk lamp",
      "enabled": true,
      "x": 0.15, "y": 0.2, "width": 0.25, "height": 0.25,
      "zIndex": 0, "opacity": 1,
      "sourceWidth": 320, "sourceHeight": 180,
      "registrationId": "lamp-neutral-v1",
      "fallbackMode": "image",
      "fallbackAssetId": "lamp_neutral",
      "mask": { "feather": 0.08, "assetId": "lamp_mask", "mode": "alpha" },
      "conditionMode": "all", "conditions": [],
      "clips": [
        { "assetId": "lamp_a", "registrationId": "lamp-neutral-v1", "weight": 1 },
        { "assetId": "lamp_b", "registrationId": "lamp-neutral-v1", "weight": 2,
          "schedule": { "repeatCount": 2 } }
      ]
    }]
  }
}
```

`fallbackMode: "base"` exposes the corresponding portion of the complete static background. `"image"` keeps a neutral image at exactly the video placement. Retain a complete base in both cases. Feather is a fraction of each region axis, from 0 to 0.5. A separate optional image mask uses its alpha channel, or luminance (white reveals, black hides); it is intersected with the feather. All region content shares one opacity/mask so edges do not accumulate opacity. Larger zIndex values are in front; equal values retain array order. The whole composite stays below interaction/UI layers regardless of region zIndex.

Clips in a pool must have identical pixel dimensions, framing, and neutral first/last frames. Set the same registration ID only after checking alignment. Validation checks IDs, source dimensions in every supported locale, asset kinds/references, placement, masks, weights, and inherited ranges. It cannot infer visual alignment or compare neutral content from an ID: inspect the composite. Every image fallback and mask must match the region's source pixel dimensions. Use browser-compatible media, preferably silent H.264 MP4, 8-bit yuv420p. Audio tracks, if present, remain muted; scene audio uses the existing audio system.

Weights are nonnegative; zero excludes a clip. At least one clip must have positive weight. Selection avoids the preceding clip whenever another healthy eligible clip exists. Each region has its own seeded stream. Omit the seed for a new random sequence on scene entry. `repeatCount: 0` loops the chosen clip indefinitely. Positive N plays it exactly N consecutive times, exposes the neutral state, draws a fresh inclusive delay, then starts another selection. Both delay bounds may be zero. Scene, region, and clip schedule values merge per field, in that order. The completed clip's effective range determines its following delay. Region `conditions` use the same rules as hotspot availability; becoming false stops playback immediately while retaining the neutral state.

The shared `AmbientLayers` component serves the editor canvas, Playtest, runtime-web, and packaged Windows player. `PlayerSceneRenderer` accepts `ambientEnabled` and `reducedMotion`; the existing player preference and OS reduced-motion setting disable ambient decoding. Menus, game pause, video responses, and hidden tabs pause playback and delay clocks. Scene exit disposes media elements, removes their sources, and releases decoders. A scene-entry sequence and restore key avoid duplicate playback on ordinary same-scene interactions while explicitly restarting on entry/replay/load. Ambient progress is not serialized in saves.

Rendering uses positioned native video elements and CSS masks, with no frame copies or mandatory Canvas/WebGL. Chromium handles video timing and dropped frames. Videos remain hidden until a decoded frame is submitted; neutral content stays underneath throughout preload/buffering/failure. Only the active clip and an imminent successor (at most 250 ms before a switch) own media elements. Long idle periods use only static images. A decoder or load timeout quarantines that clip until re-entry; exhausted pools keep the static fallback. Missing/failed masks prevent animation and retain the fallback with its procedural feather. Several enabled infinite loops produce an authoring warning.

Export reachability includes every clip, neutral image, and mask, including conditionally inactive regions. Ambient videos export original source bytes because editor proxies may be resized; all target platforms must support those original formats. Reimport media after changing dimensions. Referenced ambient assets cannot be deleted until unassigned. No schema 18 assets or files are specific to a game.

## Engine fixture and verification

After building packages and runtime-web, run `node scripts/create-ambient-fixture.mjs` with FFmpeg on PATH (or `FFMPEG_PATH`). It writes the disposable project and build under `output/ambient-fixture`. The generated media is entirely synthetic: one 1280×720 base, six 320×180 regions, four concurrent infinite loops, a finite-repeat region, and a weighted two-clip zero-delay pool. It includes both fallback modes, feather and image masks, a condition-controlled loop, dialogue, and a legacy flattened-video scene.

Luna testing commands:

```powershell
npm test
npm run typecheck
npm run build
npm run audit:release
node scripts/create-ambient-fixture.mjs
node scripts/verify-ambient-browser.mjs
npm run package:runtime:win -- --project-dir output/ambient-fixture
./scripts/verify-ambient-hyperv.ps1 -Mode runtime
npm run package:editor:win
./scripts/verify-ambient-hyperv.ps1 -Mode editor
```

Use `AMBIENT_BROWSER_CHANNEL=chrome` for installed Chrome. Browser evidence goes to `output/verification/ambient-browser`. Native evidence is retained by the Hyper-V broker. The native driver runs the same media checks and records the GPU adapter; a VM result is not an integrated-GPU hardware guarantee. The editor driver also verifies preview and real export. Do not run native verification on the physical host.

For a game adoption: upgrade the engine, retain the full static scene, import crop-aligned neutral images/masks/clips, create the regions and schedules in Scenes, verify overlap and endpoints in Preview/Playtest, then export a new runtime. Profile the game's actual resolutions and layer overlap on its lowest supported hardware before increasing the number of infinite loops.

## Verification snapshot (2026-09-21)

Luna validation passed 59 focused unit/integration tests, workspace typechecking, the full build, and the strict editor localization audit. Chrome passed all ten fixture checks, including exact finite repeats, decoder-free idle, zero-delay nonrepetition, dialogue continuity, neutral fallback on pause/buffering/error, conditions, reduced motion, scene exit, legacy video loops, and save restoration.

The six-second Chrome sample on an NVIDIA GeForce RTX 3080 Ti kept at least five videos active. Across 188 animation-frame samples, the p95 interval was 33.4 ms and the maximum was 33.7 ms. Each of the four persistent 30 fps loops reported 180 total video frames and three dropped frames; the dialogue input check took 8.1 ms. The generated fixture uses six 320 x 180 regions over a 1280 x 720 base. Integrated-GPU capacity and production-resolution media still require target-hardware profiling. Machine-readable evidence and screenshots are in `output/verification/ambient-browser/`.

Packaged Windows acceptance also passed in Hyper-V:

- Editor request `executable-test-20260920T221536221Z-6114f796` verified six-region authoring and preview, then a real web export with all ambient references.
- Runtime request `executable-test-20260920T224446648Z-966f65de` passed the same ten playback/lifecycle checks as Chrome. Using the Microsoft Basic Render Driver with software video decoding, its 200-sample frame-pacing check kept at least five videos active, with a p95 interval of 31.3 ms and a maximum of 46.9 ms. The persistent loops reported 180–181 total frames and 4–5 dropped frames each; dialogue input took 16 ms.

Both runs report `HarnessSucceeded`, `TestEvaluated`, `TestPassed`, and `OverallSucceeded` as true, with verified process cleanup, no survivors, VMs off, and disposable payload children deleted. Their broker result directories retain `result.json`, `broker-result.json`, `ambient-result.json`, and screenshots; the editor run also retains the actual export and its validation report. The runtime's optional `application.log` could not be collected because it remained locked; its assertions and screenshots were retained. The earlier broker maintenance delayed execution but did not prevent final acceptance.

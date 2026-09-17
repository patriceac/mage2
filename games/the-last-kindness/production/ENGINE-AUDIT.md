# Engine audit — 2026-09-17

## Recorded implementation

Source revision: `0532ea6d41f1df852caee6a0d0ddb601f3381e0b`. Working branch: `codex/last-kindness-production`. Local review fixes descend from published main `f3fc5efa0c13e4645d8f6eb67159a131525b5501`. Schema version: 16. Engine package version: 0.1.0.

| Requirement | Authoritative source | Production decision |
| --- | --- | --- |
| Editable project | `apps/editor/electron/project-io.ts`, `packages/schema/src/types.ts` | Seven native files: project, assets, locations, scenes, dialogues, inventory, strings. Assets use contained relative paths. |
| Scene geography | `HotspotSchema`, `SceneSchema`, shared `PlayerSceneRenderer.tsx` | Normalized shot-aligned rectangles; authored scene variants for physical changes. No replacement player. |
| Conditional actions | `packages/player/src/index.ts`, `packages/schema/src/effects.ts` | Declared Boolean/choice/integer variables. Authoring branches compile into mutually exclusive native hotspots within schema nesting limits. Outcomes are set idempotently. |
| Inventory | `packages/schema/src/hotspot-actions.ts` | Native rendered pickup sprites; native placement with specific item, empty-hand and wrong-item branches. Fitted-pin appearance is now baked into native scene variants after user review. Pickup/placement completion variables are explicitly declared. |
| Conversations | `DialogueTreeSchema`, shared player controller | Nodes, conditional choices, line-level media; speaker strings and separate choice text. |
| FMV and audio | `SceneSchema.videoAudioMode`, foreground media in `PlayerSceneRenderer.tsx` | Embedded/external/silent scene video, line media and foreground responses exist. Actual footage/voice synchronization still requires testing. |
| Saving | `packages/schema/src/saves.ts`, `save-compatibility.ts`, runtime save UI | Native save envelope and declared-variable persistence. Use real saved states in tests, never fabricate a playthrough by forcing state. |
| Validation | `validation.ts`, `release-readiness.ts` | Structural validity and engine readiness are different from this production's dramatic/media quality gate. |
| Export | `apps/editor/electron/exporter.ts` | Official editor export; shared runtime output. Local HTTP required for web export. No custom game runner. |
| Journal | No journal collection in schema 16 | Section uses an authored physical logbook with conditional fact/interpretation/lead pages. A global journal remains a campaign requirement, not an invented project field. |
| Sound mixing | Renderer currently exposes a shared `volume` prop | Independent voice/music/effects control requires further implementation or a coherent engine extension before final delivery. |

## Validation gate

The representative section must prove interconnected exploration, hydraulic cause and effect, two routes, visible item changes, inventory, a performed conversation, voices, sound, save/load, editor Playtest and official runtime. A missing performance or voice fails the quality gate even if every logic assertion passes. Do not scale final production footage until the gate passes.

The initial ComfyUI query reported a running local service, RTX 3080 Ti / 12 GiB, approximately 1.68 GiB available VRAM and 12.7 GiB available RAM. The LTX-2.3 image-to-video template's local node/input preflight passed. The subsequent `free_memory` call and a fresh `system_stats` call returned tool errors. No inference success, timing, audio quality or video quality has been established. This is an unresolved production dependency, not evidence that LTX can never run on the machine.

Required future checks: performed clips and alternate coverage; subtitle timing; skip/watch state parity; interrupted playback; distinct voice casting; audio review; independent volume channels; complete campaign traversal; representative human fairness and duration studies.

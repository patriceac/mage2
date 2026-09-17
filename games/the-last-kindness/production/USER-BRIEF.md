# The Last Kindness: full commercial-quality FMV adventure production brief

Create and deliver a complete, substantial, commercial-quality adventure game for **MAGE2 Editor**, using the source code in my connected GitHub repository, **`patriceac/mage2`**.

You are responsible for the actual production: game design, narrative, characters, photorealistic environments, objects, cinematic performances, dialogue, voices, music, sound effects, implementation, testing, and packaging.

The deliverable is an editable MAGE2 project and a playable export, packaged as a downloadable ZIP with all necessary assets.

**This is a game-production assignment, not a request for a pitch, design document, short demonstration, illustrated story, or first playable.** Planning documents should support the implemented game, not substitute for it.

You may use image generation and other available media-generation tools, and install suitable free tools when necessary. Check licensing and practical suitability before adopting tools or assets. Do not incur charges, subscribe to services, or publish anything publicly without my permission.

If the previous **The Last Kindness** project is available, audit it first. Preserve worthwhile writing, assets, and working systems, but substantially expand or replace anything that falls below this brief. Existing content is a starting point, not a constraint on quality.

## 1. Understand the actual engine before authoring

Inspect the current MAGE2 source, project format, asset pipeline, dialogue system, inventory interactions, conditions and effects, scene playback, saving, validation, and export process. Record the repository revision used.

Build against the editor’s actual capabilities and file formats. Do not invent unsupported project fields, assume functionality from another engine, or quietly create a separate implementation that merely resembles MAGE2.

Use the official editor and shared player/runtime as the authoritative implementation and testing surfaces.

If a necessary feature is missing, first determine whether it can be implemented cleanly through supported authoring features. Otherwise, provide the smallest coherent engine extension, with tests and clear documentation. Keep engine changes separate from game content and do not push changes to my repository without permission.

Do not replace spatial interactions with dialogue menus simply because dialogue nodes are easier to generate.

## 2. Preserve the central story and its ending

Satan is bored. After an eternity of predictable cruelty, he decides to entertain himself by doing good.

He chooses a medieval kingdom and assumes the identity of **Ian d’Au-Delà-Des-Monts**, an enigmatic, cultured traveler with a dry sense of humor. There he encounters **Tancrede**, a young adult prince whose family has been murdered by enemies of the kingdom.

Ian accompanies Tancrede on a journey to reclaim his kingdom. Their world contains witches, fantastic creatures, old bargains, haunted places, and ordinary people trying to survive extraordinary events.

Ian occasionally uses his supernatural powers, sometimes openly enough to seem uncanny, sometimes so subtly that Tancrede can explain the event away. Nevertheless, Ian lets Tancrede struggle, make mistakes, take responsibility, and grow. He must not simply solve the adventure for him.

Tancrede has repeatedly seen **Princess Ondine** in his dreams and has fallen in love with her. Finding her becomes intertwined with the struggle to recover his kingdom. Ian helps him search for her.

Ondine must be a fully realized protagonist in her own right, with independent goals, abilities, loyalties, and difficult choices. She is not a reward for Tancrede’s progress. Their relationship must develop through actual encounters, disagreements, mutual help, and earned trust. The dreams begin the relationship; they do not replace it.

Together, they defeat the enemy and recover the kingdom.

Once his mission is accomplished, Ian leaves. **Tancrede never discovers that Ian is Satan.** Throughout their journey, however, Tancrede has been unsettled by the bright flame burning in Ian’s eyes.

At their final farewell, Ian’s eyes look infinitely sad. The flame is gone.

Ian returns to Hell as Satan. Tancrede and Ondine reign together. Strangely, as far as they understand it, demons seem to leave their kingdom alone from then on.

These elements are non-negotiable. Choices may change alliances, relationships, losses, methods, and the kingdom’s condition, but must preserve this ending.

The player may know Ian’s identity while Tancrede does not. Use that dramatic irony carefully. Do not turn the ending into an exposition dump explaining every mystery or explicitly spelling out why the flame disappeared.

## 3. Develop the emotional and dramatic substance

Write a mature medieval fantasy with mystery, danger, romance, tragedy, wonder, and restrained humor. Let the world feel inhabited rather than assembled solely to provide obstacles for the protagonist.

Ian initially treats kindness as an experiment and people as an interesting diversion. Over time, his involvement becomes something he cannot dismiss so easily. Show that change through decisions, silences, reactions, and sacrifices rather than repeatedly having him explain it.

Tancrede must grow from a bereaved heir into someone capable of governing. Recovering the throne should require more than proving his ancestry or defeating an antagonist.

Give the opposition coherent objectives, internal disagreements, and believable sources of power. Develop supporting characters whose lives continue beyond their immediate usefulness to the player.

Make witches and fantastic creatures distinct individuals or cultures, not interchangeable quest dispensers. Their customs and constraints should create opportunities for investigation, negotiation, and unexpected solutions.

Establish consistent dramatic limits on Ian’s intervention. His refusal to solve something must arise from character, consequences, or an established supernatural principle, not a new convenient restriction invented for each puzzle.

Preserve tenderness and unease together. Ian’s final sadness should feel earned by the journey without becoming entirely explainable.

## 4. Build a genuinely substantial campaign

Design for **at least 50 hours of substantive first-playthrough gameplay at a normal pace**, with additional optional discoveries and meaningful replay variation.

Treat this as a production target that requires sufficient authored content and playtesting, not a number to attach to the project.

Do not manufacture length through:

* Excessive walking, repetitive backtracking, mandatory waiting, or unskippable media.
* Repeated versions of the same puzzle with different names or artwork.
* Arbitrary item chains, obscure solutions, or deliberately withheld information.
* Inflated dialogue, repeated exposition, or reading speed assumptions.
* Adding together mutually exclusive branches that a player cannot experience in one playthrough.

Plan the campaign’s scale and pacing before producing large quantities of assets. A planning range of approximately 12–16 substantial chapters is reasonable, but neither chapter count nor scene count proves that the game is long enough.

Each chapter should support several meaningful hours of investigation, discovery, interaction, and changing circumstances. It must not be a short sequence of rooms with one puzzle per room.

Report main-path, optional-content, and replay estimates separately. Label duration as unverified until there is appropriate playtest evidence.

## 5. Make chapters substantially expanded and less linear

Use interconnected locations, overlapping objectives, and several active leads instead of a single chain of mandatory steps.

Within most major chapters, allow the player to decide what to investigate first, whom to trust, which resource to pursue, and how to approach an obstacle. Support genuinely different routes through major objectives where the story permits.

Nonlinearity must affect gameplay. Choosing between two dialogue responses that immediately lead to the same result is not a meaningful alternate route.

Build alternatives involving different evidence, alliances, access routes, inventory uses, risks, or consequences. A player might enter a fortified district through a negotiated invitation, a restored service passage, or assistance from someone previously helped. These routes should require different work and produce different experiences.

Make locations evolve. Returning after a discovery, intervention, or chapter event should sometimes reveal changed people, new interactions, altered access, or the consequences of earlier decisions.

Allow optional investigations to enrich relationships and understanding or change later opportunities. Avoid side quests that exist only to increase the hour count.

Use controlled convergence to keep production coherent: different approaches may eventually reach the same essential story event, but their consequences should remain visible.

Do not give every chapter the same structure. Vary investigation, exploration, social tension, environmental manipulation, creature encounters, infiltration, aftermath, and moments of quiet intimacy.

## 6. Author bespoke puzzles and scene interactions

Create puzzles grounded in the physical world, local customs, character motives, and information the player can reasonably obtain.

Use a varied mixture of observation, deduction, inventory manipulation, mechanical systems, spatial reasoning, negotiation, testimony comparison, and supernatural rules.

Examples of the desired specificity include:

* Repairing a flooded abbey’s water-control system while choosing which occupied areas must remain accessible.
* Exposing contradictory testimony through evidence gathered from several people and locations.
* Negotiating with a witch whose bargains hinge on obligations established earlier in the story.
* Interpreting a creature’s behavior through observation rather than guessing an arbitrary inventory item.
* Coordinating bells, shutters, or reflected light to create a temporary opportunity elsewhere.
* Helping Ondine carry out a plan that challenges Tancrede’s assumptions about what she needs from him.

These are examples of variety and integration, not a template to repeat in every chapter.

Important puzzles should have multiple meaningful steps, intermediate feedback, and understandable causal relationships. Some should connect several locations or remain active alongside other objectives.

For each substantial puzzle, document its clues, prerequisites, state changes, solution routes, failure behavior, hint progression, and recovery from interruption. Then implement those elements in the game.

Avoid “moon logic,” pixel hunting, unsupported leaps of interpretation, and essential clues that disappear permanently before the player can understand them.

Wrong attempts should provide useful, situation-specific reactions. Do not use the same generic rejection for every combination. Write bespoke responses for plausible attempts and reserve generic responses for truly unrelated actions.

Use progressive, optional hints that move from a gentle nudge to explicit assistance. Do not reveal solutions automatically.

## 7. Make scenes playable spaces, not decorated menus

Compose scenes around meaningful geography and visible objects. Hotspots should correspond to what the player sees and what the characters can plausibly do.

Give important scenes appropriate inspect, talk, use, manipulate, and movement interactions. Not every scene needs every interaction type, but substantial locations must offer more than an exit and a single answer button.

Objects should have understandable uses, readable silhouettes, consistent scale, and appropriate feedback. Picked-up objects should disappear from the environment. Repaired mechanisms, opened passages, displaced objects, and other consequential changes should be visible and persistent.

Keep interaction targets aligned with the current shot and scene state. Do not leave clickable areas floating over objects that have moved or disappeared.

Provide clear navigation and discoverability without covering the world in permanent labels or interface panels. Support keyboard access and optional hotspot assistance.

Maintain an in-game journal that distinguishes established facts from interpretations and tracks useful leads without becoming a compulsory step-by-step walkthrough.

Design the interaction, required performance, environmental changes, and camera coverage together before generating final media.

## 8. Produce coherent photorealistic art and real performances

Establish a visual bible before generating production assets: character references, faces, proportions, costumes, materials, architecture, lighting, color treatment, camera language, and regional distinctions.

Maintain character identity across scenes and shots. Keep costumes, injuries, carried objects, weather, time of day, and spatial continuity consistent.

Use photorealistic environments and characters with cinematic composition and clear interaction readability. Avoid incompatible styles, inconsistent faces, obvious procedural stand-ins, or assets that look like unrelated illustrations placed next to one another.

**Animated cinematic performances are required.** Slow zooms on still images, drifting particles, looping fog, and flickering candles are environmental embellishments, not character performances.

Create actual performances for principal conversations and story events: appropriate gestures, gaze, listening, reactions, movement, object handling, entrances, exits, and physical consequences.

Use suitable coverage: establishing shots, two-shots, close-ups, over-the-shoulder shots, inserts, and reaction shots. Avoid presenting every exchange as the same stationary portrait.

Match shot duration, movement, and editing to the dialogue and emotional situation. Avoid conspicuously repeated gestures and unrelated mouth movements.

Static plates are acceptable where they serve quiet investigation or a deliberate artistic purpose. They must not replace the promised performed FMV experience.

Where meaningful alternate approaches change an event, provide corresponding staging or footage rather than playing a contradictory generic clip.

Give special attention to the farewell: the missing flame, Ian’s sadness, Tancrede’s incomplete understanding, and the restraint of the exchange must be visible in the performance.

## 9. Create finished voices, music, and sound design

Voice all spoken narrative and dialogue, including consequential branches and alternate responses. Interface labels and journal text do not require narration.

Use distinct, consistent voices for the cast. Create casting notes, pronunciation guidance, and performance direction. Preserve the pronunciation and identity of Tancrede, Ondine, and Ian d’Au-Delà-Des-Monts.

Voices must convey intention, rhythm, emotion, and relationships. Do not treat flat text-to-speech output as a finished dramatic performance.

Use voices and generation methods with suitable usage rights. Do not imitate identifiable real performers without authorization.

Synchronize speech, visible performance, subtitles, and editing. Provide readable subtitles with speaker identification and useful captions for important nonverbal sound.

Create an original score with evolving themes for the principal characters, relationships, and regions. Use silence deliberately. Avoid one uninterrupted loop per chapter regardless of events.

Create environmental ambience and action-specific sound effects, including meaningful feedback for puzzle mechanisms and scene changes.

Mix dialogue for intelligibility. Prevent clipping, abrupt loop seams, duplicate playback, and music overpowering speech. Provide separate volume controls and verify their behavior.

Skipping a cinematic must preserve the same intended story and gameplay state as watching it. Dialogue choices must not be obscured by media or cut off spoken lines accidentally.

## 10. Produce in stages without redefining the deliverable

Begin with a concise engine audit, campaign structure, dependency plan, asset strategy, and production ledger. Keep planning proportional to its usefulness.

Next, produce a representative, fully integrated section that demonstrates the intended finished quality: exploration, a substantial bespoke puzzle, an alternate approach, a performed conversation, inventory use, voices, sound, saving, and native-engine playback.

Use that section to validate the production pipeline before scaling up. It is an internal quality gate, **not the final deliverable**.

Expand the complete campaign to the same standard, revising weak content rather than multiplying it.

Track each chapter and major asset through explicit states such as designed, authored, implemented, integrated, tested, and approved. Link completion claims to actual files and test evidence.

Do not silently lower the scope because a tool is inconvenient or a generation fails. Identify the specific limitation, preserve completed work, and distinguish unfinished production from accepted content.

If execution limits prevent completion, deliver an accurately labeled checkpoint containing the actual work and precise remaining requirements. Do not call it the finished commercial game, count planned material as delivered, or promise unperformed background work.

## 11. Test in the real engine and fix what fails

Perform validation and gameplay testing against the actual MAGE2 implementation at the recorded revision.

Required testing layers are:

1. **Project and asset validation:** schemas, references, dialogue links, scene ownership, conditions, inventory dependencies, localization coverage, media existence, supported formats, and packaging integrity.
2. **Native gameplay logic tests:** puzzle prerequisites, alternate solution orders, branching consequences, repeat-interaction protection, wrong-item handling, and recoverability.
3. **Actual player-surface testing:** editor Playtest and the official exported runtime, including visible interactions, media, audio, subtitles, inventory, saving, loading, and menus.
4. **Campaign playthroughs:** start-to-ending traversal through real player actions, plus additional paths covering major alternate routes and consequential decisions.

Do not treat graph reachability as proof that a human can solve the game. Do not treat manipulated save states, direct scene jumps, or forced variables as an end-to-end playthrough. Such techniques are acceptable for targeted tests only when clearly identified.

Test saving and loading during complex puzzle states, dialogue, chapter transitions, and cinematic boundaries. Verify that progress, consequences, inventory, and scene appearance remain consistent.

Test failed attempts, interrupted media, revisits, repeated clicks, alternate objective orders, and earlier choices with later consequences. Prevent softlocks, duplicate rewards, missing exits, dead dialogue branches, and essential items becoming unobtainable.

Inspect actual screenshots and footage for composition, hotspot alignment, subtitle layout, continuity, visual defects, and animation quality. Review audio, not just the existence of audio files.

Measure loading behavior and playback performance on identified test configurations. Do not invent performance results or minimum specifications.

Where an operating system or packaged-editor environment is unavailable, explicitly mark the corresponding gate as untested. Passing a separate browser preview is not evidence of passing the Windows editor.

Keep test reports, reproduction steps, and evidence in the deliverable. Fix material defects before marking the game complete.

Automated tests establish implementation behavior, not dramatic quality, puzzle fairness, or 50-hour duration. Those claims also require appropriate human playtesting and review.

## 12. Package the actual production and report honestly

Deliver a downloadable ZIP containing:

* The complete editable MAGE2 project with relative, portable asset references.
* All media required to play, with no missing downloads, API keys, or generation services needed at runtime.
* The official playable export and clear launch instructions.
* Editable production sources where available, including scripts, subtitles, asset manifests, and generation/rebuild instructions.
* A walkthrough, progressive-hint reference, test evidence, compatibility details, known issues, credits, and asset provenance.
* Any required engine changes as a clearly separated patch or change set with instructions and tests.

Do not bundle unrelated dependencies, temporary files, or redundant media merely to make the archive appear substantial.

Verify the archive after packaging and test it from a clean extracted location.

The final delivery report should state what is implemented, what has actually been tested, the evidence behind duration estimates, and anything still incomplete.

**The completion standard is a cohesive, substantial, performed, voiced, polished, and tested adventure in MAGE2.**

A large collection of JSON files is not that standard. Neither is a storyboard, an illustrated slideshow, a short prototype, an independent replacement player, or a document describing the 50-hour game that might eventually exist.

Deliver the game described here, and keep every claim about its readiness tied to observable results.

# MAGE2 localization

MAGE2 has two independent language concepts:

- **Interface language** controls editor chrome, player chrome, system messages, accessibility labels, and built-in help text.
- **Project languages** control user-authored story text and localized media. A project keeps its own default language and supported locale list.

Changing the interface language must never add a project language, change the project default language, alter translation states, or translate authored content.

## Built-in interface locales

| Locale | Language name |
| --- | --- |
| `en` | English |
| `fr` | Français |
| `es` | Español |
| `zh-Hans` | 简体中文 |
| `ja` | 日本語 |
| `ko` | 한국어 |
| `ar` | العربية |

The same locale set is used for the editor interface, player-owned interface text, and starter response library.

## Automatic selection

On a clean launch, the editor uses the operating system's preferred languages and the player uses the browser's preferred languages. Matching is deterministic:

- Regional English, French, Spanish, Japanese, Korean, and Arabic tags use their matching built-in base locale.
- `zh-Hans`, `zh-CN`, `zh-SG`, and bare `zh` use `zh-Hans`.
- Traditional Chinese tags (`zh-Hant`, `zh-TW`, `zh-HK`, and `zh-MO`) and unsupported or malformed tags use English.

An explicit interface-language choice takes precedence over automatic detection and persists across relaunches. Selecting **Automatic** clears that override and applies the currently detected language again.

The player resolves its interface language separately from its project-content language. If a French browser opens an English-only game, the player chrome remains French while authored text and media use the project's English default. If the project also supports French, French authored content may be selected without changing the interface-language preference.

## Fallback and diagnostics

Missing interface translations fall back to English. Development and verification builds must report missing keys so fallback cannot hide incomplete catalogs. Raw keys and blank labels must never reach users.

Project-authored text and media follow the project's existing locale and default-language fallback rules. Interface fallback must not be implemented by mutating project data.

## Translation rules

- Translate complete messages and preserve named placeholders. Do not assemble translated sentences from English fragments.
- Keep `MAGE2`, filenames, paths, URLs, IDs, locale codes, file formats, and keyboard shortcuts unchanged unless a surrounding sentence needs translation.
- Do not count copied English source text as a completed non-English translation, except for a reviewed invariant term.
- Use locale-aware date and number formatting where the interface presents those values.
- Keep editor instructions direct and professional and starter responses concise and neutral.
- Preserve the gameplay meaning of the five starter response groups: Wrong item, Missing prerequisite, Already completed, No effect, and Nothing useful.

## Terminology

Use **Interface language**, **Project languages**, and **Default project language** whenever the shorter word “Language” could be ambiguous. “Player” means the game-running surface, not the person playing.

## Right-to-left behavior

Arabic interface structure and prose use right-to-left direction. Navigation hierarchy, panel alignment, form-label placement, menus, and notifications may mirror logically. Media transport, timelines, waveforms, spatial scene coordinates, rotation controls, and authored media retain their physical or chronological direction. Paths, URLs, IDs, shortcuts, timestamps, and mixed Latin text must remain readable inside Arabic sentences.

## Verification

Release acceptance requires the packaged editor and generated runtime, not only source or unit tests. Verify all seven locales, unsupported and Traditional Chinese fallback, explicit preference persistence and reset, mixed interface/content languages, representative loading/empty/error states, Arabic layout, and unchanged serialized project data.

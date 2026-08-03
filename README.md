# MAGE2

[![CI](https://github.com/patriceac/mage2/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/patriceac/mage2/actions/workflows/ci.yml)

MAGE2 is a workspace for building full-motion adventure projects with a desktop editor, shared schema and playback packages, and a static web runtime export.

## What is in this repo

- `apps/editor`: Electron + React authoring tool for project creation, world layout, scene editing, dialogue graphs, inventory, validation, and playtesting.
- `apps/runtime-web`: Static React runtime that loads an exported build and plays scenes, hotspots, dialogue, and save data.
- `packages/schema`: Zod-backed project schemas, migrations, starter data, export helpers, and validation rules.
- `packages/player`: Runtime state machine for scene traversal, hotspots, dialogue, inventory, and saves.
- `packages/player-ui`: Host-neutral scene, scene-audio/playhead, hotspot, dialogue, inventory, and placed-object presentation shared by editor Playtest and exported players.
- `packages/media`: Media import and export helpers used by the editor build pipeline.

## Features

- Create or reopen project folders directly from the Electron editor.
- Author locations, scenes, hotspots, dialogue trees, and inventory data in one workspace.
- Import localized foreground audio or video for individual dialogue lines and hotspot interactions without replacing scene backgrounds or looping scene audio.
- Validate projects and jump from issues directly to the affected editor surface.
- Export a static runtime build that copies the web player and project content into a distributable folder.
- Reuse shared schema and player logic across the editor and runtime.

## Getting started

### Prerequisites

- Node.js 24 recommended (22.12 or newer required)
- npm
- Python 3 (optional, only for the local static-export preview command below)

### Install

```bash
npm install
```

### Common commands

```bash
npm run dev:editor
npm run dev:runtime
npm test
npm run typecheck
npm run build
```

On Windows, you can also launch the editor with:

```bat
launch-editor.cmd
```

User-facing parity is defined by the packaged `MAGE2 Editor.exe` at `output/packaging/editor-win/dist/win-unpacked/`.
That shortcut-friendly launcher rebuilds the packaged app when it is missing or stale, repairs the Desktop and Start Menu shortcuts to that canonical executable, repairs the pinned taskbar entry if it already exists, and then launches the packaged app.

If you want to launch it without a visible console window, use:

```vbscript
launch-editor.vbs
```

If you want the old raw Electron launcher for development, use:

```bat
launch-editor-dev.cmd
```

That script starts `electron.exe` directly and keeps startup errors visible in the terminal, but Windows will treat pinned taskbar items as Electron because it is the owning executable.

To create a packaged Windows app and installer:

```bash
npm run package:editor:win
```

That command writes the packaged artifacts to `output/packaging/editor-win/dist/`, including a `win-unpacked` app folder and an NSIS installer.
It also refreshes the known Windows shortcuts so Desktop, Start Menu, and any existing taskbar pin continue to resolve to the canonical packaged executable.

To run the canonical packaged-app release smoke gate, use:

```bash
npm run verify:editor:windows-launch
```

That command is a compatibility alias for the self-contained Windows release verification below. It packages and launches the canonical EXE directly, creates and exports a representative project, checks the renderer security boundary and Electron fuses, and writes a screenshot plus a JSON report under `output/playwright/windows-ci/`.

For a clean, self-contained release smoke flow that creates and exports its own representative project, use:

```bash
npm run verify:editor:windows-ci
```

The release process, SHA-256 checksums, and Authenticode expectations are documented in [docs/RELEASING.md](docs/RELEASING.md).

## Development notes

- `npm run dev:editor` starts the Electron editor with the Vite renderer and watched Electron entrypoints.
- `npm run dev:runtime` starts the standalone runtime web app.
- `npm run build` compiles the shared packages first, then the runtime and editor apps, and on Windows also refreshes the packaged editor binary in `output/packaging/editor-win/dist/`.
- `launch-editor-dev.cmd` is a debugging-only launcher and is not valid for desktop/taskbar parity claims because Windows treats it as raw Electron.
- The starter project template intentionally begins with placeholder content, so validation will report missing scene media until real assets are imported.

## Export flow

Using **Export Runtime** in the editor:

1. Saves the current project bundle.
2. Uses the latest runtime web build available to the editor. The export runs the same scene renderer used by editor Playtest in production mode, without the Playhead, save slots, hotspot diagnostics, raw runtime state, or audio-inspection controls.
   In the repo build, this comes from `apps/runtime-web`; in the packaged editor, it comes from the bundled runtime assets.
3. Copies the runtime into the project build output folder.
4. Copies referenced media into `media/`.
5. Writes `build-manifest.json`, `content/project-content.json`, and `validation-report.json`.

The export folder is the reserved `build` directory inside the selected project. Custom output paths are refused so project data cannot redirect replacement into an arbitrary folder. MAGE2 replaces an existing `build` only when its complete file inventory still matches the prior managed export; otherwise it leaves the folder untouched and asks you to review it manually.

### Shared player renderer

Editor Playtest is the authoritative player surface. Editor Playtest, static web exports, and packaged Electron players use the same scene media, hotspot, dialogue, inventory, placed-object, and feedback renderer. Editor toolbars and runtime-state diagnostics wrap that surface for authors and are not part of a production export; the exported player supplies only its intentional player-facing chrome.

### Hotspot interaction events

The Hotspot Inspector names events after the player action that triggers them. A normal hotspot has **On click**. An inventory-placement hotspot has three independent branches: **On click** when no inventory item is selected, **Use [item name]** for its configured item, and **Any other item** for a selected nonmatching item. Each branch has one **Player feedback** choice: none, one exact response, a random response group, or a dialogue. Scene targets and effects remain separate.

**None (silent)** is literal: the player does not generate fallback copy or open the inventory drawer. Legacy projects that used **Otherwise** are migrated when loaded: placement fallbacks are preserved for both the unselected-click and wrong-item branches, while normal-hotspot fallbacks are preserved for unselected clicks and selected items.

### Response groups

Author reusable responses under **Dialogue > Responses**. A group can mix text, audio, and video entries; selecting a group on a hotspot chooses one entry at random and excludes that group’s most recently played entry when another choice exists. This short history lasts only for the current play session and is not written into saves. A specific entry can also be assigned directly.

Text feedback is nonblocking and disappears after `2200 ms + 45 ms` per displayed character, clamped to 3–8 seconds. Audio is nonblocking and can be stopped. Video pauses scene media, timelines, hotspots, inventory, and dialogue until playback ends or the player skips it; it fills the exported runtime window and remains inside the editor Playtest area.

Audio and video responses reference ordinary project assets. Choose an existing compatible asset or import one directly while editing the response; inline imports are added to the same Assets and Localization workflows as other project media.

New projects include five editable starter groups. Existing projects receive the same unassigned library once on their first open after each library update, so migration does not change gameplay. Deleting a starter group later does not recreate it. English starter copy is:

- **Wrong item:** “I can’t use that here.”, “That’s not the right tool.”, “That won’t help.”, “I need something else.”
- **Missing prerequisite:** “I’m missing something.”, “I can’t do that yet.”, “I should deal with something else first.”, “There’s another step first.”
- **Already completed:** “That’s already done.”, “I’ve already handled that.”, “There’s nothing more to do here.”, “I don’t need to do that again.”
- **No effect:** “Nothing happens.”, “That had no effect.”, “It doesn’t react.”, “That doesn’t seem to change anything.”
- **Nothing useful:** “Just ordinary clutter.”, “Nothing here I can use.”, “It’s all odds and ends.”, “There’s nothing of interest here.”

Equivalent starter strings are stored for English, French, Spanish, Simplified Chinese, Japanese, Korean, and Arabic. The migration does not automatically enable those locales for a project.

## Serving an exported game

Serve an exported game over HTTP or HTTPS. Opening `build/index.html` with a `file://` URL is not supported because the player fetches its manifest and content at runtime.

Treat `build/index.html` as the entry point and publish the complete `build` directory without flattening or renaming its relative structure. The manifest, `content/`, `media/`, and generated player assets must remain beside the entry point as exported. When hosting beneath a subpath, mount the whole folder at a URL with a trailing slash, such as `https://example.com/games/my-game/`. The export uses relative URLs and does not require a single-page-app rewrite rule.

Renderer sharing does not change these serving requirements. The `?debug=1` query is an explicit developer/support mode and should not be used in a normal published player URL.

The player menu provides **Language**, **Save game**, **Load game**, and **New game** in both web and Electron exports, plus **Quit** in the standalone Electron player. **Load game** is unavailable until the project has a valid local save; loading replaces current progress, while starting a new game deletes this project's saved progress on the current device and starts a new run. Editor Playtest's **Save Slot**, **Load Slot**, and **Reset Run** remain separate authoring controls with different semantics.

For a local test on Windows, open a terminal in the exported `build` directory and run:

```powershell
py -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/` in a browser.

## Electron player on Windows

To package an exported player as a standalone Electron app, run this from the repository root:

```powershell
npm run package:runtime:win -- --project-dir 'C:\path\to\your\MAGE2-project'
```

The unpacked player is written to `output/packaging/runtime-win/dist/win-unpacked/`, and the command creates a desktop shortcut named `<Project> Player.lnk` that points to that exact executable. The player serves the same bundled static export over a local loopback HTTP server, so no separate Python or Node server is needed after packaging.
Supported static hosts, HTTPS/header requirements, caching rules, and deployment checks are documented in [docs/EXPORT_HOSTING.md](docs/EXPORT_HOSTING.md).

## CI

GitHub Actions runs the following on pushes and pull requests targeting `main`:

- `npm ci`
- `npm test`
- `npm run typecheck`
- `npm run build`
- a Windows job that audits, packages, launches, creates a project, exports it, and uploads the packaged binaries plus screenshot/report evidence

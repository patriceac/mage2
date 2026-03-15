# MAGE2

[![CI](https://github.com/patriceac/mage2/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/patriceac/mage2/actions/workflows/ci.yml)

MAGE2 is a workspace for building full-motion adventure projects with a desktop editor, shared schema and playback packages, and a static web runtime export.

## What is in this repo

- `apps/editor`: Electron + React authoring tool for project creation, world layout, scene editing, dialogue graphs, inventory, validation, and playtesting.
- `apps/runtime-web`: Static React runtime that loads an exported build and plays scenes, hotspots, subtitles, dialogue, and save data.
- `packages/schema`: Zod-backed project schemas, migrations, starter data, export helpers, and validation rules.
- `packages/player`: Runtime state machine for scene traversal, hotspots, dialogue, inventory, and saves.
- `packages/media`: Media import and export helpers used by the editor build pipeline.

## Features

- Create or reopen project folders directly from the Electron editor.
- Author locations, scenes, hotspots, dialogue trees, subtitles, and inventory data in one workspace.
- Validate projects and jump from issues directly to the affected editor surface.
- Export a static runtime build that copies the web player and project content into a distributable folder.
- Reuse shared schema and player logic across the editor and runtime.

## Getting started

### Prerequisites

- Node.js 20+ recommended
- npm

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

That script builds the editor on first run if the compiled assets are missing.

If you want to launch it without a visible console window, use:

```vbscript
launch-editor.vbs
```

Use `launch-editor.cmd` when you want build or startup errors to stay visible in a terminal.

## Development notes

- `npm run dev:editor` starts the Electron editor with the Vite renderer and watched Electron entrypoints.
- `npm run dev:runtime` starts the standalone runtime web app.
- `npm run build` compiles the shared packages first, then the runtime and editor apps.
- The starter project template intentionally begins with placeholder content, so validation will report missing scene media until real assets are imported.

## Export flow

Using **Export Runtime** in the editor:

1. Saves the current project bundle.
2. Builds `apps/runtime-web`.
3. Copies the runtime into the project build output folder.
4. Copies referenced media into `media/`.
5. Writes `build-manifest.json`, `content/project-content.json`, and `validation-report.json`.

The default export folder is `build` inside the selected project directory.

## CI

GitHub Actions runs the following on pushes and pull requests targeting `main`:

- `npm ci`
- `npm test`
- `npm run typecheck`
- `npm run build`

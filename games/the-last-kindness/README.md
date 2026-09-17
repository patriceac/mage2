# The Last Kindness — production checkpoint

This is ongoing production for the attached full-game brief. It is **not the finished game**, a 50-hour release, or an approved FMV quality gate. Do not market this checkpoint as any of those things.

Engine: `patriceac/mage2`, revision `0532ea6d41f1df852caee6a0d0ddb601f3381e0b`, schema 16. The published main revision observed on 2026-09-17 was `f3fc5efa0c13e4645d8f6eb67159a131525b5501`, an ancestor of this revision. No engine changes are necessary for the implemented puzzle logic. Production changes are local only.

The editable section concerns chapter 3, Saint-Orme, where Tancrede meets Ondine as a person rather than an image in his dreams. The intended campaign and its fixed ending are preserved in `production/CAMPAIGN.md`. Nothing listed as planned there counts as delivered content.

Sources live here; generated deliverables live under `output/the-last-kindness/`. The checkpoint archive includes the editable seven-file MAGE2 project, actual media, the official export when available, authored sources, provenance, walkthrough and evidence. Consult its `DELIVERY.md` for the exact tested state.

Build after the engine packages have been built:

```powershell
npm run build:packages
node games/the-last-kindness/build.mjs
npx vitest run scripts/last-kindness.test.ts
```

The build reads PNGs from `output/the-last-kindness/source-media`. Restore them from the checkpoint's editable-project/media directory, or from `production/ASSETS.json` followed by the overrides in `production/PIN-INTEGRATION-EDITS.json`. Rebuilding content never invents missing artwork or footage. Engine source is required to rebuild, but not to play the packaged static export. Generation services and model weights are not runtime dependencies.

The current playable review is the official exported runtime, served locally on port 4187. User feedback has corrected the integrated pin appearance and the archive exit geometry. See `production/LEDGER.md` and `production/DELIVERY.md` for actual evidence and unfinished work. The Windows editor acceptance attempt did not pass; do not substitute browser results for it.

The user confirmed that no previous The Last Kindness project exists. This production starts from the supplied story and brief.

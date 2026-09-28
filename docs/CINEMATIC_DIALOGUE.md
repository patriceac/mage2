# Cinematic dialogue (schema 22)

Set `cinematic: true` and `mediaAssetId` on each performed dialogue node. Use normal `nextNodeId` links. The shared editor/web/Windows player advances once when the video ends, keeps the last frame while the next clip loads, and stops at authored choices. Node effects and links back to a topic menu use the existing dialogue controller.

Cinematic lines show passive subtitles without a speaker, portrait, dialogue card, Continue button, or click-anywhere advancement. The corner **Skip** control skips the current clip; it never chooses a response. The player menu pauses playback. Missing/failed videos show the line and a usable Skip; blocked autoplay offers the existing media recovery control. Ordinary dialogue and narration remain unchanged. Older projects migrate without opting in.

Configure appearance in `manifest.playerPresentation.subtitles` (all fields optional):

| Field | Default | Range |
| --- | --- | --- |
| `fontFamily` | Inherited game font | CSS font stack, including bundled `"MAGE2 Garamond"` |
| `color` | `#ffffff` | Six-digit hex |
| `backgroundColor` | `#000000` | Six-digit hex |
| `backgroundOpacity` | `0.65` | 0–1; 0 removes the backing |
| `fontScale` | `1` | 0.5–2; multiplies the responsive 16–28px base and the player's text-size preference |
| `lineHeight` | `1.3` | 1–2 |
| `bottomPercent` | `5` | 0–25; distance above the player bottom |

Example project-specific serif presentation:

```json
{
  "fontFamily": "\"MAGE2 Garamond\", Georgia, serif",
  "color": "#f2e7d0",
  "backgroundOpacity": 0,
  "fontScale": 1.7,
  "lineHeight": 1.2,
  "bottomPercent": 6
}
```

Subtitles are centered within 90% of the player and use a dark outline/shadow. Each caption has at most **two lines of 43 visible Unicode characters**, counting spaces and punctuation. Combining accents and joined emoji count as single grapheme clusters. Wrapping prefers spaces; long unbroken words split at grapheme boundaries. Authored newlines are retained; other whitespace is normalized to single spaces. The measured caption scales down on narrow surfaces so its logical lines never wrap into additional visual rows or get clipped.

For long dialogue, add `subtitleCues` to the node, referencing localized strings:

```json
"subtitleCues": [
  { "startMs": 200, "endMs": 2300, "textId": "speech.first" },
  { "startMs": 2300, "endMs": 5500, "textId": "speech.second" }
]
```

Cues follow the dialogue video's `currentTime`, including pause, seek and replay. Intervals are start-inclusive/end-exclusive; gaps show no subtitle. Times are whole milliseconds, ordered, non-overlapping, and within each locale's video duration (imported duration metadata is required). Each localized cue must exist, contain text, and satisfy 43×2. Cue text must reconstruct the full localized `node.textId` in order, ignoring whitespace and canonical Unicode differences. Timing is authored, never guessed or accelerated. The same cue times apply to each locale's video; different localized recordings must respect those intervals.

The 21→22 migration preserves all text and adds no cues or timings. Existing uncued cinematic lines that fit 43×2 still show for the clip's duration. Oversized uncued lines require authored cues: project validation blocks preview/release export with `DIALOGUE_SUBTITLE_INVALID`. The shared renderer also pauses invalid captions and shows the authoring error instead of truncating or silently hiding overflow; explicit Skip and the player menu remain available. Non-cinematic dialogue is unaffected. These authoring fields currently use project JSON; cue strings appear in the existing localization view.

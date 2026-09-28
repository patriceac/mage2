# Cinematic dialogue (schema 21)

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

Subtitles are centered, wrap within 90% of the player, preserve authored newlines, and use a dark outline/shadow. Each node's text is displayed with its decoded clip; no word-level timing is inferred. These authoring fields currently use project JSON; no new editor controls are added.

import type { DialogueNode } from "./types";

export const SUBTITLE_MAX_CHARACTERS = 43;
export const SUBTITLE_MAX_LINES = 2;
const characters = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const graphemes = (text: string) => Array.from(characters.segment(text), (part) => part.segment);

/** Wrap visible characters, keeping punctuation, grapheme clusters and authored line breaks intact. */
export function wrapCinematicSubtitle(text: string): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let remaining = graphemes(paragraph.replace(/[^\S\n]+/gu, " ").trim());
    while (remaining.length > SUBTITLE_MAX_CHARACTERS) {
      const space = remaining.lastIndexOf(" ", SUBTITLE_MAX_CHARACTERS);
      const end = space > 0 ? space : SUBTITLE_MAX_CHARACTERS;
      lines.push(remaining.slice(0, end).join(""));
      remaining = remaining.slice(end);
      if (remaining[0] === " ") remaining.shift();
    }
    lines.push(remaining.join(""));
  }
  return lines;
}

/** Shared by project/export validation and the player; invalid text is never truncated. */
export function getCinematicSubtitleError(node: DialogueNode, strings: Record<string, string>, durationMs?: number): string | undefined {
  if (!node.cinematic) return node.subtitleCues ? "Subtitle cues require a cinematic dialogue node." : undefined;
  const fullText = strings[node.textId];
  if (typeof fullText !== "string" || !fullText.trim()) return `Missing subtitle text '${node.textId}'.`;
  const cues = node.subtitleCues;
  if (cues && (!cues.length || !Number.isFinite(durationMs) || durationMs! <= 0)) {
    return "Timed subtitles need at least one cue and a video with a known duration. Reimport the video if needed.";
  }
  let previousEnd = 0;
  for (const cue of cues ?? [{ textId: node.textId }]) {
    const text = strings[cue.textId];
    if (typeof text !== "string" || !text.trim()) return `Missing subtitle text '${cue.textId}'.`;
    if (wrapCinematicSubtitle(text).length > SUBTITLE_MAX_LINES) {
      return `Subtitle '${cue.textId}' exceeds two lines of 43 characters. ${cues ? "Split it into more timed cues." : "Add authored subtitleCues for this dialogue."}`;
    }
    if ("startMs" in cue) {
      if (!Number.isInteger(cue.startMs) || !Number.isInteger(cue.endMs) || cue.startMs < previousEnd || cue.endMs <= cue.startMs || cue.endMs > durationMs!) {
        return `Subtitle '${cue.textId}' must follow the previous cue without overlap and have startMs < endMs within the video duration.`;
      }
      previousEnd = cue.endMs;
    }
  }
  const content = (text: string) => text.replace(/\s/gu, "").normalize("NFC");
  if (cues && content(cues.map((cue) => strings[cue.textId]).join("")) !== content(fullText)) {
    return `Subtitle cues must preserve the complete text of '${node.textId}' in order (whitespace may differ).`;
  }
  return undefined;
}

/** Half-open intervals: a boundary switches to the next cue; authored gaps stay silent. */
export function resolveCinematicSubtitleText(node: DialogueNode, strings: Record<string, string>, timeMs: number): string | undefined {
  const textId = node.subtitleCues
    ? node.subtitleCues.find((cue) => cue.startMs <= timeMs && timeMs < cue.endMs)?.textId
    : node.textId;
  return textId ? strings[textId] : undefined;
}

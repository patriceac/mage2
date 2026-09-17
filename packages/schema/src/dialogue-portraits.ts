/** Speaker names are shared across dialogue trees; surrounding whitespace is ignored. */
export function resolveSpeakerPortraitAssetId(portraits: Record<string, string>, speaker: string): string | undefined {
  const name = speaker.trim();
  return Object.hasOwn(portraits, name) ? portraits[name] : undefined;
}

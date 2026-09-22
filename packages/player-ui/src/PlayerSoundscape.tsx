import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { PlayerSnapshot } from "@mage2/player";
import { resolveAssetVariant, type ProjectBundle } from "@mage2/schema";
import type { PlayerAudioLevels } from "./audio";
import { SoundscapePlayer, type SoundscapeState } from "./soundscape-player";
import type { PlayerSourceResolver } from "./model";

export const PlayerSoundscape = forwardRef<{ resume(): void }, {
  project: Pick<ProjectBundle, "assets">;
  snapshot: PlayerSnapshot;
  locale: string;
  resolveSourcePath: PlayerSourceResolver;
  levels: PlayerAudioLevels;
  paused: boolean;
  ducked: boolean;
  onStatus: (blocked: boolean, failed: boolean) => void;
  onCuesConsumed?: (sequence: number) => void;
}>(function PlayerSoundscape({ project, snapshot, locale, resolveSourcePath, levels, paused, ducked, onStatus, onCuesConsumed }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<SoundscapePlayer | null>(null);
  useImperativeHandle(ref, () => ({ resume: () => player.current?.resume() }), []);
  useEffect(() => {
    player.current = new SoundscapePlayer(container.current!, resolveSourcePath, onStatus);
    return () => { player.current?.dispose(); player.current = null; };
  }, [resolveSourcePath, onStatus]);
  useEffect(() => {
    const source = (assetId: string) => {
      const asset = project.assets.assets.find((entry) => entry.id === assetId && entry.kind === "audio");
      const variant = asset && resolveAssetVariant(asset, locale);
      return variant?.proxyPath ?? variant?.sourcePath;
    };
    const layers: SoundscapeState["layers"] = {};
    for (const channel of ["music", "ambience"] as const) {
      const layer = snapshot.scene.soundscape?.[channel];
      const sourcePath = layer && source(layer.assetId);
      if (layer && sourcePath) layers[channel] = { ...layer, sourcePath };
    }
    const cues = (snapshot.soundCues ?? []).flatMap((cue) => {
      const sourcePath = source(cue.assetId);
      return sourcePath ? [{ ...cue, sourcePath }] : [];
    });
    player.current?.update({ sessionId: snapshot.audioSessionId, sceneKey: `${snapshot.scene.id}:${snapshot.sceneEntrySequence ?? 0}`,
      layers, cues, levels, paused, ducked });
    const lastCue = snapshot.soundCues?.at(-1)?.sequence;
    if (lastCue !== undefined) onCuesConsumed?.(lastCue);
  }, [project, snapshot, locale, levels, paused, ducked, resolveSourcePath, onStatus, onCuesConsumed]);
  return <div ref={container} hidden data-player-soundscape="" data-ducked={ducked} />;
});

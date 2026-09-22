import { SoundscapeLayerSchema, type Asset, type Scene, type SoundscapeLayer } from "@mage2/schema";
import { DropdownSelect } from "../../DropdownSelect";
import { useEditorI18n } from "../../i18n";
import "./SoundscapeSection.css";

export function SoundscapeSection({ scene, assets, mutateScene }: {
  scene: Scene; assets: Asset[]; mutateScene: (change: (scene: Scene) => void) => void;
}) {
  const { t } = useEditorI18n();
  const update = (channel: "music" | "ambience", change: Partial<SoundscapeLayer> | undefined) => mutateScene((draft) => {
    draft.soundscape ??= {};
    if (!change) delete draft.soundscape[channel];
    else draft.soundscape[channel] = SoundscapeLayerSchema.parse({ ...draft.soundscape[channel], ...change });
    if (!draft.soundscape.music && !draft.soundscape.ambience) delete draft.soundscape;
  });
  return <section className="scene-soundscape" aria-label={t("Soundscape")}>
    <h4>{t("Soundscape")}</h4>
    <p className="muted">{t("Independent music and ambience. Preview in Playtest; import audio in Assets.")}</p>
    {(["music", "ambience"] as const).map((channel) => {
      const layer = scene.soundscape?.[channel];
      const label = channel === "music" ? t("Music") : t("Ambience");
      return <fieldset key={channel} data-soundscape-channel={channel}>
        <legend>{label}</legend>
        <label>{t("Audio asset")}
          <DropdownSelect aria-label={label} value={layer?.assetId ?? ""}
            onChange={(event) => update(channel, event.target.value ? { assetId: event.target.value } : undefined)}>
            <option value="">{t("None")}</option>
            {layer && !assets.some((asset) => asset.id === layer.assetId) ? <option value={layer.assetId}>{layer.assetId}</option> : null}
            {assets.filter((asset) => asset.kind === "audio").map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </DropdownSelect>
        </label>
        {layer ? <>
          <div className="scene-soundscape__levels">
            <label>{t("Gain")}<input type="number" min={0} max={1} step={0.05} value={layer.gain}
              onChange={(event) => update(channel, { gain: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })} /></label>
            {(["fadeInMs", "fadeOutMs"] as const).map((field) => <label key={field}>
              {field === "fadeInMs" ? t("Fade in (ms)") : t("Fade out (ms)")}
              <input type="number" min={0} max={60000} step={100} value={layer[field]}
                onChange={(event) => update(channel, { [field]: Math.min(60000, Math.max(0, Math.round(Number(event.target.value) || 0))) })} />
            </label>)}
          </div>
          <label className="scene-soundscape__toggle"><input type="checkbox" checked={layer.loop}
            onChange={(event) => update(channel, { loop: event.target.checked })} />{t("Loop")}</label>
          <label className="scene-soundscape__toggle"><input type="checkbox" checked={layer.continueAcrossScenes}
            onChange={(event) => update(channel, { continueAcrossScenes: event.target.checked })} />{t("Continue the same track across scenes")}</label>
        </> : null}
      </fieldset>;
    })}
  </section>;
}

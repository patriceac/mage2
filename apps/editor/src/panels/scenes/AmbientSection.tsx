import { useState } from "react";
import { AmbientRegionSchema, resolveAmbientSchedule, resolveAssetVariant, validateSceneAmbient, type AmbientRegion, type AmbientSchedule, type ProjectBundle, type Scene, type SceneAmbient } from "@mage2/schema";
import { useEditorI18n } from "../../i18n";
import { ConditionListEditor } from "../../logic/RuleBuilder";
import "./AmbientSection.css";

export function AmbientSection({ project, scene, locale, mutateProject, preview, onPreviewChange }: {
  project: ProjectBundle; scene: Scene; locale: string; preview: boolean;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  onPreviewChange: (value: boolean) => void;
}) {
  const { t } = useEditorI18n();
  const [selectedId, setSelectedId] = useState<string>();
  const ambient = scene.ambient;
  const region = ambient?.regions.find((item) => item.id === selectedId) ?? ambient?.regions[0];
  const update = (mutator: (value: SceneAmbient, draft: ProjectBundle) => void) => mutateProject((draft) => {
    const target = draft.scenes.items.find((item) => item.id === scene.id)!;
    target.ambient ??= { enabled: true, regions: [] };
    mutator(target.ambient, draft);
  });
  const updateRegion = (mutator: (value: AmbientRegion, draft: ProjectBundle) => void) => update((value, draft) => {
    const target = value.regions.find((item) => item.id === region?.id);
    if (target) mutator(target, draft);
  });
  const assetSelect = (label: string, kind: "image" | "video", value: string | undefined, change: (id: string) => void) => <label>
    {t(label)}<select value={value ?? ""} onChange={(event) => change(event.target.value)}>
      <option value="">{t("None")}</option>
      {project.assets.assets.filter((asset) => asset.kind === kind).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
    </select>
  </label>;
  const addRegion = () => {
    const clip = project.assets.assets.find((asset) => asset.kind === "video");
    const variant = clip && resolveAssetVariant(clip, locale);
    const id = `ambient_${crypto.randomUUID()}`;
    const value = AmbientRegionSchema.parse({
      id, name: t("Ambient region"), x: 0.1, y: 0.1, width: 0.3, height: 0.3,
      sourceWidth: variant?.width ?? 320, sourceHeight: variant?.height ?? 180,
      registrationId: id, fallbackMode: "base", clips: clip ? [{ assetId: clip.id, registrationId: id }] : []
    });
    update((current) => current.regions.push(value));
    setSelectedId(id);
  };
  const issues = validateSceneAmbient(scene, project);
  return <details className="scenes-panel__details ambient-editor">
    <summary className="scenes-panel__details-summary"><span>{t("Ambient regions")}</span><span>{ambient?.regions.length ?? 0}</span></summary>
    <div className="scenes-panel__details-body">
      <p>{t("Keep a complete static background. Import aligned silent clips and neutral images in Assets, then assign them here.")}</p>
      <label><input type="checkbox" checked={preview} onChange={(event) => onPreviewChange(event.target.checked)} />{t("Preview ambient motion")}</label>
      <button type="button" onClick={addRegion}>{t("Add region")}</button>
      {ambient && <>
        <label><input type="checkbox" checked={ambient.enabled} onChange={(event) => update((value) => { value.enabled = event.target.checked; })} />{t("Enable ambient animation")}</label>
        <label>{t("Random seed (blank for random)")}<input type="number" min={0} max={4294967295} value={ambient.seed ?? ""} onChange={(event) => update((value) => { value.seed = event.target.value === "" ? undefined : Number(event.target.value); })} /></label>
        <ScheduleFields value={ambient.defaults} onChange={(schedule) => update((value) => { value.defaults = schedule; })} />
        <label>{t("Ambient region")}<select value={region?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
          {ambient.regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
      </>}
      {region && <>
        <div className="ambient-editor__grid">
          <label>{t("Name")}<input value={region.name} onChange={(event) => updateRegion((value) => { value.name = event.target.value; })} /></label>
          <label><input type="checkbox" checked={region.enabled} onChange={(event) => updateRegion((value) => { value.enabled = event.target.checked; })} />{t("Enable region")}</label>
          {(["x", "y", "width", "height", "opacity", "zIndex", "sourceWidth", "sourceHeight"] as const).map((key) => <label key={key}>
            {t(({ x: "X (0–1)", y: "Y (0–1)", width: "Width (0–1)", height: "Height (0–1)", opacity: "Opacity", zIndex: "Layer order", sourceWidth: "Source width (pixels)", sourceHeight: "Source height (pixels)" })[key])}
            <input type="number" step={["zIndex", "sourceWidth", "sourceHeight"].includes(key) ? 1 : 0.01} value={region[key]} onChange={(event) => updateRegion((value) => { value[key] = Number(event.target.value); })} />
          </label>)}
          <label>{t("Registration ID")}<input value={region.registrationId} onChange={(event) => updateRegion((value) => { value.registrationId = event.target.value; })} /></label>
          <label>{t("Neutral fallback")}<select value={region.fallbackMode} onChange={(event) => updateRegion((value) => { value.fallbackMode = event.target.value as "base" | "image"; })}>
            <option value="base">{t("Already in base image")}</option><option value="image">{t("Separate neutral image")}</option>
          </select></label>
          {region.fallbackMode === "image" && assetSelect("Fallback image", "image", region.fallbackAssetId, (id) => updateRegion((value) => { value.fallbackAssetId = id || undefined; }))}
          {assetSelect("Mask image (optional)", "image", region.mask.assetId, (id) => updateRegion((value) => { value.mask.assetId = id || undefined; }))}
          <label>{t("Mask channel")}<select value={region.mask.mode} onChange={(event) => updateRegion((value) => { value.mask.mode = event.target.value as "alpha" | "luminance"; })}><option value="alpha">{t("Alpha")}</option><option value="luminance">{t("Luminance")}</option></select></label>
          <label>{t("Edge feather (0–0.5)")}<input type="number" min={0} max={0.5} step={0.01} value={region.mask.feather} onChange={(event) => updateRegion((value) => { value.mask.feather = Number(event.target.value); })} /></label>
        </div>
        <ScheduleFields value={region.schedule} inherited={ambient?.defaults} onChange={(schedule) => updateRegion((value) => { value.schedule = schedule; })} />
        <ConditionListEditor compact project={project} label={t("Animate when")} conditions={region.conditions} mode={region.conditionMode} onChange={(conditions, conditionMode, variables) => updateRegion((value, draft) => {
          value.conditions = conditions; value.conditionMode = conditionMode;
          if (variables) draft.manifest.variables = variables;
        })} />
        <p>{t("All clips must share the registration ID, dimensions, and neutral first and last frames. Repeat 0 loops forever; blank scheduling fields inherit.")}</p>
        {region.clips.map((clip, index) => <fieldset key={index}>
          <legend>{t("Clip")} {index + 1}</legend>
          {assetSelect("Video clip", "video", clip.assetId, (id) => updateRegion((value) => { value.clips[index]!.assetId = id; }))}
          <div className="ambient-editor__grid">
            <label>{t("Weight")}<input type="number" min={0} step={0.1} value={clip.weight} onChange={(event) => updateRegion((value) => { value.clips[index]!.weight = Number(event.target.value); })} /></label>
            <label>{t("Registration ID")}<input value={clip.registrationId} onChange={(event) => updateRegion((value) => { value.clips[index]!.registrationId = event.target.value; })} /></label>
          </div>
          <ScheduleFields value={clip.schedule} inherited={resolveAmbientSchedule(ambient?.defaults, region.schedule)} onChange={(schedule) => updateRegion((value) => { value.clips[index]!.schedule = schedule; })} />
          <button type="button" onClick={() => updateRegion((value) => { value.clips.splice(index, 1); })}>{t("Remove clip")}</button>
        </fieldset>)}
        <div className="ambient-editor__grid">
          <button type="button" onClick={() => updateRegion((value) => { value.clips.push({ assetId: project.assets.assets.find((asset) => asset.kind === "video" && !value.clips.some((clip) => clip.assetId === asset.id))?.id ?? "", registrationId: value.registrationId, weight: 1 }); })}>{t("Add clip")}</button>
          <button type="button" onClick={() => update((value) => { value.regions = value.regions.filter((item) => item.id !== region.id); })}>{t("Remove region")}</button>
        </div>
      </>}
      {issues.map((issue, index) => <p key={index} role={issue.level === "error" ? "alert" : "status"}>{issue.message}</p>)}
    </div>
  </details>;
}

function ScheduleFields({ value, inherited, onChange }: { value?: AmbientSchedule; inherited?: AmbientSchedule; onChange: (value: AmbientSchedule) => void }) {
  const { t } = useEditorI18n();
  const defaults = resolveAmbientSchedule(inherited);
  return <div className="ambient-editor__grid">
    {(["minDelayMs", "maxDelayMs", "repeatCount"] as const).map((key) => <label key={key}>
      {t(({ minDelayMs: "Minimum delay (ms)", maxDelayMs: "Maximum delay (ms)", repeatCount: "Repeat count (0 = forever)" })[key])}
      <input type="number" min={0} step={1} value={value?.[key] ?? ""} placeholder={String(defaults[key])} onChange={(event) => {
        const updated = { ...value };
        if (event.target.value === "") delete updated[key]; else updated[key] = Number(event.target.value);
        onChange(updated);
      }} />
    </label>)}
  </div>;
}

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { resolveAssetVariant, type AmbientRegion, type ProjectBundle, type SceneAmbient } from "@mage2/schema";
import type { PlayerSourceResolver } from "./model";
import { createAmbientPlayback } from "./ambient-playback";

interface NeutralImage { path: string; url: string; width: number; height: number }
// Retain decoded neutral URLs across restore/re-entry, without retaining video
// elements or image bitmaps. The complete base covers the first network load.
const neutralImages = new Map<string, NeutralImage>();

export interface AmbientLayersProps {
  ambient?: SceneAmbient;
  assets: ProjectBundle["assets"]["assets"];
  locale: string;
  resolveSourcePath: PlayerSourceResolver;
  paused?: boolean;
  enabled?: boolean;
  reducedMotion?: boolean;
  activeRegionIds?: string[];
  resetKey?: string | number;
}

export function AmbientLayers(props: AmbientLayersProps) {
  const [systemMotion, setSystemMotion] = useState(() => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [entrySeed] = useState(() => Math.floor(Math.random() * 4294967296));
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setSystemMotion(query.matches);
    const visibility = () => setHidden(document.hidden);
    query.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      query.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const enabled = props.enabled !== false && props.ambient?.enabled !== false && !props.reducedMotion && !systemMotion;
  return <div className="mage2-ambient" aria-hidden="true">
    {props.ambient?.regions.map((region) => <AmbientLayer
      {...props}
      key={`${region.id}:${props.resetKey ?? ""}:${props.locale}:${JSON.stringify(region)}:${JSON.stringify(props.ambient?.defaults)}`}
      region={region}
      seed={props.ambient?.seed ?? entrySeed}
      enabled={enabled && region.enabled && (!props.activeRegionIds || props.activeRegionIds.includes(region.id))}
      paused={Boolean(props.paused || hidden)}
    />)}
  </div>;
}

function AmbientLayer({ region, ambient, assets, locale, resolveSourcePath, enabled, paused, seed }: AmbientLayersProps & { region: AmbientRegion; seed: number }) {
  const host = useRef<HTMLDivElement>(null);
  const playback = useRef<ReturnType<typeof createAmbientPlayback> | undefined>(undefined);
  const resolver = useRef(resolveSourcePath);
  resolver.current = resolveSourcePath;
  const assetSource = (id?: string) => {
    const asset = assets.find((entry) => entry.id === id);
    // Ambient registration uses original dimensions. Editor proxies may be resized.
    return asset ? resolveAssetVariant(asset, locale)?.sourcePath : undefined;
  };
  const fallbackPath = region.fallbackMode === "image" ? assetSource(region.fallbackAssetId) : undefined;
  const maskPath = assetSource(region.mask.assetId);
  const cached = (source?: string) => {
    const image = source ? neutralImages.get(source) : undefined;
    return image?.width === region.sourceWidth && image.height === region.sourceHeight ? image : undefined;
  };
  const [fallback, setFallback] = useState<NeutralImage | undefined>(() => cached(fallbackPath));
  const [mask, setMask] = useState<NeutralImage | undefined>(() => cached(maskPath));
  const [fallbackReady, setFallbackReady] = useState(() => Boolean(cached(fallbackPath)));
  const [maskReady, setMaskReady] = useState(() => Boolean(cached(maskPath)));
  useEffect(() => {
    let cancelled = false;
    setFallbackReady(Boolean(cached(fallbackPath)));
    setMaskReady(Boolean(cached(maskPath)));
    const load = async (source: string | undefined, setUrl: typeof setFallback, setReady: typeof setFallbackReady) => {
      if (!source) return;
      const existing = cached(source);
      if (existing) { setUrl(existing); setReady(true); return; }
      try {
        const url = await resolver.current(source);
        const image = new Image();
        image.src = url;
        await image.decode();
        if (image.naturalWidth !== region.sourceWidth || image.naturalHeight !== region.sourceHeight) return;
        const decoded = { path: source, url, width: image.naturalWidth, height: image.naturalHeight };
        neutralImages.set(source, decoded);
        if (neutralImages.size > 128) neutralImages.delete(neutralImages.keys().next().value!);
        if (!cancelled) { setUrl(decoded); setReady(true); }
      } catch { /* The complete base stays visible; a failed mask never hides the fallback. */ }
    };
    void load(fallbackPath, setFallback, setFallbackReady);
    void load(maskPath, setMask, setMaskReady);
    return () => { cancelled = true; };
  }, [fallbackPath, maskPath]);
  const canAnimate = enabled && (region.fallbackMode === "base" || (fallbackReady && fallback?.path === fallbackPath)) && (!region.mask.assetId || (maskReady && mask?.path === maskPath));
  const sourceSignature = JSON.stringify(region.clips.map((clip) => assetSource(clip.assetId)));
  useLayoutEffect(() => {
    if (!canAnimate || !host.current) return;
    playback.current = createAmbientPlayback(host.current, {
      region, defaults: ambient?.defaults, seed, paused: Boolean(paused),
      resolveClip: async (id) => { const source = assetSource(id); return source ? resolver.current(source) : undefined; }
    });
    return () => { playback.current?.dispose(); playback.current = undefined; };
  }, [canAnimate, sourceSignature, seed]);
  useLayoutEffect(() => { playback.current?.setPaused(Boolean(paused)); }, [paused]);
  const feather = region.mask.feather * 100;
  const gradients = feather > 0 ? [
    `linear-gradient(to right, transparent, black ${feather}%, black ${100 - feather}%, transparent)`,
    `linear-gradient(to bottom, transparent, black ${feather}%, black ${100 - feather}%, transparent)`
  ] : [];
  const loadedMask = maskReady && mask && mask.path === maskPath ? mask.url : undefined;
  if (loadedMask) gradients.push(`url(${JSON.stringify(loadedMask)})`);
  const style: CSSProperties = {
    left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%`,
    zIndex: region.zIndex, opacity: region.opacity,
    maskImage: gradients.length ? gradients.join(", ") : undefined,
    maskMode: [...(feather > 0 ? ["alpha", "alpha"] : []), ...(loadedMask ? [region.mask.mode] : [])].join(", "),
    maskSize: "100% 100%", maskRepeat: "no-repeat", maskComposite: "intersect"
  };
  return <div className="mage2-ambient__region" data-ambient-region={region.id} data-fallback-mode={region.fallbackMode} style={style}>
    {fallback && <img className="mage2-ambient__fallback" src={fallback.url} alt="" draggable={false} />}
    <div ref={host} className="mage2-ambient__playback" />
  </div>;
}

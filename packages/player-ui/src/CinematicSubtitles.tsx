import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { wrapCinematicSubtitle } from "@mage2/schema";

export function CinematicSubtitles({ text }: { text?: string }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const region = regionRef.current;
    const caption = captionRef.current;
    if (!region || !caption) return;
    const measure = () => setFit(Math.min(1, Math.max(0, region.clientWidth - 2) / Math.max(1, caption.offsetWidth)));
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    observer.observe(caption);
    measure();
    return () => observer.disconnect();
  }, [text]);
  return <div ref={regionRef} className="mage2-player__cinematic-subtitles" aria-live="polite"
    style={{ "--mage2-subtitle-fit": fit } as CSSProperties}>
    <p ref={captionRef}>{(text ? wrapCinematicSubtitle(text) : []).map((line, index) =>
      <span key={index} className="mage2-player__subtitle-line">{line}</span>
    )}</p>
  </div>;
}

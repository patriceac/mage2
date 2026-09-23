import { useCallback, useEffect, useRef } from "react";

/** A relaxed 120 words/minute, plus settling time and sentence pauses. */
export function narrationReadingTimeMs(text: string): number {
  const words = text.trim().match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  const ideographs = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
  const sentences = text.match(/[.!?…。！？]+/gu)?.length ?? 0;
  return Math.max(8000, 3000 + Math.max(words, ideographs / 2) * 500 + sentences * 600);
}

export function useNarrationAdvance(key: string, text: string, enabled: boolean, paused: boolean, onContinue: () => void) {
  const callback = useRef(onContinue);
  callback.current = onContinue;
  const state = useRef({ key, text, remaining: narrationReadingTimeMs(text), continued: false });
  if (state.current.key !== key || state.current.text !== text) {
    state.current = { key, text, remaining: narrationReadingTimeMs(text), continued: false };
  }
  const current = state.current;
  const advance = useCallback(() => {
    if (state.current !== current || current.continued) return;
    current.continued = true;
    callback.current();
  }, [current]);

  useEffect(() => {
    if (!enabled) {
      current.remaining = narrationReadingTimeMs(text);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let started = 0;
    const stop = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      current.remaining = Math.max(0, current.remaining - (performance.now() - started));
    };
    const sync = () => {
      stop();
      if (paused || document.hidden || !document.hasFocus() || current.continued) return;
      started = performance.now();
      timer = setTimeout(() => { timer = undefined; advance(); }, current.remaining);
    };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("blur", stop);
    window.addEventListener("focus", sync);
    sync();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("blur", stop);
      window.removeEventListener("focus", sync);
    };
  }, [advance, current, enabled, paused, text]);
  return advance;
}

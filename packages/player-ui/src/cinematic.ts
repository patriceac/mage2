import { useCallback, useEffect, useRef, useState } from "react";

/** One completion per entry, including a clip ending while the game is paused. */
export function useCinematicAdvance(key: string, enabled: boolean, paused: boolean, hasChoices: boolean, onContinue: () => void) {
  const state = useRef({ key, ended: false, continued: false });
  const [, refresh] = useState(0);
  if (state.current.key !== key) state.current = { key, ended: false, continued: false };
  const current = state.current;
  const complete = useCallback(() => {
    if (!enabled || state.current !== current || current.ended) return;
    current.ended = true;
    refresh((value) => value + 1);
  }, [current, enabled]);
  useEffect(() => {
    if (!enabled || paused || state.current !== current || !current.ended || current.continued) return;
    current.continued = true;
    if (!hasChoices) onContinue();
  }, [current, enabled, hasChoices, onContinue, paused, current.ended]);
  return { completed: current.ended, complete };
}

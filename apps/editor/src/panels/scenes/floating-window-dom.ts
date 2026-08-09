import { FLOATING_WINDOW_MARGIN_PX } from "../../floating-window";

export interface FloatingWindowSize {
  width: number;
  height: number;
}

export function getFloatingWindowSize(
  element: HTMLElement | null,
  fallbackSize: FloatingWindowSize
): FloatingWindowSize {
  if (!element) {
    return fallbackSize;
  }

  const bounds = element.getBoundingClientRect();
  return {
    width: bounds.width || fallbackSize.width,
    height: bounds.height || fallbackSize.height
  };
}

export function getViewportSize() {
  const titlebarBottom = document
    .querySelector<HTMLElement>(".titlebar-shell")
    ?.getBoundingClientRect().bottom ?? 0;
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    topInset: Math.max(FLOATING_WINDOW_MARGIN_PX, Math.ceil(titlebarBottom) + FLOATING_WINDOW_MARGIN_PX)
  };
}

export function shouldStartFloatingWindowDrag(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return !target.closest(
    "input, textarea, select, button, option, label, [contenteditable='true'], [role='button'], [role='textbox'], [data-floating-window-drag-ignore='true']"
  );
}

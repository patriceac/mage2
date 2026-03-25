export interface ShortcutEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function hasPrimaryModifier(event: ShortcutEventLike): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey;
}

export function isSaveShortcut(event: ShortcutEventLike): boolean {
  return hasPrimaryModifier(event) && !event.shiftKey && event.key.toLowerCase() === "s";
}

export function isUndoShortcut(event: ShortcutEventLike): boolean {
  return hasPrimaryModifier(event) && !event.shiftKey && event.key.toLowerCase() === "z";
}

export function isRedoShortcut(event: ShortcutEventLike): boolean {
  if (event.altKey) {
    return false;
  }

  const key = event.key.toLowerCase();
  return (
    (event.ctrlKey && !event.metaKey && !event.shiftKey && key === "y") ||
    (!event.ctrlKey && event.metaKey && event.shiftKey && key === "z")
  );
}

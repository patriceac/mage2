const EDITOR_WINDOW_TITLE = "MAGE2 Editor";

export function formatEditorWindowTitle(projectName?: string, hasUnsavedChanges = false): string {
  if (!projectName) {
    return EDITOR_WINDOW_TITLE;
  }

  return hasUnsavedChanges
    ? `${projectName} - ${EDITOR_WINDOW_TITLE} [Unsaved]`
    : `${projectName} - ${EDITOR_WINDOW_TITLE}`;
}

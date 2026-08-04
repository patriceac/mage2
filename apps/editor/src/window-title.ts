import { interpolateEditorMessage, type EditorTranslator } from "./i18n/translate";

const EDITOR_WINDOW_TITLE = "MAGE2 Editor";

export function formatEditorWindowTitle(projectName?: string, hasUnsavedChanges = false, t: EditorTranslator = interpolateEditorMessage): string {
  if (!projectName) {
    return t(EDITOR_WINDOW_TITLE);
  }

  return hasUnsavedChanges
    ? t("{projectName} - MAGE2 Editor [Unsaved]", { projectName })
    : t("{projectName} - MAGE2 Editor", { projectName });
}

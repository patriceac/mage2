import { describe, expect, it, vi } from "vitest";
import type { EditorCatalog } from "./catalog";
import { createEditorTranslator, interpolateEditorMessage } from "./translate";

const catalog: EditorCatalog = {
  "Open {name}": { en: "Open {name}", fr: "Ouvrir {name}" }
};

describe("editor message translation", () => {
  it("interpolates named string and number placeholders", () => {
    expect(interpolateEditorMessage("{count} items for {name}", { count: 3, name: "Pat" })).toBe("3 items for Pat");
  });

  it("preserves placeholders with no matching parameter", () => {
    expect(interpolateEditorMessage("Open {name}")).toBe("Open {name}");
  });

  it("translates registered English source keys", () => {
    expect(createEditorTranslator(catalog, "fr")("Open {name}", { name: "Projet" })).toBe("Ouvrir Projet");
  });

  it("falls back to interpolated English and diagnoses missing keys when enabled", () => {
    const onMissing = vi.fn();
    const t = createEditorTranslator(catalog, "ja", { diagnoseMissing: true, onMissing });
    expect(t("Open {name}", { name: "MAGE2" })).toBe("Open MAGE2");
    expect(onMissing).toHaveBeenCalledWith("Open {name}", "ja");
  });

  it("keeps production-style fallback silent when diagnostics are disabled", () => {
    const onMissing = vi.fn();
    expect(createEditorTranslator(catalog, "ko", { onMissing })("Unknown")).toBe("Unknown");
    expect(onMissing).not.toHaveBeenCalled();
  });

  it("matches completed dynamic English messages against named templates", () => {
    const translator = createEditorTranslator(
      {
        "Could not open {project}: {reason}": {
          en: "Could not open {project}: {reason}",
          fr: "Impossible d’ouvrir {project} : {reason}"
        }
      },
      "fr"
    );

    expect(translator("Could not open Beacon: access denied")).toBe("Impossible d’ouvrir Beacon : access denied");
  });
});

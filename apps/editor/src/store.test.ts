import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { useEditorStore } from "./store";

describe("useEditorStore locale state", () => {
  it("keeps localizationLocale and playtestLocale independent", () => {
    useEditorStore.setState({
      localizationLocale: "fr",
      playtestLocale: "en"
    });

    useEditorStore.getState().setPlaytestLocale("de");

    expect(useEditorStore.getState().localizationLocale).toBe("fr");
    expect(useEditorStore.getState().playtestLocale).toBe("de");

    useEditorStore.getState().setLocalizationLocale("it");

    expect(useEditorStore.getState().localizationLocale).toBe("it");
    expect(useEditorStore.getState().playtestLocale).toBe("de");
  });

  it("falls back invalid stored locales to the project default", () => {
    const project = createDefaultProjectBundle("Locale fallback");
    project.manifest.supportedLocales = ["fr"];

    useEditorStore.setState({
      localizationLocale: "ja",
      playtestLocale: "pt-BR",
      localizationSection: "media"
    });

    useEditorStore.getState().setProjectContext(project, "D:\\project");

    expect(useEditorStore.getState().localizationLocale).toBe("en");
    expect(useEditorStore.getState().playtestLocale).toBe("en");
    expect(useEditorStore.getState().localizationSection).toBe("overview");
  });
});

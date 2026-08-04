import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EDITOR_INTERFACE_LOCALE_STORAGE_KEY,
  getPreferredSystemLocales,
  hasExplicitEditorLocaleOverride,
  persistEditorLocalePreference,
  readEditorLocalePreference,
  resolveEditorLocalePreference,
  resolveEditorLocaleSelection,
  type EditorLocaleStorage
} from "./preference";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createStorage(initialValue: string | null = null): EditorLocaleStorage {
  let value = initialValue;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key, nextValue) => {
      value = nextValue;
    }),
    removeItem: vi.fn(() => {
      value = null;
    })
  };
}

describe("editor interface locale preferences", () => {
  it("gives an explicit preference precedence over system languages", () => {
    expect(resolveEditorLocalePreference("es", ["fr-FR"])).toBe("es");
    expect(resolveEditorLocalePreference("automatic", ["fr-FR"])).toBe("fr");
  });

  it("keeps the automatic language tied to the system while an override is active", () => {
    expect(resolveEditorLocaleSelection("es", ["fr-FR"])).toEqual({
      automaticLocale: "fr",
      locale: "es"
    });
  });

  it("uses Electron system languages authoritatively when the bridge is available", () => {
    vi.stubGlobal("navigator", { languages: ["es-ES"] });
    vi.stubGlobal("window", {
      editorApi: { getPreferredSystemLanguagesSync: () => ["fr-FR"] }
    });
    expect(getPreferredSystemLocales()).toEqual(["fr-FR"]);
  });

  it("falls back to renderer languages when the Electron bridge is unavailable", () => {
    vi.stubGlobal("navigator", { languages: ["ja-JP"] });
    vi.stubGlobal("window", {});
    expect(getPreferredSystemLocales()).toEqual(["ja-JP"]);
  });

  it("uses navigator.language when the browser languages list is empty", () => {
    vi.stubGlobal("navigator", { languages: [], language: "ko-KR" });
    vi.stubGlobal("window", {});
    expect(getPreferredSystemLocales()).toEqual(["ko-KR"]);
  });

  it("reads only canonical persisted preferences", () => {
    expect(readEditorLocalePreference(createStorage("zh-Hans"))).toBe("zh-Hans");
    expect(readEditorLocalePreference(createStorage("fr-CA"))).toBe("automatic");
    expect(readEditorLocalePreference(createStorage("unknown"))).toBe("automatic");
  });

  it("persists explicit preferences and clears automatic overrides", () => {
    const storage = createStorage();
    persistEditorLocalePreference(storage, "ar");
    expect(storage.setItem).toHaveBeenCalledWith(EDITOR_INTERFACE_LOCALE_STORAGE_KEY, "ar");
    expect(readEditorLocalePreference(storage)).toBe("ar");

    persistEditorLocalePreference(storage, "automatic");
    expect(storage.removeItem).toHaveBeenCalledWith(EDITOR_INTERFACE_LOCALE_STORAGE_KEY);
    expect(readEditorLocalePreference(storage)).toBe("automatic");
  });

  it("detects explicit overrides", () => {
    expect(hasExplicitEditorLocaleOverride("automatic")).toBe(false);
    expect(hasExplicitEditorLocaleOverride("en")).toBe(true);
  });

  it("fails safely when persistence is unavailable", () => {
    const storage: EditorLocaleStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      }
    };
    expect(readEditorLocalePreference(storage)).toBe("automatic");
    expect(() => persistEditorLocalePreference(storage, "fr")).not.toThrow();
  });
});

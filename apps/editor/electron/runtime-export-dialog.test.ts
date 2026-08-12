import { describe, expect, it } from "vitest";
import {
  parseRuntimeExportInterfaceLocale,
  resolveRuntimeExportDialogCopy
} from "./runtime-export-dialog";

describe("runtime export dialog localization", () => {
  it("uses fully French product-owned copy for Windows and web destinations", () => {
    expect(resolveRuntimeExportDialogCopy("windows", "Le Phare - aperçu", "fr")).toEqual({
      title: "Choisir où créer Le Phare - aperçu",
      buttonLabel: "Créer le dossier Windows"
    });
    expect(resolveRuntimeExportDialogCopy("web", "Le Phare - version", "fr")).toEqual({
      title: "Choisir où créer Le Phare - version",
      buttonLabel: "Choisir l’emplacement d’exportation"
    });
  });

  it("defaults legacy callers to English and rejects unsupported locales", () => {
    expect(parseRuntimeExportInterfaceLocale(undefined)).toBe("en");
    expect(() => parseRuntimeExportInterfaceLocale("pt-BR")).toThrow(/supported editor locale/u);
  });
});

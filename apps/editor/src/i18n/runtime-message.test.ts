import { describe, expect, it } from "vitest";
import { errorsMessages } from "./catalogs/errors";
import { dialogsMessages } from "./catalogs/dialogs";
import { translateRuntimeMessage } from "./runtime-message";
import { createEditorTranslator } from "./translate";

const errorCatalog = Object.fromEntries(
  Object.entries({ ...dialogsMessages, ...errorsMessages }).map(([source, translations]) => [
    source,
    { en: source, ...translations }
  ])
);
const fr = createEditorTranslator(errorCatalog, "fr");

describe("translateRuntimeMessage", () => {
  it("translates project-open failures through Electron wrappers without translating paths", () => {
    expect(
      translateRuntimeMessage(
        new Error(
          "Error invoking remote method 'project:load': Error: Project files were found, but they could not be loaded: Cannot use \"D:\\Games\\Été\" as a project directory because it is not a directory."
        ),
        fr
      )
    ).toBe(
      "Des fichiers de projet ont été trouvés, mais ils n’ont pas pu être chargés : Impossible d’utiliser « D:\\Games\\Été » comme dossier de projet, car il ne s’agit pas d’un dossier."
    );
  });

  it("translates save, export, and file-browser failures with named parameters", () => {
    expect(
      translateRuntimeMessage(
        "Project save failed and its automatic rollback could not complete. Recovery will be retried before the next project operation.",
        fr
      )
    ).toContain("L’enregistrement du projet a échoué");
    expect(
      translateRuntimeMessage(
        "Export cannot use project folder \"D:\\MAGE2\\demo\": path is not a normal directory: \"D:\\MAGE2\\demo\"",
        fr
      )
    ).toBe(
      "L’exportation ne peut pas utiliser le dossier de projet « D:\\MAGE2\\demo » : le chemin n’est pas un dossier normal : « D:\\MAGE2\\demo »"
    );
    expect(translateRuntimeMessage('"D:\\missing" is not a directory.', fr)).toBe(
      '« D:\\missing » n’est pas un dossier.'
    );
  });

  it("translates a representative schema validation message while preserving IDs", () => {
    expect(translateRuntimeMessage("Scene 'scene-authored-id' references missing asset 'asset-42'.", fr)).toBe(
      "La scène « scene-authored-id » référence la ressource manquante « asset-42 »."
    );
  });

  it("returns unknown messages unchanged", () => {
    expect(translateRuntimeMessage("Unknown plugin detail: /user/content", fr)).toBe(
      "Unknown plugin detail: /user/content"
    );
  });
});

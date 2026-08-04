import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import { EDITOR_CATALOG } from "../i18n/catalog";
import { inventoryMessages } from "../i18n/catalogs/inventory";
import { createEditorTranslator } from "../i18n/translate";
import { useEditorStore } from "../store";
import { InventoryPanel } from "./InventoryPanel";

const editorI18n = vi.hoisted(() => ({
  direction: "ltr" as "ltr" | "rtl",
  t: (source: string, params?: Readonly<Record<string, string | number>>) =>
    source.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) =>
      params && Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder
    )
}));

vi.mock("../i18n", () => ({
  useEditorI18n: () => ({ direction: editorI18n.direction, t: editorI18n.t })
}));

afterEach(() => {
  editorI18n.direction = "ltr";
  editorI18n.t = createEditorTranslator(EDITOR_CATALOG, "en");
});

function createInventoryProject() {
  const project = createDefaultProjectBundle("Inventory locale");
  const item = {
    id: "item_lantern",
    name: "Lantern",
    textId: "text.item_lantern.name",
    descriptionTextId: "text.item_lantern.description"
  };

  project.manifest.supportedLocales = ["fr"];
  project.inventory.items.push(item);
  project.strings.byLocale.en[item.textId] = "Lantern";
  project.strings.byLocale.en[item.descriptionTextId] = "Default description";
  project.strings.byLocale.fr = {
    [item.textId]: "Lanterne",
    [item.descriptionTextId]: "Description française"
  };

  useEditorStore.setState({
    activeTab: "inventory",
    localizationLocale: "fr",
    selectedInventoryItemId: item.id
  });

  return { item, project };
}

function renderInventoryPanel() {
  const { project } = createInventoryProject();
  return renderToStaticMarkup(
    React.createElement(
      DialogProvider,
      null,
      React.createElement(InventoryPanel, {
        project,
        mutateProject: () => {},
        setStatusMessage: () => {},
        setBusyLabel: () => {}
      })
    )
  );
}

describe("InventoryPanel locale behavior", () => {
  it("renders the default locale in the reference-style inventory workbench", () => {
    const markup = renderInventoryPanel();

    expect(markup).toContain('value="Lantern"');
    expect(markup).toContain("Default description");
    expect(markup).toContain("Inventory Image");
    expect(markup).toContain("Used in Scenes");
    expect(markup).toContain("Pickup hotspots");
    expect(markup).toContain("Placement targets");
    expect(markup).toContain("No image assigned");
    expect(markup).toContain('aria-label="Delete Lantern"');
    expect(markup).toContain("reference cleanup or rewiring options");
    expect(markup).not.toContain("asset-preview--intrinsic");
    expect(markup).not.toContain("Lanterne");
    expect(markup).not.toContain("Description française");
    expect(markup).not.toContain("Drag an image onto the preview to assign this item&#x27;s art.");
    expect(markup).not.toContain("Categories are reserved for a future inventory schema.");
    expect(markup).not.toContain("Stackable");
    expect(markup).not.toContain("Max Stack Size");
  });

  it("localizes editor chrome in French without translating authored content or IDs", () => {
    editorI18n.t = createEditorTranslator(EDITOR_CATALOG, "fr");

    const markup = renderInventoryPanel();

    expect(markup).toContain(">Inventaire<");
    expect(markup).toContain('placeholder="Rechercher des objets"');
    expect(markup).toContain('aria-label="Supprimer Lantern"');
    expect(markup).toContain("Image d’inventaire");
    expect(markup).toContain('value="Lantern"');
    expect(markup).toContain('value="item_lantern"');
    expect(markup).toContain("Default description");
    expect(markup).not.toContain("Lanterne");
  });

  it("renders Arabic editor chrome right-to-left while preserving authored values", () => {
    editorI18n.direction = "rtl";
    editorI18n.t = createEditorTranslator(EDITOR_CATALOG, "ar");

    const markup = renderInventoryPanel();

    expect(markup).toContain('class="inventory-workbench" aria-label="المخزون" dir="rtl"');
    expect(markup).toContain('placeholder="البحث في العناصر"');
    expect(markup).toContain('aria-label="حذف Lantern"');
    expect(markup).toContain('value="Lantern"');
    expect(markup).toContain('value="item_lantern"');
    expect(markup).toContain("Default description");
  });

  it("keeps every inventory translation placeholder identical to its English source", () => {
    const placeholders = (message: string) =>
      [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();

    for (const [source, translations] of Object.entries(inventoryMessages)) {
      for (const [locale, translation] of Object.entries(translations)) {
        expect(placeholders(translation), `${locale} placeholders for ${source}`).toEqual(placeholders(source));
      }
    }
  });
});

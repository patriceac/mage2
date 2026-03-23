import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";
import { DialogProvider } from "../dialogs";
import { useEditorStore } from "../store";
import { InventoryPanel } from "./InventoryPanel";

describe("InventoryPanel locale behavior", () => {
  it("always renders the default locale even when Localization is pointed elsewhere", () => {
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
      [item.descriptionTextId]: "Description francaise"
    };

    useEditorStore.setState({
      activeTab: "inventory",
      localizationLocale: "fr",
      selectedInventoryItemId: item.id
    });

    const markup = renderToStaticMarkup(
      React.createElement(
        DialogProvider,
        null,
        React.createElement(InventoryPanel, {
          project,
          mutateProject: () => {},
          setSavedProject: () => {},
          setStatusMessage: () => {},
          setBusyLabel: () => {}
        })
      )
    );

    expect(markup).toContain('value="Lantern"');
    expect(markup).toContain("Default description");
    expect(markup).toContain("Drag an image onto the preview to assign this item&#x27;s art.");
    expect(markup).toContain("asset-preview--square");
    expect(markup).not.toContain("Lanterne");
    expect(markup).not.toContain("Description francaise");
  });
});

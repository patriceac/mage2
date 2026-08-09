import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scenesPanelSource = readFileSync(new URL("./panels/ScenesPanel.tsx", import.meta.url), "utf8");
const inventoryPanelSource = readFileSync(new URL("./panels/InventoryPanel.tsx", import.meta.url), "utf8");
const localizationPanelSource = readFileSync(new URL("./panels/LocalizationPanel.tsx", import.meta.url), "utf8");

function extractFunctionBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error(`Missing source marker: ${marker}`);
  }

  const blockStart = source.indexOf("{", start);
  if (blockStart < 0) {
    throw new Error(`Missing function body for source marker: ${marker}`);
  }

  let depth = 0;
  for (let index = blockStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Unclosed function body for source marker: ${marker}`);
}

describe("media import dirty state", () => {
  it("marks media imports dirty instead of saving the project immediately", () => {
    const importBlocks = [
      extractFunctionBlock(scenesPanelSource, "async function importBackgroundFromFilePath"),
      extractFunctionBlock(scenesPanelSource, "async function importSceneAudioFromFilePath"),
      extractFunctionBlock(inventoryPanelSource, "async function importInventoryImageFromFilePath"),
      extractFunctionBlock(localizationPanelSource, "async function handleImportVariant")
    ];

    for (const block of importBlocks) {
      expect(block).toContain("mutateProject((draft)");
      expect(block).toContain("Save the project to keep this change.");
      expect(block).not.toContain("saveProject");
      expect(block).not.toContain("setSavedProject");
    }
  });

  it("assigns duplicate media picks to the existing asset in assignment flows", () => {
    const backgroundImportBlock = extractFunctionBlock(scenesPanelSource, "async function importBackgroundFromFilePath");
    const sceneAudioImportBlock = extractFunctionBlock(scenesPanelSource, "async function importSceneAudioFromFilePath");
    const inventoryImportBlock = extractFunctionBlock(
      inventoryPanelSource,
      "async function importInventoryImageFromFilePath"
    );

    expect(backgroundImportBlock).toContain("applySceneBackgroundAsset(");
    expect(backgroundImportBlock).toContain("duplicateAsset.id");
    expect(backgroundImportBlock).toContain("duplicateAsset.kind");
    expect(backgroundImportBlock).toContain("Assigned existing");
    expect(sceneAudioImportBlock).toContain("sceneAudioAssetId = duplicateAsset.id");
    expect(sceneAudioImportBlock).toContain("Assigned existing");
    expect(inventoryImportBlock).toContain("imageAssetId = duplicateAsset.id");
    expect(inventoryImportBlock).toContain("Assigned existing");
  });
});

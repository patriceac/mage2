import type { Asset, ProjectBundle } from "@mage2/schema";
import { addAssetRoots } from "../project-helpers";
import { useEditorStore } from "../store";

interface AssetsPanelProps {
  project: ProjectBundle;
  mutateProject: (mutator: (draft: ProjectBundle) => void) => void;
  setStatusMessage: (message: string) => void;
  setBusyLabel: (label?: string) => void;
}

export function AssetsPanel({
  project,
  mutateProject,
  setStatusMessage,
  setBusyLabel
}: AssetsPanelProps) {
  const selectedSceneId = useEditorStore((state) => state.selectedSceneId);
  const currentScene = project.scenes.items.find((entry) => entry.id === selectedSceneId) ?? project.scenes.items[0];

  async function handleImportAssets() {
    const filePaths = await window.editorApi.pickAssets();
    if (filePaths.length === 0) {
      return;
    }

    try {
      setBusyLabel("Importing assets");
      const importedAssets = await window.editorApi.importAssets(filePaths);
      mutateProject((draft) => {
        addAssetRoots(draft, importedAssets);
        draft.assets.assets.push(...importedAssets);

        if (draft.scenes.items.length > 0 && draft.scenes.items[0].backgroundAssetId === "asset_placeholder") {
          draft.scenes.items[0].backgroundAssetId = importedAssets[0].id;
        }
      });
      setStatusMessage(`Imported ${filePaths.length} asset(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Import failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  async function handleGenerateProxies(assetId?: string) {
    const projectDir = useEditorStore.getState().projectDir;
    if (!projectDir) {
      return;
    }

    const assets = assetId
      ? project.assets.assets.filter((entry) => entry.id === assetId)
      : project.assets.assets.filter((entry) => !entry.proxyPath);
    if (assets.length === 0) {
      setStatusMessage("No assets require proxy generation.");
      return;
    }

    try {
      setBusyLabel("Generating proxies");
      const updatedAssets: Asset[] = [];
      for (const asset of assets) {
        updatedAssets.push(await window.editorApi.generateProxy(projectDir, asset));
      }
      mutateProject((draft) => {
        for (const updatedAsset of updatedAssets) {
          const index = draft.assets.assets.findIndex((entry) => entry.id === updatedAsset.id);
          if (index >= 0) {
            draft.assets.assets[index] = updatedAsset;
          }
        }
      });
      setStatusMessage(`Generated ${updatedAssets.length} prox${updatedAssets.length === 1 ? "y" : "ies"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Proxy generation failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  return (
    <div className="panel-grid panel-grid--assets">
      <section className="panel">
        <div className="panel__toolbar">
          <h3>Imported Media</h3>
          <div>
            <button
              type="button"
              onClick={handleImportAssets}
              title="Import source media files into the project and register them in the asset library."
            >
              Add Files
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateProxies()}
              title="Create lightweight proxy files for every asset that does not already have one."
            >
              Generate Missing Proxies
            </button>
          </div>
        </div>

        <div className="list-stack">
          {project.assets.assets.map((asset) => (
            <article key={asset.id} className="list-card">
              <div>
                <h4>{asset.name}</h4>
                <p>
                  {asset.kind} · {asset.durationMs ? `${Math.round(asset.durationMs / 100) / 10}s` : "still"}
                </p>
                <p className="muted">{asset.proxyPath ? "Proxy ready" : "Proxy missing"}</p>
              </div>
              <div className="list-card__actions">
                {currentScene ? (
                  <button
                    type="button"
                    title={`Assign ${asset.name} as the background asset for the currently selected scene.`}
                    onClick={() =>
                      mutateProject((draft) => {
                        const scene = draft.scenes.items.find((entry) => entry.id === currentScene.id);
                        if (scene) {
                          scene.backgroundAssetId = asset.id;
                        }
                      })
                    }
                  >
                    Use in Scene
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleGenerateProxies(asset.id)}
                  title={`Generate or regenerate the proxy file used to preview ${asset.name} inside the editor.`}
                >
                  Proxy
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="panel">
        <h3>Asset Roots</h3>
        <ul className="simple-list">
          {project.manifest.assetRoots.map((assetRoot) => (
            <li key={assetRoot}>{assetRoot}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { Asset, ProjectBundle } from "@mage2/schema";
import { addAssetRoots, cloneProject } from "../project-helpers";
import { useEditorStore } from "../store";

interface AssetsPanelProps {
  project: ProjectBundle;
  replaceProject: (project: ProjectBundle) => void;
  setStatusMessage: (message: string) => void;
  setBusyLabel: (label?: string) => void;
}

export function AssetsPanel({
  project,
  replaceProject,
  setStatusMessage,
  setBusyLabel
}: AssetsPanelProps) {
  const assetsMissingProxy = project.assets.assets.filter((entry) => !entry.proxyPath);

  async function handleImportAssets() {
    const filePaths = await window.editorApi.pickAssets();
    if (filePaths.length === 0) {
      return;
    }

    try {
      setBusyLabel("Importing assets");
      const importedAssets = await window.editorApi.importAssets(filePaths);

      const projectDir = useEditorStore.getState().projectDir;
      if (!projectDir) {
        throw new Error("No project directory is currently open.");
      }

      const nextProject = cloneProject(project);
      addAssetRoots(nextProject, importedAssets);
      nextProject.assets.assets.push(...importedAssets);

      if (
        nextProject.scenes.items.length > 0 &&
        nextProject.scenes.items[0].backgroundAssetId === "asset_placeholder"
      ) {
        nextProject.scenes.items[0].backgroundAssetId = importedAssets[0].id;
      }

      const result = await window.editorApi.saveProject(projectDir, nextProject);
      replaceProject(result.project);
      setStatusMessage(
        result.validationReport.valid
          ? `Imported ${filePaths.length} asset(s).`
          : `Imported ${filePaths.length} asset(s) and saved with ${result.validationReport.issues.length} validation issue(s).`
      );
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
      ? project.assets.assets.filter((entry) => entry.id === assetId && !entry.proxyPath)
      : assetsMissingProxy;
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

      const nextProject = cloneProject(project);
      for (const updatedAsset of updatedAssets) {
        const index = nextProject.assets.assets.findIndex((entry) => entry.id === updatedAsset.id);
        if (index >= 0) {
          nextProject.assets.assets[index] = updatedAsset;
        }
      }

      const result = await window.editorApi.saveProject(projectDir, nextProject);
      replaceProject(result.project);
      setStatusMessage(
        result.validationReport.valid
          ? `Generated ${updatedAssets.length} prox${updatedAssets.length === 1 ? "y" : "ies"}.`
          : `Generated ${updatedAssets.length} prox${updatedAssets.length === 1 ? "y" : "ies"} and saved with ${
              result.validationReport.issues.length
            } validation issue(s).`
      );
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
              disabled={assetsMissingProxy.length === 0}
              title={
                assetsMissingProxy.length === 0
                  ? "Every imported asset already has a proxy file."
                  : "Create lightweight proxy files for every asset that does not already have one."
              }
            >
              Generate All Missing Proxies
            </button>
          </div>
        </div>

        <div className="list-stack">
          {project.assets.assets.map((asset) => (
            <article key={asset.id} className="list-card list-card--asset">
              <AssetPreview asset={asset} />

              <div className="asset-card__body">
                <div>
                  <h4>{asset.name}</h4>
                  <p>
                    {asset.kind} · {asset.durationMs ? `${Math.round(asset.durationMs / 100) / 10}s` : "still"}
                    {asset.width && asset.height ? ` · ${asset.width}x${asset.height}` : ""}
                  </p>
                  <p className="muted">{asset.proxyPath ? "Proxy ready" : "Proxy missing"}</p>
                </div>

                <div className="list-card__actions">
                  <button
                    type="button"
                    onClick={() => void handleGenerateProxies(asset.id)}
                    disabled={Boolean(asset.proxyPath)}
                    title={
                      asset.proxyPath
                        ? `${asset.name} already has a proxy file.`
                        : `Generate the proxy file used to preview ${asset.name} inside the editor.`
                    }
                  >
                    Generate Proxy
                  </button>
                </div>
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

function AssetPreview({ asset }: { asset: Asset }) {
  const [assetUrl, setAssetUrl] = useState<string>();
  const [posterUrl, setPosterUrl] = useState<string>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadPreviewUrls() {
      if (!asset.proxyPath) {
        setAssetUrl(undefined);
        setPosterUrl(undefined);
        setLoadState("ready");
        return;
      }

      if (asset.kind === "subtitle") {
        setAssetUrl(undefined);
        setPosterUrl(undefined);
        setLoadState("ready");
        return;
      }

      setLoadState("loading");

      try {
        const sourcePath = asset.proxyPath;
        const nextAssetUrl = await window.editorApi.pathToFileUrl(sourcePath);
        const nextPosterUrl =
          asset.posterPath && asset.posterPath !== sourcePath
            ? await window.editorApi.pathToFileUrl(asset.posterPath)
            : undefined;

        if (!cancelled) {
          setAssetUrl(nextAssetUrl);
          setPosterUrl(nextPosterUrl);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) {
          setAssetUrl(undefined);
          setPosterUrl(undefined);
          setLoadState("error");
        }
      }
    }

    void loadPreviewUrls();
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.kind, asset.sourcePath, asset.proxyPath, asset.posterPath]);

  if (loadState === "error") {
    return (
      <div className="asset-preview asset-preview--placeholder" title={`Preview unavailable for ${asset.name}.`}>
        <strong>Preview unavailable</strong>
        <span>{asset.name}</span>
      </div>
    );
  }

  if (!asset.proxyPath) {
    return (
      <div className="asset-preview asset-preview--placeholder" title={`Generate a proxy to preview ${asset.name}.`}>
        <strong>Proxy required</strong>
        <span>Generate a proxy to preview this asset.</span>
      </div>
    );
  }

  if (asset.kind === "image" && assetUrl) {
    return <img src={assetUrl} alt={asset.name} className="asset-preview asset-preview__media" title={`Preview ${asset.name}.`} />;
  }

  if (asset.kind === "video" && assetUrl) {
    return (
      <video
        src={assetUrl}
        poster={posterUrl}
        controls
        muted
        preload="metadata"
        className="asset-preview asset-preview__media"
        title={`Preview ${asset.name}.`}
      />
    );
  }

  if (asset.kind === "audio" && assetUrl) {
    return (
      <div className="asset-preview asset-preview--audio" title={`Preview ${asset.name}.`}>
        <strong>Audio Preview</strong>
        <span>{asset.name}</span>
        <audio controls preload="metadata" src={assetUrl} className="asset-preview__audio-player" />
      </div>
    );
  }

  if (asset.kind === "subtitle") {
    return (
      <div className="asset-preview asset-preview--placeholder" title={`Subtitle asset ${asset.name}.`}>
        <strong>Subtitle File</strong>
        <span>{asset.name}</span>
      </div>
    );
  }

  return (
    <div className="asset-preview asset-preview--placeholder" title={`Loading preview for ${asset.name}.`}>
      <strong>Loading preview...</strong>
      <span>{asset.name}</span>
    </div>
  );
}

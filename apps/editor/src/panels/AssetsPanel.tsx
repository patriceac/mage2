import { useEffect, useRef, useState } from "react";
import type { Asset, ProjectBundle } from "@mage2/schema";
import { classifyImportAssetPaths } from "../asset-file-types";
import {
  addAssetRoots,
  cloneProject,
  collectAssetReferenceSummary,
  countAssetReferences,
  removeAssetFromProject,
  type AssetReferenceSummary
} from "../project-helpers";
import { useEditorStore } from "../store";

interface AssetsPanelProps {
  project: ProjectBundle;
  setSavedProject: (project: ProjectBundle) => void;
  setStatusMessage: (message: string) => void;
  setBusyLabel: (label?: string) => void;
}

const EMPTY_ASSET_REFERENCE_SUMMARY: AssetReferenceSummary = {
  sceneBackgrounds: [],
  clipSegments: [],
  subtitleTracks: []
};

export function AssetsPanel({
  project,
  setSavedProject,
  setStatusMessage,
  setBusyLabel
}: AssetsPanelProps) {
  const assetsMissingProxy = project.assets.assets.filter((entry) => !entry.proxyPath);
  const existingSourcePaths = project.assets.assets.map((entry) => entry.sourcePath);
  const assetReferenceSummaries = new Map(
    project.assets.assets.map((asset) => [asset.id, collectAssetReferenceSummary(project, asset.id)])
  );
  const dragDepthRef = useRef(0);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);

  async function importAssetPaths(filePaths: string[]) {
    const { importFilePaths, rejectedFilePaths, duplicateFilePaths } = classifyImportAssetPaths(
      filePaths,
      existingSourcePaths
    );
    if (importFilePaths.length === 0) {
      setStatusMessage(resolveNoNewImportsMessage(duplicateFilePaths.length, rejectedFilePaths.length));
      return;
    }

    try {
      setBusyLabel("Importing assets");
      const importedAssets = await window.editorApi.importAssets(importFilePaths);

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
      const skippedSummary = resolveImportSkippedSummary(duplicateFilePaths.length, rejectedFilePaths.length);
      setSavedProject(result.project);
      setStatusMessage(
        result.validationReport.valid
          ? `Imported ${importedAssets.length} asset(s).${skippedSummary}`
          : `Imported ${importedAssets.length} asset(s), saved with ${result.validationReport.issues.length} validation issue(s).${skippedSummary}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Import failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  async function handleImportAssets() {
    const filePaths = await window.editorApi.pickAssets();
    if (filePaths.length === 0) {
      return;
    }

    await importAssetPaths(filePaths);
  }

  async function handleDeleteAsset(asset: Asset) {
    const projectDir = useEditorStore.getState().projectDir;
    if (!projectDir) {
      setStatusMessage("No project directory is currently open.");
      return;
    }

    const referenceSummary = assetReferenceSummaries.get(asset.id) ?? EMPTY_ASSET_REFERENCE_SUMMARY;
    const fallbackAsset =
      project.assets.assets.find((entry) => entry.id !== asset.id && entry.id !== "asset_placeholder") ??
      project.assets.assets.find((entry) => entry.id !== asset.id);

    if (referenceSummary.sceneBackgrounds.length > 0 && !fallbackAsset) {
      setStatusMessage(
        `Cannot delete ${asset.name} because it is still used as a scene background and there is no replacement asset available.`
      );
      return;
    }

    const confirmed = window.confirm(
      buildDeleteAssetConfirmationMessage(asset.name, referenceSummary, fallbackAsset?.name)
    );
    if (!confirmed) {
      return;
    }

    try {
      setBusyLabel("Deleting asset");
      const nextProject = cloneProject(project);
      const deletion = removeAssetFromProject(nextProject, asset.id);
      if (!deletion.deleted) {
        setStatusMessage(resolveDeleteBlockedMessage(asset.name, deletion));
        return;
      }

      const result = await window.editorApi.saveProject(projectDir, nextProject);
      setSavedProject(result.project);
      setStatusMessage(
        resolveDeleteStatusMessage(
          asset.name,
          deletion,
          fallbackAsset?.name,
          result.validationReport.valid,
          result.validationReport.issues.length
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Delete failed: ${message}`);
    } finally {
      setBusyLabel(undefined);
    }
  }

  function resetDropTarget() {
    dragDepthRef.current = 0;
    setIsDropTargetActive(false);
  }

  function isFileTransfer(event: React.DragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleDropTargetDragEnter(event: React.DragEvent<HTMLButtonElement>) {
    if (!isFileTransfer(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDropTargetActive(true);
  }

  function handleDropTargetDragOver(event: React.DragEvent<HTMLButtonElement>) {
    if (!isFileTransfer(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (!isDropTargetActive) {
      setIsDropTargetActive(true);
    }
  }

  function handleDropTargetDragLeave(event: React.DragEvent<HTMLButtonElement>) {
    if (!isFileTransfer(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDropTargetActive(false);
    }
  }

  async function handleDroppedAssets(event: React.DragEvent<HTMLButtonElement>) {
    if (!isFileTransfer(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    resetDropTarget();

    const filePaths = Array.from(event.dataTransfer.files)
      .map((file) => {
        try {
          return window.editorApi.getPathForDroppedFile(file);
        } catch {
          return "";
        }
      })
      .filter(Boolean);

    if (filePaths.length === 0) {
      setStatusMessage("The drop did not include any readable files.");
      return;
    }

    await importAssetPaths(filePaths);
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
      setSavedProject(result.project);
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
      <section className="panel assets-panel">
        <div className="panel__toolbar">
          <h3>Imported Media</h3>
          <div className="stack-inline">
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
          <button
            type="button"
            className={isDropTargetActive ? "asset-dropzone asset-dropzone--active" : "asset-dropzone"}
            onClick={() => void handleImportAssets()}
            onDragEnter={handleDropTargetDragEnter}
            onDragOver={handleDropTargetDragOver}
            onDragLeave={handleDropTargetDragLeave}
            onDrop={(event) => void handleDroppedAssets(event)}
            title="Drag supported media files here to import them, or click to browse."
          >
            <strong>{isDropTargetActive ? "Drop files to import them" : "Drag media here or click to browse"}</strong>
            <span>Supports video, image, audio, and subtitle files and adds them to the project asset library.</span>
          </button>

          {project.assets.assets.map((asset) => {
            const referenceSummary = assetReferenceSummaries.get(asset.id) ?? EMPTY_ASSET_REFERENCE_SUMMARY;

            return (
              <article key={asset.id} className="list-card list-card--asset">
                <AssetPreview asset={asset} />

                <div className="asset-card__body">
                  <div>
                    <h4>{asset.name}</h4>
                    <p>
                      {asset.kind}
                      {asset.durationMs ? ` / ${Math.round(asset.durationMs / 100) / 10}s` : " / still"}
                      {asset.width && asset.height ? ` / ${asset.width}x${asset.height}` : ""}
                    </p>
                    <p className="muted">{asset.proxyPath ? "Proxy ready" : "Proxy missing"}</p>
                    <p className="muted">{formatAssetUsageSummary(referenceSummary)}</p>
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
                    <button
                      type="button"
                      className="button-danger"
                      onClick={() => void handleDeleteAsset(asset)}
                      title={
                        countAssetReferences(referenceSummary) > 0
                          ? `Delete ${asset.name} from the project and review its current usages before removal.`
                          : `Delete ${asset.name} from the project library.`
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
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

function resolveNoNewImportsMessage(duplicateCount: number, rejectedCount: number): string {
  const skippedSummary = resolveImportSkippedSummary(duplicateCount, rejectedCount);
  return skippedSummary ? `No new assets were imported.${skippedSummary}` : "No new assets were imported.";
}

function resolveImportSkippedSummary(duplicateCount: number, rejectedCount: number): string {
  const segments: string[] = [];

  if (duplicateCount > 0) {
    segments.push(`Skipped ${duplicateCount} already imported file(s).`);
  }

  if (rejectedCount > 0) {
    segments.push(`Skipped ${rejectedCount} unsupported file(s).`);
  }

  return segments.length > 0 ? ` ${segments.join(" ")}` : "";
}

function formatAssetUsageSummary(summary: AssetReferenceSummary): string {
  const segments: string[] = [];

  if (summary.sceneBackgrounds.length > 0) {
    segments.push(`${summary.sceneBackgrounds.length} scene background${summary.sceneBackgrounds.length === 1 ? "" : "s"}`);
  }

  if (summary.clipSegments.length > 0) {
    segments.push(`${summary.clipSegments.length} clip segment${summary.clipSegments.length === 1 ? "" : "s"}`);
  }

  if (summary.subtitleTracks.length > 0) {
    segments.push(`${summary.subtitleTracks.length} subtitle track${summary.subtitleTracks.length === 1 ? "" : "s"}`);
  }

  return segments.length > 0 ? `In use by ${joinList(segments)}.` : "Not currently in use.";
}

function buildDeleteAssetConfirmationMessage(
  assetName: string,
  summary: AssetReferenceSummary,
  fallbackAssetName?: string
): string {
  const sections = [`Delete "${assetName}" from the project library?`];

  if (countAssetReferences(summary) === 0) {
    sections.push("This only removes the asset from MAGE2. The source file on disk will not be deleted.");
    return sections.join("\n\n");
  }

  const usageLines: string[] = [];
  if (summary.sceneBackgrounds.length > 0) {
    usageLines.push(
      `Scene background${summary.sceneBackgrounds.length === 1 ? "" : "s"}: ${summary.sceneBackgrounds
        .map((entry) => entry.sceneName)
        .join(", ")}`
    );
  }
  if (summary.clipSegments.length > 0) {
    usageLines.push(
      `Clip segment${summary.clipSegments.length === 1 ? "" : "s"}: ${summary.clipSegments
        .map((entry) => `${entry.sceneName} / ${entry.segmentName}`)
        .join(", ")}`
    );
  }
  if (summary.subtitleTracks.length > 0) {
    usageLines.push(
      `Subtitle track${summary.subtitleTracks.length === 1 ? "" : "s"}: ${summary.subtitleTracks
        .map((entry) =>
          entry.sceneNames.length > 0 ? `${entry.sceneNames.join(", ")} / ${entry.trackId}` : entry.trackId
        )
        .join(", ")}`
    );
  }

  sections.push(`This asset is currently in use by:\n- ${usageLines.join("\n- ")}`);

  const consequences: string[] = [];
  if (summary.sceneBackgrounds.length > 0 && fallbackAssetName) {
    consequences.push(`Affected scene backgrounds will switch to "${fallbackAssetName}".`);
  }
  if (summary.clipSegments.length > 0) {
    consequences.push(
      `${summary.clipSegments.length} clip segment${summary.clipSegments.length === 1 ? "" : "s"} will be removed.`
    );
  }
  if (summary.subtitleTracks.length > 0) {
    consequences.push(
      `${summary.subtitleTracks.length} subtitle track${summary.subtitleTracks.length === 1 ? "" : "s"} will be removed.`
    );
  }
  consequences.push("The source file on disk will not be deleted.");

  sections.push(consequences.join("\n"));
  return sections.join("\n\n");
}

function resolveDeleteBlockedMessage(
  assetName: string,
  deletion: ReturnType<typeof removeAssetFromProject>
): string {
  if (deletion.blockedReason === "background-in-use-without-replacement") {
    return `Cannot delete ${assetName} because it is still used as a scene background and there is no replacement asset available.`;
  }

  return `${assetName} could not be deleted because it is no longer present in the project.`;
}

function resolveDeleteStatusMessage(
  assetName: string,
  deletion: ReturnType<typeof removeAssetFromProject>,
  fallbackAssetName: string | undefined,
  valid: boolean,
  issueCount: number
): string {
  const segments = [`Deleted ${assetName}.`];

  if (deletion.referenceSummary.sceneBackgrounds.length > 0 && fallbackAssetName) {
    segments.push(
      `Reassigned ${deletion.referenceSummary.sceneBackgrounds.length} scene background${
        deletion.referenceSummary.sceneBackgrounds.length === 1 ? "" : "s"
      } to ${fallbackAssetName}.`
    );
  }

  if (deletion.removedSegmentIds.length > 0) {
    segments.push(
      `Removed ${deletion.removedSegmentIds.length} clip segment${deletion.removedSegmentIds.length === 1 ? "" : "s"}.`
    );
  }

  if (deletion.removedSubtitleTrackIds.length > 0) {
    segments.push(
      `Removed ${deletion.removedSubtitleTrackIds.length} subtitle track${
        deletion.removedSubtitleTrackIds.length === 1 ? "" : "s"
      }.`
    );
  }

  if (!valid) {
    segments.push(`Saved with ${issueCount} validation issue(s).`);
  }

  return segments.join(" ");
}

function joinList(values: string[]): string {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
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
    return (
      <img
        src={assetUrl}
        alt={asset.name}
        className="asset-preview asset-preview__media"
        title={`Preview ${asset.name}.`}
      />
    );
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

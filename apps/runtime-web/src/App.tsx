import { useEffect, useRef, useState } from "react";
import { createPlayerController } from "@mage2/player";
import {
  createInitialSaveState,
  parseSaveState,
  resolveHotspotBounds,
  resolveHotspotClipPath,
  type BuildManifest,
  type ExportProjectData,
  type Hotspot,
  parseBuildManifest
} from "@mage2/schema";

interface RuntimeAsset {
  id: string;
  kind: "video" | "image" | "audio";
  name: string;
  sourcePath: string;
  durationMs?: number;
}

export function resolveRuntimeHeaderContent(content: Pick<ExportProjectData, "manifest">): {
  projectName: string;
} {
  return {
    projectName: content.manifest.projectName
  };
}

export function App() {
  const [buildManifest, setBuildManifest] = useState<BuildManifest>();
  const [content, setContent] = useState<ExportProjectData>();
  const [controller, setController] = useState<ReturnType<typeof createPlayerController>>();
  const [playheadMs, setPlayheadMs] = useState(0);
  const [showHotspots, setShowHotspots] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [snapshot, setSnapshot] = useState(() => controller?.getSnapshot());
  const runtimeVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function loadBuild() {
      try {
        const manifestResponse = await fetch("./build-manifest.json");
        if (!manifestResponse.ok) {
          throw new Error("build-manifest.json not found. Export a project and open the generated folder.");
        }

        const manifest = parseBuildManifest(await manifestResponse.json());
        const contentResponse = await fetch(`./${manifest.contentPath}`);
        const parsedContent = (await contentResponse.json()) as ExportProjectData;

        const storageKey = `mage2-runtime-save:${manifest.projectId}`;
        const storedSave = localStorage.getItem(storageKey);
        const loadedProject = {
          manifest: parsedContent.manifest,
          assets: { schemaVersion: parsedContent.schemaVersion, assets: parsedContent.assets },
          locations: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.locations },
          scenes: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.scenes },
          dialogues: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.dialogues },
          inventory: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.inventoryItems },
          strings: { schemaVersion: parsedContent.schemaVersion, values: parsedContent.strings }
        };
        const normalizedSaveState = storedSave
          ? parseSaveState({
              ...createInitialSaveState(loadedProject),
              ...(JSON.parse(storedSave) as object)
            })
          : undefined;
        const nextController = createPlayerController(
          loadedProject,
          normalizedSaveState
        );

        setBuildManifest(manifest);
        setContent(parsedContent);
        setController(nextController);
        setSnapshot(nextController.getSnapshot());
        setPlayheadMs(normalizedSaveState?.playheadMs ?? 0);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }

    void loadBuild();
  }, []);

  const storageKey = buildManifest ? `mage2-runtime-save:${buildManifest.projectId}` : "";
  const currentAsset =
    content && snapshot
      ? (content.assets.find((asset) => asset.id === snapshot.scene.backgroundAssetId) as RuntimeAsset | undefined)
      : undefined;
  const visibleHotspots = controller ? controller.getVisibleHotspots(playheadMs) : [];
  const subtitleLines = controller ? controller.getSubtitleLines(playheadMs) : [];

  useEffect(() => {
    const video = runtimeVideoRef.current;
    if (!video || currentAsset?.kind !== "video" || !snapshot) {
      return;
    }

    video.currentTime = 0;
    void video.play().catch(() => {
      // If autoplay is blocked, keep the runtime surface clean and leave playback stopped.
    });
  }, [currentAsset?.id, currentAsset?.kind, currentAsset?.sourcePath, snapshot?.scene.id]);

  if (errorMessage) {
    return (
      <main className="runtime-shell">
        <section className="runtime-card">
          <h1>MAGE2 Runtime</h1>
          <p>{errorMessage}</p>
        </section>
      </main>
    );
  }

  if (!buildManifest || !content || !controller || !snapshot) {
    return (
      <main className="runtime-shell">
        <section className="runtime-card">
          <h1>MAGE2 Runtime</h1>
          <p>Loading export...</p>
        </section>
      </main>
    );
  }

  const headerContent = resolveRuntimeHeaderContent(content);

  return (
    <main className="runtime-shell">
      <section className="runtime-stage">
        <header className="runtime-header">
          <div>
            <p className="runtime-eyebrow">{headerContent.projectName}</p>
          </div>
          <div className="runtime-actions">
            <button
              type="button"
              onClick={() => {
                const nextSave = controller.save();
                nextSave.playheadMs = playheadMs;
                localStorage.setItem(storageKey, JSON.stringify(nextSave));
              }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                const storedSave = localStorage.getItem(storageKey);
                if (!storedSave) {
                  return;
                }

                const loadedProject = {
                  manifest: content.manifest,
                  assets: { schemaVersion: content.schemaVersion, assets: content.assets },
                  locations: { schemaVersion: content.schemaVersion, items: content.locations },
                  scenes: { schemaVersion: content.schemaVersion, items: content.scenes },
                  dialogues: { schemaVersion: content.schemaVersion, items: content.dialogues },
                  inventory: { schemaVersion: content.schemaVersion, items: content.inventoryItems },
                  strings: { schemaVersion: content.schemaVersion, values: content.strings }
                };
                const nextSaveState = parseSaveState({
                  ...createInitialSaveState(loadedProject),
                  ...(JSON.parse(storedSave) as object)
                });
                const nextController = createPlayerController(
                  loadedProject,
                  nextSaveState
                );
                setController(nextController);
                setSnapshot(nextController.getSnapshot());
                setPlayheadMs(nextSaveState.playheadMs ?? 0);
              }}
            >
              Load
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(storageKey);
                const nextController = createPlayerController({
                  manifest: content.manifest,
                  assets: { schemaVersion: content.schemaVersion, assets: content.assets },
                  locations: { schemaVersion: content.schemaVersion, items: content.locations },
                  scenes: { schemaVersion: content.schemaVersion, items: content.scenes },
                  dialogues: { schemaVersion: content.schemaVersion, items: content.dialogues },
                  inventory: { schemaVersion: content.schemaVersion, items: content.inventoryItems },
                  strings: { schemaVersion: content.schemaVersion, values: content.strings }
                });
                setController(nextController);
                setSnapshot(nextController.getSnapshot());
                setPlayheadMs(0);
              }}
            >
              Restart
            </button>
            <label
              className="runtime-hotspot-visibility-toggle"
              title="Show translucent hotspot regions for debugging. Labels remain hidden."
            >
              <input
                type="checkbox"
                checked={showHotspots}
                onChange={(event) => setShowHotspots(event.target.checked)}
              />
              <span>Show hotspots</span>
            </label>
          </div>
        </header>

        <div className="runtime-media">
          {currentAsset?.kind === "video" ? (
            <video
              ref={runtimeVideoRef}
              key={`${snapshot.scene.id}:${currentAsset.id}`}
              src={currentAsset.sourcePath}
              autoPlay
              loop={snapshot.scene.backgroundVideoLoop}
              playsInline
              className="runtime-media__asset"
            />
          ) : currentAsset?.kind === "image" ? (
            <img src={currentAsset.sourcePath} alt={currentAsset.name} className="runtime-media__asset" />
          ) : (
            <div className="runtime-media__placeholder">No playable visual asset for this scene.</div>
          )}

          <div className="runtime-media__overlay">
            {visibleHotspots.map((hotspot) => {
              return (
                <RuntimeHotspotButton
                  key={hotspot.id}
                  hotspot={hotspot}
                  showHotspots={showHotspots}
                  strings={content.strings}
                  onActivate={() => {
                    controller.selectHotspot(hotspot.id, playheadMs);
                    setSnapshot(controller.getSnapshot());
                    setPlayheadMs(0);
                  }}
                />
              );
            })}
          </div>
        </div>

        <label className="runtime-scrubber">
          Playhead {Math.round(playheadMs)}ms
          <input
            type="range"
            min={0}
            max={currentAsset?.durationMs ?? 30000}
            value={Math.min(playheadMs, currentAsset?.durationMs ?? 30000)}
            onChange={(event) => setPlayheadMs(Number(event.target.value))}
          />
        </label>

        <div className="runtime-subtitles">
          {subtitleLines.length > 0 ? (
            subtitleLines.map((line, index) => (
              <p key={`${index}:${line}`} className="runtime-subtitles__line">
                {line}
              </p>
            ))
          ) : (
            "Subtitles will appear here."
          )}
        </div>

        {snapshot.activeDialogue ? (
          <div className="runtime-dialogue">
            <h2>{snapshot.activeDialogue.node.speaker}</h2>
            <p>{content.strings[snapshot.activeDialogue.node.textId] ?? snapshot.activeDialogue.node.textId}</p>
            {snapshot.activeDialogue.choices.length > 0 ? (
              <div className="runtime-choices">
                {snapshot.activeDialogue.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => {
                      controller.chooseDialogueChoice(choice.id);
                      setSnapshot(controller.getSnapshot());
                    }}
                  >
                    {content.strings[choice.textId] ?? choice.textId}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  controller.continueDialogue();
                  setSnapshot(controller.getSnapshot());
                }}
              >
                Continue
              </button>
            )}
          </div>
        ) : null}

        <aside className="runtime-sidebar">
          <h3>State</h3>
          <pre>{JSON.stringify(snapshot.saveState, null, 2)}</pre>
        </aside>
      </section>
    </main>
  );
}

function RuntimeHotspotButton({
  hotspot,
  showHotspots,
  strings,
  onActivate
}: {
  hotspot: Hotspot;
  showHotspots: boolean;
  strings: Record<string, string>;
  onActivate: () => void;
}) {
  const bounds = resolveHotspotBounds(hotspot);

  return (
    <button
      type="button"
      className={showHotspots ? "runtime-hotspot" : "runtime-hotspot runtime-hotspot--hidden"}
      aria-label={`${resolveRuntimeHotspotTitle(hotspot, strings)}: activate this hotspot.`}
      style={{
        left: `${bounds.x * 100}%`,
        top: `${bounds.y * 100}%`,
        width: `${bounds.width * 100}%`,
        height: `${bounds.height * 100}%`,
        clipPath: resolveHotspotClipPath(hotspot)
      }}
      onClick={onActivate}
    />
  );
}

function normalizeHotspotText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function resolveRuntimeHotspotTitle(hotspot: Hotspot, strings: Record<string, string>): string {
  const comment = hotspot.commentTextId ? normalizeHotspotText(strings[hotspot.commentTextId]) : "";
  return hotspot.name || comment || hotspot.id;
}

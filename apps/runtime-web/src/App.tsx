import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPlayerController } from "@mage2/player";
import {
  createInitialSaveState,
  parseSaveState,
  resolveHotspotBounds,
  resolveHotspotClipPath,
  resolveRelativeHotspotContentBox,
  type BuildManifest,
  type ExportProjectData,
  parseBuildManifest
} from "@mage2/schema";

interface RuntimeAsset {
  id: string;
  kind: "video" | "image" | "audio" | "subtitle";
  name: string;
  sourcePath: string;
  durationMs?: number;
}

export function App() {
  const [buildManifest, setBuildManifest] = useState<BuildManifest>();
  const [content, setContent] = useState<ExportProjectData>();
  const [controller, setController] = useState<ReturnType<typeof createPlayerController>>();
  const [playheadMs, setPlayheadMs] = useState(0);
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
          subtitles: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.subtitleTracks },
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
      // If the environment blocks autoplay, the controls remain available for manual playback.
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

  return (
    <main className="runtime-shell">
      <section className="runtime-stage">
        <header className="runtime-header">
          <div>
            <p className="runtime-eyebrow">{content.manifest.projectName}</p>
            <h1>{snapshot.location.name}</h1>
            <p>{snapshot.scene.name}</p>
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
                  subtitles: { schemaVersion: content.schemaVersion, items: content.subtitleTracks },
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
                  subtitles: { schemaVersion: content.schemaVersion, items: content.subtitleTracks },
                  strings: { schemaVersion: content.schemaVersion, values: content.strings }
                });
                setController(nextController);
                setSnapshot(nextController.getSnapshot());
                setPlayheadMs(0);
              }}
            >
              Restart
            </button>
          </div>
        </header>

        <div className="runtime-media">
          {currentAsset?.kind === "video" ? (
            <video
              ref={runtimeVideoRef}
              key={`${snapshot.scene.id}:${currentAsset.id}`}
              src={currentAsset.sourcePath}
              autoPlay
              controls
              loop={snapshot.scene.backgroundVideoLoop}
              className="runtime-media__asset"
            />
          ) : currentAsset?.kind === "image" ? (
            <img src={currentAsset.sourcePath} alt={currentAsset.name} className="runtime-media__asset" />
          ) : (
            <div className="runtime-media__placeholder">No playable visual asset for this scene.</div>
          )}

          <div className="runtime-media__overlay">
            {visibleHotspots.map((hotspot) => {
              const bounds = resolveHotspotBounds(hotspot);
              const contentBox = resolveRelativeHotspotContentBox(hotspot);

              return (
                <button
                  key={hotspot.id}
                  type="button"
                  className="runtime-hotspot"
                  style={{
                    left: `${bounds.x * 100}%`,
                    top: `${bounds.y * 100}%`,
                    width: `${bounds.width * 100}%`,
                    height: `${bounds.height * 100}%`,
                    clipPath: resolveHotspotClipPath(hotspot)
                  }}
                  onClick={() => {
                    controller.selectHotspot(hotspot.id, playheadMs);
                    setSnapshot(controller.getSnapshot());
                    setPlayheadMs(0);
                  }}
                >
                  {(hotspot.name || (hotspot.commentTextId && content.strings[hotspot.commentTextId]?.trim())) ? (
                    <span
                      className="runtime-hotspot__content"
                      style={{
                        left: `${contentBox.x * 100}%`,
                        top: `${contentBox.y * 100}%`,
                        width: `${contentBox.width * 100}%`,
                        height: `${contentBox.height * 100}%`
                      }}
                    >
                      {hotspot.name ? <span className="runtime-hotspot__title">{hotspot.name}</span> : null}
                      {hotspot.commentTextId && normalizeHotspotText(content.strings[hotspot.commentTextId]) ? (
                        <OverflowingHotspotComment
                          text={normalizeHotspotText(content.strings[hotspot.commentTextId])}
                          className="runtime-hotspot__comment"
                        />
                      ) : null}
                    </span>
                  ) : null}
                </button>
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
          {subtitleLines.length > 0 ? subtitleLines.join(" ") : "Subtitles will appear here."}
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

function normalizeHotspotText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function OverflowingHotspotComment({ text, className }: { text: string; className: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [displayText, setDisplayText] = useState(text);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) {
      return;
    }

    let frame = 0;

    const updateDisplayText = () => {
      if (container.clientHeight <= 0 || container.clientWidth <= 0) {
        setDisplayText(text);
        return;
      }

      measure.textContent = text;
      if (textFits(measure)) {
        setDisplayText(text);
        return;
      }

      let low = 0;
      let high = text.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        measure.textContent = truncateHotspotComment(text, mid);
        if (textFits(measure)) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }

      setDisplayText(low > 0 ? truncateHotspotComment(text, low) : "...");
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateDisplayText);
    };

    scheduleUpdate();

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(container);

    void document.fonts.ready.then(() => {
      if (container.isConnected) {
        scheduleUpdate();
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [text]);

  return (
    <span ref={containerRef} className={`${className}-shell`}>
      <span className={className}>{displayText}</span>
      <span ref={measureRef} aria-hidden="true" className={`${className} ${className}--measure`} />
    </span>
  );
}

function textFits(element: HTMLSpanElement): boolean {
  return element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1;
}

function truncateHotspotComment(text: string, length: number): string {
  if (length >= text.length) {
    return text;
  }

  const rawTruncated = text.slice(0, length).trimEnd();
  const wordBoundary = rawTruncated.replace(/\s+\S*$/, "").trimEnd();
  const truncated =
    wordBoundary.length >= Math.max(6, Math.floor(rawTruncated.length * 0.7)) ? wordBoundary : rawTruncated;

  return `${truncated || rawTruncated || text.slice(0, length).trim()}...`;
}

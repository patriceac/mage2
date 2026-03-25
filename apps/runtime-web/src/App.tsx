import { useEffect, useRef, useState } from "react";
import { createPlayerController, resolveSceneTimelineDurationMs } from "@mage2/player";
import {
  createInitialSaveState,
  normalizeSupportedLocales,
  resolveAssetCategory,
  resolveAssetVariant,
  parseSaveState,
  resolveHotspotBounds,
  resolveHotspotClipPath,
  type Asset,
  type BuildManifest,
  type ExportProjectData,
  type Hotspot,
  type InventoryItem,
  parseBuildManifest
} from "@mage2/schema";

export function resolveRuntimeHeaderContent(content: Pick<ExportProjectData, "manifest">): {
  projectName: string;
} {
  return {
    projectName: content.manifest.projectName
  };
}

export function resolveRuntimeInventoryItems(
  items: InventoryItem[],
  assets: Asset[],
  locale: string,
  strings: Record<string, string>
): Array<{ id: string; label: string; imageSrc?: string }> {
  return items.map((item) => {
    const asset = item.imageAssetId ? assets.find((entry) => entry.id === item.imageAssetId) : undefined;
    const variant = asset ? resolveAssetVariant(asset, locale) : undefined;

    return {
      id: item.id,
      label: strings[item.textId] ?? item.name ?? item.textId,
      imageSrc: asset?.kind === "image" ? variant?.sourcePath : undefined
    };
  });
}

export function resolveRuntimeHotspotVisuals(
  hotspots: Hotspot[],
  inventoryItems: InventoryItem[],
  assets: Asset[],
  locale: string,
  strings: Record<string, string>
): Record<string, { imageSrc: string; alt: string }> {
  const itemsById = new Map(inventoryItems.map((item) => [item.id, item] as const));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset] as const));
  const visuals: Record<string, { imageSrc: string; alt: string }> = {};

  for (const hotspot of hotspots) {
    if (!hotspot.inventoryItemId) {
      continue;
    }

    const item = itemsById.get(hotspot.inventoryItemId);
    if (!item?.imageAssetId) {
      continue;
    }

    const asset = assetsById.get(item.imageAssetId);
    if (!asset || asset.kind !== "image" || resolveAssetCategory(asset) !== "inventory") {
      continue;
    }

    const variant = resolveAssetVariant(asset, locale);
    const imageSrc = variant?.proxyPath ?? variant?.sourcePath;
    if (!imageSrc) {
      continue;
    }

    visuals[hotspot.id] = {
      imageSrc,
      alt: strings[item.textId] ?? item.name ?? hotspot.name ?? hotspot.id
    };
  }

  return visuals;
}

export function App() {
  const [buildManifest, setBuildManifest] = useState<BuildManifest>();
  const [content, setContent] = useState<ExportProjectData>();
  const [controller, setController] = useState<ReturnType<typeof createPlayerController>>();
  const [activeLocale, setActiveLocale] = useState<string>();
  const [playheadMs, setPlayheadMs] = useState(0);
  const [showHotspots, setShowHotspots] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [snapshot, setSnapshot] = useState(() => controller?.getSnapshot());
  const runtimeVideoRef = useRef<HTMLVideoElement>(null);
  const runtimeAudioRef = useRef<HTMLAudioElement>(null);
  const sceneAudioTimeoutRef = useRef<number | undefined>(undefined);

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
        const supportedLocales = normalizeSupportedLocales(
          parsedContent.manifest.defaultLanguage,
          parsedContent.manifest.supportedLocales
        );

        const storageKey = `mage2-runtime-save:${manifest.projectId}`;
        const localeStorageKey = `mage2-runtime-locale:${manifest.projectId}`;
        const storedSave = localStorage.getItem(storageKey);
        const storedLocale = localStorage.getItem(localeStorageKey);
        const nextLocale =
          storedLocale && supportedLocales.includes(storedLocale)
            ? storedLocale
            : parsedContent.manifest.defaultLanguage;
        const loadedProject = {
          manifest: parsedContent.manifest,
          assets: { schemaVersion: parsedContent.schemaVersion, assets: parsedContent.assets },
          locations: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.locations },
          scenes: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.scenes },
          dialogues: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.dialogues },
          inventory: { schemaVersion: parsedContent.schemaVersion, items: parsedContent.inventoryItems },
          strings: { schemaVersion: parsedContent.schemaVersion, byLocale: parsedContent.strings }
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
        setActiveLocale(nextLocale);
        setSnapshot(nextController.getSnapshot());
        setPlayheadMs(normalizedSaveState?.playheadMs ?? 0);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }

    void loadBuild();
  }, []);

  const storageKey = buildManifest ? `mage2-runtime-save:${buildManifest.projectId}` : "";
  const localeStorageKey = buildManifest ? `mage2-runtime-locale:${buildManifest.projectId}` : "";
  const supportedLocales =
    content
      ? normalizeSupportedLocales(content.manifest.defaultLanguage, content.manifest.supportedLocales)
      : [];
  const locale = activeLocale ?? content?.manifest.defaultLanguage ?? "en";
  const localeStrings = content?.strings[locale] ?? {};
  const currentAsset =
    content && snapshot
      ? (content.assets.find((asset) => asset.id === snapshot.scene.backgroundAssetId) as Asset | undefined)
      : undefined;
  const currentAssetVariant = currentAsset ? resolveAssetVariant(currentAsset, locale) : undefined;
  const sceneAudioAsset =
    content && snapshot?.scene.sceneAudioAssetId
      ? (content.assets.find((asset) => asset.id === snapshot.scene.sceneAudioAssetId) as Asset | undefined)
      : undefined;
  const sceneAudioVariant = sceneAudioAsset ? resolveAssetVariant(sceneAudioAsset, locale) : undefined;
  const sceneTimelineDurationMs = resolveSceneTimelineDurationMs(
    currentAssetVariant?.durationMs,
    currentAsset?.kind === "image" ? snapshot?.scene.sceneAudioDelayMs ?? 0 : 0,
    currentAsset?.kind === "image" ? sceneAudioVariant?.durationMs : undefined
  );
  const visibleHotspots = controller ? controller.getVisibleHotspots(playheadMs) : [];
  const subtitleLines = controller ? controller.getSubtitleLines(playheadMs, locale) : [];
  const runtimeInventoryItems =
    content && snapshot ? resolveRuntimeInventoryItems(snapshot.inventoryItems, content.assets, locale, localeStrings) : [];
  const runtimeHotspotVisuals =
    content && snapshot
      ? resolveRuntimeHotspotVisuals(visibleHotspots, content.inventoryItems, content.assets, locale, localeStrings)
      : {};

  useEffect(() => {
    const video = runtimeVideoRef.current;
    if (!video || currentAsset?.kind !== "video" || !snapshot) {
      return;
    }

    video.currentTime = 0;
    void video.play().catch(() => {
      // If autoplay is blocked, keep the runtime surface clean and leave playback stopped.
    });
  }, [currentAsset?.id, currentAsset?.kind, currentAssetVariant?.sourcePath, snapshot?.scene.id]);

  useEffect(() => {
    const audio = runtimeAudioRef.current;
    if (sceneAudioTimeoutRef.current !== undefined) {
      window.clearTimeout(sceneAudioTimeoutRef.current);
      sceneAudioTimeoutRef.current = undefined;
    }

    if (!audio) {
      return;
    }

    const clearPlayback = () => {
      if (sceneAudioTimeoutRef.current !== undefined) {
        window.clearTimeout(sceneAudioTimeoutRef.current);
        sceneAudioTimeoutRef.current = undefined;
      }
      audio.pause();
      audio.currentTime = 0;
    };

    clearPlayback();

    if (!sceneAudioVariant?.sourcePath || currentAsset?.kind !== "image" || !snapshot?.scene.sceneAudioAssetId) {
      return clearPlayback;
    }

    const schedulePlayback = () => {
      sceneAudioTimeoutRef.current = window.setTimeout(() => {
        sceneAudioTimeoutRef.current = undefined;
        void audio.play().catch(() => {
          // If autoplay is blocked, leave playback stopped without interrupting runtime.
        });
      }, Math.max(snapshot.scene.sceneAudioDelayMs, 0));
    };

    const handleEnded = () => {
      audio.currentTime = 0;
      if (snapshot.scene.sceneAudioLoop) {
        schedulePlayback();
      }
    };

    audio.addEventListener("ended", handleEnded);
    schedulePlayback();

    return () => {
      audio.removeEventListener("ended", handleEnded);
      clearPlayback();
    };
  }, [
    currentAsset?.kind,
    sceneAudioVariant?.sourcePath,
    snapshot?.scene.id,
    snapshot?.scene.sceneAudioAssetId,
    snapshot?.scene.sceneAudioDelayMs,
    snapshot?.scene.sceneAudioLoop
  ]);

  useEffect(() => {
    if (localeStorageKey && activeLocale) {
      localStorage.setItem(localeStorageKey, activeLocale);
    }
  }, [activeLocale, localeStorageKey]);

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
                  strings: { schemaVersion: content.schemaVersion, byLocale: content.strings }
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
                  strings: { schemaVersion: content.schemaVersion, byLocale: content.strings }
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
            <label className="runtime-hotspot-visibility-toggle" title="Switch the active runtime locale.">
              <span>Locale</span>
              <select value={locale} onChange={(event) => setActiveLocale(event.target.value)}>
                {supportedLocales.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <div className="runtime-media">
          {currentAsset?.kind === "video" && currentAssetVariant ? (
            <video
              ref={runtimeVideoRef}
              key={`${snapshot.scene.id}:${currentAsset.id}`}
              src={currentAssetVariant.sourcePath}
              autoPlay
              loop={snapshot.scene.backgroundVideoLoop}
              playsInline
              className="runtime-media__asset"
            />
          ) : currentAsset?.kind === "image" && currentAssetVariant ? (
            <img src={currentAssetVariant.sourcePath} alt={currentAsset.name} className="runtime-media__asset" />
          ) : (
            <div className="runtime-media__placeholder">No playable visual asset for this scene.</div>
          )}
          {sceneAudioVariant?.sourcePath ? (
            <audio ref={runtimeAudioRef} src={sceneAudioVariant.sourcePath} preload="metadata" className="runtime-scene-audio" />
          ) : null}

          <div className="runtime-media__overlay">
            {visibleHotspots.map((hotspot) => {
              return (
                <RuntimeHotspotButton
                  key={hotspot.id}
                  hotspot={hotspot}
                  showHotspots={showHotspots}
                  visual={runtimeHotspotVisuals[hotspot.id]}
                  strings={localeStrings}
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
            max={sceneTimelineDurationMs}
            value={Math.min(playheadMs, sceneTimelineDurationMs)}
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
            <p>{localeStrings[snapshot.activeDialogue.node.textId] ?? snapshot.activeDialogue.node.textId}</p>
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
                    {localeStrings[choice.textId] ?? choice.textId}
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
          <section className="runtime-sidebar__section">
            <h3>Inventory</h3>
            {runtimeInventoryItems.length > 0 ? (
              <div className="runtime-inventory">
                {runtimeInventoryItems.map((item) => (
                  <article key={item.id} className="runtime-inventory__item">
                    {item.imageSrc ? (
                      <img src={item.imageSrc} alt={item.label} className="runtime-inventory__thumb" />
                    ) : (
                      <div className="runtime-inventory__thumb runtime-inventory__thumb--placeholder">No art</div>
                    )}
                    <strong>{item.label}</strong>
                  </article>
                ))}
              </div>
            ) : (
              <p className="runtime-sidebar__empty">Inventory empty.</p>
            )}
          </section>

          <section className="runtime-sidebar__section">
            <h3>State</h3>
            <pre>{JSON.stringify(snapshot.saveState, null, 2)}</pre>
          </section>
        </aside>
      </section>
    </main>
  );
}

function RuntimeHotspotButton({
  hotspot,
  showHotspots,
  visual,
  strings,
  onActivate
}: {
  hotspot: Hotspot;
  showHotspots: boolean;
  visual?: {
    imageSrc: string;
    alt: string;
  };
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
    >
      {visual ? <img src={visual.imageSrc} alt="" aria-hidden="true" className="runtime-hotspot__visual" /> : null}
    </button>
  );
}

function normalizeHotspotText(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function resolveRuntimeHotspotTitle(hotspot: Hotspot, strings: Record<string, string>): string {
  const comment = hotspot.commentTextId ? normalizeHotspotText(strings[hotspot.commentTextId]) : "";
  return hotspot.name || comment || hotspot.id;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { createPlayerController, resolveSceneTimelineDurationMs } from "@mage2/player";
import { getLocaleStringValues, normalizeSupportedLocales, type InventoryItem, type ProjectBundle } from "@mage2/schema";
import { DropdownSelect } from "./DropdownSelect";
import { MediaSurface } from "./MediaSurface";
import { resolveFileUrl } from "./file-url-cache";
import { resolveHotspotVisuals } from "./hotspot-visuals";
import { getLocalizedAssetVariant } from "./localized-project";
import { useEditorStore } from "./store";

interface PlaytestPanelProps {
  project: ProjectBundle;
}

const STORAGE_KEY = "mage2-editor-playtest-save";
const LOCALE_STORAGE_KEY = "mage2-editor-playtest-locale";

export function resolvePlaytestInventorySummary(
  items: Array<Pick<InventoryItem, "name" | "textId">>,
  strings: Record<string, string>
): string {
  const labels = items
    .map((item) => strings[item.textId] ?? item.name ?? item.textId)
    .filter((label) => label.length > 0);

  return labels.join(", ") || "Empty";
}

export function resolveStoredPlaytestLocale(
  storedLocale: string | null,
  supportedLocales: readonly string[],
  fallbackLocale: string
): string {
  return storedLocale && supportedLocales.includes(storedLocale) ? storedLocale : fallbackLocale;
}

export function PlaytestPanel({ project }: PlaytestPanelProps) {
  const activeLocale = useEditorStore((state) => state.playtestLocale) ?? project.manifest.defaultLanguage;
  const setActiveLocale = useEditorStore((state) => state.setPlaytestLocale);
  const [controller, setController] = useState(() => createPlayerController(project));
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());
  const [playheadMs, setPlayheadMs] = useState(0);
  const [selectedAssetId, setSelectedAssetId] = useState(snapshot.scene.backgroundAssetId);
  const [showHotspots, setShowHotspots] = useState(false);
  const [sceneAudioUrl, setSceneAudioUrl] = useState<string>();
  const sceneAudioRef = useRef<HTMLAudioElement>(null);
  const sceneAudioTimeoutRef = useRef<number | undefined>(undefined);
  const supportedLocales = useMemo(
    () => normalizeSupportedLocales(project.manifest.defaultLanguage, project.manifest.supportedLocales),
    [project.manifest.defaultLanguage, project.manifest.supportedLocales]
  );
  const localeStrings = getLocaleStringValues(project, activeLocale);

  useEffect(() => {
    const nextController = createPlayerController(project);
    setController(nextController);
    setSnapshot(nextController.getSnapshot());
    setPlayheadMs(0);
  }, [project]);

  useEffect(() => {
    const nextLocale = resolveStoredPlaytestLocale(
      localStorage.getItem(LOCALE_STORAGE_KEY),
      supportedLocales,
      project.manifest.defaultLanguage
    );
    if (nextLocale !== useEditorStore.getState().playtestLocale) {
      setActiveLocale(nextLocale);
    }
  }, [project.manifest.defaultLanguage, setActiveLocale, supportedLocales]);

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, activeLocale);
  }, [activeLocale]);

  useEffect(() => {
    setSelectedAssetId(snapshot.scene.backgroundAssetId);
  }, [snapshot.scene.backgroundAssetId]);

  const sceneAsset = project.assets.assets.find((asset) => asset.id === selectedAssetId);
  const sceneAssetVariant = getLocalizedAssetVariant(sceneAsset, activeLocale);
  const sceneAudioAsset = snapshot.scene.sceneAudioAssetId
    ? project.assets.assets.find((asset) => asset.id === snapshot.scene.sceneAudioAssetId)
    : undefined;
  const sceneAudioVariant = getLocalizedAssetVariant(sceneAudioAsset, activeLocale);
  const sceneTimelineDurationMs = resolveSceneTimelineDurationMs(
    sceneAssetVariant?.durationMs,
    sceneAsset?.kind === "image" ? snapshot.scene.sceneAudioDelayMs : 0,
    sceneAsset?.kind === "image" ? sceneAudioVariant?.durationMs : undefined
  );
  const visibleHotspots = controller.getVisibleHotspots(playheadMs);
  const subtitleLines = controller.getSubtitleLines(playheadMs, activeLocale);
  const hotspotVisuals = resolveHotspotVisuals({
    hotspots: visibleHotspots,
    inventoryItems: project.inventory.items,
    assets: project.assets.assets,
    locale: activeLocale,
    strings: localeStrings
  });

  useEffect(() => {
    let cancelled = false;

    async function loadSceneAudioUrl() {
      if (!sceneAudioAsset) {
        setSceneAudioUrl(undefined);
        return;
      }

      const sourcePath = sceneAudioVariant?.proxyPath ?? sceneAudioVariant?.sourcePath;
      if (!sourcePath) {
        setSceneAudioUrl(undefined);
        return;
      }

      const url = await resolveFileUrl(sourcePath);
      if (!cancelled) {
        setSceneAudioUrl(url);
      }
    }

    void loadSceneAudioUrl();
    return () => {
      cancelled = true;
    };
  }, [sceneAudioAsset?.id, sceneAudioVariant?.proxyPath, sceneAudioVariant?.sourcePath]);

  useEffect(() => {
    const audio = sceneAudioRef.current;
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

    if (!sceneAudioUrl || sceneAsset?.kind !== "image" || !snapshot.scene.sceneAudioAssetId) {
      return clearPlayback;
    }

    const schedulePlayback = () => {
      sceneAudioTimeoutRef.current = window.setTimeout(() => {
        sceneAudioTimeoutRef.current = undefined;
        void audio.play().catch(() => {
          // Keep the playtest responsive if autoplay is blocked.
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
    sceneAudioUrl,
    sceneAsset?.kind,
    snapshot.scene.id,
    snapshot.scene.sceneAudioAssetId,
    snapshot.scene.sceneAudioDelayMs,
    snapshot.scene.sceneAudioLoop
  ]);

  return (
    <div className="panel-grid panel-grid--playtest">
      <section className="panel">
        <div className="panel__toolbar playtest-panel__toolbar">
          <label className="playtest-panel__toolbar-field playtest-panel__toolbar-field--playhead">
            <span className="playtest-panel__toolbar-label">Playhead</span>
            <input
              className="playtest-panel__toolbar-range"
              type="range"
              min={0}
              max={sceneTimelineDurationMs}
              value={Math.min(playheadMs, sceneTimelineDurationMs)}
              title="Scrub through the current scene preview to inspect timing, subtitles, and hotspot visibility."
              onChange={(event) => setPlayheadMs(Number(event.target.value))}
            />
          </label>
          <label className="playtest-panel__toolbar-field playtest-panel__toolbar-field--locale">
            <span className="playtest-panel__toolbar-label">Locale</span>
            <DropdownSelect value={activeLocale} onChange={(event) => setActiveLocale(event.target.value)}>
              {supportedLocales.map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </DropdownSelect>
          </label>
          <div className="playtest-panel__toolbar-field playtest-panel__toolbar-field--action">
            <button
              type="button"
              className="playtest-panel__toolbar-button"
              title="Store the current runtime state in the editor's local playtest save slot."
              onClick={() => {
                const nextSave = controller.save();
                nextSave.playheadMs = playheadMs;
                const serialized = JSON.stringify(nextSave);
                localStorage.setItem(STORAGE_KEY, serialized);
              }}
            >
              Save Slot
            </button>
          </div>
          <div className="playtest-panel__toolbar-field playtest-panel__toolbar-field--action">
            <button
              type="button"
              className="playtest-panel__toolbar-button"
              title="Restore the last runtime state saved in the local playtest slot."
              onClick={() => {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) {
                  return;
                }

                const nextController = createPlayerController(project, JSON.parse(raw));
                setController(nextController);
                const nextSnapshot = nextController.getSnapshot();
                setSnapshot(nextSnapshot);
                setPlayheadMs(nextSnapshot.saveState.playheadMs ?? 0);
              }}
            >
              Load Slot
            </button>
          </div>
          <div className="playtest-panel__toolbar-field playtest-panel__toolbar-field--toggle">
            <label
              className="playtest-hotspot-visibility-toggle playtest-panel__toolbar-toggle"
              title="Show translucent hotspot regions in playtest for debugging. Labels remain hidden so playtest matches runtime."
            >
              <input
                type="checkbox"
                checked={showHotspots}
                onChange={(event) => setShowHotspots(event.target.checked)}
              />
              <span>Show hotspots</span>
            </label>
          </div>
        </div>

        <MediaSurface
          asset={sceneAsset}
          locale={activeLocale}
          loopVideo={snapshot.scene.backgroundVideoLoop}
          hotspots={visibleHotspots}
          hotspotVisuals={hotspotVisuals}
          hotspotAppearance={showHotspots ? "runtime" : "hidden"}
          showHotspotLabels={false}
          strings={localeStrings}
          playheadMs={sceneAsset?.kind === "video" ? playheadMs : undefined}
          onPlayheadMsChange={sceneAsset?.kind === "video" ? setPlayheadMs : undefined}
          onHotspotClick={(hotspotId) => {
            controller.selectHotspot(hotspotId, playheadMs);
            const nextSnapshot = controller.getSnapshot();
            setSnapshot(nextSnapshot);
            setPlayheadMs(0);
          }}
        />

        {sceneAudioUrl ? (
          <div className="subtitle-strip">
            <audio ref={sceneAudioRef} src={sceneAudioUrl} controls preload="metadata" className="asset-preview__audio" />
          </div>
        ) : null}

        <div className="subtitle-strip">
          {subtitleLines.length > 0 ? (
            subtitleLines.map((line, index) => (
              <p key={`${index}:${line}`} className="subtitle-strip__line">
                {line}
              </p>
            ))
          ) : (
            "Subtitles will appear here."
          )}
        </div>

        {snapshot.activeDialogue ? (
          <div className="dialogue-box">
            <h4>{snapshot.activeDialogue.node.speaker}</h4>
            <p>{localeStrings[snapshot.activeDialogue.node.textId] ?? snapshot.activeDialogue.node.textId}</p>

            {snapshot.activeDialogue.choices.length > 0 ? (
              <div className="choice-list">
                {snapshot.activeDialogue.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    title="Choose this dialogue response and advance to its target branch."
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
                title="Advance to the next dialogue node when there are no explicit choices."
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
      </section>

      <aside className="panel">
        <h3>Runtime State</h3>
        <dl className="inspector-grid">
          <dt>Location</dt>
          <dd>{snapshot.location.name}</dd>
          <dt>Scene</dt>
          <dd>{snapshot.scene.name}</dd>
          <dt>Flags</dt>
          <dd>
            <pre>{JSON.stringify(snapshot.flags, null, 2)}</pre>
          </dd>
          <dt>Inventory</dt>
          <dd>{resolvePlaytestInventorySummary(snapshot.inventoryItems, localeStrings)}</dd>
          <dt>Visited Scenes</dt>
          <dd>{snapshot.saveState.visitedSceneIds.join(", ")}</dd>
        </dl>
      </aside>
    </div>
  );
}

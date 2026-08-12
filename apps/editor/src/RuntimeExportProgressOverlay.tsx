import { useEditorI18n, type EditorTranslator } from "./i18n";

export type RuntimeExportProgressViewPhase =
  | "preparing"
  | "building-web"
  | "assembling-player"
  | "publishing"
  | "complete";

export interface RuntimeExportProgressViewState {
  format: "windows" | "web";
  phase: RuntimeExportProgressViewPhase;
  progress: number;
  elapsedSeconds: number;
  estimatedSecondsRemaining?: number;
  payloadBytes?: number;
}

interface RuntimeExportProgressOverlayProps {
  progress: RuntimeExportProgressViewState;
}

export function RuntimeExportProgressOverlay({ progress }: RuntimeExportProgressOverlayProps) {
  const { t } = useEditorI18n();
  const normalizedProgress = Math.min(1, Math.max(0, progress.progress));
  const percent = Math.round(normalizedProgress * 100);
  const phaseLabel = resolveRuntimeExportPhaseLabel(progress.phase, t);
  const eta = resolveRuntimeExportEta(progress, t);

  return (
    <div
      className="runtime-export-progress-overlay"
      data-runtime-export-progress-phase={progress.phase}
      data-runtime-export-progress-value={percent}
    >
      <div className="runtime-export-progress-overlay__backdrop" aria-hidden="true" />
      <section
        className="runtime-export-progress"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-busy={progress.phase !== "complete"}
        aria-label={t("Runtime export progress")}
      >
        <header className="runtime-export-progress__header">
          <div className="runtime-export-progress__signal" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="runtime-export-progress__heading">
            <p>{t("Export Runtime")}</p>
            <h2>{t("Exporting runtime")}</h2>
          </div>
          <strong className="runtime-export-progress__percent">{percent}%</strong>
        </header>

        <div className="runtime-export-progress__phase-row">
          <strong>{phaseLabel}</strong>
          <span>
            {progress.format === "windows"
              ? t("Ready-to-play Windows folder")
              : t("Web build folder")}
          </span>
        </div>

        <div
          className="runtime-export-progress__track"
          role="progressbar"
          aria-label={t("Runtime export progress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}% — ${phaseLabel}`}
        >
          <span style={{ width: `${percent}%` }} />
        </div>

        <dl className="runtime-export-progress__timing">
          <div>
            <dt>{t("Elapsed")}</dt>
            <dd data-runtime-export-elapsed>{formatRuntimeExportClock(progress.elapsedSeconds, "elapsed")}</dd>
          </div>
          <div>
            <dt>{t("Estimated remaining")}</dt>
            <dd data-runtime-export-eta>{eta}</dd>
          </div>
        </dl>

        <p className="runtime-export-progress__note">
          {t("The selected destination is replaced only after the export succeeds.")}
        </p>
      </section>
    </div>
  );
}

export function formatRuntimeExportClock(seconds: number, mode: "elapsed" | "remaining"): string {
  const normalizedSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const totalSeconds = mode === "remaining" ? Math.ceil(normalizedSeconds) : Math.floor(normalizedSeconds);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const remainder = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function resolveRuntimeExportPhaseLabel(
  phase: RuntimeExportProgressViewPhase,
  t: EditorTranslator
): string {
  switch (phase) {
    case "preparing":
      return t("Preparing export");
    case "building-web":
      return t("Building web runtime");
    case "assembling-player":
      return t("Assembling Windows player folder");
    case "publishing":
      return t("Publishing export");
    case "complete":
      return t("Export complete");
  }
}

function resolveRuntimeExportEta(
  progress: RuntimeExportProgressViewState,
  t: EditorTranslator
): string {
  if (progress.phase === "complete") {
    return t("Export complete");
  }
  if (progress.estimatedSecondsRemaining !== undefined && progress.estimatedSecondsRemaining > 0) {
    return `~${formatRuntimeExportClock(progress.estimatedSecondsRemaining, "remaining")}`;
  }
  if (progress.phase === "publishing" || progress.progress >= 0.9) {
    return t("Finishing...");
  }
  return t("Calculating...");
}

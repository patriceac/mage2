export const WINDOWS_PLAYER_FIRST_RESPONSE_BUDGET_MS = 5_000;
export const WINDOWS_PLAYER_TITLE_READY_BUDGET_MS = 45_000;
export const WINDOWS_PLAYER_STARTUP_METRICS_VERSION = 1;

export function createRuntimeStartupMetrics({ projectName, processStartedAt }) {
  const normalizedProcessStartedAt = Number(processStartedAt);
  if (!Number.isFinite(normalizedProcessStartedAt) || normalizedProcessStartedAt <= 0) {
    throw new TypeError("Windows player startup metrics require a valid process start time.");
  }
  return {
    version: WINDOWS_PLAYER_STARTUP_METRICS_VERSION,
    projectName: normalizeProjectName(projectName),
    processStartedAt: normalizedProcessStartedAt,
    windowCreatedAt: null,
    startupDocumentLoadedAt: null,
    windowShownAt: null,
    windowShownMonotonicNs: null,
    playerNavigationStartedAt: null,
    playerLoadedAt: null,
    playerLoadedMonotonicNs: null,
    initialSurfaceReadyAt: null,
    initialSurfaceReadyMonotonicNs: null
  };
}

export function createRuntimeStartupDataUrl({ projectName }) {
  const safeProjectName = escapeHtml(normalizeProjectName(projectName));
  const document = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeProjectName}</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body {
        display: grid;
        place-items: center;
        color: #f4f8fb;
        background:
          radial-gradient(circle at 50% 42%, rgba(38, 163, 207, 0.16), transparent 34rem),
          linear-gradient(145deg, #05080b, #0b141b 56%, #071018);
      }
      main { width: min(78vw, 52rem); text-align: center; }
      p { margin: 0 0 1.1rem; color: #79d7f4; font-size: clamp(0.72rem, 1.2vw, 0.9rem); font-weight: 800; letter-spacing: 0.22em; }
      h1 { margin: 0; font-size: clamp(2rem, 6vw, 5.2rem); line-height: 0.98; text-wrap: balance; }
      .track { width: min(16rem, 48vw); height: 0.18rem; margin: 2.4rem auto 0; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,0.12); }
      .track::after { content: ""; display: block; width: 44%; height: 100%; border-radius: inherit; background: #65d8ff; animation: travel 1.15s ease-in-out infinite alternate; }
      @keyframes travel { from { transform: translateX(-8%); } to { transform: translateX(136%); } }
      @media (prefers-reduced-motion: reduce) { .track::after { width: 100%; animation: none; opacity: 0.75; } }
    </style>
  </head>
  <body>
    <main class="mage2-runtime-boot" aria-label="${safeProjectName}">
      <p>MAGE2 PLAYER</p>
      <h1>${safeProjectName}</h1>
      <div class="track" aria-hidden="true"></div>
    </main>
  </body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(document)}`;
}

function normalizeProjectName(value) {
  return String(value ?? "").trim() || "MAGE2 Game";
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

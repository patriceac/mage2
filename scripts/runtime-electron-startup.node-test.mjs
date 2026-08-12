import assert from "node:assert/strict";
import test from "node:test";
import {
  WINDOWS_PLAYER_FIRST_RESPONSE_BUDGET_MS,
  WINDOWS_PLAYER_STARTUP_METRICS_VERSION,
  WINDOWS_PLAYER_TITLE_READY_BUDGET_MS,
  createRuntimeStartupDataUrl,
  createRuntimeStartupMetrics
} from "../apps/runtime-electron/startup.mjs";

test("declares the clean-start response and title budgets", () => {
  assert.equal(WINDOWS_PLAYER_FIRST_RESPONSE_BUDGET_MS, 5_000);
  assert.equal(WINDOWS_PLAYER_TITLE_READY_BUDGET_MS, 45_000);
});

test("creates a branded, script-free startup document without trusting the project name", () => {
  const url = createRuntimeStartupDataUrl({ projectName: 'Beacon <script>alert("x")</script>' });
  assert.match(url, /^data:text\/html;charset=utf-8,/u);
  const document = decodeURIComponent(url.slice(url.indexOf(",") + 1));

  assert.match(document, /MAGE2 PLAYER/u);
  assert.match(document, /class="mage2-runtime-boot"/u);
  assert.match(document, /Beacon &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/u);
  assert.doesNotMatch(document, /<script>/u);
  assert.match(document, /Content-Security-Policy/u);
  assert.match(document, /prefers-reduced-motion/u);
});

test("creates a read-only-copyable startup timeline without inventing milestone times", () => {
  assert.deepEqual(
    createRuntimeStartupMetrics({ projectName: "  Beacon at Dusk  ", processStartedAt: 1_725_000_000_000 }),
    {
      version: WINDOWS_PLAYER_STARTUP_METRICS_VERSION,
      projectName: "Beacon at Dusk",
      processStartedAt: 1_725_000_000_000,
      windowCreatedAt: null,
      startupDocumentLoadedAt: null,
      windowShownAt: null,
      windowShownMonotonicNs: null,
      playerNavigationStartedAt: null,
      playerLoadedAt: null,
      playerLoadedMonotonicNs: null,
      initialSurfaceReadyAt: null,
      initialSurfaceReadyMonotonicNs: null
    }
  );
  assert.throws(
    () => createRuntimeStartupMetrics({ projectName: "Beacon", processStartedAt: Number.NaN }),
    /valid process start time/u
  );
});

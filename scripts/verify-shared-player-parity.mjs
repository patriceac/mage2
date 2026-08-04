import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, chromium } from "playwright";
import {
  closeRunningCanonicalEditorProcesses,
  closeRunningWindowsProcessesAtPath,
  getCanonicalPackagedEditorExePath
} from "./editor-windows-launch-targets.mjs";
import { startPlayerServer } from "../apps/runtime-electron/server.mjs";
import {
  BUILT_IN_LOCALE_CASES,
  FALLBACK_LOCALE_CASES,
  assertRuntimeLocaleState,
  directionForLocale
} from "./localization-verification.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDirectory = resolveProjectDirectory(process.argv.slice(2));
const buildDirectory = path.join(projectDirectory, "build");
const buildManifest = JSON.parse(await readFile(path.join(buildDirectory, "build-manifest.json"), "utf8"));
let runtimeContent = JSON.parse(
  await readFile(path.join(buildDirectory, buildManifest.contentPath), "utf8")
);
const editorExecutablePath = getCanonicalPackagedEditorExePath();
const runtimeExecutablePath = path.join(
  repoRoot,
  "output",
  "packaging",
  "runtime-win",
  "dist",
  "win-unpacked",
  `${sanitizeWindowsName(buildManifest.projectName)} Player.exe`
);
const outputDirectory = path.join(repoRoot, "output", "playwright", "shared-player-parity");
const reportPath = path.join(outputDirectory, "report.json");
const sceneIdByMediaAlt = {
  "Dock at Blue Hour": "scene_dock",
  "Workshop Cabinet Locked": "scene_workshop_locked",
  "Workshop Cabinet Open": "scene_workshop_open",
  "Lantern Room Dark": "scene_lantern_dark",
  "Fuse Box Empty": "scene_fuse_box_empty",
  "Fuse Box Installed": "scene_fuse_box_installed",
  "Lantern Room Ready": "scene_lantern_ready",
  "Lantern Room Lit": "scene_lantern_lit"
};
let sceneAudioAssetIdBySceneId = {};

const gameplaySteps = [
  { label: "01-opening-dock", sceneId: "scene_dock" },
  {
    label: "02-mara-opening-dialogue",
    sceneId: "scene_dock",
    activate: { id: "hotspot_dock_mara_opening", name: "Talk to Mara" }
  },
  { label: "03-mara-choice", sceneId: "scene_dock", dialogue: "continue" },
  { label: "04-mara-key-response", sceneId: "scene_dock", dialogue: "choice" },
  { label: "05-dock-with-key", sceneId: "scene_dock", dialogue: "continue" },
  {
    label: "06-workshop-locked",
    sceneId: "scene_workshop_locked",
    activate: { id: "hotspot_dock_to_workshop_locked", name: "Enter Workshop" }
  },
  { label: "07-key-selected", sceneId: "scene_workshop_locked", selectItem: "Brass Key" },
  {
    label: "08-cabinet-unlocked",
    sceneId: "scene_workshop_open",
    activate: { id: "hotspot_workshop_cabinet_unlock", name: "Unlock Cabinet" }
  },
  {
    label: "09-fuse-picked-up",
    sceneId: "scene_workshop_open",
    activate: { id: "hotspot_workshop_fuse_pickup", name: "Take Replacement Fuse" }
  },
  {
    label: "10-lantern-dark",
    sceneId: "scene_lantern_dark",
    closeInventoryBefore: true,
    activate: { id: "hotspot_workshop_open_to_lantern_dark", name: "Climb to Lantern Room" }
  },
  {
    label: "11-unpowered-lever",
    sceneId: "scene_lantern_dark",
    activate: { id: "hotspot_lantern_lever_no_power", name: "Control Lever" }
  },
  {
    label: "12-fuse-box-empty",
    sceneId: "scene_fuse_box_empty",
    activate: { id: "hotspot_lantern_dark_fuse_box", name: "Examine Fuse Box" }
  },
  { label: "13-fuse-selected", sceneId: "scene_fuse_box_empty", selectItem: "Replacement Fuse" },
  {
    label: "14-fuse-installed",
    sceneId: "scene_fuse_box_installed",
    activate: { id: "hotspot_fuse_box_place_fuse", name: "Install Replacement Fuse" }
  },
  {
    label: "15-lantern-ready",
    sceneId: "scene_lantern_ready",
    activate: { id: "hotspot_fuse_box_installed_return_ready", name: "Step Back" }
  },
  {
    label: "16-lantern-lit",
    sceneId: "scene_lantern_lit",
    activate: { id: "hotspot_lantern_ready_lever_activate", name: "Pull Control Lever" }
  }
];

await mkdir(outputDirectory, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  projectDirectory,
  buildDirectory,
  editorExecutablePath,
  runtimeExecutablePath,
  buildManifest,
  editor: undefined,
  desktop: undefined,
  mobile: undefined,
  hostChecks: undefined,
  localization: undefined,
  electron: undefined,
  parity: []
};

let browser;
let webServer;
try {
  await closeRunningCanonicalEditorProcesses({ repoRootPath: repoRoot });
  await closeRunningWindowsProcessesAtPath(runtimeExecutablePath);

  report.editor = await exportAndVerifyPackagedEditor();
  await assertExportContainsSharedRenderer();

  await runCommand(process.execPath, [
    path.join(repoRoot, "scripts", "package-runtime-win.mjs"),
    "--project-dir",
    projectDirectory
  ], { MAGE2_SKIP_SHORTCUT_REPAIR: "1" });

  webServer = await startPlayerServer(buildDirectory, 43173);
  browser = await launchChrome();
  report.localization = {
    desktop: await verifyRuntimeLocalization(browser, webServer.url, "desktop", {
      viewport: { width: 1440, height: 900 }
    }),
    mobile: await verifyRuntimeLocalization(browser, webServer.url, "mobile-390x844", {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true
    })
  };

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktopContext.newPage();
  await openFreshRuntime(desktopPage, webServer.url);
  report.desktop = await runVerificationFlow(desktopPage, "desktop", createRuntimeAdapter(desktopPage));
  await desktopPage.screenshot({ path: path.join(outputDirectory, "desktop-full-final.png"), fullPage: true });

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true
  });
  const mobilePage = await mobileContext.newPage();
  await openFreshRuntime(mobilePage, webServer.url);
  report.mobile = await runVerificationFlow(mobilePage, "mobile-390x844", createRuntimeAdapter(mobilePage));
  await mobilePage.screenshot({ path: path.join(outputDirectory, "mobile-390x844-full-final.png"), fullPage: true });

  report.parity = compareVerificationCaptures(report.editor.captures, report.desktop.captures, report.mobile.captures);
  report.hostChecks = await runRuntimeHostChecks(browser, webServer.url);

  await desktopContext.close();
  await mobileContext.close();
  await browser.close();
  browser = undefined;
  await closeServer(webServer);
  webServer = undefined;

  report.electron = await verifyElectronPersistence();
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Shared player parity verification passed: ${reportPath}`);
} catch (error) {
  report.failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8").catch(() => {});
  throw error;
} finally {
  await browser?.close().catch(() => {});
  if (webServer) {
    await closeServer(webServer).catch(() => {});
  }
}

async function exportAndVerifyPackagedEditor() {
  const editorApp = await launchPackagedEditorOverCdp();

  try {
    const { page } = editorApp;
    await page.waitForLoadState("domcontentloaded");
    try {
      await page.locator(".mage2-player").waitFor({ state: "visible", timeout: 30_000 });
    } catch (error) {
      const diagnosticPath = path.join(outputDirectory, "packaged-editor-playtest-startup-timeout.png");
      await page.screenshot({ path: diagnosticPath, fullPage: true }).catch(() => undefined);
      const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
      throw new Error(`Packaged editor did not reach Playtest. URL: ${page.url()}. UI: ${bodyText.slice(0, 1200)}. Screenshot: ${diagnosticPath}`, { cause: error });
    }
    const localeSelect = page.locator(".playtest-panel__toolbar-field--locale select");
    await localeSelect.selectOption("en");

    await page.getByRole("button", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: "Export Runtime", exact: true }).click();
    const exportStatusLocator = page
      .locator(".status-bar__scene-group--right")
      .filter({ hasText: "Runtime build exported to" });
    const exportDialog = page.locator(".dialog-shell");
    try {
      await page.waitForFunction(
        () =>
          document.querySelector(".status-bar__scene-group--right")?.textContent?.includes("Runtime build exported to") ||
          Boolean(document.querySelector(".dialog-shell")),
        undefined,
        { timeout: 20_000 }
      );
    } catch (error) {
      const diagnosticPath = path.join(outputDirectory, "packaged-editor-export-timeout.png");
      await page.screenshot({ path: diagnosticPath, fullPage: true });
      const diagnostic = await page.evaluate(() => ({
        bodyText: document.body.innerText,
        status: document.querySelector(".status-bar__scene-group--right")?.textContent,
        busy: document.querySelector(".busy-overlay")?.textContent,
        dialog: document.querySelector(".dialog-shell")?.textContent
      }));
      throw new Error(`Packaged editor export timed out: ${JSON.stringify(diagnostic)}`, { cause: error });
    }
    if (await exportDialog.isVisible()) {
      const diagnosticPath = path.join(outputDirectory, "packaged-editor-export-dialog.png");
      await page.screenshot({ path: diagnosticPath, fullPage: true });
      throw new Error(`Packaged editor export failed: ${normalizeText(await exportDialog.innerText())}`);
    }
    const exportStatus = normalizeText(await exportStatusLocator.innerText());
    await refreshExportedSceneAudioExpectations();

    await page.evaluate(() => window.__mage2PlaytestAutomation?.reset());
    const adapter = createEditorAdapter(page);
    const flow = await runVerificationFlow(page, "packaged-editor", adapter);
    await page.screenshot({ path: path.join(outputDirectory, "packaged-editor-full-final.png"), fullPage: true });
    const itemEventAuthoring = hasCanonicalGameplayFixture()
      ? await verifyPackagedEditorItemEvents(page)
      : { skipped: true, reason: "The representative localization project does not include the parity gameplay fixture." };

    return {
      exportStatus,
      processId: editorApp.process.pid,
      itemEventAuthoring,
      ...flow
    };
  } finally {
    await closePackagedEditorOverCdp(editorApp);
  }
}

async function launchPackagedEditorOverCdp() {
  const debuggingPort = await reserveLoopbackPort();
  const process = spawn(
    editorExecutablePath,
    [
      `--remote-debugging-address=127.0.0.1`,
      `--remote-debugging-port=${debuggingPort}`,
      "--project",
      projectDirectory,
      "--tab",
      "playtest"
    ],
    {
      cwd: path.dirname(editorExecutablePath),
      stdio: "ignore",
      windowsHide: true
    }
  );

  let browser;
  try {
    browser = await connectToCdp(`http://127.0.0.1:${debuggingPort}`, process);
    const page = await waitForPackagedEditorPage(browser, process);
    return { browser, page, process };
  } catch (error) {
    await browser?.close().catch(() => {});
    await stopSpawnedProcess(process);
    throw error;
  }
}

async function closePackagedEditorOverCdp(editorApp) {
  await editorApp.browser.close().catch(() => {});
  await stopSpawnedProcess(editorApp.process);
}

async function connectToCdp(endpoint, process) {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Packaged editor exited before its DevTools endpoint was ready (code ${process.exitCode}).`);
    }
    try {
      return await chromium.connectOverCDP(endpoint);
    } catch (error) {
      lastError = error;
      await delay(150);
    }
  }
  throw new Error(`Timed out waiting for the packaged editor DevTools endpoint at ${endpoint}.`, { cause: lastError });
}

async function waitForPackagedEditorPage(browser, process) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Packaged editor exited before opening its renderer (code ${process.exitCode}).`);
    }
    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => candidate.url().startsWith("mage2-app://bundle/"));
    if (page) {
      return page;
    }
    await delay(150);
  }
  throw new Error("Timed out waiting for the packaged editor renderer page.");
}

async function reserveLoopbackPort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = reservation.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not reserve a loopback DevTools port.");
    }
    return address.port;
  } finally {
    await new Promise((resolve, reject) => reservation.close((error) => (error ? reject(error) : resolve())));
  }
}

async function stopSpawnedProcess(process) {
  if (process.exitCode !== null) {
    return;
  }
  process.kill();
  await Promise.race([
    new Promise((resolve) => process.once("exit", resolve)),
    delay(5_000)
  ]);
}

async function verifyPackagedEditorItemEvents(page) {
  await page.getByRole("button", { name: "Scenes", exact: true }).click();
  await page.getByLabel("Scene name").waitFor({ state: "visible" });
  if (!(await page.getByLabel("Scene name").inputValue()).includes("Locked Cabinet")) {
    await page.getByRole("button", { name: "Switch scenes", exact: true }).click();
    await page.getByRole("menuitemradio").filter({ hasText: "Locked Cabinet" }).click();
  }

  const cabinetHotspot = page.getByRole("button", { name: /^Unlock Cabinet:/u }).first();
  await cabinetHotspot.evaluate((element) => element.click());
  const inspector = page.locator(".scenes-floating-inspector");
  if (!(await inspector.isVisible())) {
    await cabinetHotspot.evaluate((element) => element.click());
  }
  await inspector.waitFor({ state: "visible" });

  const eventLabels = (await inspector.locator("summary.scenes-floating-inspector__section-title").allTextContents()).map(normalizeText);
  assert(eventLabels.includes("On click"), "Placement hotspot is missing its On click event.");
  assert(eventLabels.includes("Use Brass Key"), "Placement hotspot does not name its matching-item event.");
  assert(eventLabels.includes("Any other item"), "Placement hotspot is missing its wrong-item event.");
  assert(!eventLabels.includes("Otherwise"), "The ambiguous Otherwise event is still exposed.");

  const clickSection = inspector
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: /^On click$/u }) })
    .first();
  const clickFeedback = clickSection.getByLabel("Player feedback");
  assert.equal(await clickFeedback.inputValue(), "", "Placement hotspot unexpectedly has On click feedback.");
  const feedbackOptionGroups = await clickFeedback.locator("optgroup").evaluateAll((groups) =>
    groups.map((group) => group.getAttribute("label"))
  );
  assert.deepEqual(feedbackOptionGroups, [
    "Random from a response group",
    "One specific response",
    "Dialogue"
  ]);
  await clickFeedback.selectOption("dialogue:dialogue_mara_key_hint");
  assert.equal(await clickFeedback.inputValue(), "dialogue:dialogue_mara_key_hint");
  const matchingItemSection = inspector
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: /^Use Brass Key$/u }) })
    .first();
  if ((await matchingItemSection.getAttribute("open")) !== null) {
    await matchingItemSection.locator("summary").click();
  }
  await inspector
    .locator("summary", { hasText: /^Any other item$/u })
    .scrollIntoViewIfNeeded();
  const inspectorScreenshotPath = path.join(outputDirectory, "packaged-editor-item-events-inspector.png");
  await page.screenshot({ path: inspectorScreenshotPath, fullPage: true });

  await page.getByRole("button", { name: "Playtest", exact: true }).click();
  await page.locator(".mage2-player").waitFor({ state: "visible" });
  const adapter = createEditorAdapter(page);
  await adapter.reset();
  await adapter.activate({ id: "hotspot_dock_mara_opening" });
  await waitForDialogue(page);
  await page.locator(".mage2-player__dialogue-continue").click();
  await page.locator(".mage2-player__dialogue-choice").first().waitFor({ state: "visible" });
  await page.locator(".mage2-player__dialogue-choice").first().click();
  await page.locator(".mage2-player__dialogue-continue").waitFor({ state: "visible" });
  await page.locator(".mage2-player__dialogue-continue").click();
  await page.locator(".mage2-player__dialogue").waitFor({ state: "detached" });
  await adapter.activate({ id: "hotspot_dock_to_workshop_locked" });
  await adapter.assertScene("scene_workshop_locked");
  await adapter.activate({ id: "hotspot_workshop_cabinet_unlock" });
  await waitForDialogue(page);
  const dialogueText = normalizeText(await page.locator(".mage2-player__dialogue-text").innerText());
  const screenshotPath = path.join(outputDirectory, "packaged-editor-item-events-playtest.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await page.getByRole("button", { name: "Scenes", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(
    await clickSection.getByLabel("Player feedback").inputValue(),
    "",
    "Temporary On click feedback change was not reverted."
  );

  return {
    inspectorVisible: true,
    eventLabels,
    noOtherwiseSection: true,
    feedbackOptionGroups,
    authoredDialogueFeedbackRanInPlaytest: true,
    dialogueText,
    inspectorScreenshotPath,
    screenshotPath
  };
}

async function assertExportContainsSharedRenderer() {
  const indexHtml = await readFile(path.join(buildDirectory, "index.html"), "utf8");
  const stylesheetMatch = indexHtml.match(/href="\.\/assets\/([^"]+\.css)"/u);
  const scriptMatch = indexHtml.match(/src="\.\/assets\/([^"]+\.js)"/u);
  assert(stylesheetMatch, "Exported index does not reference a generated stylesheet.");
  assert(scriptMatch, "Exported index does not reference a generated script.");

  const stylesheet = await readFile(path.join(buildDirectory, "assets", stylesheetMatch[1]), "utf8");
  const script = await readFile(path.join(buildDirectory, "assets", scriptMatch[1]), "utf8");
  assert(stylesheet.includes(".mage2-player__dialogue"), "Exported CSS is missing the shared player renderer.");
  assert(!stylesheet.includes(".runtime-dialogue"), "Exported CSS still contains the removed runtime dialogue renderer.");
  assert(script.includes("mage2-player__hotspot-button"), "Exported JS is missing shared hotspot rendering.");
  assert(script.includes("mage2-player__scene-audio"), "Exported JS is missing shared scene-audio rendering.");
  assert(!script.includes("runtime-inventory__item"), "Exported JS still contains duplicate runtime inventory rendering.");
}

async function runSharedPlayerFlow(page, host, adapter) {
  const captures = [];
  const checks = {};

  await adapter.reset();
  await adapter.assertScene("scene_dock");
  checks.sceneAudioPlayback = await assertSharedSceneAudioPlayback(page, host, "scene_dock");
  captures.push(await captureSurface(page, host, gameplaySteps[0].label, await adapter.getState()));

  await adapter.activate(gameplaySteps[1].activate);
  await waitForDialogue(page);
  captures.push(await captureSurface(page, host, gameplaySteps[1].label, await adapter.getState()));

  const dialogueBlockedState = await adapter.getState();
  await adapter.activateBlocked({ id: "hotspot_dock_to_workshop_locked", name: "Enter Workshop" });
  await adapter.assertScene("scene_dock");
  checks.dialogueBlocksSceneInteraction = true;
  checks.dialogueBlockedState = dialogueBlockedState;

  await continueDialogueByTextClick(page, host);
  await page.locator(".mage2-player__dialogue-choice").first().waitFor({ state: "visible" });
  checks.dialogueTextClickContinues = true;
  captures.push(await captureSurface(page, host, gameplaySteps[2].label, await adapter.getState()));

  await page.locator(".mage2-player__dialogue-choice").first().click();
  await page.locator(".mage2-player__dialogue-continue").waitFor({ state: "visible" });
  captures.push(await captureSurface(page, host, gameplaySteps[3].label, await adapter.getState()));

  await continueDialogueByTextClick(page, host);
  await page.locator(".mage2-player__dialogue").waitFor({ state: "detached" });
  captures.push(await captureSurface(page, host, gameplaySteps[4].label, await adapter.getState()));

  await adapter.activate(gameplaySteps[5].activate);
  await adapter.assertScene(gameplaySteps[5].sceneId);
  captures.push(await captureSurface(page, host, gameplaySteps[5].label, await adapter.getState()));

  const unselectedPlacementState = await adapter.getState();
  const inventoryExpandedBeforeSilentClick = await page
    .locator(".mage2-player__inventory-toggle")
    .getAttribute("aria-expanded");
  await adapter.activateBlocked({ id: "hotspot_workshop_cabinet_unlock", name: "Unlock Cabinet" });
  await adapter.assertScene("scene_workshop_locked");
  assert.deepEqual(
    await adapter.getState(),
    unselectedPlacementState,
    "An unselected placement hotspot changed player state without an authored On click event."
  );
  assert.equal(
    await page.locator(".mage2-player__inventory-toggle").getAttribute("aria-expanded"),
    inventoryExpandedBeforeSilentClick,
    "A silent placement click changed the inventory drawer."
  );
  assert.equal(await page.locator(".mage2-player__inventory-hint").count(), 0, "Legacy inventory fallback UI is still rendered.");
  assert(
    !normalizeText(await page.locator(".mage2-player").innerText()).includes("Not here."),
    "The engine-generated 'Not here.' copy is still visible."
  );
  checks.unselectedPlacementIsSilent = true;
  checks.inventoryDrawerUnchangedOnSilentClick = true;
  checks.engineFallbackCopyAbsent = true;

  await assertRightClickClosesInventoryDrawer(page, host);
  checks.rightClickClosesInventoryDrawer = true;

  await selectInventoryItem(page, gameplaySteps[6].selectItem);
  captures.push(await captureSurface(page, host, gameplaySteps[6].label, await adapter.getState()));

  await assertRightClickCancelsInventorySelection(page, host, gameplaySteps[6].selectItem);
  checks.rightClickCancelsInventorySelection = true;
  await selectInventoryItem(page, gameplaySteps[6].selectItem);

  await adapter.activate(gameplaySteps[7].activate);
  await adapter.assertScene(gameplaySteps[7].sceneId);
  captures.push(await captureSurface(page, host, gameplaySteps[7].label, await adapter.getState()));

  await adapter.activate(gameplaySteps[8].activate);
  await page.getByRole("button", { name: /Close inventory \(1 item\)/u }).waitFor({ state: "visible" });
  captures.push(await captureSurface(page, host, gameplaySteps[8].label, await adapter.getState()));

  await closeInventoryIfExpanded(page);
  await adapter.activate(gameplaySteps[9].activate);
  await adapter.assertScene(gameplaySteps[9].sceneId);
  captures.push(await captureSurface(page, host, gameplaySteps[9].label, await adapter.getState()));

  await adapter.activate(gameplaySteps[10].activate);
  await adapter.assertScene(gameplaySteps[10].sceneId);
  captures.push(await captureSurface(page, host, gameplaySteps[10].label, await adapter.getState()));

  await adapter.activate(gameplaySteps[11].activate);
  await adapter.assertScene(gameplaySteps[11].sceneId);
  captures.push(await captureSurface(page, host, gameplaySteps[11].label, await adapter.getState()));

  await openInventoryIfCollapsed(page);
  await selectInventoryItem(page, gameplaySteps[12].selectItem);
  captures.push(await captureSurface(page, host, gameplaySteps[12].label, await adapter.getState()));

  await adapter.activate(gameplaySteps[13].activate);
  await adapter.assertScene(gameplaySteps[13].sceneId);
  captures.push(await captureSurface(page, host, gameplaySteps[13].label, await adapter.getState()));

  await adapter.activate(gameplaySteps[14].activate);
  await adapter.assertScene(gameplaySteps[14].sceneId);
  captures.push(await captureSurface(page, host, gameplaySteps[14].label, await adapter.getState()));

  await adapter.activate(gameplaySteps[15].activate);
  await adapter.assertScene(gameplaySteps[15].sceneId);
  await waitForDialogue(page);
  captures.push(await captureSurface(page, host, gameplaySteps[15].label, await adapter.getState()));

  assert.equal(captures.length, gameplaySteps.length);
  return { captures, checks };
}

function hasCanonicalGameplayFixture() {
  return runtimeContent.scenes.some((scene) => scene.id === "scene_dock");
}

async function runVerificationFlow(page, host, adapter) {
  if (hasCanonicalGameplayFixture()) {
    return runSharedPlayerFlow(page, host, adapter);
  }

  await adapter.reset();
  const expectedSceneId = runtimeContent.manifest.startSceneId;
  const state = { ...await adapter.getState(), sceneId: expectedSceneId };
  const capture = await captureSurface(page, host, "starter-scene", state);
  return {
    captures: [capture],
    checks: { representativeStarterScene: true, expectedSceneId }
  };
}

function createEditorAdapter(page) {
  const readState = () =>
    page.evaluate(() => {
      if (!window.__mage2PlaytestAutomation) {
        throw new Error("Packaged editor Playtest automation is unavailable.");
      }
      return window.__mage2PlaytestAutomation.getState();
    });

  return {
    reset: async () => {
      await page.evaluate(() => window.__mage2PlaytestAutomation?.reset());
      await settle(page);
    },
    getState: readState,
    assertScene: async (sceneId) => {
      await page.waitForFunction(
        (expectedSceneId) => window.__mage2PlaytestAutomation?.getState().sceneId === expectedSceneId,
        sceneId
      );
    },
    activate: async ({ id }) => {
      await page.evaluate((hotspotId) => window.__mage2PlaytestAutomation?.clickHotspot(hotspotId), id);
      await settle(page);
    },
    activateBlocked: async ({ id }) => {
      await page.evaluate((hotspotId) => window.__mage2PlaytestAutomation?.clickHotspot(hotspotId), id);
      await settle(page);
    }
  };
}

function createRuntimeAdapter(page) {
  return {
    reset: async () => {
      await settle(page);
    },
    getState: async () => {
      const mediaAlt = await page.locator(".mage2-player__media").getAttribute("alt");
      return {
        sceneId: mediaAlt ? sceneIdByMediaAlt[mediaAlt] : undefined,
        mediaAlt,
        inventoryItemLabels: await page.locator(".mage2-player__inventory-slot").evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("aria-label"))
        )
      };
    },
    assertScene: async (sceneId) => {
      const expectedAlt = Object.entries(sceneIdByMediaAlt).find(([, id]) => id === sceneId)?.[0];
      assert(expectedAlt, `No runtime media mapping exists for ${sceneId}.`);
      await page.locator(`.mage2-player__media[alt="${expectedAlt}"]`).waitFor({ state: "visible" });
    },
    activate: async ({ name }) => {
      await page.getByRole("button", { name: new RegExp(`^${escapeRegExp(name)}:`) }).click();
      await settle(page);
    },
    activateBlocked: async ({ name }) => {
      const button = page.getByRole("button", { name: new RegExp(`^${escapeRegExp(name)}:`) });
      await button.evaluate((element) => element.click());
      await settle(page);
    }
  };
}

async function captureSurface(page, host, label, state) {
  const surface = page.locator(".mage2-player");
  await surface.waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".mage2-player img")).every(
      (image) => image.complete && image.naturalWidth > 0
    )
  );
  const expectedSceneAudioAssetId = sceneAudioAssetIdBySceneId[state.sceneId];
  if (expectedSceneAudioAssetId) {
    await page.waitForFunction(
      ({ assetId, sceneId }) => {
        const audio = document.querySelector(".mage2-player__scene-audio");
        return (
          audio instanceof HTMLAudioElement &&
          audio.dataset.sceneAudioAssetId === assetId &&
          audio.dataset.sceneAudioSceneKey === sceneId
        );
      },
      { assetId: expectedSceneAudioAssetId, sceneId: state.sceneId },
      { timeout: 10_000 }
    );
  }
  await settle(page);

  const snapshot = await surface.evaluate((root) => {
    const normalize = (value) => value?.replace(/\s+/gu, " ").trim() ?? "";
    const media = root.querySelector(".mage2-player__media");
    const hiddenButtons = Array.from(root.querySelectorAll(".mage2-player__hotspot-button--hidden"));
    const hiddenStyles = hiddenButtons.map((button) => {
      const style = getComputedStyle(button);
      return {
        ariaLabel: button.getAttribute("aria-label"),
        borderTopColor: style.borderTopColor,
        borderTopWidth: style.borderTopWidth,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
        outlineStyle: style.outlineStyle
      };
    });
    const focusedHiddenStyle = (() => {
      const button = hiddenButtons[0];
      if (!(button instanceof HTMLElement)) {
        return undefined;
      }
      button.focus();
      const style = getComputedStyle(button);
      const result = {
        borderTopColor: style.borderTopColor,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
        outlineStyle: style.outlineStyle
      };
      button.blur();
      return result;
    })();
    const dialogue = root.querySelector(".mage2-player__dialogue");
    const inventory = root.querySelector(".mage2-player__inventory");
    const inventoryDrawer = root.querySelector(".mage2-player__inventory-drawer");
    const sceneAudio = document.querySelector(".mage2-player__scene-audio");
    const sceneSurface = root.querySelector(
      ".mage2-player__scene-surface, .mage2-player__visual-plane"
    );
    const bounds = root.getBoundingClientRect();
    const toBounds = (element) => {
      if (!(element instanceof Element)) {
        return undefined;
      }
      const elementBounds = element.getBoundingClientRect();
      return {
        x: elementBounds.x,
        y: elementBounds.y,
        width: elementBounds.width,
        height: elementBounds.height,
        top: elementBounds.top,
        right: elementBounds.right,
        bottom: elementBounds.bottom,
        left: elementBounds.left
      };
    };
    const hasInternalOverflow = (element) =>
      element instanceof HTMLElement &&
      (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1);
    const isInsideViewport = (element) => {
      const elementBounds = element instanceof Element ? element.getBoundingClientRect() : undefined;
      return Boolean(
        elementBounds &&
          elementBounds.top >= -1 &&
          elementBounds.left >= -1 &&
          elementBounds.right <= window.innerWidth + 1 &&
          elementBounds.bottom <= window.innerHeight + 1
      );
    };
    const rectanglesOverlap = (first, second) =>
      Boolean(
        first &&
          second &&
          first.left < second.right - 1 &&
          first.right > second.left + 1 &&
          first.top < second.bottom - 1 &&
          first.bottom > second.top + 1
      );
    const dialogueText = dialogue?.querySelector(".mage2-player__dialogue-text");
    const dialogueChoices = dialogue?.querySelector(".mage2-player__dialogue-choices");
    const dialogueControls = dialogue
      ? Array.from(
          dialogue.querySelectorAll(
            ".mage2-player__dialogue-choice, .mage2-player__dialogue-continue"
          )
        )
      : [];
    const dialogueBounds = toBounds(dialogue);
    const drawerBounds = toBounds(inventoryDrawer);
    const inventoryExpanded = Boolean(
      inventory?.classList.contains("mage2-player__inventory--expanded")
    );

    return {
      text: normalize(root.innerText),
      media: media
        ? {
            tagName: media.tagName,
            alt: media.getAttribute("alt"),
            naturalWidth: media instanceof HTMLImageElement ? media.naturalWidth : undefined,
            naturalHeight: media instanceof HTMLImageElement ? media.naturalHeight : undefined,
            objectFit: getComputedStyle(media).objectFit
          }
        : undefined,
      hotspots: Array.from(root.querySelectorAll(".mage2-player__hotspot-button")).map((button) => ({
        ariaLabel: button.getAttribute("aria-label"),
        ariaDisabled: button.getAttribute("aria-disabled"),
        tabIndex: button.tabIndex,
        hidden: button.classList.contains("mage2-player__hotspot-button--hidden"),
        debug: button.classList.contains("mage2-player__hotspot-button--debug")
      })),
      hiddenStyles,
      focusedHiddenStyle,
      dialogue: dialogue
        ? {
            speaker: normalize(dialogue.querySelector(".mage2-player__dialogue-speaker")?.textContent),
            text: normalize(dialogue.querySelector(".mage2-player__dialogue-text")?.textContent),
            choices: Array.from(dialogue.querySelectorAll(".mage2-player__dialogue-choice")).map((choice) =>
              normalize(choice.textContent)
            ),
            continue: normalize(dialogue.querySelector(".mage2-player__dialogue-continue")?.textContent)
          }
        : undefined,
      inventory: inventory
        ? {
            expanded: inventory.classList.contains("mage2-player__inventory--expanded"),
            toggleLabel: inventory.querySelector(".mage2-player__inventory-toggle")?.getAttribute("aria-label"),
            count: normalize(inventory.querySelector(".mage2-player__inventory-count")?.textContent),
            slots: Array.from(inventory.querySelectorAll(".mage2-player__inventory-slot")).map((slot) => ({
              label: slot.getAttribute("aria-label"),
              pressed: slot.getAttribute("aria-pressed")
            }))
          }
        : undefined,
      sceneAudio:
        sceneAudio instanceof HTMLAudioElement
          ? {
              assetId: sceneAudio.dataset.sceneAudioAssetId,
              sceneKey: sceneAudio.dataset.sceneAudioSceneKey,
              enabled: sceneAudio.dataset.sceneAudioEnabled,
              loop: sceneAudio.dataset.sceneAudioLoop,
              delayMs: sceneAudio.dataset.sceneAudioDelayMs,
              durationMs: sceneAudio.dataset.sceneAudioDurationMs
            }
          : undefined,
      visibility: {
        dialogue: dialogue
          ? {
              bounds: dialogueBounds,
              insideViewport: isInsideViewport(dialogue),
              controlsInsideViewport: dialogueControls.every(isInsideViewport),
              containerClipped: hasInternalOverflow(dialogue),
              textClipped: hasInternalOverflow(dialogueText),
              choicesClipped: hasInternalOverflow(dialogueChoices)
            }
          : undefined,
        inventoryDialogueOverlap:
          inventoryExpanded && dialogueBounds && drawerBounds
            ? rectanglesOverlap(dialogueBounds, drawerBounds)
            : false
      },
      layout: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        sceneSurface: toBounds(sceneSurface),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight
      }
    };
  });

  assertHiddenHotspotsAreInvisible(snapshot, `${host}/${label}`);
  const screenshotPath = path.join(outputDirectory, `${host}-${label}.png`);
  await surface.screenshot({ path: screenshotPath });
  return { label, screenshotPath, state, snapshot };
}

function assertHiddenHotspotsAreInvisible(snapshot, context) {
  assert(snapshot.hiddenStyles.length > 0, `${context} has no hidden hotspots to verify.`);
  for (const style of [...snapshot.hiddenStyles, snapshot.focusedHiddenStyle].filter(Boolean)) {
    assert(isTransparent(style.borderTopColor), `${context} exposes a hidden hotspot border: ${style.borderTopColor}`);
    assert(isTransparent(style.backgroundColor), `${context} exposes a hidden hotspot fill: ${style.backgroundColor}`);
    assert.equal(style.backgroundImage, "none", `${context} exposes a hidden hotspot background image.`);
    assert.equal(style.boxShadow, "none", `${context} exposes a hidden hotspot box shadow.`);
    assert.equal(style.outlineStyle, "none", `${context} exposes a hidden hotspot outline.`);
  }
}

function compareCaptureSets(editorCaptures, desktopCaptures, mobileCaptures) {
  assert.equal(editorCaptures.length, gameplaySteps.length);
  assert.equal(desktopCaptures.length, gameplaySteps.length);
  assert.equal(mobileCaptures.length, gameplaySteps.length);

  return gameplaySteps.map((step, index) => {
    const editor = editorCaptures[index];
    const desktop = desktopCaptures[index];
    const mobile = mobileCaptures[index];
    assert.equal(editor.label, step.label);
    assert.equal(desktop.label, step.label);
    assert.equal(mobile.label, step.label);
    assert.equal(editor.state.sceneId, step.sceneId, `Packaged editor scene mismatch at ${step.label}.`);
    assert.equal(desktop.state.sceneId, step.sceneId, `Desktop runtime scene mismatch at ${step.label}.`);
    assert.equal(mobile.state.sceneId, step.sceneId, `Mobile runtime scene mismatch at ${step.label}.`);

    const editorSignature = resolveParitySignature(editor.snapshot);
    const desktopSignature = resolveParitySignature(desktop.snapshot);
    const mobileSignature = resolveParitySignature(mobile.snapshot);
    assert.deepEqual(desktopSignature, editorSignature, `Desktop runtime diverged at ${step.label}.`);
    assert.deepEqual(mobileSignature, editorSignature, `390x844 runtime diverged at ${step.label}.`);

    assert(desktop.snapshot.layout.width >= 1200, `Desktop scene is not immersive at ${step.label}.`);
    assert(mobile.snapshot.layout.width >= 389, `Mobile scene does not maximize the available width at ${step.label}.`);
    assert(
      mobile.snapshot.layout.scrollWidth <= mobile.snapshot.layout.viewportWidth,
      `Mobile layout overflows horizontally at ${step.label}.`
    );
    assert(
      mobile.snapshot.layout.scrollHeight <= mobile.snapshot.layout.viewportHeight,
      `Mobile layout scrolls vertically at ${step.label}.`
    );
    if (mobile.snapshot.dialogue) {
      const visibility = mobile.snapshot.visibility.dialogue;
      assert(visibility, `Mobile dialogue visibility metrics are missing at ${step.label}.`);
      assert(visibility.insideViewport, `Mobile dialogue leaves the viewport at ${step.label}.`);
      assert(
        visibility.controlsInsideViewport,
        `Mobile dialogue controls leave the viewport at ${step.label}.`
      );
      assert(!visibility.containerClipped, `Mobile dialogue container clips at ${step.label}.`);
      assert(!visibility.textClipped, `Mobile dialogue text clips at ${step.label}.`);
      assert(!visibility.choicesClipped, `Mobile dialogue choices clip at ${step.label}.`);
    }
    assert(
      !mobile.snapshot.visibility.inventoryDialogueOverlap,
      `Mobile inventory drawer overlaps dialogue at ${step.label}.`
    );

    const sceneSurface = mobile.snapshot.layout.sceneSurface;
    assert(sceneSurface, `Mobile visual plane metrics are missing at ${step.label}.`);
    assert(sceneSurface.width >= 389, `Mobile visual plane does not use the available width at ${step.label}.`);
    assert(
      Math.abs(sceneSurface.width / sceneSurface.height - 16 / 9) < 0.02,
      `Mobile visual plane changed the authored aspect ratio at ${step.label}.`
    );

    return {
      label: step.label,
      sceneId: step.sceneId,
      editorDesktopExact: true,
      editorMobileExact: true
    };
  });
}

function compareVerificationCaptures(editorCaptures, desktopCaptures, mobileCaptures) {
  if (hasCanonicalGameplayFixture()) {
    return compareCaptureSets(editorCaptures, desktopCaptures, mobileCaptures);
  }

  assert.equal(editorCaptures.length, 1);
  assert.equal(desktopCaptures.length, 1);
  assert.equal(mobileCaptures.length, 1);
  const [editor] = editorCaptures;
  const [desktop] = desktopCaptures;
  const [mobile] = mobileCaptures;
  assert.deepEqual(resolveParitySignature(desktop.snapshot), resolveParitySignature(editor.snapshot));
  assert.deepEqual(resolveParitySignature(mobile.snapshot), resolveParitySignature(editor.snapshot));
  assert(desktop.snapshot.layout.width >= 1200, "Desktop starter scene is not immersive.");
  assert(mobile.snapshot.layout.width >= 389, "Mobile starter scene does not maximize the available width.");
  assert(
    mobile.snapshot.layout.scrollWidth <= mobile.snapshot.layout.viewportWidth,
    "Mobile starter scene overflows horizontally."
  );
  return [{
    label: "starter-scene",
    sceneId: runtimeContent.manifest.startSceneId,
    editorDesktopExact: true,
    editorMobileExact: true
  }];
}

function resolveParitySignature(snapshot) {
  return {
    text: snapshot.text,
    media: snapshot.media,
    hotspots: snapshot.hotspots,
    dialogue: snapshot.dialogue,
    inventory: snapshot.inventory,
    sceneAudio: snapshot.sceneAudio
  };
}

async function assertSharedSceneAudioPlayback(page, host, sceneId) {
  const expectedAssetId = sceneAudioAssetIdBySceneId[sceneId];
  assert(expectedAssetId, `No exported scene-audio asset is configured for ${sceneId}.`);

  await page.waitForFunction(
    ({ assetId, expectedSceneId }) => {
      const audio = document.querySelector(".mage2-player__scene-audio");
      return (
        audio instanceof HTMLAudioElement &&
        audio.dataset.sceneAudioAssetId === assetId &&
        audio.dataset.sceneAudioSceneKey === expectedSceneId &&
        audio.dataset.sceneAudioEnabled === "true" &&
        audio.readyState >= HTMLMediaElement.HAVE_METADATA
      );
    },
    { assetId: expectedAssetId, expectedSceneId: sceneId },
    { timeout: 30_000 }
  );

  const audio = page.locator(".mage2-player__scene-audio");
  await page.locator(".mage2-player__scene-surface").click({ position: { x: 2, y: 2 }, force: true });
  const before = await audio.evaluate(async (element) => {
    await element.play();
    return {
      currentTime: element.currentTime,
      duration: element.duration,
      readyState: element.readyState
    };
  });
  await page.waitForTimeout(240);
  const after = await audio.evaluate((element) => ({
    currentTime: element.currentTime,
    duration: element.duration,
    paused: element.paused,
    readyState: element.readyState
  }));
  const loopedDuringSample =
    Number.isFinite(after.duration) &&
    before.currentTime >= after.duration - 0.25 &&
    after.currentTime < before.currentTime;

  assert(!after.paused, `${host} scene audio did not remain playing.`);
  assert(
    after.currentTime >= before.currentTime + 0.03 || loopedDuringSample,
    `${host} scene audio clock did not advance.`
  );

  return {
    assetId: expectedAssetId,
    sceneId,
    readyState: after.readyState,
    playbackAdvanced: true
  };
}

async function refreshExportedSceneAudioExpectations() {
  const exportedManifest = JSON.parse(await readFile(path.join(buildDirectory, "build-manifest.json"), "utf8"));
  runtimeContent = JSON.parse(
    await readFile(path.join(buildDirectory, exportedManifest.contentPath), "utf8")
  );
  sceneAudioAssetIdBySceneId = Object.fromEntries(
    runtimeContent.scenes
      .filter((scene) => scene.sceneAudioAssetId)
      .map((scene) => [scene.id, scene.sceneAudioAssetId])
  );
}

async function runRuntimeHostChecks(activeBrowser, url) {
  const context = await activeBrowser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await openFreshRuntime(page, url);

  assert.equal(await page.locator(".runtime-debug-panel").count(), 0, "Production player exposes debug tools.");
  assert.equal(await page.getByText("Raw save state", { exact: true }).count(), 0, "Production player exposes raw save state.");
  assert.equal(await page.getByText("Playhead", { exact: false }).count(), 0, "Production player exposes the playhead.");

  let hostLocaleControls = await openRuntimeSettingsAndGetLocaleControls(page);
  await hostLocaleControls.interface.selectOption("fr");
  await page.waitForFunction(() => document.documentElement.lang === "fr");
  await page.locator(".mage2-experience__close").click();
  await page.getByRole("button", { name: /Ouvrir l’inventaire \(0 objets\)/u }).waitFor({ state: "visible" });

  await openRuntimeMenu(page);
  assert.equal(await page.getByRole("button", { name: "Sauvegarder", exact: true }).count(), 1);
  await page.locator(".mage2-experience__panel-actions button").nth(4).click();
  await page.locator(".mage2-experience__settings").waitFor({ state: "visible" });
  hostLocaleControls = await getRuntimeLocaleControls(page);
  await hostLocaleControls.interface.selectOption("en");
  await page.waitForFunction(() => document.documentElement.lang === "en");
  await page.waitForFunction(
    () => Boolean(document.querySelector(".mage2-experience__panel")?.contains(document.activeElement)),
    undefined,
    { timeout: 2_000 }
  );
  await page.keyboard.press("Shift+Tab");
  assert(
    await page.evaluate(() => Boolean(document.querySelector(".mage2-experience__panel")?.contains(document.activeElement))),
    "Player menu focus escaped while tabbing."
  );
  await page.keyboard.press("Escape");
  await page.locator(".mage2-experience__panel").waitFor({ state: "detached" });
  await page.waitForFunction(
    () => document.activeElement?.classList.contains("mage2-experience__menu-button"),
    undefined,
    { timeout: 2_000 }
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.classList.contains("mage2-experience__menu-button")),
    true,
    "Closing the player menu did not restore focus."
  );

  if (!hasCanonicalGameplayFixture()) {
    const layout = await page.evaluate(() => ({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight
      }
    }));
    await context.close();
    return {
      productionAuthorToolsAbsent: true,
      localeUpdatesDocumentLanguage: true,
      menuFocusIsTrappedAndRestored: true,
      gameplayFixtureChecksSkipped: true,
      layout
    };
  }

  await progressToDockWithKey(page);
  await openRuntimeMenu(page);
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await page.locator(".mage2-experience__status").filter({ hasText: "Game saved." }).waitFor({ state: "visible" });
  await clickRuntimeHotspot(page, "Enter Workshop");
  await page.locator('.mage2-player__media[alt="Workshop Cabinet Locked"]').waitFor({ state: "visible" });

  await openRuntimeMenu(page);
  await page.getByRole("button", { name: "Load game", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Load game", exact: true }).click();
  await page.locator('.mage2-player__media[alt="Dock at Blue Hour"]').waitFor({ state: "visible" });
  assert.equal(await page.locator(".mage2-player__inventory-count").innerText(), "1");

  await openRuntimeMenu(page);
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "New game", exact: true }).click();
  await page.locator('.mage2-player__media[alt="Dock at Blue Hour"]').waitFor({ state: "visible" });
  assert.equal(await page.locator(".mage2-player__inventory-count").innerText(), "0");

  const storageKey = `mage2-runtime-save:${buildManifest.projectId}`;
  await page.evaluate(([key]) => localStorage.setItem(key, "{malformed-save"), [storageKey]);
  await page.reload();
  await page.locator(".mage2-experience").waitFor({ state: "visible" });
  await page.locator(".mage2-experience__status").filter({ hasText: "The saved game could not be read" }).waitFor({
    state: "visible"
  });
  assert.equal(await page.evaluate(([key]) => localStorage.getItem(key), [storageKey]), null);

  const debugPage = await context.newPage();
  await debugPage.goto(`${url}?debug=1`, { waitUntil: "domcontentloaded" });
  await enterRuntimeGameIfTitle(debugPage);
  await debugPage.locator(".mage2-player").waitFor({ state: "visible" });
  await debugPage.getByLabel("Show hotspots").check();
  await debugPage.waitForTimeout(180);
  const debugStyle = await debugPage.locator(".mage2-player__hotspot-button--debug").first().evaluate((button) => {
    const style = getComputedStyle(button);
    return { borderTopColor: style.borderTopColor, boxShadow: style.boxShadow };
  });
  assert(!isTransparent(debugStyle.borderTopColor), "Debug hotspot border is not visible after opt-in.");
  assert.notEqual(debugStyle.boxShadow, "none", "Debug hotspot shadow is not visible after opt-in.");

  const mobileLayout = await page.evaluate(() => ({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    document: {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight
    },
    backdrop: (() => {
      const bounds = document.querySelector(".runtime-player-backdrop")?.getBoundingClientRect();
      return bounds ? { width: bounds.width, height: bounds.height } : undefined;
    })()
  }));

  await debugPage.close();
  await context.close();
  return {
    productionAuthorToolsAbsent: true,
    localeUpdatesDocumentLanguage: true,
    menuFocusIsTrappedAndRestored: true,
    saveLoadRestartPassed: true,
    malformedSaveRecovered: true,
    debugModeIsExplicitAndVisible: true,
    layout: mobileLayout
  };
}

async function verifyElectronPersistence() {
  if (!hasCanonicalGameplayFixture()) {
    return verifyGenericElectronLocalePersistence();
  }
  await closeRunningWindowsProcessesAtPath(runtimeExecutablePath);
  const firstApp = await electron.launch({
    executablePath: runtimeExecutablePath,
    cwd: path.dirname(runtimeExecutablePath)
  });
  let firstUrl;
  try {
    const page = await firstApp.firstWindow();
    await page.locator(".mage2-experience").waitFor({ state: "visible", timeout: 30_000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await enterRuntimeGameIfTitle(page);
    await page.locator(".mage2-player").waitFor({ state: "visible" });
    await progressToDockWithKey(page);
    await clickRuntimeHotspot(page, "Enter Workshop");
    await page.locator('.mage2-player__media[alt="Workshop Cabinet Locked"]').waitFor({ state: "visible" });
    await openRuntimeMenu(page);
    await page.getByRole("button", { name: "Save game", exact: true }).click();
    firstUrl = page.url();
    await page.screenshot({ path: path.join(outputDirectory, "electron-before-relaunch.png") });
  } finally {
    await firstApp.close().catch(() => {});
  }

  const secondApp = await electron.launch({
    executablePath: runtimeExecutablePath,
    cwd: path.dirname(runtimeExecutablePath)
  });
  try {
    const page = await secondApp.firstWindow();
    await page.locator(".mage2-experience").waitFor({ state: "visible", timeout: 30_000 });
    await enterRuntimeGameIfTitle(page);
    await page.locator(".mage2-player").waitFor({ state: "visible", timeout: 30_000 });
    assert.equal(page.url(), firstUrl, "Electron player origin changed across launches.");
    await page.locator('.mage2-player__media[alt="Workshop Cabinet Locked"]').waitFor({ state: "visible" });
    assert.equal(await page.locator(".mage2-player__inventory-count").innerText(), "1");
    await page.screenshot({ path: path.join(outputDirectory, "electron-after-relaunch.png") });

    await openRuntimeMenu(page);
    await page.getByRole("button", { name: "New game", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "New game", exact: true }).click();
    await page.locator('.mage2-player__media[alt="Dock at Blue Hour"]').waitFor({ state: "visible" });
    return {
      stableUrl: firstUrl,
      persistedSceneId: "scene_workshop_locked",
      persistedInventoryCount: 1,
      restartedCleanlyAfterProof: true
    };
  } finally {
    await secondApp.close().catch(() => {});
  }
}

async function progressToDockWithKey(page) {
  await clickRuntimeHotspot(page, "Talk to Mara");
  await page.locator(".mage2-player__dialogue-continue").click();
  await page.locator(".mage2-player__dialogue-choice").first().click();
  await page.locator(".mage2-player__dialogue-continue").click();
  await page.locator(".mage2-player__dialogue").waitFor({ state: "detached" });
}

async function clickRuntimeHotspot(page, name) {
  await page.getByRole("button", { name: new RegExp(`^${escapeRegExp(name)}:`) }).click();
  await settle(page);
}

async function openRuntimeMenu(page) {
  const menu = page.locator(".mage2-experience__panel");
  if (await menu.isVisible().catch(() => false)) {
    return;
  }
  await page.locator(".mage2-experience__menu-button").click();
  await menu.waitFor({ state: "visible" });
}

async function verifyGenericElectronLocalePersistence() {
  await closeRunningWindowsProcessesAtPath(runtimeExecutablePath);
  const firstApp = await electron.launch({
    executablePath: runtimeExecutablePath,
    cwd: path.dirname(runtimeExecutablePath)
  });
  let firstUrl;
  try {
    const page = await firstApp.firstWindow();
    await page.locator(".mage2-experience").waitFor({ state: "visible", timeout: 30_000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await enterRuntimeGameIfTitle(page);
    const controls = await openRuntimeSettingsAndGetLocaleControls(page);
    await controls.interface.selectOption("ja");
    await page.waitForFunction(() => document.documentElement.lang === "ja");
    firstUrl = page.url();
    await page.screenshot({ path: path.join(outputDirectory, "electron-before-relaunch.png") });
  } finally {
    await firstApp.close().catch(() => {});
  }

  const secondApp = await electron.launch({
    executablePath: runtimeExecutablePath,
    cwd: path.dirname(runtimeExecutablePath)
  });
  try {
    const page = await secondApp.firstWindow();
    await page.locator(".mage2-experience").waitFor({ state: "visible", timeout: 30_000 });
    await enterRuntimeGameIfTitle(page);
    assert.equal(page.url(), firstUrl, "Electron player origin changed across launches.");
    const controls = await openRuntimeSettingsAndGetLocaleControls(page);
    assert.equal(await controls.interface.inputValue(), "ja");
    assert.equal(await page.evaluate(() => document.documentElement.lang), "ja");
    await page.screenshot({ path: path.join(outputDirectory, "electron-after-relaunch.png") });
    return { stableUrl: firstUrl, persistedInterfaceLocale: "ja", restartedCleanlyAfterProof: true };
  } finally {
    await secondApp.close().catch(() => {});
  }
}

async function verifyRuntimeLocalization(activeBrowser, url, host, viewportOptions) {
  const automatic = [];
  for (const localeCase of BUILT_IN_LOCALE_CASES) {
    automatic.push(await verifyAutomaticRuntimeLocale(activeBrowser, url, host, viewportOptions, {
      label: localeCase.locale,
      browserLocale: localeCase.browserLocale,
      expectedLocale: localeCase.locale
    }));
  }
  for (const fallbackCase of FALLBACK_LOCALE_CASES) {
    automatic.push(await verifyAutomaticRuntimeLocale(activeBrowser, url, host, viewportOptions, fallbackCase));
  }

  const context = await activeBrowser.newContext({ ...viewportOptions, locale: "en-US" });
  const page = await context.newPage();
  const explicit = [];
  try {
    await openFreshRuntime(page, url);
    let controls = await openRuntimeSettingsAndGetLocaleControls(page);
    const initialGameLocale = await controls.game.inputValue();
    for (const localeCase of BUILT_IN_LOCALE_CASES) {
      await controls.interface.selectOption(localeCase.locale);
      await page.waitForFunction(
        ([language, direction]) => document.documentElement.lang === language && document.documentElement.dir === direction,
        [localeCase.locale, localeCase.direction]
      );
      controls = await getRuntimeLocaleControls(page);
      const state = await readRuntimeLocaleState(page, controls);
      assertRuntimeLocaleState(state, {
        locale: localeCase.locale,
        preference: localeCase.locale,
        direction: localeCase.direction,
        gameLocale: initialGameLocale
      }, `${host} explicit ${localeCase.locale}`);
      const screenshotPath = path.join(outputDirectory, `${host}-localization-explicit-${localeCase.locale}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      explicit.push({ locale: localeCase.locale, ...state, screenshotPath });
    }

    await controls.interface.selectOption("ja");
    await page.waitForFunction(() => document.documentElement.lang === "ja");
    await page.reload({ waitUntil: "domcontentloaded" });
    await enterRuntimeGameIfTitle(page);
    controls = await openRuntimeSettingsAndGetLocaleControls(page);
    const persisted = await readRuntimeLocaleState(page, controls);
    assertRuntimeLocaleState(persisted, {
      locale: "ja",
      preference: "ja",
      direction: "ltr",
      gameLocale: initialGameLocale
    }, `${host} persisted override`);

    await controls.interface.selectOption("automatic");
    await page.waitForFunction(() => document.documentElement.lang === "en" && document.documentElement.dir === "ltr");
    controls = await getRuntimeLocaleControls(page);
    const reset = await readRuntimeLocaleState(page, controls);
    assertRuntimeLocaleState(reset, {
      locale: "en",
      preference: "automatic",
      direction: "ltr",
      gameLocale: initialGameLocale
    }, `${host} automatic reset`);

    const alternateGameLocale = getRuntimeSupportedLocales().find((locale) => locale !== initialGameLocale);
    const separationGameLocale = alternateGameLocale ?? initialGameLocale;
    await controls.interface.selectOption("ar");
    await page.waitForFunction(() => document.documentElement.lang === "ar" && document.documentElement.dir === "rtl");
    controls = await getRuntimeLocaleControls(page);
    if (alternateGameLocale) {
      await controls.game.selectOption(alternateGameLocale);
    }
    const separated = await readRuntimeLocaleState(page, controls);
    assertRuntimeLocaleState(separated, {
      locale: "ar",
      preference: "ar",
      direction: "rtl",
      gameLocale: separationGameLocale
    }, `${host} interface/game separation`);
    const separationScreenshotPath = path.join(outputDirectory, `${host}-localization-interface-ar-game-${separationGameLocale}.png`);
    await page.screenshot({ path: separationScreenshotPath, fullPage: true });

    return {
      viewport: viewportOptions,
      automatic,
      explicit,
      persistence: persisted,
      reset,
      interfaceGameSeparation: { ...separated, screenshotPath: separationScreenshotPath }
    };
  } finally {
    await context.close();
  }
}

async function verifyAutomaticRuntimeLocale(activeBrowser, url, host, viewportOptions, localeCase) {
  const context = await activeBrowser.newContext({ ...viewportOptions, locale: localeCase.browserLocale });
  const page = await context.newPage();
  try {
    await openFreshRuntime(page, url);
    const controls = await openRuntimeSettingsAndGetLocaleControls(page);
    const state = await readRuntimeLocaleState(page, controls);
    const expectedGameLocale = resolveExpectedInitialGameLocale(localeCase.expectedLocale);
    assertRuntimeLocaleState(state, {
      locale: localeCase.expectedLocale,
      preference: "automatic",
      direction: directionForLocale(localeCase.expectedLocale),
      gameLocale: expectedGameLocale
    }, `${host} automatic ${localeCase.browserLocale}`);
    const screenshotPath = path.join(outputDirectory, `${host}-localization-automatic-${localeCase.label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return { ...localeCase, ...state, screenshotPath };
  } finally {
    await context.close();
  }
}

async function openRuntimeSettingsAndGetLocaleControls(page) {
  await openRuntimeMenu(page);
  const menuActions = page.locator(".mage2-experience__panel-actions button");
  assert((await menuActions.count()) >= 5, "Player menu does not expose the expected settings action.");
  await menuActions.nth(4).click();
  await page.locator(".mage2-experience__settings").waitFor({ state: "visible" });
  return getRuntimeLocaleControls(page);
}

async function getRuntimeLocaleControls(page) {
  const selects = page.locator(".mage2-experience__settings select");
  const interfaceIndex = await selects.evaluateAll((elements) =>
    elements.findIndex((element) => Array.from(element.options).some((option) => option.value === "automatic"))
  );
  assert(interfaceIndex >= 0, "Player settings do not expose an interface locale selector.");
  const gameIndex = await selects.evaluateAll((elements) =>
    elements.findIndex((element) => !Array.from(element.options).some((option) => option.value === "automatic"))
  );
  assert(gameIndex >= 0, "Player settings do not expose a game locale selector.");
  return { interface: selects.nth(interfaceIndex), game: selects.nth(gameIndex) };
}

async function readRuntimeLocaleState(page, controls) {
  const documentLocale = await page.evaluate(() => ({
    documentLanguage: document.documentElement.lang,
    documentDirection: document.documentElement.dir
  }));
  return {
    ...documentLocale,
    interfacePreference: await controls.interface.inputValue(),
    gameLocale: await controls.game.inputValue()
  };
}

function resolveExpectedInitialGameLocale(interfaceLocale) {
  const supportedLocales = getRuntimeSupportedLocales();
  const matchingLocale = supportedLocales.find((locale) => {
    if (interfaceLocale === "zh-Hans") {
      return locale === "zh" || locale.toLowerCase().startsWith("zh-hans") || locale.toLowerCase().startsWith("zh-cn");
    }
    return locale.toLowerCase().split("-")[0] === interfaceLocale;
  });
  return matchingLocale ?? runtimeContent.manifest.defaultLanguage;
}

function getRuntimeSupportedLocales() {
  return Array.from(new Set([
    runtimeContent.manifest.defaultLanguage,
    ...(runtimeContent.manifest.supportedLocales ?? [])
  ]));
}

async function openInventoryIfCollapsed(page) {
  const toggle = page.locator(".mage2-player__inventory-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
}

async function closeInventoryIfExpanded(page) {
  const toggle = page.locator(".mage2-player__inventory-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "true") {
    await toggle.click();
  }
}

async function selectInventoryItem(page, label) {
  await openInventoryIfCollapsed(page);
  await page.waitForTimeout(220);
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: label, exact: true }).waitFor({ state: "visible" });
  await settle(page);
}

async function continueDialogueByTextClick(page, host) {
  const dialogueText = page.locator(".mage2-player__dialogue-text");
  const bounds = await dialogueText.boundingBox();
  assert(bounds, `${host} has no visible dialogue text for the surface-click continuation check.`);
  await page.mouse.click(
    bounds.x + Math.min(20, Math.max(1, bounds.width / 2)),
    bounds.y + Math.min(20, Math.max(1, bounds.height / 2))
  );
  await settle(page);
}

async function assertRightClickCancelsInventorySelection(page, host, label) {
  assert.equal(
    await getInventorySlotPressedState(page, label),
    "true",
    `${host} did not select '${label}' before its cancellation check.`
  );

  const sceneSurface = page.locator(".mage2-player__scene-surface");
  const bounds = await sceneSurface.boundingBox();
  assert(bounds, `${host} has no visible scene surface for the right-click cancellation check.`);
  await page.mouse.click(bounds.x + 12, bounds.y + 12, { button: "right" });
  await settle(page);

  assert.equal(
    await getInventorySlotPressedState(page, label),
    "false",
    `${host} did not clear '${label}' after right-clicking the scene.`
  );
  assert.equal(
    await page.locator(".mage2-player__inventory-toggle").evaluate((element) =>
      element.classList.contains("mage2-player__inventory-toggle--selected")
    ),
    false,
    `${host} still presents an inventory selection after right-clicking the scene.`
  );
  await page.locator(".mage2-player").screenshot({
    path: path.join(outputDirectory, `${host}-07-key-right-click-cancelled.png`)
  });
}

async function assertRightClickClosesInventoryDrawer(page, host) {
  await openInventoryIfCollapsed(page);
  const inventoryToggle = page.locator(".mage2-player__inventory-toggle");
  assert.equal(
    await inventoryToggle.getAttribute("aria-expanded"),
    "true",
    `${host} did not open the inventory before its right-click close check.`
  );

  const sceneSurface = page.locator(".mage2-player__scene-surface");
  const bounds = await sceneSurface.boundingBox();
  assert(bounds, `${host} has no visible scene surface for the inventory close check.`);
  await page.mouse.click(bounds.x + 12, bounds.y + 12, { button: "right" });
  await settle(page);

  assert.equal(
    await inventoryToggle.getAttribute("aria-expanded"),
    "false",
    `${host} did not close the inventory after right-clicking the scene.`
  );
  await page.locator(".mage2-player").screenshot({
    path: path.join(outputDirectory, `${host}-06-inventory-right-click-closed.png`)
  });
}

async function getInventorySlotPressedState(page, label) {
  return page.locator(".mage2-player__inventory-slot").evaluateAll((slots, expectedLabel) => {
    const slot = slots.find((element) => element.getAttribute("aria-label") === expectedLabel);
    return slot?.getAttribute("aria-pressed");
  }, label);
}

async function waitForDialogue(page) {
  await page.locator(".mage2-player__dialogue").waitFor({ state: "visible" });
  await settle(page);
}

async function openFreshRuntime(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator(".mage2-experience").waitFor({ state: "visible", timeout: 30_000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator(".mage2-experience").waitFor({ state: "visible", timeout: 30_000 });
  await enterRuntimeGameIfTitle(page);
  await page.locator(".mage2-player").waitFor({ state: "visible", timeout: 30_000 });
  await settle(page);
}

async function enterRuntimeGameIfTitle(page) {
  await page.locator('.mage2-experience[data-player-screen="title"], .mage2-experience[data-player-screen="game"]').first().waitFor({
    state: "visible",
    timeout: 30_000
  });
  const title = page.locator('.mage2-experience[data-player-screen="title"]');
  if (await title.isVisible().catch(() => false)) {
    await title.locator(".mage2-experience__primary-action").first().click();
    await page.locator('.mage2-experience[data-player-screen="game"]').waitFor({ state: "visible" });
  }
}

function resolveAuthoredPlayerText(locale, textId, fallback) {
  const defaultLocale = runtimeContent.manifest.defaultLanguage;
  return runtimeContent.strings?.[locale]?.[textId] ?? runtimeContent.strings?.[defaultLocale]?.[textId] ?? fallback;
}

async function settle(page) {
  await page.waitForTimeout(90);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function launchChrome() {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function runCommand(command, args, extraEnvironment = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...extraEnvironment },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

async function closeServer(playerServer) {
  await new Promise((resolve, reject) => {
    playerServer.server.close((error) => (error ? reject(error) : resolve()));
  });
}

function resolveProjectDirectory(argv) {
  const inline = argv.find((argument) => argument.startsWith("--project-dir="));
  if (inline) {
    return path.resolve(inline.slice("--project-dir=".length));
  }
  const index = argv.indexOf("--project-dir");
  if (index >= 0 && argv[index + 1]) {
    return path.resolve(argv[index + 1]);
  }
  throw new Error("Pass --project-dir <MAGE2 project directory> to verify shared player parity.");
}

function sanitizeWindowsName(value) {
  return String(value).replace(/[<>:"/\\|?*]/gu, "-").replace(/[. ]+$/gu, "").trim() || "MAGE2 Runtime";
}

function normalizeText(value) {
  return value?.replace(/\s+/gu, " ").trim() ?? "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isTransparent(value) {
  return value === "transparent" || value === "rgba(0, 0, 0, 0)";
}

import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { cp, mkdir, mkdtemp, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { FuseState, FuseV1Options, getCurrentFuseWire } from "@electron/fuses";
import { chromium } from "playwright";
import {
  closeRunningCanonicalEditorProcesses,
  getCanonicalPackagedEditorExePath,
  getWindowsProcessExecutablePath,
  normalizeWindowsPath,
  repoRoot
} from "./editor-windows-launch-targets.mjs";
import {
  BUILT_IN_LOCALE_CASES,
  assertEditorLocaleState
} from "./localization-verification.mjs";

const AUTOMATION_PORT = 47632;
const AUTOMATION_TOKEN = randomBytes(32).toString("hex");
const evidenceDirectory = path.join(repoRoot, "output", "playwright", "windows-ci");
const screenshotPath = path.join(evidenceDirectory, "packaged-editor-export.png");
const readinessScreenshotPath = path.join(evidenceDirectory, "packaged-editor-readiness.png");
const exportMenuScreenshotPath = path.join(evidenceDirectory, "packaged-editor-export-menu.png");
const welcomeScreenshotPath = path.join(evidenceDirectory, "packaged-editor-welcome-titlebar.png");
const playerScreenshotPath = path.join(evidenceDirectory, "packaged-editor-player.png");
const playtestScreenshotPath = path.join(evidenceDirectory, "packaged-editor-playtest.png");
const reportPath = path.join(evidenceDirectory, "packaged-editor-report.json");
const processLogPath = path.join(evidenceDirectory, "packaged-editor.log");
const exportedRuntimeEvidencePath = path.join(evidenceDirectory, "runtime-export");
const projectEvidencePath = path.join(evidenceDirectory, "representative-project");
const standaloneRuntimeEvidenceDirectory = path.join(evidenceDirectory, "standalone-runtime");
const standaloneRuntimeEvidencePath = path.join(
  standaloneRuntimeEvidenceDirectory,
  "Windows CI Representative Project Player.exe"
);
const standaloneRuntimeTitleScreenshotPath = path.join(evidenceDirectory, "standalone-runtime-title.png");
const standaloneRuntimeScreenshotPath = path.join(evidenceDirectory, "standalone-runtime-running.png");
const runtimeExportProgressScreenshotPath = path.join(evidenceDirectory, "packaged-editor-runtime-export-progress.png");
const selectedWebRuntimeEvidencePath = path.join(evidenceDirectory, "selected-web-runtime");

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});

async function main() {
  if (process.platform !== "win32") {
    throw new Error("The packaged editor CI verification must run on Windows.");
  }

  await mkdir(evidenceDirectory, { recursive: true });
  await closeRunningCanonicalEditorProcesses();
  if (process.env.MAGE2_SKIP_EDITOR_PACKAGE === "1") {
    console.log("Using the existing packaged editor for Windows verification.");
  } else {
    await runCommand("npm.cmd", ["run", "package:editor:win"], {
      MAGE2_SKIP_SHORTCUT_REPAIR: "1"
    });
  }

  const canonicalExePath = getCanonicalPackagedEditorExePath();
  await stat(canonicalExePath);
  const electronFuses = await verifyElectronFuses(canonicalExePath);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "mage2-windows-ci-"));
  const projectDir = path.join(temporaryRoot, "Representative Project");
  const userDataDir = path.join(temporaryRoot, "user-data");
  await mkdir(projectDir);
  await mkdir(userDataDir);

  const logHandle = await open(processLogPath, "w");
  let editorProcess = launchEditorProcess(canonicalExePath, userDataDir, temporaryRoot, logHandle.fd);

  try {
    await waitForAutomationBridge(editorProcess);
    // Exercise the renderer bridge once before starting a state-changing command.
    // This also proves the React-side command listener, not just the main-process
    // HTTP server, is ready.
    await sendAutomationCommand({ command: "getState" });
    await delay(350);
    const welcomeScreenshot = await fetchAutomationScreenshot();
    assertPngScreenshot(welcomeScreenshot, "welcome title bar");
    await writeFile(welcomeScreenshotPath, welcomeScreenshot);
    const launchedExecutablePath = await getWindowsProcessExecutablePath(editorProcess.pid);
    if (normalizeWindowsPath(launchedExecutablePath) !== normalizeWindowsPath(canonicalExePath)) {
      throw new Error(
        `CI launched ${launchedExecutablePath ?? "(unknown)"} instead of the canonical executable ${canonicalExePath}.`
      );
    }

    const createdState = await sendAutomationCommand({
      command: "createProject",
      projectDir,
      projectName: "Windows CI Representative Project"
    });
    if (createdState?.projectDir !== projectDir || createdState?.projectName !== "Windows CI Representative Project") {
      throw new Error("The packaged editor did not create and open the representative project.");
    }

    await sendAutomationCommand({ command: "saveProject" });
    const automaticState = await sendAutomationCommand({ command: "getState" });
    const automaticLocaleCase = BUILT_IN_LOCALE_CASES.find(({ locale }) => locale === automaticState?.uiLocale);
    if (
      !automaticLocaleCase ||
      automaticState?.uiLocalePreference !== "automatic" ||
      automaticState?.uiDirection !== automaticLocaleCase.direction ||
      automaticState?.uiAutomaticLocale !== automaticState.uiLocale
    ) {
      throw new Error(`The packaged editor automatic OS locale state is invalid: ${JSON.stringify(automaticState)}`);
    }
    const projectFingerprintBefore = await fingerprintProjectFiles(projectDir);
    const localizationScreenshots = [];
    const localeStates = [];
    for (const localeCase of BUILT_IN_LOCALE_CASES) {
      await sendAutomationCommand({ command: "setInterfaceLocale", locale: localeCase.locale });
      const state = await sendAutomationCommand({ command: "getState" });
      assertEditorLocaleState(state, {
        locale: localeCase.locale,
        preference: localeCase.locale,
        direction: localeCase.direction
      }, automaticState, `packaged editor ${localeCase.locale}`);
      if (state?.uiAutomaticLocale !== automaticState.uiAutomaticLocale) {
        throw new Error(
          `The packaged editor ${localeCase.locale} override changed the detected automatic locale: ${JSON.stringify(state)}`
        );
      }
      await delay(350);
      const localeScreenshotPath = path.join(evidenceDirectory, `packaged-editor-locale-${localeCase.locale}.png`);
      const localeScreenshot = await fetchAutomationScreenshot();
      assertPngScreenshot(localeScreenshot, localeCase.locale);
      await writeFile(localeScreenshotPath, localeScreenshot);
      localizationScreenshots.push(localeScreenshotPath);
      localeStates.push(state);
    }

    const rejectedLocaleOverrides = {
      unsupported: await sendAutomationCommandExpectFailure({ command: "setInterfaceLocale", locale: "de-DE" }),
      zhHant: await sendAutomationCommandExpectFailure({ command: "setInterfaceLocale", locale: "zh-Hant" })
    };
    const projectFingerprintAfter = await fingerprintProjectFiles(projectDir);
    if (projectFingerprintAfter !== projectFingerprintBefore) {
      throw new Error("Changing the packaged editor interface locale mutated project files.");
    }

    await sendAutomationCommand({ command: "closeApplication" });
    await waitForProcessExit(editorProcess);
    editorProcess = launchEditorProcess(canonicalExePath, userDataDir, temporaryRoot, logHandle.fd);
    await waitForAutomationBridge(editorProcess);
    const persistedLocaleState = await sendAutomationCommand({ command: "getState" });
    if (
      persistedLocaleState?.uiLocale !== "ar" ||
      persistedLocaleState?.uiLocalePreference !== "ar" ||
      persistedLocaleState?.uiDirection !== "rtl"
    ) {
      throw new Error(`The packaged editor did not persist the Arabic interface override: ${JSON.stringify(persistedLocaleState)}`);
    }
    const persistedScreenshotPath = path.join(evidenceDirectory, "packaged-editor-locale-ar-persisted.png");
    await delay(350);
    const persistedScreenshot = await fetchAutomationScreenshot();
    assertPngScreenshot(persistedScreenshot, "persisted Arabic locale");
    await writeFile(persistedScreenshotPath, persistedScreenshot);
    await sendAutomationCommand({ command: "resetInterfaceLocale" });
    const resetLocaleState = await sendAutomationCommand({ command: "getState" });
    if (
      resetLocaleState?.uiLocale !== automaticState.uiLocale ||
      resetLocaleState?.uiLocalePreference !== "automatic" ||
      resetLocaleState?.uiDirection !== automaticState.uiDirection
    ) {
      throw new Error(`Reset did not restore automatic OS locale detection: ${JSON.stringify(resetLocaleState)}`);
    }
    const resetScreenshotPath = path.join(evidenceDirectory, "packaged-editor-locale-automatic-reset.png");
    await delay(350);
    const resetScreenshot = await fetchAutomationScreenshot();
    assertPngScreenshot(resetScreenshot, "automatic locale reset");
    await writeFile(resetScreenshotPath, resetScreenshot);
    const reopenedState = await sendAutomationCommand({ command: "openProject", projectDir });
    if (reopenedState?.projectDir !== projectDir || reopenedState?.hasUnsavedChanges !== false) {
      throw new Error("The packaged editor did not reopen the unchanged localization verification project.");
    }

    await sendAutomationCommand({ command: "selectTab", tab: "scenes" });
    const readinessState = await sendAutomationCommand({ command: "getState" });
    if (
      readinessState?.health?.healthy !== true ||
      readinessState?.readiness?.ready !== false ||
      readinessState?.readiness?.status !== "not-ready"
    ) {
      throw new Error(`The packaged editor did not separate project health from release readiness: ${JSON.stringify(readinessState)}.`);
    }
    const releaseBlockFailure = await sendAutomationCommandExpectFailure({ command: "exportProject" });
    if (releaseBlockFailure?.status !== 500 || /timed out/i.test(releaseBlockFailure?.error ?? "")) {
      throw new Error(`The packaged release gate did not return a direct refusal: ${JSON.stringify(releaseBlockFailure)}.`);
    }
    await delay(350);
    const readinessScreenshot = await fetchAutomationScreenshot();
    assertPngScreenshot(readinessScreenshot, "health and release readiness");
    await writeFile(readinessScreenshotPath, readinessScreenshot);
    await sendAutomationCommand({ command: "editor.openFileMenu" });
    await delay(200);
    const exportMenuScreenshot = await fetchAutomationScreenshot();
    assertPngScreenshot(exportMenuScreenshot, "Preview and Release export menu");
    await writeFile(exportMenuScreenshotPath, exportMenuScreenshot);
    await sendAutomationCommand({ command: "editor.closeFileMenu" });
    const canonicalPreviewDestinationPath = path.join(temporaryRoot, "Canonical Preview Runtime");
    const exportState = await sendAutomationCommand({
      command: "exportProject",
      format: "web",
      mode: "preview",
      destinationPath: canonicalPreviewDestinationPath
    });
    if (
      !exportState?.export?.validationReport?.valid ||
      exportState.export.validationReport.mode !== "preview" ||
      exportState.export.validationReport.readiness?.ready !== false
    ) {
      throw new Error("The packaged editor preview did not preserve its health and readiness report.");
    }

    const securityState = await sendAutomationCommand({ command: "security.getState" });
    assertPackagedSecurityState(securityState);

    const exportDirectory = exportState.export.outputDirectory;
    const requiredExportFiles = [
      "index.html",
      "build-manifest.json",
      "content/project-content.json",
      "validation-report.json"
    ];
    const exportEvidence = [];
    for (const relativePath of requiredExportFiles) {
      const filePath = path.join(exportDirectory, ...relativePath.split("/"));
      const fileStats = await stat(filePath);
      exportEvidence.push({ relativePath, sizeBytes: fileStats.size });
    }

    const standaloneDestinationPath = path.join(
      temporaryRoot,
      "Windows CI Representative Project Player.exe"
    );
    const standaloneExportPromise = sendAutomationCommand({
      command: "exportProject",
      format: "windows",
      mode: "preview",
      destinationPath: standaloneDestinationPath
    });
    const runtimeExportProgressPromise = capturePackagedRuntimeExportProgress("windows");
    const [standaloneExportState, runtimeExportProgress] = await Promise.all([
      standaloneExportPromise,
      runtimeExportProgressPromise
    ]);
    if (
      standaloneExportState?.export?.format !== "windows" ||
      standaloneExportState.export.outputPath !== standaloneDestinationPath ||
      !standaloneExportState.export.validationReport?.valid
    ) {
      throw new Error(`The standalone Windows export result is invalid: ${JSON.stringify(standaloneExportState?.export)}`);
    }
    const standaloneStats = await stat(standaloneDestinationPath);
    const standaloneHeader = await readExecutableHeader(standaloneDestinationPath);
    if (standaloneStats.size < 1_000_000 || standaloneHeader !== "MZ") {
      throw new Error("The standalone Windows export is not a plausible PE executable.");
    }
    const standaloneSha256 = await hashFile(standaloneDestinationPath);
    await rm(standaloneRuntimeEvidenceDirectory, { recursive: true, force: true });
    await mkdir(standaloneRuntimeEvidenceDirectory, { recursive: true });
    await cp(standaloneDestinationPath, standaloneRuntimeEvidencePath);
    const standaloneEvidenceEntries = await readdir(standaloneRuntimeEvidenceDirectory);
    if (
      standaloneEvidenceEntries.length !== 1 ||
      standaloneEvidenceEntries[0] !== path.basename(standaloneRuntimeEvidencePath)
    ) {
      throw new Error("The standalone export evidence directory must contain exactly one distributable file.");
    }
    const standaloneLaunch = await verifyStandaloneRuntime(standaloneRuntimeEvidencePath);

    const selectedWebDestinationPath = path.join(temporaryRoot, "Selected Web Runtime");
    const selectedWebExportState = await sendAutomationCommand({
      command: "exportProject",
      format: "web",
      mode: "preview",
      destinationPath: selectedWebDestinationPath
    });
    if (
      selectedWebExportState?.export?.format !== "web" ||
      selectedWebExportState.export.outputPath !== selectedWebDestinationPath ||
      !selectedWebExportState.export.validationReport?.valid
    ) {
      throw new Error(`The selected web export result is invalid: ${JSON.stringify(selectedWebExportState?.export)}`);
    }
    for (const relativePath of requiredExportFiles) {
      await stat(path.join(selectedWebDestinationPath, ...relativePath.split("/")));
    }
    await rm(selectedWebRuntimeEvidencePath, { recursive: true, force: true });
    await cp(selectedWebDestinationPath, selectedWebRuntimeEvidencePath, { recursive: true });

    const unsafeWebDestinationPath = path.join(temporaryRoot, "Occupied Web Runtime");
    const unsafeSentinelPath = path.join(unsafeWebDestinationPath, "keep-me.txt");
    await mkdir(unsafeWebDestinationPath);
    await writeFile(unsafeSentinelPath, "preserve this unrelated file\n", "utf8");
    const unsafeDestinationFailure = await sendAutomationCommandExpectFailure({
      command: "exportProject",
      format: "web",
      mode: "preview",
      destinationPath: unsafeWebDestinationPath
    });
    if ((await readFile(unsafeSentinelPath, "utf8")) !== "preserve this unrelated file\n") {
      throw new Error("The refused web export modified an unrelated destination file.");
    }

    await rm(exportedRuntimeEvidencePath, { recursive: true, force: true });
    await cp(exportDirectory, exportedRuntimeEvidencePath, { recursive: true, force: true });
    await rm(projectEvidencePath, { recursive: true, force: true });
    await cp(projectDir, projectEvidencePath, { recursive: true, force: true });
    await relocateProjectEvidencePaths(projectEvidencePath, projectDir);

    await delay(1_100);
    const settledExportState = await sendAutomationCommand({ command: "getState" });
    if (settledExportState?.runtimeExportProgress) {
      throw new Error(
        `The packaged editor left its runtime export overlay visible after completion: ${JSON.stringify(settledExportState.runtimeExportProgress)}.`
      );
    }
    const screenshot = await fetchAutomationScreenshot();
    assertPngScreenshot(screenshot, "export");
    await writeFile(screenshotPath, screenshot);

    await sendAutomationCommand({ command: "selectTab", tab: "player" });
    await delay(800);
    const playerScreenshot = await fetchAutomationScreenshot();
    assertPngScreenshot(playerScreenshot, "Player authoring");
    await writeFile(playerScreenshotPath, playerScreenshot);

    await sendAutomationCommand({ command: "enterPlaytest" });
    await delay(300);
    const playtestScreenshot = await fetchAutomationScreenshot();
    assertPngScreenshot(playtestScreenshot, "Playtest");
    await writeFile(playtestScreenshotPath, playtestScreenshot);

    const checksumPath = path.join(
      repoRoot,
      "output",
      "packaging",
      "editor-win",
      "dist",
      "SHA256SUMS.txt"
    );
    const checksums = await readFile(checksumPath, "utf8");
    if (!checksums.includes("MAGE2-Editor-") || !checksums.includes("win-unpacked/MAGE2 Editor.exe")) {
      throw new Error("Release checksums do not cover both the installer and canonical executable.");
    }

    const report = {
      canonicalExePath,
      launchedExecutablePath,
      processId: editorProcess.pid,
      project: {
        projectDir,
        evidenceCopy: projectEvidencePath,
        name: createdState.projectName,
        health: readinessState.health,
        readiness: readinessState.readiness
      },
      releaseGate: {
        refusedStarterProject: true,
        error: releaseBlockFailure
      },
      export: {
        outputDirectory: exportDirectory,
        evidenceCopy: exportedRuntimeEvidencePath,
        files: exportEvidence
      },
      standaloneExport: {
        format: standaloneExportState.export.format,
        outputPath: standaloneRuntimeEvidencePath,
        sizeBytes: standaloneStats.size,
        sha256: standaloneSha256,
        onlyDistributableFile: standaloneEvidenceEntries[0],
        titleScreenshotPath: standaloneRuntimeTitleScreenshotPath,
        screenshotPath: standaloneRuntimeScreenshotPath,
        progress: runtimeExportProgress,
        launch: standaloneLaunch
      },
      selectedWebExport: {
        format: selectedWebExportState.export.format,
        outputDirectory: selectedWebRuntimeEvidencePath,
        files: requiredExportFiles
      },
      unsafeDestination: {
        refused: true,
        error: unsafeDestinationFailure,
        sentinelPreserved: true
      },
      security: securityState,
      localization: {
        builtInLocales: localeStates.map(({ uiLocale, uiLocalePreference, uiDirection, hasUnsavedChanges }) => ({
          uiLocale,
          uiLocalePreference,
          uiDirection,
          hasUnsavedChanges
        })),
        automaticDetection: {
          initial: pickEditorLocaleState(automaticState),
          afterReset: pickEditorLocaleState(resetLocaleState)
        },
        persistedOverride: pickEditorLocaleState(persistedLocaleState),
        rejectedLocaleOverrides,
        projectFingerprintBefore,
        projectFingerprintAfter,
        projectFilesUnchanged: true,
        screenshots: [...localizationScreenshots, persistedScreenshotPath, resetScreenshotPath]
      },
      electronFuses,
      releaseChecksums: checksumPath,
      welcomeScreenshotPath,
      readinessScreenshotPath,
      exportMenuScreenshotPath,
      screenshotPath,
      playerScreenshotPath,
      playtestScreenshotPath,
      processLogPath
    };
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`Packaged Windows editor verification passed. Report: ${reportPath}`);
  } finally {
    editorProcess.kill();
    await closeRunningCanonicalEditorProcesses().catch(() => undefined);
    await logHandle.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function capturePackagedRuntimeExportProgress(expectedFormat) {
  const deadline = Date.now() + 10 * 60_000;
  const samples = [];
  let screenshotCaptured = false;
  let lastSignature = "";
  let lastFailure;

  while (Date.now() < deadline) {
    try {
      const state = await sendAutomationCommand({ command: "getState" });
      const progress = state?.runtimeExportProgress;
      if (progress?.format === expectedFormat) {
        const sample = {
          format: progress.format,
          phase: progress.phase,
          progress: progress.progress,
          percent: Math.round(progress.progress * 100),
          elapsedSeconds: progress.elapsedSeconds,
          estimatedSecondsRemaining: progress.estimatedSecondsRemaining,
          payloadBytes: progress.payloadBytes
        };
        const signature = JSON.stringify(sample);
        if (signature !== lastSignature) {
          samples.push(sample);
          lastSignature = signature;
        }

        if (
          !screenshotCaptured &&
          sample.phase === "compressing" &&
          typeof sample.estimatedSecondsRemaining === "number" &&
          sample.estimatedSecondsRemaining > 0 &&
          sample.percent > 0 &&
          sample.percent < 100
        ) {
          const screenshot = await fetchAutomationScreenshot();
          assertPngScreenshot(screenshot, "runtime export progress");
          await writeFile(runtimeExportProgressScreenshotPath, screenshot);
          screenshotCaptured = true;
        }

        if (sample.phase === "complete" && sample.progress === 1) {
          break;
        }
      }
      lastFailure = undefined;
    } catch (error) {
      lastFailure = error;
    }
    await delay(500);
  }

  if (!samples.some((sample) => sample.phase === "complete" && sample.progress === 1)) {
    throw new Error(
      `The packaged editor did not expose a complete runtime export progress sequence.${lastFailure ? ` Last polling error: ${lastFailure}` : ""}`
    );
  }
  if (!screenshotCaptured) {
    throw new Error(
      `The packaged editor never showed a visible compression ETA during the standalone export: ${JSON.stringify(samples)}`
    );
  }

  const progressValues = samples.map((sample) => sample.progress);
  if (progressValues.some((value, index) => index > 0 && value < progressValues[index - 1])) {
    throw new Error(`Runtime export progress moved backward: ${JSON.stringify(progressValues)}`);
  }
  const compressionSamples = samples.filter(
    (sample) => sample.phase === "compressing" && typeof sample.estimatedSecondsRemaining === "number"
  );
  if (
    compressionSamples.length < 2 ||
    !compressionSamples.some((sample, index) => index > 0 && sample.progress > compressionSamples[index - 1].progress) ||
    !compressionSamples.some(
      (sample, index) =>
        index > 0 &&
        sample.estimatedSecondsRemaining < compressionSamples[index - 1].estimatedSecondsRemaining
    )
  ) {
    throw new Error(`The packaged editor progress or ETA did not advance during compression: ${JSON.stringify(compressionSamples)}`);
  }

  return {
    screenshotPath: runtimeExportProgressScreenshotPath,
    sampleCount: samples.length,
    phases: [...new Set(samples.map((sample) => sample.phase))],
    firstCompressionSample: compressionSamples[0],
    lastCompressionSample: compressionSamples.at(-1),
    samples
  };
}

async function verifyStandaloneRuntime(executablePath) {
  const debuggingPort = await reserveLoopbackPort();
  const runtimeProcess = spawn(
    executablePath,
    [
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${debuggingPort}`
    ],
    {
      cwd: path.dirname(executablePath),
      stdio: "ignore",
      windowsHide: false
    }
  );

  let browser;
  let page;
  try {
    browser = await connectToCdp(`http://127.0.0.1:${debuggingPort}`, runtimeProcess);
    page = await waitForStandaloneRuntimePage(browser, runtimeProcess);
    try {
      await page.locator(".mage2-experience__title").waitFor({ state: "visible", timeout: 30_000 });
    } catch (error) {
      await page.screenshot({ path: standaloneRuntimeTitleScreenshotPath, fullPage: true }).catch(() => undefined);
      const diagnosticText = normalizeText(await page.locator("body").innerText().catch(() => ""));
      throw new Error(
        `The standalone player did not reach its title screen. URL: ${page.url()}. UI: ${diagnosticText.slice(0, 800)}`,
        { cause: error }
      );
    }
    const titleText = normalizeText(await page.locator("body").innerText());
    if (!titleText.includes("Windows CI Representative Project")) {
      throw new Error(`The standalone player title screen is for the wrong project: ${titleText.slice(0, 500)}`);
    }
    await page.screenshot({ path: standaloneRuntimeTitleScreenshotPath, fullPage: true });
    await page.locator(".mage2-experience__title .mage2-experience__primary-action").click();
    await page.locator(".mage2-player").waitFor({ state: "visible", timeout: 30_000 });
    const rendererState = await page.evaluate(() => ({
      title: document.title,
      bodyText: document.body.innerText,
      playerVisible: Boolean(document.querySelector(".mage2-player")),
      debugHotspotsVisible: Boolean(document.querySelector(".mage2-player--debug-hotspots")),
      rangeInputs: document.querySelectorAll('input[type="range"]').length,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    }));
    if (!rendererState.playerVisible || rendererState.debugHotspotsVisible || rendererState.rangeInputs !== 0) {
      throw new Error(`The standalone player exposed author/debug UI: ${JSON.stringify(rendererState)}`);
    }
    await page.screenshot({ path: standaloneRuntimeScreenshotPath, fullPage: true });
    await page.locator(".mage2-experience__menu-button").click();
    const menuActions = page.locator(".mage2-experience__panel-actions");
    await menuActions.waitFor({ state: "visible", timeout: 30_000 });
    await menuActions.locator("button").last().click();
    await waitForProcessExitWithTimeout(runtimeProcess, 20_000, "standalone runtime");
    return {
      executablePath,
      titleText,
      renderer: rendererState,
      exitCode: runtimeProcess.exitCode
    };
  } finally {
    if (runtimeProcess.exitCode === null) {
      await page?.evaluate(() => window.mage2Runtime?.quit()).catch(() => undefined);
    }
    await browser?.close().catch(() => undefined);
    if (runtimeProcess.exitCode === null) {
      runtimeProcess.kill();
      await waitForProcessExitWithTimeout(runtimeProcess, 5_000, "standalone runtime cleanup").catch(() => undefined);
    }
  }
}

async function connectToCdp(endpoint, childProcess) {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    if (childProcess.exitCode !== null) {
      throw new Error(`The standalone runtime exited before its DevTools endpoint was ready (code ${childProcess.exitCode}).`);
    }
    try {
      return await chromium.connectOverCDP(endpoint);
    } catch (error) {
      lastError = error;
      await delay(200);
    }
  }
  throw new Error(`Timed out waiting for the standalone runtime DevTools endpoint at ${endpoint}.`, {
    cause: lastError
  });
}

async function waitForStandaloneRuntimePage(browser, childProcess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (childProcess.exitCode !== null) {
      throw new Error(`The standalone runtime exited before rendering (code ${childProcess.exitCode}).`);
    }
    for (const context of browser.contexts()) {
      for (const candidate of context.pages()) {
        if (candidate.url().startsWith("http://127.0.0.1:")) {
          return candidate;
        }
      }
    }
    await delay(150);
  }
  throw new Error("Timed out waiting for the standalone runtime page.");
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

async function waitForProcessExitWithTimeout(childProcess, timeoutMs, label) {
  if (childProcess.exitCode !== null) {
    return;
  }
  await Promise.race([
    new Promise((resolve) => childProcess.once("exit", resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out waiting for ${label} to exit.`)), timeoutMs))
  ]);
}

async function readExecutableHeader(filePath) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(2);
    await handle.read(header, 0, header.length, 0);
    return header.toString("ascii");
  } finally {
    await handle.close();
  }
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.once("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function verifyElectronFuses(canonicalExePath) {
  const fuseWire = await getCurrentFuseWire(canonicalExePath);
  const expectedStates = new Map([
    [FuseV1Options.RunAsNode, FuseState.DISABLE],
    [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
    [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
    [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseState.DISABLE],
    [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE]
  ]);
  const evidence = {};

  for (const [option, expectedState] of expectedStates) {
    const optionName = FuseV1Options[option];
    const actualState = fuseWire[option];
    evidence[optionName] = fuseStateName(actualState);
    if (actualState !== expectedState) {
      throw new Error(
        `Electron fuse ${optionName} is ${fuseStateName(actualState)}; expected ${fuseStateName(expectedState)}.`
      );
    }
  }

  if (FuseV1Options.WasmTrapHandlers in fuseWire) {
    evidence.WasmTrapHandlers = fuseStateName(fuseWire[FuseV1Options.WasmTrapHandlers]);
  }

  return evidence;
}

function fuseStateName(state) {
  return FuseState[state] ?? `UNKNOWN(${state})`;
}

function assertPackagedSecurityState(securityState) {
  if (securityState?.rendererUrl !== "mage2-app://bundle/index.html") {
    throw new Error(`Unexpected packaged renderer URL: ${securityState?.rendererUrl ?? "(missing)"}.`);
  }
  if (
    securityState?.nodeGlobals?.require !== "undefined" ||
    securityState?.nodeGlobals?.process !== "undefined"
  ) {
    throw new Error("Node globals leaked into the packaged renderer.");
  }
  if (securityState?.untrustedWindowCreated !== false) {
    throw new Error("The packaged renderer was able to create an untrusted window.");
  }
  if (securityState?.notificationPermission !== "denied") {
    throw new Error(`Notification permission was not denied: ${securityState?.notificationPermission}.`);
  }
  const csp = securityState?.contentSecurityPolicy ?? "";
  for (const directive of [
    "default-src 'none'",
    "script-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'"
  ]) {
    if (!csp.includes(directive)) {
      throw new Error(`The packaged CSP is missing ${directive}.`);
    }
  }
}

async function waitForAutomationBridge(editorProcess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (editorProcess.exitCode !== null) {
      throw new Error(`The packaged editor exited early with code ${editorProcess.exitCode}.`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${AUTOMATION_PORT}/health`);
      const body = await response.json().catch(() => undefined);
      if (response.ok && body?.ready === true) {
        return;
      }
    } catch {
      // The app is still starting.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the packaged editor automation bridge.");
}

async function sendAutomationCommand(command) {
  const response = await fetch(`http://127.0.0.1:${AUTOMATION_PORT}/automation/command`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mage2-automation-token": AUTOMATION_TOKEN
    },
    body: JSON.stringify(command)
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok || !body?.ok) {
    throw new Error(`Automation command ${command.command} failed: ${JSON.stringify(body)}`);
  }
  return body.value;
}

async function fetchAutomationScreenshot() {
  let lastFailure = "no response";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${AUTOMATION_PORT}/automation/screenshot`, {
      method: "POST",
      headers: {
        "x-mage2-automation-token": AUTOMATION_TOKEN
      }
    });
    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }
    lastFailure = `HTTP ${response.status}: ${await response.text().catch(() => "")}`;
    await delay(250);
  }
  throw new Error(`Packaged screenshot capture failed after retries (${lastFailure}).`);
}

async function sendAutomationCommandExpectFailure(command) {
  const response = await fetch(`http://127.0.0.1:${AUTOMATION_PORT}/automation/command`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mage2-automation-token": AUTOMATION_TOKEN
    },
    body: JSON.stringify(command)
  });
  const body = await response.json().catch(() => undefined);
  if (response.ok && body?.ok) {
    throw new Error(`Automation command ${command.command} unexpectedly succeeded: ${JSON.stringify(command)}.`);
  }
  return { status: response.status, error: body?.error ?? body };
}

function launchEditorProcess(canonicalExePath, userDataDir, temporaryRoot, logFileDescriptor) {
  return spawn(canonicalExePath, [`--user-data-dir=${userDataDir}`], {
    cwd: path.dirname(canonicalExePath),
    env: {
      ...process.env,
      MAGE2_EDITOR_AUTOMATION: "1",
      MAGE2_EDITOR_AUTOMATION_ROOT: temporaryRoot,
      MAGE2_EDITOR_AUTOMATION_PORT: String(AUTOMATION_PORT),
      MAGE2_EDITOR_AUTOMATION_TOKEN: AUTOMATION_TOKEN
    },
    stdio: ["ignore", logFileDescriptor, logFileDescriptor]
  });
}

async function waitForProcessExit(childProcess) {
  if (childProcess.exitCode !== null) {
    return;
  }
  await Promise.race([
    new Promise((resolve) => childProcess.once("exit", resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for the packaged editor to exit.")), 10_000))
  ]);
}

async function fingerprintProjectFiles(projectDir) {
  const hash = createHash("sha256");
  const relativePaths = await listProjectFiles(projectDir);
  for (const relativePath of relativePaths) {
    hash.update(relativePath.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(path.join(projectDir, relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function relocateProjectEvidencePaths(evidenceProjectDir, sourceProjectDir) {
  const relocate = (value) => {
    if (typeof value === "string") {
      return value.toLowerCase().startsWith(sourceProjectDir.toLowerCase())
        ? path.join(evidenceProjectDir, value.slice(sourceProjectDir.length))
        : value;
    }
    if (Array.isArray(value)) {
      return value.map(relocate);
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, relocate(nestedValue)]));
    }
    return value;
  };
  for (const relativePath of [
    "project.json",
    "assets.json",
  ]) {
    const jsonPath = path.join(evidenceProjectDir, relativePath);
    const value = JSON.parse(await readFile(jsonPath, "utf8"));
    const relocated = relocate(value);
    await writeFile(jsonPath, `${JSON.stringify(relocated, null, 2)}\n`, "utf8");
  }
}

async function listProjectFiles(directory, relativeDirectory = "") {
  const entries = await readdir(path.join(directory, relativeDirectory), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (relativeDirectory === "" && entry.name === "build") {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...await listProjectFiles(directory, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function pickEditorLocaleState(state) {
  return {
    uiLocale: state?.uiLocale,
    uiLocalePreference: state?.uiLocalePreference,
    uiDirection: state?.uiDirection,
    uiAutomaticLocale: state?.uiAutomaticLocale,
    hasUnsavedChanges: state?.hasUnsavedChanges
  };
}

function assertPngScreenshot(screenshot, label) {
  if (screenshot.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`The packaged editor ${label} screenshot response was not a PNG image.`);
  }
}

function runCommand(command, args, extraEnvironment = {}) {
  const commandLine = [command, ...args].map(quoteWindowsCommandArgument).join(" ");
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], {
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

function quoteWindowsCommandArgument(argument) {
  return /[\s"]/u.test(argument) ? `"${argument.replaceAll('"', '\\"')}"` : argument;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

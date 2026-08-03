import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FuseState, FuseV1Options, getCurrentFuseWire } from "@electron/fuses";
import {
  closeRunningCanonicalEditorProcesses,
  getCanonicalPackagedEditorExePath,
  getWindowsProcessExecutablePath,
  normalizeWindowsPath,
  repoRoot
} from "./editor-windows-launch-targets.mjs";

const AUTOMATION_PORT = 47632;
const AUTOMATION_TOKEN = randomBytes(32).toString("hex");
const evidenceDirectory = path.join(repoRoot, "output", "playwright", "windows-ci");
const screenshotPath = path.join(evidenceDirectory, "packaged-editor-export.png");
const reportPath = path.join(evidenceDirectory, "packaged-editor-report.json");
const processLogPath = path.join(evidenceDirectory, "packaged-editor.log");
const exportedRuntimeEvidencePath = path.join(evidenceDirectory, "runtime-export");

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
  await runCommand("npm.cmd", ["run", "package:editor:win"], {
    MAGE2_SKIP_SHORTCUT_REPAIR: "1"
  });

  const canonicalExePath = getCanonicalPackagedEditorExePath();
  await stat(canonicalExePath);
  const electronFuses = await verifyElectronFuses(canonicalExePath);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "mage2-windows-ci-"));
  const projectDir = path.join(temporaryRoot, "Representative Project");
  const userDataDir = path.join(temporaryRoot, "user-data");
  await mkdir(projectDir);
  await mkdir(userDataDir);

  const logHandle = await open(processLogPath, "w");
  const editorProcess = spawn(canonicalExePath, [`--user-data-dir=${userDataDir}`], {
    cwd: path.dirname(canonicalExePath),
    env: {
      ...process.env,
      MAGE2_EDITOR_AUTOMATION: "1",
      MAGE2_EDITOR_AUTOMATION_ROOT: temporaryRoot,
      MAGE2_EDITOR_AUTOMATION_PORT: String(AUTOMATION_PORT),
      MAGE2_EDITOR_AUTOMATION_TOKEN: AUTOMATION_TOKEN
    },
    stdio: ["ignore", logHandle.fd, logHandle.fd]
  });

  try {
    await waitForAutomationBridge(editorProcess);
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

    await sendAutomationCommand({ command: "selectTab", tab: "scenes" });
    const exportState = await sendAutomationCommand({ command: "exportProject" });
    if (!exportState?.export?.validationReport?.valid) {
      throw new Error("The packaged editor export did not return a valid project report.");
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

    await rm(exportedRuntimeEvidencePath, { recursive: true, force: true });
    await cp(exportDirectory, exportedRuntimeEvidencePath, { recursive: true, force: true });

    const screenshot = await fetchAutomationScreenshot();
    if (screenshot.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error("The packaged editor screenshot response was not a PNG image.");
    }
    await writeFile(screenshotPath, screenshot);

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
        name: createdState.projectName,
        validation: exportState.validation
      },
      export: {
        outputDirectory: exportDirectory,
        evidenceCopy: exportedRuntimeEvidencePath,
        files: exportEvidence
      },
      security: securityState,
      electronFuses,
      releaseChecksums: checksumPath,
      screenshotPath,
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
      if (response.ok) {
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
  const response = await fetch(`http://127.0.0.1:${AUTOMATION_PORT}/automation/screenshot`, {
    method: "POST",
    headers: {
      "x-mage2-automation-token": AUTOMATION_TOKEN
    }
  });
  if (!response.ok) {
    throw new Error(`Packaged screenshot capture failed with HTTP ${response.status}.`);
  }
  return Buffer.from(await response.arrayBuffer());
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

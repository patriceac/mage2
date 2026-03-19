import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { _electron as electron } from "playwright";
import {
  assertCanonicalWindowsLaunchShortcuts,
  closeRunningCanonicalEditorProcesses,
  formatWindowsLaunchShortcutReport,
  getCanonicalPackagedEditorExePath,
  getWindowsProcessExecutablePath,
  normalizeWindowsPath,
  repairWindowsLaunchShortcuts,
  repoRoot
} from "./editor-windows-launch-targets.mjs";

const outputDirectory = path.join(repoRoot, "output", "playwright");
const screenshotPath = path.join(outputDirectory, "editor-windows-launch-parity.png");
const reportPath = path.join(outputDirectory, "editor-windows-launch-report.json");

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});

async function main() {
  if (process.platform !== "win32") {
    throw new Error("Windows launch verification only runs on Windows.");
  }

  await mkdir(outputDirectory, { recursive: true });

  const closedProcessesReport = await closeRunningCanonicalEditorProcesses();
  if (closedProcessesReport.closedProcesses.length > 0) {
    console.log(
      `Closed ${closedProcessesReport.closedProcesses.length} running packaged editor process(es) before verification.`
    );
  }

  await runCommand("npm.cmd", ["run", "package:editor:win"]);

  const shortcutReport = assertCanonicalWindowsLaunchShortcuts(await repairWindowsLaunchShortcuts());
  console.log(formatWindowsLaunchShortcutReport(shortcutReport));

  const canonicalExePath = getCanonicalPackagedEditorExePath();
  const electronApp = await electron.launch({
    executablePath: canonicalExePath,
    cwd: path.dirname(canonicalExePath)
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    const recentProjectButton = window.locator("button.recent-project").first();
    try {
      await recentProjectButton.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      throw new Error(
        "Could not find a recent project to open during packaged editor verification. Open at least one project first."
      );
    }

    await recentProjectButton.click();
    await window.locator(".tab-strip").waitFor({ state: "visible", timeout: 15000 });
    await window.getByRole("button", { name: "Scenes" }).click();
    await window.locator(".media-surface").waitFor({ state: "visible", timeout: 15000 });
    await window.waitForTimeout(1000);

    const mainProcessId = await electronApp.evaluate(async () => process.pid);
    const launchedExecutablePath = await getWindowsProcessExecutablePath(mainProcessId);
    if (normalizeWindowsPath(launchedExecutablePath) !== normalizeWindowsPath(canonicalExePath)) {
      throw new Error(
        `Packaged verification launched ${launchedExecutablePath ?? "(unknown)"} instead of ${canonicalExePath}.`
      );
    }

    const sceneSnapshot = await window.evaluate(() => ({
      recentProjectName: document.querySelector(".recent-project__name")?.textContent?.trim() ?? null,
      activeTab: document.querySelector(".tab-strip__tab--active")?.textContent?.trim() ?? null,
      scenePreviewVisible: Boolean(document.querySelector(".media-surface")),
      hotspotCount: document.querySelectorAll(".hotspot__body").length
    }));

    await window.screenshot({ path: screenshotPath, fullPage: true });

    const report = {
      canonicalExePath,
      launchedExecutablePath,
      mainProcessId,
      screenshotPath,
      sceneSnapshot,
      closedProcesses: closedProcessesReport.closedProcesses,
      shortcuts: shortcutReport.shortcuts.map((shortcut) => ({
        id: shortcut.id,
        label: shortcut.label,
        linkPath: shortcut.linkPath,
        targetPath: shortcut.targetPath,
        workingDirectory: shortcut.workingDirectory,
        arguments: shortcut.arguments,
        action: shortcut.action,
        isCanonical: shortcut.isCanonical
      }))
    };

    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`Wrote Windows launch parity report to ${reportPath}`);
    console.log(`Saved packaged editor screenshot to ${screenshotPath}`);
  } finally {
    await electronApp.close().catch(() => {});
  }
}

async function runCommand(command, args) {
  const commandLine = [command, ...args].map(quoteWindowsCommandArgument).join(" ");

  await new Promise((resolve, reject) => {
    const child = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd: repoRoot,
      stdio: "inherit"
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
    });
  });
}

function quoteWindowsCommandArgument(argument) {
  if (/[\s"]/u.test(argument)) {
    return `"${argument.replaceAll('"', '\\"')}"`;
  }

  return argument;
}

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  WINDOWS_PLAYER_RUNTIME_DIRECTORY,
  arrangeWindowsPlayerDistribution,
  windowsPlayerLauncherCompilerArguments
} from "./windows-player-launcher.mjs";

const cleanups = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Windows player launcher packaging", () => {
  it("keeps one game launcher at the root and moves Electron behind it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mage2-launcher-layout-"));
    cleanups.push(root);
    const unpacked = path.join(root, "win-unpacked");
    const launcher = path.join(root, "launcher.exe");
    await mkdir(path.join(unpacked, "resources"), { recursive: true });
    await writeFile(path.join(unpacked, "Custom Game.exe"), "electron");
    await writeFile(path.join(unpacked, "resources", "app.asar"), "archive");
    await writeFile(path.join(unpacked, "chrome.dll"), "runtime dependency");
    await writeFile(launcher, "native launcher");

    const result = await arrangeWindowsPlayerDistribution({
      unpackedDirectory: unpacked,
      launcherExecutablePath: launcher,
      packagedRuntimeExecutableName: "Custom Game.exe",
      rootLauncherName: "Custom Game.exe"
    });

    await expect(readdir(unpacked)).resolves.toEqual(["Custom Game.exe", WINDOWS_PLAYER_RUNTIME_DIRECTORY]);
    await expect(readFile(path.join(unpacked, "Custom Game.exe"), "utf8")).resolves.toBe("native launcher");
    await expect(readFile(path.join(result.runtimeDirectory, "MAGE2 Player.exe"), "utf8")).resolves.toBe("electron");
    await expect(readFile(path.join(result.runtimeDirectory, "resources", "app.asar"), "utf8")).resolves.toBe("archive");
  });

  it("compiles as a 64-bit windowed executable with a manifest and icon", () => {
    const argumentsList = windowsPlayerLauncherCompilerArguments({
      sourcePath: "Program.cs",
      manifestPath: "app.manifest",
      iconPath: "game.ico",
      outputPath: "MAGE2 Player.exe"
    });

    expect(argumentsList).toEqual(expect.arrayContaining([
      "/target:winexe",
      "/platform:x64",
      "/win32manifest:app.manifest",
      "/win32icon:game.ico",
      "/reference:System.Windows.Forms.dll",
      "Program.cs"
    ]));
  });
});

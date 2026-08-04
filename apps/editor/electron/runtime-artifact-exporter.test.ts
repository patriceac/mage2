import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultProjectBundle } from "@mage2/schema";

vi.mock("electron", () => ({ app: { isPackaged: true } }));

import {
  createPortableNsisScript,
  createPortableWindowsRuntime,
  estimatePortableCompressionSeconds,
  resolvePortableCompressionProgress,
  sanitizeRuntimeArtifactName,
  suggestedRuntimeArtifactName
} from "./runtime-artifact-exporter";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("portable Windows runtime export", () => {
  it("creates one executable containing the player template, web build, and creator icon", async () => {
    const fixture = await createPackagingFixture();
    const destinationFile = path.join(fixture.destinationDirectory, "Safe Game Player.exe");
    let compilationObserved = false;
    const progressUpdates: Array<{ phase: string; progress: number; estimatedSecondsRemaining?: number; payloadBytes?: number }> = [];

    const result = await createPortableWindowsRuntime({
      buildDirectory: fixture.buildDirectory,
      destinationFile,
      project: fixture.project,
      resources: fixture.resources,
      onProgress: (progress) => progressUpdates.push(progress),
      compilePortableExecutable: async (options) => {
        compilationObserved = true;
        await expect(readFile(path.join(options.payloadDirectory, "MAGE2 Player.exe"), "utf8")).resolves.toBe(
          "template executable"
        );
        await expect(
          readFile(path.join(options.payloadDirectory, "resources", "player", "build-manifest.json"), "utf8")
        ).resolves.toContain("project_portable_test");
        await expect(
          readFile(path.join(options.payloadDirectory, "resources", "creator-icon.png"), "utf8")
        ).resolves.toBe("creator icon");
        await expect(
          readFile(path.join(options.payloadDirectory, "resources", "app.asar"), "utf8")
        ).resolves.toBe("runtime app");
        expect(options.script).toContain('Name "Safe Game Player"');
        expect(options.script).toContain('ExecWait \'"$PLUGINSDIR\\app\\MAGE2 Player.exe" $R0\' $0');
        await writeFile(options.outputFile, "MZportable executable", "utf8");
      }
    });

    expect(compilationObserved).toBe(true);
    expect(result).toBe(destinationFile);
    expect(progressUpdates.map((progress) => progress.phase)).toEqual([
      "assembling-player",
      "compressing",
      "publishing",
      "complete"
    ]);
    expect(progressUpdates.find((progress) => progress.phase === "compressing")).toMatchObject({
      progress: expect.any(Number),
      estimatedSecondsRemaining: expect.any(Number),
      payloadBytes: expect.any(Number)
    });
    expect(progressUpdates.at(-1)).toMatchObject({ phase: "complete", progress: 1, estimatedSecondsRemaining: 0 });
    await expect(readFile(destinationFile, "utf8")).resolves.toBe("MZportable executable");
  });

  it("estimates compression from payload size while keeping simulated progress below publishing", () => {
    const samplePayloadBytes = 356 * 1024 * 1024;
    const estimate = estimatePortableCompressionSeconds(samplePayloadBytes);
    expect(estimate).toBeGreaterThanOrEqual(130);
    expect(estimate).toBeLessThanOrEqual(180);
    expect(estimatePortableCompressionSeconds(0)).toBe(8);

    const samples = [
      resolvePortableCompressionProgress(0, estimate),
      resolvePortableCompressionProgress(estimate / 2, estimate),
      resolvePortableCompressionProgress(estimate, estimate),
      resolvePortableCompressionProgress(estimate * 2, estimate)
    ];
    expect(samples[0]).toBeCloseTo(0.38, 5);
    expect(samples).toEqual([...samples].sort((left, right) => left - right));
    expect(samples.every((progress) => progress < 0.94)).toBe(true);
  });

  it("replaces the exact file selected by the user only after compilation succeeds", async () => {
    const fixture = await createPackagingFixture();
    const destinationFile = path.join(fixture.destinationDirectory, "Existing Player.exe");
    await writeFile(destinationFile, "previous executable", "utf8");

    await createPortableWindowsRuntime({
      buildDirectory: fixture.buildDirectory,
      destinationFile,
      project: fixture.project,
      resources: fixture.resources,
      compilePortableExecutable: async ({ outputFile }) => {
        await expect(readFile(destinationFile, "utf8")).resolves.toBe("previous executable");
        await writeFile(outputFile, "replacement executable", "utf8");
      }
    });

    await expect(readFile(destinationFile, "utf8")).resolves.toBe("replacement executable");
  });

  it("keeps an existing executable unchanged when compilation fails", async () => {
    const fixture = await createPackagingFixture();
    const destinationFile = path.join(fixture.destinationDirectory, "Existing Player.exe");
    await writeFile(destinationFile, "previous executable", "utf8");

    await expect(
      createPortableWindowsRuntime({
        buildDirectory: fixture.buildDirectory,
        destinationFile,
        project: fixture.project,
        resources: fixture.resources,
        compilePortableExecutable: async () => {
          throw new Error("simulated compiler failure");
        }
      })
    ).rejects.toThrow(/simulated compiler failure/i);

    await expect(readFile(destinationFile, "utf8")).resolves.toBe("previous executable");
  });

  it("rejects linked destinations and non-executable file names", async () => {
    const fixture = await createPackagingFixture();
    const linkedTarget = path.join(fixture.destinationDirectory, "linked-target");
    const linkedDestination = path.join(fixture.destinationDirectory, "linked.exe");
    await mkdir(linkedTarget);
    const sentinelPath = path.join(linkedTarget, "keep.txt");
    await writeFile(sentinelPath, "do not replace", "utf8");
    await symlink(linkedTarget, linkedDestination, process.platform === "win32" ? "junction" : "dir");

    await expect(
      createPortableWindowsRuntime({
        buildDirectory: fixture.buildDirectory,
        destinationFile: linkedDestination,
        project: fixture.project,
        resources: fixture.resources,
        compilePortableExecutable: async () => undefined
      })
    ).rejects.toThrow(/not a normal file/i);
    await expect(readFile(sentinelPath, "utf8")).resolves.toBe("do not replace");

    await expect(
      createPortableWindowsRuntime({
        buildDirectory: fixture.buildDirectory,
        destinationFile: path.join(fixture.destinationDirectory, "player.zip"),
        project: fixture.project,
        resources: fixture.resources,
        compilePortableExecutable: async () => undefined
      })
    ).rejects.toThrow(/must end in \.exe/i);
  });
});

describe("portable NSIS script", () => {
  it("escapes project-controlled text instead of allowing injected directives", () => {
    const script = createPortableNsisScript({
      outputFile: "C:\\safe\\portable.exe",
      payloadDirectory: "C:\\safe\\payload",
      productName: 'Game"\nSection injected\n$INSTDIR',
      version: "1.2.3-beta"
    });

    expect(script).not.toContain("\nSection injected\n");
    expect(script).toContain("Game$\\\"");
    expect(script).toContain("$$INSTDIR");
    expect(script).toContain('VIProductVersion "1.2.3.0"');
    expect(script).toContain('!include "FileFunc.nsh"');
    expect(script).toContain("${GetParameters} $R0");
    expect(script).toContain('MAGE2 Player.exe" $R0');
  });

  it("creates safe, recognizable suggested names", () => {
    expect(sanitizeRuntimeArtifactName('  My <Game>: Finale.  ')).toBe("My -Game-- Finale");
    expect(suggestedRuntimeArtifactName("My Game", "windows")).toBe("My Game Player.exe");
    expect(suggestedRuntimeArtifactName("My Game", "web")).toBe("My Game Web");
  });
});

async function createPackagingFixture() {
  const rootDirectory = await createTempDirectory("mage2-portable-test-");
  const runtimeTemplateDirectory = path.join(rootDirectory, "template");
  const nsisDirectory = path.join(rootDirectory, "nsis");
  const buildDirectory = path.join(rootDirectory, "build");
  const destinationDirectory = path.join(rootDirectory, "destination");

  await mkdir(path.join(runtimeTemplateDirectory, "resources"), { recursive: true });
  await writeFile(path.join(runtimeTemplateDirectory, "MAGE2 Player.exe"), "template executable", "utf8");
  await writeFile(path.join(runtimeTemplateDirectory, "resources", "app.mage2asar"), "runtime app", "utf8");
  await mkdir(path.join(nsisDirectory, "Include"), { recursive: true });
  await mkdir(path.join(nsisDirectory, "Stubs"), { recursive: true });
  await writeFile(path.join(nsisDirectory, "makensis.exe"), "compiler", "utf8");
  await mkdir(path.join(buildDirectory, "content"), { recursive: true });
  await mkdir(path.join(buildDirectory, "media"), { recursive: true });
  await mkdir(destinationDirectory);

  await writeFile(path.join(buildDirectory, "media", "icon.en.png"), "creator icon", "utf8");
  await writeFile(
    path.join(buildDirectory, "build-manifest.json"),
    JSON.stringify({
      projectId: "project_portable_test",
      projectName: "Safe Game",
      contentPath: "content/project-content.json",
      assetMap: { asset_icon: { en: "media/icon.en.png" } }
    }),
    "utf8"
  );
  await writeFile(
    path.join(buildDirectory, "content", "project-content.json"),
    JSON.stringify({
      manifest: {
        defaultLanguage: "en",
        playerPresentation: { appIconAssetId: "asset_icon" }
      }
    }),
    "utf8"
  );

  const project = createDefaultProjectBundle("Safe Game");
  project.manifest.projectId = "project_portable_test";
  project.manifest.gameVersion = "1.2.3-beta";

  return {
    buildDirectory,
    destinationDirectory,
    project,
    resources: {
      runtimeTemplateDirectory,
      nsisDirectory
    }
  };
}

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

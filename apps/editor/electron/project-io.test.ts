import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultProjectBundle, type ProjectBundle } from "@mage2/schema";
import {
  __projectIoTestHooks,
  createProjectInDirectory,
  inspectProjectDirectory,
  loadProjectFromDirectory,
  saveProjectToDirectory
} from "./project-io";

const tempDirs: string[] = [];
const projectFileNames = [
  "project.json",
  "assets.json",
  "locations.json",
  "scenes.json",
  "dialogues.json",
  "inventory.json",
  "strings.json"
] as const;

afterEach(async () => {
  __projectIoTestHooks.beforeAtomicReplace = undefined;
  __projectIoTestHooks.beforeCreateFinalCheck = undefined;
  __projectIoTestHooks.beforeCreatePublish = undefined;
  __projectIoTestHooks.beforeContainedMutation = undefined;
  await Promise.all(
    tempDirs.splice(0).map((tempDir) =>
      rm(tempDir, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("starter project creation", () => {
  it("creates new starter projects with the placeholder hotspot on the desk doors", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-starter-"));
    tempDirs.push(projectDir);

    const project = await createProjectInDirectory(projectDir, "Fresh Starter");
    const hotspot = project.scenes.items[0].hotspots[0];
    const starterScenePng = await readFile(path.join(projectDir, "assets", "starter-scene.png"));
    const starterVariant = project.assets.assets[0]?.variants[project.manifest.defaultLanguage];

    expect(hotspot?.name).toBe("Placeholder");
    expect(hotspot?.commentTextId).toBe("text.hotspot.inspect.comment");
    expect(hotspot?.x).toBeCloseTo(338 / 1280);
    expect(hotspot?.y).toBeCloseTo(444 / 720);
    expect(hotspot?.width).toBeCloseTo(244 / 1280);
    expect(hotspot?.height).toBeCloseTo(148 / 720);
    expect(hotspot).not.toHaveProperty("labelTextId");
    expect(project.strings.byLocale[project.manifest.defaultLanguage]).not.toHaveProperty("text.hotspot.inspect");
    expect(project.strings.byLocale[project.manifest.defaultLanguage]["text.hotspot.inspect.comment"]).toBe(
      "Add real hotspots in Scenes"
    );
    expect(starterScenePng.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(starterScenePng.byteLength).toBeGreaterThan(0);
    expect(starterVariant?.proxyPath).toBe(path.join(projectDir, ".mage2", "proxies", "asset_placeholder.en.png"));
    expect(starterVariant?.posterPath).toBe(path.join(projectDir, ".mage2", "proxies", "asset_placeholder.en.thumb.png"));
    expect(await readFile(starterVariant!.proxyPath!)).not.toHaveLength(0);
    expect(await readFile(starterVariant!.posterPath!)).not.toHaveLength(0);
  });

  it("leaves an existing non-empty target untouched, including hidden entries", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-starter-nonempty-"));
    tempDirs.push(projectDir);
    const hiddenEntry = path.join(projectDir, ".keep");
    await writeFile(hiddenEntry, "preserve me", "utf8");

    await expect(createProjectInDirectory(projectDir, "Must Not Exist")).rejects.toThrow(
      /target directory must be empty/i
    );

    expect(await readdir(projectDir)).toEqual([".keep"]);
    expect(await readFile(hiddenEntry, "utf8")).toBe("preserve me");
  });

  it("re-checks target emptiness immediately before its first write", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-starter-race-"));
    tempDirs.push(projectDir);
    const finalCheckReached = createDeferred();
    const allowFinalCheck = createDeferred();

    __projectIoTestHooks.beforeCreateFinalCheck = async () => {
      finalCheckReached.resolve();
      await allowFinalCheck.promise;
    };

    const creation = createProjectInDirectory(projectDir, "Raced Starter");
    await finalCheckReached.promise;
    await writeFile(path.join(projectDir, ".arrived-late"), "external entry", "utf8");
    allowFinalCheck.resolve();

    await expect(creation).rejects.toThrow(/target directory must be empty/i);
    expect(await readdir(projectDir)).toEqual([".arrived-late"]);
  });

  it("never overwrites an entry that arrives at the exact file publication boundary", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-starter-publish-race-"));
    tempDirs.push(projectDir);
    const concurrentContents = "external project file";

    __projectIoTestHooks.beforeCreatePublish = async ({ kind, relativePath }) => {
      if (kind === "file" && relativePath === "project.json") {
        __projectIoTestHooks.beforeCreatePublish = undefined;
        await writeFile(path.join(projectDir, relativePath), concurrentContents, "utf8");
      }
    };

    await expect(createProjectInDirectory(projectDir, "Boundary Race")).rejects.toThrow(
      /target directory must be empty/i
    );

    expect(await readdir(projectDir)).toEqual(["project.json"]);
    expect(await readFile(path.join(projectDir, "project.json"), "utf8")).toBe(
      concurrentContents
    );
  });

  it("rolls back only its own entries when concurrent content arrives inside a created directory", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-starter-nested-race-"));
    tempDirs.push(projectDir);
    const relativeAssetPath = path.join("assets", "starter-scene.png");
    const concurrentContents = "external asset";

    __projectIoTestHooks.beforeCreatePublish = async ({ kind, relativePath }) => {
      if (kind === "file" && relativePath === relativeAssetPath) {
        __projectIoTestHooks.beforeCreatePublish = undefined;
        await writeFile(path.join(projectDir, relativePath), concurrentContents, "utf8");
      }
    };

    await expect(createProjectInDirectory(projectDir, "Nested Race")).rejects.toThrow(
      /target directory must be empty/i
    );

    expect(await readdir(projectDir)).toEqual(["assets"]);
    expect(await readdir(path.join(projectDir, "assets"))).toEqual(["starter-scene.png"]);
    expect(await readFile(path.join(projectDir, relativeAssetPath), "utf8")).toBe(
      concurrentContents
    );
  });
});

describe("transactional project saves", () => {
  it("stages the complete new bundle and immediately restores the prior bundle on replacement failure", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-save-rollback-"));
    tempDirs.push(projectDir);
    const oldProject = createDefaultProjectBundle("Old coherent project");
    await saveProjectToDirectory(projectDir, oldProject);
    const oldContents = await readProjectFileContents(projectDir);
    const newProject = createDefaultProjectBundle("New coherent project");
    let completeStageObserved = false;

    __projectIoTestHooks.beforeAtomicReplace = async ({ operation, fileName }) => {
      if (operation !== "commit") {
        return;
      }

      if (fileName === "project.json") {
        await Promise.all(
          projectFileNames.map((stagedFileName) =>
            readFile(
              path.join(
                projectDir,
                ".mage2",
                ".project-save-transaction",
                "staged",
                stagedFileName
              ),
              "utf8"
            )
          )
        );
        completeStageObserved = true;
      }

      if (fileName === "scenes.json") {
        throw new Error("injected atomic replacement failure");
      }
    };

    await expect(saveProjectToDirectory(projectDir, newProject)).rejects.toThrow(
      "injected atomic replacement failure"
    );

    expect(completeStageObserved).toBe(true);
    expect(await readProjectFileContents(projectDir)).toEqual(oldContents);
    await expect(
      access(path.join(projectDir, ".mage2", ".project-save-transaction", "journal.json"))
    ).rejects.toThrow();
  });

  it("recovers an interrupted mixed replacement before loading", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-save-recover-load-"));
    tempDirs.push(projectDir);
    const oldProject = createDefaultProjectBundle("Recover before load");
    await saveProjectToDirectory(projectDir, oldProject);
    const oldContents = await readProjectFileContents(projectDir);
    await prepareInterruptedSave(
      projectDir,
      oldContents,
      createDefaultProjectBundle("Interrupted replacement")
    );

    const loaded = await loadProjectFromDirectory(projectDir);

    expect(loaded.manifest.projectName).toBe("Recover before load");
    expect(await readProjectFileContents(projectDir)).toEqual(oldContents);
  });

  it("recovers an interrupted mixed replacement before inspection", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-save-recover-inspect-"));
    tempDirs.push(projectDir);
    const oldProject = createDefaultProjectBundle("Recover before inspection");
    await saveProjectToDirectory(projectDir, oldProject);
    const oldContents = await readProjectFileContents(projectDir);
    await prepareInterruptedSave(
      projectDir,
      oldContents,
      createDefaultProjectBundle("Interrupted replacement")
    );

    const inspection = await inspectProjectDirectory(projectDir);

    expect(inspection).toEqual({
      isProjectDirectory: true,
      projectName: "Recover before inspection"
    });
    expect(await readProjectFileContents(projectDir)).toEqual(oldContents);
  });

  it("recovers before a new save so that a failed new save rolls back to the complete old bundle", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-save-recover-save-"));
    tempDirs.push(projectDir);
    const oldProject = createDefaultProjectBundle("Recover before save");
    await saveProjectToDirectory(projectDir, oldProject);
    const oldContents = await readProjectFileContents(projectDir);
    await prepareInterruptedSave(
      projectDir,
      oldContents,
      createDefaultProjectBundle("Interrupted replacement")
    );

    __projectIoTestHooks.beforeAtomicReplace = ({ operation, fileName }) => {
      if (operation === "commit" && fileName === "scenes.json") {
        throw new Error("injected second save failure");
      }
    };

    await expect(
      saveProjectToDirectory(projectDir, createDefaultProjectBundle("Second save"))
    ).rejects.toThrow("injected second save failure");

    expect(await readProjectFileContents(projectDir)).toEqual(oldContents);
  });

  it("restarts recovery after a prior rollback left restore artifacts behind", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-save-retry-recovery-"));
    tempDirs.push(projectDir);
    const oldProject = createDefaultProjectBundle("Complete old bundle");
    await saveProjectToDirectory(projectDir, oldProject);
    const oldContents = await readProjectFileContents(projectDir);

    __projectIoTestHooks.beforeAtomicReplace = ({ operation, fileName }) => {
      if (fileName !== "scenes.json") {
        return;
      }
      if (operation === "commit") {
        throw new Error("injected save interruption");
      }
      throw new Error("injected recovery interruption");
    };

    await expect(
      saveProjectToDirectory(projectDir, createDefaultProjectBundle("Interrupted bundle"))
    ).rejects.toThrow(/automatic rollback could not complete/i);

    const transactionRoot = path.join(projectDir, ".mage2", ".project-save-transaction");
    expect(
      await readFile(path.join(transactionRoot, "restore", "scenes.json.restore"), "utf8")
    ).toBe(oldContents["scenes.json"]);
    await access(path.join(transactionRoot, "journal.json"));

    __projectIoTestHooks.beforeAtomicReplace = undefined;
    const loaded = await loadProjectFromDirectory(projectDir);

    expect(loaded.manifest.projectName).toBe("Complete old bundle");
    expect(await readProjectFileContents(projectDir)).toEqual(oldContents);
    await expect(access(transactionRoot)).rejects.toThrow();
  });

  it("serializes concurrent saves for the same project directory", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-save-concurrent-"));
    tempDirs.push(projectDir);
    await saveProjectToDirectory(projectDir, createDefaultProjectBundle("Initial"));
    const firstCommitReached = createDeferred();
    const allowFirstCommit = createDeferred();
    let manifestCommitCount = 0;

    __projectIoTestHooks.beforeAtomicReplace = async ({ operation, fileName }) => {
      if (operation !== "commit" || fileName !== "project.json") {
        return;
      }

      manifestCommitCount += 1;
      if (manifestCommitCount === 1) {
        firstCommitReached.resolve();
        await allowFirstCommit.promise;
      }
    };

    const firstSave = saveProjectToDirectory(
      projectDir,
      createDefaultProjectBundle("First concurrent save")
    );
    await firstCommitReached.promise;
    const secondSave = saveProjectToDirectory(
      projectDir,
      createDefaultProjectBundle("Second concurrent save")
    );

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(manifestCommitCount).toBe(1);

    allowFirstCommit.resolve();
    await Promise.all([firstSave, secondSave]);
    __projectIoTestHooks.beforeAtomicReplace = undefined;

    const loaded = await loadProjectFromDirectory(projectDir);
    expect(loaded.manifest.projectName).toBe("Second concurrent save");
  });

  it("serializes concurrent saves addressed through a physical-directory alias", async () => {
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "mage2-save-alias-"));
    tempDirs.push(sandbox);
    const projectDir = path.join(sandbox, "project");
    const aliasDir = path.join(sandbox, "project-alias");
    await mkdir(projectDir);
    await saveProjectToDirectory(projectDir, createDefaultProjectBundle("Initial"));
    await symlink(projectDir, aliasDir, process.platform === "win32" ? "junction" : "dir");
    const firstCommitReached = createDeferred();
    const allowFirstCommit = createDeferred();
    let manifestCommitCount = 0;

    __projectIoTestHooks.beforeAtomicReplace = async ({ operation, fileName }) => {
      if (operation !== "commit" || fileName !== "project.json") {
        return;
      }
      manifestCommitCount += 1;
      if (manifestCommitCount === 1) {
        firstCommitReached.resolve();
        await allowFirstCommit.promise;
      }
    };

    const firstSave = saveProjectToDirectory(
      projectDir,
      createDefaultProjectBundle("Physical path save")
    );
    await firstCommitReached.promise;
    const aliasedSave = saveProjectToDirectory(
      aliasDir,
      createDefaultProjectBundle("Aliased path save")
    );

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(manifestCommitCount).toBe(1);
    allowFirstCommit.resolve();
    await Promise.all([firstSave, aliasedSave]);
    __projectIoTestHooks.beforeAtomicReplace = undefined;

    expect((await loadProjectFromDirectory(projectDir)).manifest.projectName).toBe(
      "Aliased path save"
    );
  });

  it("rejects a transaction-root junction without touching its external target", async () => {
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "mage2-save-reparse-"));
    tempDirs.push(sandbox);
    const projectDir = path.join(sandbox, "project");
    const externalDir = path.join(sandbox, "external");
    const externalSentinel = path.join(externalDir, "keep.txt");
    await mkdir(projectDir);
    await mkdir(externalDir);
    await writeFile(externalSentinel, "preserve external data", "utf8");
    await saveProjectToDirectory(projectDir, createDefaultProjectBundle("Safe project"));
    const transactionRoot = path.join(projectDir, ".mage2", ".project-save-transaction");
    await symlink(
      externalDir,
      transactionRoot,
      process.platform === "win32" ? "junction" : "dir"
    );

    await expect(loadProjectFromDirectory(projectDir)).rejects.toThrow(
      /symbolic link|reparse point|filesystem alias/i
    );
    expect(await readFile(externalSentinel, "utf8")).toBe("preserve external data");
  });

  it("revalidates transaction ancestry after a mutation-boundary directory swap", async () => {
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "mage2-save-swap-"));
    tempDirs.push(sandbox);
    const projectDir = path.join(sandbox, "project");
    const externalDir = path.join(sandbox, "external");
    const externalSentinel = path.join(externalDir, "keep.txt");
    await mkdir(projectDir);
    await mkdir(externalDir);
    await writeFile(externalSentinel, "preserve external data", "utf8");
    await saveProjectToDirectory(projectDir, createDefaultProjectBundle("Before swap"));
    const oldContents = await readProjectFileContents(projectDir);
    const transactionRoot = path.join(projectDir, ".mage2", ".project-save-transaction");
    const quarantinedRoot = path.join(projectDir, ".mage2", ".project-save-transaction-owned");
    let swapped = false;

    __projectIoTestHooks.beforeContainedMutation = async ({ kind, destinationPath }) => {
      if (!swapped && kind === "rename" && destinationPath?.endsWith("journal.json")) {
        swapped = true;
        await rename(transactionRoot, quarantinedRoot);
        await symlink(
          externalDir,
          transactionRoot,
          process.platform === "win32" ? "junction" : "dir"
        );
      }
    };

    await expect(
      saveProjectToDirectory(projectDir, createDefaultProjectBundle("After swap"))
    ).rejects.toThrow(/symbolic link|reparse point|filesystem alias/i);
    expect(await readProjectFileContents(projectDir)).toEqual(oldContents);
    expect(await readFile(externalSentinel, "utf8")).toBe("preserve external data");
  });
});

describe("inspectProjectDirectory", () => {
  it("recognizes loadable MAGE2 project folders", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-inspect-"));
    tempDirs.push(projectDir);

    const project = await createProjectInDirectory(projectDir, "Inspectable Project");
    const inspection = await inspectProjectDirectory(projectDir);

    expect(inspection).toEqual({
      isProjectDirectory: true,
      projectName: project.manifest.projectName
    });
  });

  it("rejects folders missing required project files", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-inspect-"));
    tempDirs.push(projectDir);

    const inspection = await inspectProjectDirectory(projectDir);

    expect(inspection.isProjectDirectory).toBe(false);
    expect(inspection.reason).toContain("missing");
  });
});

describe("removed timed text persistence", () => {
  it("strips legacy timed text scene data while saving the current scene shape", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-save-"));
    tempDirs.push(projectDir);

    const project = createDefaultProjectBundle("No Timed Text File");
    project.assets.assets.push({
      id: "asset_visual",
      kind: "image",
      name: "placeholder.png",
      variants: {
        en: {
          sourcePath: path.join(projectDir, "assets", "placeholder.png"),
          importedAt: new Date(0).toISOString()
        }
      }
    });
    project.scenes.items[0].backgroundAssetId = "asset_visual";
    const legacyTracksKey = ["sub", "titleTracks"].join("");
    (project.scenes.items[0] as Record<string, unknown>)[legacyTracksKey] = [
      {
        id: "legacy_scene_text",
        cues: [
          {
            id: "cue_scene",
            startMs: 0,
            endMs: 1000,
            textId: "text.cue_scene.line"
          }
        ]
      }
    ];
    project.strings.byLocale[project.manifest.defaultLanguage]["text.cue_scene.line"] = "Localized text";

    await saveProjectToDirectory(projectDir, project);

    const savedScenes = JSON.parse(await readFile(path.join(projectDir, "scenes.json"), "utf8")) as {
      items: Array<Record<string, unknown>>;
    };
    expect(savedScenes.items[0]).not.toHaveProperty(legacyTracksKey);
    await expect(readFile(path.join(projectDir, ["sub", "titles.json"].join("")), "utf8")).rejects.toThrow();
  });
});

describe("loadProjectFromDirectory", () => {
  it("persists starter response groups exactly once when an existing project is first opened", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-response-migration-"));
    tempDirs.push(projectDir);
    await createProjectInDirectory(projectDir, "Existing Project");

    const dialoguesPath = path.join(projectDir, "dialogues.json");
    const stringsPath = path.join(projectDir, "strings.json");
    const scenesPath = path.join(projectDir, "scenes.json");
    const dialogues = JSON.parse(await readFile(dialoguesPath, "utf8")) as { schemaVersion: number; items: unknown[] };
    const strings = JSON.parse(await readFile(stringsPath, "utf8")) as {
      schemaVersion: number;
      byLocale: Record<string, Record<string, string>>;
    };
    for (const values of Object.values(strings.byLocale)) {
      for (const textId of Object.keys(values)) {
        if (textId.startsWith("text.response.starter.")) delete values[textId];
      }
    }
    await writeFile(dialoguesPath, JSON.stringify({ schemaVersion: dialogues.schemaVersion, items: dialogues.items }, null, 2), "utf8");
    await writeFile(stringsPath, JSON.stringify(strings, null, 2), "utf8");

    const migrated = await loadProjectFromDirectory(projectDir);
    const persistedDialogues = JSON.parse(await readFile(dialoguesPath, "utf8")) as {
      starterResponsesVersion: number;
      responseGroups: unknown[];
    };
    const persistedScenes = JSON.parse(await readFile(scenesPath, "utf8")) as { items: Array<{ hotspots: unknown[] }> };
    expect(migrated.dialogues.responseGroups).toHaveLength(4);
    expect(persistedDialogues.starterResponsesVersion).toBe(1);
    expect(persistedDialogues.responseGroups).toHaveLength(4);
    expect(persistedScenes.items[0]!.hotspots[0]).not.toHaveProperty("response");

    await writeFile(dialoguesPath, JSON.stringify({ ...persistedDialogues, responseGroups: [] }, null, 2), "utf8");
    expect((await loadProjectFromDirectory(projectDir)).dialogues.responseGroups).toEqual([]);
  });

  it("backfills dedicated image thumbnails for legacy preview metadata", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mage2-load-"));
    tempDirs.push(projectDir);

    const project = createDefaultProjectBundle("Legacy previews");
    const sourcePath = path.join(projectDir, "assets", "legacy.svg");
    const proxyPath = path.join(projectDir, ".mage2", "proxies", "asset_legacy.en.png");

    await mkdir(path.dirname(sourcePath), { recursive: true });
    await mkdir(path.dirname(proxyPath), { recursive: true });
    await writeFile(
      sourcePath,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#102030"/></svg>',
      "utf8"
    );
    await writeFile(proxyPath, "legacy proxy", "utf8");

    project.assets.assets = [
      {
        id: "asset_legacy",
        kind: "image",
        name: "legacy.svg",
        variants: {
          en: {
            sourcePath,
            proxyPath,
            posterPath: proxyPath,
            importedAt: "2026-03-21T00:00:00.000Z"
          }
        }
      }
    ];
    project.scenes.items[0].backgroundAssetId = "asset_legacy";

    await saveProjectToDirectory(projectDir, project);

    const loadedProject = await loadProjectFromDirectory(projectDir);
    const loadedVariant = loadedProject.assets.assets[0]?.variants.en;

    expect(loadedVariant?.proxyPath).toBe(proxyPath);
    expect(loadedVariant?.posterPath).toBe(path.join(projectDir, ".mage2", "proxies", "asset_legacy.en.thumb.png"));
    expect(loadedVariant?.posterPath).not.toBe(loadedVariant?.proxyPath);
    expect(await readFile(loadedVariant!.posterPath!)).not.toHaveLength(0);
  });
});

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function readProjectFileContents(projectDir: string): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      projectFileNames.map(async (fileName) => [
        fileName,
        await readFile(path.join(projectDir, fileName), "utf8")
      ])
    )
  );
}

async function prepareInterruptedSave(
  projectDir: string,
  oldContents: Record<string, string>,
  replacement: ProjectBundle
): Promise<void> {
  const transactionRoot = path.join(projectDir, ".mage2", ".project-save-transaction");
  const backupDirectory = path.join(transactionRoot, "backup");
  await mkdir(backupDirectory, { recursive: true });

  await Promise.all(
    projectFileNames.map((fileName) =>
      writeFile(path.join(backupDirectory, fileName), oldContents[fileName]!, "utf8")
    )
  );
  await writeFile(
    path.join(transactionRoot, "journal.json"),
    JSON.stringify(
      {
        version: 1,
        files: projectFileNames.map((fileName) => ({ fileName, existed: true }))
      },
      null,
      2
    ),
    "utf8"
  );

  const replacementContents: Record<(typeof projectFileNames)[number], unknown> = {
    "project.json": replacement.manifest,
    "assets.json": replacement.assets,
    "locations.json": replacement.locations,
    "scenes.json": replacement.scenes,
    "dialogues.json": replacement.dialogues,
    "inventory.json": replacement.inventory,
    "strings.json": replacement.strings
  };

  for (const fileName of projectFileNames.slice(0, 3)) {
    await writeFile(
      path.join(projectDir, fileName),
      JSON.stringify(replacementContents[fileName], null, 2),
      "utf8"
    );
  }
}

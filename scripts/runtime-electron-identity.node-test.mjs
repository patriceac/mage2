import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  normalizeRuntimeIdentifier,
  readPlayerBuildIdentitySync,
  resolveRuntimeApplicationIdentity
} from "../apps/runtime-electron/identity.mjs";

test("runtime application identity is stable and isolated per project", () => {
  assert.deepEqual(
    resolveRuntimeApplicationIdentity({ projectId: "Beacon_Project 01", projectName: "Beacon at Dusk" }),
    {
      appName: "Beacon at Dusk Player",
      appUserModelId: "com.mage2.runtime.beacon.project.01",
      userDataDirectoryName: "beacon.project.01"
    }
  );
  assert.equal(normalizeRuntimeIdentifier("../../"), "project");
});

test("runtime identity is read from the exported build manifest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mage2-runtime-identity-"));
  try {
    await mkdir(root, { recursive: true });
    await writeFile(
      path.join(root, "build-manifest.json"),
      JSON.stringify({ projectId: "project_identity", projectName: "Identity Game" }),
      "utf8"
    );
    assert.deepEqual(readPlayerBuildIdentitySync(root), {
      projectId: "project_identity",
      projectName: "Identity Game"
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

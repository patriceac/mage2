import { readFileSync } from "node:fs";
import path from "node:path";

export function readPlayerBuildIdentitySync(rootDirectory) {
  const manifestPath = path.join(path.resolve(rootDirectory), "build-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const projectId = String(manifest.projectId ?? "").trim();
  if (!projectId) {
    throw new Error(`Runtime build manifest is missing a projectId: ${manifestPath}`);
  }
  return {
    projectId,
    projectName: String(manifest.projectName ?? projectId).trim() || projectId
  };
}

export function resolveRuntimeApplicationIdentity(buildIdentity) {
  const normalizedProjectId = normalizeRuntimeIdentifier(buildIdentity.projectId);
  const projectName = String(buildIdentity.projectName ?? buildIdentity.projectId).trim() || "MAGE2 Game";
  return {
    appName: `${projectName} Player`,
    appUserModelId: `com.mage2.runtime.${normalizedProjectId}`,
    userDataDirectoryName: normalizedProjectId
  };
}

export function normalizeRuntimeIdentifier(value) {
  return String(value)
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "") || "project";
}

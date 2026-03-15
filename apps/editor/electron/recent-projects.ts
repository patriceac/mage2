import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface RecentProject {
  projectDir: string;
  projectName: string;
  lastOpenedAt: string;
}

const RECENT_PROJECTS_FILENAME = "recent-projects.json";
export const MAX_RECENT_PROJECTS = 5;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeRecentProject(value: unknown): RecentProject | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  if (!isNonEmptyString(candidate.projectDir)) {
    return undefined;
  }

  const projectDir = candidate.projectDir.trim();
  const projectName = resolveRecentProjectName(projectDir, candidate.projectName);
  const lastOpenedAt = isNonEmptyString(candidate.lastOpenedAt)
    ? candidate.lastOpenedAt.trim()
    : new Date(0).toISOString();

  return {
    projectDir,
    projectName,
    lastOpenedAt
  };
}

function normalizeProjectKey(projectDir: string): string {
  return path.normalize(projectDir).toLowerCase();
}

export function resolveRecentProjectName(projectDir: string, projectName?: unknown): string {
  if (isNonEmptyString(projectName)) {
    return projectName.trim();
  }

  const parts = projectDir.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? projectDir;
}

export function normalizeRecentProjects(value: unknown): RecentProject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenProjectKeys = new Set<string>();
  const normalizedProjects: RecentProject[] = [];

  for (const entry of value) {
    const recentProject = normalizeRecentProject(entry);
    if (!recentProject) {
      continue;
    }

    const projectKey = normalizeProjectKey(recentProject.projectDir);
    if (seenProjectKeys.has(projectKey)) {
      continue;
    }

    seenProjectKeys.add(projectKey);
    normalizedProjects.push(recentProject);

    if (normalizedProjects.length >= MAX_RECENT_PROJECTS) {
      break;
    }
  }

  return normalizedProjects;
}

export function loadRecentProjects(userDataPath: string): RecentProject[] {
  try {
    const serialized = readFileSync(getRecentProjectsPath(userDataPath), "utf8");
    return normalizeRecentProjects(JSON.parse(serialized));
  } catch {
    return [];
  }
}

export function saveRecentProjects(userDataPath: string, recentProjects: RecentProject[]): void {
  const filePath = getRecentProjectsPath(userDataPath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(normalizeRecentProjects(recentProjects)), "utf8");
}

export function rememberRecentProject(
  recentProjects: RecentProject[],
  projectDir: string,
  projectName?: string,
  lastOpenedAt = new Date().toISOString()
): RecentProject[] {
  const nextProject: RecentProject = {
    projectDir: projectDir.trim(),
    projectName: resolveRecentProjectName(projectDir, projectName),
    lastOpenedAt
  };
  const targetProjectKey = normalizeProjectKey(nextProject.projectDir);

  return normalizeRecentProjects([
    nextProject,
    ...recentProjects.filter((entry) => normalizeProjectKey(entry.projectDir) !== targetProjectKey)
  ]);
}

export function forgetRecentProject(recentProjects: RecentProject[], projectDir: string): RecentProject[] {
  const targetProjectKey = normalizeProjectKey(projectDir);
  return recentProjects.filter((entry) => normalizeProjectKey(entry.projectDir) !== targetProjectKey);
}

export function getRecentProjectsPath(userDataPath: string): string {
  return path.join(userDataPath, RECENT_PROJECTS_FILENAME);
}

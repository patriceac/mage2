export interface RecentProjectSummary {
  projectDir: string;
  projectName: string;
  lastOpenedAt: string;
}

const MAX_RECENT_PROJECTS = 5;

export function resolveProjectName(input: string, directoryPath: string): string {
  const trimmed = input.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }

  const parts = directoryPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "New FMV Project";
}

function normalizeProjectDirectory(projectDir: string): string {
  return projectDir.trim().replaceAll("/", "\\");
}

export function createRecentProjectSummary(projectDir: string, projectName?: string): RecentProjectSummary {
  const normalizedProjectDir = normalizeProjectDirectory(projectDir);
  return {
    projectDir: normalizedProjectDir,
    projectName: resolveProjectName(projectName ?? "", normalizedProjectDir),
    lastOpenedAt: new Date().toISOString()
  };
}

export function isSameProjectDirectory(leftProjectDir: string, rightProjectDir: string): boolean {
  return normalizeProjectDirectory(leftProjectDir).toLowerCase() === normalizeProjectDirectory(rightProjectDir).toLowerCase();
}

export function upsertRecentProjects(
  recentProjects: RecentProjectSummary[],
  projectDir: string,
  projectName?: string
): RecentProjectSummary[] {
  return [
    createRecentProjectSummary(projectDir, projectName),
    ...recentProjects.filter((recentProject) => !isSameProjectDirectory(recentProject.projectDir, projectDir))
  ].slice(0, MAX_RECENT_PROJECTS);
}

export function mergeRecentProjects(
  primaryProjects: RecentProjectSummary[],
  secondaryProjects: RecentProjectSummary[]
): RecentProjectSummary[] {
  const mergedProjects: RecentProjectSummary[] = [];

  for (const recentProject of [...primaryProjects, ...secondaryProjects]) {
    if (mergedProjects.some((entry) => isSameProjectDirectory(entry.projectDir, recentProject.projectDir))) {
      continue;
    }

    mergedProjects.push(recentProject);
    if (mergedProjects.length >= MAX_RECENT_PROJECTS) {
      break;
    }
  }

  return mergedProjects;
}

export function removeRecentProjectEntry(
  recentProjects: RecentProjectSummary[],
  projectDir: string
): RecentProjectSummary[] {
  return recentProjects.filter((recentProject) => !isSameProjectDirectory(recentProject.projectDir, projectDir));
}

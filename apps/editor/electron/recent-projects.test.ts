import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_RECENT_PROJECTS,
  forgetRecentProject,
  loadRecentProjects,
  normalizeRecentProjects,
  rememberRecentProject,
  resolveRecentProjectName,
  saveRecentProjects
} from "./recent-projects";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) =>
      rm(tempDir, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("recent projects", () => {
  it("falls back to the folder name when the project name is missing", () => {
    expect(resolveRecentProjectName("D:\\Projects\\Prototype", undefined)).toBe("Prototype");
  });

  it("normalizes, deduplicates, and caps persisted entries", () => {
    expect(
      normalizeRecentProjects([
        {
          projectDir: "D:\\Projects\\One",
          projectName: "One",
          lastOpenedAt: "2025-01-01T00:00:00.000Z"
        },
        {
          projectDir: "d:\\projects\\one",
          projectName: "Ignored Duplicate",
          lastOpenedAt: "2025-01-02T00:00:00.000Z"
        },
        {
          projectDir: "D:\\Projects\\Two",
          projectName: "",
          lastOpenedAt: "2025-01-03T00:00:00.000Z"
        },
        {
          projectDir: "",
          projectName: "Invalid",
          lastOpenedAt: "2025-01-04T00:00:00.000Z"
        }
      ])
    ).toEqual([
      {
        projectDir: "D:\\Projects\\One",
        projectName: "One",
        lastOpenedAt: "2025-01-01T00:00:00.000Z"
      },
      {
        projectDir: "D:\\Projects\\Two",
        projectName: "Two",
        lastOpenedAt: "2025-01-03T00:00:00.000Z"
      }
    ]);
  });

  it("moves reopened projects to the front and keeps only the latest five", () => {
    let recentProjects = [
      {
        projectDir: "D:\\Projects\\One",
        projectName: "One",
        lastOpenedAt: "2025-01-01T00:00:00.000Z"
      },
      {
        projectDir: "D:\\Projects\\Two",
        projectName: "Two",
        lastOpenedAt: "2025-01-02T00:00:00.000Z"
      },
      {
        projectDir: "D:\\Projects\\Three",
        projectName: "Three",
        lastOpenedAt: "2025-01-03T00:00:00.000Z"
      },
      {
        projectDir: "D:\\Projects\\Four",
        projectName: "Four",
        lastOpenedAt: "2025-01-04T00:00:00.000Z"
      },
      {
        projectDir: "D:\\Projects\\Five",
        projectName: "Five",
        lastOpenedAt: "2025-01-05T00:00:00.000Z"
      }
    ];

    recentProjects = rememberRecentProject(
      recentProjects,
      "D:\\Projects\\Three",
      "Three",
      "2025-01-06T00:00:00.000Z"
    );
    recentProjects = rememberRecentProject(
      recentProjects,
      "D:\\Projects\\Six",
      "Six",
      "2025-01-07T00:00:00.000Z"
    );

    expect(recentProjects).toHaveLength(MAX_RECENT_PROJECTS);
    expect(recentProjects.map((entry) => entry.projectName)).toEqual([
      "Six",
      "Three",
      "One",
      "Two",
      "Four"
    ]);
  });

  it("forgets missing projects without disturbing the others", () => {
    expect(
      forgetRecentProject(
        [
          {
            projectDir: "D:\\Projects\\One",
            projectName: "One",
            lastOpenedAt: "2025-01-01T00:00:00.000Z"
          },
          {
            projectDir: "D:\\Projects\\Two",
            projectName: "Two",
            lastOpenedAt: "2025-01-02T00:00:00.000Z"
          }
        ],
        "d:\\projects\\one"
      )
    ).toEqual([
      {
        projectDir: "D:\\Projects\\Two",
        projectName: "Two",
        lastOpenedAt: "2025-01-02T00:00:00.000Z"
      }
    ]);
  });

  it("writes and reloads the recent project list", async () => {
    const userDataPath = await mkdtemp(path.join(os.tmpdir(), "mage2-recent-projects-"));
    tempDirs.push(userDataPath);

    const recentProjects = [
      {
        projectDir: "D:\\Projects\\One",
        projectName: "One",
        lastOpenedAt: "2025-01-01T00:00:00.000Z"
      },
      {
        projectDir: "D:\\Projects\\Two",
        projectName: "Two",
        lastOpenedAt: "2025-01-02T00:00:00.000Z"
      }
    ];

    saveRecentProjects(userDataPath, recentProjects);

    expect(loadRecentProjects(userDataPath)).toEqual(recentProjects);
  });
});

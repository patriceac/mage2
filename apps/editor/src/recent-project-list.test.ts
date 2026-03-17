import { describe, expect, it } from "vitest";
import {
  mergeRecentProjects,
  removeRecentProjectEntry,
  resolveProjectName,
  upsertRecentProjects,
  type RecentProjectSummary
} from "./recent-project-list";

describe("recent-project-list", () => {
  it("falls back to the folder name when the project name is blank", () => {
    expect(resolveProjectName("   ", "D:\\Projects\\Prototype")).toBe("Prototype");
  });

  it("keeps the most recent in-memory list when startup data arrives late", () => {
    const currentProjects: RecentProjectSummary[] = [
      {
        projectDir: "D:\\Projects\\Newest",
        projectName: "Newest",
        lastOpenedAt: "2026-03-17T00:10:00.000Z"
      }
    ];

    expect(mergeRecentProjects(currentProjects, [])).toEqual(currentProjects);
  });

  it("appends persisted entries behind newer in-memory ones without duplicates", () => {
    const currentProjects: RecentProjectSummary[] = [
      {
        projectDir: "D:\\Projects\\Newest",
        projectName: "Newest",
        lastOpenedAt: "2026-03-17T00:10:00.000Z"
      }
    ];
    const persistedProjects: RecentProjectSummary[] = [
      {
        projectDir: "d:\\projects\\newest",
        projectName: "Older Duplicate",
        lastOpenedAt: "2026-03-16T23:59:00.000Z"
      },
      {
        projectDir: "D:\\Projects\\Older",
        projectName: "Older",
        lastOpenedAt: "2026-03-16T23:50:00.000Z"
      }
    ];

    expect(mergeRecentProjects(currentProjects, persistedProjects)).toEqual([
      currentProjects[0],
      persistedProjects[1]
    ]);
  });

  it("moves newly opened projects to the front and removes forgotten ones", () => {
    const seededProjects: RecentProjectSummary[] = [
      {
        projectDir: "D:\\Projects\\One",
        projectName: "One",
        lastOpenedAt: "2026-03-16T23:00:00.000Z"
      },
      {
        projectDir: "D:\\Projects\\Two",
        projectName: "Two",
        lastOpenedAt: "2026-03-16T22:00:00.000Z"
      }
    ];

    const updatedProjects = upsertRecentProjects(seededProjects, "D:\\Projects\\Three", "Three");

    expect(updatedProjects[0]).toMatchObject({
      projectDir: "D:\\Projects\\Three",
      projectName: "Three"
    });
    expect(removeRecentProjectEntry(updatedProjects, "d:\\projects\\one")).toEqual([
      updatedProjects[0],
      updatedProjects[2]
    ]);
  });
});

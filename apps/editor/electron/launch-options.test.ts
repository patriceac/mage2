import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEditorLaunchOptions, resolveEditorLaunchArguments } from "./launch-options";

describe("resolveEditorLaunchArguments", () => {
  it("drops the Electron entrypoint in development", () => {
    expect(resolveEditorLaunchArguments(["electron.exe", "dist-electron/main.cjs", "--project", "fixtures/project-one"], true)).toEqual([
      "--project",
      "fixtures/project-one"
    ]);
  });

  it("drops only the executable path in packaged builds", () => {
    expect(resolveEditorLaunchArguments(["MAGE2 Editor.exe", "--project", "fixtures/project-one"], false)).toEqual([
      "--project",
      "fixtures/project-one"
    ]);
  });
});

describe("parseEditorLaunchOptions", () => {
  it("parses spaced project and tab flags", () => {
    expect(parseEditorLaunchOptions(["--project", "fixtures/project-one", "--tab", "playtest"])).toEqual({
      projectDir: path.resolve("fixtures/project-one"),
      tab: "playtest"
    });
  });

  it("parses inline project and tab flags", () => {
    expect(parseEditorLaunchOptions(["--project=fixtures/project-two", "--tab=scenes"])).toEqual({
      projectDir: path.resolve("fixtures/project-two"),
      tab: "scenes"
    });
  });

  it("accepts a positional project path", () => {
    expect(parseEditorLaunchOptions(["fixtures/project-four", "--tab=inventory"])).toEqual({
      projectDir: path.resolve("fixtures/project-four"),
      tab: "inventory"
    });
  });

  it("ignores invalid or incomplete launch flags", () => {
    expect(parseEditorLaunchOptions(["--project", "--tab", "missing"])).toEqual({});
    expect(parseEditorLaunchOptions(["--project=fixtures/project-three", "--tab=unknown"])).toEqual({
      projectDir: path.resolve("fixtures/project-three")
    });
  });
});

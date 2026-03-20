import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, toExportProjectData } from "@mage2/schema";
import { resolveRuntimeHeaderContent } from "./App";

describe("resolveRuntimeHeaderContent", () => {
  it("keeps only project identity in the runtime header", () => {
    const content = toExportProjectData(createDefaultProjectBundle("Runtime Header"));

    expect(resolveRuntimeHeaderContent(content)).toEqual({
      projectName: "Runtime Header"
    });
  });
});

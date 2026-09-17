import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  collectReferencedAssetIds,
  createDefaultProjectBundle,
  parseProjectBundle,
  resolveSpeakerPortraitAssetId,
  toExportProjectData,
  validateProject
} from "./index";

describe("shared speaker portraits", () => {
  it("round-trips one portrait per speaker and includes it in playable exports", () => {
    const project = createDefaultProjectBundle("Portraits");
    project.dialogues.speakerPortraits = { Tancrede: "portrait_tancrede" };
    const reopened = parseProjectBundle(JSON.parse(JSON.stringify(project)));
    expect(resolveSpeakerPortraitAssetId(reopened.dialogues.speakerPortraits, " Tancrede ")).toBe("portrait_tancrede");
    expect(resolveSpeakerPortraitAssetId(reopened.dialogues.speakerPortraits, "Narrator")).toBeUndefined();
    expect(resolveSpeakerPortraitAssetId(reopened.dialogues.speakerPortraits, "toString")).toBeUndefined();
    expect(toExportProjectData(reopened).speakerPortraits).toEqual({ Tancrede: "portrait_tancrede" });
    expect(collectReferencedAssetIds(reopened)).toContain("portrait_tancrede");
  });

  it("upgrades schema 16 projects without adding portraits to existing dialogue", () => {
    const project = createDefaultProjectBundle("Legacy portraits");
    const raw = JSON.parse(JSON.stringify(project));
    for (const key of ["manifest", "assets", "locations", "scenes", "dialogues", "inventory", "strings"]) {
      raw[key].schemaVersion = 16;
    }
    delete raw.dialogues.speakerPortraits;
    const parsed = parseProjectBundle(raw);
    expect(parsed.manifest.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.dialogues.speakerPortraits).toEqual({});
  });

  it("validates missing images, wrong media kinds, and locale coverage", () => {
    const project = createDefaultProjectBundle("Portrait validation");
    project.dialogues.speakerPortraits = { Tancrede: "portrait" };
    const portraitIssues = () => validateProject(project).issues.filter((issue) => issue.code.startsWith("DIALOGUE_PORTRAIT"));
    expect(portraitIssues().map((issue) => issue.code)).toEqual(["DIALOGUE_PORTRAIT_ASSET_MISSING"]);
    project.assets.assets.push({ id: "portrait", name: "Portrait", kind: "audio", variants: {} });
    expect(portraitIssues().map((issue) => issue.code)).toEqual(["DIALOGUE_PORTRAIT_KIND_INVALID"]);
    const portrait = project.assets.assets.at(-1)!;
    portrait.kind = "image";
    expect(portraitIssues().some((issue) => issue.code === "DIALOGUE_PORTRAIT_LOCALE_MISSING")).toBe(true);
    for (const locale of project.manifest.supportedLocales) {
      portrait.variants[locale] = { sourcePath: "portrait.png", importedAt: "2026-09-17T00:00:00.000Z" };
    }
    expect(portraitIssues()).toEqual([]);
  });
});

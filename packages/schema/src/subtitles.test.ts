import { describe, expect, it } from "vitest";
import { createDefaultProjectBundle, getCinematicSubtitleError, parseProjectBundle, resolveCinematicSubtitleText,
  toExportProjectData, validateProject, wrapCinematicSubtitle } from "./index";

function fixture() {
  const project = createDefaultProjectBundle("Timed subtitles");
  project.manifest.defaultLanguage = "en";
  project.manifest.supportedLocales = ["en", "fr"];
  project.dialogues.items = [{ id: "film", name: "Film", startNodeId: "line", nodes: [{
    id: "line", speaker: "Guide", cinematic: true, mediaAssetId: "clip", textId: "full", effects: [], choices: [],
    subtitleCues: [{ startMs: 200, endMs: 4000, textId: "first" }, { startMs: 4500, endMs: 8000, textId: "second" }]
  }] }];
  for (const [locale, first, second] of [["en", "A first line with its punctuation.", "The complete second line."],
    ["fr", "Une première ligne avec sa ponctuation.", "La seconde ligne complète."]]) {
    project.strings.byLocale[locale] = { full: `${first} ${second}`, first, second };
  }
  project.assets.assets = [{ id: "clip", name: "Clip", kind: "video", variants: Object.fromEntries(["en", "fr"].map(locale => [locale,
    { sourcePath: `${locale}.mp4`, importedAt: "2026-09-28", durationMs: 10000 }])) }];
  return { project, node: project.dialogues.items[0]!.nodes[0]!, strings: project.strings.byLocale.en! };
}

describe("cinematic subtitles", () => {
  it("counts spaces, punctuation and whole Unicode graphemes while wrapping without text loss", () => {
    const accent = "e\u0301".repeat(43);
    const emoji = "👩‍👩‍👧‍👦";
    expect(wrapCinematicSubtitle(accent)).toEqual([accent]);
    expect(wrapCinematicSubtitle("a".repeat(42) + emoji + "!?" )).toEqual(["a".repeat(42) + emoji, "!?"]);
    expect(wrapCinematicSubtitle("a".repeat(21) + " " + "b".repeat(22))).toEqual(["a".repeat(21), "b".repeat(22)]);
    expect(wrapCinematicSubtitle("漢".repeat(87))).toEqual(["漢".repeat(43), "漢".repeat(43), "漢"]);
    expect(wrapCinematicSubtitle("First line.\r\nSecond line.")).toEqual(["First line.", "Second line."]);
  });

  it("keeps localized cues through export, selects half-open intervals, and preserves uncued legacy text", () => {
    const { project, node, strings } = fixture();
    expect(getCinematicSubtitleError(node, strings, 10000)).toBeUndefined();
    expect(validateProject(project).issues.filter(issue => issue.code === "DIALOGUE_SUBTITLE_INVALID")).toEqual([]);
    expect(toExportProjectData(parseProjectBundle(JSON.parse(JSON.stringify(project)))).dialogues[0]!.nodes[0]!.subtitleCues).toEqual(node.subtitleCues);
    for (const [time, expected] of [[0, undefined], [200, strings.first], [3999, strings.first], [4000, undefined], [4500, strings.second], [8000, undefined]] as const) {
      expect(resolveCinematicSubtitleText(node, strings, time)).toBe(expected);
    }
    const legacy = JSON.parse(JSON.stringify(project));
    for (const key of ["manifest", "assets", "locations", "scenes", "dialogues", "inventory", "strings"]) legacy[key].schemaVersion = 21;
    delete legacy.dialogues.items[0].nodes[0].subtitleCues;
    const migrated = parseProjectBundle(legacy);
    expect(migrated.dialogues.items[0]!.nodes[0]!.subtitleCues).toBeUndefined();
    expect(migrated.strings.schemaVersion).toBe(22);
    expect(migrated.strings.byLocale.en).toMatchObject(strings);
    expect(migrated.strings.byLocale.fr).toMatchObject(project.strings.byLocale.fr!);
    expect(getCinematicSubtitleError(migrated.dialogues.items[0]!.nodes[0]!, strings)).toBeUndefined();
    strings.full = "Complete preserved dialogue. ".repeat(8);
    expect(getCinematicSubtitleError(migrated.dialogues.items[0]!.nodes[0]!, strings)).toMatch(/Add authored subtitleCues/);
    expect(strings.full).toBe("Complete preserved dialogue. ".repeat(8));
  });

  it("rejects invalid timing, missing translations, oversized cues and lost dialogue through project validation", () => {
    const invalidCases: Array<(value: ReturnType<typeof fixture>) => void> = [
      ({node}) => { node.subtitleCues![1]!.startMs = 3999; },
      ({node}) => { node.subtitleCues!.reverse(); },
      ({node}) => { node.subtitleCues![0]!.startMs = -1; },
      ({node}) => { node.subtitleCues![0]!.endMs = 200; },
      ({node}) => { node.subtitleCues![1]!.endMs = 10001; },
      ({project}) => { delete project.assets.assets[0]!.variants.fr!.durationMs; },
      ({project}) => { delete project.strings.byLocale.fr!.second; },
      ({project}) => { project.strings.byLocale.fr!.second = " "; },
      ({strings}) => { strings.first = "x".repeat(87); },
      ({strings}) => { strings.first = "One\nTwo\nThree"; },
      ({strings}) => { strings.second = "A lost sentence."; },
      ({node}) => { node.textId = "toString"; },
      ({node}) => { node.subtitleCues![0]!.textId = "constructor"; },
      ({node}) => { node.cinematic = false; }
    ];
    for (const change of invalidCases) {
      const value = fixture(); change(value);
      const report = validateProject(value.project);
      expect(report.valid).toBe(false);
      expect(report.issues.some(issue => issue.code === "DIALOGUE_SUBTITLE_INVALID" && issue.level === "error")).toBe(true);
    }
  });
});

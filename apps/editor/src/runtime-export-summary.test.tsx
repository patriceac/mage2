import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuntimeExportDialog } from "./dialogs";
import { EDITOR_CATALOG, createEditorTranslator } from "./i18n";
import { formatRuntimeExportMediaStatus } from "./runtime-export-summary";

const t = createEditorTranslator(EDITOR_CATALOG, "en");

describe("runtime export decision summary", () => {
  it("explains that Preview passes project health without claiming release readiness", () => {
    const markup = renderToStaticMarkup(
      <RuntimeExportDialog
        projectName="Bellweather"
        mode="preview"
        summary={{ warningCount: 0, unusedAssetCount: 3 }}
        onResolve={() => undefined}
      />
    );

    expect(markup).toContain("Preview gate");
    expect(markup).toContain("Project health check passed.");
    expect(markup).toContain("does not confirm that the game is ready to publish");
    expect(markup).toContain("3 unused assets will stay in the project and be omitted from this export");
    expect(markup).toContain("Ready-to-play Windows folder");
    expect(markup).toContain("no installation or per-launch extraction");
    expect(markup).toContain("Share the entire folder");
    expect(markup).not.toContain("one portable file");
  });

  it("shows the release gate and the warning decision before format selection", () => {
    const markup = renderToStaticMarkup(
      <RuntimeExportDialog
        projectName="Bellweather"
        mode="release"
        summary={{ warningCount: 2, unusedAssetCount: 0 }}
        onResolve={() => undefined}
      />
    );

    expect(markup).toContain("Release gate");
    expect(markup).toContain("Release checks passed after 2 warnings were acknowledged.");
    expect(markup).toContain("records the decision to continue when warnings are acknowledged");
    expect(markup).toContain("All project assets are referenced and will be included.");
  });
});

describe("runtime export media status", () => {
  it("reports the before, after, and omitted media sizes", () => {
    const summary = formatRuntimeExportMediaStatus(
      {
        before: { assetCount: 5, variantCount: 5, bytes: 10 * 1024 * 1024, unmeasuredVariantCount: 0 },
        after: { assetCount: 2, variantCount: 2, bytes: 7 * 1024 * 1024, unmeasuredVariantCount: 0 },
        omitted: { assetCount: 3, variantCount: 3, bytes: 3 * 1024 * 1024, unmeasuredVariantCount: 0 },
        omittedAssets: []
      },
      "en",
      t
    );

    expect(summary).toBe("Exported media: 7 MB of 10 MB; omitted 3 MB from 3 unused assets.");
  });

  it("does not imply that unmeasured unused variants were counted", () => {
    const summary = formatRuntimeExportMediaStatus(
      {
        before: { assetCount: 2, variantCount: 2, bytes: 1024, unmeasuredVariantCount: 1 },
        after: { assetCount: 1, variantCount: 1, bytes: 1024, unmeasuredVariantCount: 0 },
        omitted: { assetCount: 1, variantCount: 1, bytes: 0, unmeasuredVariantCount: 1 },
        omittedAssets: []
      },
      "en",
      t
    );

    expect(summary).toContain("Some unused media variants could not be measured.");
  });
});

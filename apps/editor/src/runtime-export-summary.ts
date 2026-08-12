import type { ExportMediaReport } from "@mage2/schema";
import { formatByteSize } from "./dialogs";
import type { EditorTranslator } from "./i18n";

export function formatRuntimeExportMediaStatus(
  report: ExportMediaReport | undefined,
  locale: string,
  t: EditorTranslator
): string | undefined {
  if (!report) {
    return undefined;
  }

  const exportedSize = formatByteSize(report.after.bytes, locale);
  if (report.omitted.assetCount === 0) {
    return t("Exported media: {exportedSize}; no unused assets were omitted.", { exportedSize });
  }

  const sourceSize = formatByteSize(report.before.bytes, locale);
  const omittedSize = formatByteSize(report.omitted.bytes, locale);
  const summary = report.omitted.assetCount === 1
    ? t("Exported media: {exportedSize} of {sourceSize}; omitted {omittedSize} from {count} unused asset.", {
        exportedSize,
        sourceSize,
        omittedSize,
        count: report.omitted.assetCount
      })
    : t("Exported media: {exportedSize} of {sourceSize}; omitted {omittedSize} from {count} unused assets.", {
        exportedSize,
        sourceSize,
        omittedSize,
        count: report.omitted.assetCount
      });

  return report.omitted.unmeasuredVariantCount > 0
    ? `${summary} ${t("Some unused media variants could not be measured.")}`
    : summary;
}

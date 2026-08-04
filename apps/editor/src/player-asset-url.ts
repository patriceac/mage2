import { useEffect, useState } from "react";
import { resolveAssetVariant, type Asset } from "@mage2/schema";
import { resolveFileUrl } from "./file-url-cache";

export function useEditorAssetFileUrl(asset: Asset | undefined, locale: string): string | undefined {
  const variant = asset ? resolveAssetVariant(asset, locale) : undefined;
  const sourcePath = variant?.proxyPath ?? variant?.sourcePath;
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    if (!sourcePath) {
      setUrl(undefined);
      return;
    }

    void resolveFileUrl(sourcePath)
      .then((nextUrl) => {
        if (!cancelled) {
          setUrl(nextUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUrl(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sourcePath]);

  return url;
}

import path from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import type { FilesystemCapabilities } from "./filesystem-capabilities";

export const EDITOR_APP_PROTOCOL = "mage2-app";
export const EDITOR_MEDIA_PROTOCOL = "mage2-file";
export const PACKAGED_RENDERER_URL = `${EDITOR_APP_PROTOCOL}://bundle/index.html`;

export function registerSecureSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: EDITOR_APP_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        codeCache: true
      }
    },
    {
      scheme: EDITOR_MEDIA_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ]);
}

export function installSecureProtocolHandlers(
  rendererRoot: string,
  filesystemCapabilities: FilesystemCapabilities
): void {
  protocol.handle(EDITOR_APP_PROTOCOL, (request) => {
    const filePath = resolveBundledRendererPath(rendererRoot, request.url);
    if (!filePath) {
      return notFoundResponse();
    }
    return fetchLocalFile(filePath, request);
  });

  protocol.handle(EDITOR_MEDIA_PROTOCOL, (request) => {
    const filePath = filesystemCapabilities.resolveMediaUrl(request.url);
    if (!filePath) {
      return notFoundResponse();
    }
    return fetchLocalFile(filePath, request);
  });
}

export function resolveBundledRendererPath(rendererRoot: string, inputUrl: string): string | undefined {
  try {
    const parsedUrl = new URL(inputUrl);
    if (
      parsedUrl.protocol !== `${EDITOR_APP_PROTOCOL}:` ||
      parsedUrl.hostname !== "bundle" ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      return undefined;
    }

    const relativePath = decodeURIComponent(parsedUrl.pathname).replace(/^\/+/, "") || "index.html";
    if (relativePath.includes("\0")) {
      return undefined;
    }
    const rootPath = path.resolve(rendererRoot);
    const candidatePath = path.resolve(rootPath, relativePath);
    const relativeCandidate = path.relative(rootPath, candidatePath);
    if (
      relativeCandidate === ".." ||
      relativeCandidate.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeCandidate)
    ) {
      return undefined;
    }
    return candidatePath;
  } catch {
    return undefined;
  }
}

function fetchLocalFile(filePath: string, request: Request): Promise<Response> {
  return net.fetch(pathToFileURL(filePath).toString(), {
    method: request.method,
    headers: request.headers
  });
}

function notFoundResponse(): Response {
  return new Response("Not found.", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

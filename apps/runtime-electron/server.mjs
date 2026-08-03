import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";

const PLAYER_PORT_BASE = 41000;
const PLAYER_PORT_SPAN = 20000;

export const MIME_TYPES = {
  ".aac": "audio/aac",
  ".bmp": "image/bmp",
  ".css": "text/css; charset=utf-8",
  ".flac": "audio/flac",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".ogv": "video/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

export async function readPlayerBuildIdentity(rootDirectory) {
  const manifestPath = path.join(path.resolve(rootDirectory), "build-manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const projectId = String(manifest.projectId ?? "").trim();
  if (!projectId) {
    throw new Error(`Runtime build manifest is missing a projectId: ${manifestPath}`);
  }

  return {
    projectId,
    projectName: String(manifest.projectName ?? projectId)
  };
}

export function resolvePlayerPort(projectId) {
  let hash = 2166136261;
  for (const character of String(projectId)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return PLAYER_PORT_BASE + ((hash >>> 0) % PLAYER_PORT_SPAN);
}

export function resolveContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export async function startPlayerServer(rootDirectory, port) {
  const root = path.resolve(rootDirectory);
  const rootStat = await fs.stat(root);
  if (!rootStat.isDirectory()) {
    throw new Error(`Runtime build is not a directory: ${root}`);
  }

  const server = http.createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }

    try {
      const file = await resolveRequestedFile(root, request.url ?? "/");
      if (!file) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": file.size,
        "Content-Type": resolveContentType(file.path)
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }

      createReadStream(file.path).pipe(response);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to serve the runtime build");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    server,
    url: `http://127.0.0.1:${port}/`,
    close: () => server.close()
  };
}

export async function resolveRequestedFile(rootDirectory, requestUrl) {
  const root = path.resolve(rootDirectory);
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1/").pathname);
  } catch {
    return undefined;
  }

  const relativePath = pathname.replace(/^\/+/, "") || "index.html";
  const requestedPath = path.resolve(root, relativePath);
  if (requestedPath !== root && !requestedPath.startsWith(`${root}${path.sep}`)) {
    return undefined;
  }

  const requestedStat = await fs.stat(requestedPath);
  const filePath = requestedStat.isDirectory() ? path.join(requestedPath, "index.html") : requestedPath;
  const fileStat = requestedStat.isDirectory() ? await fs.stat(filePath) : requestedStat;
  if (!fileStat.isFile()) {
    return undefined;
  }

  return { path: filePath, size: fileStat.size };
}

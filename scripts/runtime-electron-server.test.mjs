import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPlayerProtocolHandler,
  listenOnAvailablePlayerPort,
  resolveByteRange,
  resolveContentType,
  resolvePlayerPort,
  startPlayerServer
} from "../apps/runtime-electron/server.mjs";

const cleanups = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("runtime Electron server", () => {
  it("starts on an available loopback port when the preferred port is occupied", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mage2-runtime-conflict-"));
    await writeFile(path.join(root, "index.html"), "The game is ready.");
    const occupied = http.createServer();
    await new Promise(resolve => occupied.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => new Promise(resolve => occupied.close(resolve)), () => rm(root, { recursive: true, force: true }));
    const preferredPort = occupied.address().port;
    const runtime = await startPlayerServer(root, preferredPort);
    cleanups.push(() => new Promise(resolve => runtime.server.close(resolve)));
    expect(runtime.url).not.toBe(`http://127.0.0.1:${preferredPort}/`);
    expect(await (await fetch(runtime.url)).text()).toBe("The game is ready.");
  });

  it("recovers from Windows reserved ports but propagates unrelated listen failures", async () => {
    const server = new EventEmitter();
    const ports = [];
    server.listen = (port, address) => {
      ports.push(port);
      expect(address).toBe("127.0.0.1");
      queueMicrotask(() => port ? server.emit("error", Object.assign(new Error("Reserved port"), { code: "EACCES" })) : server.emit("listening"));
    };
    await listenOnAvailablePlayerPort(server, 52722);
    expect(ports).toEqual([52722, 0]);
    expect(server.listenerCount("error")).toBe(0);
    expect(server.listenerCount("listening")).toBe(0);
    const failure = Object.assign(new Error("Unexpected error"), { code: "EIO" });
    server.listen = vi.fn(() => queueMicrotask(() => server.emit("error", failure)));
    await expect(listenOnAvailablePlayerPort(server, 52722)).rejects.toBe(failure);
    expect(server.listen).toHaveBeenCalledTimes(1);
  });

  it("keeps the save origin while proxying media ranges to the fallback listener", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mage2-runtime-protocol-"));
    await writeFile(path.join(root, "scene.mp4"), "0123456789");
    await writeFile(path.join(root, "app.js"), "export const ready = true;");
    const runtime = await startPlayerServer(root, 0);
    cleanups.push(() => new Promise(resolve => runtime.server.close(resolve)), () => rm(root, { recursive: true, force: true }));
    const fetchRequest = vi.fn(async () => new Response("external"));
    const handler = createPlayerProtocolHandler("http://127.0.0.1:52722/", runtime.url, fetchRequest);
    const request = new Request("http://127.0.0.1:52722/scene.mp4?v=2", { headers: { Range: "bytes=5-9" } });
    const media = await handler(request);
    expect(media.status).toBe(206);
    expect(media.headers.get("Content-Range")).toBe("bytes 5-9/10");
    expect(await media.text()).toBe("56789");
    expect(request.url).toBe("http://127.0.0.1:52722/scene.mp4?v=2");
    const module = await handler(new Request("http://127.0.0.1:52722/app.js", {
      headers: { Origin: "http://127.0.0.1:52722", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "script" }
    }));
    expect(module.headers.get("Content-Type")).toContain("javascript");
    expect(await module.text()).toBe("export const ready = true;");
    const head = await handler(new Request(request.url, { method: "HEAD" }));
    expect(head.headers.get("Content-Length")).toBe("10");
    expect(await head.text()).toBe("");
    expect(fetchRequest).not.toHaveBeenCalled();
    const otherRequest = new Request("http://127.0.0.1:4187/");
    await handler(otherRequest);
    expect(fetchRequest).toHaveBeenLastCalledWith(otherRequest, { bypassCustomProtocolHandlers: true });
    expect((await handler(new Request(request.url, { method: "POST", body: "ignored" }))).status).toBe(405);
    expect(fetchRequest).toHaveBeenCalledTimes(1);
  });

  it("uses a stable project-specific loopback port", () => {
    const first = resolvePlayerPort("beacon-at-dusk");

    expect(resolvePlayerPort("beacon-at-dusk")).toBe(first);
    expect(first).toBeGreaterThanOrEqual(41000);
    expect(first).toBeLessThan(61000);
    expect(resolvePlayerPort("another-project")).not.toBe(first);
  });

  it("serves all supported runtime media with browser-compatible content types", () => {
    expect(resolveContentType("scene.mp4")).toBe("video/mp4");
    expect(resolveContentType("scene.webp")).toBe("image/webp");
    expect(resolveContentType("scene.bmp")).toBe("image/bmp");
    expect(resolveContentType("ambience.ogg")).toBe("audio/ogg");
    expect(resolveContentType("ambience.m4a")).toBe("audio/mp4");
    expect(resolveContentType("ambience.aac")).toBe("audio/aac");
  });

  it("resolves bounded, open-ended, and suffix byte ranges", () => {
    expect(resolveByteRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 });
    expect(resolveByteRange("bytes=7-", 10)).toEqual({ start: 7, end: 9 });
    expect(resolveByteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(resolveByteRange("bytes=12-", 10)).toBeUndefined();
    expect(resolveByteRange("bytes=4-2", 10)).toBeUndefined();
    expect(resolveByteRange("bytes=0-1,4-5", 10)).toBeUndefined();
  });

  it("serves seekable media byte ranges from the loopback player", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mage2-runtime-server-"));
    await writeFile(path.join(root, "sample.mp3"), Buffer.from("0123456789", "utf8"));
    const playerServer = await startPlayerServer(root, 0);
    cleanups.push(
      () => new Promise((resolve, reject) => playerServer.server.close((error) => error ? reject(error) : resolve())),
      () => rm(root, { recursive: true, force: true })
    );

    const response = await fetch(`${playerServer.url}sample.mp3`, {
      headers: { Range: "bytes=2-5" }
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("content-length")).toBe("4");
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe("2345");

    const invalid = await fetch(`${playerServer.url}sample.mp3`, {
      headers: { Range: "bytes=99-" }
    });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("content-range")).toBe("bytes */10");
  });
});

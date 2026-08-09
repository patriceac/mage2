import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
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

import { describe, expect, it } from "vitest";
import {
  filesystemObjectIdentityChangedFields,
  filesystemObjectIdentityFromStats
} from "./filesystem-identity";

describe("filesystem object identity", () => {
  it("normalizes creation time to milliseconds even when nanoseconds are available", () => {
    expect(
      filesystemObjectIdentityFromStats(
        { dev: 3n, ino: 17n, birthtimeNs: 1_234_567_890n, birthtimeMs: 1_234n },
        "test folder"
      )
    ).toEqual({ dev: "3", ino: "17", birthtime: "ms:1234" });
  });

  it("falls back to millisecond creation time when Electron omits birthtimeNs", () => {
    expect(
      filesystemObjectIdentityFromStats(
        { dev: 3n, ino: 17n, birthtimeNs: undefined, birthtimeMs: 1_234n },
        "test folder"
      )
    ).toEqual({ dev: "3", ino: "17", birthtime: "ms:1234" });
  });

  it("derives the same millisecond identity when only nanoseconds are available", () => {
    expect(
      filesystemObjectIdentityFromStats(
        { dev: 3n, ino: 17n, birthtimeNs: 1_234_567_890n, birthtimeMs: undefined },
        "test folder"
      )
    ).toEqual({ dev: "3", ino: "17", birthtime: "ms:1234" });
  });

  it("fails explicitly when stable object identity metadata is unavailable", () => {
    expect(() =>
      filesystemObjectIdentityFromStats(
        { dev: 3n, ino: 17n, birthtimeNs: undefined, birthtimeMs: undefined },
        "test folder"
      )
    ).toThrow(/stable creation time.*test folder/i);
    expect(() =>
      filesystemObjectIdentityFromStats(
        { dev: undefined, ino: 17n, birthtimeMs: 1_234n },
        "test folder"
      )
    ).toThrow(/device identifier/i);
  });

  it("ignores unstable directory ino values only on Windows", () => {
    const before = { dev: "3", ino: "17", birthtime: "ms:1234" };
    const after = { dev: "3", ino: "99", birthtime: "ms:1234" };

    expect(filesystemObjectIdentityChangedFields(before, after, "win32")).toEqual([]);
    expect(filesystemObjectIdentityChangedFields(before, after, "linux")).toEqual([
      "file identifier"
    ]);
  });

  it("retains device and creation-time checks on Windows", () => {
    const before = { dev: "3", ino: "17", birthtime: "ms:1234" };
    const after = { dev: "4", ino: "99", birthtime: "ms:5678" };

    expect(filesystemObjectIdentityChangedFields(before, after, "win32")).toEqual([
      "device",
      "creation time"
    ]);
  });
});

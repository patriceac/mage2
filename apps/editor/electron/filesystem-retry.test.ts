import { describe, expect, it, vi } from "vitest";
import { retryTransientWindowsFilesystemOperation } from "./filesystem-retry";

describe("transient Windows filesystem retry", () => {
  it("retries bounded transient Windows failures and revalidates before each retry", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(filesystemError("EPERM"))
      .mockRejectedValueOnce(filesystemError("EBUSY"))
      .mockResolvedValue("published");
    const wait = vi.fn(async () => undefined);
    const onRetry = vi.fn(async () => undefined);

    await expect(
      retryTransientWindowsFilesystemOperation(operation, {
        platform: "win32",
        retryDelaysMs: [100, 250],
        wait,
        onRetry
      })
    ).resolves.toBe("published");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[100], [250]]);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("does not retry structural conflicts or non-Windows failures", async () => {
    const windowsConflict = vi.fn(async () => {
      throw filesystemError("EEXIST");
    });
    const posixPermissionFailure = vi.fn(async () => {
      throw filesystemError("EPERM");
    });

    await expect(
      retryTransientWindowsFilesystemOperation(windowsConflict, {
        platform: "win32",
        retryDelaysMs: [0],
        wait: async () => undefined
      })
    ).rejects.toMatchObject({ code: "EEXIST" });
    await expect(
      retryTransientWindowsFilesystemOperation(posixPermissionFailure, {
        platform: "linux",
        retryDelaysMs: [0],
        wait: async () => undefined
      })
    ).rejects.toMatchObject({ code: "EPERM" });
    expect(windowsConflict).toHaveBeenCalledTimes(1);
    expect(posixPermissionFailure).toHaveBeenCalledTimes(1);
  });

  it("stops after the configured retry budget", async () => {
    const operation = vi.fn(async () => {
      throw filesystemError("EACCES");
    });

    await expect(
      retryTransientWindowsFilesystemOperation(operation, {
        platform: "win32",
        retryDelaysMs: [0, 0],
        wait: async () => undefined
      })
    ).rejects.toMatchObject({ code: "EACCES" });
    expect(operation).toHaveBeenCalledTimes(3);
  });
});

function filesystemError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

const DEFAULT_WINDOWS_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000] as const;
const TRANSIENT_WINDOWS_FILESYSTEM_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);

export interface TransientWindowsFilesystemRetryOptions {
  platform?: string;
  retryDelaysMs?: readonly number[];
  wait?: (delayMs: number) => Promise<void>;
  onRetry?: () => Promise<void>;
}

export async function retryTransientWindowsFilesystemOperation<T>(
  operation: () => Promise<T>,
  options: TransientWindowsFilesystemRetryOptions = {}
): Promise<T> {
  const platform = options.platform ?? process.platform;
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_WINDOWS_RETRY_DELAYS_MS;
  const wait = options.wait ?? waitForDelay;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (
        platform !== "win32" ||
        !isTransientWindowsFilesystemError(error) ||
        attempt >= retryDelaysMs.length
      ) {
        throw error;
      }
      await wait(retryDelaysMs[attempt]!);
      await options.onRetry?.();
    }
  }
}

function isTransientWindowsFilesystemError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    TRANSIENT_WINDOWS_FILESYSTEM_CODES.has(error.code)
  );
}

function waitForDelay(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

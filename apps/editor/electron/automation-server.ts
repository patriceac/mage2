import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { BrowserWindow, ipcMain, type IpcMainEvent } from "electron";

interface StartEditorAutomationServerOptions {
  getWindow: () => BrowserWindow | null;
  validateSender: (event: IpcMainEvent) => void;
}

interface AutomationRequest {
  id: string;
  command: unknown;
}

interface AutomationResponse {
  id: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

const AUTOMATION_RESULT_CHANNEL = "mage2:automation-command-result";
const AUTOMATION_COMMAND_CHANNEL = "mage2:automation-command";
const AUTOMATION_RENDERER_READY_CHANNEL = "mage2:automation-renderer-ready";
const DEFAULT_AUTOMATION_PORT = 47632;
const AUTOMATION_TIMEOUT_MS = 10000;
const RUNTIME_EXPORT_AUTOMATION_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_REQUEST_BYTES = 1024 * 1024;

let hasRegisteredAutomationResultHandler = false;
let automationRendererReady = false;
const pendingAutomationRequests = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }
>();

export function startEditorAutomationServer({
  getWindow,
  validateSender
}: StartEditorAutomationServerOptions): (() => void) | undefined {
  if (!isAutomationEnabled()) {
    return undefined;
  }

  registerAutomationResultHandler(validateSender);
  automationRendererReady = false;
  ipcMain.on(AUTOMATION_RENDERER_READY_CHANNEL, (event) => {
    try {
      validateSender(event);
      automationRendererReady = true;
    } catch {
      // Ignore readiness signals from untrusted renderers.
    }
  });

  const port = resolveAutomationPort();
  const token = resolveAutomationToken();
  const server = http.createServer((request, response) => {
    void handleAutomationHttpRequest(request, response, token, getWindow);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`MAGE2 automation bridge listening on http://127.0.0.1:${port}`);
  });

  return () => {
    server.close();
  };
}

function isAutomationEnabled(): boolean {
  return /^(1|true|yes)$/i.test(process.env.MAGE2_EDITOR_AUTOMATION ?? "");
}

function resolveAutomationPort(): number {
  const port = Number(process.env.MAGE2_EDITOR_AUTOMATION_PORT ?? DEFAULT_AUTOMATION_PORT);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_AUTOMATION_PORT;
}

function resolveAutomationToken(): string {
  const token = process.env.MAGE2_EDITOR_AUTOMATION_TOKEN?.trim();
  if (!token || token.length < 24) {
    throw new Error(
      "MAGE2_EDITOR_AUTOMATION_TOKEN must be explicitly set to at least 24 characters when automation is enabled."
    );
  }
  return token;
}

function registerAutomationResultHandler(validateSender: (event: IpcMainEvent) => void): void {
  if (hasRegisteredAutomationResultHandler) {
    return;
  }

  hasRegisteredAutomationResultHandler = true;
  ipcMain.on(AUTOMATION_RESULT_CHANNEL, (event, response: AutomationResponse) => {
    try {
      validateSender(event);
    } catch {
      return;
    }
    if (!isAutomationResponse(response)) {
      return;
    }
    const pending = pendingAutomationRequests.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    pendingAutomationRequests.delete(response.id);

    if (response.ok) {
      pending.resolve(response.value);
      return;
    }

    pending.reject(new Error(response.error || "Automation command failed."));
  });
}

async function handleAutomationHttpRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  token: string,
  getWindow: () => BrowserWindow | null
): Promise<void> {
  try {
    if (request.headers.origin) {
      writeJson(response, 403, { ok: false, error: "Browser-origin automation requests are not accepted." });
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      writeJson(response, 200, { ok: true, ready: automationRendererReady });
      return;
    }

    if (
      request.method !== "POST" ||
      !["/command", "/automation/command", "/automation/screenshot"].includes(request.url ?? "")
    ) {
      writeJson(response, 404, { ok: false, error: "Not found." });
      return;
    }

    if (!tokensMatch(request.headers["x-mage2-automation-token"], token)) {
      writeJson(response, 401, { ok: false, error: "Invalid automation token." });
      return;
    }

    if (request.url === "/automation/screenshot") {
      const window = getWindow();
      if (!window || window.isDestroyed()) {
        throw new Error("No editor window is available for automation.");
      }
      const screenshot = await window.webContents.capturePage();
      const png = screenshot.toPNG();
      response.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "no-store",
        "content-length": String(png.byteLength)
      });
      response.end(png);
      return;
    }

    const command = await readJsonBody(request);
    const value = await dispatchAutomationCommand(getWindow, command);
    writeJson(response, 200, { ok: true, value });
  } catch (error) {
    writeJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

function tokensMatch(candidate: string | string[] | undefined, expected: string): boolean {
  if (typeof candidate !== "string") {
    return false;
  }
  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}

function isAutomationResponse(value: unknown): value is AutomationResponse {
  if (!value || typeof value !== "object") {
    return false;
  }
  const response = value as Record<string, unknown>;
  return typeof response.id === "string" && typeof response.ok === "boolean";
}

function dispatchAutomationCommand(getWindow: () => BrowserWindow | null, command: unknown): Promise<unknown> {
  const window = getWindow();
  if (!window || window.isDestroyed()) {
    throw new Error("No editor window is available for automation.");
  }

  const request: AutomationRequest = {
    id: randomUUID(),
    command
  };

  return new Promise((resolve, reject) => {
    const timeoutMs = isRuntimeArtifactExportCommand(command)
      ? RUNTIME_EXPORT_AUTOMATION_TIMEOUT_MS
      : AUTOMATION_TIMEOUT_MS;
    const timeout = setTimeout(() => {
      pendingAutomationRequests.delete(request.id);
      reject(new Error(`Automation command timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    pendingAutomationRequests.set(request.id, { resolve, reject, timeout });
    window.webContents.send(AUTOMATION_COMMAND_CHANNEL, request);
  });
}

function isRuntimeArtifactExportCommand(command: unknown): boolean {
  return Boolean(
    command &&
      typeof command === "object" &&
      "command" in command &&
      command.command === "exportProject" &&
      "format" in command
  );
}

function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;

    request.on("data", (chunk: Buffer) => {
      receivedBytes += chunk.byteLength;
      if (receivedBytes > MAX_REQUEST_BYTES) {
        reject(new Error("Automation command body is too large."));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const bodyText = Buffer.concat(chunks).toString("utf8");
        resolve(bodyText ? JSON.parse(bodyText) : {});
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", reject);
  });
}

function writeJson(response: http.ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

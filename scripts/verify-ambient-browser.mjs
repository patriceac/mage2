import { chromium } from "playwright";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyAmbient } from "./verification/ambient-checks.mjs";
import { verifyAudio } from "./verification/audio-checks.mjs";
const scenario = process.argv.includes("--audio") ? "audio" : "ambient";
const root = path.resolve(import.meta.dirname, `../output/${scenario}-fixture/build`);
const out = path.resolve(import.meta.dirname, `../output/verification/${scenario}-browser`);
await fs.mkdir(out, { recursive: true });
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".mp4": "video/mp4", ".png": "image/png", ".wav": "audio/wav" };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, { "content-type": mime[path.extname(file)] ?? "application/octet-stream" }); res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
let page;
const result = { passed: false, checks: [] };
try {
  browser = await chromium.launch({ headless: true, ...(process.env.AMBIENT_BROWSER_CHANNEL ? { channel: process.env.AMBIENT_BROWSER_CHANNEL } : {}) });
  const browserSession = await browser.newBrowserCDPSession();
  result.gpu = await browserSession.send("SystemInfo.getInfo");
  await browserSession.detach();
  page = await browser.newPage({ viewport: { width: 1280, height: 850 }, locale: "en-US" });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const session = await page.context().newCDPSession(page);
  const adapter = { send: (method, params) => session.send(method, params), value: async (expression) => {
    const r = await session.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
  } };
  const capture = async (name) => {
    const shot = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(shot.data, "base64"));
  };
  result.checks = await (scenario === "audio" ? verifyAudio : verifyAmbient)(adapter, capture);
  result.passed = true;
} catch (error) { result.checks = error.checks ?? []; result.error = String(error.stack ?? error); process.exitCode = 1; if (page) { await page.screenshot({ path: path.join(out, "failure.png") }); result.body = await page.locator("body").innerText(); } }
finally { await browser?.close(); server.close(); await fs.writeFile(path.join(out, "result.json"), JSON.stringify(result, null, 2)); }
console.log(JSON.stringify(result, null, 2));

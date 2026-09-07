// Run only through verify-review-fixes-hyperv.ps1, inside its disposable guest.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const [outDir, payloadDir] = process.argv.slice(2);
if (!outDir || !payloadDir || process.platform !== "win32") {
  throw new Error("Use scripts/verify-review-fixes-hyperv.ps1 to run this check in Hyper-V.");
}
const result = { passed: false, checks: [], errors: [] };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const token = crypto.randomBytes(32).toString("hex");
const executable = path.join(payloadDir, "MAGE2 Editor.exe");
const original = path.join(outDir, "original-project");
const moved = path.join(outDir, "moved-project");
const legacy = path.join(outDir, "legacy-project");
const files = ["project.json", "assets.json", "locations.json", "scenes.json", "dialogues.json", "strings.json", "inventory.json"];
const read = (root, name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const write = (root, name, value) => fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2));
const fingerprint = (root) => files.map((name) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, name))).digest("hex"));
const log = fs.openSync(path.join(outDir, "editor.log"), "w");
const editor = spawn(executable, ["--remote-debugging-port=9222", `--user-data-dir=${path.join(outDir, "user-data")}`], {
  windowsHide: true,
  stdio: ["ignore", log, log],
  env: { ...process.env, MAGE2_EDITOR_AUTOMATION: "1", MAGE2_EDITOR_AUTOMATION_TOKEN: token, MAGE2_EDITOR_AUTOMATION_ROOT: outDir }
});
let cdp;

async function command(body) {
  const response = await fetch("http://127.0.0.1:47632/automation/command", {
    method: "POST", headers: { "content-type": "application/json", "x-mage2-automation-token": token },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(JSON.stringify(data));
  return data.value;
}
async function waitFor(fn, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await pause(200);
  }
  throw last ?? new Error("Timed out waiting for editor state");
}
async function check(name, fn) {
  try { const evidence = await fn(); result.checks.push({ name, passed: true, evidence }); }
  catch (error) { result.errors.push({ name, error: String(error.stack ?? error) }); }
}
async function capture(name) {
  const body = await cdp.value("document.body.innerText");
  fs.writeFileSync(path.join(outDir, `${name}.txt`), body);
  const image = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(image.data, "base64"));
  return body;
}
async function viewport(width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await pause(300);
}
async function tab(name) { await command({ command: "selectTab", tab: name }); await pause(300); }
async function click(selector) {
  assert(await cdp.value(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.click(); return true; })()`), `Missing ${selector}`);
  await pause(250);
}
function managedPaths(root) {
  const manifest = read(root, "project.json");
  const assets = read(root, "assets.json");
  return [...manifest.assetRoots, ...assets.assets.flatMap((asset) => Object.values(asset.variants).flatMap((variant) =>
    [variant.sourcePath, variant.proxyPath, variant.posterPath].filter(Boolean)))];
}
function assertRelativePaths(root) {
  assert(managedPaths(root).length > 0);
  for (const value of managedPaths(root)) assert(!path.win32.isAbsolute(value) && !path.posix.isAbsolute(value), value);
}

try {
  const target = await waitFor(async () => {
    const targets = await (await fetch("http://127.0.0.1:9222/json/list", { signal: AbortSignal.timeout(1000) })).json();
    return targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
  }, 60000);
  cdp = createCdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await waitFor(() => command({ command: "getState" }));
  await command({ command: "setInterfaceLocale", locale: "en" });
  await viewport(1440, 900);
  await check("landing containment", async () => {
    await capture("landing-1440");
    const rect = await cdp.value(`(() => { const r = document.querySelector('.recent-projects__refresh').getBoundingClientRect(); return { right: r.right, width: innerWidth }; })()`);
    assert(rect.right <= rect.width, JSON.stringify(rect));
    return rect;
  });
  fs.mkdirSync(original);
  const created = await command({ command: "createProject", projectDir: original, projectName: "Review regression" });
  await pause(500);
  await check("first project opens in Scenes with guide", async () => {
    await capture("starter-1440");
    assert.equal(created.activeTab, "scenes");
    const presentation = await cdp.value(`({ guide: !!document.querySelector('.first-project-checklist'), sidebar: !!document.querySelector('.issues-sidebar'), text: document.body.innerText })`);
    assert(presentation.guide);
    assert(!presentation.sidebar, "Starter warnings unexpectedly opened the diagnostics sidebar");
    assert(!presentation.text.includes("STARTER_SCENE_MEDIA_IN_USE"));
    await viewport(1024, 700);
    await capture("starter-1024");
    await click(".first-project-checklist__all-steps summary");
    await capture("starter-1024-expanded");
    const compact = await cdp.value(`(() => { const guide = document.querySelector('.first-project-checklist').getBoundingClientRect(); const scene = document.querySelector('.scenes-panel__stage-stack').getBoundingClientRect(); return { guideBottom: guide.bottom, sceneTop: scene.top, sceneHeight: scene.height }; })()`);
    assert(compact.guideBottom <= compact.sceneTop && compact.sceneHeight >= 150, JSON.stringify(compact));
    await click(".first-project-checklist__all-steps summary");
    await viewport(1440, 900);
    return { activeTab: created.activeTab, guide: presentation.guide, sidebar: presentation.sidebar };
  });
  await command({ command: "saveProject" });
  const originalFingerprint = fingerprint(original);
  await check("portable paths are persisted", async () => { assertRelativePaths(original); return managedPaths(original); });
  fs.cpSync(original, moved, { recursive: true, errorOnExist: true });
  await check("copied project opens and saves with its identity", async () => {
    const opened = await command({ command: "openProject", projectDir: moved, tab: "scenes" });
    assert.equal(opened.projectDir, moved);
    await command({ command: "saveProject" });
    assertRelativePaths(moved);
    assert.equal(read(moved, "project.json").projectId, read(original, "project.json").projectId);
    assert.deepEqual(fingerprint(original), originalFingerprint);
    await capture("moved-project");
    return { projectDir: opened.projectDir, originalUnchanged: true };
  });
  // A separate disposable legacy fixture reproduces pre-portability absolute paths.
  fs.cpSync(original, legacy, { recursive: true, errorOnExist: true });
  const manifest = read(legacy, "project.json");
  const assets = read(legacy, "assets.json");
  const oldRoot = "C:\\Previous project location\\Review regression";
  manifest.assetRoots = manifest.assetRoots.map((value) => path.win32.resolve(oldRoot, value));
  for (const asset of assets.assets) for (const variant of Object.values(asset.variants)) {
    for (const field of ["sourcePath", "proxyPath", "posterPath"]) if (variant[field]) variant[field] = path.win32.resolve(oldRoot, variant[field]);
  }
  // The second locale exercises Localization without introducing a missing-media
  // health blocker that would correctly prevent even a preview export.
  for (const asset of assets.assets) asset.variants.fr = { ...asset.variants.en };
  manifest.supportedLocales = ["en", "fr"];
  const scenes = read(legacy, "scenes.json");
  const hotspot = scenes.items[0].hotspots[0];
  hotspot.name = "Radio console";
  hotspot.effects = [{ type: "playDialogue", dialogueTreeId: "review-dialogue" }];
  delete hotspot.dialogueTreeId;
  delete hotspot.clickEvent;
  const dialogues = read(legacy, "dialogues.json");
  dialogues.items = [{ id: "review-dialogue", name: "Emergency Frequency", startNodeId: "review-line", nodes: [{
    id: "review-line", speaker: "Operator", textId: "review.line", effects: [],
    choices: [{ id: "review-choice", textId: "review.reply", conditions: [], effects: [] }]
  }] }];
  const strings = read(legacy, "strings.json");
  strings.byLocale.en["review.line"] = "The signal is clear.";
  strings.byLocale.en["review.reply"] = "Continue the journey.";
  strings.byLocale.fr = { ...strings.byLocale.en };
  for (let index = 0; index < 24; index++) strings.byLocale.en[`review.extra.${index}`] = `A longer localization queue entry for checking pane containment ${index}`;
  for (const [name, value] of Object.entries({ "project.json": manifest, "assets.json": assets, "scenes.json": scenes, "dialogues.json": dialogues, "strings.json": strings })) write(legacy, name, value);
  await check("legacy copy migrates without the original location", async () => {
    const opened = await command({ command: "openProject", projectDir: legacy, tab: "dialogue" });
    assert.equal(opened.projectDir, legacy);
    assertRelativePaths(legacy);
    assert.deepEqual(fingerprint(original), originalFingerprint);
    return { projectDir: opened.projectDir, portablePaths: managedPaths(legacy).length };
  });
  await tab("dialogue");
  await check("effect dialogue launch is reported and navigable", async () => {
    const text = await capture("dialogue-1440");
    assert(text.includes("Starts from 1 location"), text);
    assert(text.includes("Radio console"));
    assert(!text.includes("Not connected to a hotspot yet"));
    assert(!text.includes("Not started anywhere"));
    await click(".dialogue-usage-list button");
    const state = await command({ command: "getState" });
    assert.equal(state.activeTab, "scenes");
    assert.equal(state.selectedHotspotId, hotspot.id);
    return { activeTab: state.activeTab, selectedHotspotId: state.selectedHotspotId };
  });
  await tab("localization");
  await check("localization controls and rows stay inside their pane", async () => {
    await capture("localization-1440");
    const overflow = await cdp.value(`(() => {
      const pane = document.querySelector('.localization-queue-pane'); const r = pane.getBoundingClientRect();
      return [...pane.querySelectorAll('input,select,.localization-queue-row,.localization-queue-row__preview')].filter(e => {
        const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1);
      }).map(e => ({ tag: e.tagName, className: e.className, width: e.getBoundingClientRect().width }));
    })()`);
    assert.deepEqual(overflow, []);
    return { overflow };
  });
  await viewport(1024, 700);
  await tab("dialogue");
  await check("compact Dialogue gives the builder usable width", async () => {
    await capture("dialogue-1024");
    const widths = await cdp.value(`(() => {
      const input = [...document.querySelectorAll('select')].find(e => [...e.labels].some(l => l.innerText.includes('First line')));
      return { select: input.getBoundingClientRect().width, library: document.querySelector('.dialogue-library').getBoundingClientRect().width, preview: document.querySelector('.dialogue-launch-panel').getBoundingClientRect().width };
    })()`);
    assert(widths.select >= 200, JSON.stringify(widths));
    assert.equal(widths.library, 0);
    assert.equal(widths.preview, 0);
    await click('[aria-controls="dialogue-preview-pane"]');
    await capture("dialogue-1024-preview");
    assert(await cdp.value("document.querySelector('.dialogue-launch-panel').getBoundingClientRect().width > 200"));
    return widths;
  });
  await command({ command: "enterPlaytest" });
  await pause(300);
  await check("compact Playtest keeps save slots collapsed and the scene visible", async () => {
    await capture("playtest-1024");
    const geometry = await cdp.value(`(() => { const save = document.querySelector('details.playtest-save-slots'); const stage = document.querySelector('.mage2-player'); const r = stage.getBoundingClientRect(); return { saveFound: !!save, saveOpen: save?.open, top: r.top, bottom: r.bottom, height: r.height, viewport: innerHeight }; })()`);
    assert(geometry.saveFound && !geometry.saveOpen, JSON.stringify(geometry));
    assert(geometry.height > 150 && geometry.bottom <= geometry.viewport, JSON.stringify(geometry));
    return geometry;
  });
  await check("reported effect launches a playable dialogue", async () => {
    await command({ command: "playtest.reset" });
    await command({ command: "playtest.clickHotspot", hotspotId: hotspot.id });
    await waitFor(() => cdp.value("document.body.innerText.includes('The signal is clear.')"));
    await capture("playtest-dialogue");
    await click(".mage2-player__dialogue-choice");
    await waitFor(() => cdp.value("!document.body.innerText.includes('The signal is clear.')"));
    return { opened: true, choiceCompleted: true };
  });
  await check("moved project exports a web preview", async () => {
    const destinationPath = path.join(outDir, "review-preview");
    const exported = await command({ command: "exportProject", format: "web", mode: "preview", destinationPath });
    assert(fs.statSync(destinationPath).isDirectory());
    assert(fs.statSync(path.join(destinationPath, "index.html")).size > 0);
    assert(fs.statSync(path.join(destinationPath, "build-manifest.json")).size > 0);
    assert.equal(exported.export.validationReport.valid, true);
    return exported;
  });
  await viewport(1440, 900);
  await tab("scenes");
  await capture("final-scene");
} catch (error) {
  result.errors.push({ name: "setup or workflow", error: String(error.stack ?? error) });
} finally {
  result.passed = result.errors.length === 0 && result.checks.length === 11;
  result.executable = executable;
  result.executableSha256 = crypto.createHash("sha256").update(fs.readFileSync(executable)).digest("hex");
  cdp?.close();
  if (editor.pid) spawnSync("taskkill.exe", ["/PID", String(editor.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 });
  fs.closeSync(log);
  fs.writeFileSync(path.join(outDir, "review-fixes-result.json"), JSON.stringify(result, null, 2));
}

function createCdpClient(url) {
  return new (class {
  constructor(url) { this.url = url; this.nextId = 0; this.pending = new Map(); }
  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data); const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error))); else pending.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("DevTools connection timeout")), 10000);
      this.socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("DevTools connection failed")); }, { once: true });
    });
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timeout`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async value(expression) {
    const response = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }
  close() { this.socket?.close(); }
  })(url);
}

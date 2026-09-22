// Hyper-V-only driver; launched by verify-ambient-hyperv.ps1.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createCdpClient, verifyAmbient, waitFor, pause } from "./ambient-checks.mjs";
import { verifyAudio } from "./audio-checks.mjs";
const [out, payload, mode, scenario = "ambient"] = process.argv.slice(2);
if (!out || !payload || !["editor", "runtime"].includes(mode)) throw new Error("Use the Hyper-V verification wrapper.");
const result = { passed: false, mode, scenario, checks: [] };
const token = crypto.randomBytes(32).toString("hex");
const executable = path.join(payload, mode === "editor" ? "MAGE2 Editor.exe" : `MAGE2 ${scenario === "audio" ? "Audio" : "Ambient"} Fixture Player.exe`);
const log = fs.openSync(path.join(out, "application.log"), "w");
const child = spawn(executable, ["--remote-debugging-port=9222", "--lang=en-US"], {
  windowsHide: true, stdio: ["ignore", log, log],
  env: { ...process.env, MAGE2_EDITOR_AUTOMATION: "1", MAGE2_EDITOR_AUTOMATION_TOKEN: token, MAGE2_EDITOR_AUTOMATION_ROOT: out }
});
let cdp;
const command = async (body) => {
  const response = await fetch("http://127.0.0.1:47632/automation/command", { method: "POST", headers: { "content-type": "application/json", "x-mage2-automation-token": token }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  const data = await response.json(); if (!response.ok || !data.ok) throw new Error(JSON.stringify(data)); return data.value;
};
const capture = async (name) => {
  const image = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(out, `${mode}-${name}.png`), Buffer.from(image.data, "base64"));
};
try {
  result.executable = executable;
  const target = await waitFor(async () => {
    const targets = await (await fetch("http://127.0.0.1:9222/json/list", { signal: AbortSignal.timeout(1000) })).json();
    return targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
  }, 60000);
  cdp = createCdpClient(target.webSocketDebuggerUrl); await cdp.connect();
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 850, deviceScaleFactor: 1, mobile: false });
  const version = await (await fetch("http://127.0.0.1:9222/json/version")).json();
  const browser = createCdpClient(version.webSocketDebuggerUrl); await browser.connect();
  try { result.gpu = await browser.send("SystemInfo.getInfo"); } finally { browser.close(); }
  if (mode === "runtime") {
    result.checks = await (scenario === "audio" ? verifyAudio : verifyAmbient)(cdp, capture);
  } else {
    await waitFor(() => command({ command: "getState" }));
    await command({ command: "setInterfaceLocale", locale: "en" });
    const projectDir = path.join(out, "fixture");
    fs.cpSync(path.join(payload, ".ambient-verification/fixture"), projectDir, { recursive: true });
    await command({ command: "openProject", projectDir });
    await command({ command: "selectTab", tab: "scenes" });
    const setMusicGain = async (gain) => {
      const selector = '[data-soundscape-channel="music"] input[type="number"]';
      await cdp.value(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'${gain}'); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      await pause(100);
    };
    if (scenario === "audio") {
      await waitFor(() => cdp.value("document.querySelectorAll('[data-soundscape-channel]').length===2"));
      await cdp.value("document.querySelector('.scene-soundscape').closest('details').open=true");
      await setMusicGain(0.55);
      await cdp.value("document.querySelector('.scene-soundscape').scrollIntoView({block:'center'})");
      await capture("authoring");
      result.checks.push({ name: "packaged editor soundscape authoring controls", passed: true });
    } else {
    await waitFor(() => cdp.value("document.querySelectorAll('[data-ambient-region]').length===6"));
    assert.equal(await cdp.value("document.querySelectorAll('.mage2-ambient video').length"), 0);
    await cdp.value("document.querySelector('.ambient-editor').open=true");
    await pause(200);
    await capture("authoring");
    await cdp.value("[...document.querySelectorAll('.ambient-editor label')].find(e=>e.textContent.includes('Preview ambient motion')).querySelector('input').click()");
    await waitFor(() => cdp.value("[...document.querySelectorAll('.mage2-ambient video')].filter(v=>v.readyState>=2&&!v.paused).length>=4"));
    await capture("preview");
    result.checks.push({ name: "packaged editor authoring and six-region preview", passed: true });
    }
    const destinationPath = path.join(out, "editor-export");
    const exported = await command({ command: "exportProject", format: "web", mode: "preview", destinationPath });
    assert.equal(exported.export.validationReport.valid, true);
    const manifest = JSON.parse(fs.readFileSync(path.join(destinationPath, "build-manifest.json"), "utf8"));
    const content = JSON.parse(fs.readFileSync(path.join(destinationPath, manifest.contentPath), "utf8"));
    if (scenario === "audio") {
      assert.equal(content.scenes[0].soundscape.music.gain, 0.55);
      assert(content.scenes[0].hotspots.some((hotspot) => hotspot.effects.some((effect) => effect.type === "playSound" && effect.onceKey === "test.bell")));
      assert(content.assets.some((asset) => asset.id === "foley"));
      assert(content.assets.some((asset) => asset.id === "room_b"));
    } else assert.equal(content.scenes[0].ambient.regions.length, 6);
    for (const asset of content.assets) for (const variant of Object.values(asset.variants)) assert(fs.existsSync(path.join(destinationPath, variant.sourcePath)));
    result.checks.push({ name: `packaged editor exports all ${scenario} references`, passed: true, assets: content.assets.length });
    if (scenario === "audio") {
      await setMusicGain(0.5);
      await command({ command: "selectTab", tab: "playtest" });
      result.checks.push(...await verifyAudio(cdp, capture, "editor"));
      await command({ command: "selectTab", tab: "scenes" });
      await command({ command: "selectTab", tab: "playtest" });
      await waitFor(() => cdp.value("Math.abs((document.querySelector('[data-audio-channel=music]')?.volume??-1)-0.2)<0.005"));
      result.checks.push({ name: "Playtest preferences survive exit and re-entry", passed: true });
    }
  }
  result.passed = true;
} catch (error) {
  result.error = String(error.stack ?? error);
  result.checks.push(...(error.checks ?? []));
  try { await capture("failure"); result.body = await cdp.value("document.body.innerText"); } catch {}
} finally {
  cdp?.close(); child.kill(); fs.closeSync(log);
  fs.writeFileSync(path.join(out, "ambient-result.json"), JSON.stringify(result, null, 2));
}

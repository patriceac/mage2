import assert from "node:assert/strict";
import { waitFor, pause } from "./ambient-checks.mjs";

export async function verifyAudio(cdp, capture, mode = "runtime") {
  const checks = [];
  const value = (expression) => cdp.value(expression);
  const check = async (name, run) => {
    try { checks.push({ name, passed: true, evidence: await run() }); }
    catch (error) { error.checks = checks; throw error; }
  };
  const click = async (selector) => {
    const point = await waitFor(() => value(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); const x=r.x+r.width/2,y=r.y+r.height/2; const top=document.elementFromPoint(x,y); return r.width && r.height && (top===e||e.contains(top)) ? {x,y} : null; })()`));
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  };
  const hotspot = (name) => click(`.mage2-player__hotspot-button[aria-label="${name}"]`);
  const menuAction = async (name) => {
    const index = await value(`[...document.querySelectorAll('.mage2-experience__panel-actions > button')].findIndex(e=>e.textContent.trim()===${JSON.stringify(name)})`);
    assert(index >= 0, `Missing menu action ${name}`);
    await click(`.mage2-experience__panel-actions > button:nth-child(${index + 1})`);
  };
  const audio = (channel) => `document.querySelector('[data-audio-channel="${channel}"]')`;
  const gain = (channel, expected) => waitFor(() => value(`Math.abs((${audio(channel)}?.volume ?? -1)-${expected}) < 0.005`));
  const bedPlaying = async () => {
    await waitFor(() => value(`${audio("music")}?.readyState >= 2`));
    if (await value("!!document.querySelector('.mage2-player__media-recovery button')")) await click(".mage2-player__media-recovery button");
    await waitFor(() => value(`${audio("music")}?.paused === false && ${audio("ambience")}?.paused === false`));
  };
  await bedPlaying();
  await value(`window.__audioQa = { music: ${audio("music")}, effects: 0, seen: new WeakSet() };
    window.__audioQa.onPlay = e => { if(e.target.dataset?.audioChannel==='effects' && !window.__audioQa.seen.has(e.target)) { window.__audioQa.seen.add(e.target); window.__audioQa.effects++; } };
    document.addEventListener('play', window.__audioQa.onPlay, true);`);
  await check("native music and ambience decode at separate authored gains", async () => {
    await gain("music", 0.5); await gain("ambience", 0.4);
    await capture("soundscape");
    return value("[...document.querySelectorAll('[data-audio-channel]')].map(a=>({channel:a.dataset.audioChannel,ready:a.readyState,volume:a.volume,time:a.currentTime}))");
  });
  await check("five persistent volume controls and menu pause/resume", async () => {
    await click(".mage2-experience__menu-button");
    await waitFor(() => value("[...document.querySelectorAll('[data-audio-channel]')].every(a=>a.paused)"));
    const time = await value(`${audio("music")}.currentTime`); await pause(250);
    assert.equal(await value(`${audio("music")}.currentTime`), time);
    await menuAction("Settings");
    await waitFor(() => value("document.querySelectorAll('[data-audio-level]').length===5"));
    const levels = { volume: 0.8, musicVolume: 0.5, ambienceVolume: 0.6, effectsVolume: 0.7, voiceVolume: 0.4 };
    for (const [key, level] of Object.entries(levels)) await value(`(() => { const e=document.querySelector('[data-audio-level="${key}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'${level}'); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await capture("settings");
    const storageKey = mode === "editor" ? "mage2-playtest-preferences" : "mage2-runtime-preferences:mage2_audio_fixture";
    const stored = await value(`JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}))`);
    for (const [key, level] of Object.entries(levels)) assert.equal(stored[key], level);
    await click(".mage2-experience__close"); await bedPlaying(); await gain("music", 0.2); await gain("ambience", 0.192);
    assert(await value(`window.__audioQa.music===${audio("music")}`));
    return stored;
  });
  await check("onceKey suppresses repeat actions while ordinary Foley repeats", async () => {
    await hotspot("Foley once"); await waitFor(() => value("window.__audioQa.effects===1")); await gain("effects", 0.28);
    await hotspot("Foley once"); await pause(200); assert.equal(await value("window.__audioQa.effects"), 1);
    await hotspot("Foley repeat"); await hotspot("Foley repeat"); await waitFor(() => value("window.__audioQa.effects===3"));
    assert(await value(`window.__audioQa.music===${audio("music")}`));
    return { effects: await value("window.__audioQa.effects") };
  });
  await check("voiced dialogue ducks only during actual audible playback and restores on mute/pause/end", async () => {
    await hotspot("Voice");
    await waitFor(() => value("!!document.querySelector('.mage2-player__dialogue-continue')"));
    await gain("music", 0.05); await gain("ambience", 0.048);
    const foreground = mode === "editor" ? ".foreground-media-player--playtest audio" : ".runtime-foreground-media audio";
    await value(`window.__audioQa.voice=document.querySelector('${foreground}'); void 0`);
    assert.equal(await value("window.__audioQa.voice.volume"), 0.8 * 0.4);
    await value("window.__audioQa.voice.pause()"); await gain("music", 0.2);
    await value("window.__audioQa.voice.play()"); await gain("music", 0.05);
    await value("window.__audioQa.voice.muted=true"); await gain("music", 0.2);
    await value("window.__audioQa.voice.muted=false"); await gain("music", 0.05);
    await capture("dialogue-ducking");
    await click(".mage2-player__dialogue-continue"); await gain("music", 0.2);
    assert(await value("window.__audioQa.voice.paused && !window.__audioQa.voice.isConnected"));
  });
  await check("text and silent video do not duck; performed video restores gain on skip", async () => {
    await hotspot("Text"); await pause(450); await gain("music", 0.2); await click(".mage2-player__dialogue-continue");
    await hotspot("Silent video"); await waitFor(() => value("document.querySelector('.mage2-player__response-video')?.readyState>=2"));
    await pause(450); await gain("music", 0.2); await click(".mage2-player__response-skip");
    await waitFor(() => value("!document.querySelector('.mage2-player__response-video')"));
    await hotspot("Performed video");
    await waitFor(() => value("(() => { const v=document.querySelector('.mage2-player__response-video'); return v?.readyState>=2&&!v.paused; })()"));
    await gain("music", 0.05);
    assert.equal(await value("document.querySelector('.mage2-player__response-video').volume"), 0.8 * 0.4);
    assert.equal(await value(`${audio("music")}.paused`), false);
    await capture("performed-video"); await click(".mage2-player__response-skip"); await gain("music", 0.2);
    assert.equal(await value("window.__audioQa.effects"), 3);
  });
  await check("same music survives adjacent rooms; scene exit releases other tracks and quiet rooms", async () => {
    await value(`window.__audioQa.oldAmbience=${audio("ambience")}; window.__audioQa.beforeRoom=${audio("music")}.currentTime`);
    await hotspot("Next room"); await waitFor(() => value(`${audio("ambience")}?.dataset.assetId==='room_b'`));
    assert(await value(`window.__audioQa.music===${audio("music")} && ${audio("music")}.currentTime>=window.__audioQa.beforeRoom`));
    await waitFor(() => value("!window.__audioQa.oldAmbience.isConnected && !window.__audioQa.oldAmbience.hasAttribute('src')"));
    await hotspot("Quiet room"); await waitFor(() => value("document.querySelectorAll('[data-audio-channel]').length===0"));
    await hotspot("Back"); await bedPlaying(); await gain("music", 0.2);
  });
  await check("embedded and synchronized external scene voices use voice gain and ducking", async () => {
    await hotspot("Embedded scene"); await gain("music", 0.05);
    assert.equal(await value("document.querySelector('video.mage2-player__media').volume"), 0.8 * 0.4);
    await hotspot("External scene");
    await waitFor(() => value("(() => { const a=document.querySelector('audio[data-scene-audio-asset-id=\"external_audio\"]'); return a?.readyState>=2&&!a.paused; })()"));
    await gain("music", 0.05);
    const legacy = await value("({videoMuted:document.querySelector('video.mage2-player__media').muted,audio:[...document.querySelectorAll('audio')].filter(a=>!a.dataset.audioChannel).map(a=>({volume:a.volume,paused:a.paused,ready:a.readyState}))})");
    assert(legacy.videoMuted); assert(legacy.audio.some((a) => !a.paused && a.ready >= 2 && Math.abs(a.volume - 0.32) < 0.001), JSON.stringify(legacy));
    await hotspot("Back"); await bedPlaying(); await gain("music", 0.2);
    return legacy;
  });
  await check("save/load releases decoders and preserves one-shot progress", async () => {
    await click(".mage2-experience__menu-button"); await menuAction("Save game");
    await waitFor(() => value("!document.querySelector('.mage2-experience__panel-actions')"));
    await value("window.__audioQa.beforeLoad=[...document.querySelectorAll('[data-audio-channel]')]; void 0");
    await click(".mage2-experience__menu-button"); await menuAction("Load game");
    await waitFor(() => value("!!document.querySelector('.mage2-experience__confirmation')"));
    await click(".mage2-experience__confirmation .mage2-experience__primary-action"); await bedPlaying();
    assert(await value("window.__audioQa.beforeLoad.every(a=>!a.isConnected&&!a.hasAttribute('src'))"));
    const effects = await value("window.__audioQa.effects"); await hotspot("Foley once"); await pause(250);
    assert.equal(await value("window.__audioQa.effects"), effects);
    await gain("music", 0.2); await capture("restored");
  });
  await value("document.removeEventListener('play',window.__audioQa.onPlay,true)");
  return checks;
}

import assert from "node:assert/strict";

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function waitFor(fn, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error; }
    await pause(100);
  }
  throw last ?? new Error("Timed out waiting for ambient fixture");
}

export async function verifyAmbient(cdp, capture) {
  const checks = [];
  const check = async (name, run) => { const evidence = await run(); checks.push({ name, passed: true, evidence }); };
  const value = (expression) => cdp.value(expression);
  const count = () => value("document.querySelectorAll('[data-ambient-region]').length");
  const click = async (selector) => {
    const box = await value(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('Missing control: ' + ${JSON.stringify(selector)}); const r = e.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...box });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...box });
  };
  const region = (id) => `[data-ambient-region="region_${id}"]`;
  await waitFor(() => count().then((n) => n === 6));
  await waitFor(() => value("[...document.querySelectorAll('.mage2-ambient video')].filter(v => v.readyState >= 2 && !v.paused && v.style.visibility === 'visible').length >= 4"));
  await check("six regions, native decoding, masks, complete base and both fallbacks", async () => {
    const state = await value(`({ base: document.querySelector('img.mage2-player__media')?.naturalWidth, layers: [...document.querySelectorAll('[data-ambient-region]')].map(r => ({ id:r.dataset.ambientRegion, fallback:r.dataset.fallbackMode, image:r.querySelector('img')?.naturalWidth, mask:getComputedStyle(r).maskImage, videos:[...r.querySelectorAll('video')].map(v => ({ width:v.videoWidth,height:v.videoHeight,muted:v.muted,ready:v.readyState })) })) })`);
    assert.equal(state.base, 1280);
    assert.equal(state.layers.length, 6);
    assert(state.layers.filter((r) => r.fallback === "image").every((r) => r.image === 320));
    assert(state.layers[1].mask.includes("url("));
    assert(state.layers.every((r) => r.videos.every((v) => v.muted)));
    await capture("composite");
    return state;
  });
  await value(`(() => {
    window.__ambientQa = { original:[...document.querySelectorAll('.mage2-ambient video')], sequence:[], ends:[], idle:[] };
    const observed = new WeakSet(); let lastIdle=false;
    const record = () => {
      for (const v of document.querySelectorAll('.mage2-ambient video')) if (!observed.has(v)) {
        observed.add(v);
        const id=v.closest('[data-ambient-region]').dataset.ambientRegion;
        if(id==='region_5') window.__ambientQa.sequence.push(v.dataset.ambientClip);
        if(id==='region_4') v.addEventListener('ended',()=>window.__ambientQa.ends.push(performance.now()));
      }
      const idle=document.querySelector('[data-ambient-region="region_4"] [data-ambient-state="idle"]');
      if(idle && !lastIdle) window.__ambientQa.idle.push({time:performance.now(),videos:idle.querySelectorAll('video').length,ended:window.__ambientQa.ends.length});
      lastIdle=!!idle;
    };
    window.__ambientQa.observer=new MutationObserver(record);
    window.__ambientQa.observer.observe(document.querySelector('.mage2-ambient'),{subtree:true,childList:true,attributes:true,attributeFilter:['data-ambient-state']}); record();
  })()`);
  await check("frame pacing with four concurrent looping layers", async () => {
    const perf = await value(`new Promise(resolve => {
      const times=[]; let previous=performance.now(); const started=previous;
      const videos=[...document.querySelectorAll('.mage2-ambient video')].filter(v=>v.loop);
      const baseline=videos.map(v=>v.getVideoPlaybackQuality());
      let minActive=99;
      const frame=now=>{times.push(now-previous);previous=now;minActive=Math.min(minActive,[...document.querySelectorAll('.mage2-ambient video')].filter(v=>!v.paused && v.readyState>=2).length);
        if(now-started<6000) return requestAnimationFrame(frame);
        times.sort((a,b)=>a-b); resolve({samples:times.length,p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1),minActive,decoding:videos.map((v,i)=>({frames:v.getVideoPlaybackQuality().totalVideoFrames-baseline[i].totalVideoFrames,dropped:v.getVideoPlaybackQuality().droppedVideoFrames-baseline[i].droppedVideoFrames}))});};requestAnimationFrame(frame);
    })`);
    assert(perf.minActive >= 4, JSON.stringify(perf));
    assert(perf.samples >= 60, JSON.stringify(perf));
    return perf;
  });
  await check("finite repeats, decoder-free idle, zero-delay nonrepeating pool", async () => {
    await waitFor(() => value("window.__ambientQa.sequence.length >= 3 && window.__ambientQa.idle.length >= 2"), 20000);
    const record = await value("({sequence:window.__ambientQa.sequence,ends:window.__ambientQa.ends,idle:window.__ambientQa.idle})");
    assert(record.sequence.every((id, index) => index === 0 || record.sequence[index - 1] !== id), JSON.stringify(record));
    assert(record.idle.every((item) => item.videos === 0));
    assert.equal(record.idle[1].ended - record.idle[0].ended, 2, "Expected exactly two complete plays per finite sequence");
    assert(record.idle[1].time - record.idle[0].time >= 5500, "The next sequence began before its 1600 ms delay");
    return record;
  });
  await check("dialogue input preserves the existing decoders", async () => {
    await value("window.__ambientQa.beforeTalk=document.querySelector('[data-ambient-region=region_0] video')");
    const started = performance.now();
    await click('.mage2-player__hotspot-button[aria-label="Talk"]');
    await waitFor(() => value("!!document.querySelector('.mage2-player__dialogue-continue')"));
    const latencyMs = performance.now() - started;
    assert(await value("window.__ambientQa.beforeTalk === document.querySelector('[data-ambient-region=region_0] video')"));
    await capture("dialogue");
    await click(".mage2-player__dialogue-continue");
    return { latencyMs };
  });
  await check("menu pause and resume freezes decoder playheads", async () => {
    await click(".mage2-experience__menu-button");
    await waitFor(() => value("[...document.querySelectorAll('.mage2-ambient video')].every(v=>v.paused)"));
    assert(await value("[...document.querySelectorAll('.mage2-ambient video')].every(v=>v.style.visibility==='hidden')"));
    const before = await value("[...document.querySelectorAll('.mage2-ambient video')].map(v=>v.currentTime)");
    await pause(500);
    const after = await value("[...document.querySelectorAll('.mage2-ambient video')].map(v=>v.currentTime)");
    assert.deepEqual(after, before);
    await click(".mage2-experience__primary-action");
    await waitFor(() => value("[...document.querySelectorAll('.mage2-ambient video')].some(v=>!v.paused)"));
    return { before, after };
  });
  await check("buffering and injected decode failure retain neutral image", async () => {
    const buffering = await value(`(() => {const r=document.querySelector('${region(1)}'); const v=r.querySelector('video');v.dispatchEvent(new Event('waiting'));return {hidden:v.style.visibility,neutral:r.querySelector('img').naturalWidth};})()`);
    assert.equal(buffering.hidden, "hidden"); assert.equal(buffering.neutral, 320);
    await value(`(() => {const v=document.querySelector('${region(1)} video');v.src='data:video/mp4,invalid';v.load();})()`);
    await waitFor(() => value(`!document.querySelector('${region(1)} video')`));
    assert(await value(`document.querySelector('${region(1)} img').naturalWidth===320`));
    await capture("decode-failure-fallback");
    return buffering;
  });
  await check("condition change stops an infinite loop immediately", async () => {
    await click('.mage2-player__hotspot-button[aria-label="Stop motion"]');
    await waitFor(() => value(`!document.querySelector('${region(3)} video')`));
    assert(await value(`document.querySelector('${region(3)} img').naturalWidth===320`));
  });
  await check("reduced motion releases every decoder", async () => {
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await waitFor(() => value("document.querySelectorAll('.mage2-ambient video').length === 0"));
    assert.equal(await count(), 6);
    await capture("reduced-motion");
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await waitFor(() => value("document.querySelectorAll('.mage2-ambient video').length >= 4"));
  });
  await check("scene exit releases resources and legacy video still loops", async () => {
    await value("window.__ambientQa.exiting=[...document.querySelectorAll('.mage2-ambient video')]");
    await click('.mage2-player__hotspot-button[aria-label="Legacy video"]');
    await waitFor(() => value("!!document.querySelector('video.mage2-player__media')"));
    assert.equal(await count(), 0);
    assert(await value("window.__ambientQa.exiting.every(v=>!v.isConnected&&!v.hasAttribute('src')&&v.paused)"));
    await waitFor(() => value("document.querySelector('video.mage2-player__media').readyState>=2"));
    assert(await value("document.querySelector('video.mage2-player__media').loop && document.querySelector('video.mage2-player__media').muted"));
    await pause(2300);
    assert(await value("!document.querySelector('video.mage2-player__media').ended && !document.querySelector('video.mage2-player__media').paused"));
    await click('.mage2-player__hotspot-button[aria-label="Back"]');
    await waitFor(() => count().then((n) => n === 6));
    await waitFor(() => value("document.querySelectorAll('.mage2-ambient video').length >= 4"));
    await capture("reentry");
  });
  await check("save restoration restarts ambient presentation without persisting micro-animation state", async () => {
    await click(".mage2-experience__menu-button");
    await click(".mage2-experience__panel-actions > button:nth-child(2)");
    await waitFor(() => value("!document.querySelector('.mage2-experience__panel-actions')"));
    await value("window.__ambientQa.restoring=[...document.querySelectorAll('.mage2-ambient video')]");
    await click(".mage2-experience__menu-button");
    await click(".mage2-experience__panel-actions > button:nth-child(3)");
    await waitFor(() => value("!!document.querySelector('.mage2-experience__confirmation')"));
    await click(".mage2-experience__confirmation .mage2-experience__primary-action");
    await waitFor(() => value("window.__ambientQa.restoring.every(v=>!v.isConnected&&!v.hasAttribute('src'))"));
    await waitFor(() => value("document.querySelectorAll('.mage2-ambient video').length >= 4"));
    assert.equal(await count(), 6);
  });
  await value("window.__ambientQa.observer.disconnect()");
  return checks;
}

export function createCdpClient(url) {
  return new (class {
    nextId = 0; pending = new Map();
    async connect() {
      this.socket = new WebSocket(url);
      this.socket.addEventListener("message", ({ data }) => {
        const message = JSON.parse(data); const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id); clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error))); else pending.resolve(message.result);
      });
      await new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once: true }); this.socket.addEventListener("error", reject, { once: true }); });
    }
    send(method, params = {}) {
      const id = ++this.nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timeout`)); }, 30000);
        this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params }));
      });
    }
    async value(expression) {
      const response = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    }
    close() { this.socket?.close(); }
  })();
}

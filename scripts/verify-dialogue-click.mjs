import assert from "node:assert/strict";
import path from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const server = await createServer({ configFile: false, root, plugins: [react(), {
  name: "dialogue-click-fixture",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url !== "/") return next();
      try {
        res.setHeader("Content-Type", "text/html");
        res.end(await server.transformIndexHtml("/", '<div id="root"></div><script type="module" src="/scripts/verification/dialogue-click.fixture.tsx"></script>'));
      } catch (error) { next(error); }
    });
  }
}], resolve: { alias: Object.fromEntries(["schema", "player", "player-ui"].map(name =>
  [`@mage2/${name}`, path.join(root, `packages/${name}/src/index.ts`)])) },
server: { host: "127.0.0.1", port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true,
    ...(process.env.DIALOGUE_BROWSER_CHANNEL ? { channel: process.env.DIALOGUE_BROWSER_CHANNEL } : {}) });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  const passage = () => page.locator("[data-passage]").getAttribute("data-passage");
  const waitForPassage = id => page.waitForFunction(id => document.querySelector("[data-passage]")?.dataset.passage === id, id);
  await waitForPassage("first");

  // One physical click spans the narration deadline. Its release belongs to the old passage.
  await page.locator(".mage2-player__dialogue-text").hover();
  await page.mouse.down();
  await waitForPassage("second");
  const secondStarted = Date.now();
  await page.mouse.up();
  assert.equal(await passage(), "second", "release must not skip the new passage");
  await waitForPassage("topics");
  assert(Date.now() - secondStarted >= 7800, "the new passage needs its full eight-second reading time");

  await page.getByRole("button", { name: "Replay" }).click();
  assert.equal(await passage(), "first", "choosing a topic must not also advance its first line");
  await page.locator(".mage2-player__dialogue-text").click();
  assert.equal(await passage(), "second");
  await page.getByRole("button", { name: "Continue" }).click();
  assert.equal(await passage(), "topics");
  await page.locator("[data-passage]").click({ position: { x: 400, y: 300 } });
  assert.equal(await passage(), "topics", "background clicks must preserve choices");
  await page.getByRole("button", { name: "Replay" }).click();
  await page.locator("[data-passage]").click({ position: { x: 400, y: 300 } });
  assert.equal(await passage(), "second", "a fresh background click must still advance once");
  console.log("Dialogue clicks passed: timer boundary, full reading time, text, Continue, background, and choices.");
} finally {
  await browser?.close();
  await server.close();
}

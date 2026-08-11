// Full live run in the Samsung TV Simulator: install the wgt, launch the app,
// drive to the player with the tafseer side panel, verify audio + sync.
import { chromium } from "@playwright/test";

const WGT = process.env.WGT ?? "/home/mohamed/playground/mp3qurantv/web/dist/QuranTV.wgt";
const APP_DIR = "org.qurantv";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("ripple"));
if (!page) { console.log("no ripple page"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. install the wgt (idempotent: only if not already registered)
// Fresh install every run (drops the package DB keys + app dir)
import { rmSync, existsSync } from "node:fs";
const appDir = `/home/mohamed/tizen-studio/tools/sec-tv-simulator/appLauncher/app/${APP_DIR}`;
if (existsSync(appDir)) rmSync(appDir, { recursive: true, force: true });
const dropKeys = await page.evaluate(() => {
  const keys = Object.keys(localStorage).filter((k) => /package|installed|applist/i.test(k));
  for (const k of keys) localStorage.removeItem(k);
  return keys;
});
console.log("dropped db keys:", dropKeys.length);
const res = await page.evaluate(async (wgt) => {
  try {
    await window.requirejs("ripple/worker").installWgtApp([{ path: wgt, name: "QuranTV.wgt" }]);
    return "installed";
  } catch (e) { return "install err: " + e.message; }
}, WGT);
console.log("install:", res);
await sleep(8000);

// 2. launch: point the app iframe at the installed app's index.html
const appUrl = `file:///home/mohamed/tizen-studio/tools/sec-tv-simulator/appLauncher/app/${APP_DIR}/index.html`;
await page.evaluate((url) => { document.querySelector("iframe").src = url; }, appUrl);
await sleep(15000);

const app = page.frames().find((f) => f.url().includes(APP_DIR));
if (!app) { console.log("APP FRAME NOT FOUND"); process.exit(1); }

const key = (k, code) => app.evaluate(([k, c]) => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: k, keyCode: c, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: k, keyCode: c, bubbles: true }));
}, [k, code]);

// 3. Home → search العجمي → grid → surah 1
console.log("home:", JSON.stringify((await app.evaluate(() => document.body.innerText)).slice(0, 40)));
await app.evaluate(() => document.querySelector("#home-search")?.click());
await sleep(500);
await app.evaluate(() => {
  const input = document.querySelector("#search-input");
  input.value = "العجمي";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(400);
// Enter must go to the INPUT element (its own handler opens the first match)
await app.evaluate(() => {
  const input = document.querySelector("#search-input");
  input.focus();
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: true }));
});
await sleep(2000);
const inChooser = await app.evaluate(() => document.querySelectorAll(".dialog-row").length);
console.log("after search: dialog rows:", inChooser, "| grid:", await app.evaluate(() => !!document.querySelector("[data-focus-id='grid-jump']")));
if (inChooser > 0) { await key("Enter", 13); await sleep(2000); }
await app.evaluate(() => document.querySelector("[data-focus-id='surah-1']")?.click());
await sleep(8000);
console.log("grid visible now:", await app.evaluate(() => !!document.querySelector("[data-focus-id='grid-jump']")));
console.log("player visible now:", await app.evaluate(() => !!document.querySelector("[data-focus-id='player-back']")));

const st = await app.evaluate(() => window.__quranTv?.getState?.() ?? null);
console.log("PLAYER:", JSON.stringify(st));

// 4. open the tafseer side panel (transport view button → التفسير الميسر)
await key("ArrowDown", 40); // reveal chrome
await sleep(300);
await app.evaluate(() => {
  const btn = [...document.querySelectorAll(".icon-btn")].find((b) => b.textContent === "مصحف");
  btn?.click();
});
await sleep(600);
await app.evaluate(() => {
  const row = [...document.querySelectorAll(".dialog-row")].find((r) => r.textContent.includes("التفسير"));
  row?.click();
});
await sleep(3000);
const panelRows = await app.evaluate(() => document.querySelectorAll('[id^="ctx-row-"]').length);
const imgStill = await app.evaluate(() =>
  !!document.querySelector('img[src*="tajweed_png"], img[src*="quran_pages_svg"], img[src*="safahat1"], img[src*="/warsh/"], img[src*="islamic.app"]'));
const pinned = await app.evaluate(() => {
  const rows = [...document.querySelectorAll('[id^="ctx-row-"]')];
  return rows.filter((r) => r.offsetHeight > 0).length;
});
console.log("SIDE PANEL: rows=", panelRows, "page image still visible:", imgStill, "visible rows:", pinned);

// 5. audio check
const audio = await app.evaluate(() => {
  const a = document.querySelector("audio");
  return a ? { playing: !a.paused, t: a.currentTime.toFixed(1) } : "no audio element";
});
console.log("AUDIO:", JSON.stringify(audio));
await browser.close();

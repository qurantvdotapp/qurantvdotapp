import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("ripple"));
const app = page.frames().find((f) => f.url().includes("org.qurantv"));
if (!app) { console.log("NO APP FRAME"); process.exit(1); }

// helper: dispatch a TV key on the app window
const key = (k, code) => app.evaluate(([key, keyCode]) => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, keyCode, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent("keyup", { key, keyCode, bubbles: true }));
}, [k, code]);

const log = (m) => console.log(m);

// 1. The Home screen is up (verify)
log("HOME:", JSON.stringify((await app.evaluate(() => document.body.innerText)).slice(0, 60)));

// 2. Open the search, find the verified timed reciter أحمد بن علي العجمي
await app.evaluate(() => { document.querySelector("#home-search").click(); });
await new Promise((r) => setTimeout(r, 500));
await app.evaluate(() => {
  const input = document.querySelector("#search-input");
  input.value = "العجمي";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 500));
await key("Enter", 13); // open first match
await new Promise((r) => setTimeout(r, 1500));
const rows = await app.evaluate(() => document.querySelectorAll(".dialog-row").length);
log("after open: dialog rows =", rows, "| grid visible:", await app.evaluate(() => !!document.querySelector("[data-focus-id='grid-jump']")));
// moshaf chooser?
if (rows > 0) { await key("Enter", 13); await new Promise((r) => setTimeout(r, 1500)); }

// 3. Surah grid → surah 1
await app.evaluate(() => document.querySelector("[data-focus-id='surah-1']")?.click());
await new Promise((r) => setTimeout(r, 6000));
const st = await app.evaluate(() => window.__quranTv?.getState?.() ?? null);
log("PLAYER STATE:", JSON.stringify(st));

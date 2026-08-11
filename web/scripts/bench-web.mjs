// Web app performance snapshot (Chromium). Real perceived startup to the
// full catalog, transfer sizes, DOM size, memory, and playback jank.
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.addInitScript(() => {
  if (window.PerformanceObserver) {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__ltCount = (window.__ltCount || 0) + 1;
        window.__ltMs = (window.__ltMs || 0) + e.duration;
      }
    });
    try { obs.observe({ entryTypes: ["longtask"] }); } catch {}
  }
});

const t0 = Date.now();
await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });

// perceived startup: until the RECITER LIST renders (real catalog data)
const t1 = Date.now();
await page.waitForFunction(() => document.querySelectorAll(".h-scroll .tv-chip").length > 10, { timeout: 20000 });
const toRecitersMs = Date.now() - t1;

const resources = await page.evaluate(() => {
  const res = performance.getEntriesByType("resource");
  return {
    totalTransferKb: Math.round(res.reduce((a, r) => a + (r.transferSize || 0), 0) / 1024),
    biggest: res
      .map((r) => ({ name: r.name.split("/").pop().slice(0, 40), kb: Math.round((r.transferSize || 0) / 1024) }))
      .sort((a, b) => b.kb - a.kb)
      .slice(0, 4),
  };
});

const home = await page.evaluate(() => ({
  domNodes: document.querySelectorAll("*").length,
  reciterChips: document.querySelectorAll(".h-scroll .tv-chip").length,
  jsHeapMb: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
}));

// player + playback (timed reciter → surah 1)
await page.click("#home-search");
await page.fill("#search-input", "العجمي");
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
if (await page.locator(".dialog-row").first().isVisible().catch(() => false)) {
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
}
await page.waitForSelector("[data-focus-id='surah-1']", { timeout: 20000 });
const t2 = Date.now();
await page.click("[data-focus-id='surah-1']");
await page.waitForSelector("[data-focus-id='player-back']", { timeout: 20000 });
const toPlayerMs = Date.now() - t2;

await page.waitForTimeout(12000);
const player = await page.evaluate(() => ({
  domNodes: document.querySelectorAll("*").length,
  jsHeapMb: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
  longTasks: window.__ltCount ?? 0,
  longTaskMs: Math.round(window.__ltMs ?? 0),
  audioTime: document.querySelector("audio")?.currentTime.toFixed(1),
  ayah: window.__quranTv?.getState?.().currentAyah,
}));

console.log(JSON.stringify({ toRecitersMs, resources, home, toPlayerMs, player }, null, 1));
await browser.close();

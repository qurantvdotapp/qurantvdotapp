// Vidaa stand-in: a HEADED Chromium window on the desktop (the same web engine
// family Vidaa runs) with REAL audio — drives to the player and opens the
// tafseer panel so you can see + hear Quran TV live.
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  headless: false,
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1600,900"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://127.0.0.1:4173/");
await page.locator(".tv-chip").first().waitFor({ timeout: 20000 });

// drive to a timed reciter + surah 1 (same walk as the e2e tests)
await page.locator("#home-search").click();
await page.waitForTimeout(300);
await page.locator("#search-input").fill("العجمي");
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
const chooser = page.locator(".dialog-row").first();
if (await chooser.isVisible().catch(() => false)) {
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
}
await page.waitForSelector("[data-focus-id='surah-1']", { timeout: 20000 });
await page.locator("[data-focus-id='surah-1']").click();
await page.waitForSelector("[data-focus-id='player-back']", { timeout: 20000 });
await page.waitForTimeout(4000);

// open the tafseer side panel
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(200);
await page.getByText("مصحف", { exact: true }).first().click();
await page.waitForTimeout(600);
await page.getByText("التفسير الميسر", { exact: true }).click();
await page.waitForTimeout(3000);

const st = await page.evaluate(() => window.__quranTv?.getState?.() ?? null);
console.log("LIVE STATE:", JSON.stringify(st));
const audio = await page.evaluate(() => {
  const a = document.querySelector("audio");
  return a ? { playing: !a.paused, t: a.currentTime.toFixed(1) } : "none";
});
console.log("AUDIO:", JSON.stringify(audio));
console.log("Window is OPEN on your display — Quran TV is playing with the tafseer panel.");
console.log("(keep this process running; Ctrl+C in the terminal stops it)");
await page.waitForTimeout(600000); // hold the window open

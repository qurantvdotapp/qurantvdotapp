import { chromium } from "@playwright/test";
import fs from "fs";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("ripple"));
const app = page.frames().find((f) => f.url().includes("org.qurantv"));
// make sure we're in page mode with the highlight visible
await app.evaluate(() => {
  if (window.__quranTv?.getState?.().displayMode !== 1) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i", keyCode: 73, bubbles: true }));
  }
});
await new Promise((r) => setTimeout(r, 2500));
const shot = await page.screenshot({ fullPage: false });
fs.writeFileSync("simulator-qurantv.png", shot);
console.log("saved simulator-qurantv.png", shot.length, "bytes");
await browser.close();

import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("ripple"));
const out = await page.evaluate(async () => {
  const worker = window.requirejs("ripple/worker");
  try {
    const r = await worker.installWgtApp("/home/mohamed/playground/mp3qurantv/web/dist/QuranTV.wgt");
    return { ok: true, result: r };
  } catch (e) {
    return { ok: false, err: e.message };
  }
});
console.log("install:", JSON.stringify(out).slice(0, 300));
await new Promise((r) => setTimeout(r, 12000));
for (const f of page.frames()) {
  try {
    const url = f.url();
    if (url.startsWith("file://") || url.includes("index.html")) {
      const body = await f.evaluate(() => document.body?.innerText?.slice(0, 200) ?? "");
      console.log("FRAME:", url.slice(-80), "| BODY:", JSON.stringify(body.slice(0, 120)));
    }
  } catch (e) {}
}
await browser.close();

import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("ripple"));
const result = await page.evaluate(() => {
  try {
    const T = window.tinyHippos;
    if (!T) return "no tinyHippos";
    const worker = T("ripple/worker");
    if (!worker || typeof worker.installHtmlApp !== "function") return "no installHtmlApp; keys: " + Object.keys(worker || {}).join(",");
    worker.installHtmlApp([{ path: "/home/mohamed/playground/mp3qurantv/web/dist/QuranTV.wgt", name: "QuranTV.wgt" }]);
    return "installHtmlApp invoked";
  } catch (e) {
    return "ERR: " + e.message;
  }
});
console.log("result:", result);
await new Promise((r) => setTimeout(r, 8000));
// check frames again
for (const f of page.frames()) {
  try {
    const url = f.url();
    if (url.startsWith("file://")) {
      const body = await f.evaluate(() => document.body?.innerText?.slice(0, 300) ?? "");
      console.log("FRAME:", url.slice(-60), "| BODY:", JSON.stringify(body.slice(0, 120)));
    }
  } catch (e) {}
}
await browser.close();

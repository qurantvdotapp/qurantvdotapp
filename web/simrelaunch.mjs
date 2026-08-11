import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("ripple"));
// set the startup param so the boot flow installs+launches our wgt
await page.evaluate(() => {
  // ripple/db saves JSON objects under prefixed localStorage keys
  const keys = Object.keys(localStorage);
  const pref = keys.find((k) => k.includes("startup")) ? null : null;
  localStorage.setItem("tizentv-3.0-startup_param", JSON.stringify({ file: "/home/mohamed/playground/mp3qurantv/web/dist/QuranTV.wgt" }));
  // also try the emulator prefix used by this sim
  localStorage.setItem("startup_param", JSON.stringify({ file: "/home/mohamed/playground/mp3qurantv/web/dist/QuranTV.wgt" }));
  return Object.keys(localStorage).filter((k) => k.includes("startup") || k.includes("first"));
});
await page.reload();
await new Promise((r) => setTimeout(r, 12000));
for (const f of page.frames()) {
  try {
    const url = f.url();
    if (url.startsWith("file://")) {
      const body = await f.evaluate(() => document.body?.innerText?.slice(0, 300) ?? "");
      console.log("FRAME:", url.slice(-70), "| BODY:", JSON.stringify(body.slice(0, 150)));
    }
  } catch (e) {}
}
await browser.close();

import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("ripple"));
const appPath = "file:///home/mohamed/tizen-studio/tools/sec-tv-simulator/appLauncher/app/org.qurantv/index.html";
const set = await page.evaluate((url) => {
  const iframe = document.querySelector("iframe");
  if (!iframe) return "no iframe";
  iframe.src = url;
  return "set iframe to " + url;
}, appPath);
console.log(set);
await new Promise((r) => setTimeout(r, 15000));
const frames = page.frames();
console.log("frames:", frames.map((f) => f.url().slice(-70)));
for (const f of frames) {
  try {
    const url = f.url();
    if (url.includes("org.qurantv")) {
      const info = await f.evaluate(() => ({
        body: document.body?.innerText?.slice(0, 300) ?? "",
        title: document.title,
        errors: window.__quranTv ? "has hook" : "no hook",
      }));
      console.log("APP STATE:", JSON.stringify(info, null, 2).slice(0, 700));
    }
  } catch (e) { console.log("frame err:", e.message.slice(0, 80)); }
}
await browser.close();

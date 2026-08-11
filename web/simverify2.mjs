import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("ripple"));
const frames = page.frames().map((f) => f.url());
console.log("frames:", JSON.stringify(frames));
const app = page.frames().find((f) => f.url().includes("org.qurantv"));
if (!app) { console.log("NO APP FRAME — reloading the iframe"); 
  await page.evaluate(() => { const i = document.querySelector("iframe"); i.src = "file:///home/mohamed/tizen-studio/tools/sec-tv-simulator/appLauncher/app/org.qurantv/index.html"; });
  await new Promise((r) => setTimeout(r, 12000));
}
const app2 = page.frames().find((f) => f.url().includes("org.qurantv"));
if (!app2) { console.log("STILL NO APP"); process.exit(1); }
const body = await app2.evaluate(() => document.body.innerText.slice(0, 80));
console.log("APP BODY:", JSON.stringify(body));
await browser.close();

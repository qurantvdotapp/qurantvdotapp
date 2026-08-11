import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("ripple"));
const app = page.frames().find((f) => f.url().includes("org.qurantv"));
const info = await app.evaluate(async () => {
  const a = document.querySelector("audio");
  if (!a) return "no audio element";
  const snap = { paused: a.paused, currentSrc: a.currentSrc.slice(-30), readyState: a.readyState, error: a.error ? a.error.code : null, networkState: a.networkState };
  // try to (re)start on the surah's mp3
  try {
    await a.play();
  } catch (e) { snap.playError = e.message.slice(0, 80); }
  await new Promise((r) => setTimeout(r, 1500));
  snap.after = { paused: a.paused, t: a.currentTime.toFixed(1), readyState: a.readyState };
  return snap;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();

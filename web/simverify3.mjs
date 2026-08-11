import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("ripple"));
const app = page.frames().find((f) => f.url().includes("org.qurantv"));
const key = (k, code) => app.evaluate(([key, keyCode]) => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, keyCode, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent("keyup", { key, keyCode, bubbles: true }));
}, [k, code]);

const state = async (label) => {
  const st = await app.evaluate(() => window.__quranTv?.getState?.() ?? "no-hook");
  console.log(label, "→", JSON.stringify(st));
};

await state("SYNC STATE (ticker)");
await new Promise((r) => setTimeout(r, 4000));
await state("SYNC STATE +4s (ayah should advance)");

// audio playing?
const audio = await app.evaluate(() => {
  const a = document.querySelector("audio");
  return a ? { playing: !a.paused, t: a.currentTime.toFixed(1), src: a.src.slice(-30) } : "no audio";
});
console.log("AUDIO:", JSON.stringify(audio));

// text mode via Info key
await key("i", 73);
await new Promise((r) => setTimeout(r, 1500));
const textRows = await app.evaluate(() => document.querySelectorAll(".quran-text").length);
console.log("TEXT MODE rows:", textRows);

// back to page mode
await key("i", 73);
await new Promise((r) => setTimeout(r, 2500));
const img = await app.evaluate(() => {
  const el = document.querySelector('img[src*="quran_pages_svg"]');
  return el ? { src: el.src.slice(-40), w: el.getBoundingClientRect().width } : "no mushaf img";
});
console.log("PAGE MODE img:", JSON.stringify(img));
const overlay = await app.evaluate(() => {
  return [...document.querySelectorAll("div[style]")].filter((d) => {
    const s = d.style;
    return s.position === "absolute" && (s.border || "").includes("3px");
  }).length;
});
console.log("highlight overlays:", overlay);
await browser.close();

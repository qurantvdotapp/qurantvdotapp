import { chromium } from "@playwright/test";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages().find((p) => p.url().includes("ripple"));
const out = await page.evaluate(async (wgt) => {
  const db = window.requirejs("ripple/db");
  const consts = window.requirejs("ripple/constants");
  // clear the package DB so the install runs fresh
  const pk = db.retrieveObject(consts.DB_APP_KEYS.PACKAGE_KEY) || {};
  delete pk.installedList?.["org.qurantv"];
  db.saveObject(consts.DB_APP_KEYS.PACKAGE_KEY, pk, () => {});
  try {
    await window.requirejs("ripple/worker").installWgtApp([{ path: wgt, name: "QuranTV.wgt" }]);
    return "installed fresh";
  } catch (e) { return "err: " + e.message; }
}, "/home/mohamed/playground/mp3qurantv/web/dist/QuranTV.wgt");
console.log(out);
await new Promise((r) => setTimeout(r, 8000));
await browser.close();

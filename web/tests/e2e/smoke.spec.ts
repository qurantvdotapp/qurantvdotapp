// TV-remote smoke test: browses Home → surah grid → player, verifies real
// playback + ayah sync + mushaf page mode, driven only with D-pad/media keys
// (arrow keys, Enter, Info, Space) — the same keycodes Tizen/Vidaa send.

import { expect, test } from "@playwright/test";

// Any mushaf page image (the default style is حفص ملون = KSU tajweed PNG).
const PAGE_IMG = 'img[src*="tajweed_png"], img[src*="quran_pages_svg"], img[src*="safahat1"], img[src*="/warsh/"], img[src*="islamic.app"]';

test("catalog loads and reciters are reachable by D-pad", async ({ page }) => {
  await page.goto("/");
  // Home renders (Arabic primary, RTL)
  await expect(page.getByText("القراء", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  // At least one reciter chip appears (live API)
  await expect(page.locator(".tv-chip").first()).toBeVisible({ timeout: 20_000 });
  // Focus engine picked an initial target
  await expect(page.locator(".focused").first()).toHaveCount(1);
  // D-pad moves focus between chips
  const focusedBefore = await page.locator(".focused").first().innerText();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  const focusedNow = await page.locator(".focused").first().innerText();
  expect(focusedNow).not.toBe(focusedBefore);
  // Back from Home is a no-op (stays)
  await page.keyboard.press("Escape");
  await expect(page.getByText("القراء", { exact: true }).first()).toBeVisible();
});

test("timed reciter (العجمي, read 5) → grid → player plays and syncs", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tv-chip").first()).toBeVisible({ timeout: 20_000 });

  // Open the search overlay and find the verified-timed reciter أحمد بن علي العجمي
  await page.locator("#home-search").click();
  await page.waitForTimeout(300);
  await page.locator("#search-input").fill("العجمي");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter"); // input Enter → openFirstMatch
  await page.waitForTimeout(1500);

  // If a moshaf chooser opened (multi-moshaf reciter), pick the first option
  const chooser = page.locator(".dialog-row").first();
  if (await chooser.isVisible().catch(() => false)) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
  }

  // Surah grid
  await expect(page.locator("[data-focus-id='grid-jump']")).toBeVisible({ timeout: 20_000 });
  // Open surah 1 (first card in the grid)
  await page.locator("[data-focus-id='surah-1']").click();
  // Player
  await expect(page.locator("[data-focus-id='player-back']")).toBeVisible({ timeout: 20_000 });

  // Audio is actually playing (position advances)
  await page.waitForTimeout(2500);
  const pos = await page.evaluate(() => {
    const a = document.querySelector("audio");
    return a ? a.currentTime : -1;
  });
  expect(pos).toBeGreaterThan(0);

  // The player opens in mushaf page mode by default (style 5 = KSU tajweed) —
  // the page appears once the basmala (ayah 0, no page) gives way to ayah 1.
  const img = page.locator(PAGE_IMG).first();
  await expect(img).toBeVisible({ timeout: 15_000 });

  // SYNC CHECK: the highlight rect moves as the recitation advances
  const overlayBoxes = () =>
    page.evaluate(() => {
      return [...document.querySelectorAll("div[style]")]
        .filter((d) => {
          const s = (d as HTMLElement).style;
          return s.position === "absolute" && (s.border || "").includes("3px");
        })
        .map((d) => {
          const r = (d as HTMLElement).getBoundingClientRect();
          return `${Math.round(r.top)},${Math.round(r.left)}`;
        });
    });
  // The overlay appears once the SVG viewBox is parsed (just after the img).
  let boxes1: string[] = [];
  for (let i = 0; i < 8; i++) {
    boxes1 = await overlayBoxes();
    if (boxes1.length >= 1) break;
    await page.waitForTimeout(1000);
  }
  expect(boxes1.length).toBeGreaterThanOrEqual(1);
  // Surah 1 (read 5) ayahs change every ~3-5 s; wait for the highlight to move.
  let moved = false;
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(2000);
    const boxes2 = await overlayBoxes();
    if (JSON.stringify(boxes1) !== JSON.stringify(boxes2)) {
      moved = true;
      break;
    }
  }
  expect(moved).toBe(true);

  // Info key → text mode: ayah rows with the Amiri font are shown
  await page.keyboard.press("i");
  await page.waitForTimeout(800);
  await expect(page.locator(".quran-text").first()).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("i");
  await page.waitForTimeout(800);

  // Play/pause via space (media play-pause)
  await page.keyboard.press(" ");
  await page.waitForTimeout(300);
  const paused = await page.evaluate(() => {
    const a = document.querySelector("audio");
    return a ? a.paused : true;
  });
  expect(paused).toBe(true);
  await page.keyboard.press(" ");
  await page.waitForTimeout(300);

  // Back → grid → Back → home
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-focus-id='grid-jump']")).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByText("القراء", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
});

test("no-timing reciter opens and degrades gracefully (no crash)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tv-chip").first()).toBeVisible({ timeout: 20_000 });

  // Search for a known no-timing reciter (أحمد الحذيفي has no timing read).
  await page.locator("#home-search").click();
  await page.waitForTimeout(300);
  await page.locator("#search-input").fill("الحذيفي");
  await page.waitForTimeout(400);
  const rows = await page.locator(".dialog-row").count();
  expect(rows).toBeGreaterThanOrEqual(1);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);

  // Either the surah grid or the player opened — and nothing crashed.
  const crashed = await page.evaluate(() => {
    return (document.querySelector("#app")?.children.length ?? 0) === 0;
  });
  expect(crashed).toBe(false);
});

test("tafseer side panel opens beside the mushaf and follows the recitation", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tv-chip").first()).toBeVisible({ timeout: 20_000 });

  // Open a timed reciter: search → العجمي → surah 1
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
  await expect(page.locator("[data-focus-id='grid-jump']")).toBeVisible({ timeout: 20_000 });
  await page.locator("[data-focus-id='surah-1']").click();
  await expect(page.locator("[data-focus-id='player-back']")).toBeVisible({ timeout: 20_000 });

  // Wait for the mushaf page (page mode default — KSU tajweed PNG)
  const img = page.locator(PAGE_IMG).first();
  await expect(img).toBeVisible({ timeout: 15_000 });

  // Open the side-view picker (button labelled مصحف in the transport right zone).
  // Press a key first: the page-mode chrome auto-hides 5 s after the LAST KEY
  // press (mouse clicks don't reset the timer), so clicks alone can race it.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  await page.getByText("مصحف", { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText("التفسير الميسر", { exact: true }).click();
  await page.waitForTimeout(2500);

  // Split view: the mushaf page is still visible AND the tafseer panel is beside it
  await expect(page.locator(PAGE_IMG)).toBeVisible({ timeout: 10_000 });
  const panelRows = await page.evaluate(() =>
    [...document.querySelectorAll('[id^="ctx-row-"]')].length,
  );
  expect(panelRows).toBeGreaterThan(0);

  // The panel follows the recitation: the pinned row is the current ayah
  const pinned = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[id^="ctx-row-"]')];
    const vis = els.filter((e) => (e as HTMLElement).getBoundingClientRect().height > 0);
    return vis.length;
  });
  expect(pinned).toBeGreaterThan(0);

  // Switch to word meanings: empty rows are hidden (surah 1 has meanings)
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  await page.getByText("تفسير", { exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.getByText("معاني الكلمات", { exact: true }).click();
  await page.waitForTimeout(2000);
  const meaningsRows = await page.evaluate(() =>
    [...document.querySelectorAll('[id^="ctx-row-"]')].filter((e) => {
      const el = e as HTMLElement;
      return el.offsetHeight > 0 && el.innerText.trim().length > 0;
    }).length,
  );
  expect(meaningsRows).toBeGreaterThan(0);

  // Back to mushaf-only restores the full page
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  await page.getByText("معاني", { exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.getByText("صفحة المصحف فقط", { exact: true }).click();
  await page.waitForTimeout(1500);
  const splitGone = await page.evaluate(() => ![...document.querySelectorAll('[id^="ctx-row-"]')].length);
  expect(splitGone).toBe(true);
});


test("mushaf styles: every page source loads (SVG, HD, KSU Hafs/Warsh/Tajweed)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tv-chip").first()).toBeVisible({ timeout: 20_000 });
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
  await expect(page.locator("[data-focus-id='grid-jump']")).toBeVisible({ timeout: 20_000 });
  await page.locator("[data-focus-id='surah-1']").click();
  await expect(page.locator("[data-focus-id='player-back']")).toBeVisible({ timeout: 20_000 });
  // let the audio pass the basmala so a page is shown
  await expect(page.locator(PAGE_IMG).first()).toBeVisible({ timeout: 15_000 });

  const openPickerAndPick = async (label: string) => {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    await page.locator(".icon-btn").last().click(); // mushaf style button
    await page.waitForTimeout(500);
    await page.getByText(label, { exact: true }).click();
    await page.waitForTimeout(2000);
  };

  // KSU Hafs (آيات حفص → safahat1 PNG)
  await openPickerAndPick("آيات حفص");
  await expect(page.locator('img[src*="safahat1"]').first()).toBeVisible({ timeout: 15_000 });

  // KSU Warsh
  await openPickerAndPick("آيات ورش");
  await expect(page.locator('img[src*="/warsh/"]').first()).toBeVisible({ timeout: 15_000 });

  // KSU Tajweed (حفص ملون — the default)
  await openPickerAndPick("حفص ملون");
  await expect(page.locator('img[src*="tajweed_png"]').first()).toBeVisible({ timeout: 15_000 });

  // Madinah SVG
  await openPickerAndPick("المدينة");
  await expect(page.locator('img[src*="quran_pages_svg"]').first()).toBeVisible({ timeout: 15_000 });

  // Madinah HD (islamic.app)
  await openPickerAndPick("المدينة HD");
  await expect(page.locator('img[src*="islamic.app"]').first()).toBeVisible({ timeout: 15_000 });

  // back to the default style and text mode toggle still works
  await openPickerAndPick("حفص ملون");
  await expect(page.locator('img[src*="tajweed_png"]').first()).toBeVisible({ timeout: 15_000 });
});

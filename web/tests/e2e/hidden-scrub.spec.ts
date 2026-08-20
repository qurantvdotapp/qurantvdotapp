// Hidden-chrome behavior in mushaf page mode (tvweb / TV webview parity with
// the Kotlin app):
//   1. Auto-hide (5 s idle, page mode, playing) CLEARS app focus — no button
//      is focused while the chrome is invisible, so a stray OK can never
//      activate a hidden control.
//   2. ANY key while hidden reveals the toolbar with PLAY/PAUSE selected
//      (the next OK/Enter toggles playback — TV convention: first press shows
//      the controls, second press acts).
//   3. DPAD_LEFT/RIGHT while hidden scrub ±5 s instead (visible feedback).
// Driven with real keyboard events in Chromium (same DOM keycodes the
// Android/Tizen/Vidaa bridges dispatch).

import { expect, test } from "@playwright/test";

test("page mode: hidden chrome clears focus, any key reveals play selected, LEFT/RIGHT scrub ±5s", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tv-chip").first()).toBeVisible({ timeout: 20_000 });

  // Open a verified-timed reciter (read 5) → surah 1 player.
  await page.locator("#search-input").fill("العجمي");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const chooser = page.locator(".dialog-row").first();
  if (await chooser.isVisible().catch(() => false)) {
    await chooser.click();
    await page.waitForTimeout(1200);
  }
  await page.getByText("الفاتحة", { exact: false }).first().click();
  await page.waitForTimeout(250);

  // Real playback (live mp3quran audio).
  const audio = page.locator('audio[data-qurantv-audio]').first();
  await expect(async () => {
    const t = await audio.evaluate((el: HTMLAudioElement) => (Number.isFinite(el.duration) && el.duration > 1 && !el.paused) ? el.currentTime : -1);
    expect(t).toBeGreaterThan(0);
  }).toPass({ timeout: 25_000 });

  // Chrome auto-hides after ~5 s of no input (page mode + playing).
  await page.waitForTimeout(6500);
  await expect(page.locator('[class*="chrome-hidden"]').first()).toBeVisible({ timeout: 5000 });

  // (1) While hidden, app focus is CLEARED (a stray OK can't hit a hidden button).
  const focusedId = () => page.locator(".focused").first().getAttribute("data-focus-id");
  expect(await page.locator(".focused").count()).toBe(0);

  // (2) Any key reveals the toolbar with PLAY/PAUSE selected.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  await expect(page.locator('[class*="chrome-hidden"]')).toHaveCount(0);
  expect(await focusedId()).toBe("transport-play");

  // Enter (OK) on the selected play button toggles playback: playing → paused.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const paused = await audio.evaluate((el: HTMLAudioElement) => el.paused);
  expect(paused).toBe(true);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const resumed = await audio.evaluate((el: HTMLAudioElement) => el.paused);
  expect(resumed).toBe(false);

  // (3) DPAD_LEFT while hidden: scrubs back ~5 s AND focuses play on reveal.
  await page.waitForTimeout(6500);
  await expect(page.locator('[class*="chrome-hidden"]').first()).toBeVisible({ timeout: 5000 });
  const tBefore = await audio.evaluate((el: HTMLAudioElement) => el.currentTime);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  const tAfter = await audio.evaluate((el: HTMLAudioElement) => el.currentTime);
  expect(tBefore - tAfter).toBeGreaterThanOrEqual(3); // 5 s scrub minus playback
  await expect(page.locator('[class*="chrome-hidden"]')).toHaveCount(0);
  expect(await focusedId()).toBe("transport-play");

  // Re-hide, then (3b) DPAD_RIGHT scrubs forward ~5 s.
  await page.waitForTimeout(6500);
  await expect(page.locator('[class*="chrome-hidden"]').first()).toBeVisible({ timeout: 5000 });
  const rBefore = await audio.evaluate((el: HTMLAudioElement) => el.currentTime);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  const rAfter = await audio.evaluate((el: HTMLAudioElement) => el.currentTime);
  expect(rAfter - rBefore).toBeGreaterThanOrEqual(3);
  await expect(page.locator('[class*="chrome-hidden"]')).toHaveCount(0);

  // (4) After reveal, D-pad navigates normally within the transport.
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(250);
  const leftOfPlay = await focusedId();
  expect(leftOfPlay).not.toBe("transport-play");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  expect(await focusedId()).toBe("transport-play");
});

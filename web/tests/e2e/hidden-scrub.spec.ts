// Hidden-chrome behavior in mushaf page mode (tvweb / TV webview parity with
// the Kotlin app):
//   1. When the chrome auto-hides (5 s idle, page mode, playing), D-pad must
//      NOT move focus among the invisible chrome buttons (ancestor-opacity
//      check in the focus engine) — otherwise the remote "does nothing".
//   2. DPAD_LEFT/RIGHT while hidden scrubs ±5 s instead (visible feedback)
//      and any key reveals the chrome.
// Driven with real keyboard events in Chromium (same DOM keycodes the
// Android/Tizen/Vidaa bridges dispatch).

import { expect, test } from "@playwright/test";

test("page mode: hidden chrome does not trap D-pad focus, LEFT/RIGHT scrub ±5s", async ({ page }) => {
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

  // (1) Focus trap: while hidden, D-pad must not move focus to invisible buttons.
  const focusedId = () => page.locator(".focused").first().getAttribute("data-focus-id");
  const beforeId = await focusedId();
  expect(beforeId).toBeTruthy(); // a real element holds focus
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(400);
  expect(await focusedId()).toBe(beforeId);

  // (2a) DPAD_LEFT while hidden: chrome reveals AND position drops ~5 s.
  // NOTE: any key reveals the chrome, so re-hide before the scrub checks.
  await page.waitForTimeout(6500);
  await expect(page.locator('[class*="chrome-hidden"]').first()).toBeVisible({ timeout: 5000 });
  const tBefore = await audio.evaluate((el: HTMLAudioElement) => el.currentTime);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(400);
  const tAfter = await audio.evaluate((el: HTMLAudioElement) => el.currentTime);
  expect(tBefore - tAfter).toBeGreaterThanOrEqual(3); // 5 s scrub minus playback
  await expect(page.locator('[class*="chrome-hidden"]')).toHaveCount(0);

  // Re-hide, then (2b) DPAD_RIGHT scrubs forward ~5 s.
  await page.waitForTimeout(6500);
  await expect(page.locator('[class*="chrome-hidden"]').first()).toBeVisible({ timeout: 5000 });
  const rBefore = await audio.evaluate((el: HTMLAudioElement) => el.currentTime);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  const rAfter = await audio.evaluate((el: HTMLAudioElement) => el.currentTime);
  expect(rAfter - rBefore).toBeGreaterThanOrEqual(3);
  await expect(page.locator('[class*="chrome-hidden"]')).toHaveCount(0);

  // (3) After reveal, D-pad navigates normally again (down to the transport).
  const revealedId = await focusedId();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  expect(await focusedId()).not.toBe(revealedId);
  expect(await focusedId()).toBe("tb-cl-0-jump");
});

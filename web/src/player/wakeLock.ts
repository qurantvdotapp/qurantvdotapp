// Keep-screen-on during playback (Phase-1 G2) — mirrors the Android
// FLAG_KEEP_SCREEN_ON so the TV doesn't dim/daydream during long listening.
// Feature-detected; no-op fallback on TV webviews that lack Wake Lock.

type WakeLockSentinel = { release: () => Promise<void> };

let sentinel: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<void> {
  try {
    const nav = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } };
    if (!nav.wakeLock) return; // unsupported → no-op
    // Re-request when a stale sentinel exists (the browser may have released it).
    if (!sentinel) sentinel = await nav.wakeLock.request("screen");
  } catch {
    /* ignore — keep screen-on simply won't apply */
  }
}

export function releaseWakeLock(): void {
  try {
    sentinel?.release();
  } catch {
    /* ignore */
  }
  sentinel = null;
}

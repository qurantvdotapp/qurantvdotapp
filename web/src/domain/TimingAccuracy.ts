// Ported 1:1 from app/src/main/java/com/qurantv/app/domain/TimingAccuracy.kt
// Decides whether a read's per-ayah timing is RELIABLE for exact sync.
//
// ASYMMETRIC: mp3quran files commonly end with TRAILING SILENCE (verified 1–6 s
// across reads), so the mp3 may be LONGER than the timing by up to the silence
// allowance and the timing is still exact; but the timing must never
// significantly OVER-CLAIM the mp3 (e.g. read 17 s114: timing 39.1 s vs a
// 31.0 s file — a genuinely wrong timing).

/** The timing may over-claim the mp3 by at most this fraction. */
export const TOLERANCE = 0.02;

/** The mp3 may exceed the timing total by at most this much trailing silence
 *  while the timing stays exact. */
export const SILENCE_ALLOWANCE_MS = 8_000;

/** True when the timing can be used for exact per-ayah sync. */
export function isReliable(mp3DurationMs: number, timingTotalMs: number): boolean {
  if (mp3DurationMs <= 0 || timingTotalMs <= 0) return false;
  if (mp3DurationMs < timingTotalMs) {
    // The mp3 is shorter than the timing claims — the timing over-claims.
    return timingTotalMs - mp3DurationMs <= timingTotalMs * TOLERANCE;
  }
  // The mp3 may be longer by trailing silence (a few seconds on short surahs,
  // up to the relative tolerance on long surahs) — anything beyond that means
  // the timing is truncated or mismatched.
  const allowance = Math.max(SILENCE_ALLOWANCE_MS, Math.trunc(timingTotalMs * TOLERANCE));
  return mp3DurationMs - timingTotalMs <= allowance;
}

package com.qurantv.app.domain

/**
 * Decides whether a read's per-ayah timing is RELIABLE for exact sync.
 *
 * mp3quran's timing is generated from each recitation, and for the vast
 * majority of reads it matches the mp3 exactly (verified: reads 5/13/17/62/273
 * ratio ≈ 1.000 ± 0.002). A few reads are systematically off — compressed
 * (read 135 عبدالرحمن السويّد s2 6039 s vs 6757 s, ratio 1.119; read 259
 * أحمد النفيس 1.095) or stretched (read 137 أحمد طالب بن حميد 7458 s vs
 * 5874 s, ratio 0.788). Because we never ESTIMATE ayah boundaries (an
 * approximate sync is worse than none), such reads are treated as having NO
 * timing: the app plays the audio but shows the surah's first page statically
 * without highlight or page tracking.
 *
 * The check is ASYMMETRIC because mp3quran files commonly end with TRAILING
 * SILENCE (verified 1–6 s across reads; e.g. البنا المصحف المجود s97's file
 * is 84.1 s but the recitation ends at 80.9 s — the timing's 79.1 s total is
 * exact). So the mp3 may be LONGER than the timing by up to the silence
 * allowance and the timing is still exact, but the timing must never
 * significantly OVER-CLAIM the mp3 (e.g. read 17 s114: timing 39.1 s vs a
 * 31.0 s file — a genuinely wrong timing).
 */
object TimingAccuracy {

    /** The timing may over-claim the mp3 by at most this fraction. */
    const val TOLERANCE = 0.02f

    /** The mp3 may exceed the timing total by at most this much trailing
     *  silence while the timing stays exact. */
    const val SILENCE_ALLOWANCE_MS = 8_000L

    /** True when the timing can be used for exact per-ayah sync. */
    fun isReliable(mp3DurationMs: Long, timingTotalMs: Long): Boolean {
        if (mp3DurationMs <= 0 || timingTotalMs <= 0) return false
        if (mp3DurationMs < timingTotalMs) {
            // The mp3 is shorter than the timing claims — the timing over-claims.
            return timingTotalMs - mp3DurationMs <= timingTotalMs * TOLERANCE
        }
        // The mp3 may be longer by trailing silence (a few seconds on short
        // surahs, up to the relative tolerance on long surahs) — but anything
        // beyond that means the timing is truncated or mismatched.
        val allowance = maxOf(SILENCE_ALLOWANCE_MS, (timingTotalMs * TOLERANCE).toLong())
        return mp3DurationMs - timingTotalMs <= allowance
    }
}

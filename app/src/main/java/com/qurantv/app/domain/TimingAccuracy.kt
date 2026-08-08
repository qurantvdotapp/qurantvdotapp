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
 */
object TimingAccuracy {

    /** Tolerance: timing is reliable when the mp3 length matches the timing's
     *  last end within this fraction (trailing silence, small metadata gaps). */
    const val TOLERANCE = 0.02f

    /** True when the timing can be used for exact per-ayah sync. */
    fun isReliable(mp3DurationMs: Long, timingTotalMs: Long): Boolean {
        if (mp3DurationMs <= 0 || timingTotalMs <= 0) return false
        val ratio = mp3DurationMs.toFloat() / timingTotalMs
        return kotlin.math.abs(ratio - 1f) <= TOLERANCE
    }
}

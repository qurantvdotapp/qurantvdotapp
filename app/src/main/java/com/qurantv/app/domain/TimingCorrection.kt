package com.qurantv.app.domain

/**
 * Linear timing→audio speed correction for mp3quran timing data.
 *
 * Most reads' per-ayah timing matches the mp3 exactly (verified: reads 5/13/17
 * ratio ≈ 1.000), but some reads are generated from a FASTER rendition than
 * the actual file — e.g. read 135 (عبدالرحمن السويّد) is ~12% compressed:
 * surah 2 timing total 6039 s vs mp3 6757 s. Without correction the highlight
 * drifts progressively AHEAD of the voice (up to ~200 s by the end of a long
 * surah). Playback positions are divided by the ratio to map them into the
 * timing timeline; reads that match stay at 1f (no change).
 */
object TimingCorrection {

    /**
     * The ratio to divide playback positions by, or 1f when the mp3 and the
     * timing are consistent (or the mismatch is implausible — e.g. a wrong file).
     * Handles BOTH directions: ratio > 1 (timing compressed, highlight drifts
     * ahead — read 135 السويّد ~1.12, read 259 النفيس ~1.10) and ratio < 1
     * (timing stretched, highlight lags — read 137 أحمد طالب بن حميد ~0.79).
     */
    fun ratio(mp3DurationMs: Long, timingTotalMs: Long): Float {
        if (mp3DurationMs <= 0 || timingTotalMs <= 0) return 1f
        val r = mp3DurationMs.toFloat() / timingTotalMs
        return if (r in 0.70f..1.30f && kotlin.math.abs(r - 1f) > 0.03f) r else 1f
    }

    /** Maps a playback position into the timing timeline (no-op when consistent). */
    fun mapped(mp3DurationMs: Long, timingTotalMs: Long, positionMs: Long): Long {
        val r = ratio(mp3DurationMs, timingTotalMs)
        return if (r != 1f) (positionMs / r).toLong() else positionMs
    }
}

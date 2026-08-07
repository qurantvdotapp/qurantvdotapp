package com.qurantv.app.domain

/**
 * Locates the current ayah for a playback position using binary search over the
 * sorted timing entries: the largest index whose `startMs <= position`, clamped
 * to the last ayah. Zero-width / zero-length intervals are skipped.
 */
object TimingIndex {

    /**
     * Locates the current ayah for a playback position using binary search over
     * the sorted timing entries: the largest entry whose `startMs <= position`,
     * clamped to the last entry.
     *
     * Returns the entry's TIMING INDEX (its `ayah` field), NOT its list position
     * — reads without a basmala entry (entries starting at 1) would otherwise
     * shift every highlight one ayah behind. Before the first entry it returns 0
     * (the virtual basmala/header slot).
     */
    fun ayahAt(timing: SurahTiming, positionMs: Long): Int {
        val entries = timing.entries
        if (entries.isEmpty()) return -1
        var lo = 0
        var hi = entries.size - 1
        var result = -1
        while (lo <= hi) {
            val mid = (lo + hi) ushr 1
            if (entries[mid].startMs <= positionMs) {
                result = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        if (result < 0) return 0 // before the first entry: treat as the header/basmala slot
        // Skip intervals that are already past (missing/zero end time), but never
        // advance into an ayah whose start has not been reached yet: during an
        // inter-ayah silence gap the previous ayah stays highlighted until the
        // next one actually begins (otherwise the highlight jumps early).
        while (result < entries.size - 1 &&
            entries[result].endMs <= positionMs &&
            entries[result + 1].startMs <= positionMs
        ) {
            result++
        }
        return entries[result].ayah
    }
}

package com.qurantv.app.domain

/**
 * Maps mp3quran timing ayah indices to Quran verse keys.
 *
 * Verified against live timing data AND the page-SVG marker coordinates
 * (PROMPT.md Parts 3.7/3.8/4, plus a live cross-check of timing `x/y` vs the
 * SVG `ayah:x/ayah:y` markers):
 *  - timing index 0 is always the un-numbered basmala / surah header slot
 *    (no polygon, no page — skipped in page mode);
 *  - timing index i (i >= 1) corresponds to verse key `"surah:i"`;
 *  - surah 1 recites the basmala twice: index 0 = pre-surah basmala intro
 *    (header), index 1 = verse 1:1 (basmala as the first verse);
 *  - surah 9 has no basmala; its index 0 is an empty header slot.
 *
 * Non-Hafs riwayat may count the basmala as verse 1 → the text offset shifts
 * by one; [offset] (per-moshaf, default 0) corrects this and is best-effort
 * for non-Hafs reads.
 */
object BasmalaOffset {

    /**
     * Suggest an offset from entry counts: entries == verses+2 means the basmala
     * occupies a numbered verse in addition to the header slot → offset 1.
     * Anything else keeps the standard layout (offset 0).
     */
    fun suggestOffset(timingEntryCount: Int, versesCount: Int): Int =
        if (timingEntryCount == versesCount + 2) 1 else 0

    /**
     * Verse key for a timing ayah index, or null when the index maps to the
     * un-numbered header (or lies outside the surah).
     */
    fun verseKeyFor(timingAyah: Int, surahId: Int, versesCount: Int, offset: Int): String? {
        if (timingAyah < 1) return null // header slot (basmala), not a numbered verse
        val v = timingAyah - offset
        return if (v in 1..versesCount) "$surahId:$v" else null
    }
}

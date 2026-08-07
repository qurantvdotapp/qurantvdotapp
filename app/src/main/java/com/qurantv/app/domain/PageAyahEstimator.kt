package com.qurantv.app.domain

/**
 * Estimates per-ayah highlight bands on Madinah-mushaf pages that carry no
 * coordinate data (KSU raster pages — Hafs/Warsh/Tajweed PNGs).
 *
 * The Madinah mushaf lays a page's text out proportionally to its length, so
 * each ayah's slice of the page is its text length / the total text length of
 * every ayah on the page. Bands are returned as FRACTIONS of the page height
 * (0..1) so they apply to any display size.
 *
 * Approximate by design (no ground-truth positions exist for these sources):
 * long ayahs get tall bands, short ayahs short ones, and the order matches the
 * page — good enough to follow the recitation.
 */
object PageAyahEstimator {

    /** Top margin of the usable text block, as a fraction of the page height. */
    private const val TOP_MARGIN = 0.03f
    /** Header (surah title + basmala) ≈ two of fifteen lines when a surah starts. */
    private const val HEADER_FRACTION = 2f / 15f
    private const val BOTTOM_MARGIN = 0.03f

    /**
     * @param ayahs ayah numbers on the page, ascending (e.g. 6..16)
     * @param lengths their text lengths, same order
     * @param pageStartsSurah true when the page opens a surah (title + basmala)
     * @return `ayah -> band` in fraction-of-page-height units
     */
    fun estimate(
        ayahs: List<Int>,
        lengths: List<Int>,
        pageStartsSurah: Boolean,
    ): Map<Int, PageAyahBand> {
        if (ayahs.isEmpty()) return emptyMap()
        val total = lengths.sum().coerceAtLeast(1)
        val top = if (pageStartsSurah) TOP_MARGIN + HEADER_FRACTION else TOP_MARGIN
        val usable = 1f - top - BOTTOM_MARGIN
        var cursor = top
        val result = HashMap<Int, PageAyahBand>(ayahs.size)
        ayahs.forEachIndexed { i, ayah ->
            val fraction = lengths.getOrNull(i)?.coerceAtLeast(1)?.toFloat()?.div(total) ?: (1f / ayahs.size)
            val yTop = cursor
            val yBottom = (cursor + fraction * usable).coerceAtMost(1f - BOTTOM_MARGIN)
            result[ayah] = PageAyahBand(yTop, yBottom)
            cursor = yBottom
        }
        return result
    }
}

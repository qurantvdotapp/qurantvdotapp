package com.qurantv.app.domain

/**
 * Builds exact per-ayah highlight bands from quran.ksu.edu.sa's `hilites` data.
 *
 * Verified live: `interface.php?ui=pc&do=hilites&mosshaf=<hafs|warsh|tajweed>&t=28&page=<p>`
 * returns `{"<page>": {"<sura>_<aya>": [x, y], ...}}` where `y` is the ayah's
 * start line in the page image's NATIVE pixel space (matched against the
 * rendered page: tajweed page 9's 2:58..2:61 land on lines 3/5/8/15 exactly).
 *
 * An ayah's band spans [y, nextAyah.y) in image pixels; the last ayah extends
 * to the page bottom (its text typically fills toward it). Converted to
 * fractions of the image height so they apply at any display size.
 */
object KsuHiliteBands {

    /**
     * @param rawAyahY ayah number -> start y in image pixels (from the hilites API)
     * @param imageHeight native height of the page image (hafs 672, warsh 1005, tajweed 707)
     * @return ayah -> band in fraction-of-page-height units
     */
    fun build(rawAyahY: Map<Int, Int>, imageHeight: Int): Map<Int, PageAyahBand> {
        if (rawAyahY.isEmpty() || imageHeight <= 0) return emptyMap()
        val ayahs = rawAyahY.keys.sorted()
        val result = HashMap<Int, PageAyahBand>(ayahs.size)
        ayahs.forEachIndexed { i, ayah ->
            val yTop = rawAyahY[ayah]!!.coerceIn(0, imageHeight).toFloat()
            val yBottom = ayahs.getOrNull(i + 1)?.let { rawAyahY[it]!!.toFloat() } ?: imageHeight.toFloat()
            result[ayah] = PageAyahBand(
                yTop = yTop / imageHeight,
                yBottom = (yBottom.coerceIn(yTop + 1f, imageHeight.toFloat())) / imageHeight,
            )
        }
        return result
    }
}

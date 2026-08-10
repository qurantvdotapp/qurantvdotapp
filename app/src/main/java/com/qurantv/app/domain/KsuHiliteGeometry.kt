package com.qurantv.app.domain

/**
 * Exact ayah highlight geometry for the quran.ksu.edu.sa (Ayat) mushafs,
 * reimplementing the site's own `hilitePage()` algorithm from engine.js.
 *
 * The hilites API (`interface.php?do=hilites&mosshaf=<m>&page=<p>`) returns
 * `"<sura>_<aya>" : [x, y]` = the position where that ayah **ENDS**, in the
 * page's DISPLAY space (the height the site renders the page at — empirically
 * verified per mushaf: the y-values are the vertical center of the text line
 * the ayah ends on, and consecutive-line gaps are integer multiples of the
 * display-space line pitch). Hafs and Tajweed are served at their NATIVE pixel
 * size (456×672 / 456×707 — [Meta.displayHeight] equals the image height), but
 * Warsh is scaled to the site's display height of 760 (620×1005 image — 49/49
 * ayah gaps on pages 190–199 fit the 46.2px display pitch vs 4/49 for native).
 *
 * An ayah's highlight runs from where the PREVIOUS ayah ended to where this
 * ayah ends, drawn as up to three rectangles:
 *
 *  1. the tail of the previous ayah's last line (from the left margin to the
 *     previous end x) — i.e. this ayah's first partial line,
 *  2. this ayah's last line (from its end x to the right margin),
 *  3. the full-width block of complete lines in between.
 *
 * Same-line ayahs collapse to a single rect between the two end positions.
 * Verified against the site: tajweed page 9's 2:58 spans lines 1–3 with the
 * partial line ending at x≈231 (data space).
 */
object KsuHiliteGeometry {

    /** Per-mushaf layout constants (engine.js `_hlMeta` + `masahef[].height`). */
    data class Meta(
        val height: Float,
        val mgwidth: Float,
        val twidth: Float,
        val ofwidth: Float,
        val ofheight: Float,
        val faselSura: Float,
        val pageTop: Float,
        val pageSuraTop: Float,
        // pages 1–2 (the ornamental opening spread) use their own text block
        val fpHeight: Float,
        val fpMgwidth: Float,
        val fpTwidth: Float,
        val fpOfwidth: Float,
        val fpOfheight: Float,
        /**
         * Height of the API's coordinate space (the height the site renders
         * this mushaf's pages at). Hafs/Tajweed are served at native size, so
         * this equals the image height; Warsh is display-scaled to 760.
         */
        val displayHeight: Float,
    )

    val HAFS = Meta(
        height = 30f, mgwidth = 40f, twidth = 416f, ofwidth = 10f, ofheight = 15f,
        faselSura = 110f, pageTop = 37f, pageSuraTop = 80f,
        fpHeight = 20f, fpMgwidth = 80f, fpTwidth = 376f, fpOfwidth = 5f, fpOfheight = 10f,
        displayHeight = 672f, // native 456×672
    )
    val WARSH = Meta(
        height = 40f, mgwidth = 25f, twidth = 427f, ofwidth = 17f, ofheight = 20f,
        faselSura = 140f, pageTop = 30f, pageSuraTop = 80f,
        fpHeight = 20f, fpMgwidth = 80f, fpTwidth = 376f, fpOfwidth = 5f, fpOfheight = 10f,
        displayHeight = 760f, // display-scaled from 620×1005
    )
    val TAJWEED = Meta(
        height = 40f, mgwidth = 25f, twidth = 427f, ofwidth = 17f, ofheight = 20f,
        faselSura = 140f, pageTop = 30f, pageSuraTop = 80f,
        fpHeight = 30f, fpMgwidth = 100f, fpTwidth = 350f, fpOfwidth = 10f, fpOfheight = 15f,
        displayHeight = 707f, // native 456×707
    )

    /** `prev_top` seed for the ornamental opening pages (engine.js hard-codes 270). */
    private const val FIRST_PAGES_TOP = 270f

    /** One highlight rectangle, in fractions (0..1) of the rendered page. */
    data class Rect(val left: Float, val top: Float, val right: Float, val bottom: Float)

    /** An ayah on the page with its end position from the hilites API. */
    data class AyahEnd(val surah: Int, val ayah: Int, val x: Int, val y: Int)

    /**
     * Builds the highlight rectangles for every ayah on a page.
     *
     * @param ayahs page ayahs in document order (as the API returns them)
     * @param page mushaf page number (1 and 2 use the opening-spread layout)
     * @param meta the mushaf's layout constants
     * @param imageWidth /[imageHeight] native size of the page image — combined
     *        with [Meta.displayHeight] to derive the API's coordinate space
     *        (equal to the image size for Hafs/Tajweed; the site scales Warsh
     *        to its 760px display height, verified by pitch analysis).
     * @return `"surah:ayah" -> rects` in fraction-of-page units
     */
    fun build(
        ayahs: List<AyahEnd>,
        page: Int,
        meta: Meta,
        imageWidth: Int,
        imageHeight: Int,
    ): Map<String, List<Rect>> {
        if (ayahs.isEmpty() || imageWidth <= 0 || imageHeight <= 0) return emptyMap()
        val firstPages = page == 1 || page == 2
        val height = if (firstPages) meta.fpHeight else meta.height
        val mgwidth = if (firstPages) meta.fpMgwidth else meta.mgwidth
        val twidth = if (firstPages) meta.fpTwidth else meta.twidth
        val ofwidth = if (firstPages) meta.fpOfwidth else meta.ofwidth
        val ofheight = if (firstPages) meta.fpOfheight else meta.ofheight

        // Fractions are computed in the API's coordinate space: the page scaled
        // to the site's display height ([Meta.displayHeight]). This equals the
        // image's native height for Hafs/Tajweed (served at native size) and is
        // 760 for Warsh (the site display-scaled the 1005-tall image).
        val spaceH = meta.displayHeight
        val spaceW = imageWidth * spaceH / imageHeight

        val out = LinkedHashMap<String, List<Rect>>(ayahs.size)
        var prevTop = 0f
        var prevLeft = 0f
        ayahs.forEachIndexed { index, e ->
            val top = e.y - ofheight
            val left = e.x - ofwidth
            if (index == 0) {
                prevLeft = twidth
                prevTop = when {
                    firstPages -> FIRST_PAGES_TOP
                    e.ayah == 1 -> meta.pageSuraTop
                    else -> meta.pageTop
                }
            } else if (e.ayah == 1) {
                // A new surah starts on this page: skip its header separator.
                prevTop += meta.faselSura
                prevLeft = twidth
            }
            val diff = top - prevTop
            val rects = when {
                diff > height * 1.6f -> listOf(
                    rect(mgwidth, prevTop, prevLeft, prevTop + height, spaceW, spaceH),
                    rect(left, top, twidth, top + height, spaceW, spaceH),
                    rect(mgwidth, prevTop + height, twidth, prevTop + diff, spaceW, spaceH),
                )
                diff > height * 0.6f -> listOf(
                    rect(mgwidth, prevTop, prevLeft, prevTop + height, spaceW, spaceH),
                    rect(left, top, twidth, top + height, spaceW, spaceH),
                )
                else -> listOf(
                    rect(left, top, prevLeft, top + height, spaceW, spaceH),
                )
            }
            out["${e.surah}:${e.ayah}"] = rects
            prevTop = top
            prevLeft = left
        }
        return out
    }

    private fun rect(
        left: Float,
        top: Float,
        right: Float,
        bottom: Float,
        spaceW: Float,
        spaceH: Float,
    ): Rect = Rect(
        left = (left / spaceW).coerceIn(0f, 1f),
        top = (top / spaceH).coerceIn(0f, 1f),
        right = (right / spaceW).coerceIn(0f, 1f),
        bottom = (bottom / spaceH).coerceIn(0f, 1f),
    )
}

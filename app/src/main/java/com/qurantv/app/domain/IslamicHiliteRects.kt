package com.qurantv.app.domain

/**
 * Computes exact per-ayah highlight rects for islamic.app mushaf pages using
 * the same region logic as the KSU site's hilitePage(): an ayah's highlight
 * spans from where the previous ayah ENDED to where this ayah ends, drawn as
 * up to three rects (its first partial line from the line's left edge to the
 * previous end, its last partial line from its end to the line's right edge,
 * and full-width middle lines). Same-line ayahs collapse to a single rect.
 *
 * The ayah-end marker (۝ + digits) is the LAST tspan content of each ayah, so
 * the highlight ends exactly at the ayah number and never bleeds into the next
 * ayah's text on a shared line.
 *
 * Text width measurement is injected ([measure]) so the algorithm stays pure
 * (unit-testable); the loader supplies Android `Paint.measureText`.
 */
object IslamicHiliteRects {

    data class LineLayout(
        val lineTop: Float,
        val lineBottom: Float,
        val lineLeft: Float,
        val lineRight: Float,
    )

    /** ayah key ("s:a") -> end position (x, baseline) in document order. */
    private data class AyahEnd(val key: String, val x: Float, val y: Float)

    /**
     * @param lines the page's ayah text lines (from [IslamicPageBands.parseLines])
     * @param viewBoxWidth /[viewBoxHeight] the SVG viewBox (fraction space)
     * @param measure text -> width for the line's font (Android Paint.measureText)
     * @return ayah key -> highlight rects in fraction-of-page units
     */
    fun build(
        lines: List<IslamicLine>,
        viewBoxWidth: Float,
        viewBoxHeight: Float,
        measure: (text: String, fontSize: Float) -> Float,
    ): Map<String, List<KsuHiliteGeometry.Rect>> {
        if (lines.isEmpty() || viewBoxWidth <= 0f || viewBoxHeight <= 0f) return emptyMap()

        // 1. Layout every line and record each ayah's end position.
        val ends = LinkedHashMap<String, AyahEnd>()
        val lineLayouts = ArrayList<LineLayout>(lines.size)
        for (line in lines) {
            val widths = line.tspans.map { measure(it.text, line.fontSize).coerceAtLeast(0f) }
            val total = widths.sum()
            val lineRight = line.anchorX + total / 2f
            val lineLeft = line.anchorX - total / 2f
            lineLayouts += LineLayout(
                lineTop = line.baselineY - line.fontSize * 0.95f,
                lineBottom = line.baselineY + line.fontSize * 0.35f,
                lineLeft = lineLeft,
                lineRight = lineRight,
            )
            // tspan j occupies [lineRight - sum_{i<=j} w, lineRight - sum_{i<j} w)
            var consumed = 0f
            for (j in line.tspans.indices) {
                consumed += widths[j]
                val key = line.tspans[j].ayahKey
                if (key != null) {
                    ends[key] = AyahEnd(key, lineRight - consumed, line.baselineY)
                }
            }
        }

        // 2. Build each ayah's region (from where it starts to its own end).
        val ayahKeys = ends.keys.toList()
        // end positions of every tspan by line, to know shared lines.
        val out = LinkedHashMap<String, List<KsuHiliteGeometry.Rect>>(ayahKeys.size)
        for (idx in ayahKeys.indices) {
            val key = ayahKeys[idx]
            val end = ends[key]!!
            val firstLineIndex = firstLineOf(lines, key)
            val lastLineIndex = lineIndexOf(lines, end.y)
            val firstLayout = lineLayouts[firstLineIndex]
            val lastLayout = lineLayouts[lastLineIndex]

            // Where the ayah begins on its first line: right after the previous
            // ayah when they share the line, else at the line's right edge.
            val prevEnd = if (idx == 0) null else ends[ayahKeys[idx - 1]]
            val startX = if (prevEnd != null && lineIndexOf(lines, prevEnd.y) == firstLineIndex) {
                prevEnd.x
            } else {
                firstLayout.lineRight
            }

            val rects = if (firstLineIndex == lastLineIndex) {
                // Single line: one rect between its start and end.
                listOf(
                    rect(startX, end.x, firstLayout.lineTop, firstLayout.lineBottom, viewBoxWidth, viewBoxHeight),
                )
            } else {
                val builder = ArrayList<KsuHiliteGeometry.Rect>()
                // First line: from the line's left edge to where the ayah begins.
                builder += rect(
                    firstLayout.lineLeft,
                    startX,
                    firstLayout.lineTop,
                    firstLayout.lineBottom,
                    viewBoxWidth,
                    viewBoxHeight,
                )
                // Middle lines: full width.
                for (m in firstLineIndex + 1 until lastLineIndex) {
                    val ml = lineLayouts[m]
                    builder += rect(ml.lineLeft, ml.lineRight, ml.lineTop, ml.lineBottom, viewBoxWidth, viewBoxHeight)
                }
                // Last line: from the ayah's end to the line's right edge.
                builder += rect(
                    end.x,
                    lastLayout.lineRight,
                    lastLayout.lineTop,
                    lastLayout.lineBottom,
                    viewBoxWidth,
                    viewBoxHeight,
                )
                builder
            }
            out[key] = rects
        }
        return out
    }

    /** The line holding this ayah's FIRST tspan. */
    private fun firstLineOf(lines: List<IslamicLine>, ayahKey: String): Int {
        for (i in lines.indices) {
            if (lines[i].tspans.any { it.ayahKey == ayahKey }) return i
        }
        return 0
    }

    private fun lineIndexOf(lines: List<IslamicLine>, baselineY: Float): Int {
        var best = 0
        var bestDist = Float.MAX_VALUE
        for (i in lines.indices) {
            val d = kotlin.math.abs(lines[i].baselineY - baselineY)
            if (d < bestDist) {
                bestDist = d
                best = i
            }
        }
        return best
    }

    private fun rect(
        left: Float,
        right: Float,
        top: Float,
        bottom: Float,
        vw: Float,
        vh: Float,
    ): KsuHiliteGeometry.Rect {
        val l = minOf(left, right)
        val r = maxOf(left, right)
        return KsuHiliteGeometry.Rect(
            left = (l / vw).coerceIn(0f, 1f),
            top = (top / vh).coerceIn(0f, 1f),
            right = (r / vw).coerceIn(0f, 1f),
            bottom = (bottom / vh).coerceIn(0f, 1f),
        )
    }
}

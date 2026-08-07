package com.qurantv.app.domain

/**
 * Coordinate mapping between the SVG mushaf page space and screen pixels.
 *
 * The prompt verified `viewBox="0 0 235 235"` for early pages; live checking
 * shows other pages use different view boxes (e.g. page 187 is
 * `viewBox="0 0 345 550"`), so the actual viewBox is always parsed from the
 * SVG and used for scaling.
 */
data class ViewBox(val x: Float, val y: Float, val w: Float, val h: Float) {
    companion object {
        val DEFAULT = ViewBox(0f, 0f, 235f, 235f)
    }
}

object PageMapping {

    private val VIEW_BOX_REGEX = Regex("viewBox\\s*=\\s*[\"']([^\"']+)[\"']", RegexOption.IGNORE_CASE)

    fun parseViewBox(svg: String): ViewBox? {
        val match = VIEW_BOX_REGEX.find(svg) ?: return null
        val parts = match.groupValues[1]
            .trim()
            .split(Regex("[\\s,]+"))
            .mapNotNull { it.toFloatOrNull() }
        if (parts.size != 4) return null
        return ViewBox(parts[0], parts[1], parts[2], parts[3])
    }

    /** Maps a polygon from page space into a screen rect of (screenW x screenH). */
    fun toScreen(polygon: List<PointF>, viewBox: ViewBox, screenW: Float, screenH: Float): List<PointF> {
        if (screenW <= 0f || screenH <= 0f || viewBox.w <= 0f || viewBox.h <= 0f) return emptyList()
        val sx = screenW / viewBox.w
        val sy = screenH / viewBox.h
        return polygon.map { PointF((it.x - viewBox.x) * sx, (it.y - viewBox.y) * sy) }
    }
}

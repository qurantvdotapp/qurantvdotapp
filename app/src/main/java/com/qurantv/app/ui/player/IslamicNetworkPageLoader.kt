package com.qurantv.app.ui.player

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.util.LruCache
import com.caverock.androidsvg.SVG
import com.qurantv.app.domain.IslamicHiliteRects
import com.qurantv.app.domain.IslamicPageBands
import com.qurantv.app.domain.KsuHiliteGeometry
import com.qurantv.app.domain.PageMapping
import com.qurantv.app.domain.ViewBox
import java.io.IOException
import java.io.StringWriter
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.TransformerFactory
import javax.xml.transform.dom.DOMSource
import javax.xml.transform.stream.StreamResult
import okhttp3.OkHttpClient
import okhttp3.Request
import org.w3c.dom.Element

/**
 * Loads Madinah mushaf pages from the islamic.app CDN
 * (verified live: `https://api.islamic.app/v1/mushaf/page/{page}.svg?theme=dark&width=1200`).
 *
 * Same standard Madinah pagination as the mp3quran timing `page` field, so page
 * sync works unchanged.
 *
 * RTL text handling: AndroidSVG lays each `<tspan>` out in LTR order (verified
 * by probe — a multi-tspan line rendered with the first tspan on the left even
 * though the Arabic is RTL, and `direction="rtl"` does not change this). The
 * ayah-end markers (۝ + digits) are embedded at the end of each ayah's last
 * tspan, so an LTR tspan layout puts them on the wrong side. Fix: each `<text>`
 * line's tspans are MERGED into one for rendering — a single drawText call lets
 * Android's bidi lay the whole line out correctly (verified). The ORIGINAL
 * tspan structure is still parsed for the per-ayah highlight geometry
 * (IslamicHiliteRects), whose cumulative-width math matches the RTL layout.
 */
class IslamicNetworkPageLoader(
    private val okHttp: OkHttpClient,
) {

    data class LoadedPage(
        val bitmap: Bitmap,
        val viewBox: ViewBox,
        val rectsByVerse: Map<String, List<KsuHiliteGeometry.Rect>>,
    )

    private val cache = object : LruCache<String, LoadedPage>(MAX_CACHED_PAGES) {}
    private val measurePaint = Paint(Paint.ANTI_ALIAS_FLAG)

    /** Blocking — call from an IO dispatcher. */
    fun load(page: Int): LoadedPage? {
        cache.get("$page")?.let { return it }
        return try {
            val url = "https://api.islamic.app/v1/mushaf/page/$page.svg?theme=dark&width=$RENDER_WIDTH"
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "QuranTv/1.0 (Android TV)")
                .build()
            val svgText = okHttp.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw IOException("HTTP ${response.code} for $url")
                response.body?.string() ?: throw IOException("Empty body for $url")
            }
            val viewBox = PageMapping.parseViewBox(svgText) ?: ViewBox.DEFAULT
            // Per-ayah highlight geometry from the ORIGINAL tspan structure.
            val lines = IslamicPageBands.parseLines(svgText)
            val rects = IslamicHiliteRects.build(
                lines = lines,
                viewBoxWidth = viewBox.w,
                viewBoxHeight = viewBox.h,
                measure = { text, size ->
                    measurePaint.textSize = size
                    measurePaint.measureText(text)
                },
            )
            // Render from a tspan-MERGED copy so RTL lines lay out correctly.
            val renderSvg = mergeTspansForRender(svgText)
            val svg = SVG.getFromString(renderSvg)
            val scale = RENDER_WIDTH / viewBox.w
            val w = (viewBox.w * scale).toInt().coerceIn(240, 1600)
            val h = (viewBox.h * scale).toInt().coerceIn(240, 2200)
            val picture = svg.renderToPicture(w, h)
            // Transparent canvas — the page SVG paints its own (dark) background.
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            Canvas(bitmap).drawPicture(picture)
            val loaded = LoadedPage(bitmap, viewBox, rects)
            android.util.Log.d("QuranTv", "islamic page $page: ${rects.size} ayahs highlighted")
            cache.put("$page", loaded)
            loaded
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Merges each `<text>` element's tspans into a single tspan (their texts
     * concatenated in order) so AndroidSVG draws the whole line with one
     * drawText — Android's bidi then lays the RTL line out correctly.
     */
    private fun mergeTspansForRender(svgText: String): String {
        val factory = DocumentBuilderFactory.newInstance()
        factory.isNamespaceAware = false
        runCatching { factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true) }
        val doc = factory.newDocumentBuilder().parse(svgText.byteInputStream())
        val texts = doc.getElementsByTagName("text")
        for (i in 0 until texts.length) {
            val text = texts.item(i) as? Element ?: continue
            val merged = StringBuilder()
            collectTspanText(text, merged)
            while (text.firstChild != null) text.removeChild(text.firstChild)
            val tspan = doc.createElement("tspan")
            tspan.textContent = merged.toString()
            text.appendChild(tspan)
        }
        val sw = StringWriter()
        TransformerFactory.newInstance().newTransformer()
            .transform(DOMSource(doc), StreamResult(sw))
        return sw.toString()
    }

    private fun collectTspanText(element: Element, out: StringBuilder) {
        val children = element.childNodes
        for (i in 0 until children.length) {
            val node = children.item(i) as? Element ?: continue
            if (node.tagName == "tspan") {
                out.append(node.textContent ?: "")
            } else if (node.tagName == "text" || node.tagName == "tspan") {
                collectTspanText(node, out)
            }
        }
    }

    fun clear() = cache.evictAll()

    companion object {
        private const val MAX_CACHED_PAGES = 6
        private const val RENDER_WIDTH = 1200f
    }
}

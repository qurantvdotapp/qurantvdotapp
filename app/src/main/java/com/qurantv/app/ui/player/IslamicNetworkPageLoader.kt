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
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Loads Madinah mushaf pages from the islamic.app CDN
 * (verified live: `https://api.islamic.app/v1/mushaf/page/{page}.svg?theme=dark&width=1200`).
 *
 * Same standard Madinah pagination as the mp3quran timing `page` field, so page
 * sync works unchanged. The per-ayah highlight uses [IslamicHiliteRects]: the
 * ayah-end markers (۝ + digits) are the last tspan of each ayah, so every ayah's
 * highlight ends exactly at its number (never bleeding into the next ayah) and
 * sits on the correct lines (SVG `y` is the text baseline — glyphs are above it).
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
            val svg = SVG.getFromString(svgText)
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

    fun clear() = cache.evictAll()

    companion object {
        private const val MAX_CACHED_PAGES = 6
        private const val RENDER_WIDTH = 1200f
    }
}

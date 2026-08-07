package com.qurantv.app.ui.player

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.util.LruCache
import com.caverock.androidsvg.SVG
import com.qurantv.app.domain.PageMapping
import com.qurantv.app.domain.ViewBox
import java.io.IOException
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Fetches mp3quran mushaf page SVGs and renders them to bitmaps with AndroidSVG
 * (PROMPT.md Part 5). Each page's real `viewBox` is parsed from the SVG — live
 * checking shows pages vary (235×235 early pages, 345×550 for later ones).
 * LRU cache capped at 6 pages (604 pages exist).
 */
class PageImageLoader(
    private val okHttp: OkHttpClient,
) {

    data class LoadedPage(val bitmap: Bitmap, val viewBox: ViewBox)

    private val cache = object : LruCache<String, LoadedPage>(MAX_CACHED_PAGES) {}

    /** Blocking — call from an IO dispatcher. */
    fun load(url: String): LoadedPage? {
        cache.get(url)?.let { return it }
        return try {
            val svgText = fetch(url)
            val viewBox = PageMapping.parseViewBox(svgText) ?: ViewBox.DEFAULT
            val svg = SVG.getFromString(svgText)
            val scale = TARGET_WIDTH / viewBox.w
            val w = (viewBox.w * scale).toInt().coerceIn(240, 1600)
            val h = (viewBox.h * scale).toInt().coerceIn(240, 2200)
            val picture = svg.renderToPicture(w, h)
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            canvas.drawColor(Color.WHITE)
            canvas.drawPicture(picture)
            val loaded = LoadedPage(bitmap, viewBox)
            cache.put(url, loaded)
            loaded
        } catch (e: Exception) {
            null
        }
    }

    fun clear() = cache.evictAll()

    private fun fetch(url: String): String {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "QuranTv/1.0 (Android TV)")
            .build()
        okHttp.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("HTTP ${response.code} for $url")
            return response.body?.string() ?: throw IOException("Empty body for $url")
        }
    }

    companion object {
        private const val MAX_CACHED_PAGES = 6
        private const val TARGET_WIDTH = 1200f
    }
}

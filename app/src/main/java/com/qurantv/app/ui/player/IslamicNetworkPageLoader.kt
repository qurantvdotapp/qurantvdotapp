package com.qurantv.app.ui.player

import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.LruCache
import com.caverock.androidsvg.SVG
import com.qurantv.app.domain.IslamicPageBands
import com.qurantv.app.domain.PageAyahBand
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
 * sync works unchanged. Unlike mp3quran's pages the layout is the authentic
 * 1:1 mushaf and every ayah's text lines carry `data-ayah` — the per-ayah
 * highlight comes from [IslamicPageBands] instead of mp3quran polygons.
 */
class IslamicNetworkPageLoader(
    private val okHttp: OkHttpClient,
) {

    data class LoadedPage(
        val bitmap: Bitmap,
        val viewBox: ViewBox,
        val bandsByVerse: Map<String, List<PageAyahBand>>,
    )

    private val cache = object : LruCache<String, LoadedPage>(MAX_CACHED_PAGES) {}

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
            val bands = IslamicPageBands.parse(svgText)
            android.util.Log.d("QuranTv", "islamic page $page loaded: ${bands.size} ayahs indexed, viewBox=$viewBox")
            val svg = SVG.getFromString(svgText)
            val scale = RENDER_WIDTH / viewBox.w
            val w = (viewBox.w * scale).toInt().coerceIn(240, 1600)
            val h = (viewBox.h * scale).toInt().coerceIn(240, 2200)
            val picture = svg.renderToPicture(w, h)
            // Transparent canvas — the page SVG paints its own (dark) background.
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            Canvas(bitmap).drawPicture(picture)
            val loaded = LoadedPage(bitmap, viewBox, bands)
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

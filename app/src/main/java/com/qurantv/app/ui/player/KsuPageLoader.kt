package com.qurantv.app.ui.player

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import java.io.IOException
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Loads the KSU (Ayat — King Saud University) mushaf page images:
 *  - Hafs:     `https://quran.ksu.edu.sa/ayat/safahat1/{page}.png` (456×672)
 *  - Warsh:    `https://quran.ksu.edu.sa/warsh/{page}.png` (620×1005)
 *  - Tajweed:  `https://quran.ksu.edu.sa/tajweed_png/{page}.png` (456×707, full-page
 *    tajweed coloring)
 *
 * Hafs pagination == the standard Madinah pages of the timing `page` field
 * (verified); Warsh and Tajweed use their own paginations
 * (KsuWarshPageData / KsuTajweedPageData). Raster PNGs carry no per-ayah
 * coordinates — the player estimates highlight bands from verse text lengths.
 */
class KsuPageLoader(
    private val okHttp: OkHttpClient,
) {

    enum class Kind { HAFS, WARSH, TAJWEED }

    private val cache = object : LruCache<String, Bitmap>(MAX_CACHED_PAGES) {}

    /** Blocking — call from an IO dispatcher. */
    fun load(page: Int, kind: Kind): Bitmap? {
        val key = "${kind.name[0]}$page"
        cache.get(key)?.let { return it }
        return try {
            val url = when (kind) {
                Kind.WARSH -> "https://quran.ksu.edu.sa/warsh/$page.png"
                Kind.TAJWEED -> "https://quran.ksu.edu.sa/tajweed_png/$page.png"
                Kind.HAFS -> "https://quran.ksu.edu.sa/ayat/safahat1/$page.png"
            }
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "QuranTv/1.0 (Android TV)")
                .build()
            val bytes = okHttp.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw IOException("HTTP ${response.code} for $url")
                response.body?.bytes() ?: throw IOException("Empty body for $url")
            }
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
            android.util.Log.d("QuranTv", "ksu page $key loaded: ${bitmap.width}x${bitmap.height}")
            cache.put(key, bitmap)
            bitmap
        } catch (e: Exception) {
            null
        }
    }

    fun clear() = cache.evictAll()

    companion object {
        private const val MAX_CACHED_PAGES = 6
    }
}

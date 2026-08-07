package com.qurantv.app.ui.player

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import java.io.IOException
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Loads the KSU (Ayat — King Saud University) mushaf page images:
 *  - Hafs:  `https://quran.ksu.edu.sa/ayat/safahat1/{page}.png` (456×672)
 *  - Warsh: `https://quran.ksu.edu.sa/warsh/{page}.png` (620×1005)
 *
 * Standard Madinah pagination for Hafs (matches the mp3quran timing `page`
 * field — verified); Warsh uses its own pagination via [com.qurantv.app.domain.KsuWarshPageData].
 * Raster PNGs — no per-ayah coordinates, so the highlight is a bottom text
 * strip in the player (page-level sync only).
 */
class KsuPageLoader(
    private val okHttp: OkHttpClient,
) {

    private val cache = object : LruCache<String, Bitmap>(MAX_CACHED_PAGES) {}

    /** Blocking — call from an IO dispatcher. */
    fun load(page: Int, warsh: Boolean): Bitmap? {
        val key = "${if (warsh) "w" else "h"}$page"
        cache.get(key)?.let { return it }
        return try {
            val url = if (warsh) {
                "https://quran.ksu.edu.sa/warsh/$page.png"
            } else {
                "https://quran.ksu.edu.sa/ayat/safahat1/$page.png"
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

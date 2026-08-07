package com.qurantv.app.ui.player

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import java.io.IOException
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Loads per-ayah color-tajweed images from the islamic.network CDN
 * (verified live: `https://cdn.islamic.network/quran/images/high-resolution/{surah}_{ayah}.png`
 * → 1500px-wide PNG with tajweed color rules). The image *is* the ayah, so no
 * coordinate mapping is needed — the highlight is a frame around it.
 */
class AyahImageLoader(
    private val okHttp: OkHttpClient,
) {

    private val cache = object : LruCache<String, Bitmap>(MAX_CACHED_AYAHS) {}

    /** Blocking — call from an IO dispatcher. */
    fun load(surah: Int, ayah: Int): Bitmap? {
        val key = "${surah}_$ayah"
        cache.get(key)?.let { return it }
        return try {
            val url = "https://cdn.islamic.network/quran/images/high-resolution/$key.png"
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "QuranTv/1.0 (Android TV)")
                .header("Referer", "https://alquran.cloud/")
                .build()
            okHttp.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw IOException("HTTP ${response.code} for $url")
                }
                val bytes = response.body?.bytes() ?: throw IOException("Empty body")
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
                cache.put(key, bitmap)
                bitmap
            }
        } catch (e: Exception) {
            null
        }
    }

    fun clear() = cache.evictAll()

    companion object {
        private const val MAX_CACHED_AYAHS = 24
    }
}

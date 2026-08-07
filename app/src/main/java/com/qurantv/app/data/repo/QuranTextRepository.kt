package com.qurantv.app.data.repo

import android.content.Context
import com.qurantv.app.data.api.QuranComApi
import com.qurantv.app.data.api.VersesResponse
import com.qurantv.app.data.cache.JsonDiskCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

/**
 * Authentic Uthmani Quran text (decision D2):
 *  - primary: bundled Tanzil `quran-uthmani.txt` asset (canonical, offline),
 *    parsed once into an in-memory `verse_key -> text` map (~6k entries);
 *  - fallback: Quran.com API v4 `text_uthmani`, cached per surah on disk.
 */
class QuranTextRepository(
    private val context: Context,
    private val quranApi: QuranComApi,
    private val cache: JsonDiskCache,
    private val json: Json,
) {

    @Volatile
    private var tanzilMap: Map<String, String>? = null

    private suspend fun loadTanzil(): Map<String, String> {
        tanzilMap?.let { return it }
        return withContext(Dispatchers.IO) {
            val map = try {
                context.assets.open("quran/quran-uthmani.txt").bufferedReader(Charsets.UTF_8).useLines { lines ->
                    buildMap {
                        lines.forEach { line ->
                            val parts = line.split('|', limit = 3)
                            if (parts.size == 3) {
                                val key = "${parts[0]}:${parts[1]}"
                                put(key, parts[2])
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                emptyMap()
            }
            tanzilMap = map
            map
        }
    }

    suspend fun verseText(surahId: Int, verseNumber: Int): String? {
        val key = "$surahId:$verseNumber"
        loadTanzil()[key]?.let { return it }
        return cachedVerseFromQuranCom(surahId, verseNumber, key)
    }

    private suspend fun cachedVerseFromQuranCom(surahId: Int, verseNumber: Int, key: String): String? {
        val cacheKey = "ch$surahId"
        return cache.singleFlight(cacheKey) {
            val cached = cache.read(JsonDiskCache.QURAN_TEXT, cacheKey)
            val verses = if (cached != null) {
                json.decodeFromString<VersesResponse>(cached).verses
            } else {
                try {
                    quranApi.versesUthmani(surahId).also { list ->
                        runCatching {
                            cache.write(JsonDiskCache.QURAN_TEXT, cacheKey, json.encodeToString(VersesResponse(list)))
                        }
                    }
                } catch (e: Exception) {
                    emptyList()
                }
            }
            verses.firstOrNull { it.verseKey == key }?.textUthmani
        }
    }
}

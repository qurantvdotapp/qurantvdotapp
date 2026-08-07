package com.qurantv.app.data.repo

import com.qurantv.app.data.cache.JsonDiskCache
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Exact per-ayah page positions from quran.ksu.edu.sa (the Ayat reference app).
 *
 * `GET interface.php?ui=pc&do=hilites&mosshaf=<mushaf>&t=28&page=<page>` →
 * `{"<page>": {"<sura>_<aya>": [x, y], ...}}` where x/y are the ayah's start
 * in the page image's NATIVE pixel space. Immutable → cached forever on disk.
 */
class KsuHilitesRepository(
    private val api: com.qurantv.app.data.api.ApiClient,
    private val cache: JsonDiskCache,
    private val json: Json,
) {

    /** ayah number -> (x, y) in the page image's native pixel space. */
    data class AyahPosition(val x: Int, val y: Int)

    private data class PagePositions(val byAyah: Map<Int, AyahPosition>)

    private class PageCache : LinkedHashMap<String, PagePositions>(MAX_PAGES, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, PagePositions>): Boolean =
            size > MAX_PAGES
    }

    private val memory = PageCache()

    @Volatile
    private var cacheKey: String? = null

    /** Fetches (with disk cache) the ayah positions of a page; null on failure. */
    suspend fun positionsFor(mushaf: String, page: Int): Map<Int, AyahPosition>? {
        val key = "${mushaf}_$page"
        memory[key]?.let { return it.byAyah }
        return cache.singleFlight(key) {
            val cached = cache.read(JsonDiskCache.KSU_HILITES, key)
            if (cached != null) {
                parse(cached)?.also { memory[key] = it }?.byAyah
            } else {
                try {
                    val url = "https://quran.ksu.edu.sa/interface.php?ui=pc&do=hilites&mosshaf=$mushaf&t=28&page=$page"
                    val raw = api.getText(url)
                    parse(raw)?.let { parsed ->
                        runCatching { cache.write(JsonDiskCache.KSU_HILITES, key, raw) }
                        memory[key] = parsed
                        parsed.byAyah
                    }
                } catch (e: Exception) {
                    null
                }
            }
        }
    }

    private fun parse(raw: String): PagePositions? {
        val obj = runCatching { json.parseToJsonElement(raw) as? JsonObject }.getOrNull() ?: return null
        val pageObj = obj.values.firstOrNull() as? JsonObject ?: return null
        val byAyah = HashMap<Int, AyahPosition>()
        pageObj.forEach { (key, value) ->
            val parts = key.split('_')
            if (parts.size != 2) return@forEach
            val surah = parts[0].toIntOrNull() ?: return@forEach
            val ayah = parts[1].toIntOrNull() ?: return@forEach
            if (surah !in 1..114) return@forEach
            val arr = value.jsonArray
            if (arr.size < 2) return@forEach
            val x = arr[0].jsonPrimitive.content.toIntOrNull() ?: return@forEach
            val y = arr[1].jsonPrimitive.content.toIntOrNull() ?: return@forEach
            byAyah[ayah] = AyahPosition(x, y)
        }
        if (byAyah.isEmpty()) return null
        return PagePositions(byAyah)
    }

    companion object {
        private const val MAX_PAGES = 12
    }
}

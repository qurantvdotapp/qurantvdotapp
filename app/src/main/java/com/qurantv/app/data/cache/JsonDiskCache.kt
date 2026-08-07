package com.qurantv.app.data.cache

import android.content.Context
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Simple on-disk JSON cache (PROMPT.md Part 8):
 *  - catalog responses: TTL 24h
 *  - timing data: immutable → cached forever, keyed per (read, surah)
 *  - quran text (Quran.com): cached per surah forever
 *
 * Writes are atomic (tmp file + rename). [singleFlight] prevents duplicate
 * network calls for the same key.
 */
class JsonDiskCache(private val context: Context) {

    private val root = File(context.filesDir, "json_cache")
    private val locks = ConcurrentHashMap<String, Mutex>()

    suspend fun read(category: String, key: String, maxAgeMs: Long? = null): String? =
        withContext(Dispatchers.IO) {
            val file = file(category, key)
            if (!file.exists()) return@withContext null
            if (maxAgeMs != null && System.currentTimeMillis() - file.lastModified() > maxAgeMs) {
                return@withContext null
            }
            runCatching { file.readText() }.getOrNull()
        }

    suspend fun write(category: String, key: String, content: String): Unit =
        withContext(Dispatchers.IO) {
            val file = file(category, key)
            file.parentFile?.mkdirs()
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(content)
            if (!tmp.renameTo(file)) {
                // rename can fail on some devices; fall back to direct write
                file.writeText(content)
                tmp.delete()
            }
        }

    fun file(category: String, key: String): File =
        File(File(root, category), safeKey(key))

    private fun safeKey(key: String): String {
        val sanitized = key.replace(Regex("[^A-Za-z0-9._-]"), "_")
        return sanitized.takeLast(120)
    }

    /** Serializes concurrent loads of the same key (single-flight per key). */
    suspend fun <T> singleFlight(flightKey: String, block: suspend () -> T): T {
        val mutex = locks.computeIfAbsent(flightKey) { Mutex() }
        return mutex.withLock { block() }
    }

    companion object {
        const val TTL_24H: Long = 24 * 60 * 60 * 1000L
        const val CATALOG = "catalog"
        const val TIMING = "timing"
        const val QURAN_TEXT = "quran_text"
    }
}
